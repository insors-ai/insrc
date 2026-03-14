/**
 * Scope detection — distinguish single-item requests (→ Pair agent)
 * from batch-scope requests (→ Delegate agent).
 *
 * Batch indicators: "all", "every", "across all", "each module",
 * "all failing", explicit multi-file lists.
 */

// ---------------------------------------------------------------------------
// Batch scope patterns
// ---------------------------------------------------------------------------

const BATCH_PATTERNS: RegExp[] = [
  /\ball\s+(?:files?|modules?|components?|functions?|classes?|endpoints?|handlers?|tests?|errors?)\b/i,
  /\bevery\s+(?:file|module|component|function|class|endpoint|handler|test|error)\b/i,
  /\bacross\s+all\b/i,
  /\beach\s+(?:file|module|component|function|class)\b/i,
  /\ball\s+(?:failing|broken|deprecated)\b/i,
  /\bthroughout\s+(?:the\s+)?(?:codebase|project|repo)\b/i,
  /\bproject[\s-]wide\b/i,
  /\bcodebase[\s-]wide\b/i,
  // Explicit multi-file lists (3+ comma-separated items)
  /(?:\b\w+\.\w+\b\s*,\s*){2,}\b\w+\.\w+\b/,
];

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export type Scope = 'single' | 'batch';

/**
 * Detect whether a message implies single-item or batch-scope work.
 *
 * Returns 'batch' when batch indicators are present, 'single' otherwise.
 * Used by the REPL to route between Pair and Delegate agents.
 */
export function detectScope(message: string): Scope {
  for (const pattern of BATCH_PATTERNS) {
    if (pattern.test(message)) {
      return 'batch';
    }
  }
  return 'single';
}
