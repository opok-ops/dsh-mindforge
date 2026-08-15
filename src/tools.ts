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
        importance: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
        layer: { type: 'string', enum: ['sensory', 'short_term', 'long_term', 'permanent'], default: 'long_term' },
      },
      required: ['content'],
    },
  },
  memory_search: {
    name: 'memory_search',
    description: 'Search memories using 6-way fusion: vector recall + FTS5 + TF-IDF + fuzzy + query expansion + cross-encoder reranking.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
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
