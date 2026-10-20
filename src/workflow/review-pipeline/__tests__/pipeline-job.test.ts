/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The review pipeline's job (Epic 8315a11f, Story s1): the chunk limit, prepare,
 * the envelope, the pipeline's own retries, refusal re-division, the snapshot,
 * deterministic stages and the deadline. A toy adapter and a scripted model.
 *
 * Run: npx tsx --test src/workflow/review-pipeline/__tests__/pipeline-job.test.ts
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CONFIG_CATALOG } from '../../../config/config-catalog.js';
import { CliStallError, ReviewSessionTimeoutError } from '../../../agent/providers/cli-provider.js';
import type { LLMMessage, LLMProvider, ReviewSessionOpts, StructuredCompletionOpts, StructuredSchema } from '../../../shared/types.js';
import { runReviewJob } from '../driver.js';
import { applyFailure, applyOutput, createReviewJob, MaterialChangedError, nextCalls, relationJudged, requestNoteCall, result, ReviewCallFailedError, runStage } from '../job.js';
import { DEFAULT_REVIEW_CHUNK_TOKENS, REVIEW_CHARS_PER_TOKEN, reviewLimitChars } from '../limit.js';
import { AtomTooLargeError } from '../pack-into-batches.js';
import type { AdapterStage, EvidenceNote, FailurePolicy, ReviewAdapter, ReviewCall, ReviewMaterialSnapshot, ReviewPipelineJob, ReviewRelation, StageAnswer } from '../types.js';
import { asSent, atom, atomIdsIn, callIdIn, drive, NOTE_SCHEMA, RELATION_SCHEMA, seeingModel, todayMessages, TOY_SCHEMA, toyAdapter, toySnapshot, VERDICT_SCHEMA, type ToyOpts, type ToyResult } from './toy-adapter.js';

test('the default chunk limit is 384,000 characters for every provider and follows review.chunkTokens', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-review-limit-'));
	try {
		const configPath = join(dir, 'config.json');
		// No config file: the default.
		assert.equal(reviewLimitChars(configPath), 384_000);
		assert.equal(REVIEW_CHARS_PER_TOKEN, 3);
		// The catalog declares the setting with the same default, so config reconcile fills old files with it.
		const row = CONFIG_CATALOG.find(r => r.path === 'review.chunkTokens');
		assert.ok(row !== undefined, 'review.chunkTokens is in the config catalog');
		assert.equal(row.type, 'number');
		assert.equal(row.default, DEFAULT_REVIEW_CHUNK_TOKENS);
		assert.equal(DEFAULT_REVIEW_CHUNK_TOKENS, 128_000);
		// A configured value v gives v x 3, whatever provider is configured.
		for (const provider of ['claude', 'codex', 'ollama']) {
			writeFileSync(configPath, JSON.stringify({ review: { chunkTokens: 200_000 }, models: { review: { runner: provider } } }));
			assert.equal(reviewLimitChars(configPath), 600_000, provider);
		}
		// A value that is not a positive whole number falls back to the default.
		for (const bad of [0, -5, 1.5, '1000', null]) {
			writeFileSync(configPath, JSON.stringify({ review: { chunkTokens: bad } }));
			assert.equal(reviewLimitChars(configPath), 384_000, `chunkTokens=${JSON.stringify(bad)}`);
		}
		writeFileSync(configPath, '{ not json');
		assert.equal(reviewLimitChars(configPath), 384_000, 'an unparseable file');
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

// -- the job core (plan task t7) ---------------------------------------------

const LIMIT = 6_000;

/** The adapter's content of a sent call: its messages without the envelope instruction. */
const content = (call: ReviewCall): string => asSent(call.messages.slice(0, -1));

test("a review under the limit is one chunk whose calls carry today's messages and schema inside the envelope", async () => {
	const atoms = [atom(1), atom(2)];
	const snap = toySnapshot(atoms);
	const adapter = toyAdapter(snap);
	const job = createReviewJob(adapter, 'daemon', snap, 384_000);
	assert.equal(job.plan.single, true);
	const calls = nextCalls(job, adapter);
	assert.equal(calls.length, 1);
	const call = calls[0]!;
	assert.equal(call.role, 'single');
	// Today's messages, byte for byte, then the envelope instruction naming the call's id.
	assert.deepEqual(call.messages.slice(0, -1), todayMessages(atoms));
	assert.ok((call.messages.at(-1)!.content as string).includes(`"${call.callId}"`));
	// Today's schema, as the envelope's answer, beside the call's id as a constant.
	const schema = call.schema as unknown as { required: string[]; properties: { callId: { const: string }; answer: unknown } };
	assert.deepEqual(schema.required, ['callId', 'answer']);
	assert.equal(schema.properties.callId.const, call.callId);
	assert.equal(schema.properties.answer, TOY_SCHEMA);
	assert.deepEqual(call.execution, { mode: 'structured', cwd: '/repo' });
	assert.equal(call.chars, asSent(call.messages).length, 'chars measures the prompt as sent');

	// Driven to the end: today's one call, today's result, and no pipelineCalls on a single review.
	const model = seeingModel();
	const { job: done, sent } = await drive(job, s => toyAdapter(s), model.answer);
	assert.equal(sent.length, 1);
	const r = result<ToyResult>(done);
	assert.deepEqual(r.seen, ['a1', 'a2']);
	assert.equal(r.divided, false);
	assert.equal(r.pipelineCalls, undefined);

	// Over the limit: coherent chunks, each within it, every atom in exactly one, related atoms together.
	// One module, far over the limit: the group must be split, and calls are the last bond broken.
	const many = Array.from({ length: 30 }, (_, i) => atom(i, 400, `src/file${Math.floor(i / 3)}.ts`, 'mod'));
	// a0 calls a20 (different files): calls outrank file and module. a4 references a28: a cut relation.
	const rel: ReviewRelation[] = [{ from: 'a0', to: 'a20', kind: 'calls' }, { from: 'a4', to: 'a28', kind: 'references' }];
	for (let i = 0; i < 30; i++) for (let j = i + 1; j < 30; j++) {
		rel.push({ from: many[i]!.id, to: many[j]!.id, kind: many[i]!.file === many[j]!.file ? 'same-file' : 'same-module' });
	}
	const bigSnap = toySnapshot(many, rel);
	const big = createReviewJob(toyAdapter(bigSnap), 'daemon', bigSnap, LIMIT);
	assert.equal(big.plan.single, false);
	const chunks = big.plan.chunks;
	assert.ok(chunks.length > 1);
	const held = chunks.flatMap(c => c.atomIds);
	assert.deepEqual([...held].sort(), many.map(a => a.id).sort(), 'every atom in exactly one chunk');
	for (const c of big.pending) assert.ok(c.chars <= LIMIT, `a ${c.chars}-character call`);
	const chunkOf = (id: string): string => chunks.find(c => c.atomIds.includes(id))!.id;
	assert.equal(chunkOf('a0'), chunkOf('a20'), 'atoms joined by a call stay together');
	for (let f = 0; f < 10; f++) {
		const ids = many.filter(a => a.file === `src/file${f}.ts` && a.id !== 'a20' && a.id !== 'a0').map(a => a.id);
		assert.equal(new Set(ids.map(chunkOf)).size, 1, `src/file${f}.ts stays in one chunk`);
	}
	// A usage relation the plan cuts (calls, references): each side's chunk names the other side's
	// atom, once, with its summary and holder. A proximity relation (same file or directory) adds a
	// summary only while it fits, and any it adds names the right holder, once.
	assert.ok(big.plan.crossRelations.some(r => r.from === 'a4' && r.to === 'a28'), 'the far reference is cut');
	for (const r of big.plan.crossRelations) {
		const from = chunks.find(c => c.id === chunkOf(r.from))!;
		const to = chunks.find(c => c.id === chunkOf(r.to))!;
		const fromSide = from.neighbours.filter(n => n.atomId === r.to).map(n => n.heldInChunk);
		const toSide = to.neighbours.filter(n => n.atomId === r.from).map(n => n.heldInChunk);
		if (r.kind === 'calls' || r.kind === 'references') {
			assert.deepEqual(fromSide, [to.id]);
			assert.deepEqual(toSide, [from.id]);
			assert.ok(from.neighbours.find(n => n.atomId === r.to)!.summary.startsWith('summary of '));
		} else {
			assert.ok(fromSide.length <= 1 && fromSide.every(h => h === to.id));
			assert.ok(toSide.length <= 1 && toSide.every(h => h === from.id));
		}
	}
	const run = await drive(big, s => toyAdapter(s), seeingModel().answer);
	const out = result<ToyResult>(run.job);
	assert.deepEqual([...out.seen].sort(), many.map(a => a.id).sort(), 'every atom judged once');
	assert.deepEqual(out.pipelineCalls, { chunk: chunks.length, obligation: 0, relation: 0, merge: 0 });

	// "Too large" is judged on the atom alone, without neighbour lines: an atom that fits alone but
	// not beside its neighbours' summaries is planned (keeping the summaries that fit), never named.
	const nearFull = atom(50, LIMIT - 700);
	const crowd = Array.from({ length: 8 }, (_, i) => atom(60 + i));
	const crowdSnap = toySnapshot([nearFull, ...crowd], crowd.map(c => ({ from: 'a50', to: c.id, kind: 'references' as const })));
	const crowded = createReviewJob(toyAdapter(crowdSnap), 'daemon', crowdSnap, LIMIT);
	const holder = crowded.plan.chunks.find(c => c.atomIds.includes('a50'))!;
	assert.deepEqual(holder.atomIds, ['a50']);
	assert.ok(holder.chars <= LIMIT);
	assert.ok(holder.neighbours.length < crowd.length, 'only the summaries that fit');

	// Divided with no atoms: the single call is over the limit with nothing to chunk; no chunk call is made.
	const empty = toySnapshot([]);
	const bloated: ReviewAdapter<ToyResult> = {
		...toyAdapter(empty),
		stagesFor: () => [{ ...toyAdapter(empty).stagesFor('daemon')[0]!, singleCalls: () => [{ messages: [{ role: 'user', content: 'x'.repeat(LIMIT) }], schema: TOY_SCHEMA, execution: { mode: 'structured' } }] }],
	};
	const none = createReviewJob(bloated, 'daemon', empty, LIMIT);
	assert.equal(none.plan.single, false);
	assert.equal(none.phase, 'done');
	assert.equal(none.issuedHashes.length, 0, 'no call was made');
});

test('a missing or wrong callId is rejected and the call re-issued once under a new callId; no prompt hash repeats', () => {
	const snap = toySnapshot([atom(1)]);
	for (const bad of [
		(call: ReviewCall) => ({ callId: '00000000-0000-0000-0000-000000000000', answer: { seen: ['a1'] } }),
		(_: ReviewCall) => ({ answer: { seen: ['a1'] } }),
		(_: ReviewCall) => ({ seen: ['a1'] }),
	]) {
		// fail-review: a second mismatch fails the review.
		const adapter = toyAdapter(snap);
		let job = createReviewJob(adapter, 'daemon', snap, 384_000);
		const first = nextCalls(job, adapter)[0]!;
		job = applyOutput(job, adapter, first.callId, bad(first));
		const second = nextCalls(job, adapter);
		assert.equal(second.length, 1);
		assert.notEqual(second[0]!.callId, first.callId, 'a new callId');
		assert.equal(second[0]!.attempt, 2);
		assert.equal(content(second[0]!), content(first), 'the same request');
		assert.notEqual(asSent(second[0]!.messages), asSent(first.messages), 'but not the same prompt');
		assert.equal(new Set(job.issuedHashes).size, job.issuedHashes.length);
		assert.equal(job.issuedHashes.length, 2);
		assert.throws(() => applyOutput(job, adapter, second[0]!.callId, bad(second[0]!)), (e: unknown) => e instanceof ReviewCallFailedError && /identifier-mismatch/.test(e.message));
		// An answer for a call the job never made is refused outright.
		assert.throws(() => applyOutput(job, adapter, 'not-a-call', {}), /no pending call/);
	}
	// A correct echo on the re-issue is accepted.
	const adapter = toyAdapter(snap);
	let job = createReviewJob(adapter, 'daemon', snap, 384_000);
	const first = nextCalls(job, adapter)[0]!;
	job = applyOutput(job, adapter, first.callId, { callId: 'wrong', answer: { seen: ['a1'] } });
	const again = nextCalls(job, adapter)[0]!;
	job = applyOutput(job, adapter, again.callId, { callId: again.callId, answer: { seen: ['a1'] } });
	assert.deepEqual(result<ToyResult>(job).seen, ['a1']);
});

test('a transient error, a stall or an invalid answer is re-issued once under a new callId, then the stage failure policy applies', () => {
	const snap = toySnapshot([atom(1), atom(2)]);
	for (const cause of ['transient', 'stall'] as const) {
		for (const policy of ['fail-review', 'record-not-judged', 'record-observation'] as const) {
			const adapter = toyAdapter(snap, { onCallFailure: policy });
			let job = createReviewJob(adapter, 'daemon', snap, 384_000);
			const first = nextCalls(job, adapter)[0]!;
			job = applyFailure(job, adapter, first.callId, cause);
			const second = nextCalls(job, adapter)[0]!;
			assert.notEqual(second.callId, first.callId);
			assert.equal(second.attempt, 2);
			assert.equal(content(second), content(first), `${cause}: re-issued as planned`);
			if (policy === 'fail-review') {
				assert.throws(() => applyFailure(job, adapter, second.callId, cause, undefined, { detail: 'boom' }), (e: unknown) => e instanceof ReviewCallFailedError && e.message.includes(cause) && e.message.includes('boom'));
				continue;
			}
			job = applyFailure(job, adapter, second.callId, cause);
			assert.equal(job.phase, 'done', `${policy}: the review goes on`);
			assert.equal(job.notJudged.length, 1);
			assert.equal(job.notJudged[0]!.policy, policy);
			assert.equal(job.notJudged[0]!.stage, 'judge');
			assert.equal(job.issuedHashes.length, 2, 'two attempts in all');
		}
	}
	// An answer that breaks the schema: re-issued with the errors as the correction, then the policy.
	{
		const adapter = toyAdapter(snap);
		let job = createReviewJob(adapter, 'daemon', snap, 384_000);
		const first = nextCalls(job, adapter)[0]!;
		job = applyOutput(job, adapter, first.callId, { callId: first.callId, answer: { seen: 'not an array' } });
		const second = nextCalls(job, adapter)[0]!;
		assert.equal(second.attempt, 2);
		assert.ok(content(second).includes('REJECTED') && content(second).includes('/seen'), 'the correction names the problem');
		assert.throws(() => applyOutput(job, adapter, second.callId, { callId: second.callId, answer: {} }), (e: unknown) => e instanceof ReviewCallFailedError && /invalid-answer/.test(e.message));
	}
	// A stage's validate: given the answer and the call it came back for; its reasons are the correction.
	{
		const seenCalls: ReviewCall[] = [];
		const validate = (answer: unknown, call: ReviewCall): readonly string[] => {
			seenCalls.push(call);
			return (answer as { seen: string[] }).seen.length === 2 ? [] : ['report every atom you were given'];
		};
		const adapter = toyAdapter(snap, { validate });
		let job = createReviewJob(adapter, 'daemon', snap, 384_000);
		const first = nextCalls(job, adapter)[0]!;
		job = applyOutput(job, adapter, first.callId, { callId: first.callId, answer: { seen: ['a1'] } });
		assert.equal(seenCalls[0]!.callId, first.callId, 'validate gets the call');
		const second = nextCalls(job, adapter)[0]!;
		assert.ok(content(second).includes('report every atom you were given'));
		job = applyOutput(job, adapter, second.callId, { callId: second.callId, answer: { seen: ['a1', 'a2'] } });
		assert.deepEqual(result<ToyResult>(job).seen, ['a1', 'a2']);
	}
});

test('a size refusal re-divides exactly the atoms and notes the call carried and never resends the prompt', async () => {
	const many = Array.from({ length: 24 }, (_, i) => atom(i));
	const snap = toySnapshot(many, [{ from: 'a3', to: 'a4', kind: 'calls' }]);
	const adapter = toyAdapter(snap);
	let job = createReviewJob(adapter, 'daemon', snap, LIMIT);
	const refused = nextCalls(job, adapter)[0]!;
	const before = new Set(job.pending.map(c => c.callId));
	job = applyFailure(job, adapter, refused.callId, 'size-refusal', 2_500);
	const fresh = job.pending.filter(c => !before.has(c.callId));
	assert.ok(fresh.length >= 2, 'divided');
	// Exactly what the refused call carried, no more and no less, and no notes invented.
	assert.deepEqual(fresh.flatMap(c => c.carries.atomIds).sort(), [...refused.carries.atomIds].sort());
	assert.deepEqual(fresh.flatMap(c => c.carries.noteIds), refused.carries.noteIds);
	for (const c of fresh) assert.ok(c.chars <= 2_500, `a ${c.chars}-character call within the reported size`);
	assert.ok(!job.pending.some(c => c.callId === refused.callId));
	assert.ok(!job.pending.some(c => content(c) === content(refused)), 'the refused prompt is never sent again');
	// The plan reflects it: the refused chunk is replaced by its parts, every atom still held once.
	assert.deepEqual(job.plan.chunks.flatMap(c => c.atomIds).sort(), many.map(a => a.id).sort());

	// A refusal that reports no size halves; driven to the end, no prompt is ever sent twice.
	const model = seeingModel(3_000, true);
	const run = await drive(createReviewJob(adapter, 'daemon', snap, LIMIT), s => toyAdapter(s), model.answer);
	assert.equal(new Set(model.prompts).size, model.prompts.length);
	assert.deepEqual([...result<ToyResult>(run.job).seen].sort(), many.map(a => a.id).sort(), 'every atom judged');
	const contents = run.sent.map(content);
	const refusedContents = run.sent.filter(c => asSent(c.messages).length > 3_000).map(content);
	for (const r of refusedContents) assert.equal(contents.filter(c => c === r).length, 1, 'a refused request is never re-sent, even under a new id');

	// A call carrying evidence notes: re-divided into reductions over exactly the notes it carried.
	{
		const gs = toySnapshot([atom(1)]);
		const ga = toyAdapter(gs, { gatherLimit: LIMIT });
		const base = createReviewJob(ga, 'daemon', gs, LIMIT);
		const notes: EvidenceNote[] = Array.from({ length: 12 }, (_, i) => ({ noteId: `e${i}`, key: 'k1', text: `evidence-${i}-${'z'.repeat(560)}`, atomIds: [`a${i}`] }));
		const withNotes: ReviewPipelineJob = { ...base, notes };
		const carried = notes.slice(0, 6).map(n => n.noteId);
		let gj = requestNoteCall(withNotes, ga, 'obligation', 'k1', carried);
		const obligation = gj.pending.find(c => c.role === 'obligation')!;
		assert.deepEqual(obligation.carries.noteIds, carried);
		assert.deepEqual(obligation.carries.atomIds, ['a0', 'a1', 'a2', 'a3', 'a4', 'a5']);
		const beforeIds = new Set(gj.pending.map(c => c.callId));
		gj = applyFailure(gj, ga, obligation.callId, 'size-refusal', 2_000);
		const reductions = gj.pending.filter(c => !beforeIds.has(c.callId));
		assert.ok(reductions.length >= 2 && reductions.every(c => c.role === 'reduce'));
		assert.deepEqual(reductions.flatMap(c => c.carries.noteIds).sort(), [...carried].sort(), 'exactly the notes it carried');
		for (const c of reductions) assert.ok(c.chars <= 2_000, `a ${c.chars}-character reduction`);
		assert.ok(!gj.pending.some(c => c.callId === obligation.callId || content(c) === content(obligation)), 'never resent');
		// Each reduction's answer is one note under the key, standing for the notes it read.
		for (const c of reductions) gj = applyOutput(gj, ga, c.callId, { callId: c.callId, answer: { text: `reduced ${c.carries.noteIds.join(',')}` } });
		const reduced = gj.notes.filter(n => !carried.includes(n.noteId) && !n.noteId.startsWith('e'));
		assert.equal(reduced.length, reductions.length);
		assert.deepEqual(reduced.flatMap(n => gj.noteProvenance[n.noteId] ?? []).sort(), [...carried].sort(), 'provenance kept');
		assert.ok(reduced.every(n => n.key === 'k1'));
		// A refused reduction re-divides in turn; one note that cannot fit is named, not resent.
		const tooLong: EvidenceNote = { noteId: 'big', key: 'k2', text: 'q'.repeat(2_500), atomIds: [] };
		let lj = requestNoteCall({ ...base, notes: [tooLong] }, ga, 'reduce', 'k2', ['big']);
		const lone = lj.pending.find(c => c.role === 'reduce')!;
		assert.throws(() => applyFailure(lj, ga, lone.callId, 'size-refusal', 2_000), (e: unknown) => e instanceof AtomTooLargeError && e.message.includes('evidence note big'));
		// Among others, a note larger than the reported size is named too.
		const mixedNotes = [...notes.slice(0, 3), tooLong];
		const mj2 = requestNoteCall({ ...base, notes: mixedNotes }, ga, 'obligation', 'k1', mixedNotes.map(x => x.noteId));
		const mo = mj2.pending.find(c => c.role === 'obligation')!;
		assert.throws(() => applyFailure(mj2, ga, mo.callId, 'size-refusal', 2_000), (e: unknown) => e instanceof AtomTooLargeError && e.message.includes('evidence note big'));
		// A note over the cap is an invalid answer: re-issued once with the reason.
		lj = applyOutput(lj, ga, lone.callId, { callId: lone.callId, answer: { text: 'w'.repeat(LIMIT) } });
		const again = lj.pending.find(c => c.role === 'reduce')!;
		assert.equal(again.attempt, 2);
		assert.ok(content(again).includes(`at most ${LIMIT / 4}`));
		// Evidence over the limit is never planned as one call: it is reduced in batches that fit.
		const all = requestNoteCall(withNotes, ga, 'obligation', 'k1', notes.map(n => n.noteId));
		const planned = all.pending.filter(c => c.role !== 'single');
		assert.ok(planned.length >= 2 && planned.every(c => c.role === 'reduce' && c.chars <= LIMIT));
		assert.deepEqual(planned.flatMap(c => c.carries.noteIds).sort(), notes.map(n => n.noteId).sort());
	}

	// A refused chunk holding one atom is re-planned neighbour-free: it keeps only the summaries
	// that fit the reported size, and is named only when the atom alone does not fit it.
	{
		const one = atom(50, LIMIT - 1_200);
		const crowd = Array.from({ length: 8 }, (_, i) => atom(60 + i));
		const cs = toySnapshot([one, ...crowd], crowd.map(c => ({ from: 'a50', to: c.id, kind: 'references' as const })));
		const ca = toyAdapter(cs);
		const cj = createReviewJob(ca, 'daemon', cs, LIMIT);
		const holding = cj.pending.find(c => c.carries.atomIds.includes('a50'))!;
		assert.deepEqual(holding.carries.atomIds, ['a50']);
		const fullNeighbours = cj.plan.chunks.find(c => c.id === holding.carries.chunkId)!.neighbours.length;
		assert.equal(fullNeighbours, crowd.length);
		const aloneChars = holding.chars - JSON.stringify(cj.plan.chunks.find(c => c.id === holding.carries.chunkId)!.neighbours.map(nb => ({ nid: nb.atomId, summary: nb.summary, heldIn: nb.heldInChunk }))).length + 2;
		const reported = holding.chars - 300;
		assert.ok(aloneChars < reported, 'the atom alone fits the reported size');
		const re = applyFailure(cj, ca, holding.callId, 'size-refusal', reported);
		const again = re.pending.find(c => c.carries.atomIds.includes('a50'))!;
		assert.deepEqual(again.carries.atomIds, ['a50']);
		assert.ok(again.chars <= reported, `${again.chars} within ${reported}`);
		const kept = re.plan.chunks.find(c => c.id === again.carries.chunkId)!.neighbours.length;
		assert.ok(kept > 0 && kept < fullNeighbours, `${kept} of ${fullNeighbours} summaries kept`);
		assert.notEqual(content(again), content(holding), 'not resent');
		assert.throws(() => applyFailure(cj, ca, holding.callId, 'size-refusal', aloneChars - 50), (e: unknown) => e instanceof AtomTooLargeError && e.message.includes('src/f50.ts#fn50'));
	}

	// The reported size bounds even a unit that cannot be split: an atom larger than it is named.
	const mixed = toySnapshot([...Array.from({ length: 6 }, (_, i) => atom(i)), atom(40, 2_300), ...Array.from({ length: 6 }, (_, i) => atom(i + 10))]);
	const ma = toyAdapter(mixed);
	const mj = createReviewJob(ma, 'daemon', mixed, LIMIT);
	const holding = mj.pending.find(c => c.carries.atomIds.includes('a40'))!;
	assert.ok(holding.carries.atomIds.length > 1);
	assert.throws(() => applyFailure(mj, ma, holding.callId, 'size-refusal', 2_000), (e: unknown) => e instanceof AtomTooLargeError && e.message.includes('src/f40.ts#fn40'));
	// Within the reported size it is read in a call of its own, over the packing budget but within the size.
	const within = applyFailure(mj, ma, holding.callId, 'size-refusal', 2_900);
	const alone = within.pending.find(c => c.carries.atomIds.includes('a40'))!;
	assert.deepEqual(alone.carries.atomIds, ['a40']);
	assert.ok(alone.chars <= 2_900 && alone.chars > 2_900 - 362, 'over the packing budget, within the reported size');

	// Today's single call refused: the whole material is divided.
	const small = toySnapshot([atom(1), atom(2), atom(3)]);
	const sa = toyAdapter(small);
	let single = createReviewJob(sa, 'daemon', small, 384_000);
	const one = nextCalls(single, sa)[0]!;
	single = applyFailure(single, sa, one.callId, 'size-refusal', one.chars - 1);
	assert.equal(single.plan.single, false);
	assert.deepEqual(single.pending.flatMap(c => c.carries.atomIds).sort(), ['a1', 'a2', 'a3']);
	// One atom that does not fit the reported size is named, not resent.
	const lone = toySnapshot([atom(7, 3_000)]);
	const la = toyAdapter(lone);
	const lj = createReviewJob(la, 'daemon', lone, 384_000);
	const lc = nextCalls(lj, la)[0]!;
	assert.throws(() => applyFailure(lj, la, lc.callId, 'size-refusal', 1_000), (e: unknown) => e instanceof AtomTooLargeError && e.message.includes('src/f7.ts#fn7'));
});

test('refusal re-planning reads only the job snapshot, so a changed source between turns cannot change the material', () => {
	// The "source" an adapter could re-read: it changes between turns.
	const source = { atoms: Array.from({ length: 12 }, (_, i) => atom(i)) };
	const snap = toySnapshot(source.atoms);
	let job = createReviewJob(toyAdapter(snap), 'daemon', snap, LIMIT);
	source.atoms = source.atoms.map(a => ({ ...a, text: 'CHANGED' }));
	// The snapshot is frozen: nothing can change it in place.
	assert.ok(Object.isFrozen(job.snapshot));
	assert.throws(() => { (job.snapshot as { documentText?: string }).documentText = 'x'; }, TypeError);
	// The adapter rebuilt from the job's snapshot re-plans the original material.
	const rebuilt = toyAdapter(job.snapshot);
	const refused = nextCalls(job, rebuilt)[0]!;
	job = applyFailure(job, rebuilt, refused.callId, 'size-refusal', 2_000);
	for (const c of job.pending) assert.ok(!content(c).includes('CHANGED'), 'no changed text reached a call');
	// An adapter built from the changed source is refused: its material is not the snapshot's.
	const fromSource = toyAdapter(toySnapshot(source.atoms));
	assert.throws(() => applyFailure(job, fromSource, job.pending[0]!.callId, 'size-refusal', 1_000), (e: unknown) => e instanceof MaterialChangedError);
});

/** A premise-review-shaped adapter: extract (model) -> probe (deterministic) -> verify (model, one call per claim). */
function premiseAdapter(snapshot: ReviewMaterialSnapshot, probe: (claims: readonly unknown[]) => Promise<unknown>, probePolicy: FailurePolicy = 'fail-review'): ReviewAdapter<unknown> {
	const exec = { mode: 'structured' as const, cwd: '/repo' };
	const extract: AdapterStage = {
		id: 'extract', kind: 'model', after: [], onCallFailure: 'fail-review', snapshotField: 'claims',
		toSnapshot: out => ((out as StageAnswer[])[0]!.answer as { claims: unknown[] }).claims,
		singleCalls: () => [{ messages: [{ role: 'user', content: `extract from ${snapshot.documentText}` }], schema: CLAIMS_SCHEMA, execution: exec }],
		chunkCalls: () => [],
	};
	const probeStage: AdapterStage = {
		id: 'probe', kind: 'deterministic', after: ['extract'], onCallFailure: probePolicy, snapshotField: 'evidence',
		toSnapshot: out => out as unknown[],
		singleCalls: () => [], chunkCalls: () => [],
		run: async (_prior, snap) => probe(snap.claims ?? []),
	};
	const verify: AdapterStage = {
		id: 'verify', kind: 'model', after: ['probe'], onCallFailure: 'record-not-judged',
		// Built from the snapshot alone: the claims and evidence written once.
		singleCalls: (_prior, snap) => (snap.claims ?? []).map((c, i) => ({
			key: (c as { id: string }).id, execution: { ...exec, timeoutMs: 180_000 }, schema: TOY_SCHEMA,
			messages: [{ role: 'user', content: `verify ${JSON.stringify(c)} against ${JSON.stringify((snap.evidence ?? [])[i])}` }],
		})),
		chunkCalls: () => [],
	};
	return {
		kind: 'design-review', dimension: 'premise', material: () => ({ atoms: [], relations: [], obligations: [] }),
		stagesFor: () => [extract, probeStage, verify],
		finish: (outputs, ctx) => ({ outputs, notJudged: ctx.notJudged }),
	};
}
const CLAIMS_SCHEMA = { type: 'object', required: ['claims'], properties: { claims: { type: 'array' } } } as unknown as StructuredSchema;

test("runStage commits a deterministic stage's output; extract claims and probe evidence enter the snapshot once and re-planning reads only them", async () => {
	const snap: ReviewMaterialSnapshot = { kind: 'design-review', documentText: 'the DEF' };
	const probed: unknown[][] = [];
	const probe = async (claims: readonly unknown[]): Promise<unknown> => { probed.push([...claims]); return claims.map(c => ({ for: (c as { id: string }).id, hits: 1 })); };
	let job = createReviewJob(premiseAdapter(snap, probe), 'daemon', snap, 384_000);
	assert.equal(job.stage, 'extract');
	const ex = nextCalls(job, premiseAdapter(job.snapshot, probe))[0]!;
	const claims = [{ id: 'p1', text: 'uses X' }, { id: 'p2', text: 'calls Y' }];
	job = applyOutput(job, premiseAdapter(job.snapshot, probe), ex.callId, { callId: ex.callId, answer: { claims } });
	// The extract answer is in the snapshot, frozen, the moment it is applied.
	assert.deepEqual(job.snapshot.claims, claims);
	assert.ok(Object.isFrozen(job.snapshot.claims));
	assert.equal(job.stage, 'probe');
	assert.deepEqual(nextCalls(job, premiseAdapter(job.snapshot, probe)), [], 'a deterministic stage makes no call');
	// runStage refuses a model stage; runs the probe on the snapshot's claims; commits its evidence once.
	job = await runStage(job, premiseAdapter(job.snapshot, probe));
	assert.deepEqual(probed, [claims], 'the probe read the snapshot\'s claims');
	assert.deepEqual(job.snapshot.evidence, [{ for: 'p1', hits: 1 }, { for: 'p2', hits: 1 }]);
	assert.equal(job.stage, 'verify');
	await assert.rejects(runStage(job, premiseAdapter(job.snapshot, probe)), /model stage/);
	// Verify: one call per claim, keyed, with the 3-minute limit, built from the snapshot alone.
	const verifies = nextCalls(job, premiseAdapter(job.snapshot, probe));
	assert.deepEqual(verifies.map(c => c.carries.key), ['p1', 'p2']);
	assert.ok(verifies.every(c => c.execution.mode === 'structured' && c.execution.timeoutMs === 180_000));
	assert.ok(content(verifies[0]!).includes('"hits":1'), 'the evidence from the snapshot');
	// A verify call failing twice records that premise as not judged; the other is kept.
	let v = applyFailure(job, premiseAdapter(job.snapshot, probe), verifies[0]!.callId, 'stall');
	const again = v.pending.find(c => c.carries.key === 'p1')!;
	v = applyFailure(v, premiseAdapter(v.snapshot, probe), again.callId, 'stall');
	v = applyOutput(v, premiseAdapter(v.snapshot, probe), verifies[1]!.callId, { callId: verifies[1]!.callId, answer: { seen: [] } });
	assert.equal(v.phase, 'done');
	assert.deepEqual(v.notJudged.map(n => [n.key, n.policy]), [['p1', 'record-not-judged']]);
	assert.equal(((result<{ outputs: Record<string, StageAnswer[]> }>(v)).outputs['verify'] ?? []).length, 1);
	// Written once: a snapshot that already holds claims cannot take them again.
	const preset: ReviewMaterialSnapshot = { ...snap, claims: [{ id: 'old' }] };
	const pj = createReviewJob(premiseAdapter(preset, probe), 'daemon', preset, 384_000);
	const pc = nextCalls(pj, premiseAdapter(pj.snapshot, probe))[0]!;
	assert.throws(() => applyOutput(pj, premiseAdapter(pj.snapshot, probe), pc.callId, { callId: pc.callId, answer: { claims } }), /written once/);
	// A deterministic stage that throws: its policy. record-observation keeps the review going; fail-review fails it.
	const boom = async (): Promise<unknown> => { throw new Error('handler broke'); };
	for (const policy of ['record-observation', 'fail-review'] as const) {
		let j = createReviewJob(premiseAdapter(snap, boom, policy), 'daemon', snap, 384_000);
		const c = nextCalls(j, premiseAdapter(j.snapshot, boom, policy))[0]!;
		j = applyOutput(j, premiseAdapter(j.snapshot, boom, policy), c.callId, { callId: c.callId, answer: { claims: [] } });
		if (policy === 'fail-review') {
			await assert.rejects(runStage(j, premiseAdapter(j.snapshot, boom, policy)), (e: unknown) => e instanceof ReviewCallFailedError && e.message.includes('handler broke'));
		} else {
			j = await runStage(j, premiseAdapter(j.snapshot, boom, policy));
			assert.deepEqual(j.notJudged.map(n => [n.stage, n.policy, n.cause, n.detail]), [['probe', 'record-observation', 'stage-error', 'handler broke']]);
		}
	}
	// Re-planning after the snapshot is complete reads the claims and evidence from it alone: a
	// refused verify call is re-divided over the document's sections, each part carrying the
	// snapshot's claims and evidence for its sections; extract is not asked again, the probe not re-run.
	{
		const sections = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, label: `## Section ${i}`, text: `section-${i}-${'d'.repeat(500)}` }));
		const docSnap: ReviewMaterialSnapshot = { kind: 'design-review', documentText: JSON.stringify(sections) };
		let probeRuns = 0;
		const sectioned = (snapshot: ReviewMaterialSnapshot): ReviewAdapter<unknown> => {
			const atoms = JSON.parse(snapshot.documentText!) as typeof sections;
			const exec = { mode: 'structured' as const, cwd: '/repo' };
			const view = (snap: ReviewMaterialSnapshot, ids: readonly string[]): string => JSON.stringify({
				sections: atoms.filter(a => ids.includes(a.id)).map(a => a.text),
				claims: (snap.claims ?? []).filter(c => ids.includes((c as { section: string }).section)),
				evidence: (snap.evidence ?? []).filter(e => ids.includes((e as { section: string }).section)),
			});
			return {
				kind: 'design-review', dimension: 'premise',
				material: () => ({ atoms, relations: [], obligations: [] }),
				stagesFor: () => [
					{ id: 'extract', kind: 'model', after: [], onCallFailure: 'fail-review', snapshotField: 'claims',
						// The snapshot's form is marked, so a call built from it can be told from one built from the stage output.
						toSnapshot: out => (((out as StageAnswer[])[0]!.answer as { claims: object[] }).claims).map(c => ({ ...c, fromSnapshot: true })),
						singleCalls: () => [{ messages: [{ role: 'user', content: 'extract' }], schema: CLAIMS_SCHEMA, execution: exec }], chunkCalls: () => [] },
					{ id: 'probe', kind: 'deterministic', after: ['extract'], onCallFailure: 'fail-review', snapshotField: 'evidence',
						toSnapshot: out => out as unknown[], singleCalls: () => [], chunkCalls: () => [],
						run: async (_p, snap) => { probeRuns++; return (snap.claims ?? []).map(c => ({ section: (c as { section: string }).section, hits: 2, fromSnapshot: true })); } },
					{ id: 'verify', kind: 'model', after: ['probe'], onCallFailure: 'record-not-judged',
						singleCalls: (_p, snap) => [{ messages: [{ role: 'user', content: `verify all ${view(snap, atoms.map(a => a.id))}` }], schema: TOY_SCHEMA, execution: exec }],
						chunkCalls: (chunk, _p, snap) => [{ messages: [{ role: 'user', content: `verify part ${view(snap, chunk.atomIds)}` }], schema: TOY_SCHEMA, execution: exec }] },
				],
				finish: outputs => outputs,
			};
		};
		let sj = createReviewJob(sectioned(docSnap), 'daemon', docSnap, LIMIT);
		const exc = nextCalls(sj, sectioned(sj.snapshot))[0]!;
		const extracted = sections.map((sec, i) => ({ id: `p${i}`, section: sec.id, text: `claim ${i}` }));
		sj = applyOutput(sj, sectioned(sj.snapshot), exc.callId, { callId: exc.callId, answer: { claims: extracted } });
		sj = await runStage(sj, sectioned(sj.snapshot));
		assert.equal(probeRuns, 1);
		const whole = nextCalls(sj, sectioned(sj.snapshot))[0]!;
		assert.equal(whole.role, 'single');
		sj = applyFailure(sj, sectioned(sj.snapshot), whole.callId, 'size-refusal', 2_000);
		const parts = sj.pending;
		assert.ok(parts.length >= 2 && parts.every(c => c.stage === 'verify' && c.role === 'chunk' && c.chars <= 2_000));
		for (const c of parts) {
			const text = content(c);
			const claimIds = [...text.matchAll(/"id":"(p\d+)"/g)].map(m => m[1]);
			assert.deepEqual(claimIds, c.carries.atomIds.map(id => `p${id.slice(1)}`), 'the claims of exactly its sections');
			for (const id of claimIds) assert.ok(text.includes(`"text":"claim ${id!.slice(1)}","fromSnapshot":true`), `claim ${id} in its snapshot form`);
			assert.equal((text.match(/"hits":2/g) ?? []).length, c.carries.atomIds.length, 'with the evidence for its sections');
		}
		assert.equal(probeRuns, 1, 'the probe did not run again');
		assert.ok(!sj.pending.some(c => c.stage === 'extract'), 'extract was not asked again');
	}

	// A cancelled runStage ends with AbortError and commits nothing.
	let atProbe = createReviewJob(premiseAdapter(snap, probe), 'daemon', snap, 384_000);
	const ec = nextCalls(atProbe, premiseAdapter(atProbe.snapshot, probe))[0]!;
	atProbe = applyOutput(atProbe, premiseAdapter(atProbe.snapshot, probe), ec.callId, { callId: ec.callId, answer: { claims } });
	const runsBefore = probed.length;
	await assert.rejects(runStage(atProbe, premiseAdapter(atProbe.snapshot, probe), { signal: AbortSignal.abort() }), (e: unknown) => e instanceof Error && e.name === 'AbortError');
	assert.equal(probed.length, runsBefore, 'the stage did not run');
	assert.equal(atProbe.snapshot.evidence, undefined);
});

test("a re-issued reviewer-session call gets only the remaining time to the job deadline; past the deadline no call is issued and the review fails with today's message", () => {
	const T = 1_000_000;
	const session = (deadlineMs: number): ToyOpts => ({ execution: { mode: 'reviewer-session', cwd: '/repo', deadlineMs, tools: 'read-only' }, deadlineMessage: true });
	const snap = toySnapshot([atom(1)]);
	const adapter = toyAdapter(snap, session(600_000));
	let job = createReviewJob(adapter, 'daemon', snap, 384_000, { now: T });
	assert.equal(job.deadlineAt, T + 600_000, "a single session keeps today's one limit");
	const first = nextCalls(job, adapter, T)[0]!;
	assert.deepEqual(first.execution, { mode: 'reviewer-session', cwd: '/repo', deadlineMs: 600_000, tools: 'read-only' });
	// A stall at T+200s: the re-issue gets only what remains, the clock is not restarted.
	job = applyFailure(job, adapter, first.callId, 'stall', undefined, { now: T + 200_000 });
	const second = nextCalls(job, adapter, T + 200_000)[0]!;
	assert.equal(second.attempt, 2);
	assert.equal((second.execution as { deadlineMs: number }).deadlineMs, 400_000);
	assert.equal(job.deadlineAt, T + 600_000);
	// Past the deadline: no call; today's time-limit message.
	assert.throws(() => nextCalls(job, adapter, T + 600_000), /passed its time limit of 10 minutes\. No review was recorded/);
	// Without an adapter message: ReviewSessionTimeoutError.
	const plain = toyAdapter(snap, { execution: { mode: 'reviewer-session', cwd: '/repo', deadlineMs: 600_000, tools: 'read-only' } });
	const pj = createReviewJob(plain, 'daemon', snap, 384_000, { now: T });
	assert.throws(() => nextCalls(pj, plain, T + 600_001), (e: unknown) => e instanceof ReviewSessionTimeoutError);

	// One session's limit is capped at 30 minutes; a divided review's budget is the cap times its sessions.
	const many = Array.from({ length: 24 }, (_, i) => atom(i));
	const bigSnap = toySnapshot(many);
	const long = toyAdapter(bigSnap, session(45 * 60_000));
	let divided = createReviewJob(long, 'daemon', bigSnap, LIMIT, { now: T });
	const sessions = divided.pending.length;
	assert.ok(sessions > 1);
	assert.equal(divided.deadlineAt, T + sessions * 30 * 60_000);
	for (const c of nextCalls(divided, long, T)) assert.equal((c.execution as { deadlineMs: number }).deadlineMs, 30 * 60_000, 'no session runs longer than 30 minutes');
	// A refusal that re-divides into more sessions does not extend the deadline.
	const r = nextCalls(divided, long, T)[0]!;
	divided = applyFailure(divided, long, r.callId, 'size-refusal', 2_000, { now: T + 60_000 });
	assert.ok(divided.pending.length > sessions);
	assert.equal(divided.deadlineAt, T + sessions * 30 * 60_000);
	// A later stage's sessions share the deadline set when the first were planned.
	const twoStage: ReviewAdapter<ToyResult> = { ...adapter, stagesFor: p => [adapter.stagesFor(p)[0]!, { ...adapter.stagesFor(p)[0]!, id: 'second', after: ['judge'] }] };
	let ts = createReviewJob(twoStage, 'daemon', snap, 384_000, { now: T });
	const tc = nextCalls(ts, twoStage, T)[0]!;
	ts = applyOutput(ts, twoStage, tc.callId, { callId: tc.callId, answer: { seen: [] } }, T + 100_000);
	assert.equal(ts.stage, 'second');
	assert.equal(ts.deadlineAt, T + 600_000, 'not re-set by the second stage');
	// Near the end, each session gets only what remains.
	const late = nextCalls(divided, long, T + sessions * 30 * 60_000 - 5_000);
	assert.ok(late.every(c => (c.execution as { deadlineMs: number }).deadlineMs === 5_000));
});

test("a re-issued reviewer-session call gets only the remaining time to the job deadline; past the deadline no call is issued and the review fails with today's message (runReviewJob)", async () => {
	const T = 1_000_000;
	const snap = toySnapshot([atom(1)]);
	const sessionOpts: ToyOpts = { execution: { mode: 'reviewer-session', cwd: '/repo', deadlineMs: 600_000, tools: 'read-only' }, deadlineMessage: true };
	// A session that stalls 200 s in; its re-issue is given what remains and answers.
	{
		let clock = T;
		const seen: ReviewSessionOpts[] = [];
		const provider = {
			completeStructured: async () => { throw new Error('a session review makes no structured call'); },
			runReviewSession: async (prompt: string, _schema: unknown, o: ReviewSessionOpts) => {
				seen.push(o);
				if (seen.length === 1) { clock += 200_000; throw new CliStallError('codex', 200_000, undefined); }
				return { callId: /This request's id is "([^"]+)"/.exec(prompt)![1], answer: { seen: ['a1'] } };
			},
		} as unknown as LLMProvider;
		const adapter = toyAdapter(snap, sessionOpts);
		const out = await runReviewJob(createReviewJob(adapter, 'daemon', snap, 384_000, { now: T }), adapter, provider, { now: () => clock });
		assert.deepEqual((out as ToyResult).seen, ['a1']);
		assert.deepEqual(seen.map(o => o.deadlineMs), [600_000, 400_000], 'the re-issue never restarts the clock');
		assert.ok(seen.every(o => o.internalRetry === false && o.cwd === '/repo'), 'each session with its mode, the pipeline owning retries');
	}
	// Past the deadline: no call at all; today's message.
	{
		let calls = 0;
		const provider = { runReviewSession: async () => { calls++; return {}; } } as unknown as LLMProvider;
		const adapter = toyAdapter(snap, sessionOpts);
		await assert.rejects(runReviewJob(createReviewJob(adapter, 'daemon', snap, 384_000, { now: T }), adapter, provider, { now: () => T + 600_000 }),
			/passed its time limit of 10 minutes\. No review was recorded/);
		assert.equal(calls, 0);
	}
	// A session that runs out its time: the review fails with today's message, never re-issued.
	{
		let calls = 0;
		const provider = { runReviewSession: async () => { calls++; throw new ReviewSessionTimeoutError(600_000); } } as unknown as LLMProvider;
		const adapter = toyAdapter(snap, sessionOpts);
		await assert.rejects(runReviewJob(createReviewJob(adapter, 'daemon', snap, 384_000, { now: T }), adapter, provider, { now: () => T }), /passed its time limit/);
		assert.equal(calls, 1);
	}
});

test('a review cancelled while a call is in flight ends at once with AbortError, no re-issue, nothing recorded', async () => {
	const atoms = Array.from({ length: 24 }, (_, i) => atom(i));
	const snap = toySnapshot(atoms);
	const exec = { mode: 'structured' as const, cwd: '/repo', timeoutMs: 180_000 };
	let finished = 0;
	const counted = (s: ReviewMaterialSnapshot): ReviewAdapter<unknown> => {
		const a = toyAdapter(s, { execution: exec });
		return { ...a, finish: (o, c) => { finished++; return a.finish(o, c); } };
	};
	// Uncancelled: serial calls, each with its execution mode, internalRetry false and the signal.
	{
		let inFlight = 0, most = 0;
		const opts: StructuredCompletionOpts[] = [];
		const model = seeingModel();
		const ac = new AbortController();
		const provider = {
			completeStructured: async (messages: LLMMessage[], _schema: unknown, o: StructuredCompletionOpts) => {
				inFlight++; most = Math.max(most, inFlight); opts.push(o);
				await new Promise(r => setTimeout(r, 2));
				inFlight--;
				return model.answer({ messages } as unknown as ReviewCall);
			},
		} as unknown as LLMProvider;
		const out = await runReviewJob(createReviewJob(counted(snap), 'daemon', snap, LIMIT), counted(snap), provider, { signal: ac.signal });
		assert.equal((out as ToyResult).seen.length, atoms.length);
		assert.ok(opts.length > 1);
		assert.equal(most, 1, 'never more than one call in flight');
		assert.ok(opts.every(o => o.internalRetry === false && o.cwd === '/repo' && o.timeoutMs === 180_000 && o.signal === ac.signal));
	}
	// Cancelled mid-call, whether the provider honours the signal or ignores it: AbortError at once.
	for (const honours of [true, false]) {
		finished = 0;
		let calls = 0;
		const ac = new AbortController();
		const provider = {
			completeStructured: (_m: LLMMessage[], _s: unknown, o: StructuredCompletionOpts) => {
				calls++;
				setTimeout(() => ac.abort(), 20);
				return new Promise((_resolve, reject) => {
					if (honours) o.signal?.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
				});
			},
		} as unknown as LLMProvider;
		const t0 = Date.now();
		const err = await Promise.race([
			runReviewJob(createReviewJob(counted(snap), 'daemon', snap, LIMIT), counted(snap), provider, { signal: ac.signal }).then(() => null, (e: unknown) => e),
			new Promise(r => setTimeout(() => r(new Error('still running 3 s after the cancel')), 3_000)),
		]);
		assert.ok(err instanceof Error && err.name === 'AbortError', `${honours ? 'honoured' : 'ignored'}: got ${String(err)}`);
		assert.ok(Date.now() - t0 < 1_000, 'at once');
		assert.equal(calls, 1, 'no re-issue');
		assert.equal(finished, 0, 'nothing recorded: the review produced no result');
	}
	// Cancelled while a deterministic stage runs (a probe that never finishes): AbortError at once, nothing committed.
	{
		let finishedProbe = false;
		const hang = async (): Promise<unknown> => new Promise(() => { /* never settles */ });
		const ac = new AbortController();
		const snapP: ReviewMaterialSnapshot = { kind: 'design-review', documentText: 'the DEF' };
		const extractOnly = {
			completeStructured: async (_m: LLMMessage[], schema: StructuredSchema) =>
				({ callId: (schema as unknown as { properties: { callId: { const: string } } }).properties.callId.const, answer: { claims: [{ id: 'p1' }] } }),
		} as unknown as LLMProvider;
		const adapter = premiseAdapter(snapP, async (...a) => { const r = await hang(); finishedProbe = true; return r; });
		setTimeout(() => ac.abort(), 50);
		const t0 = Date.now();
		const err = await Promise.race([
			runReviewJob(createReviewJob(adapter, 'daemon', snapP, 384_000), adapter, extractOnly, { signal: ac.signal }).then(() => null, (e: unknown) => e),
			new Promise(r => setTimeout(() => r(new Error('still running 3 s after the cancel')), 3_000)),
		]);
		assert.ok(err instanceof Error && err.name === 'AbortError', `got ${String(err)}`);
		assert.ok(Date.now() - t0 < 1_000, 'the pending stage did not hold the review');
		assert.equal(finishedProbe, false);
		// runStage itself: the stage's output is never committed after the cancel.
		let j = createReviewJob(adapter, 'daemon', snapP, 384_000);
		const ex = nextCalls(j, adapter)[0]!;
		j = applyOutput(j, adapter, ex.callId, { callId: ex.callId, answer: { claims: [{ id: 'p1' }] } });
		const ac2 = new AbortController();
		setTimeout(() => ac2.abort(), 30);
		await assert.rejects(runStage(j, adapter, { signal: ac2.signal }), (e: unknown) => e instanceof Error && e.name === 'AbortError');
		assert.equal(j.snapshot.evidence, undefined);
	}
	// An answer that arrives around the cancel is never applied after it: wherever the cancel lands
	// relative to the answer (swept across microtask turns), a result is never made once it fired.
	for (let depth = 0; depth <= 8; depth++) {
		const ac = new AbortController();
		const model = seeingModel();
		let finishedAfterCancel = false;
		const small = toySnapshot([atom(1)]);
		const watched = (s: ReviewMaterialSnapshot): ReviewAdapter<unknown> => {
			const a = toyAdapter(s);
			return { ...a, finish: (o, c) => { if (ac.signal.aborted) finishedAfterCancel = true; return a.finish(o, c); } };
		};
		const later = (n: number, f: () => void): void => { if (n === 0) f(); else queueMicrotask(() => later(n - 1, f)); };
		const provider = {
			completeStructured: async (messages: LLMMessage[]) => { later(depth, () => ac.abort()); return model.answer({ messages } as unknown as ReviewCall); },
		} as unknown as LLMProvider;
		const outcome = await runReviewJob(createReviewJob(watched(small), 'daemon', small, LIMIT), watched(small), provider, { signal: ac.signal }).then(() => 'result', (e: Error) => e.name);
		assert.equal(finishedAfterCancel, false, `depth ${depth}: no result is made once the cancel fired`);
		assert.ok(outcome === 'AbortError' || outcome === 'result', `depth ${depth}: ${outcome}`);
	}
});

// -- the bounded gather (plan task t8) ----------------------------------------

/** A model for divided reviews: chunk calls report what they see with one keyed note per atom; reductions,
 *  obligations and relations answer in their own shapes. Records every call it is given. */
function gatherModel(noteChars: number, reduceChars: number): { answer: (call: ReviewCall) => unknown; calls: ReviewCall[] } {
	const calls: ReviewCall[] = [];
	return {
		calls,
		answer: (call: ReviewCall) => {
			calls.push(call);
			const id = callIdIn(call.messages);
			const text = content(call);
			const noteIds = [...text.matchAll(/"noteId":"([a-z]\d+)"/g)].map(m => m[1]!);
			if (call.prompt.schema === NOTE_SCHEMA) return { callId: id, answer: { text: `reduced[${noteIds.join(',')}]`.padEnd(reduceChars, '.') } };
			if (call.prompt.schema === VERDICT_SCHEMA) return { callId: id, answer: { verdict: `judged on ${noteIds.join(',')}` } };
			if (call.prompt.schema === RELATION_SCHEMA) return { callId: id, answer: { holds: true } };
			const seen = atomIdsIn(text);
			return { callId: id, answer: { seen, notes: seen.map(a => ({ key: 'k1', text: `${a}:${'e'.repeat(noteChars)}` })) } };
		},
	};
}

test('an obligation whose evidence exceeds the limit is reduced level by level, every gather call fits and provenance is kept', async () => {
	const atoms = Array.from({ length: 30 }, (_, i) => atom(i, 300));
	const snap = toySnapshot(atoms, [], ['k1', 'k2']);
	const rebuild = (s: ReviewMaterialSnapshot): ReviewAdapter<unknown> => toyAdapter(s, { gatherLimit: LIMIT });
	const model = gatherModel(800, 1_400);
	const { job } = await drive(createReviewJob(rebuild(snap), 'daemon', snap, LIMIT), rebuild, model.answer);
	assert.equal(job.phase, 'done');

	// Every call of every role fit the limit.
	for (const c of model.calls) assert.ok(c.chars <= LIMIT, `a ${c.chars}-character ${c.role} call`);
	// Level by level: the chunk notes did not fit one call, nor did their first reduction.
	assert.equal(job.gatherLevels['k1'], 2);
	const reductions = model.calls.filter(c => c.role === 'reduce');
	const chunkNotes = job.notes.filter(n => n.key === 'k1' && job.noteProvenance[n.noteId] === undefined);
	assert.equal(chunkNotes.length, atoms.length, 'one note per atom from the chunks');
	const level1 = reductions.filter(c => c.carries.noteIds.every(id => chunkNotes.some(n => n.noteId === id)));
	const level2 = reductions.filter(c => !level1.includes(c));
	assert.ok(level1.length >= 2 && level2.length >= 1, `${level1.length} first-level and ${level2.length} second-level reductions`);
	assert.deepEqual(level1.flatMap(c => c.carries.noteIds).sort(), chunkNotes.map(n => n.noteId).sort(), 'the first level reads every chunk note once');

	// The obligation is judged once, on notes that stand, through their provenance, for every chunk note and atom.
	const obligation = model.calls.filter(c => c.role === 'obligation' && c.carries.key === 'k1');
	assert.equal(obligation.length, 1);
	const expand = (id: string): string[] => (job.noteProvenance[id] ?? [id]).flatMap(x => (job.noteProvenance[x] !== undefined ? expand(x) : [x]));
	assert.deepEqual(obligation[0]!.carries.noteIds.flatMap(expand).sort(), chunkNotes.map(n => n.noteId).sort(), 'provenance kept');
	assert.deepEqual([...obligation[0]!.carries.atomIds].sort(), atoms.map(a => a.id).sort(), 'and so are the atoms each note stands for');
	// An obligation no chunk gave evidence for is still adjudicated, on no notes.
	const empty = model.calls.filter(c => c.role === 'obligation' && c.carries.key === 'k2');
	assert.equal(empty.length, 1);
	assert.deepEqual(empty[0]!.carries.noteIds, []);

	// The result: the chunk results merged with each obligation's part, and the calls per role.
	const r = result<ToyResult>(job);
	assert.deepEqual(r.gatheredParts!.map(g => [g.role, g.key]), [['obligation', 'k1'], ['obligation', 'k2']]);
	assert.equal(r.seen.length, atoms.length);
	assert.deepEqual(r.pipelineCalls, { chunk: job.counts.chunk, obligation: 2, relation: 0, merge: 0 });
	// A single-chunk review passes straight through: no gather call at all.
	const small = toySnapshot([atom(1)], [], ['k1']);
	const one = await drive(createReviewJob(rebuild(small), 'daemon', small, LIMIT), rebuild, gatherModel(10, 10).answer);
	assert.equal(one.sent.length, 1);
	assert.equal(result<ToyResult>(one.job).gatheredParts, undefined);
});

test('a relation judged by two calls is complete only when both are answered', () => {
	// Two files, each a chunk's worth; a1 (first file) references a12 (second): the plan must cut it.
	const atoms = Array.from({ length: 20 }, (_, i) => atom(i, 400, i < 10 ? 'src/x.ts' : 'src/y.ts'));
	// Stated twice in the material (two references from a1 to a12): still one relation to judge.
	const rel: ReviewRelation[] = [{ from: 'a1', to: 'a12', kind: 'references' }, { from: 'a1', to: 'a12', kind: 'references' }];
	for (let i = 0; i < 20; i++) for (let j = i + 1; j < 20; j++) if (atoms[i]!.file === atoms[j]!.file) rel.push({ from: atoms[i]!.id, to: atoms[j]!.id, kind: 'same-file' });
	const snap = toySnapshot(atoms, rel);
	let offered = 0;
	const rebuild = (s: ReviewMaterialSnapshot): ReviewAdapter<unknown> => toyAdapter(s, { gatherLimit: LIMIT, relationCalls: 2, onRelationCall: () => { offered++; } });
	const model = gatherModel(10, 10);
	let job = createReviewJob(rebuild(snap), 'daemon', snap, LIMIT);
	assert.ok(job.plan.crossRelations.length > 0 && job.plan.crossRelations.every(r => r.from === 'a1' && r.to === 'a12'), 'the relation is cut');
	while (job.pending.some(c => c.role === 'chunk')) {
		const c = job.pending.find(x => x.role === 'chunk')!;
		job = applyOutput(job, rebuild(job.snapshot), c.callId, model.answer(c));
	}
	assert.equal(offered, 1, 'the relation is offered to relationCall once');
	const key = Object.keys(job.relationPlan)[0]!;
	const relCalls = job.pending.filter(c => c.role === 'relation');
	assert.equal(relCalls.length, 2);
	assert.ok(relCalls.every(c => c.carries.key === key && c.chars <= LIMIT));
	assert.deepEqual(relCalls[0]!.carries.atomIds, ['a1', 'a12']);
	// One answered: not judged, the review not finished.
	job = applyOutput(job, rebuild(job.snapshot), relCalls[0]!.callId, model.answer(relCalls[0]!));
	assert.equal(relationJudged(job, key), false);
	assert.equal(job.phase, 'gather');
	assert.throws(() => result(job), /not complete/);
	// Both answered: judged, and the result holds both answers.
	job = applyOutput(job, rebuild(job.snapshot), relCalls[1]!.callId, model.answer(relCalls[1]!));
	assert.equal(relationJudged(job, key), true);
	assert.equal(job.phase, 'done');
	const r = result<ToyResult>(job);
	assert.deepEqual(r.gatheredParts!.map(g => [g.role, g.key]), [['relation', key], ['relation', key]]);
	assert.equal((r.pipelineCalls as { relation: number }).relation, 2);
	assert.equal(offered, 1);

	// A refused relation call cannot be divided: it is named, never resent, and the review never
	// completes on the other call alone.
	{
		let rj = createReviewJob(rebuild(snap), 'daemon', snap, LIMIT);
		while (rj.pending.some(c => c.role === 'chunk')) {
			const c = rj.pending.find(x => x.role === 'chunk')!;
			rj = applyOutput(rj, rebuild(rj.snapshot), c.callId, model.answer(c));
		}
		const [r1, r2] = rj.pending.filter(c => c.role === 'relation');
		assert.throws(() => applyFailure(rj, rebuild(rj.snapshot), r1!.callId, 'size-refusal', 500), (e: unknown) => e instanceof AtomTooLargeError && e.message.includes('relation'));
		// Answered once, failed twice otherwise: the review fails rather than finishing on one answer.
		let one = applyOutput(rj, rebuild(rj.snapshot), r2!.callId, model.answer(r2!));
		one = applyFailure(one, rebuild(one.snapshot), r1!.callId, 'transient');
		const again = one.pending.find(c => c.role === 'relation')!;
		assert.throws(() => applyFailure(one, rebuild(one.snapshot), again.callId, 'transient'), (e: unknown) => e instanceof ReviewCallFailedError);
		assert.equal(relationJudged(one, key), false);
	}

	// A relation call that does not fit the limit is named, never sent.
	const wide = toySnapshot([atom(1, 3_500), atom(2, 3_500)], [{ from: 'a1', to: 'a2', kind: 'references' }]);
	const wa = toyAdapter(wide, { gatherLimit: LIMIT, relationCalls: 1 });
	let wj = createReviewJob(wa, 'daemon', wide, LIMIT);
	const first = wj.pending[0]!;
	wj = applyOutput(wj, wa, first.callId, model.answer(first));
	const second = wj.pending[0]!;
	assert.throws(() => applyOutput(wj, wa, second.callId, model.answer(second)), (e: unknown) => e instanceof AtomTooLargeError && /relation a1 references a2/.test(e.message));
});

test('usage summaries size a chunk and are always kept; proximity summaries are added while they fit, and a last-resort omission is logged', () => {
	// h calls k; 60 small symbols share h's directory only. Sized with every summary line, {h, k} would not fit;
	// sized with the summaries it must carry (none: its only usage partner is inside), it does.
	const h = atom(1, 3_500, 'src/hub/h.ts', 'src/hub');
	const k = atom(2, 300, 'src/hub/k.ts', 'src/hub');
	const mates = Array.from({ length: 60 }, (_, i) => atom(100 + i, 40, `src/hub/m${i}.ts`, 'src/hub'));
	const atoms = [h, k, ...mates];
	const rel: ReviewRelation[] = [{ from: 'a1', to: 'a2', kind: 'calls' }];
	for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) rel.push({ from: atoms[i]!.id, to: atoms[j]!.id, kind: 'same-module' });
	const snap = toySnapshot(atoms, rel);
	const job = createReviewJob(toyAdapter(snap), 'daemon', snap, LIMIT);
	const holder = job.plan.chunks.find(c => c.atomIds.includes('a1'))!;
	assert.ok(holder.atomIds.includes('a2'), 'the call partners share the chunk');
	// With every proximity line counted, that chunk could not have been formed.
	const allLines = mates.reduce((n, m) => n + `summary of ${m.label}`.length + 40, 0);
	assert.ok(holder.chars - holder.neighbours.reduce((n, x) => n + x.summary.length + 40, 0) + allLines > LIMIT, 'it fits only because proximity lines are optional');
	assert.ok(holder.chars <= LIMIT);
	assert.ok(holder.neighbours.length < mates.length, 'only the proximity summaries that fit');
	// The packer fills the hub's chunk with whole symbols; a chunk with room left carries proximity summaries as context.
	assert.ok(job.plan.chunks.some(c => c.neighbours.length > 0 && c.chars <= LIMIT), 'proximity summaries are added where they fit');
	for (const c of job.pending) assert.ok(c.chars <= LIMIT);

	// A usage summary is never dropped while there is room: a call cut between two chunks keeps both lines.
	const x = atom(10, 3_000, 'src/x/x.ts', 'src/x'), y = atom(11, 3_000, 'src/y/y.ts', 'src/y'), z = atom(12, 3_000, 'src/z/z.ts', 'src/z');
	const chain = toySnapshot([x, y, z], [{ from: 'a10', to: 'a11', kind: 'calls' }, { from: 'a11', to: 'a12', kind: 'calls' }]);
	const cj = createReviewJob(toyAdapter(chain), 'daemon', chain, LIMIT);
	for (const r of cj.plan.crossRelations) {
		const of = (id: string) => cj.plan.chunks.find(c => c.atomIds.includes(id))!;
		assert.ok(of(r.from).neighbours.some(n => n.atomId === r.to) && of(r.to).neighbours.some(n => n.atomId === r.from), `the cut call ${r.from}->${r.to} keeps both summaries`);
	}

	// Last resort: an atom so large that its usage summaries do not fit beside it keeps those that fit, logged.
	const giant = atom(20, LIMIT - 700, 'src/g/g.ts', 'src/g');
	const callees = Array.from({ length: 12 }, (_, i) => atom(30 + i, 300, `src/c${i}/c.ts`, `src/c${i}`));
	const lastSnap = toySnapshot([giant, ...callees], callees.map(c => ({ from: 'a20', to: c.id, kind: 'calls' as const })));
	const lj = createReviewJob(toyAdapter(lastSnap), 'daemon', lastSnap, LIMIT);
	const gchunk = lj.plan.chunks.find(c => c.atomIds.includes('a20'))!;
	assert.deepEqual(gchunk.atomIds, ['a20']);
	assert.ok(gchunk.chars <= LIMIT && gchunk.neighbours.length < callees.length, 'the atom stays whole; the summaries that do not fit are left out');
});
