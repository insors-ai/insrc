import type { Intent } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Keyword map — high-precision trigger phrases per intent
// From design/agent.html, intent classification section.
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

export interface KeywordMatch {
  intent: Intent;
  confidence: number;
}

export interface KeywordResult {
  intent: Intent;
  confidence: number;
  /** All intents that matched (for ambiguity detection) */
  allMatches: KeywordMatch[];
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
    // Word-boundary match for single-word triggers
    return new RegExp(`\\b${phrase}\\b`).test(lower);
  }
  return lower.includes(phrase);
}

/**
 * Classify a message by matching against the keyword map.
 *
 * Returns the highest-scoring intent match. If no keywords match,
 * returns `research` as the fallback with low confidence.
 */
export function classifyKeywords(message: string): KeywordResult {
  const lower = message.toLowerCase();

  // Track the best score per intent
  const intentScores = new Map<Intent, number>();

  for (const [intent, phrases] of Object.entries(KEYWORD_MAP)) {
    for (const phrase of phrases) {
      if (phraseMatches(lower, phrase)) {
        const score = phraseScore(phrase);

        // "spec" is ambiguous — belongs to requirements unless preceded by
        // test-related qualifiers
        if (phrase === 'spec' && intent === 'requirements') {
          const testQualifiers = /\b(unit|integration|write|add|run|test)\s+spec/;
          if (testQualifiers.test(lower)) continue; // skip — let test intent win
        }

        const prev = intentScores.get(intent as Intent) ?? 0;
        if (score > prev) {
          intentScores.set(intent as Intent, score);
        }
      }
    }
  }

  const allMatches: KeywordMatch[] = [...intentScores.entries()]
    .map(([intent, confidence]) => ({ intent, confidence }))
    .sort((a, b) => b.confidence - a.confidence);

  if (allMatches.length === 0) {
    return { intent: 'research', confidence: 0.3, allMatches: [] };
  }

  const top = allMatches[0]!;
  return {
    intent: top.intent,
    confidence: top.confidence,
    allMatches,
  };
}
