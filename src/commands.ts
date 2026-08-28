import type { Context } from '@deepseek-ai/cordis';
import type { MindForgeBridge } from './bridge.js';
import type { MindForgeConfig } from './types.js';

export function registerCommands(
  ctx: Context,
  bridge: MindForgeBridge,
  _config: MindForgeConfig,
): () => void {
  const disposers: Array<() => void> = [];

  disposers.push(ctx.commands.register('mindforge', {
    description: 'MindForge lifelong memory — status, recall, remember, search',
    args: [
      { name: 'subcommand', type: 'string', required: false,
        description: 'status | recall <query> | remember <text> | forget <id> | graph | search <query>' },
      { name: 'rest', type: 'string', required: false, description: 'Subcommand arguments' },
    ],
    async handler(args) {
      const sub = (args.subcommand as string) ?? 'status';
      switch (sub) {
        case 'status': {
          const stats = await bridge.stats();
          return {
            content: formatStats(stats),
            ephemeral: false,
          };
        }
        case 'recall': {
          const query = args.rest as string;
          if (!query) return { content: 'Usage: /mindforge recall <query>', ephemeral: true };
          const results = await bridge.recall(query, 5);
          return {
            content: formatSearchResults(results, `Recall: "${query}"`),
            ephemeral: false,
          };
        }
        case 'remember': {
          const text = args.rest as string;
          if (!text) return { content: 'Usage: /mindforge remember <text>', ephemeral: true };
          await bridge.add(text, { layer: 'permanent', importance: 8 });
          return { content: `Remembered: "${text.slice(0, 80)}..."`, ephemeral: true };
        }
        case 'forget': {
          const id = args.rest as string;
          if (!id) return { content: 'Usage: /mindforge forget <memory_id>', ephemeral: true };
          await bridge.delete(id);
          return { content: `Forgotten: ${id}`, ephemeral: true };
        }
        case 'graph': {
          const graph = await bridge.graph();
          return { content: JSON.stringify(graph, null, 2), ephemeral: false };
        }
        case 'search': {
          const query = args.rest as string;
          if (!query) return { content: 'Usage: /mindforge search <query>', ephemeral: true };
          const results = await bridge.search(query, 10);
          return {
            content: formatSearchResults(results, `Search: "${query}"`),
            ephemeral: false,
          };
        }
        default:
          return { content: 'Subcommands: status, recall, remember, forget, graph, search', ephemeral: true };
      }
    },
  }));

  return () => disposers.forEach((d) => d());
}

function formatStats(stats: any): string {
  const lines = [
    '**MindForge Memory Status**',
    `Total memories: **${stats.total ?? 'N/A'}**`,
    '',
    '**Categories:**',
    ...Object.entries(stats.top_categories ?? stats.categories ?? {}).map(([k, v]) => `  ${k}: ${v}`),
    '',
    '**Layers:**',
    ...Object.entries(stats.by_layer ?? stats.layers ?? {}).map(([k, v]) => `  ${k}: ${v}`),
  ];
  return lines.join('\n');
}

function formatSearchResults(results: any, title: string): string {
  if (!results.chunks?.length) return `${title}\n\n_No results found._`;
  const lines = [
    `**${title}**`,
    `_${results.strategy_used ?? 'unknown'} · ${results.query_time_ms ?? 0}ms · ${results.total_found ?? 0} results_`,
    '',
  ];
  for (const chunk of results.chunks) {
    lines.push(`**[${chunk.relevance_score?.toFixed(3) ?? '?'}]** ${chunk.content?.slice(0, 200) ?? ''}`);
    if (chunk.tags?.length) lines.push(`  _tags: ${chunk.tags.join(', ')}_`);
    lines.push('');
  }
  return lines.join('\n');
}
