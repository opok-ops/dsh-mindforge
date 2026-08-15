import { spawn } from 'child_process';
import type {
  SearchResponse,
  StatsResponse,
  ContextResponse,
} from './types.js';

export class MindForgeBridge {
  private cliPath: string;
  private dbPath?: string;
  private keyFile?: string;

  constructor(opts: {
    cliPath: string;
    dbPath?: string;
    keyFile?: string;
  }) {
    this.cliPath = opts.cliPath;
    this.dbPath = opts.dbPath;
    this.keyFile = opts.keyFile;
  }

  private buildArgs(extra: string[]): string[] {
    const args: string[] = [];
    if (this.dbPath) {
      args.push('--db-path', this.dbPath);
    }
    if (this.keyFile) {
      args.push('--key-file', this.keyFile);
    }
    return [...args, ...extra, '--json'];
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
          try {
            resolve(JSON.parse(stdout));
          } catch {
            resolve(stdout.trim());
          }
        } else {
          reject(new Error(`MindForge CLI exit ${code}: ${stderr.trim()}`));
        }
      });

      proc.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn MindForge CLI: ${err.message}`));
      });
    });
  }

  async add(content: string, opts?: {
    category?: string;
    tags?: string[];
    importance?: number;
    layer?: string;
  }): Promise<unknown> {
    const args = ['add', content];
    if (opts?.category) args.push('--category', opts.category);
    if (opts?.tags) args.push('--tags', opts.tags.join(','));
    if (opts?.importance) args.push('--importance', String(opts.importance));
    if (opts?.layer) args.push('--layer', opts.layer);
    return this.execute(args);
  }

  async search(query: string, limit = 10): Promise<SearchResponse> {
    return this.execute([
      'search', query, '--limit', String(limit),
    ]) as Promise<SearchResponse>;
  }

  async context(query: string, maxTokens = 2048): Promise<ContextResponse> {
    return this.execute([
      'memory-context', '--query', query,
      '--max-tokens', String(maxTokens),
    ]) as Promise<ContextResponse>;
  }

  async stats(): Promise<StatsResponse> {
    return this.execute(['stats']) as Promise<StatsResponse>;
  }

  async recall(query: string, limit = 5): Promise<SearchResponse> {
    return this.execute([
      'memory-recall', '--query', query,
      '--limit', String(limit),
    ]) as Promise<SearchResponse>;
  }

  async reflection(category?: string): Promise<unknown> {
    const args = ['memory-reflection'];
    if (category) args.push('--category', category);
    return this.execute(args);
  }

  async reinforce(): Promise<unknown> {
    return this.execute(['memory-reinforce']);
  }

  async lineage(memoryId: string): Promise<unknown> {
    return this.execute(['memory-lineage', '--memory-id', memoryId]);
  }

  async graph(): Promise<unknown> {
    return this.execute(['graph']);
  }

  async rerank(query: string, limit = 10): Promise<SearchResponse> {
    return this.execute([
      'rerank-search', '--query', query,
      '--limit', String(limit),
    ]) as Promise<SearchResponse>;
  }

  async delete(memoryId: string): Promise<unknown> {
    return this.execute(['delete', memoryId]);
  }

  async health(): Promise<unknown> {
    return this.execute(['health']);
  }
}
