import type { Context } from '@deepseek-ai/cordis';
import type { MindForgeBridge } from './bridge.js';
import type { MindForgeConfig } from './types.js';

export function registerInjection(
  ctx: Context,
  bridge: MindForgeBridge,
  config: MindForgeConfig,
): () => void {
  const disposer = ctx.on('agent/pre-step', async (event: any) => {
    const userMessage = extractUserMessage(event);
    if (!userMessage || userMessage.length < 3) return;

    try {
      const result = await bridge.context(userMessage, config.maxContextTokens);
      if (result.context && result.memories_used > 0) {
        event.inject({
          role: 'system',
          content: `[MindForge Memory Context]\n${result.context}`,
          ephemeral: true,
        });
      }
    } catch {
      // Silent fallback — memory injection is best-effort
    }
  });

  return disposer;
}

function extractUserMessage(event: any): string {
  if (event.message?.content) return event.message.content;
  if (event.input) return event.input;
  if (event.messages?.length) {
    const last = event.messages[event.messages.length - 1];
    if (last.role === 'user') return last.content;
  }
  return '';
}
