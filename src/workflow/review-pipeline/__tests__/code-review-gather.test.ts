/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The divided code review's gather pieces (Epic 8315a11f s3): each dimension's
 * obligations and context, built from the saved subject and the snapshot only.
 *
 * Run: npx tsx --test src/workflow/review-pipeline/__tests__/code-review-gather.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { adherenceSpec, buildAdherencePrompt } from '../../code-review/dimensions/adherence.js';
import { buildConventionsPrompt, conventionsSpec } from '../../code-review/dimensions/conventions.js';
import { buildCoveragePrompt, coverageSpec } from '../../code-review/dimensions/coverage.js';
import { buildFunctionalCoveragePrompt, functionalCoverageSpec } from '../../code-review/dimensions/functional-coverage.js';
import { qualitySpec } from '../../code-review/dimensions/quality.js';
import type { ChangedSymbolSummary, CodeReviewGrounding, CodeReviewSubject } from '../../code-review/types.js';
import { codeReviewSnapshot, modelDimensionAdapter, type ModelDimensionSpec } from '../code-review.js';
import type { ReviewMaterial } from '../types.js';

const LLD_BODY = {
	contractDetails: { surfaceLevel: 'internal', api: [{ name: 'placeOrder', signature: 'placeOrder(customer: string): string' }, { name: 'cancelOrder', signature: 'cancelOrder(id: string): void' }] },
	dataModelChanges: [{ entity: 'OrderRow', change: 'field-add', details: 'status' }],
	errorPaths: {
		errorCases: [{ scenario: 'An unknown customer places an order.', detection: 'lookup misses', response: 'refuse' }],
		edgeCases: [{ input: 'An empty basket.', expected: 'No order.' }],
		invariantsToPreserve: [{ text: 'An order id is never reused.', source: 'c1' }],
	},
	functionalDefinition: { requirements: [{ id: 'FR1', statement: 'A customer can place an order.', scope: 'doc' }, { id: 'FR2', statement: 'A placed order can be cancelled.', scope: 'doc' }] },
};
const SMOKE = 'Installed daemon: an order placed through the RPC is stored';
const UNIT = "src/order/__tests__/order.test.ts: 'places an order'";
const PLAN_BODY = {
	tasks: [
		{ id: 't1', title: 'Place an order', summary: 'placeOrder', acceptanceChecks: ['placed'], tests: [{ level: 'unit', name: UNIT }] },
		{ id: 't2', title: 'Smoke', summary: 'update the daemon', acceptanceChecks: ['runs'], tests: [{ level: 'smoke', name: SMOKE }, { level: 'unit', name: UNIT }] },
	],
};
const TESTS_RECORD = {
	meta: {}, body: { tasks: [
		{ taskId: 't1', ranAt: '2026-10-20T10:00:00.000Z', files: [
			{ file: 'src/order/__tests__/order.test.ts', titles: [{ title: 'places an order', result: 'pass' }], exitCode: 0, timedOut: false },
			{ file: 'src/other/__tests__/other.test.ts', titles: [{ title: 'something else', result: 'pass' }], exitCode: 0, timedOut: false },
		], tests: [] },
		{ taskId: 't2', ranAt: '2026-10-20T11:00:00.000Z', files: [], tests: [{ name: SMOKE, reported: { result: 'pass', evidence: 'docs/smoke.txt' } }] },
		{ taskId: 't3', ranAt: '2026-10-20T12:00:00.000Z' },
	] },
};

const subject = (over: Partial<CodeReviewSubject> = {}): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 's1', changedFiles: ['src/order/order.ts', 'src/order/cancel.ts', 'src/basket/basket.ts'],
	approvedLld:  { body: LLD_BODY } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: PLAN_BODY } as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord:  { body: { tasks: [{ id: 't1', passed: true }, { id: 't2', passed: true }] } } as unknown as CodeReviewSubject['buildRecord'],
	testRecord:   TESTS_RECORD as unknown as CodeReviewSubject['testRecord'],
	...over,
});
const row = (name: string, file: string): ChangedSymbolSummary =>
	({ entityId: `id-${name}`, file, kind: 'function', name, signature: `${name}()`, callers: [], callees: [], testsReaching: [] });
const GROUNDING: CodeReviewGrounding = { symbols: [row('placeOrder', 'src/order/order.ts'), row('cancelOrder', 'src/order/cancel.ts'), row('fill', 'src/basket/basket.ts')] };

function materialOf<O>(spec: ModelDimensionSpec<O>, s: CodeReviewSubject, g: CodeReviewGrounding = GROUNDING, mode: 'full' | 'degraded' = 'full'): ReviewMaterial {
	return modelDimensionAdapter(spec, s, codeReviewSnapshot(s, g, mode)).material();
}
const keys = (m: ReviewMaterial): string[] => m.obligations.map(o => o.key);
const promptText = (messages: readonly { content: unknown }[]): string => messages.map(m => m.content as string).join('\n');

test("each dimension's obligations equal what today's prompt judges: clauses and plan tasks, FRs, promised tests, touched modules; adherence has none without an approved LLD or plan", () => {
	const s = subject();

	// adherence: every LLD clause and every PLAN task, each naming its clause as context.
	const adherence = materialOf(adherenceSpec(s), s);
	assert.deepEqual(keys(adherence), ['lld:contract:1', 'lld:contract:2', 'lld:data-model:1', 'lld:error:1', 'lld:edge:1', 'lld:invariant:1', 'plan:t1', 'plan:t2']);
	assert.ok(adherence.obligations.every(o => o.kind === 'clause'));
	const adherencePrompt = promptText(buildAdherencePrompt(s, GROUNDING, undefined));
	for (const o of adherence.obligations) {
		assert.equal(o.atomIds?.length, 1, `${o.key} names its clause`);
		const clause = JSON.parse(adherence.context!.find(a => a.id === o.atomIds![0])!.text) as Record<string, unknown>;
		// The clause is one today's prompt carries: each of its values is in the prompt's LLD or PLAN JSON.
		for (const v of Object.values(clause)) if (typeof v === 'string') assert.ok(adherencePrompt.includes(JSON.stringify(v)), `${o.key}: ${v} is in today's prompt`);
	}

	// functional coverage: one per FR, as today's prompt lists them.
	const fc = materialOf(functionalCoverageSpec(s), s);
	assert.deepEqual(keys(fc), ['fr:FR1', 'fr:FR2']);
	const fcPrompt = promptText(buildFunctionalCoveragePrompt(s, GROUNDING, undefined));
	for (const o of fc.obligations) assert.ok(fcPrompt.includes(o.key.slice('fr:'.length)) && o.kind === 'requirement');

	// coverage: one per promised test (the plan names UNIT twice: one obligation), as today's prompt lists them.
	const coverage = materialOf(coverageSpec(s), s);
	assert.deepEqual(keys(coverage), [`test:${UNIT}`, `test:${SMOKE}`]);
	const coveragePrompt = promptText(buildCoveragePrompt(s, GROUNDING, undefined));
	for (const name of [UNIT, SMOKE]) assert.ok(coveragePrompt.includes(JSON.stringify(name).slice(1, -1)), `${name} is a promised test today's prompt lists`);
	assert.ok(coverage.obligations.every(o => o.kind === 'promised-test'));

	// conventions: one per touched module (the changed symbols' directories), as today's prompt carries their symbols.
	const conventions = materialOf(conventionsSpec(s), s);
	assert.deepEqual(keys(conventions), ['module:src/order', 'module:src/basket']);
	const conventionsPrompt = promptText(buildConventionsPrompt(s, GROUNDING, undefined));
	for (const sym of GROUNDING.symbols) assert.ok(conventionsPrompt.includes(sym.file));

	// quality: none.
	assert.deepEqual(materialOf(qualitySpec(s), s).obligations, []);

	// adherence without an approved LLD or plan: no obligations and no call (today's skip stage).
	const bare = subject({ approvedLld: null, approvedPlan: null });
	const spec = adherenceSpec(bare);
	const adapter = modelDimensionAdapter(spec, bare, codeReviewSnapshot(bare, GROUNDING));
	assert.deepEqual(adapter.material().obligations, []);
	assert.equal(adapter.material().context, undefined);
	assert.deepEqual(adapter.stagesFor('daemon').map(st => [st.id, st.kind]), [['skip', 'deterministic']], 'no model call');
	// With only a plan, its tasks; with only an LLD, its clauses.
	assert.deepEqual(keys(materialOf(adherenceSpec(subject({ approvedLld: null })), subject({ approvedLld: null }))), ['plan:t1', 'plan:t2']);
	assert.equal(keys(materialOf(adherenceSpec(subject({ approvedPlan: null })), subject({ approvedPlan: null }))).filter(k => k.startsWith('plan:')).length, 0);
});

test("a promised test's obligation context holds its reported result, build tasks, notes and test-file atoms chosen by name, also with empty grounding, and is identical on every rebuild", () => {
	const s = subject();
	for (const [g, mode] of [[GROUNDING, 'full'], [{ symbols: [] }, 'full'], [GROUNDING, 'degraded']] as const) {
		const m = materialOf(coverageSpec(s), s, g, mode);
		const ctx = (key: string) => m.obligations.find(o => o.key === key)!.atomIds!.map(id => m.context!.find(a => a.id === id)!);

		// The smoke test, passed only as reported: its reported result, the build tasks and the record's notes; no test file names it.
		const smoke = ctx(`test:${SMOKE}`);
		assert.deepEqual(smoke.map(a => a.id), [`ctx:reported:${SMOKE}`, 'ctx:record:build-tasks', 'ctx:record:notes'], `${mode}, ${g.symbols.length} symbols`);
		const reported = JSON.parse(smoke[0]!.text) as { result: string; evidence: string; source: string };
		assert.equal(reported.result, 'pass');
		assert.equal(reported.evidence, 'docs/smoke.txt');
		assert.match(reported.source, /reported by the builder/);
		assert.deepEqual(JSON.parse(smoke[1]!.text), [{ taskId: 't1', passed: 'pass' }, { taskId: 't2', passed: 'pass' }]);
		assert.match(smoke[2]!.text, /task t3 has no files list/);

		// The unit test: no reported result; its own test file (status and titles), not the other file.
		const unit = ctx(`test:${UNIT}`);
		assert.deepEqual(unit.map(a => a.id), ['ctx:record:build-tasks', 'ctx:record:notes', 'ctx:test-file:src/order/__tests__/order.test.ts']);
		const file = JSON.parse(unit[2]!.text) as { state: string; titles: { title: string; result: string }[] };
		assert.equal(file.state, 'passing');
		assert.deepEqual(file.titles, [{ title: 'places an order', result: 'pass' }]);

		// Shared atoms are listed once.
		assert.equal(new Set(m.context!.map(a => a.id)).size, m.context!.length);
	}

	// A file whose path differs but which ran the promised title names the test too.
	const moved = subject({ testRecord: { meta: {}, body: { tasks: [{ taskId: 't1', ranAt: '2026-10-20T10:00:00.000Z', files: [
		{ file: 'src/order/__tests__/order-moved.test.ts', titles: [{ title: 'places an order', result: 'fail' }], exitCode: 1, timedOut: false },
	], tests: [] }] } } as unknown as CodeReviewSubject['testRecord'] });
	const movedM = materialOf(coverageSpec(moved), moved);
	assert.ok(movedM.obligations.find(o => o.key === `test:${UNIT}`)!.atomIds!.includes('ctx:test-file:src/order/__tests__/order-moved.test.ts'));

	// No test record: every promised test is judged on the statement that none is available.
	const none = subject({ testRecord: null });
	const noneM = materialOf(coverageSpec(none), none);
	for (const o of noneM.obligations) assert.deepEqual(o.atomIds, ['ctx:record:none']);
	assert.match(noneM.context![0]!.text, /No test record is available/);

	// Built from the saved subject and the snapshot only: every rebuild, including from a copy, is identical.
	const snap = codeReviewSnapshot(s, GROUNDING);
	for (const spec of [adherenceSpec, coverageSpec, functionalCoverageSpec, conventionsSpec, qualitySpec] as const) {
		const first = modelDimensionAdapter(spec(s) as ModelDimensionSpec<unknown>, s, snap).material();
		const again = modelDimensionAdapter(spec(s) as ModelDimensionSpec<unknown>, s, snap).material();
		const copied = modelDimensionAdapter(spec(structuredClone(s)) as ModelDimensionSpec<unknown>, structuredClone(s), structuredClone(snap)).material();
		assert.deepEqual(again, first);
		assert.deepEqual(copied, first);
	}
});
