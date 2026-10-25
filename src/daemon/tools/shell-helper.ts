/**
 * Shell helper for tool implementations.
 *
 * Returns structured output (stdout / stderr / exit code) rather than
 * a single concatenated string, so tools can distinguish warnings from
 * failures and parse stdout without stripping stderr noise.
 *
 * Used by git / gh / shell / test / build / k8s / cloud tools. Each
 * caller supplies the resolved argv and cwd; no shell parsing happens
 * here -- arguments are passed as an array to avoid injection.
 */

import { onUtf8Data } from '../../shared/utf8-stream.js';
import { spawn } from 'node:child_process';
import { GIT_READ_ARGS, gitEnvironment } from './git-isolation.js';

export interface ShellResult {
  stdout: string;
  stderr: string;
  /** Exit code. null when killed by signal. */
  code: number | null;
  /** True when the process could not be spawned (e.g. ENOENT). */
  spawnError: boolean;
  /** Signal name when the process was killed. */
  signal?: NodeJS.Signals | undefined;
  /** True when we killed the process via timeout. */
  timedOut: boolean;
  /** True when stdout passed `maxBytes` and the rest was dropped. */
  stdoutTruncated: boolean;
}

export interface ShellOptions {
  cwd?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  /** Timeout in milliseconds. Default 120_000 (2 min). */
  timeoutMs?: number | undefined;
  /** Max stdout + stderr bytes to capture. Default 10 MB each. */
  maxBytes?: number | undefined;
  signal?: AbortSignal | undefined;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/** Test seam: multiplies every time limit so a test can time out a real command in milliseconds. */
let timeoutScale = 1;
export function setShellTimeoutScaleForTests(scale?: number): void { timeoutScale = scale ?? 1; }
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Run a command and wait for completion. Never throws -- spawn errors
 * (ENOENT, EACCES, ...) are reported via ShellResult.spawnError = true.
 */
export function runShell(
  argv: readonly string[],
  options: ShellOptions = {},
): Promise<ShellResult> {
  if (argv.length === 0) {
    return Promise.resolve({
      stdout: '',
      stderr: '[runShell] empty argv',
      code: null,
      spawnError: true,
      timedOut: false,
      stdoutTruncated: false,
    });
  }

  const [command, ...args] = argv;
  const timeoutMs = (options.timeoutMs ?? DEFAULT_TIMEOUT_MS) * timeoutScale;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  return new Promise<ShellResult>(resolve => {
    const child = spawn(command!, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let spawnError = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const onAbort = () => child.kill('SIGKILL');
    options.signal?.addEventListener('abort', onAbort, { once: true });

    onUtf8Data(child.stdout, (decodedChunk, chunkBytes) => {
      stdoutBytes += chunkBytes;
      if (stdoutBytes <= maxBytes) { stdout += decodedChunk; }
    });
    onUtf8Data(child.stderr, (decodedChunk, chunkBytes) => {
      stderrBytes += chunkBytes;
      if (stderrBytes <= maxBytes) { stderr += decodedChunk; }
    });
    child.on('error', err => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      spawnError = true;
      stderr += (stderr ? '\n' : '') + `[spawn] ${err.message}`;
      resolve({ stdout, stderr, code: null, spawnError, timedOut, stdoutTruncated: stdoutBytes > maxBytes });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve({
        stdout,
        stderr,
        code,
        spawnError,
        timedOut,
        stdoutTruncated: stdoutBytes > maxBytes,
        ...(signal ? { signal } : {}),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// runShellBytes -- stdin, binary stdout, isolated environment, independent limits
// ---------------------------------------------------------------------------

export interface ShellBytesOptions extends ShellOptions {
  /** Bytes (or text) written to the command's standard input, then closed. */
  stdin?: Uint8Array | string | undefined;
  /** Run in the fresh git environment of git-isolation.ts instead of the daemon's (ignores `env`), and put GIT_READ_ARGS before the subcommand when the command is git. */
  isolate?: boolean | undefined;
  /** Byte budget of stdout (default: maxBytes). Past it the rest is dropped and stdoutTruncated is true. */
  stdoutLimit?: number | undefined;
  /** Byte budget of stderr (default: maxBytes). Past it the process is killed and stderrOverflow is true. */
  stderrLimit?: number | undefined;
}

export interface ShellBytesResult {
  /** Raw stdout bytes, no text decoding. */
  stdout: Uint8Array;
  stderr: string;
  code: number | null;
  spawnError: boolean;
  signal?: NodeJS.Signals | undefined;
  timedOut: boolean;
  stdoutTruncated: boolean;
  /** True when stderr passed stderrLimit and the process was killed; stderr holds the captured prefix. */
  stderrOverflow: boolean;
  /** True when the signal was aborted and the process was killed. */
  aborted: boolean;
  /** Set when writing to the command's stdin failed (it exited before reading its input). */
  stdinError?: string | undefined;
}

/**
 * Like runShell, but with input for stdin, binary-safe stdout, an isolated environment and independent stdout and
 * stderr budgets. Never throws: a spawn error, a time-out, a cancelled signal and a stdin write error are reported
 * in the result. runShell is unchanged.
 */
export function runShellBytes(argv: readonly string[], options: ShellBytesOptions = {}): Promise<ShellBytesResult> {
  const empty = (over: Partial<ShellBytesResult>): ShellBytesResult => ({
    stdout: new Uint8Array(0), stderr: '', code: null, spawnError: false, timedOut: false,
    stdoutTruncated: false, stderrOverflow: false, aborted: false, ...over,
  });
  if (argv.length === 0) { return Promise.resolve(empty({ stderr: '[runShellBytes] empty argv', spawnError: true })); }
  if (options.signal?.aborted) { return Promise.resolve(empty({ aborted: true })); }

  const [command, ...rest] = argv;
  const args = options.isolate === true && command === 'git' ? [...GIT_READ_ARGS, ...rest] : rest;
  const timeoutMs = (options.timeoutMs ?? DEFAULT_TIMEOUT_MS) * timeoutScale;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const stdoutLimit = options.stdoutLimit ?? maxBytes;
  const stderrLimit = options.stderrLimit ?? maxBytes;
  const hasStdin = options.stdin !== undefined;

  return new Promise<ShellBytesResult>(resolve => {
    const child = spawn(command!, args, {
      cwd: options.cwd,
      env: options.isolate === true ? gitEnvironment() : options.env ?? process.env,
      stdio: [hasStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      shell: false,
      // its own process group, so a kill reaches the grandchildren that hold the output pipes open
      detached: process.platform !== 'win32',
    });

    const chunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = '';
    let stderrBytes = 0;
    let timedOut = false;
    let spawnError = false;
    let stderrOverflow = false;
    let aborted = false;
    let stdinError: string | undefined;
    let done = false;

    const kill = () => {
      try { if (process.platform !== 'win32' && child.pid) { process.kill(-child.pid, 'SIGKILL'); return; } } catch { /* already gone */ }
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    const onAbort = () => { aborted = true; kill(); };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (code: number | null, signal?: NodeJS.Signals | null) => {
      if (done) { return; }
      done = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve({
        stdout: new Uint8Array(Buffer.concat(chunks)),
        stderr, code, spawnError, timedOut,
        stdoutTruncated: stdoutBytes > stdoutLimit, stderrOverflow, aborted,
        ...(signal ? { signal } : {}),
        ...(stdinError !== undefined ? { stdinError } : {}),
      });
    };

    child.stdout!.on('data', (chunk: Buffer) => {
      const room = stdoutLimit - stdoutBytes;
      stdoutBytes += chunk.length;
      if (room > 0) { chunks.push(room >= chunk.length ? chunk : chunk.subarray(0, room)); }
    });
    onUtf8Data(child.stderr!, (decodedChunk, chunkBytes) => {
      stderrBytes += chunkBytes;
      if (stderrBytes <= stderrLimit) { stderr += decodedChunk; }
      else if (!stderrOverflow) { stderrOverflow = true; kill(); }
    });

    child.on('error', err => {
      spawnError = true;
      stderr += (stderr ? '\n' : '') + `[spawn] ${err.message}`;
      finish(null);
    });
    child.on('close', (code, signal) => finish(code, signal));

    if (hasStdin && child.stdin) {
      // EPIPE when the command exits before reading its input is a result, not a crash.
      child.stdin.on('error', err => { stdinError = err.message; });
      child.stdin.end(options.stdin);
    }
  });
}
