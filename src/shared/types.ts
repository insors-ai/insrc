/**
 * Core LLM provider abstraction.
 * All agent logic operates against these interfaces —
 * never directly against Ollama or Anthropic SDK types.
 */

/** A single content block within a multimodal message. */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; data: string }   // base64-encoded
  | { type: 'document'; mediaType: string; data: string } // base64-encoded PDF
  /**
   * Tool invocation on an `assistant` turn. The loop emits this when
   * the LLM's prior response was `stopReason: 'tool_use'` -- it
   * preserves the structured tool call in conversation history so
   * the next round sees what the assistant did, rather than a
   * mimicable text marker. Providers translate this into their
   * native tool_use API shape.
   */
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  /**
   * Tool result on a `user` turn. The loop emits this after each
   * tool executes. Providers translate to their native tool_result
   * shape. `content` is the rendered text the LLM sees; `isError`
   * mirrors the `ToolResult.isError` flag.
   */
  | { type: 'tool_result'; tool_use_id: string; content: string; isError?: boolean };

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean | undefined;
  /**
   * Optional structured data alongside the textual content. Used by
   * skill_invoke / skill_describe to surface the typed SkillResult
   * back to orchestrator-side trace callers without re-parsing the
   * markdown `content`. Loop transport (provider → executor → loop)
   * preserves this field verbatim; the LLM does NOT see it (only
   * `content` is rendered into the next prompt's tool_result block).
   */
  data?: unknown;
}

export interface LLMResponse {
  text: string;
  toolCalls?: ToolCall[] | undefined;
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  /**
   * Token usage from the API response (if available).
   *
   * `cacheReadTokens` / `cacheCreationTokens` are populated when the
   * provider supports prompt caching and the call hit / created a
   * cache entry. Both default to 0 for providers without caching or
   * for cache-cold calls.
   *
   * The semantics are anthropic-shaped (which is the most common):
   *   - inputTokens          = uncached input tokens billed at full rate
   *   - cacheReadTokens      = input tokens served from cache (billed at ~10%)
   *   - cacheCreationTokens  = input tokens written to cache this call (~125%)
   * Other providers map their reporting onto this shape; absent fields
   * (e.g. OpenAI's `prompt_tokens_details.cached_tokens`) populate
   * `cacheReadTokens` only.
   */
  usage?: {
    inputTokens:           number;
    outputTokens:          number;
    cacheReadTokens?:      number | undefined;
    cacheCreationTokens?:  number | undefined;
  } | undefined;
}

export interface CompletionOpts {
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDefinition[] | undefined;
  /** If provided, text tokens are streamed via this callback during complete(). */
  onToken?: ((token: string) => void) | undefined;
  /**
   * Strict-output hint. Three forms:
   *
   *   - `'json'`               -- parseable-JSON constraint (Ollama
   *                               `format: 'json'`). Model output is
   *                               valid JSON of any shape.
   *   - `{ schema: <object> }` -- shape-constrained output. The
   *                               object is a JSON Schema; Ollama
   *                               passes it as `format: <schema>`
   *                               and the constrained decoder emits
   *                               only output that matches.
   *                               Higher leverage than 'json' --
   *                               eliminates schema-violation
   *                               failure modes by construction.
   *                               Same approach instructor-js takes
   *                               for OpenAI's structured-outputs.
   *   - `undefined`            -- no constraint.
   *
   * Providers without server-side support (Anthropic, etc.) ignore
   * the hint; the runner-side parse + retry remains the source of
   * truth in that case.
   */
  responseFormat?: 'json' | { readonly schema: Record<string, unknown> } | undefined;
  /**
   * Whether the provider should mark the system message as cacheable
   * (anthropic `cache_control: ephemeral`, ollama `keep_alive`, etc.).
   * Defaults to `true` -- the system prompt is the canonical stable-
   * prefix target. Set `false` for one-off calls where the system
   * message changes every call and caching would waste cache writes.
   */
  cacheSystem?: boolean | undefined;
  /**
   * Constrain the model's choice of tool use.
   *
   *   - `'auto'`         (default) -- model may emit text, tool_use, or both.
   *   - `'required'`               -- model MUST emit at least one tool_use
   *                                   block (any tool in the catalog).
   *   - `'none'`                   -- model MUST NOT emit a tool_use block.
   *   - `{ name: '<id>' }`         -- model MUST call this SPECIFIC tool. Used
   *                                   by the tool-loop substrate's escalation
   *                                   paths (force `submit_plan` on the final
   *                                   turn; force-commit on degenerate-repeat
   *                                   retry). Strict on cloud providers;
   *                                   best-effort on local Ollama where
   *                                   compliance is per-model-family.
   *
   * Provider plumbing maps this to the vendor-specific knob:
   *
   *   - Ollama:    `tool_choice` on the request (model-dependent).
   *   - Anthropic: `{ type: 'any' }` for `'required'`, `{ type: 'auto' }`
   *                for `'auto'`, `{ type: 'none' }` for `'none'`,
   *                `{ type: 'tool', name }` for `{ name }`.
   *   - OpenAI:    `'required' | 'auto' | 'none'` strings;
   *                `{ type: 'function', function: { name } }` for `{ name }`.
   *   - Mistral:   same as OpenAI.
   *   - Gemini:    function_calling_config with mode `AUTO|ANY|NONE`,
   *                plus `allowed_function_names: [name]` for `{ name }`.
   *
   * Providers that don't support the constraint silently ignore it;
   * callers should treat enforcement as best-effort and have a
   * client-side retry path for the residual non-compliance.
   */
  toolChoice?: 'auto' | 'required' | 'none' | { readonly name: string } | undefined;
  /**
   * Force the Ollama provider to send `think: false` on the request,
   * suppressing thinking-mode emission on qwen3.x and other
   * thinking-capable models even when no tools are present.
   *
   * Why: the provider's default behavior gates `think: false` on
   * `tools.length > 0` (tool-loop calls don't benefit from thinking
   * and the per-turn latency hit is material). Tool-less structured
   * JSON callers (e.g. memory-shape extraction) need the same gate
   * un-set, otherwise qwen3.6 burns its output budget on hidden
   * `<think>...</think>` tokens and emits an empty body.
   *
   * Silent no-op on non-Ollama providers and on Ollama models whose
   * family doesn't honor `think` (e.g. mistral). Set explicitly per-
   * call; do not enable globally.
   */
  disableThinking?: boolean | undefined;
}

export interface LLMProvider {
  complete(messages: LLMMessage[], opts?: CompletionOpts): Promise<LLMResponse>;
  stream(messages: LLMMessage[], opts?: CompletionOpts): AsyncIterable<string>;
  /** Embed text into a vector. Returns empty array if not supported. */
  embed(text: string): Promise<number[]>;
  readonly supportsTools: boolean;
  /**
   * Schema-enforced structured completion (plans/structured-output.md
   * Phase A). The provider's wire layer guarantees the response
   * conforms to `schema`; ajv re-validates as a defensive backstop.
   * On validation failure the helper re-issues with the errors
   * appended to the conversation, up to `opts.maxAttempts` (default 3).
   *
   * `schema` is a TypeBox schema. The compile-time type `T` is
   * derived from it via `Static<typeof schema>` at the callsite.
   *
   * Implementations:
   *   - Anthropic: forced single-tool with `input_schema = schema`,
   *     `tool_choice: { type: 'tool', name: '_emit' }`. Read first
   *     tool_use block's input.
   *   - OpenAI:    `response_format: { type: 'json_schema',
   *                                    json_schema: { schema, strict: true } }`
   *                after `processSchemaForOpenAIStrict` pre-flight.
   *   - Gemini:    `responseMimeType: 'application/json'` +
   *                `responseSchema` (OpenAPI 3.0 dialect; adapter
   *                lives in `gemini-schema-adapter.ts`).
   *   - Mistral:   `response_format: { type: 'json_schema', json_schema }`
   *                on newer models, fall back to `{ type: 'json_object' }`.
   *   - Ollama:    `format: schema` (already implemented; lifted from
   *                `_resolveOllamaFormat` into this method).
   *
   * Providers without a native structured-output API should set
   * `capabilities.structuredOutput: false` and throw a clear
   * "not supported" error; the caller is expected to gate on the
   * capability flag at config time.
   *
   * Phase A ships throwing stubs on every provider. Phases B.1-B.5
   * implement them one provider at a time.
   */
  completeStructured<T>(
    messages: LLMMessage[],
    schema:   StructuredSchema,
    opts?:    StructuredCompletionOpts,
  ): Promise<T>;
  readonly capabilities: ProviderCapabilities;
}

/**
 * Capability declaration (plans/structured-output.md Phase A).
 * Callers check this before invoking the relevant method so a missing
 * provider feature surfaces as an explicit error, not a malformed
 * response surfaced downstream.
 */
export interface ProviderCapabilities {
  /** `completeStructured` honours its `schema` argument at the wire layer. */
  readonly structuredOutput: boolean;
  /** Tool/function calling in chat completions. */
  readonly toolCalling:      boolean;
  /** Image / PDF attachment understanding. */
  readonly vision:           boolean;
  /** Native web-search tool (Anthropic + OpenAI + Gemini). */
  readonly webSearch:        boolean;
  /** Token streaming via `stream()` or the `onToken` callback in `complete`. */
  readonly streaming:        boolean;
  /** Embedding generation (local-only on Ollama today). */
  readonly embeddings:       boolean;
}

/**
 * TypeBox schema container. The provider receives the raw JSON Schema
 * (typebox schemas ARE JSON Schemas plus a `Static` brand) and the
 * caller derives the compile-time TS type via `typeof schema` -> Static.
 *
 * Carried as a `Record<string, unknown>` here so this file stays free
 * of a typebox import (no cycle risk in shared/types.ts). Real callsites
 * import `Type` + `Static` from `@sinclair/typebox` and pass the
 * result.
 */
export type StructuredSchema = Readonly<Record<string, unknown>>;

export interface StructuredCompletionOpts {
  readonly temperature?: number | undefined;
  readonly maxTokens?:   number | undefined;
  /** Default 3. The validation-feedback retry loop's cap. */
  readonly maxAttempts?: number | undefined;
  /** Forwarded to the underlying provider call. Provider-specific. */
  readonly signal?:      AbortSignal | undefined;
  /**
   * Suppress chain-of-thought output. Required for qwen3-coder's
   * structured-output stability (`/no_think` prefix) and for the
   * qwen3.6 family's `think: false` field. Honoured by Ollama;
   * cloud providers ignore the flag.
   */
  readonly disableThinking?: boolean | undefined;
  /**
   * Optional token-level callback for the structured-output stream.
   * Currently only Ollama streams structured-output responses; when
   * set, the provider streams the response chunk-by-chunk and invokes
   * this callback for each content delta. Cloud providers ignore
   * this until they migrate to streaming structured-output.
   *
   * Wired for two use cases:
   *   - UI: bridge live token deltas to the chat panel so the
   *     planner / shaper progress row updates as tokens arrive
   *     instead of sitting silent for minutes (ISSUES.md I-002).
   *   - Truncation detection: the provider inspects the terminal
   *     stream chunk's `done_reason` field. When Ollama reports
   *     `length` (num_predict hit), the provider throws a
   *     `response-truncated` error the retry loop can dispatch on.
   */
  readonly onToken?: ((token: string) => void) | undefined;
}

// ---------------------------------------------------------------------------
// Intent taxonomy
// ---------------------------------------------------------------------------

export type Intent =
  | 'implement'
  | 'refactor'
  | 'test'
  | 'debug'
  | 'review'
  | 'document'
  | 'research'
  | 'code-analysis'
  | 'data-analysis'
  | 'plan'
  | 'requirements'
  | 'design'
  | 'brainstorm'
  | 'deploy'
  | 'release'
  | 'infra';

/** Provider identity -- the cloud providers plus Ollama-local. */
export type CloudProviderName = 'openai' | 'anthropic' | 'gemini' | 'mistral';
export type ProviderName = 'local' | CloudProviderName;

/** Explicit @-prefix override used by CLI and classifier. */
export type ExplicitProvider = ProviderName;

// ---------------------------------------------------------------------------
// Agent personas
// ---------------------------------------------------------------------------

export type PersonaName = 'designer' | 'planner' | 'developer' | 'tester' | 'deployer';

/**
 * @deprecated Use `ClassifyResult` from `shared/classify.ts` + the
 * generic classifier module. Kept temporarily during the rewrite; will
 * be removed once every site has migrated to the new shape. Not used
 * by any current code path.
 */
export interface ClassificationResult {
  primary: {
    intent: Intent;
    confidence: number;
    snippet: string;
    reasoning: string;
  };
  secondary?: {
    intent: Intent;
    confidence: number;
    snippet: string;
    reasoning: string;
  } | undefined;
}

export interface Task {
  intent: Intent;
  message: string;
  explicit?: ExplicitProvider | undefined;
  attachments?: Attachment[] | undefined;
  activeFile?: string | undefined;
  selectedEntity?: string | undefined;
}

export interface Attachment {
  kind: 'text' | 'code' | 'image' | 'pdf';
  name: string;
  path: string;
  content?: string | undefined;
}

// ---------------------------------------------------------------------------
// Agent config
// ---------------------------------------------------------------------------

/** Per-model context window parameters. */
export interface ModelParams {
  /** Context window size in tokens. */
  maxInputTokens: number;
  /** Max output tokens per call. */
  maxOutputTokens: number;
}

/** Provider binding for a single LLM operation within an agent. */
export interface StepBinding {
  provider: ProviderName;
  /** Explicit model name (required for cloud providers; optional for local where
   *  there is only one coreModel anyway). */
  model?: string | undefined;
}

/** Per-agent step-level provider config. Keys are step names, values are bindings. */
export type AgentStepConfig = Record<string, string | StepBinding>;

/** All agent configs keyed by agent/persona name. */
export interface AgentProviderConfigs {
  classifier?: AgentStepConfig | undefined;
  context?: AgentStepConfig | undefined;
  designer?: AgentStepConfig | undefined;
  planner?: AgentStepConfig | undefined;
  implement?: AgentStepConfig | undefined;
  refactor?: AgentStepConfig | undefined;
  test?: AgentStepConfig | undefined;
  debug?: AgentStepConfig | undefined;
  document?: AgentStepConfig | undefined;
  research?: AgentStepConfig | undefined;
  brainstorm?: AgentStepConfig | undefined;
  pair?: AgentStepConfig | undefined;
  delegate?: AgentStepConfig | undefined;
  tester?: AgentStepConfig | undefined;
}

/** Local (Ollama) provider config. One core model + one embedding model. */
export interface LocalProviderConfig {
  host: string;
  coreModel: string;
  embeddingModel: string;
  embeddingDim: number;
  /** Chars-per-token ratio for budget estimation (default 3). */
  charsPerToken: number;
  /** Per-model context window params, keyed by model name. */
  params: Record<string, ModelParams>;
}

/** Cloud provider config. Multiple enabled models, one default. */
export interface CloudProviderConfig {
  /** Default model for this provider (what `@<provider>` resolves to). */
  default: string | null;
  /** Whitelisted models the agent may use. */
  enabled: string[];
  /** Per-model context window params, keyed by model name. */
  params: Record<string, ModelParams>;
}

export interface ProvidersConfig {
  local: LocalProviderConfig;
  openai: CloudProviderConfig;
  anthropic: CloudProviderConfig;
  gemini: CloudProviderConfig;
  mistral: CloudProviderConfig;
}

/** Global "use this when an image/PDF attachment is present" binding. */
export type VisionDefault = { provider: ProviderName; model: string } | null;

export interface AgentConfig {
  models: {
    /** The single active cloud provider. `local` is always available alongside. */
    activeProvider: CloudProviderName | null;
    /** Vision override for turns with image/PDF attachments. */
    visionDefault: VisionDefault;
    providers: ProvidersConfig;
    /** Per-agent step-level provider overrides. */
    agents?: AgentProviderConfigs | undefined;
  };
  keys: {
    anthropic?: string | undefined;
    openai?: string | undefined;
    gemini?: string | undefined;
    mistral?: string | undefined;
    brave?: string | undefined;
  };
  permissions: {
    mode: 'validate' | 'auto-accept';
  };
  classifier?: {
    /**
     * When true, every turn prompts the user to confirm / override the
     * classified intent before the agent pipeline runs. Low-confidence
     * classifications (< LOW_CONFIDENCE_THRESHOLD) always prompt
     * regardless of this setting.
     */
    confirmIntent?: boolean | undefined;
  } | undefined;
  /**
   * memory-context M5.6. Mirror of the `insrc.memory.*` workbench
   * settings that the daemon reads at runtime. Optional everywhere --
   * absent fields fall back to documented defaults.
   */
  memory?: {
    /**
     * Implicit-capture-during-retrieval backstop (memory-context G8).
     * Off by default. When enabled, the daemon's chat-handler scans
     * recent unclassified turns at preference-slot fulfillment time
     * and surfaces candidates asynchronously on next interaction via
     * the Layer 3 confirm toast.
     */
    implicitCapture?: {
      enabled?: boolean | undefined;
    } | undefined;
  } | undefined;
  /**
   * Analyzer routing config. Applies to BOTH the code analyzer
   * (daemon/controllers/code-analyzer-orchestrator.ts) and the data
   * analyzer (agent/tasks/data-analyzer/resolve-provider.ts).
   *
   * Replaces the legacy env-var pair INSRC_ANALYZER_USE_LOCAL +
   * INSRC_DATA_ANALYZER_USE_LOCAL. Re-read on every call site, so a
   * runtime config edit takes effect on the next analyzer task
   * without a daemon restart.
   */
  analyzer?: {
    /**
     * When true, analyzer LLM call sites that DEFAULT to cloud routing
     * revert to the local Ollama provider. Use case: regression
     * comparison against the cloud-only path, or running offline with
     * no Anthropic API key. Default: false (cloud routing).
     *
     * Falls back to local automatically when cloud is unconfigured
     * (no Anthropic API key), regardless of this setting.
     */
    useLocal?: boolean | undefined;
  } | undefined;
}

// ---------------------------------------------------------------------------
// Code Knowledge Graph — entity + relation types
// ---------------------------------------------------------------------------

export type Language = 'python' | 'go' | 'typescript' | 'javascript'
  | 'java' | 'scala'
  | 'markdown' | 'html' | 'css' | 'yaml' | 'json' | 'toml' | 'shell'
  | 'sql' | 'proto' | 'graphql' | 'dockerfile' | 'config';

export type EntityKind =
  | 'repo'
  | 'file'
  | 'module'
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'document'
  | 'section'
  | 'config';

export type RelationKind =
  | 'DEFINES'
  | 'IMPORTS'
  | 'CALLS'
  | 'INHERITS'
  | 'IMPLEMENTS'
  | 'DEPENDS_ON'
  | 'EXPORTS'
  | 'REFERENCES';

export interface Entity {
  /** Stable deterministic ID: SHA256(repo + file + kind + name), hex-32 */
  id:         string;
  kind:       EntityKind;
  name:       string;
  language:   Language;
  /**
   * u32 Repo registry id (Phase 5.x strict-contract). Allocated by
   * `addRepo()` for workspace repos; reserved top-of-u32 IDs for
   * shared-modules namespace rows (jvm / npm / python / go).
   * Storage layer uses this exclusively; the `repo` string below
   * stays for display + entity-id-hash compatibility but is
   * derivable from `repoId` via `lookupRepoPath()`.
   */
  repoId:     number;
  repo:       string;   // repo root absolute path
  file:       string;   // absolute file path
  startLine:  number;
  endLine:    number;
  /** Raw source text — used as embedding input */
  body:       string;
  /** Embedding vector from configured model; [] if not yet embedded */
  embedding:  number[];
  indexedAt:  string;   // ISO datetime

  // Optional fields populated by specific entity kinds
  isExported?:     boolean;
  isAsync?:        boolean;
  isAbstract?:     boolean;
  signature?:      string;
  hash?:           string;  // content hash for File entities
  rootPath?:       string;  // for Repo entities
  embeddingModel?: string;
  /** True for non-code artifacts (docs, configs, plans). Enables code vs artifact filtering. */
  artifact?:       boolean;
}

export interface Relation {
  kind: RelationKind;
  /** Source entity id */
  from: string;
  /** Target entity id (or raw specifier if unresolved) */
  to:   string;
  /** Whether 'to' is a resolved entity id or a raw import specifier */
  resolved: boolean;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Repo registry
// ---------------------------------------------------------------------------

export interface RegisteredRepo {
  /**
   * Phase 5.x strict-contract discriminator. 'workspace' is the
   * default and the only kind the IDE / IPC surface care about.
   * 'shared-modules' rows are synthetic registry slots for
   * external modules (npm / jvm / python / go); they're filtered
   * out of `repo.list` and are never returned to user-facing UI.
   */
  kind?:        'workspace' | 'shared-modules';
  /**
   * Namespace for `kind === 'shared-modules'` rows; absent
   * otherwise. Possible values: 'jvm' | 'npm' | 'python' | 'go'.
   */
  namespace?:   string;
  path:         string;
  name:         string;
  addedAt:      string;
  lastIndexed?: string;
  status:       'pending' | 'indexing' | 'ready' | 'error';
  errorMsg?:    string;
}

// ---------------------------------------------------------------------------
// Indexer queue
// ---------------------------------------------------------------------------

export type IndexJob =
  | { kind: 'full';    repoPath: string }
  | { kind: 'file';    filePath: string; event: 'create' | 'update' | 'delete' }
  | { kind: 'reembed'; repoPath: string }
  | { kind: 'config-full';    scope: ConfigScope }
  | { kind: 'config-file';    filePath: string; scope: ConfigScope; event: 'create' | 'update' | 'delete' }
  | { kind: 'config-reindex'; scope: ConfigScope }
  /**
   * Post-indexing doc summarisation. Sweeps every doc / section
   * entity in the repo, calls the summariser LLM per entity, writes
   * to the `docSummary` sub-DB. Runs at background priority AFTER
   * a full index completes (fired inline at the end of full-index)
   * OR on demand. Skip-if-unchanged means re-summarise is cheap.
   *
   * See plans/docs-module.md Section 8.
   */
  | { kind: 'doc-summarise-repo'; repoPath: string }
  /**
   * Single-entity doc summarisation. Fired by the file watcher
   * when a doc file is created / updated -- the indexer re-parses,
   * upserts entities, then enqueues one of these per doc entity
   * so the summary follows the body.
   */
  | { kind: 'doc-summarise-entity'; entityId: string };

// ---------------------------------------------------------------------------
// Config management
// ---------------------------------------------------------------------------

export type ConfigScope =
  | { kind: 'global' }
  | { kind: 'project'; repoPath: string };

/**
 * Config namespaces for template / feedback / convention storage.
 *
 * Mirrors the family-level ids from `shared/agent-registry.ts` (minus
 * `'chat'` and `'system'`, which have no user-authored config assets),
 * plus the cross-family `'common'` bucket. Variants (pair / delegate
 * under `'implementation'`; brainstorm sub-categories) are internal
 * to their family and never appear here -- config assets live in the
 * family's namespace directory and may use variant-prefixed filenames
 * (e.g. `pair-analyze.md` under `implementation/`) for internal
 * disambiguation.
 */
export type ConfigNamespace =
  | 'implementation' | 'brainstorm' | 'designer' | 'planner'
  | 'tester' | 'research' | 'debugging' | 'deployment' | 'common';

export type ConfigCategory = 'template' | 'feedback' | 'convention';

export interface ConfigEntry {
  id:          string;
  scope:       ConfigScope;
  namespace:   ConfigNamespace;
  category:    ConfigCategory;
  language:    Language | 'all';
  name:        string;
  filePath:    string;
  body:        string;
  tags:        string[];
  updatedAt:   string;   // ISO datetime
  contentHash: string;
  embedding:   number[];
}

export interface ConfigSearchOpts {
  query: string;
  namespace?: ConfigNamespace | ConfigNamespace[] | undefined;
  category?: ConfigCategory | undefined;
  language?: Language | 'all' | undefined;
  scope?: ConfigScope | undefined;
  limit?: number | undefined;
  boostProject?: boolean | undefined;
}

export interface ConfigSearchResult {
  entry: ConfigEntry;
  score: number;
  boosted: boolean;
}

export interface RecordFeedbackOpts {
  content: string;
  namespace: ConfigNamespace;
  language: Language | 'all';
  repoPath: string;
  provider: LLMProvider;
  agentId?: string | undefined;
}

export interface TemplateQuery {
  namespace: ConfigNamespace;
  language: Language | 'all';
  name: string;
  repoPath?: string | undefined;
}

// ---------------------------------------------------------------------------
// IPC — JSON-RPC over Unix socket
// ---------------------------------------------------------------------------

export interface IpcRequest {
  id:     number;
  method: string;
  params: unknown;
  stream?: boolean | undefined;
}

export interface IpcResponse {
  id:     number;
  result?: unknown;
  error?:  string;
}

export type IpcStreamKind = 'delta' | 'progress' | 'gate' | 'checkpoint' | 'done' | 'error' | 'qna.update' | 'liveStep' | 'todos' | 'handoff' | 'meta-task' | 'assertion-confirm' | 'analyze.result';

export interface IpcStreamMessage {
  id:     number;
  stream: IpcStreamKind;
  data:   unknown;
}

// ---------------------------------------------------------------------------
// Progress events (sc1) — one uniform payload for long daemon operations.
//
// A `ProgressOperation` is a long-running daemon op that emits progress on the
// EXISTING IpcStreamMessage frames (no new wire format): a StageProgressEvent
// rides a `stream: 'progress'` frame; a TokenProgressEvent rides a
// `stream: 'delta'` frame emitted by such an operation. This payload pairing is
// documented, NOT type-enforced on IpcStreamMessage (whose `data` stays
// `unknown`) — IpcStreamKind and IpcStreamMessage above are unchanged.
//
// The closed `ProgressOperation` union is the two stage/token-emitting ops. An
// untruncated sweep of `send: (msg: IpcStreamMessage) => void` producers over
// ALL of src/ finds FIVE sites: analyze-rpc.ts:481 (analyze.run) and
// workflow-rpc.ts:206 (workflow.run) — the two progress operations here — plus
// server.ts:19 (the socket transport), tools/types.ts:56 (per-tool message
// streaming), and todos-rpc.ts:1146 (the todos runner), which are deliberately
// EXCLUDED from ProgressOperation (they are not stage/token progress). All
// fields are readonly and non-optional within their variant.
export type ProgressOperation = 'workflow.run' | 'analyze.run';

export interface StageProgressEvent {
  readonly kind:       'stage';
  readonly operation:  ProgressOperation;
  readonly stageId:    string;
  readonly stageLabel: string;
  readonly index:      number;
  readonly total:      number | null;
}

export interface TokenProgressEvent {
  readonly kind:        'token';
  readonly operation:   ProgressOperation;
  readonly stageId:     string | null;
  readonly tokensDelta: number;
  readonly tokensTotal: number;
}

export type ProgressEvent = StageProgressEvent | TokenProgressEvent;

export interface DaemonStatus {
  uptime:            number;  // seconds
  repos:             RegisteredRepo[];
  queueDepth:        number;
  embeddingsPending: number;
  modelPullStatus?:  'pulling' | 'ready';
  modelPullPct?:     number;
  /** Current LMDB env file size in MiB (`~/.insrc/graph.lmdb`).
   *  Compare to actual data volume to spot when `insrc daemon compact`
   *  would reclaim space (LMDB never returns freed pages to the OS;
   *  large delete bursts inflate the file until compact-and-replace). */
  lmdbFileSizeMb?:   number;
}

// ---------------------------------------------------------------------------
// Plan graph — persistent across sessions
// ---------------------------------------------------------------------------

/** @deprecated Use StepStatus from '../agent/planner/types.js' for new code. */
export type PlanStepStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped';
export type PlanStepComplexity = 'low' | 'medium' | 'high';
/** @deprecated Use PlanStatus from '../agent/planner/types.js' for new code. */
export type PlanStatus = 'active' | 'completed' | 'abandoned';

export interface PlanStep {
  id:          string;
  planId:      string;
  idx:         number;
  title:       string;
  description: string;
  checkpoint:  boolean;
  status:      PlanStepStatus;
  complexity:  PlanStepComplexity;
  fileHint:    string;
  notes:       string;
  dependsOn:   string[];   // step IDs this step depends on
  createdAt:   string;
  updatedAt:   string;
  startedAt?:  string | undefined;
  doneAt?:     string | undefined;
}

export interface Plan {
  id:        string;
  repoPath:  string;
  title:     string;
  status:    PlanStatus;
  steps:     PlanStep[];
  createdAt: string;
  updatedAt: string;
}
