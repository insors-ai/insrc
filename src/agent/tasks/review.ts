import type { LLMProvider, LLMMessage } from '../../shared/types.js';
import { getLogger, toLogFn } from '../../shared/logger.js';
import { mcpCall, searchByFile, searchCallersNhop, searchCallees } from '../tools/mcp-client.js';

// ---------------------------------------------------------------------------
// Review Pipeline — Claude-primary, local context assembly only
//
// From design doc (Phase 9):
//   - Stage 1: Local model assembles context (diffs, entity bodies, neighbour
//     signatures) — zero Claude cost, no draft generation
//   - Stage 2: Claude performs the review (Sonnet by default, @opus for deep)
//   - Output: sections per category with CRITICAL/WARN/NOTE severity
// ---------------------------------------------------------------------------

export interface ReviewResult {
  /** The Claude review response */
  review: string;
  /** Entities included in review context */
  touchedEntities: string[];
  /** Whether @opus was used */
  usedOpus: boolean;
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const REVIEW_SYSTEM = `Review the following code change. Be specific — cite line numbers or entity names.

Review for:
- Correctness: logic errors, off-by-ones, unhandled edge cases
- Security: injection, unvalidated input, exposed internals, over-permissive access
- Performance: unnecessary allocations, N+1 queries, blocking calls in hot paths
- Style: consistency with surrounding code patterns shown
- Completeness: missing error handling, missing tests, undocumented public API

Format: one section per category, skip categories with no findings.
Severity: CRITICAL / WARN / NOTE per finding.`;

// ---------------------------------------------------------------------------
// Context assembly helpers
// ---------------------------------------------------------------------------

interface ReviewContext {
  /** The diff or code under review */
  primaryContent: string;
  /** Full bodies of entities touched by the diff */
  touchedEntities: Array<{ name: string; body: string }>;
  /** Signatures of first-degree callers and callees (not bodies) */
  neighbourSignatures: string[];
}

/**
 * Assemble review context from a diff.
 * Extracts touched files, fetches entity bodies and neighbour signatures.
 * This is the local-only stage — zero Claude cost.
 */
export async function assembleReviewContext(
  diff: string,
  codeContext: string,
): Promise<ReviewContext> {
  const touchedEntities: Array<{ name: string; body: string }> = [];
  const neighbourSignatures: string[] = [];

  // Extract file paths from diff
  const filePaths = extractFilePaths(diff);

  // For each touched file, get entities from graph
  for (const filePath of filePaths) {
    const entities = await searchByFile(filePath);
    for (const entity of entities) {
      touchedEntities.push({
        name: entity.name,
        body: entity.body,
      });

      // Get first-degree caller/callee signatures (not bodies)
      const [callers, callees] = await Promise.all([
        searchCallersNhop(entity.id, 1),
        searchCallees(entity.id),
      ]);

      for (const caller of callers) {
        if (caller.signature) {
          neighbourSignatures.push(caller.signature);
        }
      }
      for (const callee of callees) {
        if (callee.signature) {
          neighbourSignatures.push(callee.signature);
        }
      }
    }
  }

  // Deduplicate signatures
  const uniqueSignatures = [...new Set(neighbourSignatures)];

  return {
    primaryContent: diff || codeContext,
    touchedEntities,
    neighbourSignatures: uniqueSignatures,
  };
}

/**
 * Assemble review context for a specific entity (no diff).
 */
export async function assembleEntityReviewContext(
  entityName: string,
  codeContext: string,
): Promise<ReviewContext> {
  const touchedEntities: Array<{ name: string; body: string }> = [];
  const neighbourSignatures: string[] = [];

  // Search for the entity
  const searchResult = await mcpCall('graph_search', { query: entityName, limit: 1 });
  if (!searchResult.isError) {
    try {
      const entities = JSON.parse(searchResult.content);
      if (Array.isArray(entities) && entities.length > 0) {
        const entity = entities[0];
        touchedEntities.push({ name: entity.name, body: entity.body ?? '' });

        // Get neighbours
        const [callers, callees] = await Promise.all([
          searchCallersNhop(entity.id, 1),
          searchCallees(entity.id),
        ]);

        for (const c of [...callers, ...callees]) {
          if (c.signature) neighbourSignatures.push(c.signature);
        }
      }
    } catch { /* parse error — skip */ }
  }

  return {
    primaryContent: codeContext,
    touchedEntities,
    neighbourSignatures: [...new Set(neighbourSignatures)],
  };
}

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

/**
 * Run the review pipeline.
 *
 * @param userMessage - The user's review request
 * @param codeContext - Assembled code context (from L4)
 * @param claudeProvider - Claude provider for the actual review (Sonnet or Opus)
 * @param isOpus - Whether @opus was used (deep architectural review)
 * @param log - Logger function
 */
export async function runReviewPipeline(
  userMessage: string,
  codeContext: string,
  claudeProvider: LLMProvider,
  isOpus = false,
  log: (msg: string) => void = toLogFn(getLogger('review')),
): Promise<ReviewResult> {
  // Stage 1: Local context assembly (zero Claude cost)
  log('  [review] Stage 1: assembling context...');

  // Detect if there's a diff in the message or context
  const diff = extractDiffFromMessage(userMessage, codeContext);
  let reviewCtx: ReviewContext;

  if (diff) {
    reviewCtx = await assembleReviewContext(diff, codeContext);
  } else {
    // No diff — try to extract entity name from message
    const entityName = extractEntityFromMessage(userMessage);
    if (entityName) {
      reviewCtx = await assembleEntityReviewContext(entityName, codeContext);
    } else {
      reviewCtx = {
        primaryContent: codeContext || userMessage,
        touchedEntities: [],
        neighbourSignatures: [],
      };
    }
  }

  log(`  [review] Context: ${reviewCtx.touchedEntities.length} entities, ${reviewCtx.neighbourSignatures.length} neighbour signatures`);

  // Stage 2: Claude review (Sonnet by default, Opus if @opus prefix)
  log(`  [review] Stage 2: Claude review${isOpus ? ' (Opus — deep architectural)' : ''}...`);

  const reviewContent = buildReviewPrompt(reviewCtx, userMessage, diff);
  const messages: LLMMessage[] = [
    { role: 'system', content: REVIEW_SYSTEM },
    { role: 'user', content: reviewContent },
  ];

  const response = await claudeProvider.complete(messages, {
    maxTokens: isOpus ? 5000 : 3000,
    temperature: 0.1,
  });

  return {
    review: response.text,
    touchedEntities: reviewCtx.touchedEntities.map(e => e.name),
    usedOpus: isOpus,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildReviewPrompt(ctx: ReviewContext, userMessage: string, diff: string | null): string {
  const parts: string[] = [];

  if (diff) {
    parts.push(`Diff:\n\`\`\`diff\n${diff}\n\`\`\``);
  } else {
    parts.push(`Code under review:\n${ctx.primaryContent}`);
  }

  if (ctx.touchedEntities.length > 0) {
    parts.push('\nTouched entities (full bodies):');
    for (const e of ctx.touchedEntities) {
      parts.push(`\n--- ${e.name} ---\n${e.body}`);
    }
  }

  if (ctx.neighbourSignatures.length > 0) {
    parts.push('\nAdjacent signatures (call-site context):');
    parts.push(ctx.neighbourSignatures.join('\n'));
  }

  parts.push(`\nReview request: ${userMessage}`);

  return parts.join('\n');
}

function extractFilePaths(diff: string): string[] {
  const paths: string[] = [];
  const regex = /^\+\+\+ [ab]\/(.+)$/gm;
  let match;
  while ((match = regex.exec(diff)) !== null) {
    if (match[1] && match[1] !== '/dev/null') {
      paths.push(match[1]);
    }
  }
  return paths;
}

function extractDiffFromMessage(message: string, codeContext: string): string | null {
  // Check for diff in message
  const diffMatch = message.match(/```diff\n([\s\S]*?)```/)
    ?? codeContext.match(/```diff\n([\s\S]*?)```/);

  if (diffMatch) return diffMatch[1]!.trim();

  // Check for raw unified diff markers
  if (message.includes('--- a/') && message.includes('+++ b/')) return message;
  if (codeContext.includes('--- a/') && codeContext.includes('+++ b/')) return codeContext;

  return null;
}

function extractEntityFromMessage(message: string): string | null {
  // Try to extract entity name from review request
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
