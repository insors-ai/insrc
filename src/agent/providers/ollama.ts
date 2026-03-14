import { Ollama } from 'ollama';
import { Agent, fetch as undiciFetch } from 'undici';
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
      headersTimeout: 0,   // disable — streaming returns headers with first token
      bodyTimeout: 0,      // disable — streaming body arrives incrementally
      connectTimeout: 30_000,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const longTimeoutFetch = ((input: any, init?: any) =>
      undiciFetch(input, { ...init, dispatcher: agent })) as unknown as typeof globalThis.fetch;
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

    // qwen3-coder: disable thinking mode when tools are provided so the model
    // uses Ollama's structured tool_calls wire format instead of emitting a
    // text-formatted JSON "tool call" inside <think> tags.
    if (tools && tools.length > 0 && ollamaMessages.length > 0 && ollamaMessages[0]!.role === 'system') {
      const sys = ollamaMessages[0]!;
      if (!sys.content.startsWith('/no_think')) {
        sys.content = `/no_think\n${sys.content}`;
      }
    }

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
      // Always use streaming internally to avoid headers-timeout on slow
      // CPU inference. The non-streaming Ollama API waits for the entire
      // response before sending HTTP headers, which can exceed the timeout
      // for large-context calls on CPU-only machines.
      return await this.completeStreaming(ollamaMessages, tools, opts);
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
        opts.onToken?.(chunk.message.content);
      }
      if (chunk.message.tool_calls) {
        allToolCalls = allToolCalls.concat(chunk.message.tool_calls as OllamaToolCall[]);
      }
    }

    const toolCalls = parseToolCalls(allToolCalls.length > 0 ? allToolCalls : undefined);

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
