import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { History } from '../../artifact-core/history.js';
import { HistoryEntryError } from '../../artifact-core/types.js';
import type { Actor } from '../../artifact-core/types.js';
import { H, alice, artifact, bob } from '../../artifact-core/__tests__/store-kit.js';
import { durableKit } from '../../artifact-core/__tests__/durable-kit.js';
import { FeedbackService } from '../feedback-service.js';

const PLAN = `PLAN-${H}-s5`;
const LLD = `LLD-${H}-s5`;

async function seeded() {
	const k = durableKit();
	await k.store.write(artifact(`DEF-${H}`), alice);
	await k.store.write(artifact(PLAN), alice);
	await k.store.write(artifact(LLD), alice);
	const history = new History(k.sidecar);
	const svc = new FeedbackService({ history, store: k.store, now: () => new Date('2026-10-21T09:00:00.000Z') });
	return { k, history, svc };
}

describe('feedback-service', () => {
	it('FeedbackService.add stores one root entry with the author, a minted id and time and the head\'s revision, defaults the kind to comment, and refuses blank text, a non-namespaced actor and a malformed anchor', async () => {
		const { k, history, svc } = await seeded();
		try {
			const f = await svc.add(PLAN, { text: 'tighten this' }, bob);
			assert.match(f.id, /^[0-9a-f]{32}$/);
			assert.equal(f.kind, 'comment');
			assert.equal(f.actor.id, 'github:bob');
			assert.equal(f.timestamp, '2026-10-21T09:00:00.000Z');
			assert.equal(f.revision, (await k.store.read(PLAN)).lifecycle.revision.number);
			assert.deepEqual(f.feedback, []);
			assert.deepEqual(await history.feedback(PLAN), [f]);

			await assert.rejects(svc.add(PLAN, { text: '   ' }, bob), HistoryEntryError);
			for (const id of ['bob', 'GitHub:Bob', 'github:']) {
				await assert.rejects(svc.add(PLAN, { text: 'x' }, { ...bob, id } as Actor), HistoryEntryError, id);
			}
			await assert.rejects(svc.add(PLAN, { text: 'x', anchor: { lines: [5, 2] } as never }, bob), HistoryEntryError);
			await assert.rejects(svc.add(PLAN, { text: 'x', anchor: 'nope' as never }, bob), HistoryEntryError);
			await assert.rejects(svc.add(`PLAN-${H}-s9`, { text: 'x' }, bob), /not found|ArtifactNotFound/i);
			assert.equal((await history.feedback(PLAN)).length, 1, 'no refusal stored a line');
		} finally { k.done(); }
	});

	it('FeedbackService.add stores a reply as its own line with inReplyTo, refuses a missing parent, a parent on another artifact and a reply to a reply, and a repeated caller id returns the stored entry or is refused when the content differs', async () => {
		const { k, history, svc } = await seeded();
		try {
			const root = await svc.add(PLAN, { text: 'root', kind: 'revision-request' }, alice);
			const reply = await svc.add(PLAN, { text: 'reply', inReplyTo: root.id }, bob);
			assert.equal(reply.inReplyTo, root.id);
			assert.equal((await history.feedback(PLAN)).length, 2);

			await assert.rejects(svc.add(PLAN, { text: 'r', inReplyTo: 'missing' }, bob), HistoryEntryError);
			const other = await svc.add(LLD, { text: 'other root' }, alice);
			await assert.rejects(svc.add(PLAN, { text: 'r', inReplyTo: other.id }, bob), HistoryEntryError, 'a parent on another artifact');
			await assert.rejects(svc.add(PLAN, { text: 'r', inReplyTo: reply.id }, bob), HistoryEntryError, 'a reply to a reply');

			// a repeated caller id with the same fields returns the stored entry unchanged and appends nothing
			const later = new FeedbackService({ history, store: k.store, now: () => new Date('2027-01-01T00:00:00.000Z') });
			const first = await later.add(PLAN, { id: 'key-1', text: 'once', batchId: 'b1', anchor: { section: 'Design' } }, bob);
			const again = await later.add(PLAN, { id: 'key-1', text: 'once', batchId: 'b1', anchor: { section: 'Design' } }, bob);
			assert.deepEqual(again, first);
			assert.equal(again.timestamp, '2027-01-01T00:00:00.000Z');
			// a differing field in any compared position is refused
			for (const [what, input, who] of [
				['text', { text: 'twice', batchId: 'b1', anchor: { section: 'Design' } }, bob],
				['kind', { text: 'once', kind: 'suggestion', batchId: 'b1', anchor: { section: 'Design' } }, bob],
				['anchor', { text: 'once', batchId: 'b1', anchor: { section: 'Other' } }, bob],
				['batchId', { text: 'once', batchId: 'b2', anchor: { section: 'Design' } }, bob],
				['inReplyTo', { text: 'once', batchId: 'b1', anchor: { section: 'Design' }, inReplyTo: root.id }, bob],
				['actor', { text: 'once', batchId: 'b1', anchor: { section: 'Design' } }, alice],
			] as const) {
				await assert.rejects(later.add(PLAN, { id: 'key-1', ...input } as never, who), HistoryEntryError, what);
			}
			assert.equal((await history.feedback(PLAN)).filter(f => f.id === 'key-1').length, 1);

			// two concurrent adds with one id leave exactly one line
			const [a, b] = await Promise.all([
				svc.add(PLAN, { id: 'race', text: 'same' }, bob),
				svc.add(PLAN, { id: 'race', text: 'same' }, bob),
			]);
			assert.deepEqual(a, b);
			assert.equal((await history.feedback(PLAN)).filter(f => f.id === 'race').length, 1);
		} finally { k.done(); }
	});
});
