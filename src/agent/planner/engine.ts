// ---------------------------------------------------------------------------
// Planner Module — Engine
//
// Pure functions for status transitions, dependency validation, cycle
// detection, and plan status aggregation. No DB dependency.
// ---------------------------------------------------------------------------

import type { Plan, Step, StepStatus, PlanStatus, StatusTransition } from './types.js';
import { detectCycle } from './utils.js';

// ---------------------------------------------------------------------------
// Valid status transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<StepStatus, StepStatus[]> = {
  pending:     ['in_progress', 'skipped'],
  in_progress: ['done', 'failed', 'skipped', 'pending'],  // pending = crash recovery
  done:        ['pending'],                                 // undo
  blocked:     ['pending', 'skipped'],                      // unblock or skip
  failed:      ['in_progress', 'skipped'],                  // retry or skip
  skipped:     ['pending'],                                 // revert skip
};

function isValidTransition(from: StepStatus, to: StepStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Step lookup helper
// ---------------------------------------------------------------------------

function findStep<T>(plan: Plan<T>, stepId: string): Step<T> | undefined {
  for (const s of plan.steps) {
    if (s.id === stepId) return s;
    if (s.subSteps) {
      for (const sub of s.subSteps) {
        if (sub.id === stepId) return sub;
      }
    }
  }
  return undefined;
}

function allStepsFlat<T>(plan: Plan<T>): Step<T>[] {
  const result: Step<T>[] = [];
  for (const s of plan.steps) {
    result.push(s);
    if (s.subSteps) result.push(...s.subSteps);
  }
  return result;
}

// ---------------------------------------------------------------------------
// updateStepStatus — immutable plan update
// ---------------------------------------------------------------------------

/**
 * Update a step's status with validation and history recording.
 * Returns a new Plan with the updated step (immutable).
 *
 * @throws Error if step not found, transition invalid, or deps not met.
 */
export function updateStepStatus<T>(
  plan: Plan<T>,
  stepId: string,
  newStatus: StepStatus,
  reason?: string | undefined,
): Plan<T> {
  const step = findStep(plan, stepId);
  if (!step) throw new Error(`step not found: ${stepId}`);

  if (!isValidTransition(step.status, newStatus)) {
    throw new Error(`invalid transition: ${step.status} -> ${newStatus}`);
  }

  // Block "done" if dependencies aren't met
  if (newStatus === 'done' && !validateDependencies(plan, stepId)) {
    throw new Error(`cannot mark done: unmet dependencies for step ${stepId}`);
  }

  const now = new Date().toISOString();

  const transition: StatusTransition = {
    stepId,
    oldStatus: step.status,
    newStatus,
    timestamp: now,
    reason,
  };

  // Build updated step
  const updatedStep: Step<T> = {
    ...step,
    status: newStatus,
    metadata: { ...step.metadata, updatedAt: now },
    statusHistory: [...(step.statusHistory ?? []), transition],
  };

  // Rebuild plan with updated step
  const updatedSteps = plan.steps.map(s => {
    if (s.id === stepId) return updatedStep;
    if (s.subSteps) {
      const updatedSubs = s.subSteps.map(sub =>
        sub.id === stepId ? updatedStep : sub,
      );
      if (updatedSubs !== s.subSteps) return { ...s, subSteps: updatedSubs };
    }
    return s;
  });

  const updatedPlan: Plan<T> = {
    ...plan,
    steps: updatedSteps,
    metadata: { ...plan.metadata, updatedAt: now },
  };

  // Recompute plan status
  updatedPlan.status = computePlanStatus(updatedPlan);

  return updatedPlan;
}

// ---------------------------------------------------------------------------
// validateDependencies
// ---------------------------------------------------------------------------

/**
 * Check whether all dependencies of a step are in a terminal state
 * (done or skipped). Returns true if the step can proceed to "done".
 */
export function validateDependencies<T>(plan: Plan<T>, stepId: string): boolean {
  const step = findStep(plan, stepId);
  if (!step) return false;

  const flat = allStepsFlat(plan);
  for (const depId of step.dependencies) {
    const dep = flat.find(s => s.id === depId);
    if (!dep) return false; // missing dep = not met
    if (dep.status !== 'done' && dep.status !== 'skipped') return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// detectCycles — delegates to utils
// ---------------------------------------------------------------------------

/**
 * Detect circular dependencies in a plan's step graph.
 * @returns The cycle path (step IDs) if a cycle exists, or null.
 */
export function detectCycles<T>(plan: Plan<T>): string[] | null {
  return detectCycle(allStepsFlat(plan));
}

// ---------------------------------------------------------------------------
// detectBlockedSteps
// ---------------------------------------------------------------------------

/**
 * Find steps whose dependencies are in a failed or blocked state,
 * meaning they cannot progress without intervention.
 */
export function detectBlockedSteps<T>(
  plan: Plan<T>,
): Array<{ id: string; reasons: string[] }> {
  const flat = allStepsFlat(plan);
  const results: Array<{ id: string; reasons: string[] }> = [];

  for (const step of flat) {
    if (step.status === 'done' || step.status === 'skipped') continue;

    const reasons: string[] = [];
    for (const depId of step.dependencies) {
      const dep = flat.find(s => s.id === depId);
      if (!dep) {
        reasons.push(`dependency ${depId} not found`);
      } else if (dep.status === 'failed') {
        reasons.push(`dependency "${dep.title}" failed`);
      } else if (dep.status === 'blocked') {
        reasons.push(`dependency "${dep.title}" is blocked`);
      }
    }

    if (reasons.length > 0) results.push({ id: step.id, reasons });
  }

  return results;
}

// ---------------------------------------------------------------------------
// computePlanStatus — derive plan status from step aggregate
// ---------------------------------------------------------------------------

/**
 * Derive the plan-level status from aggregate step statuses.
 *
 * Rules:
 * - If any step is blocked → 'blocked'
 * - If all steps are done/skipped → 'completed'
 * - Otherwise → 'active'
 *
 * 'abandoned' is never derived — it's set explicitly.
 */
export function computePlanStatus<T>(plan: Plan<T>): PlanStatus {
  if (plan.status === 'abandoned') return 'abandoned';

  const flat = allStepsFlat(plan);
  if (flat.length === 0) return 'active';

  let allTerminal = true;
  for (const step of flat) {
    if (step.status === 'blocked') return 'blocked';
    if (step.status !== 'done' && step.status !== 'skipped') {
      allTerminal = false;
    }
  }

  return allTerminal ? 'completed' : 'active';
}
