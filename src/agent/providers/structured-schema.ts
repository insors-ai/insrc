/** Pure structured schema normalization/validation, without provider construction or proof loading. */
import { type ErrorObject, type ValidateFunction } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import ajvFormats from 'ajv-formats';
import { formatNames } from 'ajv-formats/dist/formats.js';
import type { StructuredSchema } from '../../shared/types.js';
import type { ValidationResult } from './structured-output.js';

export function formatAjvError(e: ErrorObject): string {
	const path = e.instancePath.length > 0 ? e.instancePath : '/';
	const msg  = e.message ?? '(no message)';
	// Surface keyword + params for schema-author debugging.
	const detail = e.params !== undefined && Object.keys(e.params).length > 0
		? ` (${JSON.stringify(e.params)})`
		: '';
	return `${path}: ${msg}${detail}`;
}

// ---------------------------------------------------------------------------
// OpenAI strict-mode schema preprocessor
// ---------------------------------------------------------------------------

/**
 * Port of `insors-extraction`'s `OpenAISchemaProcessor`. OpenAI's
 * `response_format: { type: 'json_schema', strict: true }` rejects
 * schemas that don't meet three rules:
 *
 *   1. Every object MUST declare `additionalProperties: false` UNLESS
 *      it's a "pure dictionary" (the only property is an
 *      `additionalProperties` schema with no fixed `properties`).
 *   2. Every non-dictionary property MUST appear in the `required`
 *      array. (Strict mode treats every property as required; optional
 *      fields are modelled via union with `null`.)
 *   3. `oneOf` is prohibited. Rewrite to `anyOf` -- semantics differ
 *      only when multiple branches match, which strict-mode schemas
 *      shouldn't allow anyway.
 *
 * Mutates the schema in place AND returns it (caller can use either
 * pattern). Idempotent: running twice == running once.
 */
export function processSchemaForOpenAIStrict(schema: StructuredSchema): StructuredSchema {
	processInPlace(schema as Record<string, unknown>);
	return schema;
}

function processInPlace(node: unknown): void {
	if (Array.isArray(node)) {
		for (const item of node) { processInPlace(item); }
		return;
	}
	if (typeof node !== 'object' || node === null) { return; }
	const obj = node as Record<string, unknown>;

	// Rewrite oneOf -> anyOf BEFORE recursing into branches.
	if (Array.isArray(obj['oneOf'])) {
		obj['anyOf'] = obj['oneOf'];
		delete obj['oneOf'];
	}

	// Object-type schemas need additionalProperties:false + full required.
	if (obj['type'] === 'object') {
		const properties = obj['properties'];
		const hasFixedProps = isObject(properties) && Object.keys(properties).length > 0;
		const isPureDictionary = !hasFixedProps && isObject(obj['additionalProperties']);
		if (!isPureDictionary) {
			if (obj['additionalProperties'] === undefined) {
				obj['additionalProperties'] = false;
			}
			if (hasFixedProps) {
				const propsObj = properties as Record<string, unknown>;
				obj['required'] = Object.keys(propsObj);
			}
		}
	}

	// Per-property MAPS: each value is itself a schema. `properties`,
	// `patternProperties`, `definitions`, `$defs` all have this shape.
	for (const mapKey of ['properties', 'patternProperties', 'definitions', '$defs'] as const) {
		const m = obj[mapKey];
		if (isObject(m)) {
			for (const k of Object.keys(m)) {
				processInPlace(m[k]);
			}
		}
	}

	// Single-schema fields. `items` can be a single schema OR an array
	// (tuple validation); processInPlace handles both via its
	// Array.isArray fast-path.
	for (const schemaKey of ['items', 'additionalProperties', 'not', 'if', 'then', 'else'] as const) {
		if (obj[schemaKey] !== undefined) {
			processInPlace(obj[schemaKey]);
		}
	}

	// Schema-array fields. Each entry is itself a schema.
	for (const arrKey of ['anyOf', 'allOf'] as const) {
		const arr = obj[arrKey];
		if (Array.isArray(arr)) {
			for (const item of arr) { processInPlace(item); }
		}
	}
}

/**
 * The keywords the codex copy of a schema keeps: those probed against the
 * codex CLI's strict `--output-schema` and accepted (2026-10-18; the probe and
 * its raw results are in docs/standalone/send-codex-only-schema-keywords-strict-
 * E20261017487ad7a6/S001/codex-strict-probe.md). Every other keyword is left
 * out: the refused ones (uniqueItems, contains, not, allOf, if/then/else,
 * propertyNames, minProperties, maxProperties) and any never probed. A codex
 * reply is then held to the caller's full schema by `validateCodexReply`.
 * `oneOf` is kept because the strict form rewrites it to the accepted `anyOf`.
 */
const CODEX_KEPT_KEYWORDS: ReadonlySet<string> = new Set([
	'type', 'properties', 'required', 'additionalProperties', 'items', 'anyOf', 'oneOf',
	'$ref', '$defs', 'definitions', 'patternProperties',
	'enum', 'const', 'default', 'description', 'title', 'examples',
	'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern',
	'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
	'format',
]);

/** Keywords whose value maps names to schemas, and those whose value is a schema or a list of them. */
const SCHEMA_MAPS = ['properties', 'patternProperties', '$defs', 'definitions'] as const;
const SCHEMA_VALUES = ['items', 'additionalProperties', 'anyOf', 'oneOf'] as const;

/** The only `format` codex answered in the probe; with `uri` or `email` codex never answered. */
const CODEX_FORMATS: ReadonlySet<string> = new Set(['date-time']);

/** The formats `validateCodexReply` enforces. */
const CHECKED_FORMATS: ReadonlySet<string> = new Set(formatNames);

/**
 * The copy of `schema` that codex's strict mode accepts: only the kept
 * keywords and no `format` but `date-time`, then the strict form of
 * `processSchemaForOpenAIStrict`. The caller's schema is not modified
 * (ISSUE-487ad7a67474d321). Throws for a `format` the reply check cannot
 * enforce: it can neither be sent (never probed) nor left out (nothing would
 * hold it).
 */
export function codexStrictSchema(schema: StructuredSchema): StructuredSchema {
	const unchecked = uncheckedFormat(schema);
	if (unchecked !== undefined) {
		throw new Error(`structured-output: codex cannot be given format '${unchecked}': it was never probed against codex, and the reply check does not know it, so leaving it out would drop the constraint`);
	}
	// The ref check reads the FINAL copy: the strict form renames oneOf to anyOf, which moves a ref's target.
	const copy = processSchemaForOpenAIStrict(keepCodexKeywords(schema) as StructuredSchema);
	const dangling = danglingRef(copy, copy);
	if (dangling !== undefined) {
		throw new Error(`structured-output: codex cannot be given this schema: its $ref '${dangling}' points into a part the codex copy leaves out`);
	}
	return copy;
}

/** The first local `$ref` in `node` whose JSON pointer does not resolve in `root`. */
function danglingRef(node: unknown, root: unknown): string | undefined {
	if (Array.isArray(node)) {
		for (const item of node) { const d = danglingRef(item, root); if (d !== undefined) return d; }
		return undefined;
	}
	if (!isObject(node)) return undefined;
	for (const [key, value] of Object.entries(node)) {
		if (key === '$ref' && typeof value === 'string' && value.startsWith('#') && !resolvesIn(root, value)) return value;
		if (DATA_KEYWORDS.has(key)) continue;
		const d = NAMED_SCHEMA_MAPS.has(key) && isObject(value)
			? danglingRef(Object.values(value), root)
			: danglingRef(value, root);
		if (d !== undefined) return d;
	}
	return undefined;
}

function resolvesIn(root: unknown, ref: string): boolean {
	const path = ref.slice(1);
	if (path === '') return true;
	if (!path.startsWith('/')) return false;   // a named anchor: kept keywords hold none
	let at: unknown = root;
	for (const raw of path.slice(1).split('/')) {
		const part = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
		if (Array.isArray(at)) at = at[Number(part)];
		else if (isObject(at)) at = at[part];
		else return false;
		if (at === undefined) return false;
	}
	return true;
}

/** Keywords whose value is data, not a schema. */
const DATA_KEYWORDS: ReadonlySet<string> = new Set(['enum', 'const', 'default', 'examples']);

/** Keywords whose value maps NAMES to schemas: a name there is never a keyword, whatever it reads. */
const NAMED_SCHEMA_MAPS: ReadonlySet<string> = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas', 'dependencies']);

/** The first `format` anywhere in the schema, kept branches or not, that the reply check does not know. */
function uncheckedFormat(node: unknown): string | undefined {
	if (Array.isArray(node)) {
		for (const item of node) { const f = uncheckedFormat(item); if (f !== undefined) return f; }
		return undefined;
	}
	if (!isObject(node)) return undefined;
	for (const [key, value] of Object.entries(node)) {
		if (DATA_KEYWORDS.has(key)) continue;
		if (key === 'format' && typeof value === 'string') {
			if (!CHECKED_FORMATS.has(value)) return value;
			continue;
		}
		const f = NAMED_SCHEMA_MAPS.has(key) && isObject(value)
			? uncheckedFormat(Object.values(value))
			: uncheckedFormat(value);
		if (f !== undefined) return f;
	}
	return undefined;
}

function keepCodexKeywords(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(keepCodexKeywords);
	if (!isObject(node)) return node;
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(node)) {
		if (!CODEX_KEPT_KEYWORDS.has(key)) continue;
		if (key === 'format' && typeof value === 'string' && !CODEX_FORMATS.has(value)) continue;   // checked on the reply
		if ((SCHEMA_MAPS as readonly string[]).includes(key) && isObject(value)) {
			out[key] = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, keepCodexKeywords(sub)]));
		} else if ((SCHEMA_VALUES as readonly string[]).includes(key)) {
			out[key] = keepCodexKeywords(value);
		} else {
			out[key] = structuredClone(value);   // data: enum, const, default, examples, required, ...
		}
	}
	return out;
}

/**
 * The check for a codex reply against the caller's FULL schema: the copy codex
 * is given leaves constraints out (`codexStrictSchema`), and this is where
 * they hold. Unlike `validateAgainstSchema` it reads draft 2020-12 (so
 * `prefixItems`, `unevaluatedItems` and `dependentSchemas` hold) and enforces
 * `format` (ISSUE-487ad7a67474d321).
 */
export function validateCodexReply<T>(schema: StructuredSchema, raw: unknown): ValidationResult<T> {
	let validate: ValidateFunction;
	try {
		validate = codexReplyAjv.compile(schema);
	} catch (err) {
		return { ok: false, errors: [`ajv.compile failed: ${(err as Error).message}`] };
	}
	if (validate(raw)) {
		return { ok: true, value: raw as T };
	}
	return { ok: false, errors: (validate.errors ?? []).map(formatAjvError) };
}

const codexReplyAjv = new Ajv2020({ allErrors: true, useDefaults: false, removeAdditional: false, strict: false });
// A CommonJS module: under NodeNext its default import is the whole module, whose `default` is the plugin.
ajvFormats.default(codexReplyAjv);

function isObject(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null && !Array.isArray(x);
}


// ---------------------------------------------------------------------------
// Root-level union detection (cross-vendor CLI constraint)
// ---------------------------------------------------------------------------

/** The three JSON Schema combinator keywords both CLI vendors refuse at the
 *  schema ROOT. Ordered so the reported key is deterministic when a root
 *  carries more than one. */
const ROOT_UNION_KEYS = ['oneOf', 'anyOf', 'allOf'] as const;

export type RootUnionKey = typeof ROOT_UNION_KEYS[number];

/**
 * Report the root-level union keyword a schema carries, or `undefined`.
 *
 * Both CLI vendors refuse a combinator at the TOP LEVEL of a structured-output
 * schema, and a root `type: 'object'` does NOT exempt it. Probed directly
 * against both binaries on 2026-10-03:
 *
 *   claude --json-schema  -> 400 input_schema does not support oneOf, allOf,
 *                            or anyOf at the top level
 *   codex --output-schema -> schema must have type 'object' and not have
 *                            'oneOf'/'anyOf'/'allOf'/'enum'/'not' at the top
 *                            level
 *
 * Deliberately NARROW, and each limit is a recorded decision rather than an
 * oversight:
 *
 *   - ROOT-ONLY. Only the schema's own keys are read; nothing recurses. A union
 *     BELOW the root is legal on both vendors -- `processInPlace` above walks
 *     straight through `anyOf`/`allOf` branches -- so a tree walk here would
 *     reject schemas that work today. Over-rejection breaks callers; under-
 *     rejection merely restores current behaviour.
 *   - `enum`/`not` are NOT covered. codex's message names them; claude's does
 *     not, and claude was never probed on them. Covering them would assert an
 *     unverified vendor behaviour, which is the mistake this guard replaced.
 *   - A root `$ref` is NOT resolved. Whether either vendor resolves a pointer
 *     before refusing was not probed. In practice a bare root `$ref` already
 *     fails on both for the separate missing-root-`type` rule, so the blind
 *     spot cannot hide a schema that would otherwise have worked.
 *   - An EMPTY branch array is not reported: the vendors' behaviour on a
 *     degenerate `{ anyOf: [] }` was not established.
 *
 * Total over any input and free of side effects -- a guard that can itself
 * throw, or that mutates its caller's schema, is worse than no guard. Note the
 * contrast with `processSchemaForOpenAIStrict`, which mutates in place.
 */
export function rootUnionKey(schema: StructuredSchema): RootUnionKey | undefined {
	if (!isObject(schema)) return undefined;
	for (const key of ROOT_UNION_KEYS) {
		const branches = schema[key];
		if (Array.isArray(branches) && branches.length > 0) return key;
	}
	return undefined;
}


