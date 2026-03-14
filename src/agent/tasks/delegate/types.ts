/**
 * Types for the Delegate coding agent — plan-driven autonomous execution.
 *
 * Delegate invokes the planner as a sub-agent, gets user approval,
 * then executes steps autonomously with configurable gating.
 */

import type { ProviderOverride } from '../../framework/provider-mention.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** Input from the REPL to start a delegate coding session. */
export interface DelegateInput {
  message: string;
  codeContext: string;
  designSpec?: string | undefined;
  session: {
    repoPath: string;
    closureRepos: string[];
  };
}

// ---------------------------------------------------------------------------
// Plan types
// ---------------------------------------------------------------------------

/** The delegate's execution plan (derived from planner output). */
export interface DelegatePlan {
  title: string;
  steps: DelegatePlanStep[];
  commitPoints: number[];
}

/** A single step in the delegate plan. */
export interface DelegatePlanStep {
  index: number;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped';
  commitAfter: boolean;
  result?: StepResult | undefined;
}

/** Result of executing a single plan step. */
export interface StepResult {
  status: 'success' | 'failed' | 'skipped';
  diff?: string | undefined;
  filesChanged: string[];
  testResult?: { passed: boolean; output: string } | undefined;
  error?: string | undefined;
}

// ---------------------------------------------------------------------------
// Commit strategy
// ---------------------------------------------------------------------------

export type CommitStrategy =
  | { kind: 'per-step' }
  | { kind: 'at-end' }
  | { kind: 'at-points'; points: number[] };

// ---------------------------------------------------------------------------
// Gate level
// ---------------------------------------------------------------------------

/** How aggressively the agent gates for user input during execution. */
export type GateLevel = 'minimal' | 'normal' | 'cautious';

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** Final output of the delegate agent. */
export interface DelegateResult {
  kind: 'delegate-execution';
  plan: DelegatePlan;
  stepResults: StepResult[];
  filesChanged: string[];
  summary: string;
  commits: string[];
}

// ---------------------------------------------------------------------------
// Re-export shared types
// ---------------------------------------------------------------------------

export type { ProviderOverride };
