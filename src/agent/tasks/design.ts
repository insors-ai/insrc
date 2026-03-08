import type { LLMProvider, LLMMessage } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Design Pipeline — two-stage: local sketch -> Claude enhance
//
// Always escalated. Reads [requirements] from L2 if present.
// Output stored in L2 with [design] tag.
// ---------------------------------------------------------------------------

export interface DesignResult {
  sketch: string;
  enhanced: string;
  tag: string; // '[design]'
}

const SKETCH_SYSTEM = `You are a software architect. Given the user's request, any requirements context, and available code context, produce a design sketch.

Output format:
1. **Proposed Structure** — Files, modules, classes, functions to create/modify
2. **Integration Points** — How the new code connects to existing code
3. **Data Flow** — How data moves through the system
4. **Alternatives Considered** — At least 2 alternative approaches
5. **Open Questions** — Design decisions that need input

Be specific. Reference existing file names, entity names, and interfaces.`;

const ENHANCE_SYSTEM = `You are a principal engineer reviewing a design sketch. Your job is to:

1. **Validate against requirements** — Ensure every requirement is addressed
2. **Assess tradeoffs** — Evaluate alternatives, pick one with justification
3. **Identify risks** — What could go wrong? Edge cases? Performance concerns?
4. **Refine interfaces** — Propose concrete function signatures and types
5. **Produce the final design** — A complete, actionable design document

If requirements are provided, cross-reference each requirement to its design solution.
Return the final design document.`;

/**
 * Run the design pipeline.
 *
 * Stage 1: Local model produces design sketch
 * Stage 2: Claude enhances — validates against requirements, assesses tradeoffs
 */
export async function runDesignPipeline(
  userMessage: string,
  codeContext: string,
  requirementsContext: string,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider,
): Promise<DesignResult> {
  // Stage 1 — Local sketch
  const contextParts: string[] = [];
  if (requirementsContext) {
    contextParts.push(`Requirements:\n${requirementsContext}`);
  }
  if (codeContext) {
    contextParts.push(`Code context:\n${codeContext}`);
  }

  const sketchMessages: LLMMessage[] = [
    { role: 'system', content: SKETCH_SYSTEM },
    {
      role: 'user',
      content: contextParts.length > 0
        ? `${contextParts.join('\n\n')}\n\nUser request:\n${userMessage}`
        : `User request:\n${userMessage}`,
    },
  ];

  const sketchResponse = await localProvider.complete(sketchMessages, {
    maxTokens: 2500,
    temperature: 0.3,
  });

  // Stage 2 — Claude enhancement
  const enhanceParts: string[] = [
    `Design sketch to enhance:\n\n${sketchResponse.text}`,
  ];
  if (requirementsContext) {
    enhanceParts.push(`Requirements context:\n${requirementsContext}`);
  }
  enhanceParts.push(`Original user request:\n${userMessage}`);

  const enhanceMessages: LLMMessage[] = [
    { role: 'system', content: ENHANCE_SYSTEM },
    { role: 'user', content: enhanceParts.join('\n\n') },
  ];

  const enhancedResponse = await claudeProvider.complete(enhanceMessages, {
    maxTokens: 4000,
    temperature: 0.2,
  });

  return {
    sketch: sketchResponse.text,
    enhanced: enhancedResponse.text,
    tag: '[design]',
  };
}
