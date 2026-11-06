import type { MindForgeConfig } from './types.js';

export const DEFAULT_CONFIG: MindForgeConfig = {
  cliPath: 'MindForge',
  dbPath: undefined,
  keyFile: undefined,
  agentId: 'default',
  timeoutMs: 30000,
  storageScope: 'global',
  injectOnStep: true,
  maxContextTokens: 2048,
  tools: [
    'memory_add',
    'memory_search',
    'memory_context',
    'memory_stats',
    'memory_recall',
    'memory_reflection',
    'memory_reinforce',
    'memory_lineage',
    'graph_query',
    'rerank_search',
    // v3.0 新增（对齐 MindForge 6.3.5）
    'memory_compress',
    'memory_compress_list',
    'memory_decompress',
    'memory_adaptive_search',
    'memory_link',
  ],
};

export function resolveConfig(userConfig?: Partial<MindForgeConfig>): MindForgeConfig {
  return { ...DEFAULT_CONFIG, ...userConfig };
}
