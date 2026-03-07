import Anthropic from '@anthropic-ai/sdk';
import type { LLMMessage, LLMProvider, CompletionOpts } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Supported Claude backends.
 *
 * 'anthropic' — direct Anthropic API, requires ANTHROPIC_API_KEY.
 * 'bedrock'   — AWS Bedrock, requires @anthropic-ai/bedrock-sdk (future).
 * 'vertex'    — Google Vertex AI, requires @anthropic-ai/vertex-sdk (future).
 */
export type ClaudeBackend = 'anthropic' | 'bedrock' | 'vertex';

export interface ClaudeProviderConfig {
  /**
   * Claude model to use.
   * Defaults to claude-sonnet-4-6 (balanced cost/quality for coding tasks).
   * Switch to claude-opus-4-6 for maximum reasoning on complex design tasks,
   * or claude-haiku-4-5 for lowest cost on simple tasks.
   */
  model?: string;

  /**
   * Backend for Claude API access.
   * Only 'anthropic' is currently implemented.
   * 'bedrock' and 'vertex' require their respective SDK packages.
   */
  backend?: ClaudeBackend;

  // Bedrock options (for future use with @anthropic-ai/bedrock-sdk)
  awsRegion?: string;

  // Vertex options (for future use with @anthropic-ai/vertex-sdk)
  gcpRegion?: string;
  gcpProjectId?: string;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class ClaudeProvider implements LLMProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: ClaudeProviderConfig = {}) {
    this.model = config.model ?? 'claude-sonnet-4-6';

    const backend = config.backend ?? 'anthropic';
    if (backend !== 'anthropic') {
      throw new Error(
        `ClaudeProvider backend '${backend}' is not yet implemented. ` +
        `Install @anthropic-ai/bedrock-sdk or @anthropic-ai/vertex-sdk and wire it in.`,
      );
    }

    // Throws AuthenticationError on first request if ANTHROPIC_API_KEY is not set.
    this.client = new Anthropic();
  }

  // -------------------------------------------------------------------------
  // complete() — non-streaming, returns the full response string
  // -------------------------------------------------------------------------

  async complete(messages: LLMMessage[], opts: CompletionOpts = {}): Promise<string> {
    const { system, apiMessages } = splitMessages(messages);

    try {
      const response = await (this.client as Anthropic).messages.create({
        model:      this.model,
        max_tokens: opts.maxTokens ?? 8_192,
        ...(system ? { system } : {}),
        messages:   apiMessages,
      });

      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text ?? '';

    } catch (err) {
      throw wrapError(err);
    }
  }

  // -------------------------------------------------------------------------
  // stream() — yields text deltas as they arrive
  // -------------------------------------------------------------------------

  async *stream(messages: LLMMessage[], opts: CompletionOpts = {}): AsyncIterable<string> {
    const { system, apiMessages } = splitMessages(messages);

    try {
      const stream = (this.client as Anthropic).messages.stream({
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

/**
 * Split LLMMessage[] into Claude API format.
 * System messages are concatenated and passed as the top-level `system` param.
 * Remaining messages map to user/assistant turns.
 */
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

/**
 * Re-wrap SDK errors with clearer messages.
 * Always throws — use as `throw wrapError(err)`.
 */
function wrapError(err: unknown): never {
  if (err instanceof Anthropic.AuthenticationError) {
    throw new Error(
      'Claude API authentication failed. Set ANTHROPIC_API_KEY or configure a Bedrock/Vertex backend.',
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
