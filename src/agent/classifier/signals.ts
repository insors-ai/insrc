import type { Intent } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Graph signal context — passed from session / editor state
// ---------------------------------------------------------------------------

export interface SignalContext {
  /** File currently open in the editor */
  activeFile?: string | undefined;
  /** Entity name selected / highlighted */
  selectedEntity?: string | undefined;
  /** Number of entities resolved in L4 context for this turn */
  entityCount?: number | undefined;
  /** Whether an active plan step is in `in_progress` state */
  activePlanStep?: boolean | undefined;
  /** Whether a recent test failure occurred in this session */
  recentTestFailure?: boolean | undefined;
}

export interface ScoredIntent {
  intent: Intent;
  confidence: number;
}

/**
 * Apply graph-context signals to break ties between candidate intents.
 *
 * Called when the keyword classifier produces confidence < 0.7 or when
 * two intents score similarly. Signals boost or suppress intents based
 * on session state.
 *
 * Design doc signals:
 *   - Active file → boost implement, refactor, debug
 *   - Selected entity → boost research, graph
 *   - Entity count > 3 → boost design, plan over implement
 *   - Active plan step → boost implement
 *   - Recent test failure → boost debug, test
 */
export function applyGraphSignals(
  candidate: ScoredIntent,
  ctx: SignalContext,
): ScoredIntent {
  let { intent, confidence } = candidate;

  const boosts: Partial<Record<Intent, number>> = {};

  // Active file in editor → file-scoped work likely
  if (ctx.activeFile) {
    boosts.implement  = (boosts.implement  ?? 0) + 0.1;
    boosts.refactor   = (boosts.refactor   ?? 0) + 0.1;
    boosts.debug      = (boosts.debug      ?? 0) + 0.1;
  }

  // Selected entity → user is asking about something specific
  if (ctx.selectedEntity) {
    boosts.research = (boosts.research ?? 0) + 0.15;
    boosts.graph    = (boosts.graph    ?? 0) + 0.15;
  }

  // Many entities resolved → broader scope, likely design/plan
  if (ctx.entityCount !== undefined && ctx.entityCount > 3) {
    boosts.design = (boosts.design ?? 0) + 0.1;
    boosts.plan   = (boosts.plan   ?? 0) + 0.1;
    // Suppress implement — too many entities for a single impl task
    boosts.implement = (boosts.implement ?? 0) - 0.1;
  }

  // Active plan step → user is likely continuing planned work
  if (ctx.activePlanStep) {
    boosts.implement = (boosts.implement ?? 0) + 0.15;
  }

  // Recent test failure → debugging or fixing tests
  if (ctx.recentTestFailure) {
    boosts.debug = (boosts.debug ?? 0) + 0.15;
    boosts.test  = (boosts.test  ?? 0) + 0.1;
  }

  // Apply boost to the current candidate
  const boost = boosts[intent] ?? 0;
  confidence = Math.min(1.0, confidence + boost);

  return { intent, confidence };
}
