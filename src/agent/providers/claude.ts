import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMMessage,
  LLMProvider,
  LLMResponse,
  CompletionOpts,
  ToolDefinition,
  ToolCall,
} from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ClaudeProviderConfig {
  model?: string | undefined;
  apiKey?: string | undefined;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class ClaudeProvider implements LLMProvider {
  readonly supportsTools = true;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: ClaudeProviderConfig = {}) {
    this.model = config.model ?? 'claude-sonnet-4-6';
    this.client = new Anthropic({
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    });
  }

  async complete(messages: LLMMessage[], opts: CompletionOpts = {}): Promise<LLMResponse> {
    const { system, apiMessages } = splitMessages(messages);
    const tools = opts.tools ? toAnthropicTools(opts.tools) : undefined;

    try {
      const response = await this.client.messages.create({
        model:      this.model,
        max_tokens: opts.maxTokens ?? 8_192,
        ...(system ? { system } : {}),
        ...(tools && tools.length > 0 ? { tools } : {}),
        messages:   apiMessages,
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      const toolCalls = response.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map((b): ToolCall => ({
          id:    b.id,
          name:  b.name,
          input: b.input as Record<string, unknown>,
        }));

      return {
        text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        stopReason: response.stop_reason === 'tool_use'
          ? 'tool_use'
          : response.stop_reason === 'max_tokens'
            ? 'max_tokens'
            : 'end_turn',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (err) {
      throw wrapError(err);
    }
  }

  async embed(_text: string): Promise<number[]> {
    // Claude API does not provide embeddings — use Ollama for embedding
    return [];
  }

  async *stream(messages: LLMMessage[], opts: CompletionOpts = {}): AsyncIterable<string> {
    const { system, apiMessages } = splitMessages(messages);

    try {
      const stream = this.client.messages.stream({
        model:      this.model,
        max_tokens: opts.maxTokens ?? 8_192,
        ...(system ? { system } : {}),
        messages:   apiMessages,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
      }
    } catch (err) {
      throw wrapError(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitMessages(messages: LLMMessage[]): {
  system: string | undefined;
  apiMessages: Anthropic.MessageParam[];
} {
  const systemParts = messages
    .filter(m => m.role === 'system')
    .map(m => m.content);

  const system = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;

  const apiMessages: Anthropic.MessageParam[] = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    }));

  return { system, apiMessages };
}

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map(t => ({
    name:         t.name,
    description:  t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));
}

function wrapError(err: unknown): never {
  if (err instanceof Anthropic.AuthenticationError) {
    throw new Error(
      'Claude API authentication failed. Set ANTHROPIC_API_KEY.',
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    throw new Error('Claude API rate limit reached. Retry after a moment.');
  }
  if (err instanceof Anthropic.APIError) {
    throw new Error(`Claude API error ${err.status}: ${err.message}`);
  }
  throw err;
}
