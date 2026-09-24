/**
 * Unit tests for `handleInsrcSchema` (sc1) — the pure lookup + JSON-Schema
 * slice, driven over a hand-built registry (no live server). Covers every
 * hit/miss branch + the acceptance criteria:
 *  - ac1 multi-turn hit with a valid phase → { schema, validPhases }
 *  - ac2 multi-turn phase omitted / unknown → { error, validPhases }, no schema
 *  - ac3 phaseless tool ignores a spurious phase
 *  - ac4 omitted / unknown tool → { error, validTools }, never thrown
 *  - ac5 dynamic-inner-payload → outer envelope + the dynamicNote
 *  - k3 no branch throws
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { handleInsrcSchema } from '../schema/handler.js';
import type {
	InsrcSchemaOk,
	InsrcSchemaError,
	InsrcToolSchemaRecord,
	InsrcToolSchemaRegistry,
} from '../schema/schema.js';

// --- fixture registry -------------------------------------------------------

const PHASELESS: InsrcToolSchemaRecord = {
	name: 'insrc_one',
	description: 'A single-shape tool.',
	rawShape: { target: z.string(), depth: z.number().int().optional() },
};

const MULTITURN: InsrcToolSchemaRecord = {
	name: 'insrc_multi',
	description: 'A multi-turn tool.',
	rawShape: { phase: z.string(), state: z.string().optional() },
	phases: ['start', 'plan', 'bundle'],
	dynamicNote: 'The run hands back the inner schema for the next phase.',
};

const SELF: InsrcToolSchemaRecord = {
	name: 'insrc_schema',
	description: 'The schema lookup tool itself.',
	rawShape: { tool: z.string().optional(), phase: z.string().optional() },
};

const registry: InsrcToolSchemaRegistry = new Map([
	[PHASELESS.name, PHASELESS],
	[MULTITURN.name, MULTITURN],
	[SELF.name, SELF],
]);

function ok(r: ReturnType<typeof handleInsrcSchema>): InsrcSchemaOk {
	assert.ok(!('error' in r), `expected Ok, got error: ${JSON.stringify(r)}`);
	return r as InsrcSchemaOk;
}
function err(r: ReturnType<typeof handleInsrcSchema>): InsrcSchemaError {
	assert.ok('error' in r, `expected Error, got Ok: ${JSON.stringify(r)}`);
	return r as InsrcSchemaError;
}

// --- ac4: omitted / unknown tool -------------------------------------------

test('omitted tool → structured validTools, never throws (ac4)', () => {
	const r = err(handleInsrcSchema({}, registry));
	assert.match(r.error, /tool/i);
	assert.deepEqual(r.validTools, ['insrc_multi', 'insrc_one', 'insrc_schema']);
	assert.equal(r.schema, undefined);
});

test('empty-string tool → structured validTools (ac4)', () => {
	const r = err(handleInsrcSchema({ tool: '' }, registry));
	assert.deepEqual(r.validTools, ['insrc_multi', 'insrc_one', 'insrc_schema']);
});

test('unknown tool → structured validTools (ac4)', () => {
	const r = err(handleInsrcSchema({ tool: 'insrc_nope' }, registry));
	assert.match(r.error, /unknown tool/i);
	assert.deepEqual(r.validTools, ['insrc_multi', 'insrc_one', 'insrc_schema']);
});

// --- ac3: phaseless tool ----------------------------------------------------

test('phaseless tool returns its single contract (ok)', () => {
	const r = ok(handleInsrcSchema({ tool: 'insrc_one' }, registry));
	assert.equal(r.description, 'A single-shape tool.');
	assert.equal(r.validPhases, undefined);
	assert.equal(typeof r.schema, 'object');
});

test('phaseless tool ignores a spurious phase (ac3)', () => {
	const withPhase = ok(handleInsrcSchema({ tool: 'insrc_one', phase: 'plan' }, registry));
	const noPhase = ok(handleInsrcSchema({ tool: 'insrc_one' }, registry));
	assert.deepEqual(withPhase, noPhase);
});

// --- ac1 / ac2: multi-turn tool --------------------------------------------

test('multi-turn hit with a valid phase → schema + validPhases (ac1)', () => {
	const r = ok(handleInsrcSchema({ tool: 'insrc_multi', phase: 'plan' }, registry));
	assert.deepEqual(r.validPhases, ['start', 'plan', 'bundle']);
	assert.equal(typeof r.schema, 'object');
	assert.ok(Object.keys(r.schema).length > 0);
});

test('multi-turn phase omitted → error + validPhases, no schema (ac2)', () => {
	const r = err(handleInsrcSchema({ tool: 'insrc_multi' }, registry));
	assert.match(r.error, /phase required/i);
	assert.deepEqual(r.validPhases, ['start', 'plan', 'bundle']);
	assert.equal(r.validTools, undefined);
});

test('multi-turn unknown phase → error + validPhases (ac2)', () => {
	const r = err(handleInsrcSchema({ tool: 'insrc_multi', phase: 'walk_dog' }, registry));
	assert.match(r.error, /unknown phase/i);
	assert.deepEqual(r.validPhases, ['start', 'plan', 'bundle']);
});

// --- ac5: dynamic inner payload --------------------------------------------

test('multi-turn hit surfaces the dynamicNote in the description (ac5)', () => {
	const r = ok(handleInsrcSchema({ tool: 'insrc_multi', phase: 'bundle' }, registry));
	assert.match(r.description, /A multi-turn tool\./);
	assert.match(r.description, /run hands back the inner schema/);
});

// --- self-lookup ------------------------------------------------------------

test('insrc_schema can look up itself (self-introspection)', () => {
	const r = ok(handleInsrcSchema({ tool: 'insrc_schema' }, registry));
	assert.equal(typeof r.schema, 'object');
	assert.equal(r.validPhases, undefined);
});

// --- schema derivation ------------------------------------------------------

test('JSON-Schema derivation of a rawShape yields a non-empty Record', () => {
	const r = ok(handleInsrcSchema({ tool: 'insrc_one' }, registry));
	assert.equal(typeof r.schema, 'object');
	assert.ok(Object.keys(r.schema).length > 0);
	// the shape's fields surface somewhere in the derived JSON schema
	assert.match(JSON.stringify(r.schema), /target/);
});

test('schema-unavailable is a structured error, not a throw', () => {
	const broken: InsrcToolSchemaRecord = {
		name: 'insrc_broken',
		description: 'broken',
		// a non-shape rawShape forces the conversion to fail
		rawShape: { bad: 'not a zod type' } as unknown as InsrcToolSchemaRecord['rawShape'],
	};
	const reg: InsrcToolSchemaRegistry = new Map([[broken.name, broken]]);
	const r = err(handleInsrcSchema({ tool: 'insrc_broken' }, reg));
	assert.match(r.error, /schema unavailable/i);
});
