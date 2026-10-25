/**
 * Shared helpers for gh:* tools.
 *
 * All gh tools shell out to the `gh` CLI so authentication + .netrc +
 * GH_TOKEN + gh config "just work" with the user's existing setup.
 * We rely on --json for structured output wherever gh supports it.
 */

import { runShellBytes, type ShellResult } from '../../shell-helper.js';
import type { ToolInput, ToolResult } from '../../types.js';

export function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function num(input: ToolInput, key: string): number | undefined {
  const v = input[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function strArr(input: ToolInput, key: string): string[] | undefined {
  const v = input[key];
  if (!Array.isArray(v)) { return undefined; }
  const out = (v as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0);
  return out.length > 0 ? out : undefined;
}

export function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

export function shellFail(id: string, r: ShellResult): ToolResult {
  if (r.spawnError) {
    return { output: `[${id}] gh CLI not on PATH or failed to spawn -- ${r.stderr.trim()}`, format: 'text', success: false, error: 'gh not found' };
  }
  const msg = r.stderr.trim() || r.stdout.trim() || `exit ${r.code}`;
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

/** A gh job: the tool and, for a family tool, the op. `mutating` only matters for a job with no row in the table. */
export interface GhLimitKey { toolId: string; op?: string | undefined; mutating?: boolean | undefined }

/** The limit of a job the table has no row for: reads 30 s, writes 60 s, so a new op is never unbounded. */
const READ_LIMIT_S = 30;
const WRITE_LIMIT_S = 60;

/**
 * Seconds per job, `toolId` or `toolId.op`. The values of the existing tools are never below what each tool
 * passed before the table (a call that passed no limit had 30 s).
 */
const LIMITS_S = new Map<string, number>([
  ['gh_issue_create', 60], ['gh_pr_create', 90], ['gh_pr_merge', 180], ['gh_pr_diff', 60],
  ['gh_run_view', 60], ['gh_workflow_run', 60], ['gh_repo_create', 120], ['gh_repo_fork', 120],
  ['gh_repo_clone', 600], ['gh_release_create', 180],
]);

/** Add the rows of a family: keys are `toolId.op`. Later rows replace earlier ones. */
export function registerGhLimits(rows: Readonly<Record<string, number>>): void {
  for (const [k, v] of Object.entries(rows)) { LIMITS_S.set(k, v); }
}

/** The time limit in ms of a gh job; a job with no row takes the read or write default. */
export function ghTimeoutMs(key: GhLimitKey): number {
  const row = (key.op !== undefined ? LIMITS_S.get(`${key.toolId}.${key.op}`) : undefined) ?? LIMITS_S.get(key.toolId);
  return (row ?? (key.mutating === true ? WRITE_LIMIT_S : READ_LIMIT_S)) * 1000;
}

/** Text that shows gh has no usable sign-in. */
export const GH_AUTH_RE = /not logged in|gh auth login|authentication failed|bad credentials|token (?:is )?(?:invalid|expired)|invalid token|HTTP 401/i;
/** Text that shows the network is the problem. */
export const GH_NETWORK_RE = /could not resolve host|no such host|network is unreachable|connection (?:refused|timed out|reset)|i\/o timeout|dial tcp|temporary failure in name resolution|tls handshake timeout/i;
/** Failure text that may be a sign-in problem without saying so; one sign-in probe settles it. */
const GH_AMBIGUOUS_RE = /HTTP 403|forbidden|unauthori[sz]ed|authenticat|credential|token|scope/i;

/** The outcome of one gh command: everything runShellBytes reports, as text, plus the limit applied. */
export interface GhOutcome extends ShellResult {
  stderrOverflow: boolean;
  aborted: boolean;
  stdinError?: string | undefined;
  /** The time limit applied, in ms. */
  limitMs: number;
  /** The command text (never holds standard input). */
  command: string;
  /** True when a cut at the capture cap is the tool's documented answer. */
  cutIsAnswer: boolean;
  /** The one `gh auth status` probe made when the failure text did not settle whether the sign-in is the cause. */
  probe?: { code: number | null; output: string } | undefined;
}

export interface GhExecOptions {
  /** The job, which fixes the time limit. */
  key?: GhLimitKey | undefined;
  cwd?: string | undefined;
  /** Standard input text; it never goes into argv. */
  input?: string | undefined;
  maxBytes?: number | undefined;
  cutIsAnswer?: boolean | undefined;
  /** The host the sign-in probe is scoped to. */
  hostname?: string | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * Text of captured stdout. A cut at the cap can end inside a multibyte character; the incomplete trailing
 * sequence is dropped so the text stays valid. Other invalid bytes decode as U+FFFD.
 */
export function bytesToText(bytes: Uint8Array, truncated: boolean): string {
  let end = bytes.length;
  if (truncated) {
    let i = end - 1;
    let back = 0;
    while (i >= 0 && back < 3 && (bytes[i]! & 0xC0) === 0x80) { i--; back++; }
    if (i >= 0) {
      const lead = bytes[i]!;
      const need = lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3 : lead >= 0xC0 ? 2 : 1;
      if (need > 1 && end - i < need) { end = i; }
    }
  }
  return new TextDecoder('utf-8').decode(bytes.subarray(0, end));
}

/**
 * Run one gh command through runShellBytes. Never throws: a spawn failure, a time-out, a stdin write error, a
 * signal and a non-zero exit are fields of the outcome.
 */
export async function ghExec(argv: string[], opts: GhExecOptions = {}): Promise<GhOutcome> {
  const limitMs = ghTimeoutMs(opts.key ?? { toolId: '' });
  const r = await runShellBytes(argv, {
    cwd: opts.cwd, timeoutMs: limitMs, maxBytes: opts.maxBytes ?? 4 * 1024 * 1024, signal: opts.signal,
    ...(opts.input !== undefined ? { stdin: opts.input } : {}),
  });
  const outcome: GhOutcome = {
    stdout: bytesToText(r.stdout, r.stdoutTruncated), stderr: r.stderr, code: r.code, spawnError: r.spawnError,
    ...(r.signal ? { signal: r.signal } : {}), timedOut: r.timedOut, stdoutTruncated: r.stdoutTruncated,
    stderrOverflow: r.stderrOverflow, aborted: r.aborted, ...(r.stdinError !== undefined ? { stdinError: r.stdinError } : {}),
    limitMs, command: argv.join(' '), cutIsAnswer: opts.cutIsAnswer === true,
  };
  const ranToExit = !r.spawnError && !r.timedOut && !r.aborted && !r.signal && r.code !== null && r.code !== 0;
  if (ranToExit) {
    const text = `${r.stderr}\n${outcome.stdout}`;
    if (!GH_AUTH_RE.test(text) && !GH_NETWORK_RE.test(text) && GH_AMBIGUOUS_RE.test(text)) {
      const p = await runShellBytes(['gh', 'auth', 'status', ...(opts.hostname !== undefined ? ['--hostname', opts.hostname] : [])], { timeoutMs: 10_000 });
      outcome.probe = { code: p.code, output: `${bytesToText(p.stdout, false)}${p.stderr}`.trim() };
    }
  }
  return outcome;
}

/** Parse gh's JSON stdout. Tolerates empty output (returns []). */
export function parseJson<T = unknown>(raw: string): T | undefined {
  const trimmed = raw.trim();
  if (!trimmed) { return undefined; }
  try { return JSON.parse(trimmed) as T; } catch { return undefined; }
}

/** Pass labels / assignees as comma-separated strings to gh, which is the CLI convention. */
export function joinCsv(arr: string[] | undefined): string | undefined {
  return arr && arr.length > 0 ? arr.join(',') : undefined;
}

/** Escape pipe chars for markdown tables. */
export function md(s: string): string {
  return s.replace(/\|/g, '\\|');
}
