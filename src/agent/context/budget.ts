// ---------------------------------------------------------------------------
// Token Budget — per-layer ceilings for the layered context model
//
// Supports any context window size. L1 is fixed at 1K.
// Other layers scale proportionally.
// Named shapes ('16k', '32k', '64k', '128k') are convenience aliases.
// ---------------------------------------------------------------------------

/** Approximate chars → tokens ratio (conservative: 1 token ≈ 3 chars for code). */
const CHARS_PER_TOKEN = 3;

// ---------------------------------------------------------------------------
// Budget types
// ---------------------------------------------------------------------------

/** Named convenience shapes. */
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

const SHAPE_TOTALS: Record<BudgetShape, number> = {
  '16k':  16_000,
  '32k':  32_000,
  '64k':  64_000,
  '128k': 128_000,
};

/**
 * Create a token budget for a given context window size.
 *
 * Accepts either a named shape ('32k') or a raw token count (32768).
 * The budget is derived from the context window size:
 *   L1 (system):   fixed 1K
 *   L2 (summary):  ~4.7% of total
 *   L3a (recent):  ~6.3% of total
 *   L3b (semantic): ~6.3% of total
 *   L4 (code):     ~25% of total
 *   L5 (response): ~12.5% of total
 *   L6 (overflow):  remainder (elastic)
 */
export function createBudget(sizeOrShape: number | BudgetShape = 32_768): TokenBudget {
  const total = typeof sizeOrShape === 'number'
    ? sizeOrShape
    : SHAPE_TOTALS[sizeOrShape];

  return {
    system:   1_000,                          // L1: fixed
    summary:  Math.max(500, Math.round(total * 0.047)),   // L2
    recent:   Math.max(500, Math.round(total * 0.063)),   // L3a
    semantic: Math.max(500, Math.round(total * 0.063)),   // L3b
    code:     Math.max(1_000, Math.round(total * 0.25)),  // L4
    response: Math.max(1_000, Math.round(total * 0.125)), // L5
    total,
  };
}

/** Default 16K budget (matches config default for RTX 4060 Ti 16GB). */
export const TOKEN_BUDGET: TokenBudget = createBudget(16_384);

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
