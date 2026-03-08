import type { Intent, LLMProvider } from '../../shared/types.js';
import type { KeywordMatch } from './keywords.js';

// ---------------------------------------------------------------------------
// LLM-based intent disambiguation
//
// Called only when keyword matching detects multiple intents at similar
// confidence. Sends a short classification prompt to the local model
// to pick the primary intent from the candidates.
// ---------------------------------------------------------------------------

const VALID_INTENTS: Set<string> = new Set([
  'implement', 'refactor', 'test', 'debug', 'review',
  'document', 'research', 'graph', 'plan', 'requirements', 'design',
]);

/**
 * Ask the local LLM to pick the primary intent from a set of candidates.
 *
 * Returns the chosen intent and a confidence of 0.85 (LLM classification
 * is confident but not as authoritative as an explicit /intent override).
 *
 * Falls back to the keyword-best intent if the LLM response is unparseable
 * or the provider call fails.
 */
export async function classifyWithLLM(
  message: string,
  candidates: KeywordMatch[],
  provider: LLMProvider,
  keywordBest: Intent,
): Promise<{ intent: Intent; confidence: number }> {
  const intentList = candidates.map(c => c.intent).join(', ');

  const prompt = [
    {
      role: 'system' as const,
      content:
        `You are an intent classifier. Given a user message and a list of candidate intents, ` +
        `reply with ONLY the single most appropriate intent. No explanation, no punctuation — ` +
        `just the intent name.`,
    },
    {
      role: 'user' as const,
      content: `Candidates: ${intentList}\n\nMessage: ${message}`,
    },
  ];

  try {
    const response = await provider.complete(prompt, {
      maxTokens: 16,
      temperature: 0,
    });

    const chosen = response.text.trim().toLowerCase();

    if (VALID_INTENTS.has(chosen) && candidates.some(c => c.intent === chosen)) {
      return { intent: chosen as Intent, confidence: 0.85 };
    }

    // LLM returned something unexpected — fall back
    return { intent: keywordBest, confidence: 0.7 };
  } catch {
    // Provider error (Ollama down, etc.) — fall back silently
    return { intent: keywordBest, confidence: 0.7 };
  }
}

/**
 * Check if keyword results are ambiguous enough to warrant an LLM call.
 *
 * Triggers when 2+ intents matched at the same top score.
 */
export function isAmbiguous(candidates: KeywordMatch[]): boolean {
  if (candidates.length < 2) return false;
  const topScore = candidates[0]!.confidence;
  const tiedCount = candidates.filter(c => c.confidence === topScore).length;
  return tiedCount >= 2;
}
