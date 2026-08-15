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
});

describe('Config', () => {
  it('should have default config with 10 tools', () => {
    expect(DEFAULT_CONFIG.tools).toHaveLength(10);
    expect(DEFAULT_CONFIG.injectOnStep).toBe(true);
    expect(DEFAULT_CONFIG.maxContextTokens).toBe(2048);
  });

  it('should merge user config over defaults', () => {
    const config = resolveConfig({ maxContextTokens: 4096 });
    expect(config.maxContextTokens).toBe(4096);
    expect(config.injectOnStep).toBe(true); // default preserved
  });

  it('should allow custom tool list', () => {
    const config = resolveConfig({ tools: ['memory_add', 'memory_search'] });
    expect(config.tools).toHaveLength(2);
  });
});
