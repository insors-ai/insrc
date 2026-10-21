import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { History } from '../history.js';
import { createMemorySidecar } from '../sidecar.js';
import { HistoryEntryError } from '../types.js';
import type { Actor, Feedback } from '../types.js';

const ID = 'LLD-0123456789abcdef-s5';
const actor: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const fb = (id: string, over: Partial<Feedback> = {}): Feedback =>
	({ id, text: 'a comment', actor, timestamp: '2026-10-21T10:00:00.000Z', feedback: [], kind: 'comment', ...over });

describe('feedback-reply-shape', () => {
	it('History.validateFeedback accepts inReplyTo as a non-empty string other than its own id and refuses a reply that carries nested replies', async () => {
		const h = new History(createMemorySidecar());
		await h.appendFeedback(ID, fb('root'));
		await h.appendFeedback(ID, fb('reply', { inReplyTo: 'root' }));
		const read = await h.feedback(ID);
		assert.equal(read.find(f => f.id === 'reply')?.inReplyTo, 'root', 'the field reads back');
		assert.equal(read.find(f => f.id === 'root')?.inReplyTo, undefined, 'an entry without it is a root');

		for (const bad of ['', '   ', 'self', 7 as unknown as string]) {
			await assert.rejects(h.appendFeedback(ID, fb('self', { inReplyTo: bad })), HistoryEntryError, JSON.stringify(bad));
		}
		// a reply carries no replies of its own
		await assert.rejects(h.appendFeedback(ID, fb('r2', { inReplyTo: 'root', feedback: [fb('nested')] })), HistoryEntryError);
		// an entry without inReplyTo validates as before, nested replies included
		await h.appendFeedback(ID, fb('r3', { feedback: [fb('nested-ok')] }));
		assert.equal((await h.feedback(ID)).length, 3);
	});
});
