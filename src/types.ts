export interface MindForgeConfig {
  cliPath: string;
  dbPath?: string;
  keyFile?: string;
  /** Agent ID（v0.2.0 新增，用于 memory-context/recall/reflection/reinforce 的 positional agent 参数） */
  agentId?: string;
  /** CLI 子进程超时（毫秒，v0.2.1 新增；大库的 memory-context 可能较慢，默认 30000） */
  timeoutMs?: number;
  storageScope: 'global' | 'workspace' | 'custom';
  injectOnStep: boolean;
  maxContextTokens: number;
  tools: string[];
}

export interface MemoryEntry {
  id: string;
  content: string;
  category: string;
  layer: string;
  tags: string[];
  importance: number;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  memory_id: string;
  content: string;
  category: string;
  layer: string;
  relevance_score: number;
  tags: string[];
}

export interface SearchResponse {
  chunks: SearchResult[];
  total_found: number;
  query_time_ms: number;
  strategy_used: string;
  token_estimate: number;
  layers_used: string[];
}

export interface StatsResponse {
  total: number;
  trash_count: number;
  db_size_bytes: number;
  by_privacy: Record<string, number>;
  by_layer: Record<string, number>;
  by_importance: Record<string, number>;
  top_categories: Record<string, number>;
  starred_count: number;
  pinned_count: number;
  top_tags: Record<string, number>;
  db_path: string;
}

export interface ContextResponse {
  context: string;
  token_estimate: number;
  memories_used: number;
}

/**
 * memory-context CLI 原始返回结构（v0.2.0 新增）
 * CLI 返回 included_count/excluded_count，需映射为 ContextResponse.memories_used
 */
export interface ContextRawResponse {
  agent_id?: string;
  query?: string;
  context?: string;
  included_count?: number;
  excluded_count?: number;
  token_estimate?: number;
  max_tokens?: number;
  memories_used?: number;
}

/**
 * memory-recall CLI 原始返回结构（v0.2.0 新增）
 * CLI 返回 recalled 数组，需映射为 SearchResponse.chunks
 */
export interface RecallItem {
  memory_id?: string;
  score?: number;
  coverage?: number;
  matched_keywords?: string[];
  importance?: string;
  access_count?: number;
  starred?: boolean;
  age_days?: number;
  category?: string;
  layer?: string;
  content_preview?: string;
}

export interface RecallRawResponse {
  agent_id?: string;
  query?: string;
  query_keywords?: string[];
  total_scanned?: number;
  total_matched?: number;
  returned?: number;
  recalled?: RecallItem[];
  avg_score?: number;
}

/**
 * rerank-search CLI 原始返回结构（v0.2.0 新增）
 * CLI 返回 reranked 数组，需映射为 SearchResponse.chunks
 */
export interface RerankItem {
  memory_id?: string;
  original_score?: number;
  rerank_score?: number;
  fused_score?: number;
  rank_before?: number;
  rank_after?: number;
  delta_rank?: number;
  content?: string;
  category?: string;
  layer?: string;
  tags?: string[];
}

export interface RerankRawResponse {
  query_original?: string;
  initial_count?: number;
  reranked_count?: number;
  reranked?: RerankItem[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}
