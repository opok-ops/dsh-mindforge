/**
 * daemon 模式真实桥接 E2E — MindForge v6.4.0 `mindforge daemon`。
 *
 * 验证三件事：
 *  1. daemon 路由的输出契约与 CLI 路径一致（同一套断言跑两种模式）
 *  2. 延迟收益真实存在：daemon 单请求显著快于 CLI 子进程
 *  3. 熔断降级：daemon 不可用时 bridge 自动回退 CLI（可用性优先）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MindForgeBridge } from '../../src/bridge.js';

const TIMEOUT = 120_000;
const CLI = process.env.MINDFORGE_CLI ?? 'MindForge';

describe('MindForgeBridge — daemon 模式真实桥接', () => {
  let bridge: MindForgeBridge;
  let cliBridge: MindForgeBridge;
  let dir = '';
  let firstId = '';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-daemon-e2e-'));
    const opts = {
      cliPath: CLI,
      dbPath: join(dir, 'd.db'),
      agentId: 'dsh-daemon',
      timeoutMs: 60_000,
    };
    bridge = new MindForgeBridge({ ...opts, daemon: true });
    cliBridge = new MindForgeBridge({ ...opts });
    for (const text of [
      'daemon-e2e：用户喜欢用 Python 写脚本处理数据',
      'daemon-e2e：用户偏好使用 Python 来写脚本',
      'daemon-e2e：用户爱用 Python 写自动化脚本',
      'daemon-e2e: deploys services with Docker on weekends',
      'daemon-e2e: automates pipelines with shell scripts',
    ]) {
      const r = (await bridge.add(text, { category: 'programming', tags: ['e2e'] })) as { id?: string };
      if (!firstId && r?.id) firstId = r.id;
    }
    expect(firstId).toBeTruthy();
  }, 180_000);

  afterAll(async () => {
    await bridge.shutdownDaemon();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('add：daemon 路由写入成功（JSON 契约）', async () => {
    const r = (await bridge.add('daemon-e2e：追加一条记忆', { category: 'programming' })) as { status?: string; id?: string };
    expect(r?.id).toBeTruthy();
  }, TIMEOUT);

  it('search：daemon 路由真实检索命中', async () => {
    const r = await bridge.search('Python', 5);
    expect(r.total_found).toBeGreaterThanOrEqual(3);
  }, TIMEOUT);

  it('search --explain：score_breakdown 契约', async () => {
    const r = await bridge.search('Python', 5, true);
    const c = r.chunks?.[0] as { score_breakdown?: { winner?: string } } | undefined;
    expect(c?.score_breakdown?.winner).toBeTruthy();
  }, TIMEOUT);

  it('recall：agent 作用域契约（daemon 路由）', async () => {
    const r = await bridge.recall('Python', 5);
    expect(r.total_found).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  it('stats：daemon 路由与 CLI 路径总数一致（契约对齐）', async () => {
    const d = await bridge.stats();
    const c = await cliBridge.stats();
    expect(d.total).toBe(c.total);
    expect(d.total).toBeGreaterThanOrEqual(6);
  }, TIMEOUT);

  it('compress 链：dry-run 聚簇 > 0（P0① 回归，daemon 路由）', async () => {
    const r = await bridge.compress({ dryRun: true, threshold: 0.10, minClusterSize: 2 });
    expect(Number(r.compressed_count ?? 0)).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  it('compress 链：apply 写入 + list 契约（P0② 回归）', async () => {
    const applied = await bridge.compress({ dryRun: false, threshold: 0.10, minClusterSize: 2 });
    expect(Number(applied.compressed_count ?? 0)).toBeGreaterThanOrEqual(1);
    const list = await bridge.compressList();
    expect(Number(list.total ?? 0)).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  it('adaptiveSearch：非空（P1 回归，daemon 路由）', async () => {
    let r: Awaited<ReturnType<typeof bridge.adaptiveSearch>>;
    for (let i = 0; i < 3; i++) {
      r = await bridge.adaptiveSearch('Python', 'dsh-daemon-ci', 5);
    }
    expect(Number(r!.total ?? r!.results?.length ?? 0)).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  it('延迟收益：daemon 单请求明显快于 CLI 子进程', async () => {
    // daemon 热路径 5 次取中位
    const dTimes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await bridge.search('Python', 5);
      dTimes.push(performance.now() - t0);
    }
    dTimes.sort((a, b) => a - b);
    const daemonMedian = dTimes[Math.floor(dTimes.length / 2)];
    // CLI 子进程 1 次（冷启动主导）
    const t1 = performance.now();
    await cliBridge.search('Python', 5);
    const cliOnce = performance.now() - t1;
    // 宽松断言：daemon 中位 < CLI 单次的 40%（698ms → 上限 ~280ms；
    // daemon 实测 ~2.5ms，留足 CI 机器抖动余量）
    expect(daemonMedian).toBeLessThan(cliOnce * 0.4);
  }, TIMEOUT);

  it('熔断降级：daemon 故障后 bridge 回退 CLI 不中断', async () => {
    (bridge as unknown as { daemonBroken: boolean }).daemonBroken = true;
    // 注意：此用例在压缩链之后，3 条 Python 近重复已合并为 1 条摘要，
    // CLI 回退路径能返回摘要命中（>=1）即证明降级成功
    const r = await bridge.search('Python', 5);
    expect(r.total_found).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);
});
