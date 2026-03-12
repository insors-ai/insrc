import type { ClassificationResult, ExplicitProvider, Intent, LLMProvider } from '../../shared/types.js';
import { classifyByKeywords } from './keywords.js';
import { classifyWithLLM } from './llm-classify.js';
import { parsePrefix } from './prefix.js';
import type { SessionSignals } from './signals.js';

// ---------------------------------------------------------------------------
// Classification result — unified output for the rest of the pipeline
// ---------------------------------------------------------------------------

export interface ClassifyResult {
  /** Resolved primary intent (convenience accessor for classification.primary.intent) */
  intent: Intent;
  /** Primary confidence (convenience accessor for classification.primary.confidence) */
  confidence: number;
  /** Full structured classification (primary + optional secondary) */
  classification: ClassificationResult;
  /** Explicit provider override, if any */
  explicit?: ExplicitProvider | undefined;
  /** Message body with prefixes stripped */
  message: string;
  /** Whether the LLM classifier was used (false = keyword fallback) */
  usedLLM: boolean;
}

export interface ClassifyOpts {
  /** Session signals for the LLM classifier (active file, selected entity, etc.) */
  signals?: SessionSignals;
  /** Local LLM provider for classification. If not provided, falls back to keywords. */
  llmProvider?: LLMProvider | undefined;
}

/**
 * Full classification pipeline.
 *
 * Pipeline order (from design/agent.html):
 *   1. Parse prefixes — /intent and @provider overrides (always win)
 *   2. LLM classification — local model with structured JSON output (primary path)
 *   3. Keyword fallback — only when LLM is unavailable or returns unparseable output
 *
 * If the user provided an explicit /intent override, that intent is used
 * regardless of LLM or keyword scores. The LLM is not called at all.
 */
export async function classify(
  raw: string,
  opts: ClassifyOpts = {},
): Promise<ClassifyResult> {
  const { signals = {}, llmProvider } = opts;

  // 1. Parse prefixes
  const prefix = parsePrefix(raw);

  // If user explicitly set the intent, skip classification entirely
  if (prefix.intentOverride) {
    const classification: ClassificationResult = {
      primary: {
        intent: prefix.intentOverride,
        confidence: 1.0,
        snippet: '',
        reasoning: 'Explicit /intent override',
      },
    };
    return {
      intent: prefix.intentOverride,
      confidence: 1.0,
      classification,
      explicit: prefix.explicit,
      message: prefix.message,
      usedLLM: false,
    };
  }

  // 2. LLM classification — primary path
  if (llmProvider) {
    const llmResult = await classifyWithLLM(prefix.message, signals, llmProvider);
    if (llmResult) {
      return {
        intent: llmResult.primary.intent,
        confidence: llmResult.primary.confidence,
        classification: llmResult,
        explicit: prefix.explicit,
        message: prefix.message,
        usedLLM: true,
      };
    }
    // LLM call failed (Ollama down, unparseable response) — fall through to keywords
  }

  // 3. Keyword fallback — degraded path
  // Design: "If Ollama is not running at classification time, the orchestrator
  // cannot classify." We provide best-effort keyword matching with capped
  // confidence so callers know this is a degraded result.
  const keywordResult = classifyByKeywords(prefix.message);

  return {
    intent: keywordResult.primary.intent,
    confidence: keywordResult.primary.confidence,
    classification: keywordResult,
    explicit: prefix.explicit,
    message: prefix.message,
    usedLLM: false,
  };
}

// Re-exports
export type { SessionSignals } from './signals.js';
export type { PrefixResult } from './prefix.js';
export type { ClassificationResult } from '../../shared/types.js';
