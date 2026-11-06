import type { Context } from '@deepseek-ai/cordis';
import type { MindForgeBridge } from './bridge.js';
import type { MindForgeConfig, StatsResponse } from './types.js';

export function registerCommands(
  ctx: Context,
  bridge: MindForgeBridge,
  _config: MindForgeConfig,
): () => void {
  const disposers: Array<() => void> = [];

  disposers.push(ctx.commands.register('mindforge', {
    description: 'MindForge lifelong memory — status, recall, remember, search, compress, adaptive',
    args: [
      { name: 'subcommand', type: 'string', required: false,
        description: 'status | recall <query> | remember <text> | forget <id> | graph | search <query> | compress | clusters | adaptive <query>' },
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
        // ===== v3.0 新增 =====
        case 'compress': {
          // /mindforge compress          → dry-run 报告（安全默认）
          // /mindforge compress apply    → 真正写入
          const apply = (args.rest as string)?.trim() === 'apply';
          const result = await bridge.compress({ dryRun: !apply });
          const clusters = result.clusters_found ?? 0;
          const summary = apply
            ? `Compressed: **${result.memories_compressed ?? 0}** memories into ${clusters} clusters`
            : `[dry-run] Would compress **${clusters}** clusters — run \`/mindforge compress apply\` to write`;
          return {
            content: `**Memory Compression**\n\n${summary}\n\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 2000)}\n\`\`\``,
            ephemeral: false,
          };
        }
        case 'clusters': {
          const result = await bridge.compressList();
          return {
            content: `**Compressed Clusters** (total: ${result.total ?? 'N/A'})\n\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 2000)}\n\`\`\``,
            ephemeral: false,
          };
        }
        case 'adaptive': {
          const query = args.rest as string;
          if (!query) return { content: 'Usage: /mindforge adaptive <query>', ephemeral: true };
          const result = await bridge.adaptiveSearch(query, 'dsh', 10);
          const results = (result.results ?? []) as Array<Record<string, unknown>>;
          if (!results.length) return { content: `Adaptive: "${query}"\n\n_No results found._`, ephemeral: false };
          const lines = [
            `**Adaptive Search: "${query}"**`,
            `_strategy: ${result.strategy ?? 'adaptive'} · weights: ${JSON.stringify(result.weights ?? {})}_`,
            '',
          ];
          for (const r of results.slice(0, 10)) {
            lines.push(`**[${String(r.score ?? '?')}]** ${String(r.content_preview ?? r.content ?? '').slice(0, 200)}`);
            lines.push('');
          }
          return { content: lines.join('\n'), ephemeral: false };
        }
        default:
          return { content: 'Subcommands: status, recall, remember, forget, graph, search, compress, clusters, adaptive', ephemeral: true };
      }
    },
  }));

  return () => disposers.forEach((d) => d());
}

function formatStats(stats: StatsResponse): string {
  const lines = [
    '**MindForge Memory Status**',
    `Total memories: **${stats.total ?? 'N/A'}**`,
    `Starred: ${stats.starred_count ?? 0} · Pinned: ${stats.pinned_count ?? 0} · Trash: ${stats.trash_count ?? 0}`,
    '',
    '**Categories:**',
    ...Object.entries(stats.top_categories ?? {}).map(([k, v]) => `  ${k}: ${v}`),
    '',
    '**Layers:**',
    ...Object.entries(stats.by_layer ?? {}).map(([k, v]) => `  ${k}: ${v}`),
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
