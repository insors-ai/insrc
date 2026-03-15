/**
 * DelegateState — serializable agent state for the delegate coding agent.
 *
 * Tracks the execution plan, step results, commit strategy,
 * and overall progress through the autonomous execution.
 */

import type { AgentState } from '../../framework/types.js';
import type { HasProviderOverride } from '../../framework/provider-mention.js';
import type {
  DelegatePlan, StepResult, CommitStrategy, GateLevel,
} from './types.js';
import type { TestRunResult } from '../shared/test-runner-helper.js';

// ---------------------------------------------------------------------------
// Delegate agent state
// ---------------------------------------------------------------------------

export interface DelegateState extends AgentState, HasProviderOverride {
  input: {
    message:       string;
    codeContext:    string;
    designSpec?:   string | undefined;
    repoPath:      string;
    closureRepos:  string[];
  };

  // Plan
  /** The execution plan (populated after planner runs). */
  plan: DelegatePlan | null;

  // Execution tracking
  /** Index of the current step being executed (0-based). */
  currentStepIndex: number;
  /** Results for each completed step. */
  stepResults: StepResult[];

  // Configuration
  /** How aggressively to gate for user input. */
  gateLevel: GateLevel;
  /** When to commit changes. */
  commitStrategy: CommitStrategy;
  /** Whether to run tests after each step. */
  testAfterEach: boolean;
  /** Whether to rollback on step failure. */
  rollbackOnFailure: boolean;

  // Aggregate tracking
  /** All files changed across all steps. */
  filesChanged: string[];
  /** Test run results across all steps. */
  testsRun: TestRunResult[];
  /** Files staged but not yet committed. */
  pendingCommitFiles: string[];
  /** Commit messages for commits made during execution. */
  commits: string[];

  // Iteration tracking
  editRounds: Record<string, number>;
  /** Current focus / feedback for retries. */
  currentFocus?: string | undefined;
}
