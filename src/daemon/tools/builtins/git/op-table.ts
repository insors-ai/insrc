/**
 * The op table of a git family tool (git_inspect and the rest): one tool, an `op` enum, and for each op the fields
 * it accepts, the rules between them, the git argv it builds, the class it asks under, its time limit and the shape
 * of its answer. buildGitFamilyTool turns a list of ops into the tool; extendGitTool adds ops to one of the five
 * existing multi-operation tools without changing anything it accepts today.
 *
 * The field helpers and the input rules are the ones the gh family uses (gh/op-table.ts), imported and not changed.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Type } from '@sinclair/typebox';
import type { TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { TypedTool } from '../../call-tool.js';
import { runShellBytes } from '../../shell-helper.js';
import type { ApprovalClass, ToolApprovalGate, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { markDefinition } from '../../provenance.js';
import { fieldSchema, refuseInput } from '../gh/op-table.js';
import type { FieldSpec, OpDef } from '../gh/op-table.js';
import { assertSafeArg, cancelledFail, failureKind, rejectInput, spawnFail, UNKNOWN_OUTCOME, withFailure } from './helpers.js';

/** The content of a stdin op is refused past this many bytes, before git starts. */
export const MAX_STDIN_BYTES = 1024 * 1024;
/** The stdout budget of an op that sets none. Output past it is a failure, never a shortened answer. */
export const DEFAULT_STDOUT_BYTES = 512 * 1024;

/** What an op's parse sees of the finished command. */
export interface GitRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

export interface GitOpSpec {
  readonly name: string;
  readonly fields?: Readonly<Record<string, FieldSpec>>;
  readonly required?: readonly string[];
  readonly oneOf?: readonly (readonly string[])[];
  readonly atLeastOne?: readonly (readonly string[])[];
  readonly exclusive?: readonly (readonly string[])[];
  readonly with?: Readonly<Record<string, readonly string[]>>;
  /** Any other rule between fields: the reason the input is refused, or undefined. */
  readonly check?: (input: ToolInput) => string | undefined;
  /** Fields whose value goes before the option terminator (checked with assertSafeArg 'ref'). */
  readonly refs?: readonly string[];
  /** Fields whose value goes after `--` (checked with assertSafeArg 'path'). */
  readonly paths?: readonly string[];
  /** The git words after `git`. `dir` is the scratch directory when the op asks for one (otherwise ''). */
  readonly argv: (input: ToolInput, dir: string) => readonly string[];
  /** The op writes files that are part of its answer (mailinfo, mailsplit): it gets a temporary directory, removed after parse. */
  readonly scratch?: boolean;
  /** The field that holds the content sent on standard input; it must be declared in `fields`. */
  readonly stdin?: string;
  /** How the stdin field's string becomes bytes: 'utf8' (default) or 'base64' for binary input (a tar, a pack, an index file). */
  readonly stdinEncoding?: 'utf8' | 'base64';
  /** The approval class of the op, or a function of the input for an op that is only sometimes destructive. */
  readonly cls: ApprovalClass | ((input: ToolInput) => ApprovalClass);
  /** True when the op changes something (default: its class is not none, and a function class counts as changing). */
  readonly mutating?: boolean;
  readonly timeoutMs: number;
  readonly maxBytes?: number;
  /** Exit codes that are an answer (default [0]); parse sees the code. */
  readonly okCodes?: readonly number[];
  /** The members of the answer besides the literal op (default: text). */
  readonly answer?: Readonly<Record<string, TSchema>>;
  /** The answer of a finished command, or undefined when it cannot be read (a schema-mismatch). Default: { text: stdout }. */
  readonly parse?: (run: GitRun, input: ToolInput, dir: string) => Record<string, unknown> | undefined;
  /** A sentence the approval preview carries for this op. */
  readonly notice?: string;
}

export interface GitFamilySpec {
  readonly id: string;
  readonly description: string;
  readonly ops: readonly GitOpSpec[];
}

const DEFAULT_ANSWER: Readonly<Record<string, TSchema>> = { text: Type.String() };

/** The parse of an op whose answer is its output without the trailing newline. */
export const trimmedText = (run: GitRun): Record<string, unknown> => ({ text: run.stdout.trim() });
/** The non-blank lines of an output, each trimmed of its newline only. */
export const lineList = (stdout: string): string[] => stdout.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.length > 0);
/** The answer members and parse of an op whose answer is the list of its lines. */
export const LINES_ANSWER: Readonly<Record<string, TSchema>> = { count: Type.Number(), lines: Type.Array(Type.String()) };
export const linesParse = (run: GitRun): Record<string, unknown> => { const lines = lineList(run.stdout); return { count: lines.length, lines }; };

export function classOf(spec: GitOpSpec, input: ToolInput): ApprovalClass {
  return typeof spec.cls === 'function' ? spec.cls(input) : spec.cls;
}

function isMutating(spec: GitOpSpec): boolean {
  return spec.mutating ?? (typeof spec.cls === 'function' || spec.cls !== 'none');
}

/** The rules of an op in the form gh's refuseInput reads. */
function asOpDef(spec: GitOpSpec): OpDef {
  const { name, fields, required, oneOf, atLeastOne, exclusive, check } = spec;
  return { name, fields, required, oneOf, atLeastOne, exclusive, with: spec.with, check, command: [], cls: 'none', limitS: 0, args: [], out: { kind: 'text' } } as OpDef;
}

function answerMember(spec: GitOpSpec): TSchema {
  return Type.Object({ op: Type.Literal(spec.name), ...(spec.answer ?? DEFAULT_ANSWER) });
}

/** The fields of a list of ops; a field two ops share must be declared the same (apart from its words and enum values). */
function collectFields(ops: readonly GitOpSpec[], into = new Map<string, FieldSpec>()): Map<string, FieldSpec> {
  for (const spec of ops) {
    for (const [k, f] of Object.entries(spec.fields ?? {})) {
      const prior = into.get(k);
      if (prior === undefined) { into.set(k, f); continue; }
      const bare = (t: FieldSpec): string => JSON.stringify({ ...t, description: undefined, values: undefined });
      if (bare(prior) !== bare(f)) { throw new Error(`field ${k} is declared differently by two ops (op ${spec.name})`); }
      if (prior.values !== undefined || f.values !== undefined) {
        into.set(k, { ...prior, values: [...new Set([...(prior.values ?? []), ...(f.values ?? [])])] });
      }
    }
  }
  return into;
}

function checkSpecs(id: string, ops: readonly GitOpSpec[]): void {
  const seen = new Set<string>();
  for (const spec of ops) {
    const where = `${id} op ${spec.name}`;
    if (seen.has(spec.name)) { throw new Error(`${id}: two ops are named ${spec.name}`); }
    seen.add(spec.name);
    if (spec.cls === undefined) { throw new Error(`${where} has no approval class`); }
    if (spec.stdin !== undefined) {
      const f = spec.fields?.[spec.stdin];
      if (f === undefined || f.kind !== 'string') { throw new Error(`${where} reads standard input but has no string field ${spec.stdin}`); }
    }
    for (const k of [...(spec.refs ?? []), ...(spec.paths ?? [])]) {
      if (spec.fields?.[k] === undefined) { throw new Error(`${where} checks the field ${k} but does not declare it`); }
    }
  }
}

function previewValue(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 300 ? `${s.slice(0, 300)}...[truncated]` : s;
}

function gateOf(id: string, spec: GitOpSpec | undefined, input: ToolInput): ToolApprovalGate {
  const lines = [`Repo: \`${String(input['cwd'] ?? process.cwd())}\``, `Op: **${String(input['op'])}**`];
  for (const [k, v] of Object.entries(input)) {
    if (k === 'op' || k === 'cwd' || v === undefined || v === null) { continue; }
    lines.push(`${k}: ${k === spec?.stdin ? `(${Buffer.byteLength(String(v))} bytes)` : previewValue(v)}`);
  }
  if (spec?.notice !== undefined) { lines.push('', spec.notice); }
  return { title: `${id} ${String(input['op'])}`, content: lines.join('\n'), actions: [{ name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' }] };
}

/** Run one op and shape its answer. Never throws for a git failure: every failure is a typed result. */
async function runOp(id: string, spec: GitOpSpec, input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
  const label = `${id} ${spec.name}`;
  const refusal = refuseInput(asOpDef(spec), input);
  if (refusal !== undefined) { return rejectInput(label, refusal); }
  for (const k of spec.refs ?? []) { for (const v of values(input[k])) { assertSafeArg(v, 'ref'); } }
  for (const k of spec.paths ?? []) { for (const v of values(input[k])) { assertSafeArg(v, 'path'); } }

  const mutating = isMutating(spec);
  const given = spec.stdin !== undefined && typeof input[spec.stdin] === 'string' ? (input[spec.stdin] as string) : undefined;
  const content = given !== undefined && spec.stdinEncoding === 'base64' ? Buffer.from(given, 'base64') : given;
  if (content !== undefined && Buffer.byteLength(content) > MAX_STDIN_BYTES) {
    return rejectInput(label, `${spec.stdin} is larger than the ${MAX_STDIN_BYTES} bytes a call may send`);
  }
  const cwd = typeof input['cwd'] === 'string' && input['cwd'].length > 0 ? input['cwd'] : process.cwd();
  const limit = spec.maxBytes ?? DEFAULT_STDOUT_BYTES;
  const dir = spec.scratch === true ? mkdtempSync(join(tmpdir(), 'insrc-git-')) : '';
  try {
    return await runIn(id, spec, input, deps, { label, mutating, content, cwd, limit, dir });
  } finally {
    if (dir !== '') { rmSync(dir, { recursive: true, force: true }); }
  }
}

interface Run { label: string; mutating: boolean; content: string | Buffer | undefined; cwd: string; limit: number; dir: string }

async function runIn(_id: string, spec: GitOpSpec, input: ToolInput, deps: ToolDeps, run: Run): Promise<ToolResult> {
  const { label, mutating, content, cwd, limit, dir } = run;
  const r = await runShellBytes(['git', ...spec.argv(input, dir)], {
    cwd, timeoutMs: spec.timeoutMs, stdoutLimit: limit,
    ...(content !== undefined ? { stdin: content } : {}),
    ...(deps.signal !== undefined ? { signal: deps.signal } : {}),
  });

  if (r.aborted) { return cancelledFail(label, mutating); }
  if (r.spawnError) { return spawnFail(label, r.stderr); }
  const stdout = Buffer.from(r.stdout).toString('utf8');
  const stderrText = r.stderr.trim();
  const fail = (kind: ReturnType<typeof failureKind>, msg: string, original?: string): ToolResult =>
    withFailure({ output: `[${label}] failed: ${msg}`, format: 'text', success: false, error: msg }, kind, original ?? (stderrText || undefined),
      kind === 'timed-out' && mutating ? `${msg} (${UNKNOWN_OUTCOME})` : undefined);
  if (r.timedOut) { return fail('timed-out', stderrText || `${spec.name} timed out after ${spec.timeoutMs} ms`); }
  if (r.stdoutTruncated) { return fail('rejected', `output cut at ${limit} bytes`); }
  if (r.stdinError !== undefined) {
    return fail('rejected', `could not deliver ${spec.stdin ?? 'the input'} to git: ${r.stdinError}${mutating ? ' (git may have partly run; check the repository before retrying)' : ''}`);
  }
  const code = r.code ?? -1;
  if (!(spec.okCodes ?? [0]).includes(code)) { return fail(failureKind(r), stderrText || stdout.trim() || `exit ${code}`); }

  const data = spec.parse !== undefined ? spec.parse({ stdout, stderr: r.stderr, code }, input, dir) : { text: stdout };
  const member = answerMember(spec);
  if (data === undefined || !Value.Check(member, { op: spec.name, ...data })) {
    return withFailure({ output: `[${label}] failed: git printed what was not expected`, format: 'text', success: false, error: 'git printed what was not expected' },
      'schema-mismatch', stdout);
  }
  return { output: stdout, format: 'text', success: true, data: { op: spec.name, ...data } };
}

function values(v: unknown): string[] {
  return (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string');
}

/** The flat input schema: op, cwd and every field of every op. A field is required only when every op requires it. */
function inputSchemaOf(ops: readonly GitOpSpec[]): TSchema {
  const props: Record<string, TSchema> = {
    op: Type.Unsafe<string>({ type: 'string', enum: ops.map(o => o.name), description: 'Which operation to run.' }),
    cwd: Type.Optional(Type.String({ description: 'Repository directory to run git in.' })),
  };
  for (const [k, spec] of collectFields(ops)) {
    const schema = fieldSchema(spec);
    props[k] = ops.every(o => (o.required ?? []).includes(k)) ? schema : Type.Optional(schema);
  }
  return Type.Object(props, { additionalProperties: false });
}

/** Define a family tool from its ops. */
export function buildGitFamilyTool(spec: GitFamilySpec): TypedTool {
  const { id, ops } = spec;
  checkSpecs(id, ops);
  const byName = new Map(ops.map(o => [o.name, o] as const));
  const tool: TypedTool = {
    id,
    description: spec.description,
    inputSchema: inputSchemaOf(ops),
    outputSchema: Type.Union(ops.map(answerMember)),
    approval: (input: ToolInput): ApprovalClass => {
      const op = byName.get(String(input['op']));
      return op === undefined ? 'common' : classOf(op, input);
    },
    buildApprovalGate: (input: ToolInput): ToolApprovalGate => gateOf(id, byName.get(String(input['op'])), input),
    async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
      const op = byName.get(String(input['op']));
      if (op === undefined) { return rejectInput(id, `unknown op ${JSON.stringify(input['op'])}; the ops are ${ops.map(o => o.name).join(', ')}`); }
      return runOp(id, op, input, deps);
    },
  };
  return tool;
}

/**
 * Add ops to one of the existing multi-operation tools (git_stash, git_worktree, git_remote, git_branch, git_tag). Every
 * input that was valid stays valid and runs the base's own execute, with the base's class and approval preview; the
 * new ops are values of the same `op` enum with optional fields.
 */
export function extendGitTool<T extends TypedTool>(base: T, extra: readonly GitOpSpec[]): TypedTool {
  checkSpecs(base.id, extra);
  const baseProps = (base.inputSchema as { properties?: Record<string, TSchema> }).properties ?? {};
  const baseOps: readonly string[] = ((baseProps['op'] as { enum?: string[] } | undefined)?.enum) ?? [];
  const extraByName = new Map(extra.map(o => [o.name, o] as const));
  for (const name of extraByName.keys()) {
    if (baseOps.includes(name)) { throw new Error(`${base.id}: op ${name} already exists`); }
  }
  const props: Record<string, TSchema> = { ...baseProps };
  props['op'] = Type.Optional(Type.Unsafe<string>({ type: 'string', enum: [...baseOps, ...extraByName.keys()], description: (baseProps['op'] as { description?: string } | undefined)?.description ?? 'Which operation to run.' }));
  for (const [k, f] of collectFields(extra)) {
    const schema = fieldSchema(f);
    const prior = baseProps[k];
    if (prior !== undefined) {
      // the base declares a field of this name: the new op must mean the same thing by it
      const strip = (t: TSchema): string => JSON.stringify({ ...(t as object), description: undefined });
      if (strip(prior) !== strip(schema)) { throw new Error(`${base.id}: field ${k} collides with a field of the tool of another type`); }
      continue;
    }
    props[k] = Type.Optional(schema);
  }
  const inputSchema = Type.Object(props, { additionalProperties: false });
  // an op the base takes is refused any field only the new ops define, so it is not silently ignored
  const added = new Set(Object.keys(props).filter(k => baseProps[k] === undefined));
  const extended: TypedTool = {
    ...(base as TypedTool),
    inputSchema,
    outputSchema: Type.Union([base.outputSchema as TSchema, ...extra.map(answerMember)] as TSchema[]),
    approval: (input: ToolInput): ApprovalClass => {
      const op = extraByName.get(String(input['op']));
      if (op !== undefined) { return classOf(op, input); }
      const a = base.approval;
      return typeof a === 'function' ? a(input) : a ?? 'none';
    },
    buildApprovalGate: (input: ToolInput): ToolApprovalGate | Promise<ToolApprovalGate> => {
      const op = extraByName.get(String(input['op']));
      return op !== undefined || base.buildApprovalGate === undefined ? gateOf(base.id, op, input) : base.buildApprovalGate(input);
    },
    async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
      const op = extraByName.get(String(input['op']));
      if (op !== undefined) { return runOp(base.id, op, input, deps); }
      const stray = Object.keys(input).find(k => added.has(k) && input[k] !== undefined);
      if (stray !== undefined) { return rejectInput(base.id, `op ${String(input['op'] ?? 'default')} does not accept the field ${stray}`); }
      return base.execute(input, deps);
    },
  };
  markDefinition(extended, base);
  return extended;
}
