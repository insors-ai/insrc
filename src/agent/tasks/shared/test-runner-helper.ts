/**
 * Test execution and fix loop helper — extracted from test.ts.
 *
 * Runs tests, and on failure attempts local fixes (max 3), then escalates
 * to Claude. Used by Pair agent and Delegate agent execute-step.
 */

import type { LLMProvider, LLMMessage } from '../../../shared/types.js';
import {
  parseDiff, applyDiff, extractDiffFromResponse,
} from '../diff-utils.js';
import { requestReindex } from '../reindex.js';
import {
  runTests, formatTestResultForLLM,
  type TestResult, type TestFramework,
} from '../test-runner.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestRunOpts {
  /** Absolute path to the test file */
  testFilePath: string;
  /** Repo root */
  repoPath: string;
  /** Code context for the entity under test */
  entityContext: string;
  /** Local LLM for fix attempts */
  localProvider: LLMProvider;
  /** Claude for escalation (null = no escalation) */
  claudeProvider: LLMProvider | null;
  /** Max local fix attempts per escalation round (default 3) */
  maxLocalAttempts?: number | undefined;
  /** Max Claude escalation rounds (default 2) */
  maxClaudeRounds?: number | undefined;
  /** Test framework override (auto-detected if omitted) */
  framework?: TestFramework | undefined;
  /** Logger */
  log?: ((msg: string) => void) | undefined;
}

export interface TestRunResult {
  /** Whether all tests passed */
  passed: boolean;
  /** Raw test output */
  output: string;
  /** Number of local fix attempts */
  fixAttempts: number;
  /** Number of Claude escalation rounds */
  claudeRounds: number;
  /** Files changed during fix attempts */
  filesChanged: string[];
  /** Structured test result */
  testResult: TestResult | null;
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

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
- Error output from all prior attempts
- Each local fix diff that was tried

Produce a unified diff that fixes the root cause. Output ONLY a valid unified diff.`;

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Run tests and, if they fail, attempt automated fixes.
 *
 * Fix loop:
 *   - Local model attempts fix (up to maxLocalAttempts)
 *   - If still failing and Claude available, escalate to Claude
 *   - Claude fix resets local attempts counter
 *   - Terminal after maxClaudeRounds
 */
export async function runTestsAndFix(opts: TestRunOpts): Promise<TestRunResult> {
  const {
    testFilePath, repoPath, entityContext,
    localProvider, claudeProvider,
    maxLocalAttempts = 3,
    maxClaudeRounds = 2,
    framework,
    log = () => {},
  } = opts;

  const result: TestRunResult = {
    passed: false,
    output: '',
    fixAttempts: 0,
    claudeRounds: 0,
    filesChanged: [],
    testResult: null,
  };

  // Initial test run
  log('  [test-runner] Running tests...');
  let testResult = await runTests(testFilePath, repoPath, framework);
  result.testResult = testResult;
  result.output = testResult.rawOutput;

  if (testResult.passed) {
    result.passed = true;
    return result;
  }

  log(`  [test-runner] ${testResult.failCount} test(s) failed — entering fix loop`);

  // Fix loop
  let localAttempts = 0;
  let claudeRounds = 0;
  const fixDiffs: string[] = [];
  const fixErrors: string[] = [];

  while (true) {
    // Terminal: Claude rounds exhausted
    if (claudeRounds >= maxClaudeRounds && !testResult.passed) {
      log(`  [test-runner] Claude rounds exhausted (${claudeRounds}) — giving up`);
      break;
    }

    // Escalation: local attempts exhausted → Claude
    if (localAttempts >= maxLocalAttempts && claudeProvider) {
      log(`  [test-runner] Escalating to Claude (round ${claudeRounds + 1})...`);

      const escalationParts: string[] = [
        `Entity under test:\n${entityContext}`,
        `Failing test output:\n${formatTestResultForLLM(testResult)}`,
      ];
      for (let i = 0; i < fixDiffs.length; i++) {
        escalationParts.push(`Fix attempt ${i + 1}:\n\`\`\`diff\n${fixDiffs[i]}\n\`\`\``);
        if (fixErrors[i]) escalationParts.push(`Error after attempt ${i + 1}:\n${fixErrors[i]}`);
      }

      const resp = await claudeProvider.complete([
        { role: 'system', content: FIX_ESCALATION_SYSTEM },
        { role: 'user', content: escalationParts.join('\n\n') },
      ], { maxTokens: 4000, temperature: 0.1 });

      const claudeFixDiff = extractDiffFromResponse(resp.text);
      if (claudeFixDiff && claudeFixDiff.includes('---')) {
        const applied = await applyFixDiff(claudeFixDiff, repoPath, result.filesChanged, log);
        if (applied) {
          fixDiffs.push(claudeFixDiff);
          testResult = await runTests(testFilePath, repoPath, framework);
          result.testResult = testResult;
          result.output = testResult.rawOutput;

          if (testResult.passed) {
            result.passed = true;
            result.fixAttempts = localAttempts;
            result.claudeRounds = claudeRounds + 1;
            return result;
          }
          fixErrors.push(formatTestResultForLLM(testResult));
        }
      }

      localAttempts = 0;
      claudeRounds++;
      continue;
    }

    // No Claude and local attempts exhausted
    if (localAttempts >= maxLocalAttempts && !claudeProvider) {
      log(`  [test-runner] Local attempts exhausted, no Claude — giving up`);
      break;
    }

    // Local fix attempt
    localAttempts++;
    log(`  [test-runner] Local fix attempt ${localAttempts}/${maxLocalAttempts}...`);

    const fixParts: string[] = [
      `Entity under test:\n${entityContext}`,
      `Test file: ${testFilePath}`,
      `Failing test output:\n${formatTestResultForLLM(testResult)}`,
    ];
    if (fixDiffs.length > 0) {
      fixParts.push(`Previous fix attempt:\n\`\`\`diff\n${fixDiffs[fixDiffs.length - 1]}\n\`\`\``);
    }

    const resp = await localProvider.complete([
      { role: 'system', content: FIX_SYSTEM },
      { role: 'user', content: fixParts.join('\n\n') },
    ], { maxTokens: 4000, temperature: 0.2 });

    const fixDiff = extractDiffFromResponse(resp.text);
    if (!fixDiff || !fixDiff.includes('---')) {
      fixDiffs.push('(invalid diff)');
      fixErrors.push('No valid diff produced');
      continue;
    }

    const applied = await applyFixDiff(fixDiff, repoPath, result.filesChanged, log);
    fixDiffs.push(fixDiff);

    if (!applied) {
      fixErrors.push('Diff could not be applied');
      continue;
    }

    testResult = await runTests(testFilePath, repoPath, framework);
    result.testResult = testResult;
    result.output = testResult.rawOutput;

    if (testResult.passed) {
      result.passed = true;
      result.fixAttempts = localAttempts;
      result.claudeRounds = claudeRounds;
      return result;
    }

    fixErrors.push(formatTestResultForLLM(testResult));
  }

  result.fixAttempts = localAttempts;
  result.claudeRounds = claudeRounds;
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply a fix diff. Returns true if successful.
 * Appends written files to the filesChanged array and triggers re-index.
 */
async function applyFixDiff(
  fixDiff: string,
  repoPath: string,
  filesChanged: string[],
  log: (msg: string) => void,
): Promise<boolean> {
  const parsed = parseDiff(fixDiff);

  const dryResult = await applyDiff(parsed, repoPath, true);
  if (!dryResult.success) {
    log('  [test-runner] Fix diff dry-run failed');
    return false;
  }

  const applyResult = await applyDiff(parsed, repoPath, false);
  if (!applyResult.success) return false;

  filesChanged.push(...applyResult.filesWritten);

  // Re-index implementation files
  const implFiles = applyResult.filesWritten.filter(
    f => !f.includes('.test.') && !f.includes('.spec.') && !f.includes('__tests__'),
  );
  if (implFiles.length > 0) {
    await requestReindex(implFiles, log);
  }

  return true;
}
