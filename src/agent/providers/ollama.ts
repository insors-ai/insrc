import { Ollama } from 'ollama';
import { Agent } from 'undici';
import type {
  LLMMessage,
  LLMProvider,
  LLMResponse,
  CompletionOpts,
  ToolDefinition,
  ToolCall,
} from '../../shared/types.js';
import { loadConfig } from '../config.js';
import { getLogger } from '../../shared/logger.js';

const log = getLogger('ollama');

const _defaults = loadConfig();

export class OllamaProvider implements LLMProvider {
  readonly supportsTools = true;
  private readonly client: Ollama;
  private readonly model: string;
  private readonly numCtx: number;
  private readonly embeddingModel: string;

  constructor(
    model = _defaults.models.local,
    host = _defaults.ollama.host,
    numCtx = _defaults.models.context.local,
  ) {
    this.model = model;
    // Override undici's default headers timeout (300s) which is too short for
    // CPU-bound large-context inference that can take 5-10 minutes.
    const agent = new Agent({
      headersTimeout: 600_000,
      bodyTimeout: 600_000,
      connectTimeout: 30_000,
    });
    const longTimeoutFetch: typeof globalThis.fetch = (input, init) =>
      globalThis.fetch(input, { ...init, dispatcher: agent } as RequestInit);
    this.client = new Ollama({ host, fetch: longTimeoutFetch });
    this.numCtx = numCtx;
    this.embeddingModel = _defaults.models.embedding;
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.list();
      return true;
    } catch {
      return false;
    }
  }

  async complete(messages: LLMMessage[], opts: CompletionOpts = {}): Promise<LLMResponse> {
    const ollamaMessages = toOllamaMessages(messages);
    const tools = opts.tools ? toOllamaTools(opts.tools) : undefined;

    log.debug({
      model: this.model,
      numCtx: this.numCtx,
      maxTokens: opts.maxTokens ?? 8_192,
      temperature: opts.temperature,
      messageCount: ollamaMessages.length,
      messages: ollamaMessages.map(m => ({
        role: m.role,
        contentLen: m.content.length,
        contentPreview: m.content.slice(0, 500),
      })),
      toolCount: tools?.length ?? 0,
    }, 'ollama request');

    try {
      // When onToken is provided, stream text token-by-token while
      // still collecting tool calls for the structured response.
      if (opts.onToken) {
        return await this.completeStreaming(ollamaMessages, tools, opts);
      }

      const response = await this.client.chat({
        model: this.model,
        messages: ollamaMessages,
        ...(tools ? { tools } : {}),
        options: {
          num_ctx: this.numCtx,
          num_predict: opts.maxTokens ?? 8_192,
          ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        },
      });

      const toolCalls = parseToolCalls(response.message.tool_calls);
      const text = response.message.content ?? '';

      log.debug({
        model: this.model,
        textLen: text.length,
        textPreview: text.slice(0, 500),
        toolCallCount: toolCalls.length,
      }, 'ollama response');

      return {
        text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
      };
    } catch (err) {
      throw wrapOllamaError(err);
    }
  }

  private async completeStreaming(
    ollamaMessages: OllamaMessage[],
    tools: OllamaTool[] | undefined,
    opts: CompletionOpts,
  ): Promise<LLMResponse> {
    const response = await this.client.chat({
      model: this.model,
      messages: ollamaMessages,
      ...(tools ? { tools } : {}),
      stream: true,
      options: {
        num_ctx: this.numCtx,
        num_predict: opts.maxTokens ?? 8_192,
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      },
    });

    let text = '';
    let allToolCalls: OllamaToolCall[] = [];

    for await (const chunk of response) {
      if (chunk.message.content) {
        text += chunk.message.content;
        opts.onToken!(chunk.message.content);
      }
      if (chunk.message.tool_calls) {
        allToolCalls = allToolCalls.concat(chunk.message.tool_calls as OllamaToolCall[]);
      }
    }

    const toolCalls = parseToolCalls(allToolCalls.length > 0 ? allToolCalls : undefined);

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
    };
  }

  async embed(text: string): Promise<number[]> {
    try {
      const result = await this.client.embed({ model: this.embeddingModel, input: text });
      return result.embeddings[0] ?? [];
    } catch {
      return [];
    }
  }

  async *stream(messages: LLMMessage[], opts: CompletionOpts = {}): AsyncIterable<string> {
    const ollamaMessages = toOllamaMessages(messages);

    try {
      const response = await this.client.chat({
        model: this.model,
        messages: ollamaMessages,
        stream: true,
        options: {
          num_ctx: this.numCtx,
          num_predict: opts.maxTokens ?? 8_192,
          ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        },
      });

      for await (const chunk of response) {
        if (chunk.message.content) {
          yield chunk.message.content;
        }
      }
    } catch (err) {
      throw wrapOllamaError(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function toOllamaMessages(messages: LLMMessage[]): OllamaMessage[] {
  return messages.map(m => ({
    role: m.role,
    content: typeof m.content === 'string'
      ? m.content
      : m.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n'),
  }));
}

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function toOllamaTools(tools: ToolDefinition[]): OllamaTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

let _toolCallId = 0;

function parseToolCalls(raw?: OllamaToolCall[]): ToolCall[] {
  if (!raw || raw.length === 0) return [];
  return raw.map(tc => ({
    id: `tc_${++_toolCallId}`,
    name: tc.function.name,
    input: tc.function.arguments,
  }));
}

function wrapOllamaError(err: unknown): Error {
  if (err instanceof Error) {
    if (err.message.includes('ECONNREFUSED')) {
      return new Error(
        'Ollama is not running. Start it with: ollama serve',
      );
    }
    if (err.message.includes('not found') || err.message.includes('404')) {
      return new Error(
        `Model not found in Ollama. Pull it with: ollama pull <model>`,
      );
    }
  }
  return err instanceof Error ? err : new Error(String(err));
}
