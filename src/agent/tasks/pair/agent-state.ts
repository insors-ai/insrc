/**
 * PairState — serializable agent state for the pair coding agent.
 *
 * Tracks proposals, applied changes, findings (for debug mode),
 * and the fluid working set that builds up during a session.
 */

import type { AgentState } from '../../framework/types.js';
import type { HasProviderOverride } from '../../framework/provider-mention.js';
import type {
  PairMode, DiffEntry, TodoItem, Proposal, Finding, Hypothesis,
} from './types.js';

// ---------------------------------------------------------------------------
// Pair agent state
// ---------------------------------------------------------------------------

export interface PairState extends AgentState, HasProviderOverride {
  input: {
    message:       string;
    codeContext:    string;
    designSpec?:   string | undefined;
    repoPath:      string;
    closureRepos:  string[];
    mode:          PairMode;
  };

  // Mode
  mode: PairMode;

  // Context detection
  /** Whether a design spec was found (input, session tag, artifact store). */
  hasDesignContext: boolean;

  // Working set
  /** Files in scope for this session (built up during analysis). */
  filesInScope: string[];
  /** Changes that have been applied to disk. */
  changesApplied: DiffEntry[];

  // Proposal state
  /** Current pending proposal awaiting user review. */
  pendingProposal: Proposal | null;
  /** Active TODO list for multi-step proposals. */
  activeTodos: TodoItem[] | null;
  /** Index of the current TODO being worked on (0-based). */
  currentTodoIndex: number;

  // Investigation state (debug/explore modes)
  /** Findings from code investigation. */
  findings: Finding[];
  /** Hypotheses for debugging. */
  hypotheses: Hypothesis[];

  // Context management
  /** Config context loaded from conventions/feedback/templates (loaded once in propose). */
  configContext?: string | undefined;
  /** Rolling summary of the conversation. */
  conversationSummary: string;
  /** Current focus area (updated when user expands scope). */
  currentFocus: string;
  /** Investigation summary from the analyze step. */
  investigationSummary: string;

  // Tracking
  /** Number of propose → review iterations. */
  iterationCount: number;
  /** Edit round counters, keyed by stage tag. */
  editRounds: Record<string, number>;
}
