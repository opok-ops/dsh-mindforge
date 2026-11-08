import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * MindForge 常驻守护进程客户端（对齐 MindForge v6.4.0 `mindforge daemon`）。
 *
 * 背景：CLI 子进程每次调用都重启 Python 解释器（实测 p50 698ms）；
 * daemon 把引擎常驻在长生命周期进程里，行式 JSON over stdio，单请求
 * p50 2.5ms（2026-11-08 双侧实测）。本客户端是宿主侧协议实现。
 *
 * 协议：
 *   请求（stdin 每行）: {"id":n,"cmd":"...","args":{...}}
 *   响应（stdout 每行）: {"id":n,"ok":true,"data":{...}} | {"id":n,"ok":false,"error":"..."}
 *   stderr 自由（启动横幅/日志），stdout 保持纯 JSON 行。
 *
 * 串行化：v1 按请求序排队（Promise chain），与 bridge 的顺序调用模型一致。
 */
export interface DaemonOptions {
  cliPath: string;
  dbPath: string;
  keyFile?: string;
  timeoutMs?: number;
  /** 启动握手超时（等待 ping） */
  startTimeoutMs?: number;
}

interface DaemonMessage {
  id: number;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export class MindForgeDaemon {
  private proc: ChildProcess | null = null;
  private seq = 0;
  private pending = new Map<number, {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
  }>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly opts: Required<Pick<DaemonOptions, 'cliPath' | 'dbPath' | 'timeoutMs'>> &
    DaemonOptions;

  constructor(opts: DaemonOptions) {
    this.opts = {
      ...opts,
      timeoutMs: opts.timeoutMs ?? 30_000,
    };
  }

  /** 启动 daemon 子进程并完成 ping 握手。重复调用幂等。 */
  async start(): Promise<void> {
    if (this.proc) return;
    const args = ['--db-path', this.opts.dbPath];
    if (this.opts.keyFile) args.push('--key-file', this.opts.keyFile);
    args.push('daemon');

    const proc = spawn(this.opts.cliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      env: { ...process.env },
    });
    this.proc = proc;

    const readline = createInterface({ input: proc.stdout! });
    readline.on('line', (line: string) => this.onLine(line));

    proc.on('exit', (code) => {
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`MindForge daemon exited (code ${code})`));
      }
      this.pending.clear();
      if (this.proc === proc) this.proc = null;
    });

    // 握手：ping（带启动超时——首次启动含 Python 冷启动与引擎懒加载）
    const startTimeout = this.opts.startTimeoutMs ?? Math.max(this.opts.timeoutMs, 60_000);
    await this.withTimeout(this.ping(), startTimeout, 'daemon start');
  }

  private onLine(line: string): void {
    let msg: DaemonMessage;
    try {
      msg = JSON.parse(line) as DaemonMessage;
    } catch {
      return; // 非 JSON 行（理论不应出现）：忽略，保持协议纯度
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) {
      p.resolve(msg.data);
    } else {
      p.reject(new Error(`MindForge daemon error: ${msg.error ?? 'unknown'}`));
    }
  }

  private withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms);
      p.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }

  /** ping 存活探测。 */
  async ping(): Promise<unknown> {
    return this.call('ping', {});
  }

  /**
   * 发送一条请求并等待对应响应。经队列串行化。
   * daemon 未启动/已退出时抛错，由上层决定是否 fallback。
   */
  call(cmd: string, args: Record<string, unknown>): Promise<unknown> {
    const task = this.queue.then(() => new Promise<unknown>((resolve, reject) => {
      if (!this.proc || this.proc.killed) {
        reject(new Error('MindForge daemon not running'));
        return;
      }
      const id = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MindForge daemon call timeout: ${cmd} (${this.opts.timeoutMs}ms)`));
      }, this.opts.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const line = `${JSON.stringify({ id, cmd, args })}\n`;
      this.proc.stdin!.write(line, (err) => {
        if (err) {
          this.pending.delete(id);
          clearTimeout(timer);
          reject(new Error(`MindForge daemon write failed: ${err.message}`));
        }
      });
    }));
    // 队列错误不阻塞后续请求
    this.queue = task.catch(() => undefined);
    return task;
  }

  /** 优雅停机：发 shutdown 命令；进程 2s 内未退则 SIGTERM。 */
  async stop(): Promise<void> {
    const proc = this.proc;
    if (!proc) return;
    try {
      await this.withTimeout(this.call('shutdown', {}), 2_000, 'daemon shutdown');
    } catch {
      /* 忽略：走 SIGTERM 兜底 */
    }
    setTimeout(() => { if (!proc.killed) proc.kill('SIGTERM'); }, 2_000).unref();
    this.proc = null;
  }

  get running(): boolean {
    return this.proc !== null && !this.proc.killed;
  }
}
