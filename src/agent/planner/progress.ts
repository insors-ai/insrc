// ---------------------------------------------------------------------------
// Planner Module — Progress Tracking
//
// Pure functions for progress summaries and status history.
// ---------------------------------------------------------------------------

import type { Plan, Step, StepStatus, ProgressSummary, StatusTransition } from './types.js';

// ---------------------------------------------------------------------------
// Flatten helpers
// ---------------------------------------------------------------------------

function allStepsFlat<T>(plan: Plan<T>): Step<T>[] {
  const result: Step<T>[] = [];
  for (const s of plan.steps) {
    result.push(s);
    if (s.subSteps) result.push(...s.subSteps);
  }
  return result;
}

// ---------------------------------------------------------------------------
// getProgressSummary
// ---------------------------------------------------------------------------

/**
 * Compute progress summary for a plan.
 * Recursively includes sub-steps.
 * Percentage = done / (total - skipped) * 100.
 */
export function getProgressSummary<T>(plan: Plan<T>): ProgressSummary {
  const flat = allStepsFlat(plan);

  const byStatus: Record<StepStatus, number> = {
    pending: 0, in_progress: 0, done: 0, blocked: 0, failed: 0, skipped: 0,
  };

  for (const step of flat) {
    byStatus[step.status]++;
  }

  const total      = flat.length;
  const countable  = total - byStatus.skipped;
  const pctComplete = countable > 0
    ? Math.round((byStatus.done / countable) * 100)
    : 0;

  return { total, byStatus, pctComplete };
}

// ---------------------------------------------------------------------------
// getStatusHistory
// ---------------------------------------------------------------------------

/**
 * Get status transition history for an entire plan or a specific step.
 * Returns transitions sorted by timestamp (ascending).
 */
export function getStatusHistory<T>(
  plan: Plan<T>,
  stepId?: string | undefined,
): StatusTransition[] {
  const flat = allStepsFlat(plan);
  const transitions: StatusTransition[] = [];

  for (const step of flat) {
    if (stepId && step.id !== stepId) continue;
    if (step.statusHistory) transitions.push(...step.statusHistory);
  }

  return transitions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ---------------------------------------------------------------------------
// recordStatusTransition
// ---------------------------------------------------------------------------

/**
 * Append a status transition to a step's history.
 * Mutates the step in place (called internally by engine).
 */
export function recordStatusTransition<T>(
  step: Step<T>,
  oldStatus: StepStatus,
  newStatus: StepStatus,
  reason?: string | undefined,
): void {
  const transition: StatusTransition = {
    stepId:    step.id,
    oldStatus,
    newStatus,
    timestamp: new Date().toISOString(),
    reason,
  };

  if (!step.statusHistory) step.statusHistory = [];
  step.statusHistory.push(transition);
}
