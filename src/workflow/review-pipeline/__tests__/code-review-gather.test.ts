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
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { ADHERENCE_LLD_EXCLUDED, ADHERENCE_LLD_SECTIONS } from '../adapters/code-review-obligations.js';
import { codeReviewSnapshot, modelDimensionAdapter, type ModelDimensionSpec } from '../code-review.js';
import { applyFailure, applyOutput, createReviewJob, nextCalls, result, ReviewCallFailedError } from '../job.js';
import { AtomTooLargeError } from '../pack-into-batches.js';
import { envelopeMessages, promptChars } from '../envelope.js';
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
	interactionWithShared: [{ contractId: 'sc1', role: 'consumes', howDetails: 'reads the order store' }],
	migration: { stateBefore: 'no orders', stateAfter: 'orders are stored', migrationSteps: [{ order: 1, action: 'add the order table', rollbackable: true }, { order: 2, action: 'backfill', rollbackable: true }], backwardCompat: 'old clients ignore the new field', zeroDowntime: true, dataRewriteRequired: false },
	hldContextSlice: { frameworkSummary: 'orders', adjacentBoundaries: [{ storyId: 's2', internal: 'payments' }] },
	testStrategy: { testFramework: 'node:test', testLevels: [] },
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
	assert.deepEqual(keys(adherence), ['lld:contract:1', 'lld:contract:2', 'lld:data-model:1', 'lld:error:1', 'lld:edge:1', 'lld:invariant:1', 'lld:shared:1', 'lld:migration:1', 'lld:migration:2', 'lld:backward-compat', 'lld:state-after', 'lld:scope', 'plan:t1', 'plan:t2']);
	// Every section of the body is either judged or excluded with a reason; the fixture's are all judged or excluded.
	for (const k of Object.keys(LLD_BODY)) assert.ok(ADHERENCE_LLD_SECTIONS.includes(k) || k in ADHERENCE_LLD_EXCLUDED, `fixture section ${k}`);
	// And so is every section of every LLD in this repository, so a new section cannot drop out of divided adherence unseen.
	const dir = join(process.cwd(), '.insrc', 'artifacts');
	const sections = new Set(readdirSync(dir).filter(f => /^LLD-.*\.json$/.test(f)).flatMap(f => Object.keys((JSON.parse(readFileSync(join(dir, f), 'utf8')) as { body: object }).body)));
	assert.ok(sections.size > 10, 'the repository LLDs were read');
	for (const k of sections) assert.ok(ADHERENCE_LLD_SECTIONS.includes(k) || k in ADHERENCE_LLD_EXCLUDED, `LLD section ${k} is neither judged by adherence nor excluded with a reason`);
	assert.ok(adherence.obligations.every(o => o.kind === 'clause'));
	const adherencePrompt = promptText(buildAdherencePrompt(s, GROUNDING, undefined));
	for (const o of adherence.obligations) {
		assert.equal(o.atomIds?.length, 1, `${o.key} names its clause`);
		const text = adherence.context!.find(a => a.id === o.atomIds![0])!.text;
		// The clause is one today's prompt carries: each of its values (or the clause itself, a string) is in the prompt's LLD or PLAN JSON.
		const clause = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) as Record<string, unknown> : { value: text };
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
		assert.ok(system.includes('REJECTED') && system.includes('1 notes use a key that is not one of the listed obligation keys (first: notes[0].key)'), `${name}: the correction names the reason`);
		assert.ok((again.prompt.messages[1]!.content as string) === (first.prompt.messages[1]!.content as string), `${name}: the chunk's payload is unchanged`);
		// Many bad notes, and made-up values of any length, give one fixed-size reason per kind:
		// the value is located, never repeated back, so the correction always fits beside the call.
		const huge = 'k'.repeat(SMALL * 2);
		const many = Array.from({ length: 200 }, () => ({ key: huge, atomIds: [huge], note: 'x' }));
		const reasons = adapter.stagesFor('daemon')[0]!.validate!({ notes: many }, first);
		assert.equal(reasons.length, 2, name);
		assert.ok(reasons.every(r => !r.includes(huge.slice(0, 50)) && r.length < 2_000), `${name}: fixed size`);
		assert.match(reasons[0]!, /^200 notes use a key that is not one of the listed obligation keys \(first: notes\[0\]\.key\)/);
		assert.match(reasons[1]!, /^200 atomIds name no symbol in this chunk \(first: notes\[0\]\.atomIds\[0\]\)/);
		// Re-issued with that answer, the correction is in the call, and the call fits the limit.
		const hugeNext = applyOutput(job, adapter, first.callId, echo(first, { notes: many }));
		const corrected = hugeNext.pending.find(c => c.attempt === 2)!;
		assert.match(corrected.prompt.messages[0]!.content as string, /REJECTED[\s\S]*200 notes use a key/, `${name}: the correction is sent`);
		assert.ok(corrected.chars <= SMALL, `${name}: and fits`);
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
		['repeated', [...ids.map(d), d(ids[0]!)], new RegExp(`1 descriptions repeat a symbol already described \\(first: descriptions\\[${ids.length}\\]\\)`)],
		['foreign', [...ids.map(d), d(outside)], new RegExp(`1 descriptions name an atomId that is no symbol in this chunk \\(first: descriptions\\[${ids.length}\\]\\); describe exactly: "${ids[0]}"`)],
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
	// A module has no single ref: a finding names the breached rule's id, as today.
	assert.match(judged.prompt.messages[0]!.content as string, /names in expectationRef the breached documented-rule id/);
	assert.ok(!(judged.prompt.messages[0]!.content as string).includes('expectationRef "The documented rules'), 'not forced to the module text');
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

	// With zero atoms (a diff review whose single call is over the limit): divided with no chunk, every promised
	// test judged on its full record evidence, and a symbol-coverage finding is never accepted.
	const bloated = structuredClone(TESTS_RECORD) as { body: { tasks: { files?: unknown[] }[] } };
	bloated.body.tasks[0]!.files!.push(...Array.from({ length: 60 }, (_, i) => ({ file: `src/other/__tests__/o${i}.test.ts`, titles: [{ title: `other ${i} ${'t'.repeat(150)}`, result: 'pass' }], exitCode: 0, timedOut: false })));
	const diff = subject({ testRecord: bloated as unknown as CodeReviewSubject['testRecord'] });
	const snap = codeReviewSnapshot(diff, DIVIDING, 'degraded');
	const zero = modelDimensionAdapter(coverageSpec(diff), diff, snap, SMALL) as unknown as ReviewAdapter<unknown>;
	assert.deepEqual(zero.material().atoms, [], 'zero atoms');
	let zjob = createReviewJob(zero, 'daemon', snap, SMALL);
	assert.equal(zjob.plan.single, false, 'divided');
	assert.deepEqual(zjob.plan.chunks, [], 'with no chunk');
	const judged: ReviewCall[] = [...zjob.pending];
	assert.deepEqual(judged.map(c => c.role), ['obligation', 'obligation'], 'straight to the promised tests');
	assert.ok(userOf(judged.find(c => c.carries.key === `test:${SMOKE}`)!).includes('docs/smoke.txt'));
	assert.ok(userOf(judged.find(c => c.carries.key === `test:${UNIT}`)!).includes('src/order/__tests__/order.test.ts'));
	for (const c of judged) assert.ok(!(c.prompt.messages[0]!.content as string).includes('coverageEvidence class'), 'no symbol grading in the judgement');
	const symbolFinding = { severity: 'HIGH', location: 'src/order/order.ts:1', message: 'not exercised', findingKind: 'symbol-coverage', symbolId: 'id-placeOrder' };
	const first = judged[0]!;
	zjob = applyOutput(zjob, zero, first.callId, echo(first, { findings: [symbolFinding] }));
	const again = zjob.pending.find(c => c.attempt === 2)!;
	assert.ok(again !== undefined && again.carries.key === first.carries.key, 'rejected and re-issued');
	assert.match(again.prompt.messages[0]!.content as string, /may report only findingKind "promised-test"/);
	assert.throws(() => applyOutput(zjob, zero, again.callId, echo(again, { findings: [symbolFinding] })), (e: unknown) => e instanceof ReviewCallFailedError);
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

// -- relation checks (t5) ------------------------------------------------------

const chunkAnswer = (spec: 'notes' | 'quality', call: ReviewCall): unknown => {
	// Quality's later stages (t6) are issued per chunk too: no candidates, no duplication.
	if (call.stage === 'compare') return { candidates: [] };
	if (call.stage === 'pair') return { findings: [] };
	return spec === 'quality'
		? { findings: [], descriptions: call.carries.atomIds.map(atomId => ({ atomId, description: `what ${atomId} does` })) }
		: { notes: [] };
};

test('a relation call carries both full summaries when they fit, else full against neighbour summary in each direction, and every call fits', () => {
	const s = subject();
	const snap = codeReviewSnapshot(s, DIVIDING);
	for (const spec of [qualitySpec, adherenceSpec] as const) {
		// A limit both rows fit beside the framing (adherence's lists its obligations too).
		const adapter = modelDimensionAdapter(spec(s), s, snap, 24_000) as unknown as ReviewAdapter<unknown>;
		const material = adapter.material();
		const atomOf = (id: string) => material.atoms.find(a => a.id === id)!;
		const caller = atomOf('id-placeOrder'), callee = atomOf('id-fill');
		const sig = (id: string) => JSON.stringify(DIVIDING.symbols.find(x => x.entityId === id)!.signature);
		const relationCall = adapter.gather!.relationCall!;
		// Both fit one call: one call, both full rows, the mismatch to be located in the caller's file.
		const one = relationCall([caller, callee]);
		assert.equal(one.length, 1, spec.name);
		const text = promptText(one[0]!.messages);
		assert.ok(text.includes(sig('id-placeOrder')) && text.includes(sig('id-fill')), 'both full rows');
		assert.match(one[0]!.messages[0]!.content as string, /located at the CALLER: `file:line` in its file, "src\/order\/order\.ts", with its name, "placeOrder", in the message/);
		assert.deepEqual(one[0]!.schema, spec(s).schema, "today's findings shape");
		// Within a refused size: two calls, each one full row against the other's summary line, each within the size.
		const maxChars = 12_000;
		const two = relationCall([caller, callee], maxChars);
		assert.equal(two.length, 2);
		const [fromCaller, fromCallee] = two.map(c => promptText(c.messages));
		assert.ok(fromCaller!.includes(sig('id-placeOrder')) && !fromCaller!.includes(sig('id-fill')) && fromCaller!.includes(`- ${material.atoms && (adapter.neighbourSummary!(callee, material))}`));
		assert.ok(fromCallee!.includes(sig('id-fill')) && !fromCallee!.includes(sig('id-placeOrder')) && fromCallee!.includes(`- ${adapter.neighbourSummary!(caller, material)}`));
		for (const c of two) assert.ok(promptChars(envelopeMessages('00000000-0000-0000-0000-000000000000', c.messages)) <= maxChars, 'each within the reported size, envelope included');
		// A size no row fits even against the other's summary: named as too large, never cut.
		assert.throws(() => relationCall([caller, callee], 4_000), (e: unknown) => e instanceof AtomTooLargeError && e.message.includes('src/order/order.ts#placeOrder'));
		// When both do not fit the limit, the same two calls.
		const tight = modelDimensionAdapter(spec(s), s, snap, 9_000) as unknown as ReviewAdapter<unknown>;
		assert.equal(tight.gather!.relationCall!([caller, callee]).length, 2);
		// A cut relation that is not a call (same module) is not judged.
		assert.deepEqual(relationCall([atomOf('id-price'), atomOf('id-discount')]), []);
	}
	// Only quality and adherence judge relations.
	for (const spec of [coverageSpec, conventionsSpec, functionalCoverageSpec]) {
		assert.equal((modelDimensionAdapter(spec(s) as ModelDimensionSpec<unknown>, s, snap, SMALL) as unknown as ReviewAdapter<unknown>).gather!.relationCall, undefined);
	}
	// In a divided review the cut call is judged in the gather, and every call fits the limit.
	for (const [kind, spec] of [['quality', qualitySpec], ['notes', adherenceSpec]] as const) {
		const { job, adapter } = dividedJob(spec);
		assert.ok(job.plan.crossRelations.some(r => r.kind === 'calls' && r.from === 'id-placeOrder' && r.to === 'id-fill'), 'the call is cut');
		const { calls } = drive(job, adapter, call => call.role === 'chunk' ? chunkAnswer(kind, call) : { findings: [] });
		const relations = calls.filter(c => c.role === 'relation');
		// The cut call relation and nothing else, judged in one call or, when both rows do not fit, its two halves.
		assert.ok(relations.length >= 1 && relations.length <= 2, kind);
		assert.ok(relations.every(c => c.carries.key === relations[0]!.carries.key && c.carries.atomIds.join() === 'id-placeOrder,id-fill'), `${kind}: the call relation only`);
		for (const c of calls) assert.ok(c.chars <= SMALL, `${kind}: a ${c.role} call of ${c.chars}`);
	}
});

test('a relation answer naming a counterpart or location outside its two symbols is rejected, re-issued once, then fails the review', () => {
	for (const [kind, spec] of [['quality', qualitySpec], ['notes', adherenceSpec]] as const) {
		const { job, adapter } = dividedJob(spec);
		// Run to the relation call.
		let j = job;
		let relation: ReviewCall | undefined;
		for (let guard = 0; relation === undefined; guard++) {
			assert.ok(guard < 100);
			const call = nextCalls(j, adapter)[0]!;
			if (call.role === 'relation') { relation = call; break; }
			j = applyOutput(j, adapter, call.callId, echo(call, call.role === 'chunk' ? chunkAnswer(kind, call) : { findings: [] }));
		}
		const mismatch = { severity: 'MED', location: 'src/order/order.ts:3', message: 'placeOrder ignores the error fill throws' };
		// In the caller's file but about another symbol (its message does not name the caller): rejected.
		assert.equal(adapter.gather!.validate!({ findings: [{ ...mismatch, message: 'cancelOrder is unsafe' }] }, relation).length, 1, `${kind}: not about the caller`);
		// A location outside the two symbols: re-issued once, with the reason.
		const outside = applyOutput(j, adapter, relation.callId, echo(relation, { findings: [{ ...mismatch, location: 'src/price/price.ts:1' }] }));
		const again = outside.pending.find(c => c.attempt === 2)!;
		assert.ok(again !== undefined && again.role === 'relation', `${kind}: re-issued`);
		assert.match(again.prompt.messages[0]!.content as string, /1 findings are not located at the caller \(first: findings\[0\]\); locate a mismatch at the caller: in "src\/order\/order\.ts", naming "placeOrder" in the message/);
		// A finding located at the callee, not the caller, is rejected too.
		assert.deepEqual(adapter.gather!.validate!({ findings: [{ ...mismatch, location: 'src/basket/basket.ts:2' }] }, relation).length, 1, `${kind}: not at the callee`);
		// A counterpart outside the two symbols on the re-issue: the review fails.
		assert.throws(() => applyOutput(outside, adapter, again.callId, echo(again, { findings: [{ ...mismatch, counterpartRef: 'discount' }] })),
			(e: unknown) => e instanceof ReviewCallFailedError && /invalid-answer/.test(e.message), kind);
		// The mismatch located at the caller, naming the callee, is valid and becomes the dimension's finding.
		const answer = { findings: [{ ...mismatch, counterpartRef: 'fill' }] };
		assert.deepEqual(adapter.gather!.validate!(answer, relation), [], kind);
		const part = adapter.gather!.partOf({ role: 'relation', key: relation.carries.key!, atomIds: relation.carries.atomIds, answer }) as { findings: { location: string; dimension: string }[] };
		assert.equal(part.findings[0]!.location, 'src/order/order.ts:3', `${kind}: at the caller`);
		assert.equal(part.findings[0]!.dimension, spec(subject()).dimension);
	}
});

test('a caller and callee in different chunks whose contract disagrees: the job judges their call in a relation call, and the mismatch is reported at the caller', () => {
	// fill may return undefined; placeOrder reads fill(basket).total without a check. The two are cut apart.
	const g: CodeReviewGrounding = { symbols: DIVIDING.symbols.map(x =>
		x.entityId === 'id-fill' ? { ...x, signature: `fill(basket: Basket): Basket | undefined /* undefined when the basket is empty */ ${'p'.repeat(5_400)}` }
		: x.entityId === 'id-placeOrder' ? { ...x, signature: `placeOrder(basket: Basket): Order /* reads fill(basket).total directly */ ${'p'.repeat(5_400)}` }
		: x) };
	const s = subject();
	const snap = codeReviewSnapshot(s, g);
	const adapter = modelDimensionAdapter(qualitySpec(s), s, snap, SMALL) as unknown as ReviewAdapter<unknown>;
	let job = createReviewJob(adapter, 'daemon', snap, SMALL);
	assert.ok(job.plan.crossRelations.some(r => r.kind === 'calls' && r.from === 'id-placeOrder' && r.to === 'id-fill'), 'cut apart');
	// A scripted reviewer that judges only from what a call carries: it reports the disagreement when it sees
	// the callee's undefined return and the caller's unchecked use in the same call, at the caller's file.
	const reviewer = (call: ReviewCall): unknown => {
		if (call.role === 'chunk') return chunkAnswer('quality', call);
		const text = promptText(call.messages);
		const disagree = text.includes('Basket | undefined') && text.includes('reads fill(basket).total directly');
		const caller = /located at the CALLER: `file:line` in its file, "([^"]+)", with its name, "([^"]+)"/.exec(call.messages[0]!.content as string);
		return { findings: disagree && caller !== null ? [{ severity: 'HIGH', location: `${caller[1]}:1`, message: `${caller[2]} reads .total from fill, which returns undefined for an empty basket`, counterpartRef: 'fill', confidence: 'breach' }] : [] };
	};
	const answered: { call: ReviewCall; answer: unknown }[] = [];
	try {
		for (let guard = 0; job.phase !== 'done'; guard++) {
			assert.ok(guard < 100);
			const call = nextCalls(job, adapter)[0]!;
			const answer = reviewer(call);
			answered.push({ call, answer });
			job = applyOutput(job, adapter, call.callId, echo(call, answer));
		}
	} catch (e) {
		if (!/dividing a code review is not available yet/.test(String(e))) throw e;
	}
	// No chunk could see both contracts; the relation call the job issued did, and the mismatch it reports is at the caller.
	assert.ok(answered.filter(a => a.call.stage === 'judge').every(a => (a.answer as { findings: unknown[] }).findings.length === 0));
	const relation = answered.find(a => a.call.role === 'relation')!;
	assert.deepEqual(relation.call.carries.atomIds, ['id-placeOrder', 'id-fill']);
	assert.deepEqual(adapter.gather!.validate!(relation.answer, relation.call), [], 'accepted: at the caller');
	const part = adapter.gather!.partOf({ role: 'relation', key: relation.call.carries.key!, atomIds: relation.call.carries.atomIds, answer: relation.answer }) as { findings: { location: string; message: string; counterpartRef?: string; dimension: string }[] };
	assert.equal(part.findings.length, 1);
	assert.equal(part.findings[0]!.location, 'src/order/order.ts:1');
	assert.match(part.findings[0]!.message, /^placeOrder /);
	assert.equal(part.findings[0]!.counterpartRef, 'fill');
	assert.equal(part.findings[0]!.dimension, 'quality');
});

// -- quality's cross-chunk duplicates (t6) ---------------------------------------

/** A quality reviewer for a divided job: long descriptions (so compare batches split), and `candidates` for compare. */
function qualityReviewer(candidates: (call: ReviewCall) => { a: string; b: string; why: string }[], pair: (call: ReviewCall) => unknown = () => ({ findings: [] })) {
	return (call: ReviewCall): unknown => {
		if (call.stage === 'judge' && call.role === 'chunk') return { findings: [], descriptions: call.carries.atomIds.map(atomId => ({ atomId, description: `${atomId} totals a basket ${'d'.repeat(1_800)}` })) };
		if (call.stage === 'compare') return { candidates: candidates(call) };
		if (call.stage === 'pair') return pair(call);
		return { findings: [] };
	};
}
/** The two atom-id lists a compare call carries. */
const listsOf = (call: ReviewCall): [string[], string[]] => {
	const blocks = [...userOf(call).matchAll(/```json\n([\s\S]*?)\n```/g)].map(m => (JSON.parse(m[1]!) as { atomId: string }[]).map(d => d.atomId));
	return [blocks[0] ?? [], blocks[1] ?? []];
};

test('every two symbols in different chunks are compared through their descriptions in calls within the limit, and no compare or pair call is made under the limit', () => {
	const { job, adapter } = dividedJob(qualitySpec);
	const ownerOf = new Map(job.plan.chunks.flatMap(c => c.atomIds.map(id => [id, c.id] as const)));
	const { calls } = drive(job, adapter, qualityReviewer(() => []));
	const compares = calls.filter(c => c.stage === 'compare');
	assert.ok(compares.length > job.plan.chunks.length - 1, 'batches split: more calls than chunk pairs alone would need');
	const seen: string[] = [];
	for (const c of compares) {
		assert.ok(c.chars <= SMALL, `a compare call of ${c.chars}`);
		assert.match(userOf(c), /totals a basket d{1800}/, 'it compares the descriptions the chunks wrote');
		const [first, second] = listsOf(c);
		for (const a of first) for (const b of second) seen.push([a, b].sort().join('|'));
	}
	// Exactly the pairs of symbols held in different chunks, each once.
	const ids = DIVIDING.symbols.map(x => x.entityId);
	const expected = ids.flatMap((a, i) => ids.slice(i + 1).filter(b => ownerOf.get(a) !== ownerOf.get(b)).map(b => [a, b].sort().join('|')));
	assert.deepEqual([...seen].sort(), [...expected].sort());
	assert.equal(new Set(seen).size, seen.length, 'each pair once');
	// Under the limit: today's single call, and no compare or pair call.
	const single = dividedJob(qualitySpec, subject(), 384_000);
	const { calls: one } = drive(single.job, single.adapter, () => ({ findings: [] }));
	assert.deepEqual(one.map(c => [c.role, c.stage]), [['single', 'judge']]);
});

test('a pair answer naming a counterpart outside its two symbols is rejected', () => {
	const { job, adapter } = dividedJob(qualitySpec);
	const chunkOfId = (id: string) => job.plan.chunks.find(c => c.atomIds.includes(id))!.id;
	assert.notEqual(chunkOfId('id-cancelOrder'), chunkOfId('id-discount'), 'held in different chunks');
	// compare names cancelOrder and discount as a candidate, from whichever call carries both.
	let j = job;
	let pair: ReviewCall | undefined;
	const review = qualityReviewer(c => { const [f, s] = listsOf(c); return f.includes('id-cancelOrder') && s.includes('id-discount') ? [{ a: 'id-cancelOrder', b: 'id-discount', why: 'both total a basket' }] : f.includes('id-discount') && s.includes('id-cancelOrder') ? [{ a: 'id-discount', b: 'id-cancelOrder', why: 'both total a basket' }] : []; });
	for (let guard = 0; pair === undefined; guard++) {
		assert.ok(guard < 200);
		const call = nextCalls(j, adapter)[0]!;
		if (call.stage === 'pair') { pair = call; break; }
		j = applyOutput(j, adapter, call.callId, echo(call, review(call)));
	}
	assert.match(pair.carries.key!, /^pair:id-(cancelOrder\|id-discount|discount\|id-cancelOrder)$/);
	const text = userOf(pair);
	assert.ok(text.includes(JSON.stringify(DIVIDING.symbols.find(x => x.entityId === 'id-cancelOrder')!.signature)) && text.includes(JSON.stringify(DIVIDING.symbols.find(x => x.entityId === 'id-discount')!.signature)), 'judged on both full rows');
	const dup = { severity: 'MED', location: 'src/order/cancel.ts:1', message: 'cancelOrder duplicates discount', confidence: 'breach' };
	// A counterpart outside the pair: re-issued once with the reason, then the review fails.
	const outside = applyOutput(j, adapter, pair.callId, echo(pair, { findings: [{ ...dup, counterpartRef: 'fill' }] }));
	const again = outside.pending.find(c => c.attempt === 2)!;
	assert.ok(again !== undefined && again.stage === 'pair');
	assert.match(again.prompt.messages[0]!.content as string, /1 findings do not name the other symbol of the pair as counterpartRef \(first: findings\[0\]\.counterpartRef\)/);
	assert.throws(() => applyOutput(outside, adapter, again.callId, echo(again, { findings: [{ ...dup, counterpartRef: 'price' }] })), (e: unknown) => e instanceof ReviewCallFailedError);
	// The other symbol of the pair, by name, located in one of the two files: accepted.
	const pairStage = adapter.stagesFor('daemon').find(st => st.id === 'pair')!;
	assert.deepEqual(pairStage.validate!({ findings: [{ ...dup, counterpartRef: 'discount' }] }, pair), []);
	assert.equal(pairStage.validate!({ findings: [{ ...dup, counterpartRef: 'discount', location: 'src/basket/basket.ts:1' }] }, pair).length, 1, 'not located at either symbol');
	assert.equal(pairStage.validate!({ findings: [dup] }, pair).length, 1, 'a duplication names its counterpart');
	// The duplicate, reported by pair with its counterpart, is recorded as the pair stage's answer.
	const reported = applyOutput(j, adapter, pair.callId, echo(pair, { findings: [{ ...dup, counterpartRef: 'discount' }] }));
	const recorded = [...reported.stageAnswers, ...((reported.outputs['pair'] ?? []) as { answer: unknown }[])].map(a => a.answer as { findings: { counterpartRef?: string; location: string }[] });
	assert.deepEqual(recorded.flatMap(a => a.findings).map(f => [f.location, f.counterpartRef]), [['src/order/cancel.ts:1', 'discount']]);
});

test('compare and pair calls are counted under pipelineCalls.relation, not chunk', () => {
	const { job, adapter } = dividedJob(qualitySpec);
	let rejectedOnce = false;
	const review = qualityReviewer(c => { const [f, s] = listsOf(c); return f.includes('id-cancelOrder') && s.includes('id-discount') ? [{ a: 'id-cancelOrder', b: 'id-discount', why: 'same' }] : []; });
	const { job: last, calls } = drive(job, adapter, call => {
		// One compare answer names a symbol outside its lists: rejected and re-issued, and counted again.
		if (call.stage === 'compare' && !rejectedOnce) { rejectedOnce = true; return { candidates: [{ a: 'id-nope', b: 'id-nope2', why: 'x' }] }; }
		return review(call);
	});
	const by = (stage: string) => calls.filter(c => c.stage === stage).length;
	assert.ok(by('compare') > 0 && by('pair') > 0, 'both stages made calls');
	assert.ok(calls.some(c => c.stage === 'compare' && c.attempt === 2), 'a re-issued compare call');
	assert.ok(calls.filter(c => c.stage === 'compare' || c.stage === 'pair').every(c => c.role === 'chunk'), "role 'chunk' for retry and re-division");
	const relationCalls = calls.filter(c => c.role === 'relation').length;
	assert.equal(last.counts.relation, by('compare') + by('pair') + relationCalls, 'compare and pair under relation, re-issue included');
	assert.equal(last.counts.chunk, by('judge'), 'chunk counts only the chunk reads');
});

// -- merge and finish (t7) ------------------------------------------------------

/** Drive a divided job on `path` to its result. */
function divided<O>(spec: (s: CodeReviewSubject) => ModelDimensionSpec<O>, path: 'daemon' | 'controller', answer: (call: ReviewCall) => unknown, s: CodeReviewSubject = subject(), g: CodeReviewGrounding = DIVIDING): { result: { findings: { location: string; severity: string; message: string; expectationRef?: string; dimension: string }[]; outOfScope?: { location: string }[]; lowered?: { location: string; reason: string }[]; pipelineCalls?: Record<string, number> }; calls: ReviewCall[] } {
	const snap = codeReviewSnapshot(s, g);
	const adapter = modelDimensionAdapter(spec(s), s, snap, SMALL, path) as unknown as ReviewAdapter<unknown>;
	const { job, calls } = drive(createReviewJob(adapter, path, snap, SMALL), adapter, answer);
	assert.equal(job.phase, 'done');
	return { result: result(job), calls };
}

test('out-of-set findings are dropped on the daemon path and kept in outOfScope on the controller path, as today', () => {
	// src/price is not in the Story's changed set; src/order is.
	const inSet = { severity: 'MED', location: 'src/order/order.ts:2', message: 'placeOrder risk', confidence: 'breach' };
	const outOfSet = { severity: 'MED', location: 'src/price/price.ts:2', message: 'price risk', confidence: 'breach' };
	const answer = (call: ReviewCall): unknown => call.stage === 'judge' && call.role === 'chunk'
		? { findings: call.carries.atomIds.includes('id-placeOrder') ? [inSet] : call.carries.atomIds.includes('id-price') ? [outOfSet] : [], descriptions: call.carries.atomIds.map(atomId => ({ atomId, description: atomId })) }
		: call.role === 'chunk' ? chunkAnswer('quality', call) : { findings: [] };
	const daemon = divided(qualitySpec, 'daemon', answer).result;
	assert.deepEqual(daemon.findings.map(f => f.location), ['src/order/order.ts:2']);
	assert.equal(daemon.outOfScope, undefined, 'dropped, as the daemon judge does today');
	const controller = divided(qualitySpec, 'controller', answer).result;
	assert.deepEqual(controller.findings.map(f => f.location), ['src/order/order.ts:2']);
	assert.deepEqual(controller.outOfScope?.map(f => f.location), ['src/price/price.ts:2'], 'kept in outOfScope, as the controller step does today');
});

test('a functional-coverage finding with an unknown expectationRef at a valid changed-file location is dropped by merge, as today', () => {
	const at = 'src/order/order.ts:1';
	const { result: r, calls } = divided(functionalCoverageSpec, 'daemon', call => {
		if (call.role === 'chunk') return { notes: [] };
		if (call.carries.key === 'fr:FR1') return { findings: [{ severity: 'HIGH', location: at, message: 'FR1 is not realized', expectationRef: 'FR1', confidence: 'breach' }] };
		return { findings: [{ severity: 'HIGH', location: at, message: 'an invented requirement', expectationRef: 'FR9', confidence: 'breach' }] };
	});
	assert.ok(calls.some(c => c.carries.key === 'fr:FR2'), 'FR2 was judged');
	assert.deepEqual(r.findings.map(f => f.expectationRef), ['FR1'], 'FR9 is unknown: dropped');
});

test('pipelineCalls counts chunk, obligation, relation and merge calls and is absent on a single-chunk review', () => {
	for (const [kind, spec] of [['quality', qualitySpec], ['notes', adherenceSpec]] as const) {
		const { result: r, calls } = divided(spec, 'daemon', call => call.role === 'chunk' ? chunkAnswer(kind, call) : { findings: [] });
		const relation = calls.filter(c => c.role === 'relation' || c.stage === 'compare' || c.stage === 'pair').length;
		assert.deepEqual(r.pipelineCalls, {
			chunk: calls.filter(c => c.stage === 'judge' && c.role === 'chunk').length,
			obligation: calls.filter(c => c.role === 'obligation').length,
			relation, merge: 0,
		}, kind);
		assert.ok(r.pipelineCalls!['chunk']! > 1 && r.pipelineCalls!['relation']! >= 1, `${kind}: a divided review`);
		if (kind === 'notes') assert.ok(r.pipelineCalls!['obligation']! > 1);
	}
	// One chunk: no pipelineCalls.
	const s = subject();
	const snap = codeReviewSnapshot(s, DIVIDING);
	const adapter = modelDimensionAdapter(qualitySpec(s), s, snap, 384_000) as unknown as ReviewAdapter<unknown>;
	const { job } = drive(createReviewJob(adapter, 'daemon', snap, 384_000), adapter, () => ({ findings: [] }));
	assert.equal((result(job) as { pipelineCalls?: unknown }).pipelineCalls, undefined);
});

test('merge keeps identical findings once, accepts only file:line locations (a note id is re-asked), moves out-of-set findings to outOfScope, and normalises coverage once', () => {
	// Identical findings from two obligations are kept once, in stage order after the chunk findings.
	const same = { severity: 'MED', location: 'src/order/order.ts:4', message: 'placeOrder departs from the contract', expectationRef: 'LLD contract 1: placeOrder' };
	const adherence = divided(adherenceSpec, 'controller', call => call.role === 'chunk' ? { notes: [] } : call.carries.key === 'lld:contract:1' || call.carries.key === 'plan:t1' ? { findings: [same] } : call.carries.key === 'lld:edge:1' ? { findings: [{ ...same, location: 'src/price/price.ts:1' }] } : { findings: [] }).result;
	assert.deepEqual(adherence.findings.map(f => f.location), ['src/order/order.ts:4'], 'once');
	assert.deepEqual(adherence.outOfScope?.map(f => f.location), ['src/price/price.ts:1'], 'out of set: outOfScope on the controller path');

	// A finding located at an evidence note id (with or without a line) is re-asked, then fails the review;
	// merge never rewrites a location.
	{
		const { job, adapter } = dividedJob(adherenceSpec);
		let j = job;
		let judged: ReviewCall | undefined;
		for (let guard = 0; judged === undefined; guard++) {
			assert.ok(guard < 100);
			const call = nextCalls(j, adapter)[0]!;
			if (call.role === 'obligation' && call.carries.noteIds.length > 0) { judged = call; break; }
			j = applyOutput(j, adapter, call.callId, echo(call, call.role === 'chunk' ? { notes: [{ key: 'lld:contract:1', atomIds: [call.carries.atomIds[0]!], note: 'placeOrder realises it' }] } : { findings: [] }));
		}
		const noteId = judged.carries.noteIds[0]!;
		assert.ok(userOf(judged).includes(`"noteId": "${noteId}"`), 'the call shows the note by id');
		const atNote = { ...same, location: noteId };
		const next = applyOutput(j, adapter, judged.callId, echo(judged, { findings: [atNote] }));
		const again = next.pending.find(c => c.attempt === 2)!;
		assert.ok(again !== undefined && again.carries.key === judged.carries.key, 're-asked');
		assert.match(again.prompt.messages[0]!.content as string, /1 findings are not located at `file:line` in the code \(first: findings\[0\]\.location\)/);
		assert.throws(() => applyOutput(next, adapter, again.callId, echo(again, { findings: [{ ...same, location: `${noteId}:1` }] })), (e: unknown) => e instanceof ReviewCallFailedError);
		assert.deepEqual(adapter.gather!.validate!({ findings: [same] }, judged), [], 'a file:line location is accepted');
	}

	// Coverage: normalised once over the merged result, chunk and gather findings together.
	const unreached = { severity: 'HIGH', location: 'src/order/order.ts:1', message: 'placeOrder is not exercised', findingKind: 'symbol-coverage', symbolId: 'id-placeOrder', confidence: 'breach' };
	const missing = { severity: 'HIGH', location: 'src/order/order.ts:1', message: 'the promised test is missing', findingKind: 'promised-test', expectationRef: UNIT, confidence: 'breach' };
	const coverage = divided(coverageSpec, 'daemon', call => {
		if (call.role === 'chunk') return { findings: call.carries.atomIds.includes('id-placeOrder') ? [unreached] : [], notes: [] };
		return { findings: call.carries.key === `test:${UNIT}` ? [missing] : [] };
	}).result;
	// placeOrder's evidence is no-edge-story-tests-pass (the record has passing files), so its HIGH is lowered, once;
	// the missing promised test stays HIGH.
	assert.deepEqual(coverage.findings.map(f => [f.message, f.severity]), [['placeOrder is not exercised', 'LOW'], ['the promised test is missing', 'HIGH']]);
	assert.equal(coverage.lowered?.length, 1, 'normalised once');

	// Quality: a duplicate reported by pair reaches the result with its counterpart, after the chunk findings.
	const dup = { severity: 'MED', location: 'src/order/cancel.ts:1', message: 'cancelOrder duplicates fill', counterpartRef: 'fill', confidence: 'breach' };
	const quality = divided(qualitySpec, 'daemon', qualityReviewer(c => { const [f, sec] = listsOf(c); return f.includes('id-cancelOrder') && sec.includes('id-fill') ? [{ a: 'id-cancelOrder', b: 'id-fill', why: 'same' }] : f.includes('id-fill') && sec.includes('id-cancelOrder') ? [{ a: 'id-fill', b: 'id-cancelOrder', why: 'same' }] : []; }, () => ({ findings: [dup] }))).result;
	assert.deepEqual(quality.findings.map(f => [f.location, (f as { counterpartRef?: string }).counterpartRef]), [['src/order/cancel.ts:1', 'fill']]);
});

test('a size-refused compare or pair call is re-divided by its stage within the refused size: smaller batches, or the pair\'s two halves; a refused half names its row', () => {
	const { job, adapter } = dividedJob(qualitySpec);
	const pairsOf = (calls: readonly ReviewCall[]) => calls.flatMap(c => { const [f, sec] = listsOf(c); return f.flatMap(a => sec.map(b => `${a}|${b}`)); }).sort();
	const review = qualityReviewer(c => { const [f, sec] = listsOf(c); return f.includes('id-cancelOrder') && sec.includes('id-discount') ? [{ a: 'id-cancelOrder', b: 'id-discount', why: 'same' }] : []; });
	let j = job;
	let compareDone = false;
	for (let guard = 0; guard < 300; guard++) {
		const call = nextCalls(j, adapter)[0]!;
		if (call.stage === 'compare' && !compareDone) {
			compareDone = true;
			// The call declares the symbols of both its lists.
			const [f, sec] = listsOf(call);
			assert.deepEqual([...call.carries.atomIds].sort(), [...f, ...sec].sort());
			// A provider refuses it below the configured limit: re-packed into smaller batches, each within the refused size.
			const maxChars = Math.floor(call.chars * 0.6);
			const next = applyFailure(j, adapter, call.callId, 'size-refusal', maxChars);
			const replacements = next.pending.filter(c => c.stage === 'compare' && !j.pending.some(p => p.callId === c.callId));
			assert.ok(replacements.length >= 2, 'smaller batches');
			for (const r of replacements) {
				assert.ok(r.chars <= maxChars, `a replacement of ${r.chars} within ${maxChars}`);
				assert.notEqual(promptText(r.messages), promptText(call.messages), 'never resent');
			}
			assert.deepEqual(pairsOf(replacements), pairsOf([call]), 'the same pairs of symbols, still each compared once');
			j = next;
			continue;
		}
		if (call.stage === 'pair') {
			assert.deepEqual([...call.carries.atomIds].sort(), ['id-cancelOrder', 'id-discount'], 'the pair call declares its two symbols');
			assert.ok(!call.carries.key!.includes('|half:'), 'both rows fit the configured limit');
			// Refused below that: its two halves, each within the refused size.
			// Between a half (one row and a description line) and the call with both rows.
			const maxChars = call.chars - 400;
			const next = applyFailure(j, adapter, call.callId, 'size-refusal', maxChars);
			const halves = next.pending.filter(c => c.stage === 'pair');
			assert.equal(halves.length, 2);
			assert.deepEqual(halves.map(h => /\|half:(.+)$/.exec(h.carries.key!)![1]).sort(), ['id-cancelOrder', 'id-discount']);
			for (const h of halves) {
				assert.ok(h.chars <= maxChars, `a half of ${h.chars} within ${maxChars}`);
				assert.deepEqual([...h.carries.atomIds].sort(), ['id-cancelOrder', 'id-discount']);
			}
			// A half refused again has no smaller form: its own full row is named as too large, never cut or
			// resent, even when the other half would not fit the refused size either.
			const smallest = Math.min(...halves.map(h => h.chars)) - 10;
			for (const half of halves) {
				const full = /\|half:(.+)$/.exec(half.carries.key!)![1]!;
				const label = full === 'id-cancelOrder' ? 'src/order/cancel.ts#cancelOrder' : 'src/price/discount.ts#discount';
				const other = full === 'id-cancelOrder' ? 'src/price/discount.ts#discount (in' : 'src/order/cancel.ts#cancelOrder (in';
				assert.throws(() => applyFailure(next, adapter, half.callId, 'size-refusal', smallest),
					(e: unknown) => e instanceof AtomTooLargeError && e.message.includes(`${label} (in the duplicate check`) && !e.message.startsWith(`review: ${other}`), label);
			}
			// Refused below even a half's size: the row that cannot fit is named by the stage, not the call.
			assert.throws(() => applyFailure(j, adapter, call.callId, 'size-refusal', smallest),
				(e: unknown) => e instanceof AtomTooLargeError && /#(cancelOrder|discount) \(in the duplicate check/.test(e.message));
			return;
		}
		j = applyOutput(j, adapter, call.callId, echo(call, review(call)));
	}
	assert.fail('no pair call was reached');
});
