/**
 * Shared helpers for git tools.
 */

import { runShell } from '../../shell-helper.js';
import type { ShellResult } from '../../shell-helper.js';
import { markDefinition } from '../../provenance.js';
import type { Tool, ToolDeps, ToolFailureKind, ToolInput, ToolResult } from '../../types.js';

export function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** What a failed call's failure.message gains when a mutating command timed out. */
export const UNKNOWN_OUTCOME = 'the command timed out and its outcome is unknown; check the repository before retrying';

const SIGNIN_RE = /could not read (?:username|password)|authentication failed|permission denied \(publickey|terminal prompts disabled|invalid username or (?:password|token)|repository not found|support for password authentication was removed|HTTP 40[13]|returned error: 40[13]/i;
const NETWORK_RE = /could not resolve host|unable to access|network is unreachable|connection (?:refused|timed out|reset)|operation timed out|temporary failure in name resolution|could not read from remote repository|early eof|the remote end hung up/i;

/**
 * The failure kind of a failed command, from the ShellResult alone: 'missing-tool' when git could not be
 * spawned, 'timed-out' when we killed it, 'missing-signin' or 'unreachable' when a network call's message
 * shows it, else 'rejected'.
 */
/** What the failure helpers read of a finished command: the result of runShell or of runShellBytes. */
export type Outcome = Pick<ShellResult, 'spawnError' | 'timedOut' | 'stdoutTruncated' | 'code' | 'stderr'> & { stdout?: unknown; aborted?: boolean | undefined };

export function failureKind(r: Outcome, opts: { network?: boolean } = {}): ToolFailureKind {
  if (r.spawnError) { return 'missing-tool'; }
  if (r.timedOut) { return 'timed-out'; }
  if (opts.network === true) {
    const text = `${r.stderr}\n${typeof r.stdout === 'string' ? r.stdout : ''}`;
    if (SIGNIN_RE.test(text)) { return 'missing-signin'; }
    if (NETWORK_RE.test(text)) { return 'unreachable'; }
  }
  return 'rejected';
}

/** True when the command ran to an exit, so its exit code is an answer; false when it was not spawned, was killed or its output was cut. */
export function ranToExit(r: Outcome): boolean {
  return !r.spawnError && !r.timedOut && !r.stdoutTruncated && r.code !== null;
}

/** Attach a failure to a legacy failed result; output, format, success, error and data are untouched. */
export function withFailure(result: ToolResult, kind: ToolFailureKind, original?: string, message?: string): ToolResult {
  return {
    ...result,
    failure: {
      kind,
      message: message ?? result.error ?? result.output,
      ...(original !== undefined ? { original } : {}),
    },
  };
}

export function spawnFail(label: string, err: string): ToolResult {
  return withFailure({
    output: `[${label}] cannot spawn git -- ${err.trim() || 'unknown error'}`,
    format: 'text', success: false, error: 'git not found',
  }, 'missing-tool', err);
}

/**
 * The default failed result of a command that ran and failed: '[label] failed: <message>'. `network` is true
 * for push, pull, fetch, clone and ls-remote; `mutating` adds the unknown-outcome sentence to failure.message
 * of a timed-out call (output and error keep today's text).
 */
export function fail(label: string, r: ShellResult, opts: { network?: boolean; mutating?: boolean } = {}): ToolResult {
  if (r.aborted === true) { return cancelledFail(label, opts.mutating === true); }
  const msg = r.stderr.trim() || r.stdout.trim() || `exit ${r.code}`;
  const kind = failureKind(r, opts.network === true ? { network: true } : {});
  const message = kind === 'timed-out' && opts.mutating === true ? `${msg} (${UNKNOWN_OUTCOME})` : undefined;
  return withFailure(
    { output: `[${label}] failed: ${msg}`, format: 'text', success: false, error: msg },
    kind, r.stderr.trim() || r.stdout.trim(), message,
  );
}

/** What failure.message of a cancelled mutating call gains: it was stopped mid-way and may have changed something. */
export const CANCELLED_OUTCOME = 'the command was cancelled and its outcome is unknown; check the repository before retrying';

/** A command stopped by the caller's signal, or never started because the signal was already aborted: kind 'rejected', text 'cancelled'. */
export function cancelledFail(label: string, mutating = false): ToolResult {
  return withFailure(
    { output: `[${label}] failed: cancelled`, format: 'text', success: false, error: 'cancelled' },
    'rejected', undefined, mutating ? `cancelled (${CANCELLED_OUTCOME})` : 'cancelled',
  );
}

/** A failed read that must stop the call: the legacy spawn text when git could not be spawned, else the default failure. */
export function readFailure(label: string, r: ShellResult, opts: { network?: boolean; mutating?: boolean } = {}): ToolResult {
  return r.spawnError ? spawnFail(label, r.stderr) : fail(label, r, opts);
}

/** The failure of a conflicted merge, rebase, revert or cherry-pick: the kind comes from the command's outcome, and a timed-out one says its outcome is unknown. */
export function conflictFailure(result: ToolResult, r: ShellResult): ToolResult {
  const kind = failureKind(r);
  return withFailure(result, kind, r.stderr.trim() || r.stdout.trim(), kind === 'timed-out' ? `${result.error ?? ''} (${UNKNOWN_OUTCOME})` : undefined);
}

/** A read-only git command run for a tool's answer: its result, or the failure to return when it could not give one. */
export async function readGit(
  label: string, argv: readonly string[], cwd: string, timeoutMs: number, signal?: AbortSignal, maxBytes?: number,
): Promise<{ ok: true; r: ShellResult } | { ok: false; failure: ToolResult }> {
  const r = await runShell(argv, { cwd, timeoutMs, signal, ...(maxBytes !== undefined ? { maxBytes } : {}) });
  if (r.spawnError) { return { ok: false, failure: spawnFail(label, r.stderr) }; }
  if (r.code !== 0) { return { ok: false, failure: fail(label, r) }; }
  return { ok: true, r };
}

/** A call refused before any command ran (missing or malformed input): the default shape with kind 'rejected'. */
export function rejectInput(label: string, msg: string): ToolResult {
  return withFailure({ output: `[${label}] failed: ${msg}`, format: 'text', success: false, error: msg }, 'rejected');
}

export class UnsafeArgError extends Error {}

/**
 * The one argument check. A value that goes before the option terminator (a ref, revision, remote or branch name) is
 * rejected when it starts with '-' or holds a NUL; a path that goes after '--' may start with '-' and is rejected only
 * for a NUL. Throws UnsafeArgError; withFailureNet turns it into a rejected failure.
 */
export function assertSafeArg(value: string, position: 'ref' | 'path'): void {
  if (value.includes('\0')) { throw new UnsafeArgError(`unsafe ${position}: it holds a NUL byte`); }
  if (position === 'ref' && value.startsWith('-')) {
    throw new UnsafeArgError(`unsafe ref ${JSON.stringify(value)}: it starts with '-' and would be read as an option`);
  }
}

/**
 * Registration net: any unsuccessful result without a failure gets kind 'rejected' (message from its error
 * text); a failure the tool set itself is left as it is.
 */
export function withFailureNet(tool: Tool): Tool {
  const execute = tool.execute.bind(tool);
  const wrapped: Tool = {
    ...tool,
    async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
      let r: ToolResult;
      try { r = await execute(input, deps); }
      catch (err) {
        if (err instanceof UnsafeArgError) { return rejectInput(tool.id, err.message); }
        throw err;
      }
      if (r.success || r.failure !== undefined) { return r; }
      return withFailure(r, 'rejected');
    },
  };
  markDefinition(wrapped, tool);
  return wrapped;
}

/**
 * Resolve the current branch. Returns undefined for genuine detached
 * HEAD; returns the branch name even when the branch is unborn (fresh
 * repo with no commits yet) so initial commits aren't blocked.
 * `git symbolic-ref` succeeds on unborn branches but fails on
 * detached HEAD, which is the distinction we want.
 */
export async function currentBranch(cwd: string): Promise<string | undefined> {
  const res = await runShell(['git', 'symbolic-ref', '--short', 'HEAD'], { cwd, timeoutMs: 5_000 });
  if (res.code !== 0) { return undefined; }
  const name = res.stdout.trim();
  return name ? name : undefined;
}

/** A precondition read: its value, or the command that did not give one. */
export type PreRead<T> = { ok: true; value: T } | { ok: false; failed: ShellResult };

/**
 * The current branch as a precondition: `value` is undefined only for a detached HEAD (git's 'not a symbolic ref').
 * A read that was not spawned, timed out, was cut, or failed for any other reason (not a repository) is `failed`,
 * so the caller stops before changing anything.
 */
export async function readBranch(cwd: string): Promise<PreRead<string | undefined>> {
  const res = await runShell(['git', 'symbolic-ref', '--short', 'HEAD'], { cwd, timeoutMs: 5_000 });
  if (!ranToExit(res)) { return { ok: false, failed: res }; }
  if (res.code !== 0) {
    return /not a symbolic ref/i.test(res.stderr) ? { ok: true, value: undefined } : { ok: false, failed: res };
  }
  const name = res.stdout.trim();
  return { ok: true, value: name ? name : undefined };
}

/**
 * The branch to name in a result or preview: a detached HEAD gives the fallback, and a read that cannot run gives it too,
 * with a warning that names the read (the call itself does not depend on it).
 */
export async function branchForReport(cwd: string, warnings: string[], fallback: string): Promise<string> {
  const r = await readBranch(cwd);
  if (!r.ok) {
    warnings.push(`git symbolic-ref --short HEAD ${failureKind(r.failed)}: the branch is shown as ${JSON.stringify(fallback)}`);
    return fallback;
  }
  return r.value ?? fallback;
}

/** The number of staged files as a precondition: any read that did not give a count is `failed`. */
export async function readStagedCount(cwd: string): Promise<PreRead<number>> {
  const res = await runShell(['git', 'diff', '--cached', '--name-only'], { cwd, timeoutMs: 5_000 });
  if (!ranToExit(res) || res.code !== 0) { return { ok: false, failed: res }; }
  return { ok: true, value: res.stdout.split('\n').map(s => s.trim()).filter(Boolean).length };
}

/** The short sha of a ref as a secondary read: its value, or the command that did not give one. */
export async function readShortSha(cwd: string, ref: string): Promise<PreRead<string>> {
  const res = await runShell(['git', 'rev-parse', '--short', ref], { cwd, timeoutMs: 5_000 });
  if (!ranToExit(res) || res.code !== 0) { return { ok: false, failed: res }; }
  return { ok: true, value: res.stdout.trim() };
}

/** Short-SHA for HEAD (or any ref). Returns empty string on failure. */
export async function revParse(cwd: string, ref: string): Promise<string> {
  const res = await runShell(['git', 'rev-parse', '--short', ref], { cwd, timeoutMs: 5_000 });
  return res.code === 0 ? res.stdout.trim() : '';
}

/** Number of commits the working index would include, i.e. staged file count. */
export async function stagedCount(cwd: string): Promise<number> {
  const res = await runShell(['git', 'diff', '--cached', '--name-only'], { cwd, timeoutMs: 5_000 });
  if (res.code !== 0) { return 0; }
  return res.stdout.split('\n').map(s => s.trim()).filter(Boolean).length;
}

/** Short summary of staged changes for the approval gate. */
export async function stagedSummary(cwd: string, maxFiles = 20): Promise<string> {
  const res = await runShell(['git', 'diff', '--cached', '--numstat'], { cwd, timeoutMs: 5_000 });
  if (res.code !== 0) { return '_(unable to read staged changes)_'; }
  const lines = res.stdout.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length === 0) { return '_(index is empty)_'; }
  const body: string[] = [];
  for (const line of lines.slice(0, maxFiles)) {
    const parts = line.split('\t');
    if (parts.length < 3) { continue; }
    const ins = parts[0] ?? '-';
    const del = parts[1] ?? '-';
    const path = parts.slice(2).join('\t');
    const delta = ins === '-' || del === '-' ? 'binary' : `+${ins} / -${del}`;
    body.push(`- \`${path}\` -- ${delta}`);
  }
  if (lines.length > maxFiles) { body.push(`- _... and ${lines.length - maxFiles} more_`); }
  return body.join('\n');
}
