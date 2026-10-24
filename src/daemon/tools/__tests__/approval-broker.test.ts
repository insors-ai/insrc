/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s3/t3: the approval broker.
 * Run: npx tsx --test src/daemon/tools/__tests__/approval-broker.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ApprovalBroker, type ApprovalFrame } from '../../approval-broker.js';
import type { ApprovalRequest } from '../types.js';

let n = 0;
function req(ms = 60_000): ApprovalRequest {
	n += 1;
	return { requestId: `r${n}`, toolId: 'git_push', approvalClass: 'destructive', repoPath: '/repo', arguments: { force: true }, reason: 'test', expiresAt: new Date(Date.now() + ms).toISOString() };
}
const sink = () => { const frames: ApprovalFrame[] = []; return { frames, send: (f: ApprovalFrame) => { frames.push(f); } }; };
const tick = () => new Promise<void>(r => setImmediate(r));

test('approval-broker.test.ts: an answered request resolves approved and a declined one resolves declined', async () => {
	const b = new ApprovalBroker(); const s = sink(); b.subscribe(s.send);
	const a = req(), d = req();
	const pa = b.ask(a), pd = b.ask(d);
	assert.equal(b.pendingCount, 2);
	assert.deepEqual(b.answer(a.requestId, 'approve'), { accepted: true });
	assert.deepEqual(b.answer(d.requestId, 'decline'), { accepted: true });
	assert.deepEqual(await pa, { requestId: a.requestId, decision: 'approve' });
	assert.equal(await pd, 'declined');
	assert.equal(b.pendingCount, 0);
	assert.deepEqual(b.answer('nope', 'approve'), { accepted: false });
});

test('approval-broker.test.ts: no open stream resolves no-client at once', async () => {
	const b = new ApprovalBroker();
	assert.equal(await b.ask(req()), 'no-client');
	assert.equal(b.pendingCount, 0);
});

test('approval-broker.test.ts: an unanswered request resolves timed-out at expiry and a late answer is ignored', async () => {
	const b = new ApprovalBroker(); const s = sink(); b.subscribe(s.send);
	const r = req(30);
	assert.equal(await b.ask(r), 'timed-out');
	assert.deepEqual(b.answer(r.requestId, 'approve'), { accepted: false });
	assert.deepEqual(s.frames.at(-1), { type: 'cancel', requestId: r.requestId, reason: 'timed-out' });
});

test('approval-broker.test.ts: with two subscribers the first answer wins and the second is refused', async () => {
	const b = new ApprovalBroker(); const s1 = sink(), s2 = sink(); b.subscribe(s1.send); b.subscribe(s2.send);
	const r = req(); const p = b.ask(r);
	assert.equal(s1.frames.length, 1); assert.equal(s2.frames.length, 1);
	assert.deepEqual(b.answer(r.requestId, 'decline'), { accepted: true });
	assert.deepEqual(b.answer(r.requestId, 'approve'), { accepted: false });
	assert.equal(await p, 'declined');
	// both screens are told the prompt is gone
	assert.deepEqual(s1.frames.at(-1), { type: 'cancel', requestId: r.requestId, reason: 'answered' });
	assert.deepEqual(s2.frames.at(-1), { type: 'cancel', requestId: r.requestId, reason: 'answered' });
});

test('approval-broker.test.ts: closing the last stream resolves every pending request to no-client', async () => {
	const b = new ApprovalBroker(); const s1 = sink(), s2 = sink();
	const close1 = b.subscribe(s1.send), close2 = b.subscribe(s2.send);
	const p1 = b.ask(req()), p2 = b.ask(req());
	close1();
	assert.equal(b.pendingCount, 2, 'one stream is still open');
	close2();
	assert.equal(await p1, 'no-client'); assert.equal(await p2, 'no-client');
	assert.equal(b.pendingCount, 0);
	close2(); // closing twice is harmless
});

test('approval-broker.test.ts: an aborted caller signal resolves cancelled and sends the subscribers a cancel frame', async () => {
	const b = new ApprovalBroker(); const s = sink(); b.subscribe(s.send);
	const c = new AbortController(); const r = req();
	const p = b.ask(r, c.signal);
	c.abort();
	assert.equal(await p, 'cancelled');
	assert.equal(b.pendingCount, 0);
	assert.deepEqual(s.frames.at(-1), { type: 'cancel', requestId: r.requestId, reason: 'cancelled' });
	// an already aborted signal never raises a prompt
	const before = s.frames.length;
	assert.equal(await b.ask(req(), c.signal), 'cancelled');
	assert.equal(s.frames.length, before);
});

test('approval-broker.test.ts: a late subscriber receives the still-pending requests', async () => {
	const b = new ApprovalBroker(); const first = sink(); b.subscribe(first.send);
	const r = req(); const p = b.ask(r);
	const late = sink(); b.subscribe(late.send);
	await tick();
	assert.deepEqual(late.frames, [{ type: 'request', request: r }]);
	// a stream whose send throws is dropped and never breaks ask()
	const broken = (): void => { throw new Error('socket closed'); };
	b.subscribe(broken);
	const r2 = req(); const p2 = b.ask(r2);
	b.answer(r.requestId, 'approve'); b.answer(r2.requestId, 'approve');
	assert.equal((await p as { decision: string }).decision, 'approve');
	assert.equal((await p2 as { decision: string }).decision, 'approve');
});

test('approval-broker.test.ts: an answer that arrives after the expiry is not accepted', async () => {
	const b = new ApprovalBroker(); const s = sink(); b.subscribe(s.send);
	const r = req(40);
	const p = b.ask(r);
	await new Promise(res => setTimeout(res, 45)); // past expiresAt; the timer callback may not have run yet
	assert.deepEqual(b.answer(r.requestId, 'approve'), { accepted: false });
	assert.equal(await p, 'timed-out');
});
