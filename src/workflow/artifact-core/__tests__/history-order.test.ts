import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { History } from '../history.js';
import { createMemorySidecar } from '../sidecar.js';
import type { Actor, ChangeLogEntry, Feedback } from '../types.js';

const ID = 'LLD-0123456789abcdef-s1';
const actor: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const T = '2026-10-20T10:00:00.000Z';

const fb = (id: string): Feedback => ({ id, text: 'fix this', actor, timestamp: T, feedback: [], kind: 'comment' });
const entry = (id: string, addresses: string[]): ChangeLogEntry => ({ id, actor, timestamp: T, operation: 'update', addresses });

describe('history-order', () => {
	it('openFeedback orders a feedback entry and a log entry with the same timestamp by the shared rule', async () => {
		for (const feedbackFirst of [true, false]) {
			// A log entry with the same timestamp addresses the feedback only when its id sorts after the feedback's id.
			const h = new History(createMemorySidecar());
			const writeFeedback = async (): Promise<void> => { await h.appendFeedback(ID, fb('f-b')); };
			const writeLog = async (): Promise<void> => {
				await h.appendLog(ID, entry('g-c', ['f-b']));        // after f-b: closes it
				await h.appendLog(ID, entry('a-a', ['f-b']));        // before f-b: does not
			};
			if (feedbackFirst) { await writeFeedback(); await writeLog(); } else { await writeLog(); await writeFeedback(); }
			assert.deepEqual(await h.openFeedback(ID), [], `closed by the entry that sorts after it (feedback first: ${feedbackFirst})`);

			const h2 = new History(createMemorySidecar());
			await h2.appendFeedback(ID, fb('f-b'));
			await h2.appendLog(ID, entry('a-a', ['f-b']));
			assert.deepEqual((await h2.openFeedback(ID)).map(f => f.id), ['f-b'], 'an entry that sorts before it does not close it');
		}
	});

	it('openFeedback compares instants, not their spelling: the same second written with and without milliseconds', async () => {
		const h = new History(createMemorySidecar());
		await h.appendFeedback(ID, { ...fb('f1'), timestamp: '2026-10-20T10:00:00Z' });
		// half a second later, written with milliseconds: after the feedback although '.' sorts before 'Z'
		await h.appendLog(ID, { ...entry('e1', ['f1']), timestamp: '2026-10-20T10:00:00.500Z' });
		assert.deepEqual(await h.openFeedback(ID), []);
		const earlier = new History(createMemorySidecar());
		await earlier.appendFeedback(ID, { ...fb('f1'), timestamp: '2026-10-20T10:00:01Z' });
		await earlier.appendLog(ID, { ...entry('e1', ['f1']), timestamp: '2026-10-20T10:00:00.500Z' });
		assert.deepEqual((await earlier.openFeedback(ID)).map(f => f.id), ['f1']);
	});
});
