/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Template-catalog registry tests.
 *
 * Covers:
 *   - registerTemplate enforces per-template integrity at boot
 *     (description, inputSchema, produces, aggregator-flag rules,
 *     id-collision rejection)
 *   - registerBuiltinTemplates registers the expected 13 builtins
 *     (5 code + 4 data + 3 infra + 1 generic) without collisions
 *   - Per-target queries (getTemplatesForTarget) honor INV-4:
 *     generic plans accept every template; per-target plans see only
 *     their own.
 *   - Every builtin's inputSchema is a syntactically valid JSON Schema
 *     (compiles in Ajv without throwing).
 *   - Every builtin's produces matches its template id naming
 *     convention (rough sanity: the produces array is non-empty +
 *     every entry is a non-empty string).
 *
 * Pure unit tests; no LLM, no I/O beyond Ajv compilation.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/planner/__tests__/templates.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Ajv } from 'ajv';

import {
	_resetTemplateRegistryForTests,
	getAggregatorFor,
	getTemplate,
	getTemplateCatalog,
	getTemplatesForTarget,
	registerBuiltinTemplates,
	registerTemplate,
	TemplateRegistrationError,
} from '../index.js';
import { _resetTemplateBootstrapLatchForTests } from '../templates/bootstrap.js';
import type { AnalyzeTaskTemplate } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshRegistry(): void {
	_resetTemplateBootstrapLatchForTests();
	_resetTemplateRegistryForTests();
}

const VALID_TEMPLATE: AnalyzeTaskTemplate = {
	id:          'test.demo.thing',
	target:      'code',
	family:      'demo',
	kind:        'leaf',
	revision:    'r1',
	description: 'A demo template for tests.',
	inputSchema: { type: 'object', additionalProperties: false, properties: {} },
	produces:    ['out'],
};

// ---------------------------------------------------------------------------
// registerTemplate integrity
// ---------------------------------------------------------------------------

test('registerTemplate accepts a well-formed template', () => {
	freshRegistry();
	assert.doesNotThrow(() => registerTemplate(VALID_TEMPLATE));
	assert.equal(getTemplate('test.demo.thing'), VALID_TEMPLATE);
});

test('registerTemplate rejects id collision', () => {
	freshRegistry();
	registerTemplate(VALID_TEMPLATE);
	assert.throws(
		() => registerTemplate(VALID_TEMPLATE),
		TemplateRegistrationError,
	);
});

test('registerTemplate rejects missing inputSchema', () => {
	freshRegistry();
	const bad = { ...VALID_TEMPLATE, inputSchema: undefined };
	assert.throws(() => registerTemplate(bad), TemplateRegistrationError);
});

test('registerTemplate rejects empty produces', () => {
	freshRegistry();
	const bad = { ...VALID_TEMPLATE, produces: [] };
	assert.throws(() => registerTemplate(bad), TemplateRegistrationError);
});

test('registerTemplate rejects missing description', () => {
	freshRegistry();
	const bad = { ...VALID_TEMPLATE, description: undefined };
	assert.throws(() => registerTemplate(bad), TemplateRegistrationError);
});

test('registerTemplate: family=aggregate without isAggregator flag is rejected', () => {
	freshRegistry();
	const bad = { ...VALID_TEMPLATE, id: 'test.aggregate.report', family: 'aggregate' };
	assert.throws(() => registerTemplate(bad), TemplateRegistrationError);
});

test('registerTemplate: isAggregator without family=aggregate is rejected', () => {
	freshRegistry();
	const bad = { ...VALID_TEMPLATE, isAggregator: true };
	assert.throws(() => registerTemplate(bad), TemplateRegistrationError);
});

test('registerTemplate: family=aggregate AND isAggregator:true is accepted', () => {
	freshRegistry();
	const ok: AnalyzeTaskTemplate = {
		...VALID_TEMPLATE,
		id:           'test.aggregate.report',
		family:       'aggregate',
		isAggregator: true,
		produces:     ['report'],
	};
	assert.doesNotThrow(() => registerTemplate(ok));
});

// ---------------------------------------------------------------------------
// registerBuiltinTemplates -- expected count + collision-free + idempotent
// ---------------------------------------------------------------------------

test('registerBuiltinTemplates registers exactly 24 builtins (7 code + 5 data + 5 infra + 1 generic + 6 docs) without collision', () => {
	freshRegistry();
	assert.doesNotThrow(() => registerBuiltinTemplates());
	assert.equal(getTemplateCatalog().length, 24);
});

test('registerBuiltinTemplates is idempotent (latch prevents double-register)', () => {
	freshRegistry();
	registerBuiltinTemplates();
	const first = getTemplateCatalog().length;
	assert.doesNotThrow(() => registerBuiltinTemplates());
	const second = getTemplateCatalog().length;
	assert.equal(first, second);
});

test('every per-target subset has its own aggregator', () => {
	freshRegistry();
	registerBuiltinTemplates();
	for (const target of ['code', 'data', 'infra', 'generic', 'docs'] as const) {
		const agg = getAggregatorFor(target);
		assert.notEqual(agg, undefined, `target=${target} should have an aggregator`);
		assert.equal(agg!.target, target);
		assert.equal(agg!.isAggregator, true);
		assert.equal(agg!.family, 'aggregate');
	}
});

// ---------------------------------------------------------------------------
// getTemplatesForTarget
// ---------------------------------------------------------------------------

test('getTemplatesForTarget(code) returns 7 code templates (6 leaf + 1 planner)', () => {
	freshRegistry();
	registerBuiltinTemplates();
	const code = getTemplatesForTarget('code');
	assert.equal(code.length, 7);
	for (const t of code) {
		assert.equal(t.target, 'code');
	}
	// Exactly one planner-kind template (code.subrun.deep-dive); rest are leaf.
	const planners = code.filter(t => t.kind === 'planner');
	assert.equal(planners.length, 1);
	assert.equal(planners[0]!.id, 'code.subrun.deep-dive');
});

test('getTemplatesForTarget(data) returns 5 data templates', () => {
	freshRegistry();
	registerBuiltinTemplates();
	const data = getTemplatesForTarget('data');
	assert.equal(data.length, 5);
	for (const t of data) {
		assert.equal(t.target, 'data');
	}
});

test('getTemplatesForTarget(infra) returns 5 infra templates', () => {
	freshRegistry();
	registerBuiltinTemplates();
	const infra = getTemplatesForTarget('infra');
	assert.equal(infra.length, 5);
	for (const t of infra) {
		assert.equal(t.target, 'infra');
	}
});

test('getTemplatesForTarget(docs) returns 6 docs templates (5 leaf + 1 planner)', () => {
	freshRegistry();
	registerBuiltinTemplates();
	const docs = getTemplatesForTarget('docs');
	assert.equal(docs.length, 6);
	for (const t of docs) {
		assert.equal(t.target, 'docs');
	}
	const planners = docs.filter(t => t.kind === 'planner');
	assert.equal(planners.length, 1);
	assert.equal(planners[0]!.id, 'docs.subrun.deep-dive');
});

test('getTemplatesForTarget(generic) returns the FULL catalog (INV-4 permits cross-target)', () => {
	freshRegistry();
	registerBuiltinTemplates();
	const generic = getTemplatesForTarget('generic');
	assert.equal(generic.length, getTemplateCatalog().length);
});

// ---------------------------------------------------------------------------
// Per-template integrity sweep
// ---------------------------------------------------------------------------

test('every builtin template has a syntactically valid inputSchema (Ajv compiles)', () => {
	freshRegistry();
	registerBuiltinTemplates();
	const ajv = new Ajv({ strict: false });
	for (const t of getTemplateCatalog()) {
		assert.doesNotThrow(
			() => ajv.compile(t.inputSchema!),
			`template ${t.id} inputSchema failed to compile`,
		);
	}
});

test('every builtin template produces non-empty string entries', () => {
	freshRegistry();
	registerBuiltinTemplates();
	for (const t of getTemplateCatalog()) {
		assert.ok(t.produces && t.produces.length > 0,
			`template ${t.id} has empty produces`);
		for (const p of t.produces) {
			assert.equal(typeof p, 'string', `template ${t.id} produces non-string`);
			assert.ok(p.length > 0, `template ${t.id} produces an empty string`);
		}
	}
});

test('every builtin template id namespaces its target as the leading prefix', () => {
	freshRegistry();
	registerBuiltinTemplates();
	for (const t of getTemplateCatalog()) {
		assert.ok(t.id.startsWith(`${t.target}.`),
			`template ${t.id}: id should start with '${t.target}.'`);
	}
});

test('every builtin template description is at least one sentence (>= 20 chars)', () => {
	freshRegistry();
	registerBuiltinTemplates();
	for (const t of getTemplateCatalog()) {
		assert.ok((t.description ?? '').trim().length >= 20,
			`template ${t.id}: description should be >= 20 chars`);
	}
});

test('aggregator templates produce exactly [\'report\']', () => {
	freshRegistry();
	registerBuiltinTemplates();
	const aggregators = getTemplateCatalog().filter(t => t.isAggregator === true);
	assert.equal(aggregators.length, 5); // code + data + infra + generic + docs
	for (const t of aggregators) {
		assert.deepEqual([...t.produces!], ['report'],
			`aggregator ${t.id} should produce ['report'], got ${JSON.stringify(t.produces)}`);
	}
});
