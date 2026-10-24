/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The planner's wire form of a template's params (ISSUE-8d39ef09,
 * LLD-9874475f902756f6-S001).
 *
 * Codex's strict grammar cannot express an open object (one with no declared
 * properties, or whose additionalProperties is not false). The wire form keeps
 * every closed object as it is, with its optional properties nullable, and
 * sends each open object as a string holding that object's JSON: a slot. A
 * slot is placed only where the template's schema admits nothing but an object,
 * so a string there can only be encoded JSON and decoding it back is exact.
 * The template's own inputSchema stays the validation source (INV-5).
 *
 * A template whose params cannot be embedded that way is sent as ONE slot for
 * its whole params: no inputSchema, a reference or identity keyword (it would
 * resolve against the plan root once embedded), a union, conditional or
 * multi-type value (a string there might be a real value), or a branch that
 * does not compile in the wire validators' own dialects.
 */

import { createHash } from 'node:crypto';

import { Ajv } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';

import { codexStrictSchema } from '../../agent/providers/structured-output.js';
import type { AnalyzeTaskTemplate } from '../../shared/analyze-types.js';
import type { StructuredSchema } from '../../shared/types.js';
import { PLAN_TASK_SCHEMA, PLANNED_TASK_SCHEMA } from './schema.js';

/** Where a slot sits, from the params root: property names, and `[]` for array items. */
export type SlotPath = readonly string[];

/** One template's params in wire form, and where its JSON-string slots are. */
export interface WireBranch {
	readonly schema: Record<string, unknown>;
	readonly slots:  readonly SlotPath[];
}

/** The array-items step of a slot path. */
export const ITEMS = '[]';

type Schema = Record<string, unknown>;

const isObjectNode = (node: Schema): boolean => node['type'] === 'object';
const isOpen = (node: Schema): boolean => node['properties'] === undefined || node['additionalProperties'] !== false;

/** A root `anyOf` whose every branch only names required properties: a one-of-N rule INV-5 keeps enforcing. */
function isRequiredOnlyAnyOf(value: unknown): boolean {
	return Array.isArray(value) && value.length > 0
		&& value.every(b => b !== null && typeof b === 'object' && Object.keys(b).length === 1 && Array.isArray((b as Schema)['required']));
}

/** A schema that also admits null: an optional property the model may leave empty. */
function nullable(node: Schema): Schema {
	const type = node['type'];
	if (typeof type === 'string' && node['enum'] === undefined && node['const'] === undefined) return { ...node, type: [type, 'null'] };
	return { anyOf: [node, { type: 'null' }] };
}

function wireNode(node: Schema, path: SlotPath, slots: SlotPath[]): Schema {
	if (isObjectNode(node)) {
		if (isOpen(node)) {
			slots.push(path);
			return { type: 'string', description: 'The JSON text of this object.' };
		}
		const required = new Set((node['required'] as string[] | undefined) ?? []);
		const properties: Schema = {};
		for (const [name, child] of Object.entries(node['properties'] as Record<string, Schema>)) {
			const wired = wireNode(child, [...path, name], slots);
			properties[name] = required.has(name) ? wired : nullable(wired);
		}
		const out: Schema = { ...node, properties };
		return out;
	}
	if (node['type'] === 'array' && node['items'] !== null && typeof node['items'] === 'object' && !Array.isArray(node['items'])) {
		return { ...node, items: wireNode(node['items'] as Schema, [...path, ITEMS], slots) };
	}
	return node;
}

/** One template's inputSchema in wire form, with the paths of its JSON-string slots. */
export function wireBranchFor(inputSchema: Readonly<Record<string, unknown>>): WireBranch {
	const root: Schema = { ...inputSchema };
	if (isRequiredOnlyAnyOf(root['anyOf'])) delete root['anyOf'];
	const slots: SlotPath[] = [];
	const schema = wireNode(root, [], slots);
	return { schema, slots };
}

// ---------------------------------------------------------------------------
// Whole-params fallback
// ---------------------------------------------------------------------------

/** Keywords that make a template's params a whole-params slot wherever they appear. */
const FALLBACK_KEYWORDS = ['$ref', '$defs', 'definitions', '$id', '$anchor', '$dynamicRef', '$dynamicAnchor', 'anyOf', 'oneOf', 'allOf', 'not', 'if', 'then', 'else'] as const;
/** Keywords whose value maps names to schemas: their keys are names, not keywords. */
const NAME_MAPS = new Set(['properties', 'patternProperties', 'dependentSchemas', '$defs', 'definitions']);
/** Keywords whose value is data, not a schema. */
const DATA = new Set(['enum', 'const', 'default', 'examples', 'required', 'description', 'title']);

/** Why a template's params must be one whole-params slot, from its schema's keywords; undefined when they can be embedded. */
export function wholeParamsReason(inputSchema: Readonly<Record<string, unknown>> | undefined): string | undefined {
	if (inputSchema === undefined) return 'no inputSchema';
	const root: Schema = { ...inputSchema };
	if (isRequiredOnlyAnyOf(root['anyOf'])) delete root['anyOf'];
	return keywordReason(root, '(root)');
}

function keywordReason(node: unknown, path: string): string | undefined {
	if (Array.isArray(node)) {
		for (const [i, n] of node.entries()) { const r = keywordReason(n, `${path}[${i}]`); if (r !== undefined) return r; }
		return undefined;
	}
	if (node === null || typeof node !== 'object') return undefined;
	const n = node as Schema;
	for (const k of FALLBACK_KEYWORDS) if (k in n) return `${k} at ${path}`;
	if (Array.isArray(n['type'])) return `a multi-type value at ${path}`;
	for (const [k, v] of Object.entries(n)) {
		if (DATA.has(k)) continue;
		if (NAME_MAPS.has(k) && v !== null && typeof v === 'object') {
			for (const [name, sub] of Object.entries(v as Schema)) { const r = keywordReason(sub, `${path}.${name}`); if (r !== undefined) return r; }
		} else {
			const r = keywordReason(v, `${path}.${k}`);
			if (r !== undefined) return r;
		}
	}
	return undefined;
}

/** A branch compiles in both wire validators' dialects (fresh instances, configured as they are), and codex's strict copy of it can be made. */
function compilesOnTheWire(branch: Schema): boolean {
	const embedded = { type: 'object', additionalProperties: false, required: ['params'], properties: { params: branch } };
	const options = { allErrors: true, useDefaults: false, removeAdditional: false, strict: false } as const;
	try {
		new Ajv(options).compile(embedded);
		new Ajv2020(options).compile(embedded);
		new Ajv2020(options).compile(codexStrictSchema(embedded));
		return true;
	} catch {
		return false;
	}
}

/** The branch a whole-params slot sends: the JSON text of the params object. */
const WHOLE_PARAMS: Schema = { type: 'string', description: 'The JSON text of this task\'s params object.' };

/** One template's wire branch, falling back to a whole-params slot when its params cannot be embedded. */
export function templateWireBranch(template: Pick<AnalyzeTaskTemplate, 'inputSchema'>): WireBranch {
	if (wholeParamsReason(template.inputSchema) === undefined) {
		const branch = wireBranchFor(template.inputSchema!);
		if (compilesOnTheWire(branch.schema)) return branch;
	}
	return { schema: WHOLE_PARAMS, slots: [[]] };
}

// ---------------------------------------------------------------------------
// The planner's wire schema, per catalog
// ---------------------------------------------------------------------------

/** What runPlanner sends for one catalog, and where each template's slots are. */
export interface PlannerWireSchema {
	readonly schema: StructuredSchema;
	/** Slot paths per template id; `[[]]` is a whole-params slot. */
	readonly slots:  ReadonlyMap<string, readonly SlotPath[]>;
}

/** JSON with object keys sorted, so equal content gives an equal string. */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (value !== null && typeof value === 'object') {
		return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Schema)[k])}`).join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

/** A catalog's fingerprint: its templates' ids, revisions and inputSchemas, in catalog order. */
export function catalogFingerprint(catalog: readonly AnalyzeTaskTemplate[]): string {
	const content = canonical(catalog.map(t => ({ id: t.id, revision: t.revision, inputSchema: t.inputSchema ?? null })));
	return createHash('sha256').update(content).digest('hex');
}

/** Built once per distinct catalog: the validators cache compiled schemas by object, so one object per catalog compiles once. */
const cache = new Map<string, PlannerWireSchema>();

/**
 * The schema runPlanner sends for its effective catalog: PLAN_TASK_SCHEMA
 * without its $id (a fixed id would collide in the validators' shared Ajv
 * registries on a second compile), with each task's params an anyOf over the
 * catalog's wire branches.
 */
export function plannerWireSchema(catalog: readonly AnalyzeTaskTemplate[]): PlannerWireSchema {
	const key = catalogFingerprint(catalog);
	const hit = cache.get(key);
	if (hit !== undefined) return hit;
	const slots = new Map<string, readonly SlotPath[]>();
	const branches: Schema[] = [];
	let whole = false;
	for (const t of catalog) {
		const b = templateWireBranch(t);
		slots.set(t.id, b.slots);
		if (b.schema === WHOLE_PARAMS) whole = true;
		else branches.push(b.schema);
	}
	if (whole) branches.push(WHOLE_PARAMS);
	const { $id: _id, ...plan } = structuredClone(PLAN_TASK_SCHEMA) as unknown as Schema;
	const task = structuredClone(PLANNED_TASK_SCHEMA) as unknown as Schema;
	const taskProps = task['properties'] as Schema;
	taskProps['params'] = { anyOf: branches };
	const planProps = plan['properties'] as Schema;
	planProps['tasks'] = { ...(planProps['tasks'] as Schema), items: task };
	const built: PlannerWireSchema = { schema: plan as StructuredSchema, slots };
	cache.set(key, built);
	return built;
}

// ---------------------------------------------------------------------------
// Decoding a reply back to the template's own params
// ---------------------------------------------------------------------------

/** Whether a schema refuses null. An embedded branch has no union or reference (those fall back to a whole-params slot), so its type, enum or const decides. */
function excludesNull(node: Schema): boolean {
	const type = node['type'];
	if (typeof type === 'string') return type !== 'null';
	if (Array.isArray(node['enum'])) return !(node['enum'] as unknown[]).includes(null);
	if ('const' in node) return node['const'] !== null;
	return false;
}

/**
 * Remove the nulls the wire form forced: the wire makes every optional
 * property nullable, so a null where the template's schema refuses it means
 * the property is absent. It runs before slots are decoded, while each slot
 * (a whole-params one too) is still a string, so only structural positions are
 * walked: what the model wrote inside slot JSON reaches INV-5 untouched, as it
 * would from any provider.
 */
function dropWireNulls(value: unknown, node: Schema): unknown {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) {
		const items = node['items'];
		return items !== null && typeof items === 'object' && !Array.isArray(items) ? value.map(v => dropWireNulls(v, items as Schema)) : value;
	}
	const props = node['properties'] as Record<string, Schema> | undefined;
	if (props === undefined) return value;
	const out: Schema = {};
	for (const [k, v] of Object.entries(value as Schema)) {
		const sub = props[k];
		if (sub === undefined) { out[k] = v; continue; }
		if (v === null && excludesNull(sub)) continue;
		out[k] = dropWireNulls(v, sub);
	}
	return out;
}

/** Parse the JSON strings at a slot path back into objects, in place on a copy; throws with the path on bad JSON. */
function decodeSlot(value: unknown, path: SlotPath, at: string): unknown {
	if (path.length === 0) {
		if (typeof value !== 'string') return value;
		try { return JSON.parse(value); } catch (err) { throw new Error(`the JSON at ${at} is not valid: ${(err as Error).message}`); }
	}
	const [step, ...rest] = path;
	if (step === ITEMS) return Array.isArray(value) ? value.map((v, i) => decodeSlot(v, rest, `${at}[${i}]`)) : value;
	if (value === null || typeof value !== 'object' || Array.isArray(value) || !(step! in (value as Schema))) return value;
	return { ...(value as Schema), [step!]: decodeSlot((value as Schema)[step!], rest, `${at}.${step}`) };
}

/** A plan task's params, as decodePlanParams reads and returns them. */
interface TaskLike { readonly taskId?: unknown; readonly template?: unknown; readonly params?: unknown }

/**
 * Turn a reply in wire form back into the templates' own params: for each task,
 * the nulls the wire form forced are removed at structural positions, then the
 * JSON strings at its slot paths are parsed back into objects. A whole-params
 * slot and the contents of every slot are left as the model wrote them, for
 * INV-5 to judge. A slot that is not valid JSON is an error, and no task is
 * returned half-decoded.
 */
export function decodePlanParams<P extends { readonly tasks: readonly TaskLike[] }>(
	plan: P, wire: PlannerWireSchema, catalog: readonly AnalyzeTaskTemplate[],
): { ok: true; plan: P } | { ok: false; errors: string[] } {
	const errors: string[] = [];
	const tasks = plan.tasks.map(task => {
		const template = catalog.find(t => t.id === task.template);
		const slots = typeof task.template === 'string' ? wire.slots.get(task.template) : undefined;
		if (template === undefined || slots === undefined) return task;   // an unknown template is INV-5's to report
		// Nulls first, while the slots are still strings; then the slots.
		let params = template.inputSchema === undefined ? task.params : dropWireNulls(task.params, template.inputSchema as Schema);
		try {
			for (const path of slots) params = decodeSlot(params, path, 'params');
		} catch (err) {
			errors.push(`task '${String(task.taskId)}' (${template.id}): ${(err as Error).message}`);
			return task;
		}
		return { ...task, params };
	});
	return errors.length > 0 ? { ok: false, errors } : { ok: true, plan: { ...plan, tasks } };
}
