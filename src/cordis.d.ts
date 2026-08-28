/**
 * Cordis 模块类型增强（v0.2.0 新增）
 *
 * MindForge 插件通过 `inject: ['tools', 'commands']` 依赖 Cordis 提供的
 * tools（工具注册）和 commands（命令注册）服务，并监听 `agent/pre-step`
 * 事件注入记忆上下文。这些服务/事件由宿主（DeepSeek Harness）在运行时
 * 提供，但 Cordis 核心类型未包含，故在此通过 module augmentation 补齐，
 * 使 `ctx.tools` / `ctx.commands` / `ctx.on('agent/pre-step')` 获得类型安全。
 */

declare module '@deepseek-ai/cordis' {
  /** 工具注册服务（由宿主注入） */
  interface ToolsService {
    register(def: {
      name: string;
      description: string;
      schema: Record<string, unknown>;
      handler: (args: Record<string, unknown>) => Promise<unknown>;
    }): () => void;
  }

  /** 命令注册服务（由宿主注入） */
  interface CommandsService {
    register(
      name: string,
      def: {
        description?: string;
        args?: Array<{
          name: string;
          type: string;
          required?: boolean;
          description?: string;
        }>;
        handler: (args: Record<string, any>) => Promise<{
          content: string;
          ephemeral?: boolean;
        }>;
      },
    ): () => void;
  }

  interface Context {
    tools: ToolsService;
    commands: CommandsService;
  }

  /** agent/pre-step 事件负载（宿主在每次 Agent 推理步骤前触发） */
  interface AgentPreStepEvent {
    message?: { content?: string; role?: string };
    input?: string;
    messages?: Array<{ role?: string; content?: string }>;
    inject?: (msg: {
      role: string;
      content: string;
      ephemeral?: boolean;
    }) => void;
  }

  interface Events {
    'agent/pre-step'(event: AgentPreStepEvent): void;
  }
}

export {};
