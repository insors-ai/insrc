import type { LLMProvider, LLMMessage } from '../../../shared/types.js';
import type { DesignerInput, DesignerResult } from './types.js';
import { REVIEW_SYSTEM } from './prompts.js';
import {
  assembleReviewContext,
  assembleEntityReviewContext,
} from '../review.js';

// ---------------------------------------------------------------------------
// Designer Review — single-pass code review workflow
//
// The review intent is a separate workflow from the iterative design flow.
// It critiques existing code rather than designing new code. No validation
// gates — single-pass Claude analysis.
// ---------------------------------------------------------------------------

/**
 * Extract diff or entity target from the user's message.
 */
function extractDiffFromMessage(message: string, codeContext: string): string | null {
  const diffMatch = message.match(/```diff\n([\s\S]*?)```/)
    ?? codeContext.match(/```diff\n([\s\S]*?)```/);
  if (diffMatch) return diffMatch[1]!.trim();

  if (message.includes('--- a/') && message.includes('+++ b/')) return message;
  if (codeContext.includes('--- a/') && codeContext.includes('+++ b/')) return codeContext;

  return null;
}

function extractEntityFromMessage(message: string): string | null {
  const patterns = [
    /review\s+(?:the\s+)?(?:function\s+|method\s+|class\s+)?(\S+)/i,
    /look\s+at\s+(\S+)/i,
    /check\s+(\S+)/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[1]!;
  }
  return null;
}

/**
 * Run the designer review workflow.
 * Single-pass Claude analysis — no gates, no iteration, no checkpointing.
 */
export async function runDesignerReview(
  input: DesignerInput,
  claudeProvider: LLMProvider,
  isOpus: boolean,
  log: (msg: string) => void,
): Promise<DesignerResult> {
  log('  [designer/review] Assembling review context...');

  // Detect diff vs entity review
  const diff = extractDiffFromMessage(input.message, input.codeContext);
  let reviewCtx;

  if (diff) {
    reviewCtx = await assembleReviewContext(diff, input.codeContext);
  } else {
    const entityName = extractEntityFromMessage(input.message);
    if (entityName) {
      reviewCtx = await assembleEntityReviewContext(entityName, input.codeContext);
    } else {
      reviewCtx = {
        primaryContent: input.codeContext || input.message,
        touchedEntities: [] as Array<{ name: string; body: string }>,
        neighbourSignatures: [] as string[],
      };
    }
  }

  log(`  [designer/review] Context: ${reviewCtx.touchedEntities.length} entities, ${reviewCtx.neighbourSignatures.length} neighbour signatures`);
  log(`  [designer/review] Running Claude review${isOpus ? ' (Opus — deep architectural)' : ''}...`);

  // Build review prompt
  const parts: string[] = [];
  if (diff) {
    parts.push(`Diff:\n\`\`\`diff\n${diff}\n\`\`\``);
  } else {
    parts.push(`Code under review:\n${reviewCtx.primaryContent}`);
  }

  if (reviewCtx.touchedEntities.length > 0) {
    parts.push('\nTouched entities (full bodies):');
    for (const e of reviewCtx.touchedEntities) {
      parts.push(`\n--- ${e.name} ---\n${e.body}`);
    }
  }

  if (reviewCtx.neighbourSignatures.length > 0) {
    parts.push('\nAdjacent signatures (call-site context):');
    parts.push(reviewCtx.neighbourSignatures.join('\n'));
  }

  parts.push(`\nReview request: ${input.message}`);

  const messages: LLMMessage[] = [
    { role: 'system', content: REVIEW_SYSTEM },
    { role: 'user', content: parts.join('\n') },
  ];

  const response = await claudeProvider.complete(messages, {
    maxTokens: isOpus ? 5000 : 3000,
    temperature: 0.1,
  });

  return {
    kind: 'review',
    output: response.text,
    format: 'markdown',
    templateId: 'review',
    requirements: [],
    sketches: [],
    structured: {
      newEntities: [],
      reusedEntities: [],
      userDecisions: [],
    },
    summary: `Code review completed. ${reviewCtx.touchedEntities.length} entities reviewed.`,
  };
}
