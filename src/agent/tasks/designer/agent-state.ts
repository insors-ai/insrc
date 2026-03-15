/**
 * DesignerState — serializable agent state for the designer pipeline.
 *
 * Maps directly to the RequirementTodo[] lifecycle, with additional
 * fields for cross-step context (compressed history, edit counters).
 */

import type { AgentState } from '../../framework/types.js';
import type {
  DesignTemplate, RequirementTodo, RequirementSketch,
  ParsedRequirement,
} from './types.js';

// ---------------------------------------------------------------------------
// Designer agent state
// ---------------------------------------------------------------------------

export interface DesignerState extends AgentState {
  input: {
    message:          string;
    codeContext:       string;
    template:         DesignTemplate;
    intent:           'requirements' | 'design' | 'review';
    requirementsDoc?: string | undefined;
    repoPath:         string;
    closureRepos:     string[];
  };

  /** Raw extracted requirements text. */
  rawRequirements:       string;
  /** Enhanced requirements text (after Claude review). */
  enhancedRequirements:  string;
  /** Parsed structured requirements. */
  parsedRequirements:    ParsedRequirement[];

  /** Per-requirement todo list (the core state machine). */
  todos:                 RequirementTodo[];
  /** Index into todos for the current requirement being processed. */
  currentTodoIndex:      number;

  /** Edit round counters, keyed by stage (e.g. 'requirements', 'sketch-2', 'detail-3'). */
  editRounds:            Record<string, number>;

  /** Collected sketches from completed requirements. */
  completedSketches:     RequirementSketch[];

  /** Compressed design history for later requirements. */
  compressedHistory:     string;
  /** Config context loaded from conventions/feedback/templates (loaded once in extract-requirements). */
  configContext?:        string | undefined;

  /** Assembled final output. */
  assembledOutput?:      string | undefined;
  /** Final summary for session carry-forward. */
  summary?:              string | undefined;
}
