import { assertNoSessionEmbedding } from '../../shared/connection-provider.js';
import { fileURLToPath } from 'node:url';
import { ConnectionExecutionError, connectionExecutionErrorCode } from '../../shared/step-context.js';
import { assertConnectionProviderAdmission, assertConnectionProviderTransport, recordLocalConnectionProvider, captureConnectionProviderModule } from '../../shared/connection-provider.js';
import { randomUUID } from 'node:crypto';

import { Ollama } from 'ollama';
import { Agent, fetch as undiciFetch } from 'undici';
import type {
  LLMMessage,
  LLMProvider,
  LLMResponse,
  CompletionOpts,
  ProviderCapabilities,
  ReviewSessionOpts,
  StructuredCompletionOpts,
  StructuredSchema,
  ToolDefinition,
  ToolCall,
} from '../../shared/types.js';
import { getReadOnlyTools, READ_ONLY_TOOL_IDS } from '../../analyze/context/tool-surface.js';
import { loadLocalProviderConfig } from '../../config/local.js';
import { getLogger } from '../../shared/logger.js';
import { emitStructuredAnswer, runReadOnlyToolLoop, ToolLoopDeadlineError } from '../read-only-tool-loop.js';
import { ReviewSessionTimeoutError } from './cli-provider.js';
import { ModelCallFailedError } from './model-call-error.js';
import { validateAgainstSchema, withStructuredRetry } from './structured-output.js';

const log = getLogger('ollama');

// Retry budget for transient stream errors -- one extra attempt is
// enough in practice (the underlying cause is usually a momentary
// stream truncation; a fresh chat() call almost always succeeds).
// Exposed for tests via the _retryConstantsForTest export below.
const MAX_TRANSIENT_RETRIES         = 1;
const TRANSIENT_RETRY_BASE_DELAY_MS = 5_000;

// Default bound for the installed-model list (/api/tags). Deliberately short: a
// UI-triggered "which models can I pick" query must NOT inherit the provider's
// 300s completion header-timeout (Epic ba132c185fe45860, S002). A local ollama
// tags query is sub-second when up; when down we want to fail fast to an
// available:false signal rather than hang the picker.
export const OLLAMA_LIST_TIMEOUT_MS = 4_000;

/** One installed model, structurally compatible with the daemon's sc2 ModelInfo
 *  (kept local so this agent-layer file does not import from the daemon layer). */
export interface LocalModelInfo {
  readonly id:           string;
  readonly displayName?: string;
}

/** Wait `ms`; a fired `signal` ends the wait at once with AbortError. */
function sleep(ms: number, signal?: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted === true) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = (): void => { clearTimeout(t); reject(abortError()); };
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
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

/** Per-client quiet boundary before the SDK's diagnostic-producing decoder.
 * Validated lines alone reach its parser. Cancellation/error waits for reader
 * cancellation; no console patch, source-bearing error or persistent buffer.
 */
async function quietOllamaResponse(response: Response, assertActive: () => void): Promise<Response> {
	assertActive();
	if (!response.ok || !response.body) { try { await response.body?.cancel(); } catch { } throw new ConnectionExecutionError('unsupported-temporary'); }
	const reader = response.body.getReader(), decoder = new TextDecoder(), encoder = new TextEncoder(); let pending = '', terminal: string | undefined;
	const cancel = async () => { try { await reader.cancel(); } catch { } };
	return new Response(new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				for (;;) {
					assertActive(); const result = await reader.read(); assertActive();
					pending += decoder.decode(result.value, { stream: !result.done });
					if (pending.length > 8 * 1024 * 1024) throw new ConnectionExecutionError('resource-limit');
					const parts = pending.split('\n'); pending = result.done ? '' : parts.pop() ?? '';
					const lines: string[] = [];
					for (const line of parts.filter(line => line.trim())) {
						if (terminal !== undefined) throw new ConnectionExecutionError('unsupported-temporary');
						const frame: unknown = JSON.parse(line);
						if (typeof frame === 'object' && frame !== null && ('done' in frame && frame.done === true || 'status' in frame && frame.status === 'success')) terminal = line;
						else lines.push(line);
					}
					// SDK terminal frames can finish its iterator before the HTTP body
					// drains. Hold that frame until the actual reader reaches EOF.
					if (result.done && terminal !== undefined) lines.push(terminal);
					if (lines.length) controller.enqueue(encoder.encode(lines.join('\n') + '\n'));
					if (result.done) { reader.releaseLock(); controller.close(); return; }
					if (lines.length) return;
				}
			} catch { await cancel(); controller.error(new ConnectionExecutionError('unsupported-temporary')); }
		},
		async cancel() { await cancel(); },
	}), { status: response.status, headers: { 'content-type': response.headers.get('content-type') ?? 'application/x-ndjson' } });
}

const nativePrivacyIdentities = new WeakMap<LLMProvider, ReturnType<typeof recordLocalConnectionProvider>>();
/** Read-only exact native-constructor brand; copied descriptors and injected objects have no identity. */
export function nativeConnectionProviderIdentity(candidate: LLMProvider): ReturnType<typeof recordLocalConnectionProvider> | undefined {
	return Object.getPrototypeOf(candidate) === OllamaProvider.prototype ? nativePrivacyIdentities.get(candidate) : undefined;
}
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
  /** Builds a client whose requests carry `signal` (Epic 8315a11f s1); see {@link clientFor}. */
  private readonly signalledClient: (signal: AbortSignal) => Ollama;
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
  /** Ollama keep_alive for the embed model — keeps it resident during index
   *  bursts instead of the ~5-min default eviction (S001). From config. */
  private readonly embeddingKeepAlive: string;
  private readonly quirks: ModelQuirks;
	private readonly connectionMemoryOnly: boolean;

  constructor(
    model?: string,
    host?: string,
    numCtx?: number,
		execution?: import('../../shared/step-context.js').ConnectionExecutionContext,
		memoryProfile?: 'memory-only',
  ) {
		assertConnectionProviderAdmission(execution);
		this.connectionMemoryOnly = memoryProfile === 'memory-only';
		if (this.connectionMemoryOnly) assertOriginalAdapterMethods();
		if (this.connectionMemoryOnly && ['DEBUG', 'NODE_DEBUG', 'OLLAMA_DEBUG'].some(key => process.env[key] && !['0', 'false'].includes(process.env[key]!.toLowerCase()))) throw new ConnectionExecutionError('unsupported-temporary');
		if (this.connectionMemoryOnly) Object.freeze(this.capabilities);
    const d = localDefaults();
    this.model = model ?? d.coreModel;
    host = host ?? d.host;
    // Cleanup: the per-model `params` lookup was on the old AgentConfig
    // schema; the new infra-only loader keeps just a single context
    // window. Callers passing `numCtx` win; otherwise default to 16k.
    this.numCtx = numCtx ?? 16_384;
    this.embeddingModel = d.embeddingModel;
    // loadLocalProviderConfig already coalesces empty/blank to the '24h' default
    // (resolveEmbeddingKeepAlive), so d.embeddingKeepAlive is a usable non-empty value.
    this.embeddingKeepAlive = d.embeddingKeepAlive;
    this.quirks = modelQuirks(this.model);
		if (this.connectionMemoryOnly) Object.freeze(this.quirks);
		if (!this.connectionMemoryOnly) log.info({ model: this.model, family: this.quirks.family, noThinkOnTools: this.quirks.noThinkOnTools, formatWithTools: this.quirks.formatWithTools }, 'ollama provider configured');
    // Override undici's default headers timeout (300s) which is too short for
    // CPU-bound large-context inference that can take 5-10 minutes.
    const agent = new Agent({
      headersTimeout: 0,   // disable -- streaming returns headers with first token
      bodyTimeout: 0,      // disable -- streaming body arrives incrementally
      connectTimeout: 30_000,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
		const guardedFetch = async (input: any, init?: any, signal?: AbortSignal) => {
			if (this.connectionMemoryOnly) assertConnectionProviderTransport(this);
			const response = await undiciFetch(input, { ...init, dispatcher: agent, ...(signal ? { signal } : {}) });
			if (!this.connectionMemoryOnly) return response;
			return quietOllamaResponse(response as unknown as Response, () => assertConnectionProviderTransport(this));
		};
		const longTimeoutFetch = guardedFetch as unknown as typeof globalThis.fetch;
    this.client = new Ollama({ host, fetch: longTimeoutFetch });
    // A cancellable call gets its own client over the SAME agent, whose fetch
    // carries the call's signal, so aborting ends that request (and its stream).
		this.signalledClient = (signal: AbortSignal) => {
			const client = new Ollama({
      host,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
			fetch: ((input: any, init?: any) => guardedFetch(input, init, signal)) as unknown as typeof globalThis.fetch,
			}); if (this.connectionMemoryOnly) { Object.freeze(Object.getOwnPropertyDescriptor(client, 'config')?.value); Object.freeze(client); } return client;
		};
		const client = this.client, signalled = this.signalledClient, selectedModel = this.model, capabilities = this.capabilities, contextSize = this.numCtx, quirks = this.quirks;
		const own = (key: string) => Object.getOwnPropertyDescriptor(this, key)?.value;
		const prototype = Object.getPrototypeOf(this);
		// Capture the full adapter/SDK/dispatcher method chains, including private
		// helpers. A changed getter is compared as a descriptor, never evaluated.
		const chains = [this, this.client, agent].flatMap(value => {
			const rows: { prototype: object; keys: PropertyKey[]; descriptors: PropertyDescriptor[] }[] = [];
			for (let node = Object.getPrototypeOf(value) as object | null;node && node !== Object.prototype;node = Object.getPrototypeOf(node) as object | null) {
				const keys = Reflect.ownKeys(node); rows.push({ prototype: node, keys, descriptors: keys.map(key => Object.getOwnPropertyDescriptor(node, key)!) });
			} return rows;
		});
		const chainChanged = () => chains.some(row => {
			const keys = Reflect.ownKeys(row.prototype);
			return keys.length !== row.keys.length || keys.some((key, index) => {
				const descriptor = Object.getOwnPropertyDescriptor(row.prototype, key)!, expected = row.descriptors[index]!;
				return key !== row.keys[index] || descriptor.value !== expected.value || descriptor.get !== expected.get || descriptor.set !== expected.set;
			});
		});
		if (this.connectionMemoryOnly) { Object.freeze(Object.getOwnPropertyDescriptor(this.client, 'config')?.value); Object.freeze(this.client); Object.freeze(this); }
		nativePrivacyIdentities.set(this, recordLocalConnectionProvider(this, {
			modelId: this.model, host, source: fileURLToPath(import.meta.url), moduleEvidence: modulePrivacyEvidence, memoryOnly: this.connectionMemoryOnly,
			assertUnchanged: () => {
				assertOriginalAdapterMethods();
				if (Object.getPrototypeOf(this) !== prototype || own('client') !== client || own('signalledClient') !== signalled || own('model') !== selectedModel || own('connectionMemoryOnly') !== true || own('numCtx') !== contextSize || own('quirks') !== quirks || !Object.isFrozen(quirks) || own('capabilities') !== capabilities || !Object.isFrozen(capabilities) || own('supportsTools') !== true || !Object.isFrozen(this) || !Object.isFrozen(client) || chainChanged()) throw new ConnectionExecutionError('unsupported-temporary');
			}
		}));

  }

  /** The client for one call: the shared one, or, when the call can be cancelled,
   *  one whose requests carry its signal. An already-aborted signal throws at once. */
  private clientFor(signal: AbortSignal | undefined): Ollama {
    if (signal === undefined) return this.client;
    if (signal.aborted) throw abortError();
    return this.signalledClient(signal);
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.list();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List the machine's installed ollama models via a read-only /api/tags query
   * (Epic ba132c185fe45860, S002). Bounded by opts.timeoutMs (default
   * OLLAMA_LIST_TIMEOUT_MS) so a UI-triggered list never inherits the 300s
   * completion header-timeout. Maps each ModelResponse.name -> { id } (no
   * displayName). REJECTS on unreachable/timeout/malformed (a non-array `models`
   * or an entry without a string name) — the caller (the daemon list-models
   * dispatch) maps any rejection to an available:false result; a partial/garbage
   * list is never emitted. The `listFn` seam lets tests drive the mapping +
   * timeout without a live ollama. Read-only: no model pull/mutation.
   */
  async listLocalModels(
    opts: { timeoutMs?: number; listFn?: () => Promise<{ models?: unknown }> } = {},
  ): Promise<readonly LocalModelInfo[]> {
    const timeoutMs = opts.timeoutMs ?? OLLAMA_LIST_TIMEOUT_MS;
    const listFn    = opts.listFn ?? (() => this.client.list());

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`ollama model list timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });

    try {
      const res    = await Promise.race([listFn(), timeout]);
      const models = (res as { models?: unknown }).models;
      if (!Array.isArray(models)) {
        throw new Error('ollama model list returned a malformed response (no models array)');
      }
      const out: LocalModelInfo[] = [];
      for (const m of models) {
        const name = (m as { name?: unknown }).name;
        if (typeof name !== 'string' || name.length === 0) {
          throw new Error('ollama model list returned an entry without a valid name');
        }
        out.push({ id: name });
      }
      return out;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async complete(messages: LLMMessage[], opts: CompletionOpts = {}): Promise<LLMResponse> {
		assertConnectionProviderAdmission(opts?.connectionExecution, this);
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

		if (!this.connectionMemoryOnly) log.debug({
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
			assertConnectionProviderAdmission(opts.connectionExecution, this);
      try {
        // Always use streaming internally to avoid headers-timeout on slow
        // CPU inference. The non-streaming Ollama API waits for the entire
        // response before sending HTTP headers, which can exceed the timeout
        // for large-context calls on CPU-only machines.
				const result = await this.completeStreaming(ollamaMessages, tools, opts);
				assertConnectionProviderAdmission(opts.connectionExecution, this);
				return result;
      } catch (err) {
				assertConnectionProviderAdmission(opts.connectionExecution, this);
				if (opts.connectionExecution?.mode === 'session-memory') throw new ConnectionExecutionError('unsupported-temporary');
        // A cancelled call is AbortError whatever the fetch rejected with (an abort
        // with a custom reason rejects with that reason). Never retried.
        if (opts.signal?.aborted === true) throw abortError();
        lastErr = err;
        if (attempt < MAX_TRANSIENT_RETRIES && isTransientOllamaError(err)) {
          const delayMs = TRANSIENT_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
					if (!this.connectionMemoryOnly) log.warn({
            model:    this.model,
            attempt:  attempt + 1,
            delayMs,
            err:      err instanceof Error ? err.message : String(err),
          }, 'ollama: transient stream error -- retrying');
          // A cancelled call stops waiting: the backoff never outlives the signal.
          await sleep(delayMs, opts.signal);
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
		const keepAlive = this.connectionMemoryOnly ? 0 : opts.cacheSystem === false ? undefined : '24h';
    // tool_choice: best-effort across Ollama model families. Some
    // models (qwen3-coder, devstral) honor it; others ignore. The
    // executeStep per-task driver (Phase 8) treats this as a HINT
    // and has a client-side retry path for the residual non-compliance.
    // Ollama SDK doesn't type the field yet; pass it through the
    // request object via a cast. The specific-tool form (`{ name }`)
    // maps to OpenAI-shape; whether the local model actually honors
    // it is per-family (no enforcement guarantees).
    const ollamaToolChoice = toOllamaToolChoice(opts.toolChoice, tools);
		assertConnectionProviderAdmission(opts.connectionExecution, this);
    const response = await this.clientFor(opts.signal).chat({
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
			assertConnectionProviderAdmission(opts?.connectionExecution, this);
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

		if (!this.connectionMemoryOnly) log.debug({
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

	async embed(text: string, execution?: import('../../shared/step-context.js').ConnectionExecutionContext): Promise<number[]> {
		assertNoSessionEmbedding(execution);
    try {
      const result = await this.client.embed({ model: this.embeddingModel, input: text, keep_alive: this.embeddingKeepAlive });
      return result.embeddings[0] ?? [];
		} catch (error) {
			const code = connectionExecutionErrorCode(error); if (code) throw new ConnectionExecutionError(code);
      return [];
    }
  }

  async *stream(messages: LLMMessage[], opts: CompletionOpts = {}): AsyncIterable<string> {
		assertConnectionProviderAdmission(opts.connectionExecution, this);
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
				assertConnectionProviderAdmission(opts?.connectionExecution, this);
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
		assertConnectionProviderAdmission(opts?.connectionExecution, this);
    const apiMessages = toOllamaMessages(messages);
    // plans/structured-output.md Phase C.5. Honour the caller's
    // `disableThinking: true` (Ollama specifically -- cloud providers
    // ignore the flag). qwen3-coder + qwen3.6 require this for JSON
    // stability; without it the model emits an empty body before the
    // structured output.
    const disableThinking = shouldDisableThinking(this.quirks, false, opts?.disableThinking === true);

    return withStructuredRetry<T>(
      async (extraSystemNote) => {
				assertConnectionProviderAdmission(opts?.connectionExecution, this);
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
          const response = await this.clientFor(opts?.signal).chat({
            model:    this.model,
            messages: msgs,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            format:   schema as any,
						keep_alive: this.connectionMemoryOnly ? 0 : '24h',
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
						assertConnectionProviderAdmission(opts?.connectionExecution, this);
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
					assertConnectionProviderAdmission(opts?.connectionExecution, this);
					if (opts?.connectionExecution?.mode === 'session-memory') throw new ConnectionExecutionError('unsupported-temporary');
          // A cancelled call is AbortError whatever the fetch rejected with.
          if (opts?.signal?.aborted === true) throw abortError();
          if (err instanceof Error && err.message.startsWith('ollama.completeStructured:')) {
            throw err;
          }
          throw wrapOllamaError(err);
        }
      },
			(raw) => validateAgainstSchema<T>(schema, raw, opts?.connectionExecution),
      // internalRetry false: one attempt; the caller owns retries (Epic 8315a11f s1).
      opts?.internalRetry === false ? 1 : (opts?.maxAttempts ?? 3),
			opts?.connectionExecution,
    );
  }

  /**
   * A reviewer session on a local model (Epic 8315a11f s1): the model reads the
   * repository at `opts.cwd` through the read-only tool loop, whose allowlist is
   * checked where each tool runs, then gives a structured answer checked against
   * `schema`. `opts.deadlineMs` bounds the whole session: passing it aborts the
   * turn in flight and throws {@link ReviewSessionTimeoutError}, never retried.
   * `opts.signal` cancels it with AbortError.
   */
  async runReviewSession<T>(prompt: string, schema: StructuredSchema, opts: ReviewSessionOpts): Promise<T> {
		assertConnectionProviderAdmission(opts.connectionExecution, this);
    const deadlineAt = Date.now() + opts.deadlineMs;
    const timer = new AbortController();
    const handle = setTimeout(() => timer.abort(), opts.deadlineMs);
    const signal = opts.signal !== undefined ? AbortSignal.any([opts.signal, timer.signal]) : timer.signal;
    const timedOut = (): boolean => timer.signal.aborted && opts.signal?.aborted !== true;
    try {
      const loop = await runReadOnlyToolLoop({
        provider: this,
        messages: [{ role: 'user', content: prompt }],
        tools:    getReadOnlyTools(),
        allow:    new Set(READ_ONLY_TOOL_IDS),
        deps:     { sessionId: `review-session-${randomUUID()}`, repoPath: opts.cwd, closureRepos: [opts.cwd], send: () => {}, requestId: 0, ollamaProvider: this },
        // The repository is the session's working directory, as it is for the CLI sessions.
        root:     opts.cwd,
        maxTurns: REVIEW_SESSION_MAX_TURNS,
        signal,
        deadlineAt,
      });
      // Out of turns: the model still answers from what it has read.
      if (!loop.done) log.warn({ model: this.model, turns: REVIEW_SESSION_MAX_TURNS }, 'ollama review session: tool turns ran out; asking for the answer');
      return await emitStructuredAnswer<T>({
        provider:    this,
        messages:    loop.messages,
        // Structural reference trails the prompt.
        instruction: 'Now give your final answer: ONLY a JSON object matching this JSON Schema -- no prose, no fenced block.\n\n' + JSON.stringify(schema),
        schema,
        ...(opts.internalRetry !== undefined ? { internalRetry: opts.internalRetry } : {}),
        signal,
      });
    } catch (err) {
      if (timedOut() || err instanceof ToolLoopDeadlineError) throw new ReviewSessionTimeoutError(opts.deadlineMs);
      throw err;
    } finally {
      clearTimeout(handle);
    }
  }
}

/** Tool turns an Ollama reviewer session may take; its deadline is the real bound. */
// Module-load baseline prevents a pre-construction helper substitution from
// being mistaken for a native implementation when identity is first recorded.
const modulePrivacyEvidence = captureConnectionProviderModule(import.meta.url);
const originalAdapterMethods = new Map(Reflect.ownKeys(OllamaProvider.prototype).map(key => [key, Object.getOwnPropertyDescriptor(OllamaProvider.prototype, key)!]));
function assertOriginalAdapterMethods(): void {
	const keys = Reflect.ownKeys(OllamaProvider.prototype);
	if (keys.length !== originalAdapterMethods.size || keys.some(key => { const actual = Object.getOwnPropertyDescriptor(OllamaProvider.prototype, key)!, expected = originalAdapterMethods.get(key); return !expected || actual.value !== expected.value || actual.get !== expected.get || actual.set !== expected.set; })) throw new ConnectionExecutionError('unsupported-temporary');
}

const REVIEW_SESSION_MAX_TURNS = 40;

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

/** The error a call cancelled before it started throws. */
function abortError(): Error {
  const err = new Error('the call was cancelled');
  err.name = 'AbortError';
  return err;
}

/** The error a cancelled request raises (fetch's DOMException, the Ollama client's own AbortError). */
function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * A request the Ollama server answered and rejected for its content: the
 * client's ResponseError with a 4xx status (a bad format schema, a prompt over
 * the context length). A 404 is not one: it is the model not being found, a
 * configuration failure. Nor are 408 (request timeout) and 429 (too many
 * requests), which a proxy in front of Ollama can return: the request was not
 * refused for its content, the model could not be reached in time. A 5xx is
 * the server failing, not the request.
 */
const NOT_A_REQUEST_REJECTION: ReadonlySet<number> = new Set([404, 408, 429]);
function isRequestRejection(err: unknown): boolean {
  if (!(err instanceof Error) || err.name !== 'ResponseError') return false;
  const status = (err as { status_code?: unknown }).status_code;
  return typeof status === 'number' && status >= 400 && status < 500 && !NOT_A_REQUEST_REJECTION.has(status);
}

/**
 * A failure to reach or keep the model -- from the call itself or from inside
 * a stream's iteration -- is a failed model call, whatever its text
 * (ECONNREFUSED, socket hang up, fetch failed, terminated, a stream that ends
 * early, a server error). It is raised as ModelCallFailedError so a caller
 * recognises it by type, not by matching words; the client's own error is
 * kept as the cause. The two configuration failures (Ollama not running, the
 * model not found) keep their actionable wording as the detail. Two errors
 * are not failed model calls and pass through as raised: a cancellation, and
 * a request the server rejected for its content (isRequestRejection).
 */
function wrapOllamaError(err: unknown): unknown {
  if (err instanceof ModelCallFailedError) return err;
  // A cancelled call is not a failed one: the abort reaches the caller as it
  // was raised, so a cancellation is never reported as the model being unavailable.
  if (isAbortError(err)) return err;
  // Neither is a request the server rejected for its content: it reaches the
  // caller as the client raised it, with the server's status and message, so
  // it is not reported as an outage (ISSUE-fb584b48).
  if (isRequestRejection(err)) return err;
  const message = err instanceof Error ? err.message : String(err);
  let detail = message;
  if (message.includes('ECONNREFUSED')) {
    detail = 'Ollama is not running. Start it with: ollama serve';
  } else if (message.includes('not found') || message.includes('404')) {
    detail = 'Model not found in Ollama. Pull it with: ollama pull <model>';
  }
  return new ModelCallFailedError(detail, { cause: err });
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
  // A cancelled call is never retried; 'aborted' below is a socket the far side cut.
  if (isAbortError(err)) return false;
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
