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
  /** v6.3.0+ search --explain 时携带，其余为 undefined */
  score_breakdown?: ScoreBreakdown | null;
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

/**
 * v6.3.0 起 search --explain 时每条结果携带的得分分解
 * （四路召回原始分、胜出路径 winner、最终分 final、融合明细 fusion）
 */
export interface ScoreBreakdown {
  tfidf?: number;
  fts5?: number;
  fuzzy?: number;
  vector?: number;
  winner?: string;
  final?: number;
  fusion?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * compress 命令返回（v3.0 新增，对齐 MindForge 6.3.5 MemoryCompressor）
 * 结构随 CLI 版本演进，字段全部 optional，未知字段原样透传
 */
export interface CompressResponse {
  dry_run?: boolean;
  clusters_found?: number;
  memories_compressed?: number;
  clusters?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** compress-list 命令返回（列出全部压缩簇） */
export interface CompressListResponse {
  clusters?: Array<Record<string, unknown>>;
  total?: number;
  [key: string]: unknown;
}

/**
 * adaptive-search 命令返回（v3.0 新增，对齐 MindForge 6.3.5 AdaptiveContextEngine）
 * 会话感知自适应检索：按使用频率/时近度/相关性动态调权
 */
export interface AdaptiveSearchResponse {
  query?: string;
  session?: string;
  strategy?: string;
  weights?: Record<string, number>;
  results?: Array<Record<string, unknown>>;
  total?: number;
  [key: string]: unknown;
}

/**
 * memory-link 命令返回（关联推理，人类可读文本，v5.3.6+ CLI 未加 --json 支持）
 * bridge.parseOutput 的 banner 容错会尽力提取 JSON；失败时返回原始文本
 */
export type LinkResponse = Record<string, unknown> | string;
