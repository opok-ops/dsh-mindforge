import { spawn } from 'node:child_process';
import type {
  SearchResponse,
  StatsResponse,
  ContextResponse,
  RecallRawResponse,
  RerankRawResponse,
  ContextRawResponse,
} from './types.js';

/**
 * MindForge CLI 桥接层
 *
 * v0.2.0 (v5.5.6 适配): 重写为与 MindForge CLI v5.5.6 实际签名完全对齐：
 * - importance: 数字 1-10 自动映射为 LOW/MEDIUM/HIGH/CRITICAL 枚举
 * - memory-context / memory-recall / memory-reflection / memory-reinforce
 *   需要 positional agent 参数（默认 "default"）
 * - memory-recall 用 --top-k、rerank-search 用 --top（非 --limit）
 * - memory-lineage 用 positional memory_id（非 --memory-id）
 * - delete 需要 --force（跳过交互确认）
 * - graph 需要 graph_action（默认 stats）
 * - 响应结构适配（included_count→memories_used、recalled/reranked→chunks）
 */
export class MindForgeBridge {
  private cliPath: string;
  private dbPath?: string;
  private keyFile?: string;
  private agentId: string;

  constructor(opts: {
    cliPath: string;
    dbPath?: string;
    keyFile?: string;
    agentId?: string;
  }) {
    this.cliPath = opts.cliPath;
    this.dbPath = opts.dbPath;
    this.keyFile = opts.keyFile;
    this.agentId = opts.agentId || 'default';
  }

  /** 构造全局参数（--db-path / --key-file 必须位于子命令之前） */
  private buildArgs(extra: string[]): string[] {
    const args: string[] = [];
    if (this.dbPath) {
      args.push('--db-path', this.dbPath);
    }
    if (this.keyFile) {
      args.push('--key-file', this.keyFile);
    }
    return [...args, '--json', ...extra];
  }

  /**
   * 从 CLI stdout 提取 JSON 对象。
   *
   * 部分 MindForge CLI 命令（memory-context / memory-recall / rerank-search 等）
   * 在 --json 输出前会先打印 banner/日志到 stdout，因此不能直接 JSON.parse 整个
   * stdout。此处先尝试整体解析，失败则提取第一个 "{" 到最后一个 "}" 之间的子串。
   */
  private parseOutput(stdout: string): unknown {
    const text = stdout.trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      /* fall through */
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return text;
  }

  async execute(args: string[]): Promise<unknown> {
    const fullArgs = this.buildArgs(args);

    return new Promise((resolve, reject) => {
      const proc = spawn(this.cliPath, fullArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error('MindForge CLI timeout (30s)'));
      }, 30000);

      proc.on('close', (code: number) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve(this.parseOutput(stdout));
        } else {
          reject(new Error(`MindForge CLI exit ${code}: ${stderr.trim() || stdout.trim()}`));
        }
      });

      proc.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn MindForge CLI: ${err.message}`));
      });
    });
  }

  /**
   * 将数字重要度（1-10）或字符串枚举映射为 CLI 枚举。
   * 1-3→LOW, 4-6→MEDIUM, 7-8→HIGH, 9-10→CRITICAL
   */
  private mapImportance(importance?: number | string): string | undefined {
    if (importance === undefined || importance === null || importance === '') {
      return undefined;
    }
    if (typeof importance === 'string') {
      const upper = importance.toUpperCase();
      if (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(upper)) {
        return upper;
      }
      const n = Number(importance);
      if (!Number.isNaN(n) && Number.isFinite(n)) {
        return this.mapImportance(n);
      }
      return undefined;
    }
    const n = Math.max(1, Math.min(10, Math.round(importance)));
    if (n <= 3) return 'LOW';
    if (n <= 6) return 'MEDIUM';
    if (n <= 8) return 'HIGH';
    return 'CRITICAL';
  }

  async add(content: string, opts?: {
    category?: string;
    tags?: string[];
    importance?: number | string;
    layer?: string;
  }): Promise<unknown> {
    const args = ['add', content];
    // 使用与 context/recall 相同的 agentId，保证添加的记忆可被召回
    args.push('--agent', this.agentId);
    if (opts?.category) args.push('--category', opts.category);
    if (opts?.tags?.length) args.push('--tags', opts.tags.join(','));
    const imp = this.mapImportance(opts?.importance);
    if (imp) args.push('--importance', imp);
    if (opts?.layer) args.push('--layer', opts.layer);
    return this.execute(args);
  }

  async search(query: string, limit = 10): Promise<SearchResponse> {
    return this.execute([
      'search', query, '--limit', String(limit),
    ]) as Promise<SearchResponse>;
  }

  async context(query: string, maxTokens = 2048): Promise<ContextResponse> {
    const raw = await this.execute([
      'memory-context', this.agentId, query, '--max-tokens', String(maxTokens),
    ]) as ContextRawResponse;
    return {
      context: raw?.context ?? '',
      token_estimate: raw?.token_estimate ?? 0,
      memories_used: raw?.included_count ?? raw?.memories_used ?? 0,
    };
  }

  async stats(): Promise<StatsResponse> {
    return this.execute(['stats']) as Promise<StatsResponse>;
  }

  async recall(query: string, limit = 5): Promise<SearchResponse> {
    const raw = await this.execute([
      'memory-recall', this.agentId, query, '--top-k', String(limit),
    ]) as RecallRawResponse;
    const recalled = raw?.recalled ?? [];
    const chunks = recalled.map((r) => ({
      memory_id: r.memory_id ?? '',
      content: r.content_preview ?? '',
      category: r.category ?? '',
      layer: r.layer ?? '',
      relevance_score: r.score ?? 0,
      tags: [],
    }));
    return {
      chunks,
      total_found: raw?.total_matched ?? chunks.length,
      query_time_ms: 0,
      strategy_used: 'memory-recall',
      token_estimate: 0,
      layers_used: [],
    };
  }

  async reflection(category?: string): Promise<unknown> {
    // CLI 签名: memory-reflection <agent> [--days]（category 参数 CLI 未暴露）
    const args = ['memory-reflection', this.agentId];
    if (category) {
      // 通过 --days 无法表达 category；这里保留参数但忽略 category
      // 若未来 CLI 支持 --category 再透传
    }
    return this.execute(args);
  }

  async reinforce(): Promise<unknown> {
    return this.execute(['memory-reinforce', this.agentId]);
  }

  async lineage(memoryId: string): Promise<unknown> {
    return this.execute(['memory-lineage', memoryId]);
  }

  async graph(): Promise<unknown> {
    return this.execute(['graph', 'stats']);
  }

  async rerank(query: string, limit = 10): Promise<SearchResponse> {
    const raw = await this.execute([
      'rerank-search', query, '--top', String(limit),
    ]) as RerankRawResponse;
    const reranked = raw?.reranked ?? [];
    const chunks = reranked.map((r) => ({
      memory_id: r.memory_id ?? '',
      content: r.content ?? '',
      category: r.category ?? '',
      layer: r.layer ?? '',
      relevance_score: r.fused_score ?? r.original_score ?? 0,
      tags: [],
    }));
    return {
      chunks,
      total_found: raw?.reranked_count ?? chunks.length,
      query_time_ms: 0,
      strategy_used: 'rerank-search',
      token_estimate: 0,
      layers_used: [],
    };
  }

  async delete(memoryId: string): Promise<unknown> {
    // CLI 需要 --force 跳过交互确认
    return this.execute(['delete', memoryId, '--force']);
  }

  async health(): Promise<unknown> {
    return this.execute(['health']);
  }
}
