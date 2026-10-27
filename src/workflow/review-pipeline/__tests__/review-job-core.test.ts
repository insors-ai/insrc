/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivered ISSUE-aef82b03 review-job tests, moved under the review
 * pipeline and rewritten to its API (Epic 8315a11f s1/t7): one call with
 * today's prompt when it fits; otherwise every call within the limit and every
 * atom read whole; a refused call re-planned, never resent, and one that cannot
 * fit named. A toy adapter and a model that answers from what each prompt holds.
 *
 * Not carried over: the cross product of context atoms with symbols (context is
 * judged as obligations in gather, Story s3) and the merge of identical findings
 * (a divided code review's gather, Story s3).
 *
 * Run: npx tsx --test src/workflow/review-pipeline/__tests__/review-job-core.test.ts
 */

import { createTestReviewJob as createReviewJob } from './test-budget.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { promptChars } from '../envelope.js';
import { nextCalls, result } from '../job.js';
import { atom, drive, seeingModel, todayMessages, toyAdapter, toySnapshot, type ToyResult } from './toy-adapter.js';

test("a fitting review is one call with today's prompt and schema", async () => {
	const atoms = [atom(1), atom(2)];
	const snap = toySnapshot(atoms);
	const adapter = toyAdapter(snap);
	const job = createReviewJob(adapter, 'daemon', snap, 384_000);
	const calls = nextCalls(job, adapter);
	assert.equal(calls.length, 1);
	assert.equal(calls[0]!.role, 'single');
	assert.deepEqual(calls[0]!.prompt.messages, todayMessages(atoms), "today's prompt, byte for byte");
	const model = seeingModel();
	const run = await drive(job, s => toyAdapter(s), model.answer);
	assert.equal(model.prompts.length, 1);
	assert.deepEqual(result<ToyResult>(run.job).seen, ['a1', 'a2']);

	// A prompt exactly at the limit is still today's one call.
	const near = toySnapshot(Array.from({ length: 20 }, (_, i) => atom(i)));
	const nearAdapter = toyAdapter(near);
	const probe = createReviewJob(nearAdapter, 'daemon', near, 1_000_000);
	const exact = probe.pending[0]!.chars;
	assert.equal(createReviewJob(nearAdapter, 'daemon', near, exact).plan.single, true);
	assert.equal(createReviewJob(nearAdapter, 'daemon', near, exact - 1).plan.single, false);
});

test('every call the job issues fits the limit, for material many times the limit, and every atom is read whole', async () => {
	const atoms = Array.from({ length: 300 }, (_, i) => atom(i, 300 + (i * 53) % 900));
	const snap = toySnapshot(atoms);
	const limit = 20_000;
	assert.ok(promptChars(todayMessages(atoms)) > 4 * limit, 'the whole prompt is several times the limit');
	const model = seeingModel();
	const run = await drive(createReviewJob(toyAdapter(snap), 'daemon', snap, limit), s => toyAdapter(s), model.answer);
	assert.ok(model.prompts.length > 4);
	for (const p of model.prompts) assert.ok(p.length <= limit, `a ${p.length}-character prompt`);
	for (const a of atoms) assert.ok(model.prompts.some(p => p.includes(JSON.stringify({ id: a.id, text: a.text }))), `${a.label} is read whole by some call`);
	const r = result<ToyResult>(run.job);
	assert.equal(r.seen.length, atoms.length, 'each atom judged once');
	assert.equal((r.pipelineCalls as { chunk: number }).chunk, model.prompts.length);

	// An atom larger than the packing budget but within the limit is read in its own call, never dropped.
	const big = atom(900, 18_500);
	const withBig = toySnapshot([...Array.from({ length: 40 }, (_, i) => atom(i)), big]);
	const solo = seeingModel();
	const judged = await drive(createReviewJob(toyAdapter(withBig), 'daemon', withBig, limit), s => toyAdapter(s), solo.answer);
	assert.ok(result<ToyResult>(judged.job).seen.includes('a900'));
	assert.ok(solo.prompts.every(p => p.length <= limit));
	// One larger than the whole limit is named, not dropped.
	const tooBig = toySnapshot([...Array.from({ length: 40 }, (_, i) => atom(i)), atom(901, 25_000)]);
	assert.throws(() => createReviewJob(toyAdapter(tooBig), 'daemon', tooBig, limit), (e: unknown) => e instanceof Error && e.name === 'AtomTooLargeError' && e.message.includes('src/f901.ts#fn901'));
});

test('a refused call is re-planned and the job completes, sending no prompt twice', async () => {
	const atoms = Array.from({ length: 200 }, (_, i) => atom(i));
	const snap = toySnapshot(atoms);
	// The limit is generous; the model refuses any prompt over 20,000 characters and says so.
	const model = seeingModel(20_000);
	const run = await drive(createReviewJob(toyAdapter(snap), 'daemon', snap, 384_000), s => toyAdapter(s), model.answer);
	assert.equal(new Set(model.prompts).size, model.prompts.length, 'no prompt was sent twice');
	assert.ok(model.prompts.length > 2);
	assert.deepEqual([...result<ToyResult>(run.job).seen].sort(), atoms.map(a => a.id).sort(), 'every atom judged');

	// A refusal that reports no size halves.
	const silent = seeingModel(15_000, true);
	const halved = await drive(createReviewJob(toyAdapter(snap), 'daemon', snap, 384_000), s => toyAdapter(s), silent.answer);
	assert.equal(new Set(silent.prompts).size, silent.prompts.length, 'no prompt sent twice');
	assert.equal(result<ToyResult>(halved.job).seen.length, atoms.length);

	// An indivisible atom within the reported size but over it less the reserve: judged, not refused.
	const large = toySnapshot([...Array.from({ length: 40 }, (_, i) => atom(i)), atom(500, 19_000)]);
	const limited = seeingModel(20_000);
	const judged = await drive(createReviewJob(toyAdapter(large), 'daemon', large, 384_000), s => toyAdapter(s), limited.answer);
	assert.equal(new Set(limited.prompts).size, limited.prompts.length);
	assert.ok(result<ToyResult>(judged.job).seen.includes('a500'));
	// One over the reported size is named, not resent.
	const over = toySnapshot([...Array.from({ length: 40 }, (_, i) => atom(i)), atom(501, 25_000)]);
	const refusing = seeingModel(20_000);
	await assert.rejects(drive(createReviewJob(toyAdapter(over), 'daemon', over, 384_000), s => toyAdapter(s), refusing.answer),
		(e: unknown) => e instanceof Error && e.name === 'AtomTooLargeError' && e.message.includes('src/f501.ts#fn501'));
	assert.equal(new Set(refusing.prompts).size, refusing.prompts.length, 'no prompt sent twice');
});
