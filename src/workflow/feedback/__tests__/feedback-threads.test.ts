import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { History } from '../../artifact-core/history.js';
import { FileSidecarStore } from '../../artifact-core/sidecar-store.js';
import type { Actor, ChangeLogEntry, Feedback } from '../../artifact-core/types.js';
import { FeedbackService } from '../feedback-service.js';

const ID = 'LLD-0123456789abcdef-s5';
const person: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const fb = (id: string, timestamp: string, over: Partial<Feedback> = {}): Feedback =>
	({ id, text: `text ${id}`, actor: person, timestamp, feedback: [], kind: 'comment', ...over });
const update = (id: string, timestamp: string, addresses?: ChangeLogEntry['addresses']): ChangeLogEntry =>
	({ id, actor: person, timestamp, operation: 'update', ...(addresses !== undefined ? { addresses } : {}) });

describe('feedback-threads', () => {
	it('FeedbackService.threads nests replies under their root in time-then-id order, returns an orphan reply as an orphan root, never lists a reply on its own as open, and filters to open threads', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'feedback-threads-'));
		try {
			const history = new History(new FileSidecarStore(dir));
			const svc = new FeedbackService({ history });
			// appended out of order: the reader orders them
			await history.appendFeedback(ID, fb('r2', '2026-10-21T10:05:00Z', { inReplyTo: 'a' }));
			await history.appendFeedback(ID, fb('b', '2026-10-21T10:02:00Z'));
			await history.appendFeedback(ID, fb('a', '2026-10-21T10:00:00Z'));
			await history.appendFeedback(ID, fb('r1', '2026-10-21T10:05:00Z', { inReplyTo: 'a' }));
			await history.appendFeedback(ID, fb('rb', '2026-10-21T10:03:00Z', { inReplyTo: 'b' }));
			await history.appendFeedback(ID, fb('lost', '2026-10-21T10:04:00Z', { inReplyTo: 'gone' }));
			await history.appendFeedback(ID, fb('reply-to-reply', '2026-10-21T10:06:00Z', { inReplyTo: 'r1' }));

			let threads = await svc.threads(ID);
			assert.deepEqual(threads.map(t => t.root.id), ['a', 'b', 'lost', 'reply-to-reply'], 'roots and orphans in reader order');
			assert.deepEqual(threads[0]?.replies.map(r => r.id), ['r1', 'r2'], 'replies in time-then-id order (one instant: by id)');
			assert.deepEqual(threads[1]?.replies.map(r => r.id), ['rb']);
			assert.deepEqual(threads.filter(t => t.orphan === true).map(t => t.root.id), ['lost', 'reply-to-reply'], 'a reply with a missing or reply parent is an orphan root, not dropped');
			assert.ok(threads.every(t => !t.addressed));

			// an update addresses one root: its thread is addressed, replies never show on their own
			await history.appendLog(ID, update('u1', '2026-10-21T11:00:00Z', ['a']));
			threads = await svc.threads(ID);
			assert.equal(threads.find(t => t.root.id === 'a')?.addressed, true);
			assert.equal(threads.find(t => t.root.id === 'a')?.addressedBy, 'u1');
			const open = await svc.threads(ID, { open: true });
			assert.deepEqual(open.map(t => t.root.id), ['b', 'lost', 'reply-to-reply']);
			assert.ok(open.every(t => t.replies.every(r => r.inReplyTo === t.root.id)));

			// a reply added after its root was addressed leaves the thread addressed
			await history.appendFeedback(ID, fb('late', '2026-10-21T12:00:00Z', { inReplyTo: 'a' }));
			const a = (await svc.threads(ID)).find(t => t.root.id === 'a');
			assert.equal(a?.addressed, true);
			assert.deepEqual(a?.replies.map(r => r.id), ['r1', 'r2', 'late']);
			assert.ok(!(await svc.threads(ID, { open: true })).some(t => t.root.id === 'a'));

			// 'all' addresses every root before it; one timestamp is ordered by id, so an update that sorts first addresses nothing
			await history.appendLog(ID, update('a0', '2026-10-21T10:02:00Z', 'all'));
			assert.equal((await svc.threads(ID)).find(t => t.root.id === 'b')?.addressed, false, "same instant, update id 'a0' sorts before feedback id 'b'");
			await history.appendLog(ID, update('z9', '2026-10-21T10:02:00Z', 'all'));
			assert.equal((await svc.threads(ID)).find(t => t.root.id === 'b')?.addressed, true, "same instant, update id 'z9' sorts after feedback id 'b'");
		} finally { rmSync(dir, { recursive: true, force: true }); }
	});
});
