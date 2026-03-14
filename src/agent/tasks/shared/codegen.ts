/**
 * Unified code generation and validation helper.
 *
 * Extracted from implement.ts / refactor.ts patterns:
 *   1. Local model produces unified diff
 *   2. Claude validates per-file via enrichValidationContext
 *   3. On CHANGES_NEEDED, feed feedback back to local (up to N retries)
 *   4. After N local failures, escalate to Claude for generation
 *
 * Used by both Pair (propose/apply) and Delegate (execute-step).
 */

import type { LLMProvider, LLMMessage } from '../../../shared/types.js';
import {
  parseDiff, applyDiff, splitByFile, extractDiffFromResponse,
  formatDiffForValidation, type FileDiff,
} from '../diff-utils.js';
import { enrichValidationContext } from '../graph-context.js';
import { requestReindex } from '../reindex.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodegenOpts {
  /** The user's request / instruction */
  userMessage: string;
  /** Repo root path */
  repoPath: string;
  /** Assembled code context (entities, types, etc.) */
  codeContext: string;
  /** System prompt for code generation */
  generateSystem: string;
  /** Local LLM provider for code generation */
  localProvider: LLMProvider;
  /** Claude provider for validation (null = skip validation) */
  claudeProvider: LLMProvider | null;
  /** Max local retries before escalation (default 2) */
  maxRetries?: number | undefined;
  /** Whether to escalate to Claude for generation after local failures (default true) */
  escalateOnFailure?: boolean | undefined;
  /** Additional context parts to include in the generation prompt */
  extraContext?: string[] | undefined;
  /** Logger */
  log?: ((msg: string) => void) | undefined;
}

export interface CodegenResult {
  /** Whether the diff was approved (validation passed or no validator) */
  approved: boolean;
  /** The final unified diff text */
  diff: string;
  /** Files written to disk */
  filesWritten: string[];
  /** Validation feedback (from last CHANGES_NEEDED, or empty) */
  feedback: string;
  /** Number of retry rounds used */
  retries: number;
  /** Whether generation was escalated to Claude */
  escalated: boolean;
}

// ---------------------------------------------------------------------------
// Validation system prompt
// ---------------------------------------------------------------------------

const VALIDATE_SYSTEM = `You are a senior code reviewer. You will receive a unified diff and context about the entities it touches. Your job is to validate the diff for correctness.

Check for:
1. **Correctness** — Does the code do what was intended?
2. **Type safety** — Are types used correctly? Any missing or wrong types?
3. **Edge cases** — Are obvious edge cases handled?
4. **Integration** — Does it integrate correctly with callers/callees shown in context?
5. **Security** — Any obvious security issues (injection, XSS, etc.)?

Respond with EXACTLY one of:
- "APPROVED" — if the diff is correct and safe
- "CHANGES_NEEDED" followed by a bullet list of specific issues with line references`;

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Generate code via local model, validate with Claude, retry/escalate as needed.
 *
 * Does NOT apply the diff to disk — returns the approved diff for the caller
 * to apply (the caller may want to preview it at a gate first).
 */
export async function generateAndValidate(opts: CodegenOpts): Promise<CodegenResult> {
  const {
    userMessage, repoPath, codeContext, generateSystem,
    localProvider, claudeProvider,
    maxRetries = 2,
    escalateOnFailure = true,
    extraContext = [],
    log = () => {},
  } = opts;

  let retries = 0;
  let feedback = '';
  let lastDiff = '';
  let escalated = false;

  // Build user content parts
  const baseParts: string[] = [];
  if (codeContext) baseParts.push(codeContext);
  baseParts.push(...extraContext.filter(Boolean));
  baseParts.push(`User request:\n${userMessage}`);

  while (retries <= maxRetries) {
    // -----------------------------------------------------------------------
    // Stage 1 — Generate unified diff
    // -----------------------------------------------------------------------
    const provider = escalated ? (claudeProvider ?? localProvider) : localProvider;
    const label = escalated ? 'Claude' : 'local';
    log(`  [codegen] Generating diff with ${label} (attempt ${retries + 1}/${maxRetries + 1})...`);

    const stage1Content = [...baseParts];
    if (feedback) {
      stage1Content.push(`Previous feedback to address:\n${feedback}`);
    }

    const stage1Messages: LLMMessage[] = [
      { role: 'system', content: generateSystem },
      { role: 'user', content: stage1Content.join('\n\n') },
    ];

    const stage1Response = await provider.complete(stage1Messages, {
      maxTokens: 4000,
      temperature: 0.2,
    });

    lastDiff = extractDiffFromResponse(stage1Response.text);

    if (!lastDiff || !lastDiff.includes('---')) {
      log('  [codegen] Did not produce a valid diff');
      feedback = 'Your output was not a valid unified diff. Output ONLY a unified diff with --- a/path, +++ b/path, and @@ hunk headers.';
      retries++;
      continue;
    }

    // -----------------------------------------------------------------------
    // Stage 2 — Validate diff
    // -----------------------------------------------------------------------
    if (!claudeProvider) {
      log('  [codegen] No Claude provider — skipping validation');
      break;
    }

    log('  [codegen] Validating diff with Claude...');

    const parsedDiffs = parseDiff(lastDiff);
    const fileRounds = splitByFile(parsedDiffs);

    let allApproved = true;
    const allFeedback: string[] = [];

    for (const round of fileRounds) {
      const roundDiff = reconstructDiff(round);
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

      allApproved = false;
      const issues = verdict.startsWith('CHANGES_NEEDED')
        ? verdict.slice('CHANGES_NEEDED'.length).trim()
        : verdict;
      allFeedback.push(issues);
    }

    if (allApproved) {
      log('  [codegen] Validation: APPROVED');
      break;
    }

    // CHANGES_NEEDED
    feedback = allFeedback.join('\n');
    log(`  [codegen] Validation: CHANGES_NEEDED (retry ${retries + 1}/${maxRetries})`);
    retries++;

    // Escalation check: if local retries exhausted, switch to Claude
    if (retries > maxRetries && escalateOnFailure && claudeProvider && !escalated) {
      log('  [codegen] Local retries exhausted — escalating to Claude for generation');
      escalated = true;
      retries = 0; // Reset for one Claude attempt
    }
  }

  // If still not approved after all retries
  if (retries > maxRetries && feedback) {
    return {
      approved: false,
      diff: lastDiff,
      filesWritten: [],
      feedback,
      retries,
      escalated,
    };
  }

  return {
    approved: true,
    diff: lastDiff,
    filesWritten: [],
    feedback: '',
    retries,
    escalated,
  };
}

/**
 * Apply an approved diff to disk.
 *
 * Performs dry-run first, then applies. Triggers re-index for changed files.
 */
export async function applyApprovedDiff(
  diff: string,
  repoPath: string,
  log?: (msg: string) => void,
): Promise<{ success: boolean; filesWritten: string[]; error?: string | undefined }> {
  const logFn = log ?? (() => {});
  const parsedDiffs = parseDiff(diff);

  // Dry-run
  const dryResult = await applyDiff(parsedDiffs, repoPath, true);
  if (!dryResult.success) {
    const errors = [...dryResult.errors.entries()]
      .map(([f, e]) => `  ${f}: ${e}`)
      .join('\n');
    return { success: false, filesWritten: [], error: `Diff could not be applied:\n${errors}` };
  }

  // Apply
  const applyResult = await applyDiff(parsedDiffs, repoPath, false);
  if (applyResult.success) {
    logFn(`  [codegen] Written ${applyResult.filesWritten.length} file(s)`);
    void requestReindex(applyResult.filesWritten, logFn);
  }

  return {
    success: applyResult.success,
    filesWritten: applyResult.filesWritten,
    error: applyResult.success
      ? undefined
      : [...applyResult.errors.values()].join('\n'),
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
