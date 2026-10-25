/**
 * Running acli: the argv of an op, one spawn with standard input closed, and the failure of an outcome. Only `acli` is
 * ever spawned (the 'acli jira auth status' probe is acli too); no credential is read, asked for or passed.
 */

import { runShellBytes } from '../../shell-helper.js';
import type { ToolFailure, ToolInput } from '../../types.js';
import { buildArgv } from '../gh/op-table.js';
import type { Arg, OpDef } from '../gh/op-table.js';
import { bytesToText } from '../gh/helpers.js';
import { JIRA_LIMITS } from './limits.js';
import { normalizeKeys } from './input.js';

// ---------------------------------------------------------------------------
// Argv
// ---------------------------------------------------------------------------

/** Fields whose values are identifiers (they cannot start with '-'); every other flag value is free text. */
const IDENTIFIER_FLAG_FIELDS = new Set(['key', 'keys', 'parent', 'out', 'in', 'project', 'toProject', 'projectKey', 'fromProject', 'id', 'user', 'assignee', 'status', 'type']);

/** acli's own default for a list, passed explicitly so a list is never unbounded. */
function defaultLimit(def: OpDef): number | undefined {
  const c = def.command.join(' ');
  if (c === 'workitem search') { return JIRA_LIMITS.searchDefault; }
  if (c === 'workitem comment list') { return JIRA_LIMITS.commentDefault; }
  if (c === 'project list') { return JIRA_LIMITS.projectDefault; }
  return undefined;
}

/** A free-text flag and its value as one `--flag=value` token, so a value that starts with '-' cannot be read as a flag. */
function joinFreeText(a: Arg, input: ToolInput): Arg {
  if (!('flag' in a) || IDENTIFIER_FLAG_FIELDS.has(a.field)) { return a; }
  const v = input[a.field];
  if (v === undefined || v === null || v === false || a.as === 'bool' || a.as === 'bool3' || typeof v === 'number' || typeof v === 'boolean') { return a; }
  if (a.as === 'repeat' && Array.isArray(v)) { return { lit: v.map(x => `${a.flag}=${String(x)}`) }; }
  if (a.as === 'csv' && Array.isArray(v)) { return { lit: [`${a.flag}=${v.map(String).join(',')}`] }; }
  return { lit: [`${a.flag}=${String(v)}`] };
}

const FORBIDDEN = new Set(['--paginate', '--from-json', '--generate-json', '--from-file', '--body-file', '--body-adf', '--editor']);

/**
 * The argv of an op: 'acli jira' then the op's words (the head of buildArgv, the literal 'gh', is replaced). Keys are
 * deduplicated; a list without a limit gets its default; free text is joined to its flag. No op may write a flag that reads
 * or writes a local file or fetches everything.
 */
export function jiraArgv(def: OpDef, rawInput: ToolInput): string[] {
  if (def.out.kind !== 'custom' || def.repo === true) { throw new Error(`jiraArgv: op ${def.name} must use the custom output and no repo`); }
  const input: ToolInput = { ...rawInput };
  if (Array.isArray(input['keys'])) { input['keys'] = normalizeKeys(input['keys'].map(String)); }
  const limit = defaultLimit(def);
  if (limit !== undefined && def.fields?.['limit'] !== undefined && input['limit'] === undefined && input['recent'] !== true) { input['limit'] = limit; }
  const shaped: OpDef = { ...def, args: def.args.map(a => joinFreeText(a, input)) };
  const [, ...rest] = buildArgv(shaped, input);
  const argv = ['acli', 'jira', ...rest];
  const bad = argv.find(t => FORBIDDEN.has(t.split('=')[0] ?? ''));
  if (bad !== undefined) { throw new Error(`jiraArgv: op ${def.name} produced ${bad}, which no Jira op may use`); }
  return argv;
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

export interface AcliProbe {
  readonly code: number | null;
  readonly output: string;
  /** The probe ran to an exit: no spawn failure, time-out or signal. */
  readonly completed: boolean;
}

/** The outcome of one acli command: everything runShellBytes reports, as text, plus the limit and the command. */
export interface AcliOutcome {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
  readonly spawnError: boolean;
  readonly signal?: NodeJS.Signals | undefined;
  readonly timedOut: boolean;
  readonly stdoutTruncated: boolean;
  readonly stderrOverflow: boolean;
  readonly aborted: boolean;
  readonly limitMs: number;
  readonly command: string;
  /** The one 'acli jira auth status' run, made only when the failure text settled nothing. */
  readonly probe?: AcliProbe | undefined;
}

/** Text that shows acli has no usable sign-in. */
const SIGNED_OUT_RE = /unauthorized|not (?:logged|signed) in|acli jira auth login/i;
/** Text that shows the network is the problem. */
const NETWORK_RE = /could not resolve host|no such host|network is unreachable|connection (?:refused|timed out|reset)|i\/o timeout|dial tcp|temporary failure in name resolution|tls handshake timeout/i;
/** Text that names a rejection by Jira or acli itself: no sign-in probe is needed. */
const REJECTION_RE = /does not exist|failed to parse JQL|No project could be found|[Pp]ermission denied|do not have permission|cancelled|Can not find|unknown flag|unknown command|required flag/;

const PROBE_LIMIT_MS = 10_000;

/** Run one acli command. Never throws: a spawn failure, a time-out and a non-zero exit are fields of the outcome. */
export async function acliExec(argv: string[], opts: { cwd?: string | undefined; limitMs: number; signal?: AbortSignal | undefined; maxBytes?: number | undefined }): Promise<AcliOutcome> {
  const r = await runShellBytes(argv, { cwd: opts.cwd, timeoutMs: opts.limitMs, maxBytes: opts.maxBytes ?? 4 * 1024 * 1024, signal: opts.signal });
  const stdout = bytesToText(r.stdout, r.stdoutTruncated);
  const base = {
    stdout, stderr: r.stderr, code: r.code, spawnError: r.spawnError, ...(r.signal ? { signal: r.signal } : {}), timedOut: r.timedOut,
    stdoutTruncated: r.stdoutTruncated, stderrOverflow: r.stderrOverflow, aborted: r.aborted, limitMs: opts.limitMs, command: argv.join(' '),
  };
  const ranToExit = !r.spawnError && !r.timedOut && !r.aborted && !r.signal && r.code !== null && r.code !== 0 && r.code !== 127;
  const text = `${r.stderr}\n${stdout}`;
  if (!ranToExit || REJECTION_RE.test(text) || NETWORK_RE.test(text)) { return base; }
  const p = await runShellBytes(['acli', 'jira', 'auth', 'status'], { cwd: opts.cwd, timeoutMs: PROBE_LIMIT_MS });
  return { ...base, probe: { code: p.code, output: `${bytesToText(p.stdout, false)}${p.stderr}`.trim(), completed: !p.spawnError && !p.timedOut && !p.aborted && !p.signal && p.code !== null } };
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

export const ACLI_UNKNOWN_OUTCOME = 'the outcome is unknown; check the current state before retrying';

/**
 * The failure of one outcome, or undefined when it ran clean. Precedence: spawn failure or exit 127, time-out, abort,
 * signal, error output past the cap, an output cut at the cap, then a non-zero exit. Every failure after the process
 * started adds the unknown-outcome sentence for a call that changes Jira. A non-zero exit is missing-signin only when the
 * sign-in probe ('acli jira auth status') completed and said unauthorized; acli's own text alone is not enough, and a probe that
 * failed to complete (or whose text is a network failure) never makes it one.
 */
export function jiraFailureOf(o: AcliOutcome, opts: { mutating: boolean }): ToolFailure | undefined {
  const unknown = (msg: string): string => opts.mutating ? `${msg}; ${ACLI_UNKNOWN_OUTCOME}` : msg;
  if (o.spawnError || o.code === 127) {
    return { kind: 'missing-tool', message: 'acli is not installed (not found on PATH)', original: (o.stderr || o.stdout).trim() };
  }
  if (o.timedOut) { return { kind: 'timed-out', message: unknown(`${o.command} timed out after ${Math.round(o.limitMs / 1000)} s`) }; }
  if (o.aborted) { return { kind: 'rejected', message: unknown(`${o.command} was aborted`) }; }
  if (o.code === null && o.signal !== undefined) { return { kind: 'rejected', message: unknown(`${o.command} ended on signal ${o.signal}`) }; }
  if (o.stderrOverflow) { return { kind: 'rejected', message: unknown(`${o.command}: its error output passed the capture cap`) }; }
  if (o.stdoutTruncated) { return { kind: 'rejected', message: unknown(`${o.command}: its output was cut at the capture cap, so it is incomplete`) }; }
  if (o.code === 0) { return undefined; }
  const text = `${o.stderr}\n${o.stdout}`;
  const msg = o.stderr.trim() || o.stdout.trim() || `exit ${o.code}`;
  const probeText = o.probe?.output ?? '';
  const original = probeText.length > 0 ? probeText : undefined;
  const probeSaysSignedOut = o.probe !== undefined && o.probe.completed && o.probe.code !== 0 && SIGNED_OUT_RE.test(probeText) && !NETWORK_RE.test(probeText);
  if (probeSaysSignedOut) {
    return { kind: 'missing-signin', message: unknown('acli is not signed in; sign in with acli jira auth login outside the daemon'), original: original ?? msg };
  }
  if (NETWORK_RE.test(text) || NETWORK_RE.test(probeText)) { return { kind: 'unreachable', message: unknown(msg), ...(original !== undefined ? { original } : {}) }; }
  return { kind: 'rejected', message: unknown(msg), ...(original !== undefined ? { original } : {}) };
}
