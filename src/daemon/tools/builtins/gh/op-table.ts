/**
 * The op table of a gh family tool (gh_issue_manage and the rest): one tool, an `op` enum, and for each op the
 * fields it accepts, the rules between them, the gh argv it builds, the class it asks under, its time limit and
 * the shape of its answer. The builder turns a list of ops into the tool: a flat typebox input schema, an output
 * union whose members carry the literal `op`, the input rules, the argv and the typed failure.
 */

import { Type } from '@sinclair/typebox';
import type { TSchema } from '@sinclair/typebox';
import type { TypedTool } from '../../call-tool.js';
import type { ApprovalClass, ToolApprovalGate, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { ghApprovalClass, ghExec, ghFailureOf, parseJson, registerGhApproval, registerGhLimits, withGhFailureNet } from './helpers.js';
import { parseTabRows } from './parsers.js';

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export type FieldKind = 'string' | 'integer' | 'boolean' | 'strings' | 'enum' | 'expr';

export interface FieldSpec {
  readonly kind: FieldKind;
  readonly values?: readonly string[];
  readonly minimum?: number;
  readonly description?: string;
  /** A string that may be empty (a description cleared on purpose). */
  readonly empty?: boolean;
}

const EXPR_PART = /^[\w:+*-]*(?:\.[\w:+*-]+)*$/;

/** A search qualifier gh documents as a number, a size or a date: a bare value, a comparison (>100, >=2024-01-01) or one range (10..50, *..10). */
export function isExpression(v: string): boolean {
  if (v.length === 0 || /\s/.test(v)) { return false; }
  if (v.includes('..')) {
    const parts = v.split('..');
    return parts.length === 2 && parts.every(p => EXPR_PART.test(p));
  }
  return /^(?:>=|<=|>|<)?[\w.:+*-]+$/.test(v);
}

export const field = {
  str: (description?: string, empty = false): FieldSpec => ({ kind: 'string', ...(description ? { description } : {}), ...(empty ? { empty } : {}) }),
  int: (description?: string, minimum = 1): FieldSpec => ({ kind: 'integer', minimum, ...(description ? { description } : {}) }),
  bool: (description?: string): FieldSpec => ({ kind: 'boolean', ...(description ? { description } : {}) }),
  strs: (description?: string): FieldSpec => ({ kind: 'strings', ...(description ? { description } : {}) }),
  oneOf: (values: readonly string[], description?: string): FieldSpec => ({ kind: 'enum', values, ...(description ? { description } : {}) }),
  /** A string holding a comparison or range such as >100, 10..50 or >=2024-01-01. */
  expr: (description?: string): FieldSpec => ({ kind: 'expr', description: description ?? 'A number, size or date; comparisons and ranges are allowed (>100, 10..50, >=2024-01-01).' }),
};

export function fieldSchema(spec: FieldSpec): TSchema {
  const d = spec.description !== undefined ? { description: spec.description } : {};
  switch (spec.kind) {
    case 'string':
    case 'expr': return Type.String({ ...(spec.empty === true ? {} : { minLength: 1 }), ...d });
    case 'integer': return Type.Integer({ minimum: spec.minimum ?? 1, ...d });
    case 'boolean': return Type.Boolean(d);
    case 'strings': return Type.Array(Type.String({ minLength: 1 }), { minItems: 1, ...d });
    case 'enum': return Type.Unsafe<string>({ type: 'string', enum: [...(spec.values ?? [])], ...d });
  }
}

// ---------------------------------------------------------------------------
// Argv
// ---------------------------------------------------------------------------

export type Arg =
  | { readonly pos: string }
  | { readonly spread: string }
  | { readonly flag: string; readonly field: string; readonly as?: 'value' | 'bool' | 'bool3' | 'repeat' | 'csv' }
  | { readonly lit: readonly string[]; readonly when?: (input: ToolInput) => boolean };

/** A positional taken from a field when it is given. */
export const pos = (name: string): Arg => ({ pos: name });
/** Every member of a list field as its own positional. */
export const spread = (name: string): Arg => ({ spread: name });
/** A value-less flag that can also be switched off: true passes --flag, false passes --flag=false. */
export const onOff = (flag: string, name: string): Arg => ({ flag, field: name, as: 'bool3' });
/** A flag with a value. */
export const val = (flag: string, name: string): Arg => ({ flag, field: name, as: 'value' });
/** A value-less flag, passed when the boolean field is true. */
export const on = (flag: string, name: string): Arg => ({ flag, field: name, as: 'bool' });
/** A repeatable flag: one occurrence per list member. */
export const rep = (flag: string, name: string): Arg => ({ flag, field: name, as: 'repeat' });
/** A flag whose value is the list joined with commas. */
export const csv = (flag: string, name: string): Arg => ({ flag, field: name, as: 'csv' });
/** Fixed tokens the tool always passes (a prompt-suppressing flag, a --json field list). */
export const lit = (...tokens: string[]): Arg => ({ lit: tokens });
/** Fixed tokens passed only when `when` holds. */
export const litIf = (when: (input: ToolInput) => boolean, ...tokens: string[]): Arg => ({ lit: tokens, when });

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type OutSpec =
  /** {op, ok, target, message} */
  | { readonly kind: 'mutation' }
  /** {op, text} */
  | { readonly kind: 'text' }
  /** {op, count, rows} from tab-separated lines */
  | { readonly kind: 'rows' }
  /** {op, count, items} from tab-separated lines whose columns are known: each item has the named string properties */
  | { readonly kind: 'columns'; readonly columns: readonly string[] }
  /** {op, count, items}: gh's --json array, items with exactly the named fields (the tool adds --json itself) */
  | { readonly kind: 'items'; readonly jsonFields: readonly string[] }
  /** {op, ...shape}: gh's --json object, or a parser of the plain output, picked by the shape's keys */
  | { readonly kind: 'object'; readonly shape: Readonly<Record<string, TSchema>>; readonly jsonFields?: readonly string[]; readonly parse?: (stdout: string) => Record<string, unknown> | undefined };

export interface OpDef {
  readonly name: string;
  /** The gh words after `gh`, e.g. ['issue', 'delete']. */
  readonly command: readonly string[];
  readonly cls: ApprovalClass;
  /** Seconds. */
  readonly limitS: number;
  /** The op takes a -R repo (the field `repo`). */
  readonly repo?: boolean;
  readonly fields?: Readonly<Record<string, FieldSpec>>;
  readonly required?: readonly string[];
  /** Groups of which exactly one field is given. */
  readonly oneOf?: readonly (readonly string[])[];
  /** Groups of which at least one field is given. */
  readonly atLeastOne?: readonly (readonly string[])[];
  /** Groups of which at most one field is given. */
  readonly exclusive?: readonly (readonly string[])[];
  /** A field that may only be given with the fields listed. */
  readonly with?: Readonly<Record<string, readonly string[]>>;
  /** Any other rule between fields: the reason the input is refused, or undefined. */
  readonly check?: (input: ToolInput) => string | undefined;
  readonly args: readonly Arg[];
  /** Text sent on standard input (a value that must not be in argv). */
  readonly stdin?: (input: ToolInput) => string | undefined;
  /** The standard input is a secret: it is replaced by [redacted] wherever gh's text repeats it. */
  readonly secretStdin?: boolean;
  readonly out: OutSpec;
  /** The input identifier a mutation reports as its target when gh printed no URL. */
  readonly target?: (input: ToolInput) => string | undefined;
  /** The capture cap in bytes for a read whose answer can be long. */
  readonly maxBytes?: number;
}

// ---------------------------------------------------------------------------
// Input rules
// ---------------------------------------------------------------------------

/** A field has a value, even a false boolean. */
export function isSet(input: ToolInput, name: string): boolean {
  const v = input[name];
  return v !== undefined && v !== null;
}

/** A field is given unless it is absent, null or a false boolean. */
export function given(input: ToolInput, name: string): boolean {
  const v = input[name];
  return v !== undefined && v !== null && v !== false;
}

/** The reason an input is refused for its op, or undefined when it is acceptable. */
export function refuseInput(def: OpDef, input: ToolInput): string | undefined {
  const allowed = new Set<string>(['op', 'cwd', ...(def.repo === true ? ['repo'] : []), ...Object.keys(def.fields ?? {})]);
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== null && !allowed.has(k)) { return `op ${def.name} does not accept the field ${k}`; }
  }
  for (const k of def.required ?? []) {
    const v = input[k];
    if (v === undefined || v === null) { return `op ${def.name} needs the field ${k}`; }
  }
  for (const group of def.oneOf ?? []) {
    const n = group.filter(k => given(input, k)).length;
    if (n !== 1) { return `op ${def.name} needs exactly one of ${group.join(', ')}`; }
  }
  for (const group of def.atLeastOne ?? []) {
    if (!group.some(k => isSet(input, k))) { return `op ${def.name} needs at least one of ${group.join(', ')}`; }
  }
  for (const group of def.exclusive ?? []) {
    if (group.filter(k => given(input, k)).length > 1) { return `op ${def.name} takes at most one of ${group.join(', ')}`; }
  }
  for (const [k, partners] of Object.entries(def.with ?? {})) {
    if (given(input, k) && !partners.every(p => given(input, p))) { return `op ${def.name} accepts ${k} only together with ${partners.join(', ')}`; }
  }
  for (const [k, spec] of Object.entries(def.fields ?? {})) {
    const v = input[k];
    if (spec.kind === 'expr' && typeof v === 'string' && !isExpression(v)) {
      return `op ${def.name}: ${k} must be a number, size or date, a comparison (>100, >=2024-01-01) or a range (10..50)`;
    }
  }
  return def.check?.(input);
}

/** The argv of an op after `gh`: the command, the arguments in order, the JSON field list and -R. */
export function buildArgv(def: OpDef, input: ToolInput): string[] {
  const argv: string[] = ['gh', ...def.command];
  for (const a of def.args) {
    if ('pos' in a) {
      const v = input[a.pos];
      if (v !== undefined && v !== null) { argv.push(String(v)); }
    } else if ('spread' in a) {
      const v = input[a.spread];
      if (Array.isArray(v)) { argv.push(...v.map(String)); }
    } else if ('flag' in a) {
      const v = input[a.field];
      if (a.as === 'bool3') { if (v === true) { argv.push(a.flag); } else if (v === false) { argv.push(`${a.flag}=false`); } continue; }
      if (v === undefined || v === null || v === false) { continue; }
      if (a.as === 'bool') { argv.push(a.flag); }
      else if (a.as === 'repeat' && Array.isArray(v)) { for (const x of v) { argv.push(a.flag, String(x)); } }
      else if (a.as === 'csv' && Array.isArray(v)) { argv.push(a.flag, v.map(String).join(',')); }
      else { argv.push(a.flag, String(v)); }
    } else if (a.when === undefined || a.when(input)) {
      argv.push(...a.lit);
    }
  }
  if (def.out.kind === 'items' || (def.out.kind === 'object' && def.out.jsonFields !== undefined)) {
    argv.push('--json', (def.out.kind === 'items' ? def.out.jsonFields : def.out.jsonFields!).join(','));
  }
  if (def.repo === true && typeof input['repo'] === 'string' && input['repo'].length > 0) { argv.push('-R', input['repo']); }
  return argv;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** The flat input schema: op, cwd, repo where an op takes it, and every field of every op. A field two ops share must be the same. */
export function buildInputSchema(ops: readonly OpDef[]): TSchema {
  const schemas = new Map<string, TSchema>();
  for (const def of ops) {
    for (const [k, spec] of Object.entries(def.fields ?? {})) {
      const schema = fieldSchema(spec);
      const prior = schemas.get(k);
      // two ops may describe a shared field in their own words; its type, bounds and values must agree
      const bare = (t: TSchema): string => JSON.stringify({ ...t, description: undefined });
      if (prior !== undefined && bare(prior) !== bare(schema)) { throw new Error(`field ${k} is declared differently by two ops (op ${def.name})`); }
      schemas.set(k, schema);
    }
  }
  const out: Record<string, TSchema> = {
    op: Type.Unsafe<string>({ type: 'string', enum: ops.map(o => o.name), description: 'Which operation to run.' }),
    cwd: Type.Optional(Type.String({ description: 'Directory to run gh in.' })),
  };
  if (ops.some(o => o.repo === true)) { out['repo'] = Type.Optional(Type.String({ description: 'OWNER/NAME; default: the repository of the working directory.' })); }
  for (const [k, schema] of schemas) {
    // required in the schema only when every op requires it; the per-op rules are checked when the op runs
    out[k] = ops.every(o => (o.required ?? []).includes(k)) ? schema : Type.Optional(schema);
  }
  return Type.Object(out, { additionalProperties: false });
}

function outputMember(def: OpDef): TSchema {
  const op = Type.Literal(def.name);
  switch (def.out.kind) {
    case 'mutation': return Type.Object({ op, ok: Type.Boolean(), target: Type.String(), message: Type.String() });
    case 'text': return Type.Object({ op, text: Type.String() });
    case 'rows': return Type.Object({ op, count: Type.Number(), rows: Type.Array(Type.Array(Type.String())) });
    case 'columns': {
      const item = Type.Object(Object.fromEntries(def.out.columns.map(k => [k, Type.String()])));
      return Type.Object({ op, count: Type.Number(), items: Type.Array(item) });
    }
    case 'items': {
      const item = Type.Object(Object.fromEntries(def.out.jsonFields.map(k => [k, Type.Unknown()])));
      return Type.Object({ op, count: Type.Number(), items: Type.Array(item) });
    }
    case 'object': return Type.Object({ op, ...def.out.shape });
  }
}

/** The output union: one member per op, each with the literal op. */
export function buildOutputSchema(ops: readonly OpDef[]): TSchema {
  return Type.Union(ops.map(outputMember));
}

// ---------------------------------------------------------------------------
// The tool
// ---------------------------------------------------------------------------

export type GhFamilyTool = TypedTool & { readonly ops: readonly OpDef[] };

export function rejectInput(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg, failure: { kind: 'rejected', message: msg } };
}

const URL_RE = /https?:\/\/[^\s"',)}\]]+/;

function previewValue(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 300 ? `${s.slice(0, 300)}...[truncated]` : s;
}

/** Fields whose value is never echoed in a preview. */
const HIDDEN = new Set(['secretValue']);

function gateOf(id: string, def: OpDef | undefined, input: ToolInput): ToolApprovalGate {
  const lines = [`Op: **${String(input['op'])}**`];
  if (typeof input['repo'] === 'string') { lines.push(`Repo: **${input['repo']}**`); }
  for (const [k, v] of Object.entries(input)) {
    if (k === 'op' || k === 'repo' || k === 'cwd' || v === undefined || v === null) { continue; }
    lines.push(`${k}: ${HIDDEN.has(k) ? '(hidden)' : previewValue(v)}`);
  }
  void def;
  return { title: `${id} ${String(input['op'])}`, content: lines.join('\n'), actions: [{ name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' }] };
}

/** The result of one op from gh's outcome; a parse that cannot be done is a rejected failure. */
function shape(id: string, def: OpDef, input: ToolInput, stdout: string, stderr: string): ToolResult {
  const op = def.name;
  const bad = (msg: string): ToolResult => ({ output: `[${id}] ${msg}`, format: 'text', success: false, error: msg, failure: { kind: 'rejected', message: msg } });
  switch (def.out.kind) {
    case 'mutation': {
      const message = stdout.trim() || stderr.trim();
      const target = URL_RE.exec(stdout)?.[0] ?? def.target?.(input) ?? '';
      return { output: message || `${op} done`, format: 'text', success: true, data: { op, ok: true, target, message } };
    }
    case 'text': {
      return { output: stdout, format: 'text', success: true, data: { op, text: stdout } };
    }
    case 'rows': {
      const rows = parseTabRows(stdout);
      return { output: stdout, format: 'text', success: true, data: { op, count: rows.length, rows } };
    }
    case 'columns': {
      const cols = def.out.columns;
      const items = parseTabRows(stdout).map(r => Object.fromEntries(cols.map((c, n) => [c, r[n] ?? ''])));
      return { output: stdout, format: 'text', success: true, data: { op, count: items.length, items } };
    }
    case 'items': {
      const items = stdout.trim() === '' ? [] : parseJson<unknown[]>(stdout);
      if (!Array.isArray(items)) { return bad(`${op}: gh did not print a JSON list`); }
      return { output: JSON.stringify(items, null, 2), format: 'json', success: true, data: { op, count: items.length, items } };
    }
    case 'object': {
      const parsed = def.out.parse !== undefined ? def.out.parse(stdout) : parseJson<Record<string, unknown>>(stdout);
      if (parsed === undefined || parsed === null || typeof parsed !== 'object') { return bad(`${op}: gh did not print what was expected`); }
      const data: Record<string, unknown> = { op };
      for (const k of Object.keys(def.out.shape)) { data[k] = (parsed as Record<string, unknown>)[k]; }
      return { output: JSON.stringify(data, null, 2), format: 'json', success: true, data };
    }
  }
}

/**
 * Define a family tool from its ops. The ops' classes and limits are registered under `id.op`, so
 * ghApprovalClass and ghTimeoutMs know them, and the tool is wrapped in the failure net.
 */
export function defineGhFamily(spec: { id: string; description: string; ops: readonly OpDef[] }): GhFamilyTool {
  const { id, ops } = spec;
  const byName = new Map(ops.map(o => [o.name, o] as const));
  registerGhApproval(Object.fromEntries(ops.map(o => [`${id}.${o.name}`, o.cls])));
  registerGhLimits(Object.fromEntries(ops.map(o => [`${id}.${o.name}`, o.limitS])));
  const tool = {
    id,
    description: spec.description,
    inputSchema: buildInputSchema(ops),
    outputSchema: buildOutputSchema(ops),
    approval: (input: ToolInput) => ghApprovalClass(id, input),
    ops,

    buildApprovalGate(input: ToolInput): ToolApprovalGate {
      return gateOf(id, byName.get(String(input['op'])), input);
    },

    async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
      const def = byName.get(String(input['op']));
      if (def === undefined) { return rejectInput(id, `unknown op ${JSON.stringify(input['op'])}; the ops are ${ops.map(o => o.name).join(', ')}`); }
      const refusal = refuseInput(def, input);
      if (refusal !== undefined) { return rejectInput(id, refusal); }
      const argv = buildArgv(def, input);
      const stdin = def.stdin?.(input);
      const mutating = def.cls !== 'none';
      const o = await ghExec(argv, {
        cwd: typeof input['cwd'] === 'string' ? input['cwd'] : undefined,
        key: { toolId: id, op: def.name, mutating },
        ...(stdin !== undefined ? { input: stdin } : {}),
        ...(def.maxBytes !== undefined ? { maxBytes: def.maxBytes, cutIsAnswer: true } : {}),
        ...(deps.signal !== undefined ? { signal: deps.signal } : {}),
      });
      const failure = ghFailureOf(o, { mutating });
      if (failure !== undefined) {
        const hide = (t: string): string => def.secretStdin === true && stdin !== undefined && stdin.length > 0 ? t.split(stdin).join('[redacted]') : t;
        const clean = { ...failure, message: hide(failure.message), ...(failure.original !== undefined ? { original: hide(failure.original) } : {}) };
        return { output: `[${id} ${def.name}] ${clean.message}`, format: 'text', success: false, error: clean.message, failure: clean };
      }
      return shape(id, def, input, o.stdout, o.stderr);
    },
  };
  return withGhFailureNet(tool as unknown as GhFamilyTool);
}
