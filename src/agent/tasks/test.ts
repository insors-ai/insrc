import { readFile } from 'node:fs/promises';
import type { LLMProvider, LLMMessage } from '../../shared/types.js';
import { getLogger, toLogFn } from '../../shared/logger.js';
import {
  parseDiff, applyDiff, splitByFile, extractDiffFromResponse,
  formatDiffForValidation, type FileDiff,
} from './diff-utils.js';
import { enrichValidationContext } from './graph-context.js';
import { requestReindex } from './reindex.js';
import { runTests, formatTestResultForLLM, type TestResult, type TestFramework } from './test-runner.js';
import { planStepUpdate, planNextStep, planGet } from '../tools/mcp-client.js';

// ---------------------------------------------------------------------------
// Test Pipeline — four-stage: generate → validate → execute → fix loop
//
// From design doc (Phase 8):
//   Stage 1: Local model writes test cases as unified diff
//   Stage 2: Claude validates test quality (coverage, assertions, independence)
//   Stage 3: Execute tests locally (affected file only)
//   Stage 4: Fix loop — local fix attempts (3 max), escalate to Claude on 4th,
//            terminal at claudeRounds >= 2
//
// Fix loop detail:
//   - Each round: local model receives failing test + error + entity → fix diff
//   - Fix may target test file OR implementation
//   - If implementation changed: re-index before next test run
//   - 4th local failure → escalate to Claude with all 3 prior diffs + errors
//   - Claude fix applied, localAttempts resets, claudeRounds++
//   - claudeRounds >= 2 and still failing → surface to user
// ---------------------------------------------------------------------------

export interface TestPipelineResult {
  /** Whether all tests passed */
  passed: boolean;
  /** The test diff that was applied */
  testDiff: string;
  /** Files written (test + any implementation fixes) */
  filesWritten: string[];
  /** Final test result */
  testResult: TestResult | null;
  /** Fix loop details */
  fixLoop: {
    localAttempts: number;
    claudeRounds: number;
    fixDiffs: string[];
  };
  /** Whether the user needs to decide */
  needsUserDecision: boolean;
  /** User-facing message */
  message: string;
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const TEST_GENERATE_SYSTEM = `You are a senior software engineer writing test cases. Given the entity under test (full body), its type signature, optionally an existing test file, and an active plan step, produce a unified diff that adds comprehensive tests.

Rules:
- Output ONLY a valid unified diff (--- a/path, +++ b/path, @@ hunks)
- Cover: happy path, boundary values, error/exception paths, null/undefined inputs
- Keep tests independent (no shared mutable state between tests)
- Use the existing test style shown. Add to the existing test file — do not rewrite it.
- For new test files, use --- /dev/null
- Include descriptive test names that explain the expected behaviour`;

const TEST_VALIDATE_SYSTEM = `You are a senior code reviewer validating test quality. Check for:

1. **Coverage** — Are happy path, edge cases, and error paths covered?
2. **Assertion correctness** — Do assertions test the right thing? Are expected values correct?
3. **Independence** — Are tests independent? No shared mutable state?
4. **Completeness** — Are obvious scenarios missing?

Respond with EXACTLY one of:
- "APPROVED" — if tests are well-written and cover important scenarios
- "CHANGES_NEEDED" followed by bullet list of specific issues`;

const FIX_SYSTEM = `You are a senior software engineer fixing a failing test. You will receive:
- The failing test body
- The error output and stack trace
- The entity under test (full body)

Produce a unified diff that fixes the issue. The fix may target:
- The test file (if the test assertion is wrong or the test setup is incorrect)
- The implementation file (if there's a genuine bug in the implementation)

Output ONLY a valid unified diff.`;

const FIX_ESCALATION_SYSTEM = `You are a senior software engineer fixing a persistently failing test. The local model has attempted 3 fixes and all failed.

You will receive:
- The failing test body
- The entity under test
- Error output from all 3 attempts
- Each local fix diff that was tried

Produce a unified diff that fixes the root cause. Consider:
- The pattern of failures across all 3 attempts
- Whether the test expectation is wrong or the implementation has a bug
- Whether the test setup/teardown is missing something

Output ONLY a valid unified diff.`;

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

/**
 * Run the test pipeline.
 *
 * @param userMessage - The user's test request
 * @param testFilePath - Path to the test file (absolute)
 * @param entityContext - Full body of the entity under test
 * @param repoPath - Absolute path to repo root
 * @param planStepContext - Active plan step description (or empty)
 * @param localProvider - Local LLM for code generation
 * @param claudeProvider - Claude for validation and escalation — null skips
 * @param log - Logger function
 * @param framework - Optional test framework override
 */
export async function runTestPipeline(
  userMessage: string,
  testFilePath: string,
  entityContext: string,
  repoPath: string,
  planStepContext: string,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider | null,
  log: (msg: string) => void = toLogFn(getLogger('test')),
  framework?: TestFramework,
): Promise<TestPipelineResult> {
  const result: TestPipelineResult = {
    passed: false,
    testDiff: '',
    filesWritten: [],
    testResult: null,
    fixLoop: { localAttempts: 0, claudeRounds: 0, fixDiffs: [] },
    needsUserDecision: false,
    message: '',
  };

  // -------------------------------------------------------------------------
  // Stage 1 — Local model generates test cases as unified diff
  // -------------------------------------------------------------------------
  log('  [test] Stage 1: generating test cases...');

  // Read existing test file (if any) so the local model extends rather than duplicates
  let existingTestBody = '';
  try {
    existingTestBody = await readFile(testFilePath, 'utf-8');
  } catch {
    // Test file doesn't exist yet — will be created as new file
  }

  const stage1Parts: string[] = [];
  if (entityContext) stage1Parts.push(`Entity under test:\n${entityContext}`);
  if (existingTestBody) stage1Parts.push(`Existing tests (do not rewrite — add to this file):\n${existingTestBody}`);
  if (planStepContext) stage1Parts.push(`Active plan step:\n${planStepContext}`);
  stage1Parts.push(`Test file: ${testFilePath}`);
  stage1Parts.push(`User request:\n${userMessage}`);

  const stage1Messages: LLMMessage[] = [
    { role: 'system', content: TEST_GENERATE_SYSTEM },
    { role: 'user', content: stage1Parts.join('\n\n') },
  ];

  const stage1Response = await localProvider.complete(stage1Messages, {
    maxTokens: 4000,
    temperature: 0.2,
  });

  const testDiff = extractDiffFromResponse(stage1Response.text);
  if (!testDiff || !testDiff.includes('---')) {
    result.message = 'Stage 1 did not produce a valid test diff.';
    return result;
  }

  result.testDiff = testDiff;

  // -------------------------------------------------------------------------
  // Stage 2 — Claude validates test quality
  // -------------------------------------------------------------------------
  if (claudeProvider) {
    log('  [test] Stage 2: validating test quality with Claude...');

    const parsedDiffs = parseDiff(testDiff);
    const fileRounds = splitByFile(parsedDiffs);
    let allApproved = true;
    const allFeedback: string[] = [];

    for (const round of fileRounds) {
      const roundDiff = reconstructDiff(round);
      const validationCtx = await enrichValidationContext(round, roundDiff);

      // Design requires: entity under test (full body) included in Stage 2 context
      let validationContent = formatDiffForValidation(validationCtx);
      if (entityContext) {
        validationContent += `\n\nEntity under test (full body):\n${entityContext}`;
      }

      const stage2Messages: LLMMessage[] = [
        { role: 'system', content: TEST_VALIDATE_SYSTEM },
        { role: 'user', content: validationContent },
      ];

      const stage2Response = await claudeProvider.complete(stage2Messages, {
        maxTokens: 1500,
        temperature: 0.1,
      });

      const verdict = stage2Response.text.trim();
      if (!verdict.startsWith('APPROVED')) {
        allApproved = false;
        const issues = verdict.startsWith('CHANGES_NEEDED')
          ? verdict.slice('CHANGES_NEEDED'.length).trim()
          : verdict;
        allFeedback.push(issues);
      }
    }

    if (!allApproved) {
      // Retry Stage 1 with feedback
      log('  [test] Stage 2: CHANGES_NEEDED — retrying Stage 1...');

      const retryParts = [
        ...stage1Parts,
        `Previous feedback to address:\n${allFeedback.join('\n')}`,
      ];
      const retryMessages: LLMMessage[] = [
        { role: 'system', content: TEST_GENERATE_SYSTEM },
        { role: 'user', content: retryParts.join('\n\n') },
      ];
      const retryResponse = await localProvider.complete(retryMessages, {
        maxTokens: 4000,
        temperature: 0.2,
      });

      const retryDiff = extractDiffFromResponse(retryResponse.text);
      if (retryDiff && retryDiff.includes('---')) {
        result.testDiff = retryDiff;
      }
      // Accept regardless after one retry — move to execution
    }
  } else {
    log('  [test] No Claude provider — skipping validation');
  }

  // -------------------------------------------------------------------------
  // Stage 3 — Apply test diff and execute
  // -------------------------------------------------------------------------
  log('  [test] Stage 3: applying test diff and executing...');

  const parsedDiffs = parseDiff(result.testDiff);

  // Dry-run
  const dryResult = await applyDiff(parsedDiffs, repoPath, true);
  if (!dryResult.success) {
    const errors = [...dryResult.errors.entries()]
      .map(([f, e]) => `  ${f}: ${e}`)
      .join('\n');
    result.message = `Test diff could not be applied:\n${errors}`;
    result.needsUserDecision = true;
    return result;
  }

  // Apply for real
  const applyResult = await applyDiff(parsedDiffs, repoPath, false);
  if (!applyResult.success) {
    result.message = `Test diff apply failed: ${[...applyResult.errors.values()].join('\n')}`;
    return result;
  }

  result.filesWritten.push(...applyResult.filesWritten);
  log(`  [test] Applied test diff (${applyResult.filesWritten.length} file(s))`);

  // Run tests
  const testResult = await runTests(testFilePath, repoPath, framework);
  result.testResult = testResult;

  if (testResult.passed) {
    log(`  [test] Stage 3: ALL PASSED (${testResult.passCount}/${testResult.total})`);
    result.passed = true;
    result.message = `All ${testResult.total} tests passed.`;

    // Non-blocking re-index
    void requestReindex(result.filesWritten, log);

    // Advance plan step
    await maybeAdvancePlanStep(repoPath, log);

    return result;
  }

  log(`  [test] Stage 3: ${testResult.failCount} test(s) failed — entering fix loop`);

  // -------------------------------------------------------------------------
  // Stage 4 — Fix loop
  // -------------------------------------------------------------------------
  const MAX_LOCAL_ATTEMPTS = 3;
  const MAX_CLAUDE_ROUNDS = 2;
  let localAttempts = 0;
  let claudeRounds = 0;
  const fixDiffs: string[] = [];
  const fixErrors: string[] = [];
  let currentTestResult = testResult;

  while (true) {
    // Terminal condition: claudeRounds exhausted
    if (claudeRounds >= MAX_CLAUDE_ROUNDS && !currentTestResult.passed) {
      log(`  [test] Fix loop: Claude rounds exhausted (${claudeRounds}) — surfacing to user`);
      result.fixLoop = { localAttempts, claudeRounds, fixDiffs };
      result.needsUserDecision = true;
      result.message = `Tests still failing after ${claudeRounds} Claude fix rounds and ${localAttempts} local attempts.\n\n${formatTestResultForLLM(currentTestResult)}`;
      return result;
    }

    // Escalation: 3 local attempts failed → escalate to Claude
    if (localAttempts >= MAX_LOCAL_ATTEMPTS && claudeProvider) {
      log(`  [test] Fix loop: ${localAttempts} local attempts failed — escalating to Claude (round ${claudeRounds + 1})...`);

      const escalationParts: string[] = [];
      escalationParts.push(`Entity under test:\n${entityContext}`);
      escalationParts.push(`Failing test output:\n${formatTestResultForLLM(currentTestResult)}`);

      // Include all prior fix diffs and their errors
      for (let i = 0; i < fixDiffs.length; i++) {
        escalationParts.push(`Local fix attempt ${i + 1}:\n\`\`\`diff\n${fixDiffs[i]}\n\`\`\``);
        if (fixErrors[i]) {
          escalationParts.push(`Error after attempt ${i + 1}:\n${fixErrors[i]}`);
        }
      }

      const escalationMessages: LLMMessage[] = [
        { role: 'system', content: FIX_ESCALATION_SYSTEM },
        { role: 'user', content: escalationParts.join('\n\n') },
      ];

      const escalationResponse = await claudeProvider.complete(escalationMessages, {
        maxTokens: 4000,
        temperature: 0.1,
      });

      const claudeFixDiff = extractDiffFromResponse(escalationResponse.text);
      if (claudeFixDiff && claudeFixDiff.includes('---')) {
        const fixResult = await applyFixDiff(claudeFixDiff, repoPath, result, log);
        if (fixResult.applied) {
          fixDiffs.push(claudeFixDiff);

          // Run tests again
          currentTestResult = await runTests(testFilePath, repoPath, framework);
          result.testResult = currentTestResult;

          if (currentTestResult.passed) {
            log(`  [test] Fix loop: PASSED after Claude fix (round ${claudeRounds + 1})`);
            result.passed = true;
            result.message = `Tests passed after ${claudeRounds + 1} Claude fix round(s) and ${localAttempts} local attempts.`;
            result.fixLoop = { localAttempts, claudeRounds: claudeRounds + 1, fixDiffs };
            void requestReindex(result.filesWritten, log);
            await maybeAdvancePlanStep(repoPath, log);
            return result;
          }

          fixErrors.push(formatTestResultForLLM(currentTestResult));
        }
      }

      // Reset local attempts, increment Claude rounds
      localAttempts = 0;
      claudeRounds++;
      continue;
    }

    // No Claude provider and local attempts exhausted → surface to user
    if (localAttempts >= MAX_LOCAL_ATTEMPTS && !claudeProvider) {
      log(`  [test] Fix loop: local attempts exhausted, no Claude provider — surfacing to user`);
      result.fixLoop = { localAttempts, claudeRounds, fixDiffs };
      result.needsUserDecision = true;
      result.message = `Tests still failing after ${localAttempts} local fix attempts (no Claude available for escalation).\n\n${formatTestResultForLLM(currentTestResult)}`;
      return result;
    }

    // Local fix attempt
    localAttempts++;
    log(`  [test] Fix loop: local attempt ${localAttempts}/${MAX_LOCAL_ATTEMPTS}...`);

    const fixParts: string[] = [];
    fixParts.push(`Entity under test:\n${entityContext}`);
    fixParts.push(`Test file: ${testFilePath}`);
    fixParts.push(`Failing test output:\n${formatTestResultForLLM(currentTestResult)}`);

    if (fixDiffs.length > 0) {
      fixParts.push(`Previous fix attempt:\n\`\`\`diff\n${fixDiffs[fixDiffs.length - 1]}\n\`\`\``);
    }

    const fixMessages: LLMMessage[] = [
      { role: 'system', content: FIX_SYSTEM },
      { role: 'user', content: fixParts.join('\n\n') },
    ];

    const fixResponse = await localProvider.complete(fixMessages, {
      maxTokens: 4000,
      temperature: 0.2,
    });

    const fixDiff = extractDiffFromResponse(fixResponse.text);
    if (!fixDiff || !fixDiff.includes('---')) {
      log('  [test] Fix loop: local model did not produce a valid diff');
      fixDiffs.push('(invalid diff)');
      fixErrors.push('No valid diff produced');
      continue;
    }

    const fixResult = await applyFixDiff(fixDiff, repoPath, result, log);
    fixDiffs.push(fixDiff);

    if (!fixResult.applied) {
      fixErrors.push(`Diff could not be applied: ${fixResult.error}`);
      continue;
    }

    // Run tests again
    currentTestResult = await runTests(testFilePath, repoPath, framework);
    result.testResult = currentTestResult;

    if (currentTestResult.passed) {
      log(`  [test] Fix loop: PASSED after local attempt ${localAttempts}`);
      result.passed = true;
      result.message = `Tests passed after ${localAttempts} local fix attempt(s).`;
      result.fixLoop = { localAttempts, claudeRounds, fixDiffs };
      void requestReindex(result.filesWritten, log);
      await maybeAdvancePlanStep(repoPath, log);
      return result;
    }

    fixErrors.push(formatTestResultForLLM(currentTestResult));
    log(`  [test] Fix loop: still failing (${currentTestResult.failCount} failures)`);
  }
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
 * Apply a fix diff, tracking files written and handling re-index.
 * Returns whether the diff was applied successfully.
 */
async function applyFixDiff(
  fixDiff: string,
  repoPath: string,
  result: TestPipelineResult,
  log: (msg: string) => void,
): Promise<{ applied: boolean; error?: string }> {
  const parsed = parseDiff(fixDiff);

  // Dry-run
  const dryResult = await applyDiff(parsed, repoPath, true);
  if (!dryResult.success) {
    const errors = [...dryResult.errors.entries()]
      .map(([f, e]) => `  ${f}: ${e}`)
      .join('\n');
    log(`  [test] Fix diff dry-run failed:\n${errors}`);
    return { applied: false, error: errors };
  }

  // Apply
  const applyResult = await applyDiff(parsed, repoPath, false);
  if (!applyResult.success) {
    return { applied: false, error: [...applyResult.errors.values()].join('\n') };
  }

  result.filesWritten.push(...applyResult.filesWritten);

  // Check if implementation files were changed (not just test files)
  const implFiles = applyResult.filesWritten.filter(
    f => !f.includes('.test.') && !f.includes('.spec.') && !f.includes('__tests__'),
  );

  if (implFiles.length > 0) {
    // Re-index implementation files before next test run
    log(`  [test] Implementation changed (${implFiles.length} file(s)) — re-indexing...`);
    await requestReindex(implFiles, log);
  }

  return { applied: true };
}

/** Advance plan step after successful test. */
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
      await planStepUpdate(current.id, 'in_progress', 'auto-started by test pipeline');
    }

    const stepResult = await planStepUpdate(current.id, 'done', 'completed by test pipeline');
    if (stepResult.ok) {
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
