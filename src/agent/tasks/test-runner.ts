import { execFile } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';

// ---------------------------------------------------------------------------
// Test Runner — framework detection, execution, and output parsing
//
// From design doc (Phase 8):
//   - Detect test framework from project config (jest, vitest, mocha, pytest, go test)
//   - Execute only the affected test file (not full suite)
//   - Parse output: pass/fail counts, failure messages, stack traces
//   - Return structured TestResult for the fix loop
// ---------------------------------------------------------------------------

export type TestFramework = 'jest' | 'vitest' | 'mocha' | 'pytest' | 'go' | 'cargo' | 'unknown';

export interface TestResult {
  /** Whether all tests passed */
  passed: boolean;
  /** Total number of tests */
  total: number;
  /** Number of passed tests */
  passCount: number;
  /** Number of failed tests */
  failCount: number;
  /** Failure messages with optional stack traces */
  failures: TestFailure[];
  /** Raw stdout+stderr output */
  rawOutput: string;
  /** Framework that was detected/used */
  framework: TestFramework;
  /** Exit code of the test process */
  exitCode: number;
}

export interface TestFailure {
  /** Test name or description */
  testName: string;
  /** Error message */
  message: string;
  /** Stack trace (if available) */
  stackTrace: string;
}

// ---------------------------------------------------------------------------
// Framework detection
// ---------------------------------------------------------------------------

/**
 * Detect the test framework for a project by inspecting package.json,
 * Cargo.toml, go.mod, or pytest config files.
 */
export async function detectFramework(repoPath: string): Promise<TestFramework> {
  // Check for Node.js project
  const pkgPath = join(repoPath, 'package.json');
  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    const deps = {
      ...pkg.devDependencies,
      ...pkg.dependencies,
    };

    // Check vitest first (it's often installed alongside jest)
    if (deps?.vitest || pkg.scripts?.test?.includes('vitest')) return 'vitest';
    if (deps?.jest || deps?.['ts-jest'] || pkg.scripts?.test?.includes('jest')) return 'jest';
    if (deps?.mocha || pkg.scripts?.test?.includes('mocha')) return 'mocha';
  } catch {
    // Not a Node.js project or no package.json
  }

  // Check for Go project
  try {
    await access(join(repoPath, 'go.mod'));
    return 'go';
  } catch { /* not Go */ }

  // Check for Rust project
  try {
    await access(join(repoPath, 'Cargo.toml'));
    return 'cargo';
  } catch { /* not Rust */ }

  // Check for Python project (pytest)
  for (const pyConfig of ['pytest.ini', 'setup.cfg', 'pyproject.toml', 'conftest.py']) {
    try {
      await access(join(repoPath, pyConfig));
      return 'pytest';
    } catch { /* continue */ }
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Test command builder
// ---------------------------------------------------------------------------

/**
 * Build the test command for a specific file and framework.
 */
export function buildTestCommand(
  framework: TestFramework,
  testFilePath: string,
  repoPath: string,
): { cmd: string; args: string[] } {
  // Make path relative to repo root for cleaner commands
  const relPath = testFilePath.startsWith(repoPath)
    ? testFilePath.slice(repoPath.length + 1)
    : testFilePath;

  switch (framework) {
    case 'jest':
      return { cmd: 'npx', args: ['jest', '--no-coverage', '--verbose', relPath] };
    case 'vitest':
      return { cmd: 'npx', args: ['vitest', 'run', '--reporter=verbose', relPath] };
    case 'mocha':
      return { cmd: 'npx', args: ['mocha', '--reporter', 'spec', relPath] };
    case 'pytest':
      return { cmd: 'python', args: ['-m', 'pytest', '-v', relPath] };
    case 'go':
      return { cmd: 'go', args: ['test', '-v', '-run', '.', `./${relPath.replace(/[/\\][^/\\]+$/, '')}`] };
    case 'cargo':
      return { cmd: 'cargo', args: ['test', '--', '--test-output=immediate'] };
    case 'unknown':
      // Fallback: try npx jest
      return { cmd: 'npx', args: ['jest', '--no-coverage', '--verbose', relPath] };
  }
}

// ---------------------------------------------------------------------------
// Test execution
// ---------------------------------------------------------------------------

/**
 * Execute a test file and return structured results.
 *
 * @param testFilePath - Absolute path to the test file
 * @param repoPath - Absolute path to the repo root
 * @param framework - Optional framework override (auto-detected if omitted)
 * @param timeoutMs - Timeout in milliseconds (default 60s)
 */
export async function runTests(
  testFilePath: string,
  repoPath: string,
  framework?: TestFramework,
  timeoutMs = 60_000,
): Promise<TestResult> {
  const fw = framework ?? await detectFramework(repoPath);
  const { cmd, args } = buildTestCommand(fw, testFilePath, repoPath);

  return new Promise<TestResult>((resolve) => {
    const proc = execFile(cmd, args, {
      cwd: repoPath,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024, // 1MB
      env: { ...process.env, FORCE_COLOR: '0', CI: '1' },
    }, (error, stdout, stderr) => {
      const rawOutput = (stdout ?? '') + '\n' + (stderr ?? '');
      const exitCode = error?.code === 'ERR_CHILD_PROCESS_STDIO_FINAL_ERROR'
        ? 1
        : (typeof (error as any)?.code === 'number' ? (error as any).code : (error ? 1 : 0));

      const parsed = parseTestOutput(rawOutput, fw);

      resolve({
        passed: exitCode === 0 && parsed.failCount === 0,
        total: parsed.total,
        passCount: parsed.passCount,
        failCount: parsed.failCount,
        failures: parsed.failures,
        rawOutput: rawOutput.trim(),
        framework: fw,
        exitCode,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

interface ParsedOutput {
  total: number;
  passCount: number;
  failCount: number;
  failures: TestFailure[];
}

/**
 * Parse test runner output into structured results.
 * Handles jest, vitest, mocha, pytest, and go test output formats.
 */
export function parseTestOutput(output: string, framework: TestFramework): ParsedOutput {
  switch (framework) {
    case 'jest':
    case 'vitest':
      return parseJestLikeOutput(output);
    case 'mocha':
      return parseMochaOutput(output);
    case 'pytest':
      return parsePytestOutput(output);
    case 'go':
      return parseGoTestOutput(output);
    case 'cargo':
      return parseCargoTestOutput(output);
    default:
      return parseJestLikeOutput(output); // fallback
  }
}

// ---------------------------------------------------------------------------
// Jest/Vitest parser
// ---------------------------------------------------------------------------

function parseJestLikeOutput(output: string): ParsedOutput {
  const failures: TestFailure[] = [];

  // Match summary line: "Tests: X failed, Y passed, Z total"
  // or "Test Suites: ..." / "Tests: ..."
  const summaryMatch = output.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+passed,\s*)?(\d+)\s+total/i);
  let failCount = 0;
  let passCount = 0;
  let total = 0;

  if (summaryMatch) {
    failCount = parseInt(summaryMatch[1] ?? '0', 10);
    passCount = parseInt(summaryMatch[2] ?? '0', 10);
    total = parseInt(summaryMatch[3] ?? '0', 10);
  }

  // Parse individual failures: "● test name" (Jest/Vitest standard failure block indicator)
  // Note: ✗/✕ appear in the test listing as display characters, not failure blocks
  const failBlocks = output.split(/●\s+/);
  for (let i = 1; i < failBlocks.length; i++) {
    const block = failBlocks[i]!;
    const lines = block.split('\n');
    const testName = lines[0]?.trim() ?? 'unknown test';

    // Find error message and stack
    const errorLines: string[] = [];
    const stackLines: string[] = [];
    let inStack = false;

    for (let j = 1; j < lines.length; j++) {
      const line = lines[j]!;
      if (line.match(/^\s+at\s+/)) {
        inStack = true;
        stackLines.push(line);
      } else if (inStack) {
        break; // End of stack trace
      } else if (line.trim()) {
        errorLines.push(line.trim());
      }
    }

    failures.push({
      testName,
      message: errorLines.join('\n') || 'Test failed',
      stackTrace: stackLines.join('\n'),
    });
  }

  // If no summary found, count from parsed failures
  if (total === 0 && failures.length > 0) {
    failCount = failures.length;
    total = failures.length;
  }

  return { total, passCount, failCount, failures };
}

// ---------------------------------------------------------------------------
// Mocha parser
// ---------------------------------------------------------------------------

function parseMochaOutput(output: string): ParsedOutput {
  const failures: TestFailure[] = [];

  // Mocha summary: "N passing" and "N failing"
  const passingMatch = output.match(/(\d+)\s+passing/i);
  const failingMatch = output.match(/(\d+)\s+failing/i);
  const passCount = parseInt(passingMatch?.[1] ?? '0', 10);
  const failCount = parseInt(failingMatch?.[1] ?? '0', 10);
  const total = passCount + failCount;

  // Parse failures: numbered list after "N failing"
  const failSection = output.split(/\d+\s+failing/i)[1];
  if (failSection) {
    const failBlocks = failSection.split(/\n\s+\d+\)\s+/);
    for (let i = 1; i < failBlocks.length; i++) {
      const block = failBlocks[i]!;
      const lines = block.split('\n');
      const testName = lines[0]?.trim() ?? 'unknown test';
      const message = lines.slice(1).filter(l => l.trim() && !l.match(/^\s+at\s+/)).join('\n').trim();
      const stackTrace = lines.filter(l => l.match(/^\s+at\s+/)).join('\n');

      failures.push({ testName, message: message || 'Test failed', stackTrace });
    }
  }

  return { total, passCount, failCount, failures };
}

// ---------------------------------------------------------------------------
// Pytest parser
// ---------------------------------------------------------------------------

function parsePytestOutput(output: string): ParsedOutput {
  const failures: TestFailure[] = [];

  // Summary line: "X passed, Y failed" or "X passed" or "X failed"
  const summaryMatch = output.match(/=+\s+(.*?)\s+in\s+[\d.]+s?\s*=+/);
  let passCount = 0;
  let failCount = 0;

  if (summaryMatch) {
    const summary = summaryMatch[1]!;
    const passM = summary.match(/(\d+)\s+passed/);
    const failM = summary.match(/(\d+)\s+failed/);
    passCount = parseInt(passM?.[1] ?? '0', 10);
    failCount = parseInt(failM?.[1] ?? '0', 10);
  }

  // Parse FAILURES section
  const failSection = output.match(/=+ FAILURES =+([\s\S]*?)(?==+ (?:short test summary|[\d]+ (?:passed|failed)))/);
  if (failSection) {
    const blocks = failSection[1]!.split(/_{3,}\s+/);
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i]!;
      const lines = block.split('\n');
      const testName = lines[0]?.trim() ?? 'unknown test';
      const bodyLines = lines.slice(1).filter(l => l.trim());
      const message = bodyLines.filter(l => !l.startsWith('    ')).join('\n').trim() || 'Test failed';
      const stackTrace = bodyLines.filter(l => l.startsWith('    ')).join('\n');

      failures.push({ testName, message, stackTrace });
    }
  }

  const total = passCount + failCount;
  return { total, passCount, failCount, failures };
}

// ---------------------------------------------------------------------------
// Go test parser
// ---------------------------------------------------------------------------

function parseGoTestOutput(output: string): ParsedOutput {
  const failures: TestFailure[] = [];
  let passCount = 0;
  let failCount = 0;

  const lines = output.split('\n');
  let currentTest: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    // "--- FAIL: TestName (0.00s)"
    const failMatch = line.match(/---\s+FAIL:\s+(\S+)/);
    if (failMatch) {
      if (currentTest) {
        failures.push({
          testName: currentTest,
          message: currentLines.join('\n').trim() || 'Test failed',
          stackTrace: '',
        });
      }
      currentTest = failMatch[1]!;
      currentLines = [];
      failCount++;
      continue;
    }

    // "--- PASS: TestName (0.00s)"
    if (line.match(/---\s+PASS:/)) {
      passCount++;
      continue;
    }

    // Collect lines for current failing test
    if (currentTest && line.trim() && !line.startsWith('FAIL') && !line.startsWith('ok')) {
      currentLines.push(line.trim());
    }
  }

  // Flush last failing test
  if (currentTest) {
    failures.push({
      testName: currentTest,
      message: currentLines.join('\n').trim() || 'Test failed',
      stackTrace: '',
    });
  }

  const total = passCount + failCount;
  return { total, passCount, failCount, failures };
}

// ---------------------------------------------------------------------------
// Cargo test parser
// ---------------------------------------------------------------------------

function parseCargoTestOutput(output: string): ParsedOutput {
  const failures: TestFailure[] = [];

  // Summary: "test result: ok. X passed; Y failed; Z ignored"
  const summaryMatch = output.match(/test result:.*?(\d+)\s+passed;\s+(\d+)\s+failed/);
  const passCount = parseInt(summaryMatch?.[1] ?? '0', 10);
  const failCount = parseInt(summaryMatch?.[2] ?? '0', 10);
  const total = passCount + failCount;

  // Parse failures section
  const failSection = output.match(/failures:\s*\n-+\n([\s\S]*?)\n\nfailures:/);
  if (failSection) {
    const blocks = failSection[1]!.split(/\n---- /);
    for (const block of blocks) {
      if (!block.trim()) continue;
      const lines = block.split('\n');
      const testName = lines[0]?.replace(/ stdout ---.*/, '').trim() ?? 'unknown test';
      const message = lines.slice(1).join('\n').trim() || 'Test failed';
      failures.push({ testName, message, stackTrace: '' });
    }
  }

  return { total, passCount, failCount, failures };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a TestResult into a concise summary string for LLM consumption.
 */
export function formatTestResultForLLM(result: TestResult): string {
  const parts: string[] = [];
  parts.push(`Test result: ${result.passed ? 'PASSED' : 'FAILED'} (${result.passCount}/${result.total} passed, framework: ${result.framework})`);

  if (result.failures.length > 0) {
    parts.push('\nFailures:');
    for (const f of result.failures) {
      parts.push(`\n  Test: ${f.testName}`);
      parts.push(`  Error: ${f.message}`);
      if (f.stackTrace) {
        // Truncate stack trace to first 5 lines to save context
        const stackLines = f.stackTrace.split('\n').slice(0, 5);
        parts.push(`  Stack:\n${stackLines.map(l => `    ${l}`).join('\n')}`);
      }
    }
  }

  return parts.join('\n');
}

/**
 * Infer the test file path for a given source file.
 * Checks common patterns: .test.ts, .spec.ts, __tests__/, tests/, test/
 */
export async function findTestFile(
  sourceFilePath: string,
  repoPath: string,
): Promise<string | null> {
  const ext = extname(sourceFilePath);
  const base = basename(sourceFilePath, ext);
  const dir = sourceFilePath.replace(/[/\\][^/\\]+$/, '');

  // Common test file patterns
  const candidates = [
    join(dir, `${base}.test${ext}`),
    join(dir, `${base}.spec${ext}`),
    join(dir, '__tests__', `${base}${ext}`),
    join(dir, '__tests__', `${base}.test${ext}`),
    sourceFilePath.replace(/\/src\//, '/tests/').replace(ext, `.test${ext}`),
    sourceFilePath.replace(/\/src\//, '/test/').replace(ext, `.test${ext}`),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch { /* not found */ }
  }

  return null;
}
