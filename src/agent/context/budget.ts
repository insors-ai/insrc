// ---------------------------------------------------------------------------
// Token Budget — per-layer ceilings for the layered context model
//
// Supports configurable budget shapes: 16K, 32K, 64K (default), 128K.
// L1 is fixed at 1K. All other layers scale proportionally.
// ---------------------------------------------------------------------------

/** Approximate chars → tokens ratio (conservative: 1 token ≈ 3 chars for code). */
const CHARS_PER_TOKEN = 3;

// ---------------------------------------------------------------------------
// Budget shapes
// ---------------------------------------------------------------------------

export type BudgetShape = '16k' | '32k' | '64k' | '128k';

export interface TokenBudget {
  system:   number;   // L1
  summary:  number;   // L2
  recent:   number;   // L3a
  semantic: number;   // L3b
  code:     number;   // L4
  response: number;   // L5 — reserved for output, never consumed by input
  total:    number;
}

const BUDGET_TOTALS: Record<BudgetShape, number> = {
  '16k':  16_000,
  '32k':  32_000,
  '64k':  64_000,
  '128k': 128_000,
};

/**
 * Create a token budget for a given context window size.
 *
 * L1 (system) is fixed at 1K. Other layers scale proportionally:
 *   L2 summary:  ~4.7% of total
 *   L3a recent:  ~6.3% of total
 *   L3b semantic: ~6.3% of total
 *   L4 code:     ~25% of total
 *   L5 response: ~12.5% of total
 *   L6 overflow:  remainder (elastic)
 */
export function createBudget(shape: BudgetShape = '64k'): TokenBudget {
  const total = BUDGET_TOTALS[shape];
  return {
    system:   1_000,                          // L1: fixed
    summary:  Math.round(total * 0.047),      // L2
    recent:   Math.round(total * 0.063),      // L3a
    semantic: Math.round(total * 0.063),      // L3b
    code:     Math.round(total * 0.25),       // L4
    response: Math.round(total * 0.125),      // L5
    total,
  };
}

/** Default 64K budget — backward compatible with existing code. */
export const TOKEN_BUDGET: TokenBudget = createBudget('64k');

/**
 * Approximate token count for a string.
 * Uses a simple chars/3 heuristic — sufficient for budget enforcement.
 */
export function countTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** A single layer's content with its token count. */
export interface LayerContent {
  text: string;
  tokens: number;
}

/** All layers assembled, ready for LLM prompt construction. */
export interface AssembledContext {
  system:   LayerContent;   // L1
  summary:  LayerContent;   // L2
  recent:   LayerContent;   // L3a
  semantic: LayerContent;   // L3b
  code:     LayerContent;   // L4
  totalTokens: number;
  dropped: DroppedInfo[];
}

export interface DroppedInfo {
  layer: 'code' | 'semantic' | 'recent' | 'summary';
  reason: string;
  tokensDropped: number;
}
