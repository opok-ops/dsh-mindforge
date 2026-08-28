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

describe('Config', () => {
  it('should have default config with 10 tools', () => {
    expect(DEFAULT_CONFIG.tools).toHaveLength(10);
    expect(DEFAULT_CONFIG.injectOnStep).toBe(true);
    expect(DEFAULT_CONFIG.maxContextTokens).toBe(2048);
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
