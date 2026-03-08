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
  | 'design';

export type ExplicitProvider = 'claude' | 'opus' | 'local';

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

export interface AgentConfig {
  ollama: {
    host: string;
  };
  models: {
    local: string;
    tiers: {
      fast: string;
      standard: string;
      powerful: string;
    };
    roles: Record<string, string>;
  };
  keys: {
    anthropic?: string | undefined;
    brave?: string | undefined;
  };
  permissions: {
    mode: 'validate' | 'auto-accept';
  };
}

// ---------------------------------------------------------------------------
// Code Knowledge Graph — entity + relation types
// ---------------------------------------------------------------------------

export type Language = 'python' | 'go' | 'typescript' | 'javascript';

export type EntityKind =
  | 'repo'
  | 'file'
  | 'module'
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable';

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
  /** 1024-dimensional vector from qwen3-embedding:0.6b; [] if not yet embedded */
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

export type PlanStepStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped';
export type PlanStepComplexity = 'low' | 'medium' | 'high';
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
