/**
 * Test runner tools -- run / watch / coverage.
 *
 * Callers pass the command (argv) and an optional framework hint so
 * we can opportunistically parse structured output (jest/vitest
 * `--json`, pytest JUnit XML, `go test -json`). Without a hint we
 * still return stdout / stderr / exit code so the LLM can reason
 * over the raw output.
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runShell } from '../../shell-helper.js';
import { registerTool } from '../../registry.js';
import type {
  Tool, ToolApprovalGate, ToolDeps, ToolInput, ToolResult,
} from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(input: ToolInput, key: string): number | undefined {
  const v = input[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

type Framework = 'jest' | 'vitest' | 'mocha' | 'pytest' | 'go' | 'generic';

function parseFramework(input: ToolInput): Framework {
  const raw = str(input, 'framework');
  switch (raw) {
    case 'jest': case 'vitest': case 'mocha': case 'pytest': case 'go': case 'generic':
      return raw;
    default:
      return 'generic';
  }
}

function argvFromInput(input: ToolInput): string[] {
  const raw = input['argv'];
  if (Array.isArray(raw)) { return (raw as unknown[]).map(String).filter(s => s.length > 0); }
  const command = str(input, 'command');
  if (command) { return ['bash', '-lc', command]; }
  return [];
}

// ---------------------------------------------------------------------------
// Structured result parsing
// ---------------------------------------------------------------------------

export interface TestSummary {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  durationMs: number | undefined;
  failures: Array<{ name: string; message?: string; file?: string; line?: number | undefined }>;
  format: 'jest' | 'vitest' | 'mocha' | 'pytest' | 'go' | 'generic';
}

function emptySummary(fmt: TestSummary['format']): TestSummary {
  return { passed: 0, failed: 0, skipped: 0, total: 0, durationMs: undefined, failures: [], format: fmt };
}

interface JestJsonResult {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  numTodoTests?: number;
  startTime?: number;
  testResults?: Array<{
    testFilePath?: string;
    testResults?: Array<{
      status?: string;
      title?: string;
      fullName?: string;
      failureMessages?: string[];
      location?: { line?: number };
    }>;
  }>;
}

function parseJestVitestJson(stdout: string, fmt: 'jest' | 'vitest'): TestSummary | undefined {
  // Jest/vitest emit a single JSON object when --json is passed; locate the last
  // `{ "numTotalTests": ... }` block so we skip any leading warnings.
  const start = stdout.indexOf('{"numTotalTests"');
  const slice = start >= 0 ? stdout.slice(start) : stdout;
  try {
    const j = JSON.parse(slice) as JestJsonResult;
    const summary = emptySummary(fmt);
    summary.total    = j.numTotalTests ?? 0;
    summary.passed   = j.numPassedTests ?? 0;
    summary.failed   = j.numFailedTests ?? 0;
    summary.skipped  = (j.numPendingTests ?? 0) + (j.numTodoTests ?? 0);
    for (const file of j.testResults ?? []) {
      for (const tr of file.testResults ?? []) {
        if (tr.status === 'failed') {
          summary.failures.push({
            name: tr.fullName ?? tr.title ?? '',
            ...(tr.failureMessages && tr.failureMessages.length > 0 ? { message: tr.failureMessages.join('\n') } : {}),
            ...(file.testFilePath ? { file: file.testFilePath } : {}),
            ...(tr.location?.line !== undefined ? { line: tr.location.line } : {}),
          });
        }
      }
    }
    return summary;
  } catch {
    return undefined;
  }
}

function parseGoJsonStream(stdout: string): TestSummary | undefined {
  // `go test -json` emits one JSON object per line.
  const summary = emptySummary('go');
  let anyEvent = false;
  for (const line of stdout.split('\n')) {
    if (!line.trim().startsWith('{')) { continue; }
    try {
      const evt = JSON.parse(line) as { Action?: string; Test?: string; Package?: string; Output?: string; Elapsed?: number };
      if (!evt.Action || !evt.Test) { continue; }
      anyEvent = true;
      if (evt.Action === 'pass') { summary.passed += 1; }
      else if (evt.Action === 'fail') {
        summary.failed += 1;
        summary.failures.push({
          name: evt.Test,
          ...(evt.Package ? { file: evt.Package } : {}),
        });
      } else if (evt.Action === 'skip') { summary.skipped += 1; }
    } catch { /* skip non-JSON line */ }
  }
  if (!anyEvent) { return undefined; }
  summary.total = summary.passed + summary.failed + summary.skipped;
  return summary;
}

interface JunitTestCase {
  classname?: string;
  name?: string;
  file?: string;
  line?: number;
  failure?: string;
  error?: string;
  skipped?: boolean;
}

function parseJunitXml(xml: string): TestSummary | undefined {
  // Minimal JUnit parser: count testcases + extract failures.
  const summary = emptySummary('pytest');
  const totalsMatch = xml.match(/<testsuite[^>]*tests="(\d+)"[^>]*failures="(\d+)"[^>]*errors="(\d+)"[^>]*skipped="(\d+)"/);
  if (totalsMatch) {
    summary.total    = Number(totalsMatch[1]);
    summary.failed   = Number(totalsMatch[2]) + Number(totalsMatch[3]);
    summary.skipped  = Number(totalsMatch[4]);
    summary.passed   = summary.total - summary.failed - summary.skipped;
  }
  const testcaseRe = /<testcase\b([^>]*)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m: RegExpExecArray | null;
  while ((m = testcaseRe.exec(xml)) !== null) {
    const attrs = m[1] ?? '';
    const body  = m[3] ?? '';
    const tc: JunitTestCase = {};
    const nameMatch  = attrs.match(/\bname="([^"]*)"/);
    const classMatch = attrs.match(/\bclassname="([^"]*)"/);
    const fileMatch  = attrs.match(/\bfile="([^"]*)"/);
    const lineMatch  = attrs.match(/\bline="(\d+)"/);
    if (nameMatch  && nameMatch[1]  !== undefined) { tc.name      = nameMatch[1]; }
    if (classMatch && classMatch[1] !== undefined) { tc.classname = classMatch[1]; }
    if (fileMatch  && fileMatch[1]  !== undefined) { tc.file      = fileMatch[1]; }
    if (lineMatch  && lineMatch[1]  !== undefined) { tc.line      = Number(lineMatch[1]); }
    if (body.includes('<failure')) {
      const msg = body.match(/<failure[^>]*message="([^"]*)"/)?.[1];
      tc.failure = msg ?? 'failure';
    }
    if (body.includes('<error')) {
      const msg = body.match(/<error[^>]*message="([^"]*)"/)?.[1];
      tc.error = msg ?? 'error';
    }
    if (body.includes('<skipped')) { tc.skipped = true; }
    if (tc.failure || tc.error) {
      summary.failures.push({
        name: tc.classname ? `${tc.classname}.${tc.name ?? '?'}` : (tc.name ?? ''),
        ...(tc.failure ?? tc.error ? { message: tc.failure ?? tc.error } : {}),
        ...(tc.file ? { file: tc.file } : {}),
        ...(tc.line !== undefined ? { line: tc.line } : {}),
      });
    }
  }
  // If the totals header didn't match but we walked the file, fall back to counts.
  if (summary.total === 0 && (summary.passed + summary.failed + summary.skipped) > 0) {
    summary.total = summary.passed + summary.failed + summary.skipped;
  }
  if (summary.total === 0 && summary.failures.length === 0) { return undefined; }
  return summary;
}

// ---------------------------------------------------------------------------
// test:run
// ---------------------------------------------------------------------------

interface TestRunData {
  framework: Framework;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  summary: TestSummary | undefined;
  junitPath: string | undefined;
}

const DEFAULT_RUN_TIMEOUT = 10 * 60_000;
const MAX_RUN_TIMEOUT = 60 * 60_000;

export const testRunTool: Tool = {
  id: 'test_run',
  description: 'Run tests. Supply argv (preferred) or command; optional framework hint enables structured parsing.',
  inputSchema: {
    type: 'object',
    properties: {
      argv: { type: 'array', items: { type: 'string' }, description: 'Argv for the test runner. Preferred over `command`.' },
      command: { type: 'string', description: 'Shell command (runs via bash -lc). Use when argv is inconvenient.' },
      framework: { type: 'string', enum: ['jest', 'vitest', 'mocha', 'pytest', 'go', 'generic'] },
      cwd: { type: 'string' },
      env: { type: 'object', additionalProperties: { type: 'string' } },
      timeoutMs: { type: 'number', minimum: 1000, maximum: MAX_RUN_TIMEOUT },
      junitReport: { type: 'boolean', description: 'pytest only: pass --junit-xml and parse the result.' },
      jestJson: { type: 'boolean', description: 'jest/vitest: auto-append --json and parse.' },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const argv = argvFromInput(input);
    const framework = parseFramework(input);
    return {
      title: 'test_run',
      content: [
        `Framework: **${framework}**`,
        `Cwd: \`${str(input, 'cwd') ?? process.cwd()}\``,
        '',
        '**Command**',
        '```bash',
        argv.join(' '),
        '```',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
        { name: 'edit', label: 'Edit command', needsInput: true },
      ],
    };
  },

  applyEdit(input: ToolInput, feedback: string): ToolInput {
    return { ...input, command: feedback, argv: undefined };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const argv = argvFromInput(input);
    if (argv.length === 0) { return fail('test_run', 'argv or command required'); }
    const framework = parseFramework(input);
    const cwd = str(input, 'cwd');
    const timeoutMs = Math.min(num(input, 'timeoutMs') ?? DEFAULT_RUN_TIMEOUT, MAX_RUN_TIMEOUT);
    const envOverride = input['env'] && typeof input['env'] === 'object' && !Array.isArray(input['env'])
      ? Object.fromEntries(
          Object.entries(input['env'] as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => [k, String(v)])
        )
      : undefined;
    const env = envOverride ? { ...process.env, ...envOverride } : undefined;

    // Optionally augment argv for structured output.
    let finalArgv = [...argv];
    let junitPath: string | undefined;
    if (framework === 'pytest' && input['junitReport'] === true) {
      junitPath = join(tmpdir(), `insrc-pytest-${process.pid}-${Date.now()}.xml`);
      finalArgv.push(`--junit-xml=${junitPath}`);
    }
    if ((framework === 'jest' || framework === 'vitest') && input['jestJson'] === true && !finalArgv.includes('--json')) {
      finalArgv.push('--json');
    }
    if (framework === 'go' && !finalArgv.includes('-json')) {
      finalArgv.push('-json');
    }

    const started = Date.now();
    const r = await runShell(finalArgv, { cwd, env, timeoutMs });
    const durationMs = Date.now() - started;
    if (r.spawnError) { return fail('test_run', `runner not found: ${r.stderr.trim() || finalArgv[0]}`); }

    let summary: TestSummary | undefined;
    try {
      if (framework === 'jest' || framework === 'vitest') {
        summary = parseJestVitestJson(r.stdout, framework);
      } else if (framework === 'go') {
        summary = parseGoJsonStream(r.stdout);
      } else if (framework === 'pytest' && junitPath) {
        try {
          const xml = await fs.readFile(junitPath, 'utf8');
          summary = parseJunitXml(xml);
        } catch { /* file missing means run died before writing -- leave summary undefined */ }
      }
    } finally {
      if (junitPath) { try { await fs.unlink(junitPath); } catch { /* ignore */ } }
    }

    const ok = r.code === 0 && !r.timedOut;
    const data: TestRunData = {
      framework, exitCode: r.code, durationMs, timedOut: r.timedOut,
      stdout: r.stdout, stderr: r.stderr, summary, junitPath,
    };
    const header = summary
      ? `**${summary.passed}** passed / **${summary.failed}** failed / **${summary.skipped}** skipped / ${summary.total} total in ${durationMs} ms (${framework}).`
      : ok
        ? `Tests ok (exit 0) in ${durationMs} ms.`
        : `**Tests failed** (exit ${r.code}${r.timedOut ? ', timed out' : ''}) in ${durationMs} ms.`;
    const failuresBlock = summary && summary.failures.length > 0
      ? '\n**Failures**\n' + summary.failures.slice(0, 20).map(f => {
          const where = f.file ? `\n  at ${f.file}${f.line !== undefined ? ':' + f.line : ''}` : '';
          const msg   = f.message ? '\n  ' + f.message.split('\n')[0] : '';
          return `- ${f.name}${where}${msg}`;
        }).join('\n')
      : '';
    return {
      output: [
        header,
        failuresBlock,
        r.stdout ? '\n**stdout**\n```\n' + r.stdout.slice(-4000).replace(/\n+$/, '') + '\n```' : '',
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.slice(-2000).replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: r.timedOut ? 'timed out' : `exit ${r.code}` }),
      data,
    };
  },
};

// ---------------------------------------------------------------------------
// test:watch -- streams output, bounded runtime
// ---------------------------------------------------------------------------

interface TestWatchData {
  framework: Framework;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  stdoutBytes: number;
  stderrBytes: number;
}

const DEFAULT_WATCH_RUNTIME = 30 * 60_000;
const MAX_WATCH_RUNTIME     = 4 * 60 * 60_000;
const LINE_FLUSH_CHARS = 256;

export const testWatchTool: Tool = {
  id: 'test_watch',
  description: 'Run tests in watch mode, streaming output. Bounded runtime; sends SIGTERM on timeout.',
  inputSchema: {
    type: 'object',
    properties: {
      argv: { type: 'array', items: { type: 'string' } },
      command: { type: 'string' },
      framework: { type: 'string', enum: ['jest', 'vitest', 'mocha', 'pytest', 'go', 'generic'] },
      cwd: { type: 'string' },
      env: { type: 'object', additionalProperties: { type: 'string' } },
      maxRuntimeMs: { type: 'number', minimum: 1000, maximum: MAX_WATCH_RUNTIME },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const argv = argvFromInput(input);
    const framework = parseFramework(input);
    const maxRuntime = Math.min(num(input, 'maxRuntimeMs') ?? DEFAULT_WATCH_RUNTIME, MAX_WATCH_RUNTIME);
    return {
      title: 'test_watch',
      content: [
        `Framework: **${framework}**`,
        `Cwd: \`${str(input, 'cwd') ?? process.cwd()}\``,
        `Max runtime: ${Math.round(maxRuntime / 1000)}s. Output streams live.`,
        '',
        '**Command**',
        '```bash',
        argv.join(' '),
        '```',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
        { name: 'edit', label: 'Edit command', needsInput: true },
      ],
    };
  },

  applyEdit(input: ToolInput, feedback: string): ToolInput {
    return { ...input, command: feedback, argv: undefined };
  },

  async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
    const argv = argvFromInput(input);
    if (argv.length === 0) { return fail('test_watch', 'argv or command required'); }
    const framework = parseFramework(input);
    const cwd = str(input, 'cwd');
    const maxRuntimeMs = Math.min(num(input, 'maxRuntimeMs') ?? DEFAULT_WATCH_RUNTIME, MAX_WATCH_RUNTIME);
    const envOverride = input['env'] && typeof input['env'] === 'object' && !Array.isArray(input['env'])
      ? Object.fromEntries(
          Object.entries(input['env'] as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => [k, String(v)])
        )
      : undefined;
    const env = envOverride ? { ...process.env, ...envOverride } : process.env;

    const [cmd, ...args] = argv;
    const started = Date.now();
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let outBuf = '';
    let errBuf = '';

    return new Promise<ToolResult>(resolve => {
      const child = spawn(cmd!, args, {
        cwd, env, stdio: ['ignore', 'pipe', 'pipe'], shell: false,
      });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, maxRuntimeMs);
      const onAbort = () => child.kill('SIGTERM');
      deps.signal?.addEventListener('abort', onAbort, { once: true });

      const flushOut = () => {
        if (outBuf) { deps.send({ id: deps.requestId, stream: 'progress', data: { message: outBuf } }); outBuf = ''; }
      };
      const flushErr = () => {
        if (errBuf) { deps.send({ id: deps.requestId, stream: 'progress', data: { message: '[stderr] ' + errBuf } }); errBuf = ''; }
      };

      child.stdout?.on('data', (c: Buffer) => {
        stdoutBytes += c.length;
        outBuf += c.toString('utf8');
        if (outBuf.length >= LINE_FLUSH_CHARS || outBuf.includes('\n')) { flushOut(); }
      });
      child.stderr?.on('data', (c: Buffer) => {
        stderrBytes += c.length;
        errBuf += c.toString('utf8');
        if (errBuf.length >= LINE_FLUSH_CHARS || errBuf.includes('\n')) { flushErr(); }
      });

      child.on('error', err => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        flushOut(); flushErr();
        resolve(fail('test_watch', `spawn failed: ${err.message}`));
      });
      child.on('close', code => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        flushOut(); flushErr();
        const durationMs = Date.now() - started;
        const ok = code === 0 || (timedOut && code === null);
        const data: TestWatchData = { framework, exitCode: code, durationMs, timedOut, stdoutBytes, stderrBytes };
        resolve({
          output: [
            `Watch ended${timedOut ? ' (runtime cap hit)' : ''} after ${durationMs} ms.`,
            `Streamed: ${stdoutBytes} B stdout, ${stderrBytes} B stderr (${framework}).`,
          ].join('\n'),
          format: 'markdown',
          success: ok,
          ...(ok ? {} : { error: timedOut ? 'runtime cap exceeded' : `exit ${code}` }),
          data,
        });
      });
    });
  },
};

// ---------------------------------------------------------------------------
// test:coverage
// ---------------------------------------------------------------------------

export interface CoverageSummary {
  statements: number | undefined;
  branches: number | undefined;
  functions: number | undefined;
  lines: number | undefined;
  totalPct: number | undefined;
  source: 'jest-summary' | 'vitest-summary' | 'pytest-cov' | 'go-cover' | 'generic';
}

function parseJsCoverageSummary(stdout: string, source: 'jest-summary' | 'vitest-summary'): CoverageSummary | undefined {
  // Look for the "All files" row in jest / vitest text coverage report.
  const m = stdout.match(/All\s+files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/);
  if (!m) { return undefined; }
  const summary: CoverageSummary = {
    statements: Number(m[1]),
    branches:   Number(m[2]),
    functions:  Number(m[3]),
    lines:      Number(m[4]),
    totalPct:   undefined,
    source,
  };
  const nums = [summary.statements, summary.branches, summary.functions, summary.lines].filter((n): n is number => n !== undefined && Number.isFinite(n));
  if (nums.length > 0) { summary.totalPct = nums.reduce((a, b) => a + b, 0) / nums.length; }
  return summary;
}

function parsePytestCovSummary(stdout: string): CoverageSummary | undefined {
  // pytest-cov "TOTAL" line with percentage.
  const m = stdout.match(/^TOTAL\s+[^\n]*?(\d+(?:\.\d+)?)%/m);
  if (!m || m[1] === undefined) { return undefined; }
  const pct = Number(m[1]);
  return { statements: undefined, branches: undefined, functions: undefined, lines: pct, totalPct: pct, source: 'pytest-cov' };
}

function parseGoCoverOutput(stdout: string): CoverageSummary | undefined {
  // `go tool cover -func` ends with "total:  (statements)  XX.X%".
  const m = stdout.match(/^total:\s+\(statements\)\s+(\d+(?:\.\d+)?)%/m);
  if (!m || m[1] === undefined) { return undefined; }
  const pct = Number(m[1]);
  return { statements: pct, branches: undefined, functions: undefined, lines: pct, totalPct: pct, source: 'go-cover' };
}

interface TestCoverageData {
  framework: Framework;
  exitCode: number | null;
  durationMs: number;
  summary: CoverageSummary | undefined;
  stdout: string;
  stderr: string;
}

const DEFAULT_COVERAGE_TIMEOUT = 30 * 60_000;

export const testCoverageTool: Tool = {
  id: 'test_coverage',
  description: 'Run tests with coverage and return a parsed summary when possible.',
  inputSchema: {
    type: 'object',
    properties: {
      argv: { type: 'array', items: { type: 'string' } },
      command: { type: 'string' },
      framework: { type: 'string', enum: ['jest', 'vitest', 'mocha', 'pytest', 'go', 'generic'] },
      cwd: { type: 'string' },
      env: { type: 'object', additionalProperties: { type: 'string' } },
      timeoutMs: { type: 'number', minimum: 1000, maximum: MAX_RUN_TIMEOUT },
      autoArgs: { type: 'boolean', description: 'If true, append framework-specific coverage flags (default true).' },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const argv = argvFromInput(input);
    const framework = parseFramework(input);
    return {
      title: 'test_coverage',
      content: [
        `Framework: **${framework}**`,
        `Cwd: \`${str(input, 'cwd') ?? process.cwd()}\``,
        '',
        '**Command**',
        '```bash',
        argv.join(' '),
        '```',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
        { name: 'edit', label: 'Edit command', needsInput: true },
      ],
    };
  },

  applyEdit(input: ToolInput, feedback: string): ToolInput {
    return { ...input, command: feedback, argv: undefined };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const argv = argvFromInput(input);
    if (argv.length === 0) { return fail('test_coverage', 'argv or command required'); }
    const framework = parseFramework(input);
    const cwd = str(input, 'cwd');
    const timeoutMs = Math.min(num(input, 'timeoutMs') ?? DEFAULT_COVERAGE_TIMEOUT, MAX_RUN_TIMEOUT);
    const autoArgs = input['autoArgs'] !== false;
    const envOverride = input['env'] && typeof input['env'] === 'object' && !Array.isArray(input['env'])
      ? Object.fromEntries(
          Object.entries(input['env'] as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => [k, String(v)])
        )
      : undefined;
    const env = envOverride ? { ...process.env, ...envOverride } : undefined;

    const final = [...argv];
    let goCoverProfile: string | undefined;
    if (autoArgs) {
      if ((framework === 'jest' || framework === 'vitest') && !final.includes('--coverage')) {
        final.push('--coverage');
      } else if (framework === 'pytest' && !final.some(a => a.startsWith('--cov'))) {
        final.push('--cov');
      } else if (framework === 'go' && !final.some(a => a.startsWith('-coverprofile'))) {
        goCoverProfile = join(tmpdir(), `insrc-go-cover-${process.pid}-${Date.now()}.out`);
        final.push(`-coverprofile=${goCoverProfile}`);
      }
    }

    const started = Date.now();
    const r = await runShell(final, { cwd, env, timeoutMs });
    const durationMs = Date.now() - started;
    if (r.spawnError) { return fail('test_coverage', `runner not found: ${r.stderr.trim() || final[0]}`); }

    let summary: CoverageSummary | undefined;
    if (framework === 'jest')   { summary = parseJsCoverageSummary(r.stdout, 'jest-summary'); }
    else if (framework === 'vitest') { summary = parseJsCoverageSummary(r.stdout, 'vitest-summary'); }
    else if (framework === 'pytest') { summary = parsePytestCovSummary(r.stdout); }
    else if (framework === 'go' && goCoverProfile) {
      try {
        const coverR = await runShell(['go', 'tool', 'cover', '-func', goCoverProfile], { cwd, env, timeoutMs: 30_000 });
        if (coverR.code === 0) { summary = parseGoCoverOutput(coverR.stdout); }
      } finally {
        try { await fs.unlink(goCoverProfile); } catch { /* ignore */ }
      }
    }

    const ok = r.code === 0;
    const data: TestCoverageData = { framework, exitCode: r.code, durationMs, summary, stdout: r.stdout, stderr: r.stderr };
    const pct = summary?.totalPct;
    const header = summary
      ? `Coverage: **${pct !== undefined ? pct.toFixed(1) + '%' : 'unknown'}** (${summary.source}, stmts ${summary.statements ?? '-'}, branches ${summary.branches ?? '-'}, fns ${summary.functions ?? '-'}, lines ${summary.lines ?? '-'}) in ${durationMs} ms.`
      : ok
        ? `Ran coverage (exit 0) in ${durationMs} ms but could not parse a summary.`
        : `**Coverage failed** (exit ${r.code}) in ${durationMs} ms.`;
    return {
      output: [
        header,
        r.stdout ? '\n**stdout**\n```\n' + r.stdout.slice(-4000).replace(/\n+$/, '') + '\n```' : '',
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.slice(-2000).replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerTestTools(): void {
  registerTool(testRunTool);
  registerTool(testWatchTool);
  registerTool(testCoverageTool);
}
