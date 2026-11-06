import { spawn } from 'node:child_process';
import type {
  SearchResponse,
  StatsResponse,
  ContextResponse,
  RecallRawResponse,
  RerankRawResponse,
  ContextRawResponse,
  CompressResponse,
  CompressListResponse,
  AdaptiveSearchResponse,
  LinkResponse,
} from './types.js';

/**
 * MindForge CLI 桥接层
 *
 * v3.0 (MindForge 6.3.5 适配): 在 v0.2.x 基础上新增六个命令桥接——
 * - compress / compress-list / decompress（记忆压缩全家桶，MindForge 6.3.5）
 * - adaptive-search（会话感知自适应检索，MindForge 6.3.5）
 * - memory-link（关联推理，MindForge v5.3.6+，CLI 无 --json，靠 parseOutput 容错）
 * - search --explain（检索得分分解，MindForge 6.3.0）
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
  private timeoutMs: number;

  constructor(opts: {
    cliPath: string;
    dbPath?: string;
    keyFile?: string;
    agentId?: string;
    timeoutMs?: number;
  }) {
    this.cliPath = opts.cliPath;
    this.dbPath = opts.dbPath;
    this.keyFile = opts.keyFile;
    this.agentId = opts.agentId || 'default';
    this.timeoutMs = opts.timeoutMs ?? 30000;
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
        reject(new Error(`MindForge CLI timeout (${this.timeoutMs}ms)`));
      }, this.timeoutMs);

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

  async search(query: string, limit = 10, explain = false): Promise<SearchResponse> {
    const args = ['search', query, '--limit', String(limit)];
    // v6.3.0+：检索得分分解（四路召回原始分 + 胜出路径 + 融合明细）
    if (explain) args.push('--explain');
    return this.execute(args) as Promise<SearchResponse>;
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
    // CLI 签名: memory-reflection <agent> [--days]
    // （已核实至 MindForge 6.3.5：CLI 仍未暴露 --category，参数保留但忽略）
    const args = ['memory-reflection', this.agentId];
    void category;
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
      // v0.2.1 fix(P2-2): CLI rerank-search 现返回 tags，不再硬编码空数组
      tags: r.tags ?? [],
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

  // ===== v3.0 新增：MindForge 6.3.5 能力桥接 =====

  /**
   * 压缩相似记忆簇（MindForge 6.3.5 MemoryCompressor）。
   * TF-IDF 余弦相似度贪心聚类，把相似记忆合并为一条摘要记忆，源记忆归档。
   * @param opts.threshold    相似度阈值（0-1，CLI 默认 0.75）
   * @param opts.dryRun       只报告将压缩的簇，不写入（强烈建议 agent 先 dry-run）
   * @param opts.category     限定类别
   * @param opts.minClusterSize 最小簇大小（CLI 默认 3，低于该值不成簇）
   */
  async compress(opts?: {
    threshold?: number;
    dryRun?: boolean;
    category?: string;
    minClusterSize?: number;
  }): Promise<CompressResponse> {
    const args = ['compress'];
    if (opts?.threshold !== undefined) {
      args.push('--threshold', String(opts.threshold));
    }
    if (opts?.dryRun) args.push('--dry-run');
    if (opts?.category) args.push('--category', opts.category);
    if (opts?.minClusterSize !== undefined) {
      args.push('--min-cluster-size', String(opts.minClusterSize));
    }
    return this.execute(args) as Promise<CompressResponse>;
  }

  /** 列出全部压缩簇（MindForge 6.3.5） */
  async compressList(): Promise<CompressListResponse> {
    return this.execute(['compress-list']) as Promise<CompressListResponse>;
  }

  /**
   * 解压压缩簇：源记忆恢复独立召回（MindForge 6.3.5）。
   * 注意：decompress 子命令 CLI 无 --json 支持，parseOutput 容错提取。
   */
  async decompress(clusterId: string): Promise<unknown> {
    return this.execute(['decompress', clusterId]);
  }

  /**
   * 自适应检索（MindForge 6.3.5 AdaptiveContextEngine）。
   * 会话感知：按使用频率/时近度/相关性动态调整检索权重，长期用越用越准。
   * @param session 会话 ID（用于会话内权重状态，默认 "cli"）
   */
  async adaptiveSearch(
    query: string,
    session = 'dsh',
    limit = 10,
  ): Promise<AdaptiveSearchResponse> {
    return this.execute([
      'adaptive-search', query,
      '--session', session,
      '--limit', String(limit),
    ]) as Promise<AdaptiveSearchResponse>;
  }

  /**
   * 记忆关联推理（MindForge v5.3.6+）。
   * 给定一条记忆，找出与之关联的其他记忆（关联强度、共同标签、时间邻近等）。
   * CLI 该子命令未接入 --json，输出为人类可读表格；parseOutput 会尽力
   * 提取 JSON（失败时原样返回文本，LinkResponse 联合类型兜底）。
   */
  async link(memoryId: string, topK = 10, days = 90): Promise<LinkResponse> {
    return this.execute([
      'memory-link', this.agentId, memoryId,
      '--top-k', String(topK),
      '--days', String(days),
    ]) as Promise<LinkResponse>;
  }
}
