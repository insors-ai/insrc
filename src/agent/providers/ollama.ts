import { Ollama } from 'ollama';
import { Agent, fetch as undiciFetch } from 'undici';
import type {
  LLMMessage,
  LLMProvider,
  LLMResponse,
  CompletionOpts,
  ProviderCapabilities,
  StructuredCompletionOpts,
  StructuredSchema,
  ToolDefinition,
  ToolCall,
} from '../../shared/types.js';
import { loadLocalProviderConfig } from '../../config/local.js';
import { getLogger } from '../../shared/logger.js';
import { validateAgainstSchema, withStructuredRetry } from './structured-output.js';

const log = getLogger('ollama');

// Retry budget for transient stream errors -- one extra attempt is
// enough in practice (the underlying cause is usually a momentary
// stream truncation; a fresh chat() call almost always succeeds).
// Exposed for tests via the _retryConstantsForTest export below.
const MAX_TRANSIENT_RETRIES         = 1;
const TRANSIENT_RETRY_BASE_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Some Ollama models (qwen3.6 in particular) occasionally wrap their
// structured-output response in a markdown code fence -- e.g.
//   ```json
//   { "system": "...", ... }
//   ```
// Ollama's schema-constrained decoding usually prevents this, but on
// long / complex schemas the model can still emit a fence, and once
// it does, plain JSON.parse rejects every retry identically. Strip
// leading + trailing fences before parsing. Also handles the (rare)
// language-less variant ```\n...\n```. Leaves fence-free text alone.
function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:[a-zA-Z0-9_+-]+)?\s*\n([\s\S]*?)\n```\s*$/m.exec(trimmed);
  if (fenceMatch !== null && fenceMatch[1] !== undefined) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

// Lazy defaults from the infra-only `config/local.ts` loader. Lazy
// because the provider is sometimes constructed before the daemon's
// config initialization order has settled.
let _localDefaults: ReturnType<typeof loadLocalProviderConfig> | undefined;
function localDefaults(): ReturnType<typeof loadLocalProviderConfig> {
  if (!_localDefaults) {
    _localDefaults = loadLocalProviderConfig();
  }
  return _localDefaults;
}

/**
 * Per-model-family quirks the wrapper has to apply. Most are
 * legacies of qwen-specific control tokens / output limitations; new
 * coder models (devstral, codestral, etc.) generally follow the
 * standard Ollama tool-calling + JSON-format contract without help.
 */
interface ModelQuirks {
  readonly family: 'qwen' | 'mistral' | 'codellama' | 'deepseek' | 'gemma' | 'unknown';
  /**
   * Prepend `/no_think` to the system prompt when tools are present.
   * qwen2.5/qwen3 use this control token to disable thinking mode so
   * tool_calls come back via the structured wire format instead of
   * inside <think> tags. Other families ignore the token; for
   * Mistral-family models it's just dead text in the prompt budget,
   * so we skip it.
   */
  readonly noThinkOnTools: boolean;
  /**
   * Pass `format: 'json'` (or a JSON Schema object) to Ollama in the
   * same call as `tools`. qwen breaks on this combo (returns blank
   * tool_calls); Mistral / Devstral / Codestral handle it cleanly,
   * which lets us constrain the model's text output across the
   * whole tool-calling loop instead of only retrying after a
   * parse failure.
   */
  readonly formatWithTools: boolean;
}

function detectModelFamily(model: string): ModelQuirks['family'] {
  const lower = model.toLowerCase();
  if (lower.startsWith('qwen')) { return 'qwen'; }
  if (lower.startsWith('devstral') || lower.startsWith('mistral') || lower.startsWith('mixtral') || lower.startsWith('codestral')) { return 'mistral'; }
  if (lower.startsWith('codellama') || lower.startsWith('llama')) { return 'codellama'; }
  if (lower.startsWith('deepseek')) { return 'deepseek'; }
  if (lower.startsWith('gemma')) { return 'gemma'; }
  return 'unknown';
}

function modelQuirks(model: string): ModelQuirks {
  const family = detectModelFamily(model);
  switch (family) {
    case 'qwen':      return { family, noThinkOnTools: true,  formatWithTools: false };
    case 'mistral':   return { family, noThinkOnTools: false, formatWithTools: true  };
    case 'codellama': return { family, noThinkOnTools: false, formatWithTools: true  };
    case 'deepseek':  return { family, noThinkOnTools: false, formatWithTools: true  };
    case 'gemma':     return { family, noThinkOnTools: false, formatWithTools: true  };
    case 'unknown':   return { family, noThinkOnTools: false, formatWithTools: true  };
  }
}

/**
 * Decide whether to suppress thinking on this call. Centralised so the
 * `/no_think` prompt-prefix path and the structured `think: false` request
 * field stay in lockstep.
 *
 * Fires when the family quirk applies AND either:
 *   (a) tools are present (tool-loop calls don't benefit from thinking,
 *       and the per-turn latency hit is material), OR
 *   (b) the caller explicitly set `disableThinking: true` (tool-less
 *       structured-JSON callers like memory shaping; qwen3.6 emits
 *       empty bodies otherwise).
 */
function shouldDisableThinking(
  quirks: ModelQuirks,
  hasTools: boolean,
  disableThinkingOpt: boolean | undefined,
): boolean {
  return quirks.noThinkOnTools && (hasTools || disableThinkingOpt === true);
}

// Test-only re-export. Underscore-prefixed per the existing convention
// (see _buildSystemParamForTest in anthropic.ts, _extractUsageForTest, etc.).
export const _shouldDisableThinkingForTest = shouldDisableThinking;
export const _modelQuirksForTest = modelQuirks;

export class OllamaProvider implements LLMProvider {
  readonly supportsTools = true;
  // plans/structured-output.md Phase B.5. Ollama's native structured
  // output is the `format: schema` field on the chat API -- the model
  // is constrained to produce JSON conforming to the schema. Lifted
  // from the existing `_resolveOllamaFormat` helper so callers can go
  // through the uniform LLMProvider.completeStructured surface with
  // the ajv backstop + retry-with-feedback loop.
  readonly capabilities: ProviderCapabilities = {
    structuredOutput: true,
    toolCalling:      true,
    vision:           false,
    webSearch:        false,
    streaming:        true,
    embeddings:       true,
  };
  private readonly client: Ollama;
  private readonly model: string;
  /**
   * Effective Ollama `num_ctx` for this provider. Callers that decide
   * single-call vs chunked-map-reduce layouts (e.g. section-flow's
   * `shapeMemory`) need this to set their threshold correctly --
   * defaulting to the section-flow budget (32k) when the provider is
   * actually 16k causes silent input truncation and broken JSON
   * downstream. Public-readonly + lowercased to match the LLMProvider
   * surface convention.
   */
  readonly numCtx: number;
  private readonly embeddingModel: string;
  private readonly quirks: ModelQuirks;

  constructor(
    model?: string,
    host?: string,
    numCtx?: number,
  ) {
    const d = localDefaults();
    this.model = model ?? d.coreModel;
    host = host ?? d.host;
    // Cleanup: the per-model `params` lookup was on the old AgentConfig
    // schema; the new infra-only loader keeps just a single context
    // window. Callers passing `numCtx` win; otherwise default to 16k.
    this.numCtx = numCtx ?? 16_384;
    this.embeddingModel = d.embeddingModel;
    this.quirks = modelQuirks(this.model);
    log.info({ model: this.model, family: this.quirks.family, noThinkOnTools: this.quirks.noThinkOnTools, formatWithTools: this.quirks.formatWithTools }, 'ollama provider configured');
    // Override undici's default headers timeout (300s) which is too short for
    // CPU-bound large-context inference that can take 5-10 minutes.
    const agent = new Agent({
      headersTimeout: 0,   // disable -- streaming returns headers with first token
      bodyTimeout: 0,      // disable -- streaming body arrives incrementally
      connectTimeout: 30_000,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const longTimeoutFetch = ((input: any, init?: any) =>
      undiciFetch(input, { ...init, dispatcher: agent })) as unknown as typeof globalThis.fetch;
    this.client = new Ollama({ host, fetch: longTimeoutFetch });
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

    // Per-family pre-prompt directives. /no_think is a qwen-specific
    // control token that turns off thinking-mode so tool_calls come
    // back via the structured wire format. Other families ignore it
    // (or, for Mistral-family, would just see literal /no_think as
    // dead text -- skip it).
    //
    // Fires when EITHER:
    //   (a) the family quirk applies AND tools are present (tool-loop
    //       calls don't benefit from thinking), OR
    //   (b) the caller explicitly set `disableThinking: true` (tool-
    //       less structured-JSON callers like memory shaping; the
    //       /no_think prefix is a no-op on qwen3.6+ models -- the
    //       structured `think: false` field below is what those need
    //       -- but prefix is harmless and helps qwen3-coder).
    const wantNoThink = shouldDisableThinking(this.quirks, tools !== undefined && tools.length > 0, opts.disableThinking);
    if (wantNoThink && ollamaMessages.length > 0 && ollamaMessages[0]!.role === 'system') {
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
        content: m.content,
      })),
      toolCount: tools?.length ?? 0,
      tools: tools?.map(t => t.function.name),
    }, 'ollama request');

    // Retry transient stream-truncation errors before propagating.
    // Observed in long analyzer runs: Ollama's HTTP stream occasionally
    // ends without a final `done: true` chunk (or the SDK abandons the
    // async-iterator early), which throws
    // "Did not receive done or success response in stream." A single
    // retry recovers in the vast majority of cases at the cost of one
    // extra call, and is far cheaper than losing a 30+-minute multi-
    // section analyzer run to one truncated stream. Connection-refused
    // and model-not-found errors are NOT retried (they're config
    // failures; retrying is wasted latency and a noisier failure mode).
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_TRANSIENT_RETRIES + 1; attempt++) {
      try {
        // Always use streaming internally to avoid headers-timeout on slow
        // CPU inference. The non-streaming Ollama API waits for the entire
        // response before sending HTTP headers, which can exceed the timeout
        // for large-context calls on CPU-only machines.
        return await this.completeStreaming(ollamaMessages, tools, opts);
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_TRANSIENT_RETRIES && isTransientOllamaError(err)) {
          const delayMs = TRANSIENT_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          log.warn({
            model:    this.model,
            attempt:  attempt + 1,
            delayMs,
            err:      err instanceof Error ? err.message : String(err),
          }, 'ollama: transient stream error -- retrying');
          await sleep(delayMs);
          continue;
        }
        throw wrapOllamaError(err);
      }
    }
    // Unreachable in practice (the loop either returns or throws), but
    // TypeScript can't prove it -- preserve the original wrapped error
    // shape for the caller.
    throw wrapOllamaError(lastErr);
  }

  private async completeStreaming(
    ollamaMessages: OllamaMessage[],
    tools: OllamaTool[] | undefined,
    opts: CompletionOpts,
  ): Promise<LLMResponse> {
    // Resolve `format` from CompletionOpts.responseFormat. Three input
    // forms (see shared/types.ts):
    //   - 'json'               -> Ollama format: 'json' (parseable-JSON)
    //   - { schema: <object> } -> Ollama format: <schema> (shape-bound)
    //   - undefined            -> no format constraint
    //
    // The format/tools combo is gated on a per-family quirk: qwen
    // breaks on it (returns blank tool_calls); Mistral / Devstral /
    // Codestral handle it cleanly. Off-with-tools for qwen preserves
    // the Phase-1 behaviour; on-with-tools for everything else lets
    // the model produce shape-constrained answers across the whole
    // tool-calling loop.
    const ollamaFormat = this._resolveOllamaFormat(opts.responseFormat, tools);
    // qwen3.6 (and other thinking-capable qwen models) treats `think: false`
    // as a structured request to skip the <think>...</think> reasoning block.
    // qwen3-coder already gets the legacy `/no_think` prompt-prefix path
    // above; sending the field is harmless for non-thinking models. Tool-loop
    // calls (the model is just picking the next tool) don't benefit from
    // thinking and the latency hit per turn is material.
    //
    // Same dual-trigger as the prefix path above: family quirk + tools, OR
    // the caller explicitly set `disableThinking: true`. qwen3.6 specifically
    // needs the structured `think: false` field -- the prompt prefix is a
    // no-op on that family. See shouldDisableThinking().
    const disableThinking = shouldDisableThinking(this.quirks, tools !== undefined && tools.length > 0, opts.disableThinking);
    // Prompt caching: Ollama caches KV state when consecutive calls
    // share a prompt prefix AND the model is still loaded. `keep_alive`
    // controls how long the daemon keeps the model in memory after a
    // call returns; default 5min. For the analyzer's tool-loop (often
    // hours of work on the same model + same system prompt) we set this
    // to 24h so the model + KV cache survive between calls and prefix
    // reuse kicks in. `cacheSystem === false` reverts to the default
    // (5m) for one-off calls.
    const keepAlive = opts.cacheSystem === false ? undefined : '24h';
    // tool_choice: best-effort across Ollama model families. Some
    // models (qwen3-coder, devstral) honor it; others ignore. The
    // executeStep per-task driver (Phase 8) treats this as a HINT
    // and has a client-side retry path for the residual non-compliance.
    // Ollama SDK doesn't type the field yet; pass it through the
    // request object via a cast. The specific-tool form (`{ name }`)
    // maps to OpenAI-shape; whether the local model actually honors
    // it is per-family (no enforcement guarantees).
    const ollamaToolChoice = toOllamaToolChoice(opts.toolChoice, tools);
    const response = await this.client.chat({
      model: this.model,
      messages: ollamaMessages,
      ...(tools ? { tools } : {}),
      // Ollama SDK doesn't expose `tool_choice` in its TS types yet, but
      // the underlying HTTP API accepts it. Forward only when set.
      ...(ollamaToolChoice !== undefined ? ({ tool_choice: ollamaToolChoice } as Record<string, unknown>) : {}),
      ...(ollamaFormat !== undefined ? { format: ollamaFormat } : {}),
      ...(disableThinking ? { think: false } : {}),
      ...(keepAlive !== undefined ? { keep_alive: keepAlive } : {}),
      stream: true,
      options: {
        num_ctx: this.numCtx,
        num_predict: opts.maxTokens ?? 8_192,
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      },
    });

    let text = '';
    let allToolCalls: OllamaToolCall[] = [];
    // Ollama's final stream chunk carries token counts:
    //   prompt_eval_count        -- input tokens
    //   prompt_eval_duration     -- ns spent on prompt processing
    //   eval_count               -- output tokens generated
    // When the model's KV cache is warm and the prompt prefix matched
    // a prior call, `prompt_eval_count` reflects only the NEW (non-
    // cached) prefix portion. The `done_reason === 'load'` chunk
    // (model warm-up) doesn't carry these fields.
    let promptEvalCount: number | undefined;
    let evalCount: number | undefined;
    for await (const chunk of response) {
      if (chunk.message.content) {
        text += chunk.message.content;
        opts.onToken?.(chunk.message.content);
      }
      if (chunk.message.tool_calls) {
        allToolCalls = allToolCalls.concat(chunk.message.tool_calls as OllamaToolCall[]);
      }
      // `done: true` chunks carry the usage counts.
      if (chunk.done === true) {
        if (typeof chunk.prompt_eval_count === 'number') promptEvalCount = chunk.prompt_eval_count;
        if (typeof chunk.eval_count === 'number')        evalCount = chunk.eval_count;
      }
    }

    const toolCalls = parseToolCalls(allToolCalls.length > 0 ? allToolCalls : undefined);

    log.debug({
      model: this.model,
      textLen: text.length,
      text,
      toolCallCount: toolCalls.length,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      promptEvalCount,
      evalCount,
    }, 'ollama response');

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
      ...(promptEvalCount !== undefined && evalCount !== undefined ? {
        usage: { inputTokens: promptEvalCount, outputTokens: evalCount },
      } : {}),
    };
  }

  /**
   * Resolve the `format` field passed to ollama.chat from
   * CompletionOpts.responseFormat. Returns `undefined` when no
   * constraint should be applied (caller didn't ask, or family-quirk
   * gates it off when tools are present).
   */
  private _resolveOllamaFormat(
    responseFormat: CompletionOpts['responseFormat'],
    tools: OllamaTool[] | undefined,
  ): string | object | undefined {
    if (responseFormat === undefined) {
      return undefined;
    }
    const hasTools = tools !== undefined && tools.length > 0;
    if (hasTools && !this.quirks.formatWithTools) {
      // qwen quirk: format + tools breaks tool_calls. Drop the
      // constraint here; the analyzer's strict-JSON retry path picks
      // it up on a no-tools call.
      return undefined;
    }
    return responseFormat === 'json' ? 'json' : responseFormat.schema;
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

  // plans/structured-output.md Phase B.5. Ollama structured output.
  //
  // Strategy: pass the schema as the `format` field on the chat API.
  // Ollama's wire layer constrains the model's output to conform to
  // the schema (with varying fidelity depending on model family --
  // qwen3-coder is reliable, older mistral / llama may drift on
  // complex schemas). ajv re-validates as a defensive backstop; on
  // failure the retry helper appends the validation errors as a user
  // message and re-issues.
  //
  // Thinking control: shouldDisableThinking(quirks, hasTools=false, ...)
  // returns the right field for the model family. qwen3-coder gets the
  // `/no_think` prefix path on tool calls only; for pure JSON
  // generation we leave thinking enabled (it helps schema conformance).
  async completeStructured<T>(
    messages: LLMMessage[],
    schema:   StructuredSchema,
    opts?:    StructuredCompletionOpts,
  ): Promise<T> {
    const apiMessages = toOllamaMessages(messages);
    // plans/structured-output.md Phase C.5. Honour the caller's
    // `disableThinking: true` (Ollama specifically -- cloud providers
    // ignore the flag). qwen3-coder + qwen3.6 require this for JSON
    // stability; without it the model emits an empty body before the
    // structured output.
    const disableThinking = shouldDisableThinking(this.quirks, false, opts?.disableThinking === true);

    return withStructuredRetry<T>(
      async (extraSystemNote) => {
        const msgs = extraSystemNote !== undefined
          ? [...apiMessages, { role: 'user' as const, content: extraSystemNote }]
          : apiMessages;
        try {
          // Stream instead of collect-and-parse so we can (a) bridge
          // token deltas to the UI's progress row via opts.onToken and
          // (b) inspect the terminal chunk's done_reason -- when it's
          // 'length' the num_predict cap cut the model off mid-JSON
          // and we surface a distinct 'response-truncated' error the
          // retry-loop feedback names explicitly (ISSUES.md I-003).
          const response = await this.client.chat({
            model:    this.model,
            messages: msgs,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            format:   schema as any,
            keep_alive: '24h',
            stream:   true,
            options: {
              num_ctx: this.numCtx,
              num_predict: opts?.maxTokens ?? 8_192,
              ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
            },
            ...(disableThinking ? { think: false } : {}),
          });

          let text = '';
          let doneReason: string | undefined;
          for await (const chunk of response) {
            const delta = chunk.message?.content ?? '';
            if (delta.length > 0) {
              text += delta;
              opts?.onToken?.(delta);
            }
            if (chunk.done === true) {
              // ollama-js exposes `done_reason` on the terminal chunk
              // once the server has flushed the final ` \"done\": true `
              // frame. Values: 'stop' (normal), 'length' (num_predict
              // exhausted), 'load' (model warm-up preamble -- ignore).
              const rawReason = (chunk as unknown as { done_reason?: string }).done_reason;
              if (typeof rawReason === 'string' && rawReason !== 'load') {
                doneReason = rawReason;
              }
            }
          }
          if (text.length === 0) {
            throw new Error('ollama.completeStructured: empty response content');
          }
          if (doneReason === 'length') {
            // num_predict cap hit mid-response. The JSON is guaranteed
            // to be malformed (unterminated string / missing closing
            // brace / etc.). Surface a distinct error the structured-
            // retry loop's feedback note quotes verbatim so the model
            // knows to keep the next response shorter rather than
            // retrying identical output.
            throw new Error(
              `ollama.completeStructured: response-truncated: `
              + `num_predict cap (${opts?.maxTokens ?? 8_192} tokens) hit before the model closed the JSON. `
              + `Emit a more concise response; keep long string fields brief.`,
            );
          }
          const stripped = stripJsonFence(text);
          try {
            return JSON.parse(stripped);
          } catch (err) {
            throw new Error(`ollama.completeStructured: response was not valid JSON: ${(err as Error).message}. Got: ${stripped.slice(0, 200)}`);
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('ollama.completeStructured:')) {
            throw err;
          }
          throw wrapOllamaError(err);
        }
      },
      (raw) => validateAgainstSchema<T>(schema, raw),
      opts?.maxAttempts ?? 3,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Native tool calls on an assistant turn (Ollama SDK passes these
   *  through to the chat template; for qwen3-coder they render as
   *  `<tool_call>` chat-template tokens the model recognises). */
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
}

/**
 * Translate `LLMMessage[]` into Ollama's native shape. Structured
 * content blocks (`tool_use` on assistant turns, `tool_result` on
 * user turns) are converted to the SDK's `tool_calls` field and
 * `role: 'tool'` messages respectively, so the chat template carries
 * the structured signal instead of a mimicable text marker.
 */
function toOllamaMessages(messages: LLMMessage[]): OllamaMessage[] {
  const out: OllamaMessage[] = [];
  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }

    // Multi-block content. Separate by type.
    const texts: string[] = [];
    const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    const toolResults: Array<{ id: string; content: string; isError: boolean }> = [];
    for (const b of m.content) {
      if (b.type === 'text') texts.push(b.text);
      else if (b.type === 'tool_use') toolUses.push({ id: b.id, name: b.name, input: b.input as Record<string, unknown> });
      else if (b.type === 'tool_result') toolResults.push({ id: b.tool_use_id, content: b.content, isError: b.isError === true });
      // image / document blocks are skipped here -- this provider doesn't surface them.
    }

    if (toolResults.length > 0) {
      // Each tool_result becomes a separate `role: 'tool'` message
      // so the model sees them as the conversation's tool-side
      // returns rather than mixed user content.
      for (const tr of toolResults) {
        out.push({
          role: 'tool',
          content: tr.isError ? `[error] ${tr.content}` : tr.content,
        });
      }
      continue;
    }

    if (m.role === 'assistant' && toolUses.length > 0) {
      out.push({
        role: 'assistant',
        content: texts.join('\n'),
        tool_calls: toolUses.map(tu => ({
          function: { name: tu.name, arguments: tu.input },
        })),
      });
      continue;
    }

    out.push({ role: m.role, content: texts.join('\n') });
  }
  return out;
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

/**
 * Map our generic `CompletionOpts.toolChoice` to Ollama's
 * `tool_choice` request field. Ollama supports the OpenAI-shape
 * specific-tool form; per-model compliance is best-effort (qwen
 * ignores, devstral/mistral-family honor). Returns `undefined`
 * when no constraint should be applied.
 */
function toOllamaToolChoice(
  toolChoice: 'auto' | 'required' | 'none' | { readonly name: string } | undefined,
  tools: unknown[] | undefined,
): string | { type: 'function'; function: { name: string } } | undefined {
  if (toolChoice === undefined) {
    return undefined;
  }
  if (!tools || tools.length === 0) {
    return undefined;
  }
  if (typeof toolChoice === 'object') {
    return { type: 'function', function: { name: toolChoice.name } };
  }
  return toolChoice;
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

/**
 * Classify an Ollama call error as transient (worth retrying) vs
 * structural (retrying is wasted work and a noisier failure).
 *
 * Retry on:
 *   - stream truncation: "Did not receive done or success response in stream"
 *     -- observed mid-run, no `done: true` chunk reached the SDK
 *   - dropped TCP / socket: ECONNRESET / EPIPE / socket hang up / aborted
 *   - undici fetch failures: "fetch failed" / "other side closed"
 *
 * Do NOT retry:
 *   - ECONNREFUSED (server down)
 *   - 404 / "not found" (model not pulled)
 *   - 400 / "invalid" (real client error)
 *   - JSON-parse / schema errors (model output issue)
 */
export function isTransientOllamaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  if (msg.includes('ECONNREFUSED')) return false;
  if (msg.includes('not found') || msg.includes('404')) return false;
  if (msg.includes('400')) return false;
  return (
    msg.includes('Did not receive done or success response in stream') ||
    msg.includes('ECONNRESET') ||
    msg.includes('EPIPE') ||
    msg.includes('socket hang up') ||
    msg.includes('aborted') ||
    msg.includes('fetch failed') ||
    msg.includes('other side closed')
  );
}

// Test-only exports for unit coverage of the retry constants and the
// transient-error classifier without exposing them to runtime callers.
export const _retryConstantsForTest = {
  MAX_TRANSIENT_RETRIES,
  TRANSIENT_RETRY_BASE_DELAY_MS,
};

export const _toOllamaToolChoiceForTest = toOllamaToolChoice;
