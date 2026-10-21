import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { History } from '../history.js';
import { LifecycleService } from '../lifecycle-service.js';
import { HistoryEntryError } from '../types.js';
import type { Actor, Feedback } from '../types.js';
import { H, alice, artifact, bob } from './store-kit.js';
import { durableKit } from './durable-kit.js';
import type { DurableKit } from './durable-kit.js';
import { stubEvidence } from './lifecycle-kit.js';

const PLAN = `PLAN-${H}-s5`;
const reviewer: Actor = { id: 'github:carol', kind: 'person', properties: {} };
// before the kit's clock starts (2026-10-20T12:00:00Z), so every revision is later than the feedback it addresses
const T = '2026-10-20T11:00:00.000Z';
const fb = (id: string, over: Partial<Feedback> = {}): Feedback => ({ id, text: `feedback ${id}`, actor: reviewer, timestamp: T, feedback: [], kind: 'revision-request', ...over });
/** A moment just after the latest log entry, so the feedback is made after the revision before it and before the next one. */

const body = (text: string) => ({ body: { text }, citations: [] });

async function seeded(): Promise<{ k: DurableKit; svc: LifecycleService; history: History }> {
	const k = durableKit();
	await k.store.write(artifact(`DEF-${H}`), alice);
	await k.store.write(artifact(PLAN), alice);
	return { k, svc: new LifecycleService({ store: k.store, evidence: stubEvidence([]) }), history: new History(k.sidecar) };
}
const logOf = async (k: DurableKit) => (await k.store.readWithHistory(PLAN)).changeLog;
/** A moment just after the latest log entry, so the feedback is made after the revision before it and before the next one. */
const after = async (k: DurableKit): Promise<string> => new Date(Date.parse((await logOf(k)).at(-1)!.timestamp) + 1).toISOString();
const openIds = async (h: History) => (await h.openFeedback(PLAN)).map(f => f.id).sort();

describe('addresses-rule', () => {
	it("ArtifactStore.write stamps addresses 'all' on a revision that moves the revision number, honours a list, refuses ids that are not roots or are already addressed, and addresses nothing on an identical rewrite or a lifecycle operation", async () => {
		const { k, svc, history } = await seeded();
		try {
			for (const id of ['f1', 'f2']) await history.appendFeedback(PLAN, fb(id));
			await history.appendFeedback(PLAN, fb('r1', { inReplyTo: 'f1' }));
			assert.deepEqual(await openIds(history), ['f1', 'f2', 'r1']);

			// a revision with no addresses addresses all of it
			await svc.updateContent(PLAN, bob, body('first revision'));
			assert.equal((await logOf(k)).at(-1)?.addresses, 'all');
			assert.deepEqual(await openIds(history), []);

			// a list addresses only those roots
			const t2 = await after(k);
			for (const id of ['g1', 'g2', 'g3']) await history.appendFeedback(PLAN, fb(id, { timestamp: t2 }));
			await history.appendFeedback(PLAN, fb('r2', { inReplyTo: 'g2', timestamp: t2 }));
			await svc.updateContent(PLAN, bob, body('second'), { addresses: ['g1'] });
			assert.deepEqual((await logOf(k)).at(-1)?.addresses, ['g1']);
			assert.deepEqual(await openIds(history), ['g2', 'g3', 'r2']);

			// unknown ids, a reply id and an id an earlier revision addressed are refused, and nothing is staged
			const before = (await logOf(k)).length;
			for (const bad of [['nope'], ['r2'], ['g1'], ['g2', 'nope']]) {
				await assert.rejects(svc.updateContent(PLAN, bob, body(`bad ${bad.join()}`), { addresses: bad }), HistoryEntryError, bad.join());
			}
			assert.equal((await logOf(k)).length, before);
			assert.equal(await k.journal.pending(PLAN), undefined);
			assert.equal((await k.store.read(PLAN)).payload.body['text' as never], 'second');

			// an empty list is valid and addresses nothing
			await svc.updateContent(PLAN, bob, body('three'), { addresses: [] });
			assert.deepEqual((await logOf(k)).at(-1)?.addresses, []);
			assert.deepEqual(await openIds(history), ['g2', 'g3', 'r2']);

			// an identical rewrite logs nothing at all
			const n = (await logOf(k)).length;
			await svc.updateContent(PLAN, bob, body('three'));
			assert.equal((await logOf(k)).length, n);

			// a lifecycle operation addresses nothing, so it does not close feedback
			await svc.apply(PLAN, 'approve', bob);
			const approve = (await logOf(k)).at(-1);
			assert.equal(approve?.operation, 'approve');
			assert.equal(approve?.addresses, undefined);
			assert.deepEqual(await openIds(history), ['g2', 'g3', 'r2']);
		} finally { k.done(); }
	});
});
