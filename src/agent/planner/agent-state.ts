/**
 * PlannerState — serializable agent state for the planner pipeline.
 *
 * Tracks analysis, plan construction, validation, and serialization
 * across the 8-step agent pipeline.
 */

import type { AgentState } from '../framework/types.js';
import type { Plan } from './types.js';

// ---------------------------------------------------------------------------
// Planner input (from REPL / session context)
// ---------------------------------------------------------------------------

export interface PlannerInput {
  /** The user's planning request (free-form text). */
  message: string;

  /** Pre-fetched code context from the knowledge graph. */
  codeContext: string;

  /** Hint for which plan specialization to use. Auto-detected if omitted. */
  planType?: 'implementation' | 'test' | 'migration' | 'generic' | undefined;

  /** If updating/extending an existing plan rather than creating one from scratch. */
  existingPlan?: Plan | undefined;

  /** Session context for daemon RPC. */
  session: {
    repoPath:     string;
    closureRepos: string[];
  };
}

// ---------------------------------------------------------------------------
// Planner agent state
// ---------------------------------------------------------------------------

export type InferredPlanType = 'implementation' | 'test' | 'migration' | 'generic';

export interface PlannerState extends AgentState {
  // --- Frozen input ---
  input: {
    message:       string;
    codeContext:    string;
    planType:      InferredPlanType;
    existingPlan?: Plan | undefined;
    repoPath:      string;
    closureRepos:  string[];
  };

  // --- Analysis phase ---
  analysis:          string;   // Raw LLM analysis output (JSON)
  inferredPlanType:  InferredPlanType;
  codebaseFindings:  string;   // Formatted entity context from daemon search
  /** Config context loaded from conventions/feedback/templates (loaded once in gather-context). */
  configContext?:    string | undefined;

  // --- Plan construction ---
  draftSteps:        string;   // Raw LLM output for step generation
  plan:              Plan | null;       // The constructed plan
  dependencyIssues:  string[];          // Cycle/validation issues found

  // --- Iteration tracking ---
  editRounds:        Record<string, number>;  // Per-stage edit counters (max 3)

  // --- Output ---
  serializedOutput?: string | undefined;      // Final markdown output
  outputPath?:       string | undefined;      // Artifact path where plan was written
  summary?:          string | undefined;      // L2 carry-forward summary
}
