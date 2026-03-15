/**
 * Directive detection — identifies user messages that contain persistent
 * preferences, rules, or conventions.
 *
 * Directives survive all compaction levels. Examples:
 *   "never use claude opus as a model"
 *   "always use .js extensions in imports"
 *   "prefer vitest over jest"
 */

// ---------------------------------------------------------------------------
// Directive patterns with weighted scoring
// ---------------------------------------------------------------------------

interface DirectivePattern {
  pattern: RegExp;
  weight: number;
}

const DIRECTIVE_PATTERNS: DirectivePattern[] = [
  // Strong signals — direct rules
  { pattern: /\b(always|never|don't|do not|avoid|prefer)\b/i, weight: 1.0 },
  { pattern: /\buse\s+\S+\s+instead\s+of\b/i, weight: 1.2 },
  { pattern: /\b(from now on|going forward|in the future|remember)\b/i, weight: 0.9 },

  // Medium signals — conventions
  { pattern: /\b(rule|convention|standard|must not|should not)\b/i, weight: 0.7 },
  { pattern: /\b(requirement|guideline|policy)\b/i, weight: 0.5 },

  // Weak signals — general preferences
  { pattern: /\b(I like|I want|I need you to|make sure)\b/i, weight: 0.4 },
];

/** Minimum cumulative score to classify as a directive. */
const DIRECTIVE_THRESHOLD = 0.9;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if a user message contains a directive (persistent preference/rule).
 * Uses weighted pattern matching — multiple weak signals can trigger.
 */
export function isDirective(userMessage: string): boolean {
  return scoreDirective(userMessage) >= DIRECTIVE_THRESHOLD;
}

/**
 * Score a message for directive likelihood (0 = no signal, higher = more directive-like).
 */
export function scoreDirective(userMessage: string): number {
  let score = 0;
  for (const { pattern, weight } of DIRECTIVE_PATTERNS) {
    if (pattern.test(userMessage)) {
      score += weight;
    }
  }
  return score;
}

/**
 * Extract the core rule from a user message, stripping conversational fluff.
 * Returns a concise directive string suitable for long-term storage.
 *
 * If the assistant acknowledged the rule, include the acknowledgment summary.
 */
export function extractDirectiveText(
  userMessage: string,
  assistantResponse: string,
): string {
  // Split message into sentences and keep directive-matching ones
  const sentences = userMessage.split(/[.!?\n]+/).filter(s => s.trim().length > 5);
  const directiveSentences = sentences.filter(s => {
    let sentenceScore = 0;
    for (const { pattern, weight } of DIRECTIVE_PATTERNS) {
      if (pattern.test(s)) sentenceScore += weight;
    }
    return sentenceScore >= 0.5;
  });

  const directive = directiveSentences.length > 0
    ? directiveSentences.map(s => s.trim()).join('. ')
    : userMessage.trim();

  // Truncate to reasonable size
  const trimmed = directive.length > 500 ? directive.slice(0, 497) + '...' : directive;

  // If assistant acknowledged, append a brief note
  const ackMatch = assistantResponse.match(/^(understood|noted|ok|got it|i'll|sure|will do)[^.!?\n]*/i);
  if (ackMatch) {
    return `${trimmed} [Acknowledged: ${ackMatch[0]!.trim().slice(0, 100)}]`;
  }

  return trimmed;
}
