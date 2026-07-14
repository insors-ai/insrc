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

import { spawn } from 'node:child_process';

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
    });
  }

  const [command, ...args] = argv;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= maxBytes) { stdout += chunk.toString('utf8'); }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= maxBytes) { stderr += chunk.toString('utf8'); }
    });

    child.on('error', err => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      spawnError = true;
      stderr += (stderr ? '\n' : '') + `[spawn] ${err.message}`;
      resolve({ stdout, stderr, code: null, spawnError, timedOut });
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
        ...(signal ? { signal } : {}),
      });
    });
  });
}
