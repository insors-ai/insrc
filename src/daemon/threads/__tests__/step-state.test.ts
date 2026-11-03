/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared step-state store (Epic 86197ac6, Story s1, t7): today's per-kind
 * lifecycles, and state that crosses worker threads.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/step-state.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel, Worker } from 'node:worker_threads';
import { STATE_VERSION as ANALYZE_VERSION } from '../../steps/analyze-step/state.js';
import type { StepStatePayload } from '../../steps/analyze-step/state.js';
import type { WorkflowStepStatePayload } from '../../steps/workflow-step/state.js';
import { serveHub } from '../channel.js';
import { LocalStepStateStore, StepStateNotFound, stepStateHubHandlers } from '../step-state.js';
import type { StepKind } from '../step-state.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOUR = 60 * 60 * 1_000;

test("each step kind's token rule, 100-entry eviction, TTL with read refresh and release match today's stores", async () => {
	let t = 1_000_000;
	const s = new LocalStepStateStore(() => t, () => {});

	// rotate-token (analyze, workflow): a new token; the old one is gone; no prior token is fine.
	for (const kind of ['analyze', 'workflow'] as const) {
		const a = await s.mint(kind, { n: 1 });
		assert.match(a, /^[A-Za-z0-9_-]{22}$/, '22-char URL-safe token');
		const b = await s.update(kind, a, { n: 2 });
		assert.notEqual(b, a);
		assert.equal(await s.read(kind, a), undefined, `${kind}: the superseded token fails`);
		assert.deepEqual((await s.read(kind, b))?.payload, { n: 2 });
		const c = await s.update(kind, undefined, { n: 3 });
		assert.deepEqual((await s.read(kind, c))?.payload, { n: 3 }, `${kind}: an update with no prior token just mints`);
	}
	// stable-token (review): same token, payload replaced in place; an unknown token throws.
	const r = await s.mint('review', { stage: 'claims' });
	assert.equal(await s.update('review', r, { stage: 'verdicts' }), r);
	assert.equal(await s.update('review', r, { stage: 'done' }), r, 'a second update keeps the token too');
	assert.deepEqual((await s.read('review', r))?.payload, { stage: 'done' });
	await assert.rejects(s.update('review', 'nope', {}), StepStateNotFound);
	// consume-per-stage (code-review): each stage mints a new token and the previous one fails.
	const wait = await s.mint('code-review', { stage: 'confirm_wait' });
	const judge = await s.update('code-review', wait, { stage: 'judgements' });
	assert.notEqual(judge, wait);
	assert.equal(await s.read('code-review', wait), undefined, 'the confirm_wait token is consumed');
	assert.deepEqual((await s.read('code-review', judge))?.payload, { stage: 'judgements' });
	// release
	await s.release('code-review', judge);
	assert.equal(await s.read('code-review', judge), undefined);
	await s.release('code-review', 'unknown');   // a no-op

	// 100-entry cap per kind, least recently touched evicted first; other kinds untouched.
	const lru = new LocalStepStateStore(() => t, () => {});
	const tokens: string[] = [];
	for (let i = 0; i < 100; i++) { t += 1; tokens.push(await lru.mint('analyze', { i })); }
	t += 1; await lru.read('analyze', tokens[0]!);   // touch the oldest: now the least recent is tokens[1]
	const otherKind = await lru.mint('review', { other: true });
	t += 1; await lru.mint('analyze', { i: 100 });
	assert.equal(await lru.sizeForTests('analyze'), 100);
	assert.notEqual(await lru.read('analyze', tokens[0]!), undefined, 'the refreshed entry survives');
	assert.equal(await lru.read('analyze', tokens[1]!), undefined, 'the least recently touched is evicted');
	assert.notEqual(await lru.read('review', otherKind), undefined, 'another kind is unaffected');

	// TTL: a read refreshes the expiry; an entry untouched for over an hour is swept on the next mint.
	const ttl = new LocalStepStateStore(() => t, () => {});
	const kept = await ttl.mint('workflow', { kept: true });
	const dropped = await ttl.mint('workflow', { dropped: true });
	t += HOUR - 1; await ttl.read('workflow', kept);
	t += 2; await ttl.mint('workflow', { trigger: true });
	assert.notEqual(await ttl.read('workflow', kept), undefined, 'refreshed by the read');
	assert.equal(await ttl.read('workflow', dropped), undefined, 'untouched for over an hour: swept');
});

function connect(store: LocalStepStateStore): () => { worker: Worker; ask: (m: Record<string, unknown>) => Promise<Record<string, unknown>> } {
	return () => {
		const { port1: main, port2: workerPort } = new MessageChannel();
		serveHub(main, stepStateHubHandlers(store, () => {}));
		const worker = new Worker(join(HERE, 'helpers', 'step-state-worker-bootstrap.mjs'), { workerData: { port: workerPort }, transferList: [workerPort] });
		const inbox: Record<string, unknown>[] = [];
		const waiting: ((m: Record<string, unknown>) => void)[] = [];
		worker.on('message', (m: Record<string, unknown>) => { const w = waiting.shift(); if (w !== undefined) w(m); else inbox.push(m); });
		const next = (): Promise<Record<string, unknown>> => { const m = inbox.shift(); return m !== undefined ? Promise.resolve(m) : new Promise(res => { waiting.push(res); }); };
		void next();   // the 'ready' message
		return { worker, ask: (m) => { worker.postMessage(m); return next(); } };
	};
}

test('atomic review claim commit generation recovery receipt and pinned-capacity invariants', async () => {
	let now = 1000;
	const store = new LocalStepStateStore(() => now, () => {});
	for (const kind of ['review', 'code-review'] as const) {
		const token = await store.mintReviewState(kind, { source: ['original'] }, { generation: 0, callId: 'call-1' });
		const access = { kind, token, generation: 0, callId: 'call-1', owner: 'owner-1' };
		const r = await store.claimReviewState<{ source: string[] }>(access);
		assert.equal(r.status, 'claimed'); if (r.status !== 'claimed') throw new Error('expected claim');
		r.payload.source.push('mutated');
		assert.deepEqual((await store.read<{ source: string[] }>(kind, token))!.payload.source, ['original']);
		await assert.rejects(store.claimReviewState({ ...access, owner: 'owner-2' }), /busy/);
		await assert.rejects(store.commitReviewState({ ...r.claim, owner: 'owner-2' }, { status: 'completed', receipt: { status: 'completed', callId: 'call-1' } }), /owner-mismatch/);
		await assert.rejects(store.release(kind, token), /invalid/);
		await assert.rejects(store.releaseReviewClaim(r.claim, false as true), /uncertain/);
		await assert.rejects(store.claimReviewState(access), /busy/);
		await store.releaseReviewClaim(r.claim, true); // validation failed before any write
		const retry = await store.claimReviewState(access);
		if (retry.status !== 'claimed') throw new Error('expected retry');
		await assert.rejects(store.releaseReviewClaim(r.claim, true), /owner-mismatch/);
		const next = await store.commitReviewState(retry.claim, { status: 'pending', callId: 'call-2', payload: { source: 'next' } });
		assert.equal(next.generation, 1);
		assert.equal(next.token === token, kind === 'review');
		await assert.rejects(store.claimReviewState(access), /stale/);
		const final = await store.claimReviewState({ ...access, token: next.token, generation: 1, callId: 'call-2' });
		if (final.status !== 'claimed') throw new Error('expected final');
		// Clone failure has a proven no-write outcome; claim stays exclusive until explicitly released.
		await assert.rejects(store.commitReviewState(final.claim, { status: 'pending', callId: 'bad', payload: { f: () => 1 } }));
		await assert.rejects(store.claimReviewState({ ...access, token: next.token, generation: 1, callId: 'call-2' }), /busy/);
		const receipt = { status: 'completed' as const, callId: 'call-2', artifactId: 'CR-abc-s1', runId: 'cr-1' };
		await assert.rejects(store.commitReviewState(final.claim, { status: 'completed', receipt: { ...receipt, runId: 'x'.repeat(257) } }), /invalid/);
		const completed = await store.commitReviewState(final.claim, { status: 'completed', receipt });
		assert.equal(completed.generation, 2);
		assert.deepEqual(await store.claimReviewState({ ...access, token: next.token, generation: 1, callId: 'call-2', owner: 'other' }), { status: 'completed', receipt });
		await assert.rejects(store.commitReviewState(final.claim, { status: 'completed', receipt }), /owner-mismatch/);
		assert.equal((await store.read(kind, next.token))!.payload, undefined, 'receipt retains no source');
	}
	const uncertain = await store.mintReviewState('review', {}, { generation: 0, callId: 'uncertain' });
	const access = { kind: 'review' as const, token: uncertain, generation: 0, callId: 'uncertain', owner: 'lost' };
	const claimed = await store.claimReviewState(access); if (claimed.status !== 'claimed') throw new Error('expected claim');
	await store.invalidateReviewOwner('lost'); // ambiguous write or owner loss, never retry automatically
	await assert.rejects(store.claimReviewState(access), /uncertain/);
	await assert.rejects(store.commitReviewState(claimed.claim, { status: 'pending', callId: 'late', payload: {} }), /uncertain/);
	const unrelated = await store.mintReviewState('review', {}, { generation: 0, callId: 'unrelated' });
	assert.equal((await store.claimReviewState({ ...access, token: unrelated, callId: 'unrelated', owner: 'independent' })).status, 'claimed');
	const pinned = new LocalStepStateStore(() => now, () => {});
	for (let i = 0; i < 100; i++) {
		const token = await pinned.mintReviewState('review', { i }, { generation: 0, callId: `c-${i}` });
		await pinned.claimReviewState({ kind: 'review', token, generation: 0, callId: `c-${i}`, owner: 'live' });
	}
	now += 2 * HOUR;
	await assert.rejects(pinned.mint('review', {}), /capacity/);
	assert.equal(pinned.listLocal('review').length, 100, 'TTL never sweeps pinned work');
	await pinned.invalidateReviewOwner('live');
	await pinned.mintReviewState('review', {}, { generation: 0, callId: 'after-loss' });
	assert.equal(await pinned.sizeForTests('review'), 100, 'uncertain tombstones stay bounded');
	const receipts = new LocalStepStateStore(() => now, () => {});
	let first: string | undefined;
	for (let i = 0; i < 101; i++) {
		const token = await receipts.mintReviewState('review', {}, { generation: 0, callId: `r-${i}` }); first ??= token;
		const r = await receipts.claimReviewState({ kind: 'review', token, generation: 0, callId: `r-${i}`, owner: 'o' });
		if (r.status !== 'claimed') throw new Error('expected claim');
		await receipts.commitReviewState(r.claim, { status: 'completed', receipt: { status: 'completed', callId: `r-${i}` } });
		now++;
	}
	assert.equal(await receipts.sizeForTests('review'), 100);
	assert.equal(await receipts.read('review', first!), undefined);
	now += 2 * HOUR; await receipts.mint('review', {});
	assert.equal(await receipts.sizeForTests('review'), 1, 'receipts expire under existing TTL');
});


test('DIFF-WAIT-RESUME: shared and hub leases protect all active entries from TTL/LRU and expire at a fixed terminal deadline', async () => {
 let now = 1000;
 const store = new LocalStepStateStore(() => now);
 const tokens: string[] = [];
 for (let i = 0; i < 105; i++) tokens.push(await store.mint('code-review', { active: i }, 10 * HOUR));
 assert.equal(await store.sizeForTests('code-review'), 105, 'active operations may exceed the unpinned LRU cap');
 now = 2 * HOUR;
 await store.mint('code-review', { unrelated: true });
 for (const token of tokens) assert.notEqual(await store.read('code-review', token), undefined);
 const { worker, ask } = connect(store)();
 try {
  const token = tokens[0]!;
  assert.equal((await ask({ op: 'pin', kind: 'code-review', token, until: now + 1000 }))['ok'], true);
  now += 999; assert.notEqual(await store.read('code-review', token), undefined);
  now += 1; assert.equal(await store.read('code-review', token), undefined, 'reads never extend fixed terminal grace');
  assert.notEqual(await store.read('code-review', tokens[1]!), undefined);
 } finally { await worker.terminate(); }
});


test('DIFF-CONTROLLER-VALIDATE: shared hub compare-and-replace admits one expected state revision without rotating its token', async () => {
 const store = new LocalStepStateStore();
 const token = await store.mint('code-review', { revision: 0, currentCall: 'a' }, Date.now() + HOUR);
 const { worker, ask } = connect(store)();
 try {
  const first = await ask({ op: 'compare', kind: 'code-review', token, revision: 0, payload: { revision: 1, currentCall: 'b' } });
  const stale = await ask({ op: 'compare', kind: 'code-review', token, revision: 0, payload: { revision: 1, currentCall: 'foreign' } });
  assert.equal(first['replaced'], true); assert.equal(stale['replaced'], false);
  assert.deepEqual((await store.read('code-review', token))?.payload, { revision: 1, currentCall: 'b' });
 } finally { await worker.terminate(); }
});
