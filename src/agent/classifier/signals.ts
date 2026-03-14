// ---------------------------------------------------------------------------
// Session signals — lightweight metadata injected into LLM classification
//
// These signals are passed into the LLM classification prompt so the model
// can disambiguate intent from session context. They replace the old
// post-hoc boost/suppress approach — the LLM sees everything in one shot.
// ---------------------------------------------------------------------------

/**
 * Lightweight session metadata for intent classification.
 *
 * These are NOT code context — they are small signals that help the LLM
 * disambiguate. Code context is assembled AFTER classification.
 */
export interface SessionSignals {
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
  /** L2 tags present in session (e.g. ['requirements', 'design']) */
  l2Tags?: string[] | undefined;
}

