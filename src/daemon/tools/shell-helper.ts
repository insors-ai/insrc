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
import type { ChildProcess, StdioOptions } from 'node:child_process';
import { GIT_READ_ARGS, gitEnvironment } from './git-isolation.js';
import { effectiveToolSignal } from './tool-signal.js';

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
  /** True when the effective signal aborted the command (or was already aborted, so it never started). */
  aborted?: boolean | undefined;
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

// ---------------------------------------------------------------------------
// The one process lifecycle: runShell, runShellBytes and spawnManaged are built on it
// ---------------------------------------------------------------------------

/** After a kill, a command that has not closed within this long is settled with what was captured. */
const SETTLE_BOUND_MS = 2000;

export interface ManagedSpawnOptions {
  cwd?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  stdio?: StdioOptions | undefined;
  /** The tool's own limit, a ceiling: the command stops at whichever comes first, this or the effective signal. */
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface ManagedExit {
  code: number | null;
  signal: string | null;
  timedOut: boolean;
  aborted: boolean;
}

/**
 * A started command, or the proof that none was started: with an already-aborted effective signal
 * nothing is spawned and `child` does not exist, so a caller must narrow on `spawned` before it reads it.
 */
export type ManagedProcess =
  | { spawned: true; child: ChildProcess; settled: Promise<ManagedExit> }
  | { spawned: false; settled: Promise<ManagedExit> };

type Launched =
  | { spawned: true; child: ChildProcess; settled: Promise<ManagedExit>; terminate: () => void }
  | { spawned: false; settled: Promise<ManagedExit> };

/**
 * Start a command under the lifecycle. The effective signal is the options' signal combined with the one of
 * the tool call this runs under; it is tested before the spawn. On non-win32 the child gets its own process
 * group, and an abort or the timeoutMs ceiling kills the whole group. If 'close' has not fired within
 * SETTLE_BOUND_MS after a kill, the streams are destroyed and the call settles with what was seen.
 */
function launch(command: string, args: readonly string[], options: ManagedSpawnOptions): Launched {
  const signal = effectiveToolSignal(options.signal);
  if (signal?.aborted === true) {
    return { spawned: false, settled: Promise.resolve({ code: null, signal: null, timedOut: false, aborted: true }) };
  }
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    shell: false,
    // its own process group, so a kill reaches the grandchildren that hold the output pipes open
    detached: process.platform !== 'win32',
  });
  let timedOut = false;
  let aborted = false;
  let done = false;
  let settleTimer: NodeJS.Timeout | undefined;
  let resolveSettled!: (e: ManagedExit) => void;
  const settled = new Promise<ManagedExit>(r => { resolveSettled = r; });

  const killGroup = (): void => {
    try { if (process.platform !== 'win32' && child.pid) { process.kill(-child.pid, 'SIGKILL'); return; } } catch { /* already gone */ }
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  };
  const finish = (code: number | null, sig: string | null): void => {
    if (done) { return; }
    done = true;
    if (timer !== undefined) { clearTimeout(timer); }
    if (settleTimer !== undefined) { clearTimeout(settleTimer); }
    signal?.removeEventListener('abort', onAbort);
    resolveSettled({ code, signal: sig, timedOut, aborted });
  };
  const terminate = (): void => {
    killGroup();
    if (done || settleTimer !== undefined) { return; }
    settleTimer = setTimeout(() => {
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.stdin?.destroy();
      finish(null, null);
    }, SETTLE_BOUND_MS);
    settleTimer.unref();
  };
  const onAbort = (): void => { aborted = true; terminate(); };
  const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => { timedOut = true; terminate(); }, options.timeoutMs * timeoutScale);
  signal?.addEventListener('abort', onAbort, { once: true });

  child.on('error', () => finish(null, null));
  child.on('close', (code, sig) => finish(code, sig));
  return { spawned: true, child, settled, terminate };
}

/**
 * Start a streaming command under the shared lifecycle. The caller attaches its own stdout and stderr
 * callbacks and sends its own progress to the live child; abort and timeout kill the whole process group.
 */
export function spawnManaged(cmd: string, args: readonly string[], options: ManagedSpawnOptions = {}): ManagedProcess {
  const l = launch(cmd, args, options);
  return l.spawned ? { spawned: true, child: l.child, settled: l.settled } : { spawned: false, settled: l.settled };
}

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
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  const l = launch(command!, args, { cwd: options.cwd, env: options.env, timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, signal: options.signal });
  if (!l.spawned) {
    return Promise.resolve({ stdout: '', stderr: '', code: null, spawnError: false, timedOut: false, stdoutTruncated: false, aborted: true });
  }
  const { child } = l;
  let stdout = '';
  let stderr = '';
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let spawnError = false;

  onUtf8Data(child.stdout!, (decodedChunk, chunkBytes) => {
    stdoutBytes += chunkBytes;
    if (stdoutBytes <= maxBytes) { stdout += decodedChunk; }
  });
  onUtf8Data(child.stderr!, (decodedChunk, chunkBytes) => {
    stderrBytes += chunkBytes;
    if (stderrBytes <= maxBytes) { stderr += decodedChunk; }
  });
  child.on('error', err => {
    spawnError = true;
    stderr += (stderr ? '\n' : '') + `[spawn] ${err.message}`;
  });

  return l.settled.then(exit => ({
    stdout,
    stderr,
    code: exit.code,
    spawnError,
    timedOut: exit.timedOut,
    stdoutTruncated: stdoutBytes > maxBytes,
    ...(exit.signal ? { signal: exit.signal as NodeJS.Signals } : {}),
    ...(exit.aborted ? { aborted: true } : {}),
  }));
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

  const [command, ...rest] = argv;
  const args = options.isolate === true && command === 'git' ? [...GIT_READ_ARGS, ...rest] : rest;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const stdoutLimit = options.stdoutLimit ?? maxBytes;
  const stderrLimit = options.stderrLimit ?? maxBytes;
  const hasStdin = options.stdin !== undefined;

  const l = launch(command!, args, {
    cwd: options.cwd,
    env: options.isolate === true ? gitEnvironment() : options.env ?? process.env,
    stdio: [hasStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal: options.signal,
  });
  if (!l.spawned) { return Promise.resolve(empty({ aborted: true })); }
  const { child } = l;

  const chunks: Buffer[] = [];
  let stdoutBytes = 0;
  let stderr = '';
  let stderrBytes = 0;
  let spawnError = false;
  let stderrOverflow = false;
  let stdinError: string | undefined;

  child.stdout!.on('data', (chunk: Buffer) => {
    const room = stdoutLimit - stdoutBytes;
    stdoutBytes += chunk.length;
    if (room > 0) { chunks.push(room >= chunk.length ? chunk : chunk.subarray(0, room)); }
  });
  onUtf8Data(child.stderr!, (decodedChunk, chunkBytes) => {
    stderrBytes += chunkBytes;
    if (stderrBytes <= stderrLimit) { stderr += decodedChunk; }
    else if (!stderrOverflow) { stderrOverflow = true; l.terminate(); }
  });
  child.on('error', err => {
    spawnError = true;
    stderr += (stderr ? '\n' : '') + `[spawn] ${err.message}`;
  });

  if (hasStdin && child.stdin) {
    // EPIPE when the command exits before reading its input is a result, not a crash.
    child.stdin.on('error', err => { stdinError = err.message; });
    child.stdin.end(options.stdin);
  }

  return l.settled.then(exit => ({
    stdout: new Uint8Array(Buffer.concat(chunks)),
    stderr, code: exit.code, spawnError, timedOut: exit.timedOut,
    stdoutTruncated: stdoutBytes > stdoutLimit, stderrOverflow, aborted: exit.aborted,
    ...(exit.signal ? { signal: exit.signal as NodeJS.Signals } : {}),
    ...(stdinError !== undefined ? { stdinError } : {}),
  }));
}
