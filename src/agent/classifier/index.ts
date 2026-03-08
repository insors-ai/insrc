import type { ExplicitProvider, Intent, LLMProvider } from '../../shared/types.js';
import { classifyKeywords } from './keywords.js';
import { classifyWithLLM, isAmbiguous } from './llm-fallback.js';
import { parsePrefix } from './prefix.js';
import { applyGraphSignals, type SignalContext } from './signals.js';

// ---------------------------------------------------------------------------
// Classification result
// ---------------------------------------------------------------------------

export interface ClassifyResult {
  /** Resolved intent */
  intent: Intent;
  /** Classification confidence (0–1) */
  confidence: number;
  /** Explicit provider override, if any */
  explicit?: ExplicitProvider | undefined;
  /** Message body with prefixes stripped */
  message: string;
}

export interface ClassifyOpts {
  ctx?: SignalContext;
  /** Local LLM provider for disambiguation. If not provided, LLM fallback is skipped. */
  llmProvider?: LLMProvider | undefined;
}

/**
 * Full classification pipeline.
 *
 * Pipeline order:
 *   1. Parse prefixes — /intent and @provider overrides (always win)
 *   2. Keyword pass — match against KEYWORD_MAP
 *   3. If multiple intents tie → LLM disambiguation (local model, ~100-200ms)
 *   4. Graph signal tie-break — boost/suppress based on session context
 *
 * If the user provided an explicit /intent override, that intent is used
 * regardless of keyword or signal scores.
 */
export async function classify(
  raw: string,
  opts: ClassifyOpts = {},
): Promise<ClassifyResult> {
  const { ctx = {}, llmProvider } = opts;

  // 1. Parse prefixes
  const prefix = parsePrefix(raw);

  // If user explicitly set the intent, skip classification
  if (prefix.intentOverride) {
    return {
      intent: prefix.intentOverride,
      confidence: 1.0,
      explicit: prefix.explicit,
      message: prefix.message,
    };
  }

  // 2. Keyword classification on the stripped message
  let result = classifyKeywords(prefix.message);

  // 3. LLM disambiguation — only when multiple intents tie at the top score
  let { intent, confidence } = result;
  if (isAmbiguous(result.allMatches) && llmProvider) {
    const llmResult = await classifyWithLLM(
      prefix.message,
      result.allMatches,
      llmProvider,
      result.intent,
    );
    intent = llmResult.intent;
    confidence = llmResult.confidence;
  }
  if (confidence < 0.7) {
    const boosted = applyGraphSignals({ intent, confidence }, ctx);
    intent = boosted.intent;
    confidence = boosted.confidence;
  }

  return {
    intent,
    confidence,
    explicit: prefix.explicit,
    message: prefix.message,
  };
}

// Re-export for convenience
export type { SignalContext } from './signals.js';
export type { PrefixResult } from './prefix.js';
export type { KeywordResult } from './keywords.js';
