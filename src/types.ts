export interface MindForgeConfig {
  cliPath: string;
  dbPath?: string;
  keyFile?: string;
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
  categories: Record<string, number>;
  layers: Record<string, number>;
  importance_levels: Record<string, number>;
  tags: Record<string, number>;
}

export interface ContextResponse {
  context: string;
  token_estimate: number;
  memories_used: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}
