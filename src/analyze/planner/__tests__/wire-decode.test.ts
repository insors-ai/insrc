/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * runPlanner sends the wire schema and decodes the reply back to the
 * templates' own params before INV-5 (ISSUE-8d39ef09, LLD-9874475f902756f6-S001 t5).
 *
 * Each case answers with a one-task plan. It passes INV-1..4, so INV-5 runs on
 * the decoded params; a later invariant (the missing aggregator) then fails it,
 * and PlanBuilderExhausted carries the decoded attempts and their failures:
 * a first failure other than INV-5 means INV-5 accepted the params.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

// Plan attempts are persisted under ~/.insrc: keep this file's runs in a temporary home.
const HOME = mkdtempSync(join(tmpdir(), 'insrc-wire-decode-'));
process.env['HOME'] = HOME;
after(() => rmSync(HOME, { recursive: true, force: true }));

const { PlanBuilderExhausted, PlanBuilderSchemaUnrecoverable, runPlanner } = await import('../index.js');
const { registerBuiltinTemplates } = await import('../templates/bootstrap.js');
const { getTemplatesForTarget } = await import('../templates/registry.js');
const { plannerWireSchema } = await import('../wire-schema.js');
import type { AnalyzeContextBundle } from '../../context/types.js';
import type { LLMProvider } from '../../../shared/types.js';
import type { AnalyzeTaskTemplate, PlanTask } from '../types.js';

registerBuiltinTemplates();

const BUNDLE: AnalyzeContextBundle = { system: '', focus: '', summary: '', structure: '', surface: '', artefacts: '', upstream: '' };
const INTENT = { target: 'code', scope: 'M', focused: false, scopeRef: { kind: 'repo', value: '/r' }, reasoning: 'wire-decode fixture' } as const;

const supplied = (id: string, inputSchema?: Record<string, unknown>): AnalyzeTaskTemplate =>
	({ id, target: 'code', family: 'custom', kind: 'leaf', revision: 'r1', produces: ['out'], ...(inputSchema !== undefined ? { inputSchema } : {}) }) as AnalyzeTaskTemplate;

/** A one-task plan in wire form, as a model would answer. */
const wirePlan = (template: string, params: unknown, produces: string[] = ['out']) => ({
	planId: 'p', goal: 'g', target: 'code', scope: 'M', reasoning: 'r'.repeat(60),
	tasks: [{ taskId: 't01', template, kind: 'leaf', params, produces, rationale: 'r'.repeat(40) }],
});

/** Run the planner against a model that always answers `reply`; return the schema it was sent and how it ended. */
async function plan(catalog: readonly AnalyzeTaskTemplate[], reply: unknown) {
	const sent: unknown[] = [];
	const provider = { completeStructured: async (_m: unknown, schema: unknown) => { sent.push(schema); return structuredClone(reply); } } as unknown as LLMProvider;
	const outcome = await runPlanner({ input: { intent: INTENT, contextBundle: BUNDLE, catalog }, opts: { runId: `wire-decode-${Math.random().toString(36).slice(2)}` }, provider })
		.then(() => { throw new Error('the plan was expected to fail a later invariant'); }, (err: unknown) => err);
	return { sent, outcome };
}

/** The decoded params of the first attempt, and its first failure, from a PlanBuilderExhausted. */
function firstAttempt(outcome: unknown): { params: unknown; invariant: string } {
	assert.ok(outcome instanceof PlanBuilderExhausted, `exhausted on later invariants: ${String(outcome)}`);
	const ex = outcome as InstanceType<typeof PlanBuilderExhausted>;
	return { params: (ex.attempts[0] as PlanTask).tasks[0]!.params, invariant: ex.failures[0]!.invariantId };
}

test('runPlanner sends a wire schema covering exactly its effective catalog, and a supplied scopeRef round-trips through a slot into INV-5 unchanged', async () => {
	const scoped = supplied('custom.scoped', { type: 'object', additionalProperties: false, properties: { scopeRef: { type: 'object' } } });
	const catalog = [scoped];
	const { sent, outcome } = await plan(catalog, wirePlan('custom.scoped', { scopeRef: '{"kind":"repo","value":"/r"}' }));
	assert.equal(sent[0], plannerWireSchema(catalog).schema, 'the wire schema for this catalog was sent');
	const branches = (((sent[0] as Record<string, any>)['properties']['tasks']['items']['properties']['params']['anyOf']) as unknown[]);
	assert.equal(branches.length, 1, 'one branch per template of the effective catalog');
	const { params, invariant } = firstAttempt(outcome);
	assert.deepEqual(params, { scopeRef: { kind: 'repo', value: '/r' } }, 'decoded back to the object');
	assert.notEqual(invariant, 'INV-5', 'INV-5 accepted it');
	// A slot inside an array: the built-in adherence check's inline constraints, each item sent as JSON text.
	const code = getTemplatesForTarget('code');
	const adherence = code.find(t => t.id === 'code.adherence.check')!;
	const items = [{ constraint: 'every handler logs through getLogger', file: 'CLAUDE.md' }, { constraint: 'no console.log' }];
	const { outcome: inline } = await plan(code, wirePlan('code.adherence.check', { codeSubject: 'src/handlers', constraints: items.map(i => JSON.stringify(i)) }, [...(adherence.produces ?? [])]));
	const a = firstAttempt(inline);
	assert.deepEqual((a.params as { constraints: unknown }).constraints, items, 'each array item decoded back to its object');
	assert.notEqual(a.invariant, 'INV-5', 'INV-5 accepted the decoded constraints');
});

test('supplied templates with no inputSchema, local references, a union with a string, and a draft-07 tuple round-trip as whole-params slots and pass INV-5 as today', async () => {
	const cases: [string, Record<string, unknown> | undefined, unknown][] = [
		['no inputSchema', undefined, { a: 1, b: ['x'] }],
		['local references', { type: 'object', additionalProperties: false, properties: { customValue: { $ref: '#/definitions/Value' } }, definitions: { Value: { type: 'string' } } }, { customValue: 'v' }],
		['union, native hello', { type: 'object', additionalProperties: false, properties: { value: { anyOf: [{ type: 'object', additionalProperties: true }, { type: 'string' }] } } }, { value: 'hello' }],
		['union, native JSON-looking string', { type: 'object', additionalProperties: false, properties: { value: { anyOf: [{ type: 'object', additionalProperties: true }, { type: 'string' }] } } }, { value: '{"x":1}' }],
		['draft-07 tuple', { type: 'object', additionalProperties: false, properties: { pair: { type: 'array', items: [{ type: 'string' }, { type: 'integer' }] } } }, { pair: ['x', 7] }],
	];
	for (const [what, schema, params] of cases) {
		const t = supplied('custom.whole', schema);
		const { outcome } = await plan([t], wirePlan('custom.whole', JSON.stringify(params)));
		const got = firstAttempt(outcome);
		assert.deepEqual(got.params, params, `${what}: round-trips exactly`);
		assert.notEqual(got.invariant, 'INV-5', `${what}: INV-5 accepts it`);
	}
});

test('null params including nested ones are removed before INV-5, and the adherence one-of-three rule still fails a task with none of the three', async () => {
	const nested = supplied('custom.nested', { type: 'object', additionalProperties: false, properties: {
		a: { type: 'string' },
		keep: { enum: ['x', null] },   // admits null without a multi-type value (which would make it a whole-params slot)
		inner: { type: 'object', additionalProperties: false, properties: { b: { type: 'integer' }, c: { type: 'string' } } },
	} });
	const { outcome } = await plan([nested], wirePlan('custom.nested', { a: null, keep: null, inner: { b: 1, c: null } }));
	const got = firstAttempt(outcome);
	assert.deepEqual(got.params, { keep: null, inner: { b: 1 } }, 'nulls the schema does not admit are gone; an admitted null is kept');
	assert.notEqual(got.invariant, 'INV-5');
	// The built-in adherence check, every constraint source null: decoded to none of the three, INV-5 refuses it.
	const code = getTemplatesForTarget('code');
	const adherence = code.find(t => t.id === 'code.adherence.check')!;
	const { outcome: refused } = await plan(code, wirePlan('code.adherence.check', { constraintTopic: null, constraints: null, constraintIds: null }, [...(adherence.produces ?? [])]));
	const r = firstAttempt(refused);
	assert.equal(r.invariant, 'INV-5', 'the one-of-three rule still holds');
	for (const k of ['constraintTopic', 'constraints', 'constraintIds']) assert.equal(k in (r.params as object), false, `${k} removed, not passed on as null`);
	// Nulls inside decoded slots: an inline constraint's optional sourceEntityId, sent null in its JSON text.
	const { outcome: inSlot } = await plan(code, wirePlan('code.adherence.check', { codeSubject: 'src', constraints: [JSON.stringify({ constraint: 'no console.log', sourceEntityId: null })] }, [...(adherence.produces ?? [])]));
	const s = firstAttempt(inSlot);
	assert.deepEqual((s.params as { constraints: unknown }).constraints, [{ constraint: 'no console.log' }], 'a null inside a decoded slot is removed');
	assert.notEqual(s.invariant, 'INV-5');
	// Nulls inside a whole-params slot, at a key whose local $ref resolves to a string.
	const refd = supplied('custom.ref', { type: 'object', additionalProperties: false, properties: { customValue: { $ref: '#/definitions/Value' }, other: { type: 'string' } }, definitions: { Value: { type: 'string' } } });
	const { outcome: whole } = await plan([refd], wirePlan('custom.ref', JSON.stringify({ customValue: null, other: 'kept' })));
	const w = firstAttempt(whole);
	assert.deepEqual(w.params, { other: 'kept' }, 'a null the resolved $ref refuses is removed from a whole-params slot');
	assert.notEqual(w.invariant, 'INV-5');
	// Unions: a null is kept where one branch admits it, removed where every branch refuses it.
	const unions = supplied('custom.union', { type: 'object', additionalProperties: false, properties: {
		maybe: { anyOf: [{ type: 'string' }, { type: 'null' }] },
		never: { anyOf: [{ type: 'string' }, { type: 'integer' }] },
	} });
	const { outcome: u } = await plan([unions], wirePlan('custom.union', JSON.stringify({ maybe: null, never: null })));
	const uu = firstAttempt(u);
	assert.deepEqual(uu.params, { maybe: null }, 'the admitted null is kept, the refused one removed');
	assert.notEqual(uu.invariant, 'INV-5');
});

test('invalid JSON in a slot is reported through the planner failure path and nothing partial reaches INV-5', async () => {
	const scoped = supplied('custom.scoped', { type: 'object', additionalProperties: false, properties: { scopeRef: { type: 'object' } } });
	const { sent, outcome } = await plan([scoped], wirePlan('custom.scoped', { scopeRef: '{not json' }));
	assert.ok(outcome instanceof PlanBuilderSchemaUnrecoverable, `the planner's schema failure: ${String(outcome)}`);
	assert.match((outcome as Error).message, /t01.*custom\.scoped.*params\.scopeRef.*not valid/);
	assert.equal(sent.length, 1, 'stopped at the first reply: no attempt reached validation');
});
