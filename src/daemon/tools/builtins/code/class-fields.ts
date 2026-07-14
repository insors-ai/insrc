/**
 * code_class_fields -- typed field extraction for a class entity
 * (code-analyzer-skills.md Phase 0.2).
 *
 * Strategy is per-language because each parser handles class members
 * differently:
 *
 *   - **Java / Scala**: the parser already emits class fields as
 *     `kind: 'variable'` entities with a `DEFINES` edge from the class
 *     (java.ts:539-565, scala.ts:559-590). Walk the edge, hydrate the
 *     children, parse `signature` + `body` for type / nullable / default
 *     / modifiers.
 *
 *   - **TypeScript / JavaScript / Python / Go**: the parser stores the
 *     entire class body in the `body` field of the class entity but
 *     does NOT emit per-field entities. Regex-parse the class body
 *     directly. Best-effort -- drops fields we can't classify rather
 *     than guessing wrong.
 *
 * This dispatch keeps each Phase 3 skill (especially
 * `code.class.extract-fields`) language-agnostic: callers pass the
 * `entityId` resolved from `code_class_locate` and get a uniform
 * `Field[]` back regardless of source language.
 *
 * Tool id: `code_class_fields`. The `code` underscore-segment is
 * already in `ALL_CATEGORIES` (tools/config.ts:88) -- no gate hop.
 */

import { getLogger } from '../../../../shared/logger.js';
import { registerTool } from '../../registry.js';
import type { Tool, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { getEntity } from '../../../../db/entities.js';
import { findDefinedIn } from '../../../../db/search.js';
import type { Entity, EntityKind, Language } from '../../../../shared/types.js';

const log = getLogger('code-class-fields');

const CLASS_LIKE_KINDS: ReadonlySet<EntityKind> = new Set(['class', 'interface', 'type']);

const DEFAULT_VALUE_MAX_LEN = 80;

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export interface FieldInfo {
	readonly name:       string;
	readonly type?:      string;
	readonly nullable?:  boolean;
	readonly default?:   string;
	readonly modifiers?: readonly string[];
	readonly declaredAt: { readonly path: string; readonly line: number };
}

interface FieldsOutput {
	readonly entityId:  string;
	readonly className: string;
	readonly language:  Language;
	readonly fields:    readonly FieldInfo[];
	/**
	 * Source of truth for the extraction:
	 *   - 'graph'   : walked DEFINES edges to per-field variable entities
	 *   - 'body'    : regex-parsed the class body (TS/JS/Python/Go)
	 *   - 'mixed'   : both (graph children and body fallback for
	 *     declarations the graph doesn't surface, e.g. lambdas)
	 *   - 'none'    : no extractor for this language; callers should
	 *     treat fields as unavailable rather than empty
	 */
	readonly source: 'graph' | 'body' | 'mixed' | 'none';
}

const codeClassFieldsTool: Tool = {
	id: 'code_class_fields',
	description:
		'Return typed field metadata for a class entity. Input: `{ entityId }` (resolve via ' +
		'`code_class_locate` first). Output: `{ className, language, fields: [{ name, type?, ' +
		'nullable?, default?, modifiers?, declaredAt: {path, line} }], source }`. Java / Scala ' +
		'walk the DEFINES edge to per-field `variable` entities; TS / JS / Python / Go regex-parse ' +
		'the class body. Best-effort -- drops unparseable fields rather than fabricating types. ' +
		'Read-only; no approval gate.',
	inputSchema: {
		type: 'object',
		properties: {
			entityId: {
				type: 'string',
				description: 'Class entity id (32-char hex from `code_class_locate`).',
				minLength: 32,
				maxLength: 32,
			},
		},
		required: ['entityId'],
		additionalProperties: false,
	},
	requiresApproval: false,

	async execute(input: ToolInput, _deps: ToolDeps): Promise<ToolResult> {
		const entityId = typeof input['entityId'] === 'string' ? input['entityId'] : '';
		if (entityId.length === 0) {
			return fail('entityId is required');
		}

		const classEntity = await getEntity(null, entityId);
		if (classEntity === null) {
			return fail(`entity not found: ${entityId}`);
		}
		if (!CLASS_LIKE_KINDS.has(classEntity.kind)) {
			return fail(
				`entity ${entityId} is kind '${classEntity.kind}', not a class-like kind ` +
				`(class / interface / type). Resolve a class entity via code_class_locate first.`,
			);
		}

		const { fields, source } = await extractFields(classEntity);

		const out: FieldsOutput = {
			entityId,
			className: stripClassQualifier(classEntity.name),
			language:  classEntity.language,
			fields,
			source,
		};

		log.info(
			{ entityId, className: out.className, language: classEntity.language,
				fieldCount: fields.length, source },
			'code_class_fields',
		);

		return ok(out);
	},
};

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

async function extractFields(
	classEntity: Entity,
): Promise<{ fields: FieldInfo[]; source: FieldsOutput['source'] }> {
	const variableChildren = (await findDefinedIn(null, classEntity.id))
		.filter(e => e.kind === 'variable');

	const graphFields = variableChildren.map(v => fieldFromVariableEntity(v, classEntity.name));

	switch (classEntity.language) {
		case 'java':
		case 'scala':
			// Parser emits per-field variables -- graph is authoritative.
			// Empty fields are real (a class with no fields).
			return { fields: graphFields, source: 'graph' };

		case 'typescript':
		case 'javascript':
		case 'python':
		case 'go':
			// Parser stores the class as a single body blob; regex-parse it.
			// If the parser ever starts emitting per-field variables for these
			// languages we'll get a 'mixed' result and the body fallback can
			// be retired without breaking callers.
			return mergeBodyAndGraph(
				graphFields,
				extractFromBody(classEntity),
			);

		default:
			return { fields: graphFields, source: graphFields.length > 0 ? 'graph' : 'none' };
	}
}

function mergeBodyAndGraph(
	graph: FieldInfo[],
	body:  FieldInfo[],
): { fields: FieldInfo[]; source: FieldsOutput['source'] } {
	if (graph.length === 0 && body.length === 0) {
		return { fields: [], source: 'body' }; // body extractor ran, just found nothing
	}
	if (graph.length === 0) return { fields: body,  source: 'body' };
	if (body.length === 0)  return { fields: graph, source: 'graph' };

	// Dedupe by name -- prefer graph entries (richer metadata).
	const seen = new Set<string>(graph.map(f => f.name));
	const merged = [...graph];
	for (const f of body) {
		if (!seen.has(f.name)) merged.push(f);
	}
	return { fields: merged, source: 'mixed' };
}

// ---------------------------------------------------------------------------
// Graph-side extraction (Java / Scala variable children)
// ---------------------------------------------------------------------------

function fieldFromVariableEntity(v: Entity, className: string): FieldInfo {
	const localName = stripClassPrefix(v.name, className);
	const sig       = v.signature ?? '';
	const body      = v.body ?? '';
	const modifiers = parseModifiers(sig);
	const type      = parseTypeFromSignature(sig, v.language);
	const def       = parseDefaultFromBody(body);
	const nullable  = parseNullable(sig, body, type);

	const f: FieldInfo = {
		name:       localName,
		declaredAt: { path: v.file, line: v.startLine },
	};
	return assembleField(f, { type, nullable, default: def, modifiers });
}

function stripClassPrefix(qualName: string, className: string): string {
	const prefix = `${className}.`;
	return qualName.startsWith(prefix) ? qualName.slice(prefix.length) : qualName;
}

function stripClassQualifier(name: string): string {
	// A class entity's name in Java/Scala may include a parent path
	// (e.g., 'Outer.Inner'); the tail is what callers refer to as
	// the class name.
	const dot = name.lastIndexOf('.');
	return dot === -1 ? name : name.slice(dot + 1);
}

const MODIFIER_TOKENS: ReadonlySet<string> = new Set([
	'public', 'private', 'protected', 'static', 'final', 'abstract',
	'readonly', 'override', 'sealed', 'open', 'lazy', 'implicit', 'given',
	'transient', 'volatile', 'synchronized', 'const', 'mutable',
]);

function parseModifiers(signature: string): string[] {
	const tokens = signature.split(/\s+/).filter(t => t.length > 0);
	const mods: string[] = [];
	for (const t of tokens) {
		if (MODIFIER_TOKENS.has(t)) mods.push(t);
		else if (!t.startsWith('@')) break; // stop at the first non-modifier, non-annotation token
	}
	return mods;
}

function parseTypeFromSignature(signature: string, lang: Language): string | undefined {
	if (signature.length === 0) return undefined;

	// Drop annotations (`@Foo(bar)` blocks) up to the first parens-balanced run.
	const noAnnot = signature.replace(/@\w+(?:\([^)]*\))?\s*/g, '').trim();
	if (noAnnot.length === 0) return undefined;

	// Drop modifiers from the front.
	const tokens = noAnnot.split(/\s+/);
	let i = 0;
	while (i < tokens.length && MODIFIER_TOKENS.has(tokens[i]!)) i++;
	const rest = tokens.slice(i).join(' ').trim();
	if (rest.length === 0) return undefined;

	if (lang === 'scala') {
		// Scala signature shape: `[mods] (val|var|given) name[: Type]`.
		const colon = rest.indexOf(':');
		if (colon === -1) return undefined;
		return rest.slice(colon + 1).trim() || undefined;
	}

	// Java signature shape: `[mods] Type name`. Take everything but the
	// last whitespace-separated token (the field name).
	const last = rest.lastIndexOf(' ');
	if (last === -1) return undefined;
	const t = rest.slice(0, last).trim();
	return t.length > 0 ? t : undefined;
}

function parseDefaultFromBody(body: string): string | undefined {
	// Match `= <expr>;` or `= <expr>` until end-of-line / class-body
	// terminator. Bias toward conservative -- we only surface trivial
	// defaults so callers don't ingest huge initializer expressions.
	const m = body.match(/=\s*([^;\n]+)/);
	if (m === null) return undefined;
	const raw = m[1]!.trim();
	if (raw.length === 0) return undefined;
	return raw.length <= DEFAULT_VALUE_MAX_LEN ? raw : raw.slice(0, DEFAULT_VALUE_MAX_LEN) + '...';
}

function parseNullable(sig: string, body: string, type: string | undefined): boolean | undefined {
	const haystack = `${sig} ${body}`;
	if (/@Nullable\b|@CheckForNull\b|@Nullable$/.test(haystack)) return true;
	if (/@NotNull\b|@NonNull\b/.test(haystack)) return false;
	if (type !== undefined) {
		// Java/Kotlin `Optional<X>`, Kotlin `X?`, Scala `Option[X]`,
		// TS `X | null` / `X | undefined`, Python `Optional[X]` / `X | None`.
		if (/Optional<|Option\[|\?\s*$|\|\s*null\b|\|\s*undefined\b|\|\s*None\b|Optional\[/.test(type)) {
			return true;
		}
	}
	return undefined;
}

function assembleField(
	base: FieldInfo,
	opts: {
		type?:      string | undefined;
		nullable?:  boolean | undefined;
		default?:   string | undefined;
		modifiers?: readonly string[] | undefined;
	},
): FieldInfo {
	let f: FieldInfo = base;
	if (opts.type !== undefined && opts.type.length > 0) f = { ...f, type: opts.type };
	if (opts.nullable !== undefined)                     f = { ...f, nullable: opts.nullable };
	if (opts.default !== undefined && opts.default.length > 0) f = { ...f, default: opts.default };
	if (opts.modifiers !== undefined && opts.modifiers.length > 0) f = { ...f, modifiers: opts.modifiers };
	return f;
}

// ---------------------------------------------------------------------------
// Body-side extraction (TypeScript / JavaScript / Python / Go)
// ---------------------------------------------------------------------------

function extractFromBody(classEntity: Entity): FieldInfo[] {
	const body = classEntity.body;
	const baseLine = classEntity.startLine;
	const filePath = classEntity.file;
	switch (classEntity.language) {
		case 'typescript':
		case 'javascript': return extractTsFields(body, filePath, baseLine);
		case 'python':     return extractPyFields(body, filePath, baseLine);
		case 'go':         return extractGoFields(body, filePath, baseLine);
		default:           return [];
	}
}

/**
 * TypeScript / JavaScript class-body parse. The class body opens with
 * `{` on (or near) the first line and members live one indent in.
 * Match `[modifiers] name[?]: Type [= default];` and the no-type form
 * `name = default;`. Methods are skipped (`name(...)` shape).
 */
const TS_FIELD_RE = new RegExp(
	String.raw`^[\t ]+` +                                                   // leading indent
	String.raw`((?:public |private |protected |readonly |static |override |declare |abstract )*)` + // modifiers
	String.raw`([A-Za-z_$][\w$]*)` +                                        // name
	String.raw`(\?)?` +                                                     // optional marker
	String.raw`(?:\s*:\s*([^=;\n]+?))?` +                                  // : Type
	String.raw`(?:\s*=\s*([^;\n]+?))?` +                                  // = default
	String.raw`\s*;`,                                                       // terminator
	'gm',
);

function extractTsFields(body: string, filePath: string, baseLine: number): FieldInfo[] {
	const out: FieldInfo[] = [];
	let m: RegExpExecArray | null;
	while ((m = TS_FIELD_RE.exec(body)) !== null) {
		const modsStr  = m[1] ?? '';
		const name     = m[2]!;
		const optional = m[3] === '?';
		const typeRaw  = m[4]?.trim();
		const defRaw   = m[5]?.trim();

		// Skip method-shaped lines (`name(...)`); the type capture would
		// have eaten the whole signature -- detect by leading paren or `=>`.
		if (typeRaw !== undefined && /^\(/.test(typeRaw)) continue;

		const modifiers = modsStr.trim().length > 0 ? modsStr.trim().split(/\s+/) : [];
		const nullable  = parseNullable('', '', typeRaw)
			?? (optional || (typeRaw !== undefined && /\|\s*(null|undefined)\b/.test(typeRaw))
				? true : undefined);
		const line      = baseLine + countLines(body.slice(0, m.index));

		out.push(assembleField(
			{ name, declaredAt: { path: filePath, line } },
			{ type: typeRaw, nullable, default: defRaw, modifiers },
		));
	}
	return out;
}

/**
 * Python class body. Members live at one extra indent (typically
 * 4 spaces) below the `class X:` line. Match
 * `name: Type [= default]`, `name = default`, and skip methods
 * (`def name(...)`).
 */
const PY_FIELD_RE = new RegExp(
	String.raw`^[\t ]+` +                                          // leading indent
	String.raw`([A-Za-z_][\w]*)` +                                 // name
	String.raw`(?:\s*:\s*([^=\n]+?))?` +                          // : Type
	String.raw`(?:\s*=\s*([^\n#]+?))?` +                         // = default
	String.raw`\s*(?:#.*)?$`,                                      // optional comment, EOL
	'gm',
);

const PY_RESERVED: ReadonlySet<string> = new Set([
	'def', 'class', 'if', 'else', 'elif', 'for', 'while', 'try', 'except',
	'finally', 'with', 'return', 'yield', 'raise', 'import', 'from',
	'pass', 'break', 'continue', 'global', 'nonlocal', 'lambda', 'as', 'in',
	'is', 'not', 'and', 'or', 'True', 'False', 'None',
]);

function extractPyFields(body: string, filePath: string, baseLine: number): FieldInfo[] {
	const out: FieldInfo[] = [];
	const seen = new Set<string>();
	let m: RegExpExecArray | null;
	while ((m = PY_FIELD_RE.exec(body)) !== null) {
		const name    = m[1]!;
		if (PY_RESERVED.has(name)) continue;
		// Require either a type annotation or a default; a bare
		// indented identifier is almost certainly a method body line,
		// not a class field.
		const typeRaw = m[2]?.trim();
		const defRaw  = m[3]?.trim();
		if (typeRaw === undefined && defRaw === undefined) continue;
		// `def foo` was matched as `name=def, type=foo` -- guard.
		if (typeRaw !== undefined && /^[A-Za-z_]\w*\s*\(/.test(typeRaw)) continue;
		// `class Foo` similarly.
		if (name === 'def' || name === 'class') continue;
		if (seen.has(name)) continue;
		seen.add(name);

		const nullable = parseNullable('', '', typeRaw);
		const line     = baseLine + countLines(body.slice(0, m.index));

		out.push(assembleField(
			{ name, declaredAt: { path: filePath, line } },
			{ type: typeRaw, nullable, default: defRaw },
		));
	}
	return out;
}

/**
 * Go struct body. Lines look like `Name Type` (exported, capitalised),
 * `name Type` (unexported), or `Name Type \`tag\`` with backtick
 * struct tags. Embedded fields are a single TypeName per line; we
 * surface those with `name = type`.
 */
// Go struct field. `[backtick][^backtick]*[backtick]` is the optional
// struct tag; assemble via String.fromCharCode(96) to avoid template-
// literal nesting.
const GO_BACKTICK    = String.fromCharCode(96);
const GO_TAG_PATTERN = `(?:\\s+${GO_BACKTICK}[^${GO_BACKTICK}]*${GO_BACKTICK})?`;
const GO_FIELD_RE = new RegExp(
	'^[\\t ]+' +                                                            // leading indent
	'([A-Za-z_]\\w*(?:\\s*,\\s*[A-Za-z_]\\w*)*)' +                        // Name [, Name2]
	'\\s+' +
	'(\\*?[\\w./\\[\\]<>{}-]+(?:\\s*\\[[^\\]]+\\])?)' +                  // Type (incl. pointer, generic, slice)
	GO_TAG_PATTERN +                                                         // optional struct tag
	'\\s*$',                                                                 // EOL
	'gm',
);

function extractGoFields(body: string, filePath: string, baseLine: number): FieldInfo[] {
	const out: FieldInfo[] = [];
	let m: RegExpExecArray | null;
	while ((m = GO_FIELD_RE.exec(body)) !== null) {
		const namesStr = m[1]!.trim();
		const typeRaw  = m[2]!.trim();
		const line     = baseLine + countLines(body.slice(0, m.index));
		const nullable = typeRaw.startsWith('*') ? true : undefined;

		for (const rawName of namesStr.split(/\s*,\s*/)) {
			const name = rawName.trim();
			if (name.length === 0) continue;
			out.push(assembleField(
				{ name, declaredAt: { path: filePath, line } },
				{ type: typeRaw, nullable },
			));
		}
	}
	return out;
}

function countLines(s: string): number {
	let n = 0;
	for (let i = 0; i < s.length; i++) {
		if (s.charCodeAt(i) === 10) n++;
	}
	return n;
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function ok(data: unknown): ToolResult {
	return {
		output: '```json\n' + safeJson(data) + '\n```',
		format: 'markdown',
		success: true,
		data,
	};
}

function fail(msg: string): ToolResult {
	return {
		output: `[code_class_fields] ${msg}`,
		format: 'text',
		success: false,
		error: msg,
	};
}

function safeJson(v: unknown): string {
	try {
		const j = JSON.stringify(v, null, 2);
		return j.length <= 8192 ? j : j.slice(0, 8192) + '\n... <truncated>';
	} catch {
		return '<unserializable>';
	}
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCodeClassFieldsTool(): void {
	registerTool(codeClassFieldsTool);
}

// ---------------------------------------------------------------------------
// Test exports
// ---------------------------------------------------------------------------

export const _parseModifiersForTest          = parseModifiers;
export const _parseTypeFromSignatureForTest  = parseTypeFromSignature;
export const _parseDefaultFromBodyForTest    = parseDefaultFromBody;
export const _parseNullableForTest           = parseNullable;
export const _extractTsFieldsForTest         = extractTsFields;
export const _extractPyFieldsForTest         = extractPyFields;
export const _extractGoFieldsForTest         = extractGoFields;
export const _codeClassFieldsToolForTest     = codeClassFieldsTool;
