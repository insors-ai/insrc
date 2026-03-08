// ---------------------------------------------------------------------------
// Token Budget — per-layer ceilings for the layered context model
//
// From design/agent.html:
//   L1 System ~1K, L2 Summary ~3K, L3a Recent ~4K, L3b Semantic ~4K,
//   L4 Task ~16K, L5 Response ~8K (reserved), L6 Overflow ~28K (elastic)
// ---------------------------------------------------------------------------

/** Approximate chars → tokens ratio (conservative: 1 token ≈ 3 chars for code). */
const CHARS_PER_TOKEN = 3;

/** Per-layer token ceilings. */
export const TOKEN_BUDGET = {
  system:   1_000,   // L1
  summary:  3_000,   // L2
  recent:   4_000,   // L3a
  semantic: 4_000,   // L3b
  code:    16_000,   // L4
  response: 8_000,   // L5 — reserved for output, never consumed by input
  total:   64_000,
} as const;

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
