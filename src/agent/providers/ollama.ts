import { Ollama } from 'ollama';
import type {
  LLMMessage,
  LLMProvider,
  LLMResponse,
  CompletionOpts,
  ToolDefinition,
  ToolCall,
} from '../../shared/types.js';

export class OllamaProvider implements LLMProvider {
  readonly supportsTools = true;
  private readonly client: Ollama;
  private readonly model: string;

  constructor(model = 'qwen3-coder:latest', host = 'http://localhost:11434') {
    this.model = model;
    this.client = new Ollama({ host });
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
          num_predict: opts.maxTokens ?? 8_192,
          ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        },
      });

      const toolCalls = parseToolCalls(response.message.tool_calls);

      return {
        text: response.message.content ?? '',
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

  async *stream(messages: LLMMessage[], opts: CompletionOpts = {}): AsyncIterable<string> {
    const ollamaMessages = toOllamaMessages(messages);

    try {
      const response = await this.client.chat({
        model: this.model,
        messages: ollamaMessages,
        stream: true,
        options: {
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
  return messages.map(m => ({ role: m.role, content: m.content }));
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
    if (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
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
