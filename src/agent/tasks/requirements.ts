import type { LLMProvider, LLMMessage } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Requirements Pipeline — two-stage: local sketch -> Claude enhance
//
// Always escalated. No local-only path.
// Output stored in L2 with [requirements] tag.
// ---------------------------------------------------------------------------

export interface RequirementsResult {
  sketch: string;
  enhanced: string;
  tag: string; // '[requirements]'
}

const SKETCH_SYSTEM = `You are a requirements analyst. Given the user's request and any available code context, produce a structured requirements sketch.

Output format:
1. **Existing Code** — What exists today (files, functions, behaviors)
2. **Gaps** — What is missing or broken
3. **Requirements** — Numbered list of specific, testable requirements
4. **Open Questions** — Uncertainties that need resolution
5. **Constraints** — Technical or business constraints

Be specific. Reference file names, function names, and entity names when possible.`;

const ENHANCE_SYSTEM = `You are a senior software architect reviewing a requirements sketch. Your job is to:

1. **Sharpen** vague requirements into specific, testable statements
2. **Propose answers** to open questions (mark assumptions clearly)
3. **Identify cross-repo impact** — what other modules/repos are affected
4. **Add missing requirements** that the sketch overlooked
5. **Prioritize** — mark each requirement as P0 (must), P1 (should), P2 (nice to have)

Return the enhanced requirements document in the same format as the sketch.`;

/**
 * Run the requirements pipeline.
 *
 * Stage 1: Local model produces requirements sketch
 * Stage 2: Claude enhances — sharpens, answers questions, identifies impact
 */
export async function runRequirementsPipeline(
  userMessage: string,
  codeContext: string,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider,
): Promise<RequirementsResult> {
  // Stage 1 — Local sketch
  const sketchMessages: LLMMessage[] = [
    { role: 'system', content: SKETCH_SYSTEM },
    {
      role: 'user',
      content: codeContext
        ? `Code context:\n${codeContext}\n\nUser request:\n${userMessage}`
        : `User request:\n${userMessage}`,
    },
  ];

  const sketchResponse = await localProvider.complete(sketchMessages, {
    maxTokens: 2000,
    temperature: 0.3,
  });

  // Stage 2 — Claude enhancement
  const enhanceMessages: LLMMessage[] = [
    { role: 'system', content: ENHANCE_SYSTEM },
    {
      role: 'user',
      content: `Requirements sketch to enhance:\n\n${sketchResponse.text}\n\nOriginal user request:\n${userMessage}`,
    },
  ];

  const enhancedResponse = await claudeProvider.complete(enhanceMessages, {
    maxTokens: 3000,
    temperature: 0.2,
  });

  return {
    sketch: sketchResponse.text,
    enhanced: enhancedResponse.text,
    tag: '[requirements]',
  };
}
