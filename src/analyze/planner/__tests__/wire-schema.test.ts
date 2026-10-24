/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The planner's per-template wire form (ISSUE-8d39ef09, LLD-9874475f902756f6-S001 t3).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codexStrictSchema, validateAgainstSchema, validateCodexReply } from '../../../agent/providers/structured-output.js';
import type { AnalyzeTaskTemplate } from '../../../shared/analyze-types.js';
import type { StructuredSchema } from '../../../shared/types.js';
import { PLAN_TASK_SCHEMA } from '../schema.js';
import { registerBuiltinTemplates } from '../templates/bootstrap.js';
import { getTemplateCatalog, getTemplatesForTarget } from '../templates/registry.js';
import { ITEMS, plannerWireSchema, templateWireBranch, wireBranchFor, type SlotPath } from '../wire-schema.js';

registerBuiltinTemplates();

/** The node an original schema has at a slot path. */
function nodeAt(schema: Record<string, unknown>, path: SlotPath): Record<string, unknown> {
	let node = schema;
	for (const step of path) node = (step === ITEMS ? node['items'] : (node['properties'] as Record<string, unknown>)[step]) as Record<string, unknown>;
	return node;
}

const ADHERENCE = ['code.adherence.check', 'data.adherence.check', 'infra.adherence.check'];
const AGGREGATORS = ['code.aggregate.report', 'data.aggregate.report', 'docs.aggregate.report', 'generic.aggregate.report', 'infra.aggregate.report'];
const EXPECTED_SLOTS: Readonly<Record<string, readonly SlotPath[]>> = {
	...Object.fromEntries(ADHERENCE.map(id => [id, [['constraints', ITEMS]]])),
	...Object.fromEntries(AGGREGATORS.map(id => [id, [[]]])),
	'docs.subrun.deep-dive': [['upstreamContext']],
};

test('the 27 built-in templates yield a branch each, with exactly their 9 slot sets at the expected paths', () => {
	const catalog = getTemplateCatalog();
	assert.equal(catalog.length, 27);
	const withSlots: string[] = [];
	for (const t of catalog) {
		const branch = wireBranchFor(t.inputSchema!);
		assert.ok(branch.schema['type'] === 'object' || branch.schema['type'] === 'string', `${t.id}: a branch`);
		assert.deepEqual(branch.slots, EXPECTED_SLOTS[t.id] ?? [], `${t.id}: its slots`);
		if (branch.slots.length > 0) withSlots.push(t.id);
	}
	assert.deepEqual(withSlots.sort(), Object.keys(EXPECTED_SLOTS).sort(), 'exactly 9 templates have slots');
});

test('a slot is placed only at a position the original schema restricts to an object, and the adherence root one-of-three is left out of the branch', () => {
	for (const t of getTemplateCatalog()) {
		for (const path of wireBranchFor(t.inputSchema!).slots) {
			const node = nodeAt(t.inputSchema!, path);
			assert.equal(node['type'], 'object', `${t.id} ${path.join('.')}: only an object is admitted there`);
			for (const k of ['anyOf', 'oneOf', 'allOf', 'not', 'if']) assert.equal(node[k], undefined, `${t.id} ${path.join('.')}: no ${k}`);
		}
	}
	// An open object that also admits another type, or sits under a union, is never a slot.
	const open = { type: 'object', additionalProperties: true };
	const mixed = wireBranchFor({ type: 'object', additionalProperties: false, properties: {
		a: { type: ['object', 'string'], additionalProperties: true },
		b: { anyOf: [open, { type: 'string' }] },
		c: open,
	} });
	assert.deepEqual(mixed.slots, [['c']], 'only the object-only position becomes a slot');
	for (const id of ADHERENCE) {
		const t = getTemplateCatalog().find(x => x.id === id)!;
		assert.ok(Array.isArray(t.inputSchema!['anyOf']), `${id}: the template itself keeps its one-of-three`);
		assert.equal(wireBranchFor(t.inputSchema!).schema['anyOf'], undefined, `${id}: the branch leaves it out`);
	}
});

// --- t4: fallbacks, identity and cache -------------------------------------

const supplied = (id: string, inputSchema?: Record<string, unknown>): AnalyzeTaskTemplate =>
	({ id, target: 'code', family: 'custom', kind: 'leaf', revision: '1', ...(inputSchema !== undefined ? { inputSchema } : {}) }) as AnalyzeTaskTemplate;

test('no inputSchema, a local reference, a union with a string, and a draft-07 tuple each yield a whole-params slot, and no built-in template falls back', () => {
	const cases: [string, Record<string, unknown> | undefined][] = [
		['no inputSchema', undefined],
		['a local reference', { type: 'object', additionalProperties: false, properties: { customValue: { $ref: '#/definitions/Value' } }, definitions: { Value: { type: 'string' } } }],
		['a union with a string', { type: 'object', additionalProperties: false, properties: { value: { anyOf: [{ type: 'object', additionalProperties: true }, { type: 'string' }] } } }],
		['a draft-07 tuple', { type: 'object', additionalProperties: false, properties: { pair: { type: 'array', items: [{ type: 'string' }, { type: 'integer' }] } } }],
	];
	for (const [what, schema] of cases) {
		const b = templateWireBranch(supplied('custom.t', schema));
		assert.deepEqual(b.slots, [[]], `${what}: a whole-params slot`);
		assert.equal(b.schema['type'], 'string', `${what}: sent as a JSON string`);
	}
	for (const t of getTemplateCatalog()) {
		assert.deepEqual(templateWireBranch(t), wireBranchFor(t.inputSchema!), `${t.id}: not a fallback`);
	}
});

const TARGETS = ['code', 'docs', 'data', 'infra', 'generic'] as const;
const samplePlan = { planId: 'p', goal: 'g', target: 'code', scope: 'S', reasoning: 'r'.repeat(60), tasks: [] };

test('repeated and recursive wire-schema builds with identical and different catalogs compile through validateAgainstSchema and validateCodexReply without an id collision', () => {
	const collided = (r: { ok: boolean; errors?: readonly string[] }): boolean => !r.ok && (r.errors ?? []).some(e => /already exists/.test(e));
	// Control: two clones that keep PLAN_TASK_SCHEMA's fixed $id do collide in the shared registry.
	const a = structuredClone(PLAN_TASK_SCHEMA) as unknown as StructuredSchema;
	const b = structuredClone(PLAN_TASK_SCHEMA) as unknown as StructuredSchema;
	validateAgainstSchema(a, samplePlan);
	assert.ok(collided(validateAgainstSchema(b, samplePlan)), 'control: a second schema with the same $id collides');
	// Wire schemas: every target's catalog (as a recursive child call would build it) and a supplied one, each twice.
	const catalogs = [...TARGETS.map(t => getTemplatesForTarget(t)), [supplied('custom.a', { type: 'object', additionalProperties: false, properties: { x: { type: 'string' } } })]];
	for (let round = 0; round < 2; round++) {
		for (const catalog of catalogs) {
			const { schema } = plannerWireSchema(catalog);
			assert.equal(schema['$id'], undefined, 'no $id');
			assert.equal(collided(validateAgainstSchema(schema, samplePlan)), false, 'validateAgainstSchema: no collision');
			assert.equal(collided(validateCodexReply(schema, samplePlan)), false, 'validateCodexReply: no collision');
		}
	}
	assert.equal(plannerWireSchema(catalogs[0]!).schema, plannerWireSchema(catalogs[0]!).schema, 'the same catalog reuses one schema object');
});

test('two catalogs sharing a template id with different inputSchemas get different wire schemas', () => {
	const asString = [supplied('custom.template', { type: 'object', additionalProperties: false, properties: { customValue: { type: 'string' } } })];
	const asInteger = [supplied('custom.template', { type: 'object', additionalProperties: false, properties: { customValue: { type: 'integer' } } })];
	const s1 = plannerWireSchema(asString).schema;
	const s2 = plannerWireSchema(asInteger).schema;
	assert.notEqual(s1, s2, 'different schema objects');
	const plan = { ...samplePlan, tasks: [{ taskId: 't01', template: 'custom.template', kind: 'leaf', params: { customValue: 7 }, produces: ['o'], rationale: 'r'.repeat(40) }] };
	const r1 = validateAgainstSchema(s1, plan);
	assert.ok(!r1.ok && r1.errors.some(e => /customValue/.test(e)), `customValue 7 is refused where it must be a string: ${JSON.stringify(r1)}`);
	assert.ok(validateAgainstSchema(s2, plan).ok, 'and accepted where it must be an integer');
});

/** Every object node codex's strict grammar refuses: no properties, or additionalProperties not false. */
function refusedObjects(node: unknown, path = '(root)', out: string[] = []): string[] {
	if (Array.isArray(node)) { node.forEach((n, i) => refusedObjects(n, `${path}[${i}]`, out)); return out; }
	if (node === null || typeof node !== 'object') return out;
	const n = node as Record<string, unknown>;
	const isObject = n['type'] === 'object' || (Array.isArray(n['type']) && (n['type'] as unknown[]).includes('object'));
	if (isObject && (n['properties'] === undefined || n['additionalProperties'] !== false)) out.push(path);
	for (const [k, v] of Object.entries(n)) if (!['enum', 'const', 'default', 'examples'].includes(k)) refusedObjects(v, `${path}.${k}`, out);
	return out;
}

test('the codex strict copy of the built-in planner wire schema for every target contains no open object', () => {
	for (const target of TARGETS) {
		assert.deepEqual(refusedObjects(codexStrictSchema(plannerWireSchema(getTemplatesForTarget(target)).schema)), [], target);
	}
});
