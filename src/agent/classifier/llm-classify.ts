import type { ClassificationResult, Intent, LLMProvider } from '../../shared/types.js';
import type { SessionSignals } from './signals.js';

// ---------------------------------------------------------------------------
// LLM-based intent classification — PRIMARY classifier
//
// Replaces keyword matching as the first-class classification strategy.
// The local model receives the user message + lightweight session signals
// and returns structured JSON with primary + optional secondary intent,
// confidence scores, snippets, and reasoning.
// ---------------------------------------------------------------------------

const ALL_INTENTS: Intent[] = [
  'implement', 'refactor', 'test', 'debug', 'review',
  'document', 'research', 'graph', 'plan', 'requirements', 'design',
  'deploy', 'release', 'infra',
];

const CLASSIFY_SYSTEM = `You are an intent classifier for a coding assistant.
Given a user message and session context, classify the primary intent.

Intents:
- requirements: user wants to define what needs to be built (specs, user stories, acceptance criteria)
- design: user wants to reason about architecture, API shape, module boundaries, tradeoffs
- plan: user wants an ordered implementation checklist or task breakdown
- implement: user wants code written, a function added, a feature built
- refactor: user wants existing code restructured without changing behaviour
- test: user wants tests written, run, or coverage improved
- debug: user wants to find and fix a bug, crash, or error
- review: user wants a code review, audit, or critique of existing code
- document: user wants documentation, docstrings, READMEs, changelogs, or ADRs
- research: user wants an explanation, trace, or exploration of how something works
- graph: user wants a structural query about code relationships (callers, callees, dependencies — no prose, just data)
- deploy: user wants to deploy, rollout, or push to an environment
- release: user wants to cut a release, bump a version, publish a package, or generate a changelog
- infra: user wants to query infrastructure status, logs, pods, scaling, or resource utilisation

Rules:
- Pick the single best-fit primary intent.
- If the message contains two distinct requests, also pick a secondary intent.
- For each intent, quote the verbatim snippet from the user message that signals it.
- Provide a one-sentence reasoning for each classification.
- Confidence: 0.9+ for clear matches, 0.7-0.9 for reasonable inferences, below 0.7 for guesses.

Respond with ONLY valid JSON matching this schema:
{
  "primary": { "intent": "<intent>", "confidence": <0.0-1.0>, "snippet": "<text>", "reasoning": "<sentence>" },
  "secondary": { "intent": "<intent>", "confidence": <0.0-1.0>, "snippet": "<text>", "reasoning": "<sentence>" } | null
}`;

/**
 * Build the session context block injected into the classification prompt.
 * Keeps it lightweight — small metadata signals, not code context.
 */
function formatSessionContext(signals: SessionSignals): string {
  const parts: string[] = [];

  if (signals.activeFile) {
    parts.push(`Active file: ${signals.activeFile}`);
  }
  if (signals.selectedEntity) {
    parts.push(`Selected entity: ${signals.selectedEntity}`);
  }
  if (signals.l2Tags && signals.l2Tags.length > 0) {
    parts.push(`Session tags: ${signals.l2Tags.join(', ')}`);
  }
  if (signals.activePlanStep) {
    parts.push(`Active plan step: yes (user is mid-plan execution)`);
  }
  if (signals.recentTestFailure) {
    parts.push(`Recent test failure: yes`);
  }
  if (signals.entityCount !== undefined && signals.entityCount > 0) {
    parts.push(`Entities in context: ${signals.entityCount}`);
  }

  return parts.length > 0 ? parts.join('\n') : 'No session context available.';
}

/**
 * Validate and parse the LLM's JSON response into a ClassificationResult.
 * Returns null if the response is unparseable or contains invalid intents.
 */
function parseClassificationResponse(text: string): ClassificationResult | null {
  try {
    // Strip markdown code fences if the model wraps the JSON
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    // Validate primary
    if (!parsed.primary || !isValidIntent(parsed.primary.intent)) {
      return null;
    }
    const primary = {
      intent: parsed.primary.intent as Intent,
      confidence: clampConfidence(parsed.primary.confidence),
      snippet: String(parsed.primary.snippet ?? ''),
      reasoning: String(parsed.primary.reasoning ?? ''),
    };

    // Validate optional secondary
    let secondary: ClassificationResult['secondary'];
    if (parsed.secondary && isValidIntent(parsed.secondary.intent)) {
      secondary = {
        intent: parsed.secondary.intent as Intent,
        confidence: clampConfidence(parsed.secondary.confidence),
        snippet: String(parsed.secondary.snippet ?? ''),
        reasoning: String(parsed.secondary.reasoning ?? ''),
      };
    }

    return { primary, secondary };
  } catch {
    return null;
  }
}

function isValidIntent(value: unknown): value is Intent {
  return typeof value === 'string' && (ALL_INTENTS as string[]).includes(value);
}

function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : 0.5;
  return Math.max(0, Math.min(1, n));
}

/**
 * Classify a user message using the local LLM with structured JSON output.
 *
 * This is the primary classification path. Session signals (active file,
 * selected entity, L2 tags, etc.) are injected directly into the prompt
 * so the model can disambiguate intent from context — not applied as
 * post-hoc boosts.
 *
 * Returns null if the LLM call fails or returns unparseable output.
 */
export async function classifyWithLLM(
  message: string,
  signals: SessionSignals,
  provider: LLMProvider,
): Promise<ClassificationResult | null> {
  const sessionContext = formatSessionContext(signals);

  const classificationInput = {
    message,
    context: sessionContext,
  };

  const messages = [
    { role: 'system' as const, content: CLASSIFY_SYSTEM },
    { role: 'user' as const, content: JSON.stringify(classificationInput) },
  ];

  try {
    const response = await provider.complete(messages, {
      maxTokens: 200,
      temperature: 0,
    });

    return parseClassificationResponse(response.text);
  } catch {
    // Ollama down or provider error — return null to trigger fallback
    return null;
  }
}
