import type { Context } from '@deepseek-ai/cordis';
import { MindForgeBridge } from './bridge.js';
import { registerTools } from './tools.js';
import { registerCommands } from './commands.js';
import { registerInjection } from './inject.js';
import { resolveConfig } from './config.js';
import type { MindForgeConfig } from './types.js';

export const name = 'mindforge';
export const inject = ['tools', 'commands'];

export function apply(ctx: Context, userConfig?: Partial<MindForgeConfig>) {
  const config = resolveConfig(userConfig);
  const bridge = new MindForgeBridge({
    cliPath: config.cliPath,
    dbPath: config.dbPath,
    keyFile: config.keyFile,
    agentId: config.agentId,
    timeoutMs: config.timeoutMs,
  });

  ctx.effect(() => registerTools(ctx, bridge, config));
  ctx.effect(() => registerCommands(ctx, bridge, config));

  if (config.injectOnStep) {
    ctx.effect(() => registerInjection(ctx, bridge, config));
  }

  ctx.logger?.info('MindForge plugin loaded — 4-layer encrypted lifelong memory active');
}

export { MindForgeBridge } from './bridge.js';
export type { MindForgeConfig, MemoryEntry, SearchResult, SearchResponse } from './types.js';
export { DEFAULT_CONFIG } from './config.js';
