import type { LLMProvider, LLMMessage } from '../../shared/types.js';
import {
  parseDiff, applyDiff, splitByFile, extractDiffFromResponse,
  formatDiffForValidation, type FileDiff,
} from './diff-utils.js';
import { enrichValidationContext, assembleStructuredContext } from './graph-context.js';
import { requestReindex } from './reindex.js';
import { planStepUpdate, planNextStep, planGet } from '../tools/mcp-client.js';

// ---------------------------------------------------------------------------
// Refactor Pipeline — two-stage: local writes refactored diff → Claude validates
//
// Same structure as implement but with key differences:
//   - Stage 1: callers at 2 hops (not 1), explicit behaviour-preservation
//   - Stage 2: behaviour-equivalence check instead of correctness check,
//              2-hop call-site compatibility
// ---------------------------------------------------------------------------

export interface RefactorResult {
  /** Whether the refactor was accepted and written to disk */
  accepted: boolean;
  /** The final unified diff text */
  diff: string;
  /** Files written to disk (empty if rejected) */
  filesWritten: string[];
  /** Validation feedback (if CHANGES_NEEDED) */
  feedback: string;
  /** Number of retry rounds used */
  retries: number;
  /** Whether the user needs to decide (retries exhausted) */
  needsUserDecision: boolean;
}

// ---------------------------------------------------------------------------
// System prompts — refactor-specific
// ---------------------------------------------------------------------------

const REFACTOR_SYSTEM = `You are a senior software engineer performing a code refactoring. Given the user's request, code context (including 2-hop callers), and optionally an active plan step, produce a unified diff that refactors the code.

Critical rules for refactoring:
- **Preserve behaviour**: The refactored code MUST produce identical outputs for all inputs
- **Update all call sites**: If you rename or change a function signature, update ALL callers shown in context
- **Multi-file diffs**: Include changes to all affected files (callers, imports, types)
- Output ONLY a valid unified diff (--- a/path, +++ b/path, @@ hunks)
- Use real file paths relative to the repository root
- Include enough context lines (3+) for each hunk to apply cleanly

Example output:
\`\`\`diff
--- a/src/utils/helper.ts
+++ b/src/utils/helper.ts
@@ -5,7 +5,7 @@
-export function getData(id: string): Data {
+export function fetchData(id: string): Promise<Data> {
--- a/src/services/user.ts
+++ b/src/services/user.ts
@@ -12,5 +12,5 @@
-  const data = getData(userId);
+  const data = await fetchData(userId);
\`\`\``;

const REFACTOR_VALIDATE_SYSTEM = `You are a senior code reviewer validating a refactoring diff. Your primary concern is **behaviour equivalence** — the refactored code must produce the same results as before.

Check for:
1. **Behaviour equivalence** — Does the refactored code preserve all existing behaviour?
2. **Call-site compatibility** — Are ALL callers (up to 2 hops) updated correctly?
3. **Type compatibility** — Do type signatures remain compatible or are all callers updated?
4. **Import consistency** — Are all import statements updated for renamed/moved symbols?
5. **Missing updates** — Are there call sites in the context that were NOT updated but should be?

Respond with EXACTLY one of:
- "APPROVED" — if the refactoring preserves behaviour and all call sites are updated
- "CHANGES_NEEDED" followed by a bullet list of specific issues

Focus especially on:
- Callers that were NOT updated but reference renamed/changed symbols
- Subtle behaviour changes (different error handling, different return types, missing await)
- Missing file changes (e.g., index.ts re-exports not updated)`;

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

/**
 * Run the refactor pipeline.
 *
 * @param userMessage - The user's refactoring request
 * @param repoPath - Absolute path to the repo root
 * @param codeContext - Assembled code context (with 2-hop callers)
 * @param planStepContext - Active plan step description (or empty)
 * @param localProvider - Local LLM for Stage 1 (code generation)
 * @param claudeProvider - Claude for Stage 2 (validation) — null skips validation
 * @param log - Logger function
 */
export async function runRefactorPipeline(
  userMessage: string,
  repoPath: string,
  codeContext: string,
  planStepContext: string,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider | null,
  log: (msg: string) => void = console.log,
): Promise<RefactorResult> {
  const MAX_RETRIES = 2;
  let retries = 0;
  let feedback = '';
  let lastDiff = '';

  // Build structured Stage 1 context (2-hop callers for refactor)
  const structured = await assembleStructuredContext(codeContext, repoPath, 2);

  // Build user content for Stage 1
  const userParts: string[] = [];
  if (structured.text) userParts.push(structured.text);
  if (planStepContext) userParts.push(`Active plan step:\n${planStepContext}`);
  userParts.push(`Refactoring request:\n${userMessage}`);

  while (retries <= MAX_RETRIES) {
    // -----------------------------------------------------------------------
    // Stage 1 — Local model generates refactoring diff
    // -----------------------------------------------------------------------
    log(`  [refactor] Stage 1: generating diff (attempt ${retries + 1}/${MAX_RETRIES + 1})...`);

    const stage1Content = [...userParts];
    if (feedback) {
      const fbIdx = stage1Content.findIndex(p => p.startsWith('Previous feedback'));
      if (fbIdx >= 0) stage1Content[fbIdx] = `Previous feedback to address:\n${feedback}`;
      else stage1Content.push(`Previous feedback to address:\n${feedback}`);
    }

    const stage1Messages: LLMMessage[] = [
      { role: 'system', content: REFACTOR_SYSTEM },
      { role: 'user', content: stage1Content.join('\n\n') },
    ];

    const stage1Response = await localProvider.complete(stage1Messages, {
      maxTokens: 5000, // Refactors may touch more files
      temperature: 0.2,
    });

    lastDiff = extractDiffFromResponse(stage1Response.text);

    if (!lastDiff || !lastDiff.includes('---')) {
      log('  [refactor] Stage 1 did not produce a valid diff');
      feedback = 'Your output was not a valid unified diff. Output ONLY a unified diff with --- a/path, +++ b/path, and @@ hunk headers.';
      retries++;
      continue;
    }

    // -----------------------------------------------------------------------
    // Stage 2 — Claude validates refactoring (behaviour equivalence)
    // -----------------------------------------------------------------------
    if (!claudeProvider) {
      log('  [refactor] No Claude provider — skipping validation');
      break;
    }

    log('  [refactor] Stage 2: validating refactoring with Claude...');

    const parsedDiffs = parseDiff(lastDiff);
    const fileRounds = splitByFile(parsedDiffs);

    let allApproved = true;
    const allFeedback: string[] = [];

    for (const round of fileRounds) {
      const roundDiff = reconstructDiff(round);

      // Enrich validation context from the knowledge graph
      const validationCtx = await enrichValidationContext(round, roundDiff);

      const stage2Messages: LLMMessage[] = [
        { role: 'system', content: REFACTOR_VALIDATE_SYSTEM },
        { role: 'user', content: formatDiffForValidation(validationCtx) },
      ];

      const stage2Response = await claudeProvider.complete(stage2Messages, {
        maxTokens: 1500,
        temperature: 0.1,
      });

      const verdict = stage2Response.text.trim();

      if (verdict.startsWith('APPROVED')) {
        continue;
      }

      if (verdict.startsWith('CHANGES_NEEDED')) {
        allApproved = false;
        allFeedback.push(verdict.slice('CHANGES_NEEDED'.length).trim());
      } else {
        allApproved = false;
        allFeedback.push(verdict);
      }
    }

    if (allApproved) {
      log('  [refactor] Stage 2: APPROVED');
      break;
    }

    feedback = allFeedback.join('\n');
    log(`  [refactor] Stage 2: CHANGES_NEEDED (retry ${retries + 1}/${MAX_RETRIES})`);
    retries++;
  }

  // -------------------------------------------------------------------------
  // Outcome handling
  // -------------------------------------------------------------------------

  if (retries > MAX_RETRIES && feedback) {
    log('  [refactor] Retries exhausted — surfacing to user');
    return {
      accepted: false,
      diff: lastDiff,
      filesWritten: [],
      feedback,
      retries,
      needsUserDecision: true,
    };
  }

  // Apply the diff
  log('  [refactor] Applying diff...');
  const parsedDiffs = parseDiff(lastDiff);

  // Dry-run first
  const dryResult = await applyDiff(parsedDiffs, repoPath, true);
  if (!dryResult.success) {
    const errors = [...dryResult.errors.entries()]
      .map(([f, e]) => `  ${f}: ${e}`)
      .join('\n');
    log(`  [refactor] Dry-run failed:\n${errors}`);
    return {
      accepted: false,
      diff: lastDiff,
      filesWritten: [],
      feedback: `Diff could not be applied:\n${errors}`,
      retries,
      needsUserDecision: true,
    };
  }

  // Apply for real
  const applyResult = await applyDiff(parsedDiffs, repoPath, false);

  if (applyResult.success) {
    log(`  [refactor] Written ${applyResult.filesWritten.length} file(s)`);

    // Request re-index (non-blocking)
    void requestReindex(applyResult.filesWritten, log);

    // Update plan step if there's an active plan
    await maybeAdvancePlanStep(repoPath, log);
  }

  return {
    accepted: applyResult.success,
    diff: lastDiff,
    filesWritten: applyResult.filesWritten,
    feedback: applyResult.success ? '' : [...applyResult.errors.values()].join('\n'),
    retries,
    needsUserDecision: false,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reconstruct unified diff text from parsed FileDiff objects. */
function reconstructDiff(diffs: FileDiff[]): string {
  const parts: string[] = [];

  for (const fd of diffs) {
    const oldPrefix = fd.isNew ? '' : 'a/';
    const newPrefix = fd.isDelete ? '' : 'b/';
    parts.push(`--- ${fd.isNew ? '/dev/null' : oldPrefix + fd.oldPath}`);
    parts.push(`+++ ${fd.isDelete ? '/dev/null' : newPrefix + fd.newPath}`);

    for (const hunk of fd.hunks) {
      parts.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
      parts.push(...hunk.lines);
    }
  }

  return parts.join('\n');
}

/** Advance plan step after successful refactoring. */
async function maybeAdvancePlanStep(
  repoPath: string,
  log: (msg: string) => void,
): Promise<void> {
  try {
    const plan = await planGet({ repoPath });
    if (!plan || plan.status !== 'active') return;

    const current = plan.steps.find(s => s.status === 'in_progress')
      ?? plan.steps.find(s => s.status === 'pending');

    if (!current) return;

    if (current.status === 'pending') {
      await planStepUpdate(current.id, 'in_progress', 'auto-started by refactor pipeline');
    }

    const result = await planStepUpdate(current.id, 'done', 'completed by refactor pipeline');
    if (result.ok) {
      log(`  [plan] Step ${current.idx + 1} "${current.title}" → done`);

      const next = await planNextStep(plan.id);
      if (next) {
        log(`  [plan] Next: Step ${next.idx + 1} "${next.title}" (${next.complexity})`);
      } else {
        log('  [plan] All steps complete!');
      }
    }
  } catch {
    // Plan operations are best-effort
  }
}
