/**
 * Core LLM provider abstraction.
 * All agent logic operates against these interfaces —
 * never directly against Ollama or Anthropic SDK types.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOpts {
  maxTokens?: number;
  temperature?: number;
}

export interface LLMProvider {
  complete(messages: LLMMessage[], opts?: CompletionOpts): Promise<string>;
  stream(messages: LLMMessage[], opts?: CompletionOpts): AsyncIterable<string>;
}

/**
 * Task routing — what kind of work the agent is being asked to do.
 * Used to select the right provider (local vs Claude).
 */
export type TaskKind =
  | 'complete'      // inline completion, next line
  | 'explain'       // explain function/class/file
  | 'test'          // generate unit tests
  | 'edit'          // single-file edit or refactor
  | 'design'        // architecture, design decision
  | 'review'        // code review, tradeoff analysis
  | 'document'      // generate a document
  | 'graph'         // pure graph query — no LLM needed

export interface Task {
  kind: TaskKind;
  text: string;
  /** If true, always route to Claude regardless of kind */
  explicit?: 'claude';
  /** Number of files the task touches */
  fileCount?: number;
  /** Number of repos the task touches */
  repoCount?: number;
  /** Estimated token count of required context */
  tokenEstimate?: number;
}
