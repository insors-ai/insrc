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
import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import { chunkNotesFrom, NOTES_CHUNK_SCHEMA } from '../adapters/code-review-chunk.js';
import { NO_EVIDENCE, REDUCE_NOTE_SCHEMA } from '../adapters/code-review-gather.js';
import { codeReviewSnapshot, modelDimensionAdapter, type ModelDimensionSpec } from '../code-review.js';
import { applyOutput, createReviewJob, nextCalls, ReviewCallFailedError } from '../job.js';
import type { ReviewAdapter, ReviewCall, ReviewMaterial, ReviewPipelineJob } from '../types.js';

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

// -- chunk stage (t2) ----------------------------------------------------------

/** Six symbols in three directories, too large together for a small limit; placeOrder calls fill, and the two do not fit one call. */
const big = (name: string, file: string, callees: string[] = [], chars = 2_500): ChangedSymbolSummary =>
	({ ...row(name, file), signature: `${name}(${'p'.repeat(chars)})`, callees });
const DIVIDING: CodeReviewGrounding = { symbols: [
	big('placeOrder', 'src/order/order.ts', ['fill'], 5_500), big('cancelOrder', 'src/order/cancel.ts'), big('fill', 'src/basket/basket.ts', [], 5_500),
	big('empty', 'src/basket/empty.ts'), big('price', 'src/price/price.ts'), big('discount', 'src/price/discount.ts'),
] };
const SMALL = 14_000;
const NOTES_ONLY = [['adherence', adherenceSpec], ['functional-coverage', functionalCoverageSpec], ['conventions', conventionsSpec]] as const;

function dividedJob<O>(spec: (s: CodeReviewSubject) => ModelDimensionSpec<O>, s: CodeReviewSubject = subject(), limit = SMALL): { job: ReviewPipelineJob; adapter: ReviewAdapter<unknown> } {
	const snap = codeReviewSnapshot(s, DIVIDING);
	const adapter = modelDimensionAdapter(spec(s), s, snap, limit) as unknown as ReviewAdapter<unknown>;
	return { job: createReviewJob(adapter, 'daemon', snap, limit), adapter };
}
const echo = (call: ReviewCall, answer: unknown) => ({ callId: /This request's id is "([^"]+)"/.exec(promptText(call.messages))![1]!, answer });

test('adherence, functional-coverage and conventions chunk schemas have no findings field, so a missing clause or unrealized FR naming a valid chunk location cannot be recorded from a chunk', () => {
	const props = (NOTES_CHUNK_SCHEMA as { properties: Record<string, unknown>; additionalProperties: boolean }).properties;
	assert.deepEqual(Object.keys(props), ['notes'], 'notes only');
	assert.equal((NOTES_CHUNK_SCHEMA as { additionalProperties: boolean }).additionalProperties, false);
	const missing = { severity: 'HIGH', location: 'src/order/order.ts:1', message: 'clause lld:contract:2 is not implemented', expectationRef: 'lld:contract:2' };
	// A findings field, or a finding smuggled into a note, fails the schema.
	assert.equal(validateAgainstSchema(NOTES_CHUNK_SCHEMA, { notes: [], findings: [missing] }).ok, false);
	assert.equal(validateAgainstSchema(NOTES_CHUNK_SCHEMA, { notes: [{ key: 'lld:contract:2', atomIds: [], note: 'x', ...missing }] }).ok, false);
	assert.equal(validateAgainstSchema(NOTES_CHUNK_SCHEMA, { notes: [{ key: 'lld:contract:2', atomIds: [], note: 'x' }] }).ok, true);

	for (const [name, spec] of NOTES_ONLY) {
		const { job, adapter } = dividedJob(spec);
		assert.equal(job.plan.single, false, `${name}: divided`);
		const call = nextCalls(job, adapter)[0]!;
		assert.equal(call.role, 'chunk');
		assert.deepEqual(call.prompt.schema, NOTES_CHUNK_SCHEMA, `${name}: the chunk call asks for notes only`);
		// The pipeline rejects an answer carrying a finding, whatever location it names: it is re-issued, never recorded.
		const next = applyOutput(job, adapter, call.callId, echo(call, { notes: [], findings: [missing] }));
		assert.equal(next.stageAnswers.length, 0, `${name}: nothing recorded`);
		assert.ok(next.pending.some(c => c.attempt === 2 && c.carries.chunkId === call.carries.chunkId), `${name}: re-issued`);
	}
});

test("a chunk answer with an unknown key, an atom outside its call's carries, or a coverage finding that is not symbol coverage of a carried symbol is rejected and re-issued with a correction note", () => {
	for (const [name, spec] of NOTES_ONLY) {
		const { job, adapter } = dividedJob(spec);
		const key = adapter.material().obligations[0]!.key;
		const first = nextCalls(job, adapter)[0]!;
		const outside = DIVIDING.symbols.map(s => s.entityId).find(id => !first.carries.atomIds.includes(id))!;
		// An unknown key: re-issued once, the same chunk call with the reason appended, never today's single prompt.
		let next = applyOutput(job, adapter, first.callId, echo(first, { notes: [{ key: 'no-such-key', atomIds: [first.carries.atomIds[0]], note: 'x' }] }));
		const again = next.pending.find(c => c.attempt === 2)!;
		assert.ok(again !== undefined, `${name}: re-issued`);
		assert.equal(again.carries.chunkId, first.carries.chunkId, `${name}: the same chunk`);
		assert.deepEqual(again.prompt.schema, NOTES_CHUNK_SCHEMA, `${name}: still the chunk call`);
		const system = again.prompt.messages[0]!.content as string;
		assert.ok(system.includes('REJECTED') && system.includes('keys that are not listed obligation keys: "no-such-key"'), `${name}: the correction names the reason`);
		assert.ok((again.prompt.messages[1]!.content as string) === (first.prompt.messages[1]!.content as string), `${name}: the chunk's payload is unchanged`);
		// Many bad notes give one short reason per kind, each value once.
		const many = Array.from({ length: 200 }, () => ({ key: 'no-such-key', atomIds: [outside], note: 'x' }));
		const reasons = adapter.stagesFor('daemon')[0]!.validate!({ notes: many }, first);
		assert.deepEqual(reasons, ['notes use keys that are not listed obligation keys: "no-such-key"', `notes name atomIds that are not symbols in this chunk: "${outside}"`], name);
		// An atom outside the call's carries on the re-issue: the review fails.
		assert.throws(() => applyOutput(next, adapter, again.callId, echo(again, { notes: [{ key, atomIds: [outside], note: 'x' }] })),
			(e: unknown) => e instanceof ReviewCallFailedError && /invalid-answer/.test(e.message), name);
		// A valid answer is recorded.
		next = applyOutput(job, adapter, first.callId, echo(first, { notes: [{ key, atomIds: [first.carries.atomIds[0]!], note: 'realised here' }] }));
		assert.equal(next.stageAnswers.length, 1, name);
		// The gather reads the keyed notes from the recorded answer.
		assert.deepEqual(chunkNotesFrom(next.stageAnswers[0]!), [{ key, text: 'realised here', atomIds: [first.carries.atomIds[0]!] }], name);
	}
	// Coverage: a chunk may report only symbol-coverage findings about the symbols it holds.
	{
		const { job, adapter } = dividedJob(coverageSpec);
		const first = nextCalls(job, adapter)[0]!;
		const mine = first.carries.atomIds[0]!;
		const outside = DIVIDING.symbols.map(x => x.entityId).find(id => !first.carries.atomIds.includes(id))!;
		const finding = (findingKind: string, symbolId: string) => ({ severity: 'HIGH', location: 'src/order/order.ts:1', message: 'm', findingKind, symbolId });
		// A promised-test finding from a chunk: re-issued with the reason, the same chunk call.
		const next = applyOutput(job, adapter, first.callId, echo(first, { findings: [finding('promised-test', mine)], notes: [] }));
		const again = next.pending.find(c => c.attempt === 2)!;
		assert.ok(again !== undefined && again.carries.chunkId === first.carries.chunkId, 'coverage: re-issued');
		assert.match(again.prompt.messages[0]!.content as string, /REJECTED[\s\S]*only symbol-coverage findings[\s\S]*"promised-test"/);
		assert.deepEqual(again.prompt.schema, first.prompt.schema, 'coverage: still the chunk call');
		// A symbol-coverage finding about a symbol this chunk does not hold, on the re-issue: the review fails.
		assert.throws(() => applyOutput(next, adapter, again.callId, echo(again, { findings: [finding('symbol-coverage', outside)], notes: [] })),
			(e: unknown) => e instanceof ReviewCallFailedError && /invalid-answer/.test(e.message));
		// A symbol-coverage finding about a symbol it holds, and a note on a promised test, are recorded.
		const ok = applyOutput(job, adapter, first.callId, echo(first, { findings: [finding('symbol-coverage', mine)], notes: [{ key: `test:${UNIT}`, atomIds: [mine], note: 'exercised' }] }));
		assert.equal(ok.stageAnswers.length, 1);
		// Under the limit: today's coverage prompt and schema.
		const single = dividedJob(coverageSpec, subject(), 384_000).job;
		assert.equal(single.plan.single, true);
		assert.deepEqual(single.pending[0]!.prompt.messages, coverageSpec(subject()).prompt(DIVIDING, 'full', undefined));
		assert.deepEqual(single.pending[0]!.prompt.schema, coverageSpec(subject()).schema);
	}
});

test("a notes-only chunk call carries the chunk's rows, neighbour lines and context atoms within the limit, and under the limit the single prompt is today's", () => {
	const s = subject();
	for (const [name, spec] of NOTES_ONLY) {
		const { job, adapter } = dividedJob(spec);
		const material = adapter.material();
		let sawNeighbour = false;
		for (const call of job.pending) {
			assert.ok(call.chars <= SMALL, `${name}: a ${call.chars}-character call`);
			const user = call.prompt.messages[1]!.content as string;
			for (const id of call.carries.atomIds) {
				const sig = DIVIDING.symbols.find(x => x.entityId === id)!.signature;
				assert.ok(user.includes(JSON.stringify(sig)), `${name}: ${id} is read whole`);
			}
			for (const o of material.obligations) assert.ok(user.includes(JSON.stringify(o.key)), `${name}: obligation ${o.key} listed`);
			for (const a of material.context ?? []) assert.ok(user.includes(a.label) && user.includes(a.text), `${name}: context ${a.id}`);
			const chunk = job.plan.chunks.find(c => c.id === call.carries.chunkId)!;
			for (const n of chunk.neighbours) { sawNeighbour = true; assert.ok(user.includes(`- ${n.summary} (in ${n.heldInChunk})`)); }
		}
		assert.ok(sawNeighbour, `${name}: the cut call relation is summarised`);
		// Under the limit: one call, today's prompt and schema.
		const single = dividedJob(spec, s, 384_000).job;
		assert.equal(single.plan.single, true);
		assert.equal(single.pending.length, 1);
		assert.deepEqual(single.pending[0]!.prompt.messages, spec(s).prompt(DIVIDING, 'full', undefined), `${name}: today's prompt`);
		assert.deepEqual(single.pending[0]!.prompt.schema, spec(s).schema);
	}
	// Conventions' chunk calls carry its documented rules, as today's prompt does.
	const conv = dividedJob(conventionsSpec).job.pending[0]!.prompt.messages[1]!.content as string;
	assert.ok(conv.includes('## Documented rules'));
});

test('a quality chunk answer missing, repeating or adding a description is rejected, re-issued once, then fails the review', () => {
	const { job, adapter } = dividedJob(qualitySpec);
	const first = nextCalls(job, adapter)[0]!;
	const ids = first.carries.atomIds;
	assert.ok(ids.length >= 2, 'a chunk with two symbols');
	const outside = DIVIDING.symbols.map(x => x.entityId).find(id => !ids.includes(id))!;
	const d = (atomId: string) => ({ atomId, description: `what ${atomId} does` });
	const cases: [string, unknown[], RegExp][] = [
		['missing', ids.slice(1).map(d), /descriptions are missing for symbols in this chunk: "[^"]+"/],
		['repeated', [...ids.map(d), d(ids[0]!)], /descriptions repeat symbols: "[^"]+"/],
		['foreign', [...ids.map(d), d(outside)], /descriptions name atomIds that are not symbols in this chunk: "[^"]+"/],
	];
	for (const [name, descriptions, reason] of cases) {
		const next = applyOutput(job, adapter, first.callId, echo(first, { findings: [], descriptions }));
		const again = next.pending.find(c => c.attempt === 2)!;
		assert.ok(again !== undefined && again.carries.chunkId === first.carries.chunkId, `${name}: re-issued once, the same chunk`);
		assert.match(again.prompt.messages[0]!.content as string, reason, `${name}: the reason names the ids`);
		assert.throws(() => applyOutput(next, adapter, again.callId, echo(again, { findings: [], descriptions })),
			(e: unknown) => e instanceof ReviewCallFailedError && /invalid-answer/.test(e.message), `${name}: a second time fails the review`);
	}
	// Exactly one description per carried symbol is recorded.
	assert.equal(applyOutput(job, adapter, first.callId, echo(first, { findings: [], descriptions: ids.map(d) })).stageAnswers.length, 1);
	// Under the limit: today's quality prompt and schema.
	const single = dividedJob(qualitySpec, subject(), 384_000).job;
	assert.equal(single.plan.single, true);
	assert.deepEqual(single.pending[0]!.prompt.messages, qualitySpec(subject()).prompt(DIVIDING, 'full', undefined));
	assert.deepEqual(single.pending[0]!.prompt.schema, qualitySpec(subject()).schema);
});

// -- gather (t4) ---------------------------------------------------------------

/** Answer every call `answer` gives an answer for, to the end of the job (or until the
 *  divided finish of t7 is reached, while it is not built). Returns every call made. */
function drive(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, answer: (call: ReviewCall) => unknown): { job: ReviewPipelineJob; calls: ReviewCall[] } {
	const calls: ReviewCall[] = [];
	try {
		for (let guard = 0; job.phase !== 'done'; guard++) {
			assert.ok(guard < 500, 'progress');
			const call = nextCalls(job, adapter)[0];
			assert.ok(call !== undefined, `a call in phase ${job.phase}`);
			calls.push(call);
			job = applyOutput(job, adapter, call.callId, echo(call, answer(call)));
		}
	} catch (e) {
		if (!/dividing a code review is not available yet/.test(String(e))) throw e;
	}
	return { job, calls };
}
const userOf = (call: ReviewCall): string => call.prompt.messages[1]!.content as string;

test('a key with no notes is adjudicated on the no-evidence statement', () => {
	const s = subject();
	const { job, adapter } = dividedJob(adherenceSpec, s);
	const keys = adapter.material().obligations.map(o => o.key);
	const noted = keys[0]!;
	const { calls } = drive(job, adapter, call => call.role === 'chunk'
		? { notes: call.carries.chunkId === job.plan.chunks[0]!.id ? [{ key: noted, atomIds: [call.carries.atomIds[0]!], note: 'placeOrder implements this contract' }] : [] }
		: { findings: [] });
	const obligations = calls.filter(c => c.role === 'obligation');
	// Every obligation is judged once, the noted one on its note, every other on the no-evidence statement.
	assert.deepEqual(obligations.map(c => c.carries.key).sort(), [...keys].sort());
	for (const c of obligations) {
		assert.deepEqual(c.prompt.schema, adherenceSpec(s).schema, "today's findings schema");
		if (c.carries.key === noted) {
			assert.ok(userOf(c).includes('placeOrder implements this contract') && !userOf(c).includes(NO_EVIDENCE));
		} else {
			assert.ok(userOf(c).includes(NO_EVIDENCE), `${c.carries.key} is judged on the no-evidence statement`);
		}
		// Its own context (the clause) is in the call.
		const ctxId = adapter.material().obligations.find(o => o.key === c.carries.key)!.atomIds![0]!;
		assert.ok(userOf(c).includes(adapter.material().context!.find(a => a.id === ctxId)!.text));
	}
	// A missing clause reported by its obligation call is a finding of the dimension, as one call would report it.
	const gather = adapter.gather!;
	const missing = { severity: 'HIGH', location: 'src/order/cancel.ts:1', message: 'cancelOrder is not implemented', expectationRef: 'LLD contract 2: cancelOrder' };
	const part = gather.partOf({ role: 'obligation', key: keys[1]!, atomIds: [], answer: { findings: [missing] } }) as { findings: unknown[] };
	assert.deepEqual(part.findings, [{ ...missing, dimension: 'adherence' }]);
});

test('a conventions candidate rejected by the module judgement is absent from the merged result', () => {
	const { job, adapter } = dividedJob(conventionsSpec);
	const deviation = 'cancelOrder uses a callback where the module uses promises: candidate deviation';
	const { calls } = drive(job, adapter, call => {
		if (call.role === 'chunk') {
			const mod = adapter.material().obligations.find(o => o.key === 'module:src/order');
			return { notes: call.carries.atomIds.some(id => id === 'id-cancelOrder') && mod !== undefined ? [{ key: 'module:src/order', atomIds: ['id-cancelOrder'], note: deviation }] : [] };
		}
		return { findings: [] };   // the module judgement rejects the candidate
	});
	const judged = calls.find(c => c.role === 'obligation' && c.carries.key === 'module:src/order')!;
	assert.ok(userOf(judged).includes(deviation), 'the module judgement sees the candidate');
	assert.ok(userOf(judged).includes('## Documented rules'), 'with the documented rules');
	// The chunk could not record it (notes only); the module judgement rejected it: no finding remains.
	const gather = adapter.gather!;
	const parts = calls.filter(c => c.role === 'obligation').map(c => gather.partOf({ role: 'obligation', key: c.carries.key!, atomIds: [], answer: { findings: [] } }));
	const merged = gather.merge([{ dimension: 'conventions', findings: [] }, ...parts]) as { findings: unknown[] };
	assert.deepEqual(merged.findings, []);
});

test('a promised test passed only by a reported smoke run, with no test file or reaching edge, gets that evidence in its obligation context and is not reported missing', () => {
	const s = subject();
	const { job, adapter } = dividedJob(coverageSpec, s);
	const { calls } = drive(job, adapter, call => call.role === 'chunk' ? { findings: [], notes: [] } : { findings: [] });
	const smoke = calls.find(c => c.role === 'obligation' && c.carries.key === `test:${SMOKE}`)!;
	const user = userOf(smoke);
	// Its reported result is in the call, chosen by name; no test file names it, and no symbol reaches it.
	assert.ok(user.includes('"result": "pass"') && user.includes('docs/smoke.txt') && user.includes('reported by the builder, not run by the gate'));
	assert.ok(!user.includes('src/order/__tests__/order.test.ts'), 'no test file names the smoke test');
	assert.ok(DIVIDING.symbols.every(x => x.testsReaching.length === 0));
	// The rules it is judged by: a reported pass needs no finding; only an unnamed, unreported test is missing.
	const system = smoke.prompt.messages[0]!.content as string;
	assert.match(system, /reported passed by the builder, needs no finding/);
	assert.match(system, /no test file names and no reported result covers is a HIGH missing-promised-test finding/);
	assert.ok(user.includes(`expectationRef ${JSON.stringify(SMOKE)}`), 'a finding about it would name it exactly');
	// Judged present, it adds no finding to the result.
	assert.deepEqual((adapter.gather!.partOf({ role: 'obligation', key: `test:${SMOKE}`, atomIds: [], answer: { findings: [] } }) as { findings: unknown[] }).findings, []);
});

test('a key whose notes exceed the limit is reduced into notes within noteCapChars and then judged, and every gather call fits', () => {
	const { job, adapter } = dividedJob(functionalCoverageSpec);
	const cap = adapter.gather!.noteCapChars;
	assert.equal(cap, Math.floor(SMALL / 4));
	// Every chunk writes a long note on FR1: together they cannot fit one judgement.
	const long = (c: ReviewCall) => `${c.carries.chunkId}: ${'evidence '.repeat(Math.floor(SMALL / 30))}`;
	let rejected = false;
	const { calls } = drive(job, adapter, call => {
		if (call.role === 'chunk') return { notes: [{ key: 'fr:FR1', atomIds: [call.carries.atomIds[0]!], note: long(call) }] };
		if (call.role === 'reduce') {
			// One over-long reduction is rejected and re-issued; the rest fit the cap.
			if (!rejected) { rejected = true; return { text: 'x'.repeat(cap + 1) }; }
			return { text: `condensed ${call.carries.noteIds.join(',')}` };
		}
		return { findings: [] };
	});
	const reduces = calls.filter(c => c.role === 'reduce');
	assert.ok(reduces.length >= 1, 'reduced');
	assert.ok(reduces.every(c => c.carries.key === 'fr:FR1'));
	assert.deepEqual(reduces[0]!.prompt.schema, REDUCE_NOTE_SCHEMA);
	assert.ok(reduces.some(c => c.attempt === 2), 'the over-long reduction was re-issued');
	const fr1 = calls.filter(c => c.role === 'obligation' && c.carries.key === 'fr:FR1');
	assert.equal(fr1.length, 1, 'then judged once');
	assert.ok(userOf(fr1[0]!).includes('condensed '), 'on the condensed notes');
	for (const c of calls) assert.ok(c.chars <= SMALL, `a ${c.role} call of ${c.chars} characters`);
});
