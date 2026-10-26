/**
 * Shared helpers for gh:* tools.
 *
 * All gh tools shell out to the `gh` CLI so authentication + .netrc +
 * GH_TOKEN + gh config "just work" with the user's existing setup.
 * We rely on --json for structured output wherever gh supports it.
 */

import { runShellBytes, type ShellResult } from '../../shell-helper.js';
import type { TypedTool } from '../../call-tool.js';
import { markDefinition } from '../../provenance.js';
import type { ApprovalClass, Tool, ToolDeps, ToolFailure, ToolInput, ToolResult } from '../../types.js';

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

/** What a failed mutating call says once it began and did not finish cleanly. */
export const GH_UNKNOWN_OUTCOME = 'the outcome is unknown; check the current state before retrying';

/**
 * The failure of one outcome, or undefined when it ran clean. One precedence, whatever other flags are set:
 * spawn error, time-out, abort, signal, stdin write error, stderr overflow, an unmarked cut capture, then a
 * non-zero exit. For a mutating call every row after the spawn error happens after execution began, so the
 * message adds the unknown-outcome sentence, and so does every later failure of a mutating call (a cut capture, a
 * network failure, a sign-in failure, a plain non-zero exit): gh's own text is kept, and no message says that
 * nothing changed or that a value was not set.
 */
export function ghFailureOf(o: GhOutcome, opts: { mutating: boolean }): ToolFailure | undefined {
  const unknown = (msg: string): string => opts.mutating ? `${msg}; ${GH_UNKNOWN_OUTCOME}` : msg;
  if (o.spawnError) {
    return { kind: 'missing-tool', message: `gh CLI not on PATH or failed to spawn -- ${o.stderr.trim()}`, original: o.stderr.trim() };
  }
  if (o.timedOut) {
    return { kind: 'timed-out', message: unknown(`${o.command} timed out after ${Math.round(o.limitMs / 1000)} s`) };
  }
  if (o.aborted) { return { kind: 'rejected', message: unknown(`${o.command} was aborted`) }; }
  if (o.code === null && o.signal !== undefined) {
    return { kind: 'rejected', message: unknown(`${o.command} ended on signal ${o.signal}`) };
  }
  if (o.stdinError !== undefined) {
    return { kind: 'rejected', message: unknown(`${o.command}: writing its standard input failed (${o.stdinError})`) };
  }
  if (o.stderrOverflow) { return { kind: 'rejected', message: unknown(`${o.command}: its error output passed the capture cap`) }; }
  if (o.stdoutTruncated && !o.cutIsAnswer) {
    return { kind: 'rejected', message: unknown(`${o.command}: its output was cut at the capture cap, so it is incomplete`) };
  }
  if (o.code === 0) { return undefined; }
  const text = `${o.stderr}\n${o.stdout}`;
  const probeText = o.probe?.output ?? '';
  const msg = o.stderr.trim() || o.stdout.trim() || `exit ${o.code}`;
  const original = probeText.length > 0 ? probeText : undefined;
  if (GH_AUTH_RE.test(text) || (o.probe !== undefined && o.probe.code !== 0 && GH_AUTH_RE.test(probeText))) {
    return { kind: 'missing-signin', message: unknown(msg), ...(original !== undefined ? { original } : {}) };
  }
  if (GH_NETWORK_RE.test(text) || GH_NETWORK_RE.test(probeText)) {
    return { kind: 'unreachable', message: unknown(msg), ...(original !== undefined ? { original } : {}) };
  }
  return { kind: 'rejected', message: unknown(msg), ...(original !== undefined ? { original } : {}) };
}

/**
 * Registration net: an exception inside execute becomes a rejected failure, and an unsuccessful result without
 * a failure gets kind 'rejected'. The definition keeps its concrete schema types.
 */
export function withGhFailureNet<T extends TypedTool>(tool: T): T {
  const execute = tool.execute.bind(tool);
  const wrapped = {
    ...tool,
    async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
      let r: ToolResult;
      try { r = await execute(input, deps); }
      catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { output: `[${tool.id}] failed: ${msg}`, format: 'text', success: false, error: msg, failure: { kind: 'rejected', message: msg } };
      }
      if (r.success || r.failure !== undefined) { return r; }
      return { ...r, failure: { kind: 'rejected', message: r.error ?? r.output } };
    },
  };
  markDefinition(wrapped as unknown as Tool, tool);
  return wrapped as T;
}

const APPROVAL = new Map<string, ApprovalClass>();

/** Add base approval classes: keys are `toolId` or `toolId.op`. */
export function registerGhApproval(rows: Readonly<Record<string, ApprovalClass>>): void {
  for (const [k, v] of Object.entries(rows)) { APPROVAL.set(k, v); }
}

registerGhApproval({
  gh_issue_list: 'none', gh_issue_view: 'none', gh_pr_list: 'none', gh_pr_view: 'none', gh_pr_checks: 'none', gh_pr_files: 'none',
  gh_pr_diff: 'none', gh_run_list: 'none', gh_run_view: 'none', gh_workflow_list: 'none', gh_release_list: 'none',
  gh_release_view: 'none', gh_repo_view: 'none', gh_repo_list: 'none', gh_project_list: 'none', gh_project_view: 'none',
  'gh:project:item-list': 'none', 'gh:project:field-list': 'none',
  gh_issue_create: 'common', gh_issue_comment: 'common', gh_issue_edit: 'common', gh_issue_reopen: 'common', gh_issue_link: 'common',
  gh_pr_create: 'common', gh_pr_edit: 'common', gh_pr_comment: 'common', gh_pr_review: 'common', gh_pr_ready: 'common',
  gh_run_rerun: 'common', gh_run_cancel: 'common', gh_workflow_run: 'common', gh_release_create: 'common', gh_release_edit: 'common',
  gh_release_publish: 'common', gh_repo_create: 'common', gh_repo_fork: 'common', gh_repo_clone: 'common',
  'gh:project:item-add': 'common', 'gh:project:item-update': 'common', 'gh:project:item-archive': 'common',
  gh_issue_close: 'destructive', gh_pr_close: 'destructive', gh_pr_merge: 'destructive', gh_release_delete: 'destructive',
  gh_repo_delete: 'destructive', 'gh:project:item-delete': 'destructive',
});

/** Inputs that turn a change into a destructive one: overwriting, renaming, changing visibility, raw git arguments. */
const DESTRUCTIVE_FLAGS = ['force', 'clobber', 'visibility', 'newName', 'newTag', 'extraArgs'] as const;

function isSet(v: unknown): boolean {
  if (typeof v === 'boolean') { return v; }
  if (typeof v === 'string') { return v.length > 0; }
  if (Array.isArray(v)) { return v.length > 0; }
  return v !== undefined && v !== null;
}

/**
 * The approval class of one call: the base class of the tool (or tool and op), raised to destructive by an
 * input that overwrites, renames, changes visibility or passes raw git arguments. A read stays a read. A tool
 * or op with no base class is destructive, so it asks.
 */
export function ghApprovalClass(toolId: string, input: Record<string, unknown>): ApprovalClass {
  const op = typeof input['op'] === 'string' ? input['op'] : undefined;
  // an op that no row names asks, even on a tool that has a class of its own
  const base = op !== undefined ? APPROVAL.get(`${toolId}.${op}`) : APPROVAL.get(toolId);
  if (base === undefined) { return 'destructive'; }
  if (base === 'common' && DESTRUCTIVE_FLAGS.some(k => isSet(input[k]))) { return 'destructive'; }
  return base;
}
