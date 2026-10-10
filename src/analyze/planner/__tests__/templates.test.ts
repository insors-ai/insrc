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

test('the scope of a child plan is held to the kinds its own kind of source accepts', () => {
	freshRegistry();
	registerBuiltinTemplates();
	const subrun = (template: string, target: string, kind: string): PlanTask => ({
		planId: 'p-root', goal: 'check one subrun task', target: template.startsWith('docs') ? 'docs' : 'code', scope: 'XS',
		reasoning: 'one subrun task whose child intent names a scope for its own kind of source',
		tasks: [{
			taskId: 't01', template, kind: 'planner', produces: ['report'], rationale: 'a deep dive into one area by a child plan',
			params: { childIntent: { target, scope: 'S', focused: false, scopeRef: { kind, value: '/r/x' }, reasoning: 'the child plan looks at one area' } },
		}],
	});
	for (const template of ['code.subrun.deep-dive', 'docs.subrun.deep-dive']) {
		const catalog = getTemplatesForTarget(template.startsWith('docs') ? 'docs' : 'code');
		const refused = validatePlan(subrun(template, 'infra', 'file'), catalog);
		assert.equal(refused?.invariantId, 'INV-5', template);
		assert.equal(
			refused?.message,
			`task t01 (${template}): childIntent.scopeRef.kind='file' is not a kind of scope the 'infra' family accepts. `
			+ 'Accepted kinds: repo, manifest-dir, workspace.',
		);
		// A kind the child's own kind of source accepts is not refused by this rule.
		const accepted = validatePlan(subrun(template, 'infra', 'manifest-dir'), catalog);
		assert.notEqual(accepted?.invariantId, 'INV-5', `${template}: ${accepted?.message}`);
	}
	// A child intent may carry every kind of scope: the schema with all of them is the generic row.
	assert.deepEqual([...TARGET_TO_KINDS.generic], ['repo', 'module', 'file', 'symbol', 'connection', 'manifest-dir', 'workspace']);
});

test('a scopeRef that is not an object, or whose kind is not a string, still fails validation by the schema', () => {
	freshRegistry();
	registerBuiltinTemplates();
	const tmpl = getTemplate('infra.discovery.families')!;
	for (const scopeRef of ['repo', { kind: 7, value: '/r' }, { value: '/r' }]) {
		const plan: PlanTask = {
			planId: 'p-root', goal: 'check one task', target: 'infra', scope: 'XS', reasoning: 'one task whose scopeRef is malformed',
			tasks: [{ taskId: 't01', template: tmpl.id, kind: 'leaf', params: { scopeRef }, produces: [...tmpl.produces!], rationale: 'a task with a malformed scope' }],
		};
		const failure = validatePlan(plan, getTemplatesForTarget('infra'));
		assert.equal(failure?.invariantId, 'INV-5', JSON.stringify(scopeRef));
		assert.match(failure?.message ?? '', /^task t01: params failed inputSchema: \/scopeRef/, JSON.stringify(scopeRef));
	}
});

// ---------------------------------------------------------------------------
// An adherence check must be given constraints to check against (ISSUE-0f17539c)
// ---------------------------------------------------------------------------

const ADHERENCE = [
	['code.adherence.check', 'code', 'codeSubject'],
	['data.adherence.check', 'data', 'dataSubject'],
	['infra.adherence.check', 'infra', 'infraSubject'],
] as const;

const WAYS = '`constraintTopic` (the subject to look up in the repository\'s documents; the check finds the constraints itself), '
	+ '`constraints` (a non-empty inline list), or `constraintIds` (a non-empty list of ids of summarised documents)';

/** A plan of one adherence task, of the family's own target. INV-5 is reached before the rules a one-task plan breaks. */
function adherencePlan(template: string, target: PlanTask['target'], params: Record<string, unknown>): PlanTask {
	return {
		planId: 'p-root', goal: 'check one area against the documents', target, scope: 'XS',
		reasoning: 'one adherence check, to see what plan validation makes of its parameters',
		tasks: [{ taskId: 't01', template, kind: 'leaf', params, produces: ['adherence-report'], rationale: 'check the subject against the rules the documents state' }],
	};
}

/** The INV-5 failure of the plan, or the failure of a later rule (the plan is one task short of a whole plan), or null. */
const inv5 = (plan: PlanTask, catalog = getTemplatesForTarget(plan.target)): { message: string; target?: Readonly<Record<string, unknown>> } | null => {
	const failure = validatePlan(plan, catalog);
	return failure !== null && failure.invariantId === 'INV-5' ? failure : null;
};

test('a plan whose adherence task has no topic, no inline constraints and no stored-document ids fails validation with the task, the three ways to give constraints and the option to leave the task out (code, data and infra), and the INV-5 fix hint sent with the message gives the same remedies, including removing the task and renumbering the ids that follow', async () => {
	freshRegistry();
	registerBuiltinTemplates();
	for (const [template, target, subjectKey] of ADHERENCE) {
		// The plans of the live runs: a subject and nothing to check it against.
		const failure = inv5(adherencePlan(template, target, { [subjectKey]: '.github/workflows/ci.yml' }));
		assert.equal(
			failure?.message,
			`task t01 (${template}): an adherence check needs constraints to check against, and this task gives none. `
			+ `Give ${WAYS}; or leave the task out of the plan.`,
			template,
		);
		assert.deepEqual(failure?.target, { index: 0, taskId: 't01', template, problem: 'no-constraint-source' }, template);
	}

	// The hint the planner's retry is sent with every INV-5 failure.
	const { invariantFixHint } = await import('../invariant-fix-hints.js');
	const remedies = invariantFixHint('INV-5').remedies.join('\n');
	for (const name of ['`constraintTopic`', '`constraints`', '`constraintIds`']) assert.ok(remedies.includes(name), name);
	assert.match(remedies, /REMOVE the task instead and renumber the task ids that follow/);
});

test('an adherence task with a topic, with an inline list, or with stored-document ids validates; one whose only source is an empty topic or an empty list does not, a non-empty override with an empty list beside it still validates, one with the removed constraintsSource does not, and for constraintsSource the message says to give constraintTopic instead, also in a generic plan that holds the docs task and also beside a usable override', () => {
	freshRegistry();
	registerBuiltinTemplates();
	const inline = [{ constraint: 'refunds MUST be issued within 30 days' }];
	for (const [template, target, subjectKey] of ADHERENCE) {
		const subject = { [subjectKey]: 'payments' };
		const passes: ReadonlyArray<Record<string, unknown>> = [
			{ constraintTopic: 'refund rules' },
			{ constraintTopic: 'refund rules', maxConstraintSources: 5 },
			{ constraints: inline },
			{ constraintIds: ['doc-1'] },
			// A usable source with an empty list beside it, as a task may be written today.
			{ constraints: inline, constraintIds: [] },
			{ constraints: [], constraintIds: ['doc-1'] },
			{ constraints: [], constraintIds: [], constraintTopic: 'refund rules' },
		];
		for (const params of passes) {
			assert.equal(inv5(adherencePlan(template, target, { ...subject, ...params })), null, `${template} ${JSON.stringify(params)}`);
		}
		const fails: ReadonlyArray<Record<string, unknown>> = [
			{ constraintTopic: '' }, { constraintTopic: '   ' }, { constraints: [] }, { constraintIds: [] }, { constraints: [], constraintIds: [] },
		];
		for (const params of fails) {
			assert.equal(inv5(adherencePlan(template, target, { ...subject, ...params }))?.target?.['problem'], 'no-constraint-source', `${template} ${JSON.stringify(params)}`);
		}
		// A list whose items are empty is refused by the schema: the check could not use it, and would not try the topic beside it.
		for (const params of [{ constraints: [{ constraint: '' }] }, { constraintIds: [''] }, { constraints: [{ constraint: '' }], constraintTopic: 'refund rules' }]) {
			assert.match(inv5(adherencePlan(template, target, { ...subject, ...params }))?.message ?? '', /^task t01: params failed inputSchema: .*must NOT have fewer than 1 characters/, `${template} ${JSON.stringify(params)}`);
		}

		// The removed parameter: alone, and beside a source that would otherwise do.
		const removed = `task t01 (${template}): \`constraintsSource\` is no longer accepted: an adherence check does not take `
			+ `its constraints from another task's output. Remove it and give ${WAYS}.`;
		for (const params of [{ constraintsSource: 'constraints' }, { constraintsSource: 't01', constraintIds: ['doc-1'] }, { constraintsSource: 't01', constraintTopic: 'refund rules' }]) {
			const failure = inv5(adherencePlan(template, target, { ...subject, ...params }));
			assert.equal(failure?.message, removed, `${template} ${JSON.stringify(params)}`);
			assert.equal(failure?.target?.['problem'], 'constraints-source-removed');
		}
	}

	// A generic plan may hold the docs task; reading its output through constraintsSource worked before, and is refused now.
	const generic: PlanTask = {
		planId: 'p-root', goal: 'check the payments code against the documents', target: 'generic', scope: 'XS',
		reasoning: 'enumerate the constraints the documents state, then check the code against them',
		tasks: [
			{ taskId: 't01', template: 'docs.constraint.enumerate', kind: 'leaf', params: { subject: 'refund rules' }, produces: ['constraints'], rationale: 'list the constraints the documents state on refunds' },
			{ taskId: 't02', template: 'code.adherence.check', kind: 'leaf', params: { codeSubject: 'payments', constraintsSource: 'constraints' }, consumes: ['constraints'], produces: ['adherence-report'], rationale: 'check the payments code against those constraints' },
			{ taskId: 't03', template: 'generic.aggregate.report', kind: 'leaf', params: {}, consumes: ['adherence-report'], produces: ['report'], rationale: 'write the report from the adherence findings' },
		],
	};
	const catalog = getTemplatesForTarget('generic');
	assert.match(inv5(generic, catalog)?.message ?? '', /^task t02 \(code\.adherence\.check\): `constraintsSource` is no longer accepted: .* give `constraintTopic` /);
	// With a topic in its place, the same plan validates whole.
	const fixed: PlanTask = { ...generic, tasks: generic.tasks.map(t => t.taskId === 't02' ? { ...t, params: { codeSubject: 'payments', constraintTopic: 'refund rules' } } : t) };
	assert.equal(validatePlan(fixed, catalog), null);
});

test('the catalog shown to the planner for each adherence template names constraintTopic and does not name constraintsSource or docs.constraint.enumerate', () => {
	freshRegistry();
	registerBuiltinTemplates();
	for (const [template, , subjectKey] of ADHERENCE) {
		const tmpl = getTemplate(template)!;
		const shown = renderCatalog([tmpl]);
		for (const name of ['constraintTopic', 'maxConstraintSources', 'constraints', 'constraintIds']) assert.ok(shown.includes(`"${name}"`), `${template}: ${name}`);
		assert.ok(!shown.includes('constraintsSource'), template);
		assert.ok(!shown.includes('docs.constraint.enumerate'), template);
		assert.ok(!shown.includes('upstream'), template);
		// The three ways, in the description and as the schema's rule.
		assert.match(tmpl.description ?? '', /Give the check its constraints in one of three ways: `constraintTopic` .*`constraints` .*`constraintIds`/, template);
		const schema = tmpl.inputSchema as { required: string[]; anyOf: unknown; properties: Record<string, unknown> };
		assert.deepEqual(schema.required, [subjectKey], template);
		assert.deepEqual(schema.anyOf, [{ required: ['constraintTopic'] }, { required: ['constraints'] }, { required: ['constraintIds'] }], template);
		assert.equal(tmpl.revision, 'r2', template);
		// What the report adds is listed and not required.
		const out = tmpl.outputSchema as { required: string[]; properties: Record<string, unknown> };
		for (const name of ['constraints', 'constraintSource']) {
			assert.ok(name in out.properties, `${template}: outputSchema lists ${name}`);
			assert.ok(!out.required.includes(name), `${template}: outputSchema does not require ${name}`);
		}
	}
});
