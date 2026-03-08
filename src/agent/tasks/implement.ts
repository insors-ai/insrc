import type { LLMProvider, LLMMessage } from '../../shared/types.js';
import {
  parseDiff, applyDiff, splitByFile, extractDiffFromResponse,
  formatDiffForValidation, type FileDiff,
} from './diff-utils.js';
import { enrichValidationContext, assembleStructuredContext } from './graph-context.js';
import { requestReindex } from './reindex.js';
import { planStepUpdate, planNextStep, planGet } from '../tools/mcp-client.js';

// ---------------------------------------------------------------------------
// Implement Pipeline — two-stage: local writes code diff → Claude validates
//
// From design doc (Phase 7):
//   Stage 1: Local model produces unified diff
//   Stage 2: Claude validates — APPROVED or CHANGES_NEEDED
//   Retry: up to 2 retries on CHANGES_NEEDED
//   Outcome: write to disk, plan_step_update(done), enqueue re-index
// ---------------------------------------------------------------------------

export interface ImplementResult {
  /** Whether the implementation was accepted and written to disk */
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
// System prompts
// ---------------------------------------------------------------------------

const IMPLEMENT_SYSTEM = `You are a senior software engineer. Given the user's request, code context, and optionally an active plan step, produce a unified diff that implements the requested change.

Rules:
- Output ONLY a valid unified diff (--- a/path, +++ b/path, @@ hunks)
- Use real file paths relative to the repository root
- Include enough context lines (3+) for each hunk to apply cleanly
- Do not include explanatory text outside the diff
- For new files, use --- /dev/null
- Keep changes minimal and focused on the request

Example output:
\`\`\`diff
--- a/src/utils/helper.ts
+++ b/src/utils/helper.ts
@@ -10,6 +10,10 @@ export function existing() {
   return true;
 }

+export function newHelper(input: string): string {
+  return input.trim().toLowerCase();
+}
+
 export function another() {
\`\`\``;

const VALIDATE_SYSTEM = `You are a senior code reviewer. You will receive a unified diff and context about the entities it touches. Your job is to validate the diff for correctness.

Check for:
1. **Correctness** — Does the code do what was intended?
2. **Type safety** — Are types used correctly? Any missing or wrong types?
3. **Edge cases** — Are obvious edge cases handled?
4. **Integration** — Does it integrate correctly with callers/callees shown in context?
5. **Security** — Any obvious security issues (injection, XSS, etc.)?

Respond with EXACTLY one of:
- "APPROVED" — if the diff is correct and safe
- "CHANGES_NEEDED" followed by a bullet list of specific issues with line references

Example responses:
  APPROVED

  CHANGES_NEEDED
  - Line 15: Missing null check on \`user\` parameter — could throw at runtime
  - Line 23: SQL string concatenation is vulnerable to injection — use parameterised query
  - Line 30: Return type should be \`Promise<User | null>\` not \`Promise<User>\``;

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

/**
 * Run the implement pipeline.
 *
 * @param userMessage - The user's implementation request
 * @param repoPath - Absolute path to the repo root
 * @param codeContext - Assembled code context (entities, types, etc.)
 * @param planStepContext - Active plan step description (or empty)
 * @param localProvider - Local LLM for Stage 1 (code generation)
 * @param claudeProvider - Claude for Stage 2 (validation) — null skips validation
 * @param log - Logger function
 */
export async function runImplementPipeline(
  userMessage: string,
  repoPath: string,
  codeContext: string,
  planStepContext: string,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider | null,
  log: (msg: string) => void = console.log,
): Promise<ImplementResult> {
  const MAX_RETRIES = 2;
  let retries = 0;
  let feedback = '';
  let lastDiff = '';

  // Build structured Stage 1 context (1-hop callers for implement)
  const structured = await assembleStructuredContext(codeContext, repoPath, 1);

  // Build user content for Stage 1
  const userParts: string[] = [];
  if (structured.text) userParts.push(structured.text);
  if (planStepContext) userParts.push(`Active plan step:\n${planStepContext}`);
  userParts.push(`User request:\n${userMessage}`);

  while (retries <= MAX_RETRIES) {
    // -----------------------------------------------------------------------
    // Stage 1 — Local model generates unified diff
    // -----------------------------------------------------------------------
    log(`  [implement] Stage 1: generating diff (attempt ${retries + 1}/${MAX_RETRIES + 1})...`);

    const stage1Content = [...userParts];
    if (feedback) {
      // Replace or add feedback for retries
      const fbIdx = stage1Content.findIndex(p => p.startsWith('Previous feedback'));
      if (fbIdx >= 0) stage1Content[fbIdx] = `Previous feedback to address:\n${feedback}`;
      else stage1Content.push(`Previous feedback to address:\n${feedback}`);
    }

    const stage1Messages: LLMMessage[] = [
      { role: 'system', content: IMPLEMENT_SYSTEM },
      { role: 'user', content: stage1Content.join('\n\n') },
    ];

    const stage1Response = await localProvider.complete(stage1Messages, {
      maxTokens: 4000,
      temperature: 0.2,
    });

    lastDiff = extractDiffFromResponse(stage1Response.text);

    if (!lastDiff || !lastDiff.includes('---')) {
      log('  [implement] Stage 1 did not produce a valid diff');
      feedback = 'Your output was not a valid unified diff. Output ONLY a unified diff with --- a/path, +++ b/path, and @@ hunk headers.';
      retries++;
      continue;
    }

    // -----------------------------------------------------------------------
    // Stage 2 — Claude validates diff
    // -----------------------------------------------------------------------
    if (!claudeProvider) {
      log('  [implement] No Claude provider — skipping validation');
      break; // Accept without validation
    }

    log('  [implement] Stage 2: validating diff with Claude...');

    const parsedDiffs = parseDiff(lastDiff);
    const fileRounds = splitByFile(parsedDiffs);

    let allApproved = true;
    const allFeedback: string[] = [];

    for (const round of fileRounds) {
      const roundDiff = reconstructDiff(round);

      // Enrich validation context from the knowledge graph
      const validationCtx = await enrichValidationContext(round, roundDiff);

      const stage2Messages: LLMMessage[] = [
        { role: 'system', content: VALIDATE_SYSTEM },
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
        const issues = verdict.slice('CHANGES_NEEDED'.length).trim();
        allFeedback.push(issues);
      } else {
        // Unclear response — treat as needs changes
        allApproved = false;
        allFeedback.push(verdict);
      }
    }

    if (allApproved) {
      log('  [implement] Stage 2: APPROVED');
      break;
    }

    // CHANGES_NEEDED — retry
    feedback = allFeedback.join('\n');
    log(`  [implement] Stage 2: CHANGES_NEEDED (retry ${retries + 1}/${MAX_RETRIES})`);
    retries++;
  }

  // -------------------------------------------------------------------------
  // Outcome handling
  // -------------------------------------------------------------------------

  // If retries exhausted and still not approved
  if (retries > MAX_RETRIES && feedback) {
    log('  [implement] Retries exhausted — surfacing to user');
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
  log('  [implement] Applying diff...');
  const parsedDiffs = parseDiff(lastDiff);

  // Dry-run first
  const dryResult = await applyDiff(parsedDiffs, repoPath, true);
  if (!dryResult.success) {
    const errors = [...dryResult.errors.entries()]
      .map(([f, e]) => `  ${f}: ${e}`)
      .join('\n');
    log(`  [implement] Dry-run failed:\n${errors}`);
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
    log(`  [implement] Written ${applyResult.filesWritten.length} file(s)`);

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

/**
 * After a successful implementation, advance the active plan step.
 * Marks the current in_progress step as done.
 */
async function maybeAdvancePlanStep(
  repoPath: string,
  log: (msg: string) => void,
): Promise<void> {
  try {
    const plan = await planGet({ repoPath });
    if (!plan || plan.status !== 'active') return;

    // Find the in_progress step (or first pending step)
    const current = plan.steps.find(s => s.status === 'in_progress')
      ?? plan.steps.find(s => s.status === 'pending');

    if (!current) return;

    // If it's pending, transition to in_progress first
    if (current.status === 'pending') {
      await planStepUpdate(current.id, 'in_progress', 'auto-started by implement pipeline');
    }

    // Mark as done
    const result = await planStepUpdate(current.id, 'done', 'completed by implement pipeline');
    if (result.ok) {
      log(`  [plan] Step ${current.idx + 1} "${current.title}" → done`);

      // Show next step if available
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

