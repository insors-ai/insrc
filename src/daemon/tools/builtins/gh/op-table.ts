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

export type FieldKind = 'string' | 'integer' | 'boolean' | 'strings' | 'enum' | 'enums' | 'expr';

export interface FieldSpec {
  readonly kind: FieldKind;
  readonly values?: readonly string[];
  readonly minimum?: number;
  readonly description?: string;
  /** A string that may be empty (a description cleared on purpose). */
  readonly empty?: boolean;
  /**
   * A JSON-schema pattern a string value must match, as a STRING (not a RegExp): buildInputSchema compares a field two
   * ops share as JSON, which would hide a RegExp. The executor checks the input schema before it asks for approval, so
   * a value outside the pattern is refused before any prompt.
   */
  readonly pattern?: string;
}

/** An owner, repo, org or login: letters, digits, '.', '_' and '-', and not '.' or '..'. It refuses '/', '?', '#', '%', whitespace and non-ASCII. */
export const NAME_PATTERN = '^(?!\\.{1,2}$)[A-Za-z0-9._-]+$';

const EXPR_PART = /^[\w:+*-]*(?:\.[\w:+*-]+)*$/;

/** A search qualifier gh documents as a number, a size or a date: a bare value, a comparison (>100, >=2024-01-01) or one range (10..50, *..10). */
export function isExpression(v: string): boolean {
  if (v.length === 0 || /\s/.test(v)) { return false; }
  if (v.includes('..')) {
    const parts = v.split('..');
    return parts.length === 2 && parts.some(p => p.length > 0) && parts.every(p => EXPR_PART.test(p));
  }
  return /^(?:>=|<=|>|<)?[\w.:+*-]+$/.test(v);
}

export const field = {
  str: (description?: string, empty = false): FieldSpec => ({ kind: 'string', ...(description ? { description } : {}), ...(empty ? { empty } : {}) }),
  int: (description?: string, minimum = 1): FieldSpec => ({ kind: 'integer', minimum, ...(description ? { description } : {}) }),
  bool: (description?: string): FieldSpec => ({ kind: 'boolean', ...(description ? { description } : {}) }),
  strs: (description?: string): FieldSpec => ({ kind: 'strings', ...(description ? { description } : {}) }),
  oneOf: (values: readonly string[], description?: string): FieldSpec => ({ kind: 'enum', values, ...(description ? { description } : {}) }),
  /** A list whose members are each one of the values. */
  manyOf: (values: readonly string[], description?: string): FieldSpec => ({ kind: 'enums', values, ...(description ? { description } : {}) }),
  /** A string holding a comparison or range such as >100, 10..50 or >=2024-01-01. */
  /** An owner, repo, org or login (see NAME_PATTERN). */
  name: (description?: string): FieldSpec => ({ kind: 'string', pattern: NAME_PATTERN, ...(description ? { description } : {}) }),
  expr: (description?: string): FieldSpec => ({ kind: 'expr', description: description ?? 'A number, size or date; comparisons and ranges are allowed (>100, 10..50, >=2024-01-01).' }),
};

export function fieldSchema(spec: FieldSpec): TSchema {
  const d = spec.description !== undefined ? { description: spec.description } : {};
  switch (spec.kind) {
    case 'string': return Type.String({ ...(spec.empty === true ? {} : { minLength: 1 }), ...(spec.pattern !== undefined ? { pattern: spec.pattern } : {}), ...d });
    case 'expr': return Type.String({ ...(spec.empty === true ? {} : { minLength: 1 }), ...d });
    case 'integer': return Type.Integer({ minimum: spec.minimum ?? 1, ...d });
    case 'boolean': return Type.Boolean(d);
    case 'strings': return Type.Array(Type.String({ minLength: 1 }), { minItems: 1, ...d });
    case 'enum': return Type.Unsafe<string>({ type: 'string', enum: [...(spec.values ?? [])], ...d });
    case 'enums': return Type.Unsafe<string[]>({ type: 'array', items: { type: 'string', enum: [...(spec.values ?? [])] }, minItems: 1, ...d });
  }
}

// ---------------------------------------------------------------------------
// Argv
// ---------------------------------------------------------------------------

export type Arg =
  | { readonly pos: string }
  | { readonly spread: string }
  | { readonly last: string }
  | { readonly flag: string; readonly field: string; readonly as?: 'value' | 'bool' | 'bool3' | 'repeat' | 'csv' }
  | { readonly lit: readonly string[]; readonly when?: (input: ToolInput) => boolean }
  | { readonly path: readonly (string | { readonly field: string })[] }
  | { readonly kv: string; readonly flag: '-f' | '-F'; readonly field: string; readonly repeat?: boolean }
  | { readonly qs: readonly QsEntry[] };

/**
 * One entry of a query string: a FIXED constant (never from input), or a value from an input field. A string or integer
 * field is percent-encoded; a list field needs join ',' and is emitted as its members, each encoded, joined by a literal ','.
 */
export type QsEntry =
  | { readonly key: string; readonly value: string }
  | { readonly key: string; readonly field: string; readonly optional?: boolean; readonly join?: ',' };

/** A positional taken from a field when it is given. */
export const pos = (name: string): Arg => ({ pos: name });
/** A positional at the very end; a value that starts with '-' (a search query such as -label:bug) goes after `--`. */
export const last = (name: string): Arg => ({ last: name });
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
/**
 * One positional built from fixed text and input fields, each field value percent-encoded (so '/', '?', '#', '%' and
 * Unicode cannot change the path): apiPath('repos/', {field: 'owner'}, '/', {field: 'repo'}, '/issues').
 */
export const apiPath = (...parts: readonly (string | { readonly field: string })[]): Arg => ({ path: parts });
/** gh api's -f / -F pair: `key=<value>`; with `repeat` one pair per member of a list field (the key being e.g. 'labels[]'). A field that is absent emits nothing. */
export const kvField = (flag: '-f' | '-F', key: string, name: string, repeat = false): Arg => ({ kv: key, flag, field: name, ...(repeat ? { repeat } : {}) });
/** The query string of the path positional before it: `?key=value&key=value` in the order declared; no entry left means no '?'. */
export const query = (...entries: readonly QsEntry[]): Arg => ({ qs: entries });
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
  /** {op, count, items} with one item per non-blank line, the line in the named property */
  | { readonly kind: 'lines'; readonly property: string }
  /** {op, text, truncated}: a read whose text is cut at the op's maxBytes and says so */
  | { readonly kind: 'textCapped' }
  /** {op, ...shape} built by the op itself (a text conversion, a deterministic parse); it returns the data or a failed result */
  | { readonly kind: 'custom'; readonly shape: Readonly<Record<string, TSchema>>; readonly build: (ctx: BuildContext) => Promise<Record<string, unknown> | ToolResult> }
  | { readonly kind: 'object'; readonly shape: Readonly<Record<string, TSchema>>; readonly jsonFields?: readonly string[]; readonly parse?: (stdout: string) => Record<string, unknown> | undefined };

export interface BuildContext {
  readonly stdout: string;
  readonly stderr: string;
  readonly input: ToolInput;
  readonly deps: ToolDeps;
  readonly truncated: boolean;
}

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
  /** A sentence the approval preview carries for this op (a consequence the person should see). */
  readonly notice?: string;
  /** The capture cap in bytes for a read whose answer can be long. */
  readonly maxBytes?: number;
  /**
   * Opt in to keeping gh's own text of a command-exit failure in failure.original (capped at FAILURE_ORIGINAL_MAX_CHARS),
   * for a caller that reads it (the typed-issue fallback reads the API's 422 text). Other ops keep today's failures.
   */
  readonly diagnostic?: 'stderr';
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
export function refuseInput(def: OpDef, input: ToolInput, opts: { dashSafe?: boolean } = {}): string | undefined {
  const allowed = new Set<string>(['op', 'cwd', ...(def.repo === true ? ['repo'] : []), ...Object.keys(def.fields ?? {})]);
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== null && !allowed.has(k)) { return `op ${def.name} does not accept the field ${k}`; }
  }
  for (const k of def.required ?? []) {
    const v = input[k];
    if (v === undefined || v === null) { return `op ${def.name} needs the field ${k}`; }
  }
  // a positional that starts with '-' would be read by gh as a flag
  for (const a of opts.dashSafe === true ? def.args : []) {
    const name = 'pos' in a ? a.pos : 'spread' in a ? a.spread : undefined;
    if (name === undefined) { continue; }
    const v = input[name];
    for (const x of Array.isArray(v) ? v : [v]) {
      if (typeof x === 'string' && x.startsWith('-')) { return `op ${def.name}: ${name} must not start with '-' (gh would read it as a flag)`; }
    }
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
    if ((spec.kind === 'enum' || spec.kind === 'enums') && v !== undefined && v !== null) {
      const bad = (Array.isArray(v) ? v : [v]).find(x => !(spec.values ?? []).includes(String(x)));
      if (bad !== undefined) { return `op ${def.name}: ${k} must be one of ${(spec.values ?? []).join(', ')}`; }
    }
    if (spec.kind === 'expr' && typeof v === 'string' && !isExpression(v)) {
      return `op ${def.name}: ${k} must be a number, size or date, a comparison (>100, >=2024-01-01) or a range (10..50)`;
    }
  }
  return def.check?.(input);
}

/** The argv of an op after `gh`: the command, the arguments in order, the JSON field list and -R. */
export function buildArgv(def: OpDef, input: ToolInput): string[] {
  const argv: string[] = ['gh', ...def.command];
  const tail: string[] = [];
  /** Where the last path positional is in argv, so the query that follows it can be appended. */
  let pathIndex = -1;
  const encoded = (name: string, v: unknown): string => encodeURIComponent(String(v));
  for (const a of def.args) {
    if ('path' in a) {
      pathIndex = argv.length;
      argv.push(a.path.map(part => {
        if (typeof part === 'string') { return part; }
        const v = input[part.field];
        if (v === undefined || v === null) { throw new Error(`op ${def.name}: the path needs the field ${part.field}`); }
        return encoded(part.field, v);
      }).join(''));
    } else if ('qs' in a) {
      if (pathIndex < 0) { throw new Error(`op ${def.name}: a query string needs a path before it`); }
      const pairs: string[] = [];
      for (const e of a.qs) {
        if ('value' in e) { pairs.push(`${e.key}=${e.value}`); continue; }
        const v = input[e.field];
        if (v === undefined || v === null) {
          if (e.optional === true) { continue; }
          throw new Error(`op ${def.name}: the query needs the field ${e.field}`);
        }
        if (Array.isArray(v)) {
          if (e.join !== ',') { throw new Error(`op ${def.name}: the list field ${e.field} needs join ','`); }
          pairs.push(`${e.key}=${v.map(x => encoded(e.field, x)).join(',')}`);
        } else { pairs.push(`${e.key}=${encoded(e.field, v)}`); }
      }
      if (pairs.length > 0) { argv[pathIndex] = `${argv[pathIndex]}?${pairs.join('&')}`; }
    } else if ('kv' in a) {
      const v = input[a.field];
      if (v === undefined || v === null) { continue; }
      if (Array.isArray(v)) {
        if (a.repeat !== true) { throw new Error(`op ${def.name}: the list field ${a.field} needs repeat`); }
        for (const x of v) { argv.push(a.flag, `${a.kv}=${String(x)}`); }
      } else { argv.push(a.flag, `${a.kv}=${String(v)}`); }
    } else if ('pos' in a) {
      const v = input[a.pos];
      if (v !== undefined && v !== null) { argv.push(String(v)); }
    } else if ('spread' in a) {
      const v = input[a.spread];
      if (Array.isArray(v)) { argv.push(...v.map(String)); }
    } else if ('last' in a) {
      const v = input[a.last];
      // only a value that starts with '-' needs `--`, so the usual argv ends with the query and a check can append --help
      if (v !== undefined && v !== null) { tail.push(...(String(v).startsWith('-') ? ['--'] : []), String(v)); }
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
  return [...argv, ...tail];
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** The flat input schema: op, cwd, repo where an op takes it, and every field of every op. A field two ops share must be the same. */
export function buildInputSchema(ops: readonly OpDef[]): TSchema {
  const specs = new Map<string, FieldSpec>();
  for (const def of ops) {
    for (const [k, spec] of Object.entries(def.fields ?? {})) {
      const prior = specs.get(k);
      if (prior === undefined) { specs.set(k, spec); continue; }
      // two ops may describe a shared field in their own words, and may allow different values of an enum (each op
      // checks its own); anything else about the field must agree
      const bare = (t: FieldSpec): string => JSON.stringify({ ...t, description: undefined, values: undefined });
      if (bare(prior) !== bare(spec)) { throw new Error(`field ${k} is declared differently by two ops (op ${def.name})`); }
      if (prior.values !== undefined || spec.values !== undefined) {
        specs.set(k, { ...prior, values: [...new Set([...(prior.values ?? []), ...(spec.values ?? [])])] });
      }
    }
  }
  const out: Record<string, TSchema> = {
    op: Type.Unsafe<string>({ type: 'string', enum: ops.map(o => o.name), description: 'Which operation to run.' }),
    cwd: Type.Optional(Type.String({ description: 'Directory to run gh in.' })),
  };
  if (ops.some(o => o.repo === true)) { out['repo'] = Type.Optional(Type.String({ description: 'OWNER/NAME; default: the repository of the working directory.' })); }
  for (const [k, spec] of specs) {
    const schema = fieldSchema(spec);
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
    case 'lines': return Type.Object({ op, count: Type.Number(), items: Type.Array(Type.Object({ [def.out.property]: Type.String() })) });
    case 'textCapped': return Type.Object({ op, text: Type.String(), truncated: Type.Boolean() });
    case 'custom': return Type.Object({ op, ...def.out.shape });
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
  if (def?.notice !== undefined) { lines.push('', def.notice); }
  return { title: `${id} ${String(input['op'])}`, content: lines.join('\n'), actions: [{ name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' }] };
}

/** The result of one op from gh's outcome; a parse that cannot be done is a rejected failure. */
async function shape(id: string, def: OpDef, input: ToolInput, stdout: string, stderr: string, deps: ToolDeps, truncated: boolean): Promise<ToolResult> {
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
    case 'lines': {
      const property = def.out.property;
      const items = stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0).map(l => ({ [property]: l }));
      return { output: stdout, format: 'text', success: true, data: { op, count: items.length, items } };
    }
    case 'textCapped': {
      return { output: stdout, format: 'text', success: true, data: { op, text: stdout, truncated } };
    }
    case 'custom': {
      const built = await def.out.build({ stdout, stderr, input, deps, truncated });
      if ('success' in built && 'output' in built && typeof built['success'] === 'boolean') { return built as ToolResult; }
      return { output: JSON.stringify({ op, ...built }, null, 2), format: 'json', success: true, data: { op, ...built } };
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
export function defineGhFamily(spec: { id: string; description: string; ops: readonly OpDef[]; dashSafe?: boolean }): GhFamilyTool {
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
      const refusal = refuseInput(def, input, { dashSafe: spec.dashSafe === true });
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
      const failure = ghFailureOf(o, { mutating, ...(def.diagnostic !== undefined ? { diagnostic: def.diagnostic } : {}) });
      if (failure !== undefined) {
        const hide = (t: string): string => def.secretStdin === true && stdin !== undefined && stdin.length > 0 ? t.split(stdin).join('[redacted]') : t;
        const clean = { ...failure, message: hide(failure.message), ...(failure.original !== undefined ? { original: hide(failure.original) } : {}) };
        return { output: `[${id} ${def.name}] ${clean.message}`, format: 'text', success: false, error: clean.message, failure: clean };
      }
      return shape(id, def, input, o.stdout, o.stderr, deps, o.stdoutTruncated);
    },
  };
  return withGhFailureNet(tool as unknown as GhFamilyTool);
}
