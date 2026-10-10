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
	renderCatalog,
	TemplateRegistrationError,
	validatePlan,
} from '../index.js';
import { TARGET_TO_KINDS } from '../../classifier/validate.js';
import { _resetTemplateBootstrapLatchForTests } from '../templates/bootstrap.js';
import type { AnalyzeTaskTemplate, PlanTask } from '../types.js';

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

test('registerBuiltinTemplates registers exactly 27 builtins (7 code + 5 data + 8 infra + 1 generic + 6 docs) without collision', () => {
	freshRegistry();
	assert.doesNotThrow(() => registerBuiltinTemplates());
	assert.equal(getTemplateCatalog().length, 27);
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

test('getTemplatesForTarget(infra) returns 8 infra templates', () => {
	freshRegistry();
	registerBuiltinTemplates();
	const infra = getTemplatesForTarget('infra');
	assert.equal(infra.length, 8);
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

// ---------------------------------------------------------------------------
// A task's scope: only the kinds its family accepts
// ---------------------------------------------------------------------------

/** The `kind` list a template's own `scopeRef` parameter declares, if it has one. */
function declaredKinds(t: AnalyzeTaskTemplate): readonly string[] | undefined {
	const scopeRef = (t.inputSchema?.['properties'] as Record<string, { properties?: { kind?: { enum?: string[] } } }> | undefined)?.['scopeRef'];
	return scopeRef?.properties?.kind?.enum;
}

test("every builtin template's scopeRef lists exactly the kinds of scope its family accepts, and the catalog shows the planner those kinds only", () => {
	freshRegistry();
	registerBuiltinTemplates();
	const withScope = getTemplateCatalog().filter(t => declaredKinds(t) !== undefined);
	// The code, docs and infra tasks that take a scope: 3 + 1 + 6.
	assert.deepEqual(
		withScope.map(t => t.id).sort(),
		[
			'code.discovery.entrypoints', 'code.discovery.modules', 'code.structure.module-tree',
			'docs.discovery.inventory',
			'infra.discovery.families', 'infra.inventory.ci', 'infra.inventory.docker', 'infra.inventory.helm',
			'infra.inventory.kubernetes', 'infra.inventory.terraform',
		],
	);
	for (const t of withScope) {
		assert.deepEqual(declaredKinds(t), [...TARGET_TO_KINDS[t.target]], t.id);
	}

	// What the planner is shown for an infra task names no kind the family refuses.
	const ci = renderCatalog([getTemplate('infra.inventory.ci')!]);
	for (const kind of ['repo', 'manifest-dir', 'workspace']) assert.ok(ci.includes(`"${kind}"`), kind);
	for (const kind of ['file', 'module', 'symbol', 'connection']) assert.ok(!ci.includes(`"${kind}"`), kind);
});

test('a plan whose task carries a kind of scope its family does not accept fails validation with the task, the kind and the accepted kinds', () => {
	freshRegistry();
	registerBuiltinTemplates();
	const catalog = getTemplatesForTarget('infra');
	// The plan of the live run: one CI inventory task per workflow file.
	const plan = (kind: string, value: string): PlanTask => ({
		planId:    'p-root',
		goal:      'inventory the CI of the repository',
		target:    'infra',
		scope:     'XS',
		reasoning: 'find the IaC families, then inventory the CI workflows, then write the report from both',
		tasks: [
			{ taskId: 't01', template: 'infra.discovery.families', kind: 'leaf', params: { scopeRef: { kind: 'repo', value: '/r' } }, produces: ['families'], rationale: 'find the IaC families present in the repository' },
			{ taskId: 't02', template: 'infra.inventory.ci', kind: 'leaf', params: { scopeRef: { kind, value } }, produces: [...getTemplate('infra.inventory.ci')!.produces!], rationale: 'inventory the CI workflows of the repository' },
			{ taskId: 't03', template: 'infra.aggregate.report', kind: 'leaf', params: {}, produces: ['report'], consumes: ['families'], rationale: 'write the report from the families and the inventory' },
		],
	});

	const refused = validatePlan(plan('file', '/r/.github/workflows/ci.yml'), catalog);
	assert.equal(refused?.invariantId, 'INV-5');
	assert.equal(
		refused?.message,
		"task t02 (infra.inventory.ci): scopeRef.kind='file' is not a kind of scope the 'infra' family accepts. "
		+ 'Accepted kinds: repo, manifest-dir, workspace.',
	);
	assert.deepEqual(refused?.target, { index: 1, taskId: 't02', template: 'infra.inventory.ci', kind: 'file', accepted: ['repo', 'manifest-dir', 'workspace'] });

	// Every kind the family accepts validates, as before.
	for (const kind of TARGET_TO_KINDS.infra) {
		assert.equal(validatePlan(plan(kind, '/r'), catalog), null, kind);
	}

	// The same holds for the other families: a code task with a connection, a docs task with a symbol.
	for (const [template, kind, family] of [
		['code.discovery.modules', 'connection', 'code'],
		['docs.discovery.inventory', 'symbol', 'docs'],
	] as const) {
		const tmpl = getTemplate(template)!;
		const one: PlanTask = {
			planId: 'p-root', goal: 'check one task', target: family, scope: 'XS', reasoning: 'one task with a refused kind of scope',
			tasks: [{ taskId: 't01', template, kind: 'leaf', params: { scopeRef: { kind, value: 'x' } }, produces: [...tmpl.produces!], rationale: 'a task whose scope kind its family refuses' }],
		};
		const failure = validatePlan(one, getTemplatesForTarget(family));
		assert.equal(failure?.invariantId, 'INV-5', template);
		assert.match(failure?.message ?? '', new RegExp(`scopeRef\\.kind='${kind}' is not a kind of scope the '${family}' family accepts\\. Accepted kinds: ${TARGET_TO_KINDS[family].join(', ')}\\.$`));
	}
});
