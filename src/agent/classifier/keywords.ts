import type { ClassificationResult, Intent } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Keyword-based intent classification — FALLBACK only
//
// Used when the local LLM (Ollama) is unavailable. This is a degraded path
// that provides basic intent detection from keyword matching. The primary
// classifier is the LLM-based classifier in llm-classify.ts.
//
// From design/agent.html: "If Ollama is not running at classification time,
// the orchestrator cannot classify" — this fallback provides a best-effort
// alternative so the system doesn't fully stop.
// ---------------------------------------------------------------------------

const KEYWORD_MAP: Record<Intent, string[]> = {
  graph:        ['callers of', 'dependents of', 'depends on', 'imports of', 'closure of', 'what uses'],
  implement:    ['implement', 'add support for', 'write a function', 'create a class', 'make', 'build'],
  refactor:     ['refactor', 'rename', 'extract', 'inline', 'split', 'move', 'restructure'],
  test:         ['unit test', 'integration test', 'write test', 'add test', 'test coverage', 'mock'],
  debug:        ['debug', 'fix', 'broken', 'failing', 'crash', 'error', 'not working', 'exception'],
  review:       ['review', 'audit', 'check for', 'is this correct', 'what do you think of'],
  document:     ['document', 'docstring', 'comment', 'readme', 'changelog', 'adr'],
  research:     ['explain', 'how does', 'what is', 'trace', 'find all', 'show me', 'where is'],
  design:       ['design', 'architecture', 'api shape', 'interface', 'tradeoff', 'should i'],
  plan:         ['plan', 'checklist', 'steps to', 'tasks for', 'break down', 'how would i'],
  requirements: ['requirement', 'requirements', 'spec', 'should', 'must', 'user story', 'acceptance criteria'],
  deploy:       ['deploy', 'rollout', 'push to production', 'push to staging', 'ship'],
  release:      ['release', 'version bump', 'cut a release', 'publish', 'tag a version'],
  infra:        ['pod status', 'logs for', 'scale', 'resource', 'cluster', 'kubernetes', 'k8s'],
};

/**
 * Longer phrases get higher base scores — they are more specific.
 * Single-word triggers score lower to avoid false positives.
 */
function phraseScore(phrase: string): number {
  const words = phrase.split(/\s+/).length;
  if (words >= 3) return 0.95;
  if (words === 2) return 0.85;
  return 0.7;
}

/**
 * Check if a phrase matches in the message.
 *
 * Single-word phrases use word-boundary matching to avoid substring
 * false positives (e.g. "implement" matching inside "implementation").
 * Multi-word phrases use simple includes (the phrase itself provides context).
 */
function phraseMatches(lower: string, phrase: string): boolean {
  const words = phrase.split(/\s+/).length;
  if (words === 1) {
    return new RegExp(`\\b${phrase}\\b`).test(lower);
  }
  return lower.includes(phrase);
}

/**
 * Keyword-based fallback classification.
 *
 * Returns a ClassificationResult shaped like the LLM classifier's output,
 * but with lower confidence (capped at 0.7) and synthetic snippet/reasoning
 * fields. This ensures the rest of the pipeline can treat fallback results
 * identically to LLM results.
 *
 * Used ONLY when Ollama is unavailable.
 */
export function classifyByKeywords(message: string): ClassificationResult {
  const lower = message.toLowerCase();

  const intentScores = new Map<Intent, { score: number; phrase: string }>();

  for (const [intent, phrases] of Object.entries(KEYWORD_MAP)) {
    for (const phrase of phrases) {
      if (phraseMatches(lower, phrase)) {
        const score = phraseScore(phrase);

        // "spec" is ambiguous — belongs to requirements unless preceded by
        // test-related qualifiers
        if (phrase === 'spec' && intent === 'requirements') {
          const testQualifiers = /\b(unit|integration|write|add|run|test)\s+spec/;
          if (testQualifiers.test(lower)) continue;
        }

        const prev = intentScores.get(intent as Intent);
        if (!prev || score > prev.score) {
          intentScores.set(intent as Intent, { score, phrase });
        }
      }
    }
  }

  const sorted = [...intentScores.entries()]
    .sort((a, b) => b[1].score - a[1].score);

  if (sorted.length === 0) {
    return {
      primary: {
        intent: 'research',
        confidence: 0.3,
        snippet: '',
        reasoning: 'No keywords matched — defaulting to research (keyword fallback)',
      },
    };
  }

  const [topIntent, topMatch] = sorted[0]!;
  // Cap keyword confidence at 0.7 — this is a degraded path
  const confidence = Math.min(0.7, topMatch.score);

  const result: ClassificationResult = {
    primary: {
      intent: topIntent,
      confidence,
      snippet: topMatch.phrase,
      reasoning: `Keyword match: "${topMatch.phrase}" (keyword fallback — Ollama unavailable)`,
    },
  };

  // If there's a clear second match with a different intent, add as secondary
  if (sorted.length >= 2) {
    const [secondIntent, secondMatch] = sorted[1]!;
    if (secondIntent !== topIntent && secondMatch.score >= 0.7) {
      result.secondary = {
        intent: secondIntent,
        confidence: Math.min(0.6, secondMatch.score),
        snippet: secondMatch.phrase,
        reasoning: `Secondary keyword match: "${secondMatch.phrase}" (keyword fallback)`,
      };
    }
  }

  return result;
}
