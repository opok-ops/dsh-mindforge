import type { Context } from '@deepseek-ai/cordis';
import type { MindForgeBridge } from './bridge.js';
import type { MindForgeConfig, ToolDefinition } from './types.js';

const TOOLS: Record<string, Omit<ToolDefinition, 'handler'>> = {
  memory_add: {
    name: 'memory_add',
    description: 'Store a memory in MindForge\'s 4-layer architecture (sensory/short-term/long-term/permanent). Memories are encrypted with AES-256-GCM.',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The memory content to store' },
        category: { type: 'string', description: 'Category (e.g. fact, preference, event)', default: 'general' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for retrieval' },
        importance: { type: 'integer', minimum: 1, maximum: 10, default: 5, description: 'Importance 1-10 (mapped to LOW/MEDIUM/HIGH/CRITICAL)' },
        layer: { type: 'string', enum: ['sensory', 'short_term', 'long_term', 'permanent'], default: 'long_term' },
      },
      required: ['content'],
    },
  },
  memory_search: {
    name: 'memory_search',
    description: 'Search memories using 6-way fusion: vector recall + FTS5 + TF-IDF + fuzzy + query expansion + cross-encoder reranking. Set explain=true for per-result score breakdown (which recall path won and why).',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        explain: { type: 'boolean', default: false, description: 'Include per-result score breakdown (4-way recall scores, winning path, fusion detail). Zero overhead when false.' },
      },
      required: ['query'],
    },
  },
  memory_context: {
    name: 'memory_context',
    description: 'Retrieve formatted memory context for LLM prompt injection, with token-budget awareness.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Context query' },
        max_tokens: { type: 'integer', minimum: 256, maximum: 8192, default: 2048 },
      },
      required: ['query'],
    },
  },
  memory_stats: {
    name: 'memory_stats',
    description: 'Get memory store statistics: totals, categories, layers, importance distribution, tags.',
    schema: { type: 'object', properties: {} },
  },
  memory_recall: {
    name: 'memory_recall',
    description: 'Smart memory recall — combines search, association reasoning, and layer-aware retrieval.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Recall query' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
      },
      required: ['query'],
    },
  },
  memory_reflection: {
    name: 'memory_reflection',
    description: 'Memory reflection (metacognition): analyze themes, sentiment, key experiences, and drift across memories.',
    schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category' },
      },
    },
  },
  memory_reinforce: {
    name: 'memory_reinforce',
    description: 'Identify high-value decaying memories and suggest reinforcement actions.',
    schema: { type: 'object', properties: {} },
  },
  memory_lineage: {
    name: 'memory_lineage',
    description: 'Trace memory lineage: version history, links, audit events, lifecycle timeline.',
    schema: {
      type: 'object',
      properties: {
        memory_id: { type: 'string', description: 'Memory ID to trace' },
      },
      required: ['memory_id'],
    },
  },
  graph_query: {
    name: 'graph_query',
    description: 'Query the knowledge graph — entities, relationships, and inferred connections across memories.',
    schema: { type: 'object', properties: {} },
  },
  rerank_search: {
    name: 'rerank_search',
    description: 'Hybrid retrieval with synonym/hypernym query expansion + 3-way recall + cross-encoder reranking for maximum precision.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
      required: ['query'],
    },
  },
  // ===== v3.0 新增（对齐 MindForge 6.3.5）=====
  memory_compress: {
    name: 'memory_compress',
    description: 'Compress similar memory clusters: TF-IDF cosine clustering merges near-duplicate memories into one summary memory (sources archived, recoverable via decompress). DRY-RUNS by default — set dry_run=false to actually write.',
    schema: {
      type: 'object',
      properties: {
        threshold: { type: 'number', minimum: 0.5, maximum: 0.99, default: 0.75, description: 'Similarity threshold (higher = stricter clustering)' },
        dry_run: { type: 'boolean', default: true, description: 'Report clusters only, do not write. SAFETY DEFAULT: true. Set false to actually compress.' },
        category: { type: 'string', description: 'Restrict compression to one category' },
        min_cluster_size: { type: 'integer', minimum: 2, maximum: 20, default: 3, description: 'Minimum memories per cluster (below this, no cluster forms)' },
      },
    },
  },
  memory_compress_list: {
    name: 'memory_compress_list',
    description: 'List all compressed memory clusters (with member memory counts and archive status).',
    schema: { type: 'object', properties: {} },
  },
  memory_decompress: {
    name: 'memory_decompress',
    description: 'Restore a compressed cluster: source memories return to independent recall. Find cluster IDs via memory_compress_list.',
    schema: {
      type: 'object',
      properties: {
        cluster_id: { type: 'string', description: 'Cluster ID to decompress' },
      },
      required: ['cluster_id'],
    },
  },
  memory_adaptive_search: {
    name: 'memory_adaptive_search',
    description: 'Adaptive retrieval: session-aware weights tuned by usage frequency, recency, and relevance. Gets better the more the session uses it.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
      required: ['query'],
    },
  },
  memory_link: {
    name: 'memory_link',
    description: 'Association reasoning: given a memory, find related memories (link strength, shared tags, temporal proximity).',
    schema: {
      type: 'object',
      properties: {
        memory_id: { type: 'string', description: 'Target memory ID' },
        top_k: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        days: { type: 'integer', minimum: 1, maximum: 365, default: 90, description: 'Lookback window in days' },
      },
      required: ['memory_id'],
    },
  },
};

export function registerTools(
  ctx: Context,
  bridge: MindForgeBridge,
  config: MindForgeConfig,
): () => void {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    memory_add: (args) => bridge.add(args.content as string, {
      category: args.category as string,
      tags: args.tags as string[],
      importance: args.importance as number,
      layer: args.layer as string,
    }),
    memory_search: (args) => bridge.search(
      args.query as string,
      (args.limit as number) ?? 10,
      (args.explain as boolean) ?? false,
    ),
    memory_context: (args) => bridge.context(
      args.query as string,
      (args.max_tokens as number) ?? config.maxContextTokens,
    ),
    memory_stats: () => bridge.stats(),
    memory_recall: (args) => bridge.recall(
      args.query as string,
      (args.limit as number) ?? 5,
    ),
    memory_reflection: (args) => bridge.reflection(args.category as string),
    memory_reinforce: () => bridge.reinforce(),
    memory_lineage: (args) => bridge.lineage(args.memory_id as string),
    graph_query: () => bridge.graph(),
    rerank_search: (args) => bridge.rerank(
      args.query as string,
      (args.limit as number) ?? 10,
    ),
    // ===== v3.0 新增 =====
    memory_compress: (args) => bridge.compress({
      threshold: args.threshold as number | undefined,
      // 安全默认：调用方未显式传 dry_run=false 时一律按 dry-run 执行。
      // agent 自动调用工具时漏参数不能导致记忆被意外合并。
      dryRun: args.dry_run === undefined ? true : (args.dry_run as boolean),
      category: args.category as string | undefined,
      minClusterSize: args.min_cluster_size as number | undefined,
    }),
    memory_compress_list: () => bridge.compressList(),
    memory_decompress: (args) => bridge.decompress(args.cluster_id as string),
    memory_adaptive_search: (args) => bridge.adaptiveSearch(
      args.query as string,
      'dsh',
      (args.limit as number) ?? 10,
    ),
    memory_link: (args) => bridge.link(
      args.memory_id as string,
      (args.top_k as number) ?? 10,
      (args.days as number) ?? 90,
    ),
  };

  const disposers: Array<() => void> = [];

  for (const toolName of config.tools) {
    const def = TOOLS[toolName];
    if (!def || !handlers[toolName]) continue;

    const disposer = ctx.tools.register({
      name: def.name,
      description: def.description,
      schema: def.schema,
      handler: handlers[toolName],
    });
    disposers.push(disposer);
  }

  return () => disposers.forEach((d) => d());
}
