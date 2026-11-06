import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MindForgeBridge } from '../src/bridge.js';
import { resolveConfig, DEFAULT_CONFIG } from '../src/config.js';

describe('MindForgeBridge', () => {
  let bridge: MindForgeBridge;

  beforeEach(() => {
    bridge = new MindForgeBridge({
      cliPath: 'MindForge',
      dbPath: '/tmp/test.db',
    });
  });

  it('should construct with correct options', () => {
    expect(bridge).toBeInstanceOf(MindForgeBridge);
  });

  it('should build args with db-path and json flag before subcommand', () => {
    // Access private method via type assertion
    const b = bridge as any;
    const args = b.buildArgs(['add', 'hello']);
    expect(args).toContain('--db-path');
    expect(args).toContain('/tmp/test.db');
    expect(args).toContain('--json');
    expect(args).toContain('add');
    expect(args).toContain('hello');
    // --json must come before the subcommand (argparse global flag)
    const jsonIdx = args.indexOf('--json');
    const subcmdIdx = args.indexOf('add');
    expect(jsonIdx).toBeLessThan(subcmdIdx);
  });

  it('should handle key-file in args', () => {
    const b = new MindForgeBridge({
      cliPath: 'MindForge',
      dbPath: '/tmp/test.db',
      keyFile: '/tmp/key.bin',
    }) as any;
    const args = b.buildArgs(['stats']);
    expect(args).toContain('--key-file');
    expect(args).toContain('/tmp/key.bin');
  });

  it('should default agentId to "default"', () => {
    const b = bridge as any;
    expect(b.agentId).toBe('default');
  });

  it('should accept custom agentId', () => {
    const b = new MindForgeBridge({
      cliPath: 'MindForge',
      agentId: 'my-agent',
    }) as any;
    expect(b.agentId).toBe('my-agent');
  });

  it('should default timeoutMs to 30000', () => {
    const b = bridge as any;
    expect(b.timeoutMs).toBe(30000);
  });

  it('should accept custom timeoutMs', () => {
    const b = new MindForgeBridge({
      cliPath: 'MindForge',
      timeoutMs: 60000,
    }) as any;
    expect(b.timeoutMs).toBe(60000);
  });

  it('should resolve timeoutMs from config', () => {
    const cfg = resolveConfig({ timeoutMs: 45000 });
    expect(cfg.timeoutMs).toBe(45000);
    expect(DEFAULT_CONFIG.timeoutMs).toBe(30000);
  });

  // ---- importance 映射 ----
  it('should map numeric importance 1-10 to CLI enums', () => {
    const b = bridge as any;
    expect(b.mapImportance(1)).toBe('LOW');
    expect(b.mapImportance(3)).toBe('LOW');
    expect(b.mapImportance(4)).toBe('MEDIUM');
    expect(b.mapImportance(6)).toBe('MEDIUM');
    expect(b.mapImportance(7)).toBe('HIGH');
    expect(b.mapImportance(8)).toBe('HIGH');
    expect(b.mapImportance(9)).toBe('CRITICAL');
    expect(b.mapImportance(10)).toBe('CRITICAL');
  });

  it('should pass through string enum importance', () => {
    const b = bridge as any;
    expect(b.mapImportance('HIGH')).toBe('HIGH');
    expect(b.mapImportance('low')).toBe('LOW');
    expect(b.mapImportance('CRITICAL')).toBe('CRITICAL');
  });

  it('should map string numeric importance', () => {
    const b = bridge as any;
    expect(b.mapImportance('8')).toBe('HIGH');
  });

  it('should return undefined for empty/unknown importance', () => {
    const b = bridge as any;
    expect(b.mapImportance(undefined)).toBeUndefined();
    expect(b.mapImportance('')).toBeUndefined();
    expect(b.mapImportance('weird')).toBeUndefined();
  });

  it('should include mapped importance in add args', () => {
    const spy = vi.spyOn(bridge as any, 'execute').mockResolvedValue({});
    bridge.add('hello', { importance: 8 }).then(() => {
      expect(spy).toHaveBeenCalledWith([
        'add', 'hello', '--agent', 'default', '--importance', 'HIGH',
      ]);
      spy.mockRestore();
    });
  });

  it('should include agent in add args for same-agent recall', () => {
    const b = new MindForgeBridge({
      cliPath: 'MindForge', agentId: 'assistant-b',
    });
    const spy = vi.spyOn(b as any, 'execute').mockResolvedValue({});
    b.add('hello').then(() => {
      expect(spy).toHaveBeenCalledWith([
        'add', 'hello', '--agent', 'assistant-b',
      ]);
      spy.mockRestore();
    });
  });

  // ---- 命令签名 ----
  it('should build context args with positional agent and query', () => {
    const spy = vi.spyOn(bridge as any, 'execute').mockResolvedValue({});
    bridge.context('测试', 2048).then(() => {
      expect(spy).toHaveBeenCalledWith([
        'memory-context', 'default', '测试', '--max-tokens', '2048',
      ]);
      spy.mockRestore();
    });
  });

  it('should map memory-context included_count to memories_used', async () => {
    vi.spyOn(bridge as any, 'execute').mockResolvedValue({
      context: 'CTX', included_count: 3, token_estimate: 100,
    });
    const result = await bridge.context('q');
    expect(result.memories_used).toBe(3);
    expect(result.context).toBe('CTX');
  });

  it('should build recall args with --top-k', () => {
    const spy = vi.spyOn(bridge as any, 'execute').mockResolvedValue({ recalled: [] });
    bridge.recall('查询', 5).then(() => {
      expect(spy).toHaveBeenCalledWith([
        'memory-recall', 'default', '查询', '--top-k', '5',
      ]);
      spy.mockRestore();
    });
  });

  it('should map recall recalled[] to chunks[]', async () => {
    vi.spyOn(bridge as any, 'execute').mockResolvedValue({
      total_matched: 1,
      recalled: [{
        memory_id: 'm1', score: 0.9, category: 'work', layer: 'LONG_TERM',
        content_preview: '内容预览',
      }],
    });
    const result = await bridge.recall('q');
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].memory_id).toBe('m1');
    expect(result.chunks[0].relevance_score).toBe(0.9);
    expect(result.total_found).toBe(1);
  });

  it('should build reflection args with agent', () => {
    const spy = vi.spyOn(bridge as any, 'execute').mockResolvedValue({});
    bridge.reflection().then(() => {
      expect(spy).toHaveBeenCalledWith(['memory-reflection', 'default']);
      spy.mockRestore();
    });
  });

  it('should build reinforce args with agent', () => {
    const spy = vi.spyOn(bridge as any, 'execute').mockResolvedValue({});
    bridge.reinforce().then(() => {
      expect(spy).toHaveBeenCalledWith(['memory-reinforce', 'default']);
      spy.mockRestore();
    });
  });

  it('should build lineage args with positional memory id', () => {
    const spy = vi.spyOn(bridge as any, 'execute').mockResolvedValue({});
    bridge.lineage('abc-123').then(() => {
      expect(spy).toHaveBeenCalledWith(['memory-lineage', 'abc-123']);
      spy.mockRestore();
    });
  });

  it('should build graph args with stats action', () => {
    const spy = vi.spyOn(bridge as any, 'execute').mockResolvedValue({});
    bridge.graph().then(() => {
      expect(spy).toHaveBeenCalledWith(['graph', 'stats']);
      spy.mockRestore();
    });
  });

  it('should build rerank args with positional query and --top', () => {
    const spy = vi.spyOn(bridge as any, 'execute').mockResolvedValue({ reranked: [] });
    bridge.rerank('查询', 10).then(() => {
      expect(spy).toHaveBeenCalledWith([
        'rerank-search', '查询', '--top', '10',
      ]);
      spy.mockRestore();
    });
  });

  it('should map rerank reranked[] to chunks[]', async () => {
    vi.spyOn(bridge as any, 'execute').mockResolvedValue({
      reranked_count: 1,
      reranked: [{ memory_id: 'm1', fused_score: 0.5, content: '内容' }],
    });
    const result = await bridge.rerank('q');
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].memory_id).toBe('m1');
    expect(result.chunks[0].relevance_score).toBe(0.5);
  });

  it('should pass through rerank category/layer/tags metadata', async () => {
    vi.spyOn(bridge as any, 'execute').mockResolvedValue({
      reranked_count: 1,
      reranked: [{
        memory_id: 'm1', fused_score: 0.5, content: '内容',
        category: 'probe', layer: 'short_term', tags: ['p2', 'tag2'],
      }],
    });
    const result = await bridge.rerank('q');
    expect(result.chunks[0].category).toBe('probe');
    expect(result.chunks[0].layer).toBe('short_term');
    expect(result.chunks[0].tags).toEqual(['p2', 'tag2']);
  });

  it('should build delete args with --force', () => {
    const spy = vi.spyOn(bridge as any, 'execute').mockResolvedValue({});
    bridge.delete('abc').then(() => {
      expect(spy).toHaveBeenCalledWith(['delete', 'abc', '--force']);
      spy.mockRestore();
    });
  });

  // ---- JSON 健壮解析 ----
  it('should parse clean JSON stdout', () => {
    const b = bridge as any;
    expect(b.parseOutput('{"a": 1}')).toEqual({ a: 1 });
  });

  it('should extract JSON from stdout with banner noise', () => {
    const b = bridge as any;
    const noisy = '\n🔍 混合检索增强\n==================\n 查询: x\n{"query": "x", "total": 1}\n';
    const parsed = b.parseOutput(noisy);
    expect(parsed).toEqual({ query: 'x', total: 1 });
  });

  it('should extract JSON from multi-line banner + JSON', () => {
    const b = bridge as any;
    const noisy = '  Token 估计:  14\n{\n  "context": "abc",\n  "included_count": 0\n}\n';
    const parsed = b.parseOutput(noisy);
    expect(parsed).toEqual({ context: 'abc', included_count: 0 });
  });

  it('should return raw text if no JSON found', () => {
    const b = bridge as any;
    expect(b.parseOutput('just text output')).toBe('just text output');
  });

  it('should return null for empty output', () => {
    const b = bridge as any;
    expect(b.parseOutput('')).toBeNull();
  });
});

describe('v3.0 — MindForge 6.3.5 commands', () => {
  let bridge: MindForgeBridge;
  let execSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    bridge = new MindForgeBridge({ cliPath: 'MindForge', dbPath: '/tmp/test.db' });
    execSpy = vi.fn().mockResolvedValue({});
    (bridge as any).execute = execSpy;
  });

  // ===== compress =====
  it('compress: dry-run by default adds --dry-run flag', async () => {
    await bridge.compress({ dryRun: true });
    const args = execSpy.mock.calls[0][0];
    expect(args[0]).toBe('compress');
    expect(args).toContain('--dry-run');
  });

  it('compress: full options map to CLI flags', async () => {
    await bridge.compress({
      threshold: 0.8,
      dryRun: false,
      category: 'fact',
      minClusterSize: 5,
    });
    const args = execSpy.mock.calls[0][0];
    expect(args).toEqual([
      'compress',
      '--threshold', '0.8',
      '--category', 'fact',
      '--min-cluster-size', '5',
    ]);
    expect(args).not.toContain('--dry-run');
  });

  it('compress: no options = bare compress command', async () => {
    await bridge.compress();
    expect(execSpy.mock.calls[0][0]).toEqual(['compress']);
  });

  // ===== compress-list =====
  it('compressList: calls compress-list with no args', async () => {
    await bridge.compressList();
    expect(execSpy.mock.calls[0][0]).toEqual(['compress-list']);
  });

  // ===== decompress =====
  it('decompress: passes cluster_id as positional', async () => {
    await bridge.decompress('cluster-123');
    expect(execSpy.mock.calls[0][0]).toEqual(['decompress', 'cluster-123']);
  });

  // ===== adaptive-search =====
  it('adaptiveSearch: positional query + --session + --limit', async () => {
    await bridge.adaptiveSearch('best pizza', 'dsh', 5);
    expect(execSpy.mock.calls[0][0]).toEqual([
      'adaptive-search', 'best pizza',
      '--session', 'dsh',
      '--limit', '5',
    ]);
  });

  it('adaptiveSearch: defaults session=dsh limit=10', async () => {
    await bridge.adaptiveSearch('q');
    expect(execSpy.mock.calls[0][0]).toEqual([
      'adaptive-search', 'q',
      '--session', 'dsh',
      '--limit', '10',
    ]);
  });

  // ===== memory-link =====
  it('link: agent + memory_id positionals + --top-k + --days', async () => {
    await bridge.link('mem-42', 20, 30);
    expect(execSpy.mock.calls[0][0]).toEqual([
      'memory-link', 'default', 'mem-42',
      '--top-k', '20',
      '--days', '30',
    ]);
  });

  it('link: custom agentId from bridge options', async () => {
    const b2 = new MindForgeBridge({ cliPath: 'MindForge', dbPath: '/tmp/t.db', agentId: 'helper' });
    const spy2 = vi.fn().mockResolvedValue({});
    (b2 as any).execute = spy2;
    await b2.link('mem-1');
    expect(spy2.mock.calls[0][0]).toEqual([
      'memory-link', 'helper', 'mem-1',
      '--top-k', '10',
      '--days', '90',
    ]);
  });

  // ===== search --explain =====
  it('search: explain=false omits --explain', async () => {
    await bridge.search('query', 10, false);
    expect(execSpy.mock.calls[0][0]).not.toContain('--explain');
    expect(execSpy.mock.calls[0][0]).toEqual(['search', 'query', '--limit', '10']);
  });

  it('search: explain=true appends --explain after limit', async () => {
    await bridge.search('query', 5, true);
    const args = execSpy.mock.calls[0][0];
    expect(args).toEqual(['search', 'query', '--limit', '5', '--explain']);
  });
});

describe('Config', () => {
  it('should have default config with 15 tools (v3.0)', () => {
    expect(DEFAULT_CONFIG.tools).toHaveLength(15);
    expect(DEFAULT_CONFIG.injectOnStep).toBe(true);
    expect(DEFAULT_CONFIG.maxContextTokens).toBe(2048);
  });

  it('should include v3.0 compression/adaptive/link tools by default (v3.0)', () => {
    const t = DEFAULT_CONFIG.tools;
    expect(t).toContain('memory_compress');
    expect(t).toContain('memory_compress_list');
    expect(t).toContain('memory_decompress');
    expect(t).toContain('memory_adaptive_search');
    expect(t).toContain('memory_link');
  });

  it('should have default agentId', () => {
    expect(DEFAULT_CONFIG.agentId).toBe('default');
  });

  it('should merge user config over defaults', () => {
    const config = resolveConfig({ maxContextTokens: 4096 });
    expect(config.maxContextTokens).toBe(4096);
    expect(config.injectOnStep).toBe(true); // default preserved
    expect(config.agentId).toBe('default'); // default preserved
  });

  it('should allow custom agentId', () => {
    const config = resolveConfig({ agentId: 'assistant-b' });
    expect(config.agentId).toBe('assistant-b');
  });

  it('should allow custom tool list', () => {
    const config = resolveConfig({ tools: ['memory_add', 'memory_search'] });
    expect(config.tools).toHaveLength(2);
  });
});
