/**
 * Core LLM provider abstraction.
 * All agent logic operates against these interfaces —
 * never directly against Ollama or Anthropic SDK types.
 */

/** A single content block within a multimodal message. */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; data: string }   // base64-encoded
  | { type: 'document'; mediaType: string; data: string }; // base64-encoded PDF

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
}

export interface LLMResponse {
  text: string;
  toolCalls?: ToolCall[] | undefined;
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  /** Token usage from the API response (if available). */
  usage?: { inputTokens: number; outputTokens: number } | undefined;
}

export interface CompletionOpts {
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDefinition[] | undefined;
  /** If provided, text tokens are streamed via this callback during complete(). */
  onToken?: ((token: string) => void) | undefined;
}

export interface LLMProvider {
  complete(messages: LLMMessage[], opts?: CompletionOpts): Promise<LLMResponse>;
  stream(messages: LLMMessage[], opts?: CompletionOpts): AsyncIterable<string>;
  /** Embed text into a vector. Returns empty array if not supported. */
  embed(text: string): Promise<number[]>;
  readonly supportsTools: boolean;
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
  | 'graph'
  | 'plan'
  | 'requirements'
  | 'design'
  | 'deploy'
  | 'release'
  | 'infra';

export type ExplicitProvider = 'claude' | 'opus' | 'local';

// ---------------------------------------------------------------------------
// Agent personas
// ---------------------------------------------------------------------------

export type PersonaName = 'designer' | 'planner' | 'developer' | 'tester' | 'deployer';

/** Classification result from the LLM-based intent classifier. */
export interface ClassificationResult {
  /** Primary intent — the main thing the user wants */
  primary: {
    intent: Intent;
    confidence: number;
    /** Verbatim text from the user message that signals this intent */
    snippet: string;
    /** One sentence explaining the classification */
    reasoning: string;
  };
  /** Secondary intent, if the message contains a compound request */
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

/** Provider binding for a single LLM operation within an agent. */
export interface StepBinding {
  provider: 'local' | 'claude';
  /** Explicit model name override (e.g. 'claude-sonnet-4-6', 'qwen3-coder:latest'). */
  model?: string | undefined;
  /** Claude tier — ignored for local provider. */
  tier?: 'fast' | 'standard' | 'powerful' | undefined;
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
}

export interface AgentConfig {
  ollama: {
    host: string;
  };
  models: {
    local: string;
    embedding: string;
    embeddingDim: number;
    tiers: {
      fast: string;
      standard: string;
      powerful: string;
    };
    roles: Record<string, string>;
    /** Per-agent step-level provider overrides. */
    agents?: AgentProviderConfigs | undefined;
    /** Override which intents default to Claude vs local. */
    intentDefaults?: Partial<Record<Intent, 'local' | 'claude'>> | undefined;
    /** Context window sizes (tokens). Auto-detected from Ollama if not set. */
    context: ModelContextConfig;
  };
  keys: {
    anthropic?: string | undefined;
    brave?: string | undefined;
  };
  permissions: {
    mode: 'validate' | 'auto-accept';
  };
}

/** Context window and output limits per provider. */
export interface ModelContextConfig {
  /** Local model (Ollama) context window in tokens. Default: 131072 (128K). */
  local: number;
  /** Local model max output tokens per call. Default: 8192. */
  localMaxOutput: number;
  /** Claude context window in tokens. Default: 200000 (200K). */
  claude: number;
  /** Claude max output tokens per call. Default: 8192. */
  claudeMaxOutput: number;
  /** Chars-per-token ratio for budget estimation. Default: 3. */
  charsPerToken: number;
}

// ---------------------------------------------------------------------------
// Code Knowledge Graph — entity + relation types
// ---------------------------------------------------------------------------

export type Language = 'python' | 'go' | 'typescript' | 'javascript'
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
  | { kind: 'reembed'; repoPath: string };

// ---------------------------------------------------------------------------
// IPC — JSON-RPC over Unix socket
// ---------------------------------------------------------------------------

export interface IpcRequest {
  id:     number;
  method: string;
  params: unknown;
}

export interface IpcResponse {
  id:     number;
  result?: unknown;
  error?:  string;
}

export interface DaemonStatus {
  uptime:            number;  // seconds
  repos:             RegisteredRepo[];
  queueDepth:        number;
  embeddingsPending: number;
  modelPullStatus?:  'pulling' | 'ready';
  modelPullPct?:     number;
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
