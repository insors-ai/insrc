import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionEvidence } from '../../artifact-core/completion-evidence.js';
import { LifecycleService } from '../../artifact-core/lifecycle-service.js';
import { feedbackMarker, syncUnitComments } from '../comment-sync.js';
import { TASK, alice, comment, fakeTracker, syncKit } from './comment-sync-kit.js';
import type { SyncKit } from './comment-sync-kit.js';

const receiptsOf = async (s: SyncKit) => (await s.history.log(TASK)).filter(e => (e.outcome?.data as { kind?: string } | undefined)?.kind === 'feedback-post');

describe('comment-sync-outbound', () => {
	it('feedback entered here is posted once and its receipt is written, a post whose receipt was lost is found by its marker and not posted again, and failures leave the call repeatable', async () => {
		const s = await syncKit();
		try {
			const t = fakeTracker();
			t.comments = [comment(1, 'a human comment from the tracker')];
			const root = await s.feedback.add(TASK, { text: 'please add a test for the empty case', kind: 'suggestion' }, alice);
			const reply = await s.feedback.add(TASK, { text: 'agreed, I will', inReplyTo: root.id }, alice);
			const revision = (await s.k.store.read(TASK)).lifecycle.revision.number;

			// the entries entered here are posted once each, in order, and the tracker's own comment is not posted back
			const first = await syncUnitComments(s.task, t.port, s.deps);
			assert.deepEqual([first.recorded, first.posted, first.reconciled, first.failed], [['1'], [root.id, reply.id], [], []]);
			assert.equal(t.posts.length, 2);
			assert.equal(t.posts[0]?.split('\n')[0], feedbackMarker(TASK, root.id));
			assert.match(t.posts[0]!, /\(suggestion\)[\s\S]*please add a test for the empty case/);
			assert.match(t.posts[1]!, new RegExp(`in reply to ${root.id}`), 'a reply names the entry it replies to');
			assert.equal(t.posts.some(p => p.includes('a human comment from the tracker')), false);

			// each post has its receipt: a revision-less log entry naming the feedback id, the comment id and the issue
			const receipts = await receiptsOf(s);
			assert.deepEqual(receipts.map(r => (r.outcome?.data as { feedbackId: string }).feedbackId), [root.id, reply.id]);
			assert.ok(receipts.every(r => r.revision === undefined && r.operation === 'update' && r.outcome?.result === 'posted'));
			assert.deepEqual((receipts[0]?.outcome?.data as { issue: string; externalId: string }).issue, 'acme/demo#7');
			assert.match((receipts[0]?.outcome?.data as { externalId: string }).externalId, /^\d+$/);

			// a receipt moves no revision and the integrity check still holds
			assert.equal((await s.k.store.read(TASK)).lifecycle.revision.number, revision);
			const service = new LifecycleService({ store: s.k.store, evidence: createCompletionEvidence(s.k.repo) });
			assert.equal((await service.inspect(TASK))?.integrity.ok, true);

			// a second sync posts nothing, records nothing, and does not read its own posts back as feedback
			const second = await syncUnitComments(s.task, t.port, s.deps);
			assert.deepEqual([second.recorded, second.posted, second.reconciled, second.failed], [[], [], [], []]);
			assert.equal(second.framework.length, 2);
			assert.equal(t.posts.length, 2);
			assert.equal((await s.history.feedback(TASK)).length, 3);
		} finally { s.done(); }
	});

	it('a post whose receipt was lost, or whose answer was lost, is found by its marker and not posted again', async () => {
		const s = await syncKit();
		try {
			const t = fakeTracker();
			const lost = await s.feedback.add(TASK, { text: 'receipt will be lost' }, alice);

			// the post reaches the tracker, but the receipt is not written (the process stopped, the append failed)
			let failReceipt = true;
			const flakyStore = Object.assign(Object.create(s.k.store), {
				exclusive: <T>(id: string, run: () => Promise<T>): Promise<T> => failReceipt ? Promise.reject(new Error('the append failed')) : s.k.store.exclusive(id, run),
			}) as typeof s.k.store;
			const first = await syncUnitComments(s.task, t.port, { ...s.deps, store: flakyStore });
			assert.deepEqual([first.posted, first.failed.map(f => f.step)], [[], ['receipt']]);
			assert.equal(t.posts.length, 1, 'the comment is on the issue');
			assert.equal((await receiptsOf(s)).length, 0);

			// the next sync finds the comment by its marker, writes the receipt and posts nothing
			failReceipt = false;
			const second = await syncUnitComments(s.task, t.port, s.deps);
			assert.deepEqual([second.posted, second.reconciled, second.failed], [[], [lost.id], []]);
			assert.equal(t.posts.length, 1, 'no second post');
			assert.equal((await receiptsOf(s)).length, 1);

			// the post reaches the tracker but its answer is lost: reported, then found by its marker
			const answer = await s.feedback.add(TASK, { text: 'the answer will be lost' }, alice);
			t.loseAnswer = true;
			const third = await syncUnitComments(s.task, t.port, s.deps);
			assert.deepEqual([third.posted, third.failed.map(f => [f.step, f.id])], [[], [['post', answer.id]]]);
			t.loseAnswer = false;
			const fourth = await syncUnitComments(s.task, t.port, s.deps);
			assert.deepEqual([fourth.posted, fourth.reconciled, fourth.failed], [[], [answer.id], []]);
			assert.equal(t.posts.length, 2);
		} finally { s.done(); }
	});

	it('a failed post writes no receipt and is retried, and an unreadable comment list posts nothing', async () => {
		const s = await syncKit();
		try {
			const t = fakeTracker();
			const f = await s.feedback.add(TASK, { text: 'goes out later' }, alice);

			// the post fails before it reaches the tracker: no receipt, the call can be repeated
			t.failPost = true;
			const failed = await syncUnitComments(s.task, t.port, s.deps);
			assert.deepEqual([failed.posted, failed.failed.map(x => [x.step, x.id])], [[], [['post', f.id]]]);
			assert.equal((await receiptsOf(s)).length, 0);
			t.failPost = false;
			assert.deepEqual((await syncUnitComments(s.task, t.port, s.deps)).posted, [f.id]);

			// the comment list cannot be read: nothing is posted, an uncertain post is never retried blind
			const g = await s.feedback.add(TASK, { text: 'must wait for a readable issue' }, alice);
			t.failList = true;
			const blind = await syncUnitComments(s.task, t.port, s.deps);
			assert.deepEqual(blind.posted, []);
			assert.ok(blind.failed.some(x => x.step === 'reconcile'));
			assert.equal(t.posts.length, 1);
			t.failList = false;
			assert.deepEqual((await syncUnitComments(s.task, t.port, s.deps)).posted, [g.id]);
			assert.equal(t.posts.length, 2);
		} finally { s.done(); }
	});
});

describe('comment sync concurrency', () => {
	it('two syncs of one artifact at once post a feedback entry once', async () => {
		const s = await syncKit();
		try {
			const t = fakeTracker();
			await s.feedback.add(TASK, { id: 'f1', text: 'looks good', kind: 'comment' }, alice);
			await Promise.all([syncUnitComments(s.task, t.port, s.deps), syncUnitComments(s.task, t.port, s.deps)]);
			assert.equal(t.posts.length, 1);
		} finally { s.done(); }
	});
});
