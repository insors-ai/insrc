import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { History } from '../../artifact-core/history.js';
import { HistoryEntryError } from '../../artifact-core/types.js';
import { H, alice, artifact, bob } from '../../artifact-core/__tests__/store-kit.js';
import { durableKit } from '../../artifact-core/__tests__/durable-kit.js';
import { FeedbackService } from '../feedback-service.js';

const TASK = `TASK-${H}-s1-t1`;
const SOURCE = { system: 'github', externalId: '4711', url: 'https://github.com/acme/demo/issues/7#issuecomment-4711' };

describe('feedback-source', () => {
	it('FeedbackService.add stores a source and a repeat of the same id with the same source appends nothing', async () => {
		const k = durableKit();
		try {
			await k.store.write(artifact(`DEF-${H}`), alice);
			await k.store.write(artifact(TASK), alice);
			const history = new History(k.sidecar);
			const svc = new FeedbackService({ history, store: k.store, now: () => new Date('2026-10-22T09:00:00.000Z') });

			// a source is stored and read back
			const first = await svc.add(TASK, { id: 'tracker:4711', text: 'please rename it', kind: 'suggestion', source: SOURCE }, bob);
			assert.deepEqual(first.source, SOURCE);
			assert.deepEqual((await history.feedback(TASK)).map(f => f.source), [SOURCE]);

			// the same id with the same fields and source is a repeat: the stored entry comes back and nothing is appended
			const again = await svc.add(TASK, { id: 'tracker:4711', text: 'please rename it', kind: 'suggestion', source: { ...SOURCE } }, bob);
			assert.deepEqual(again, first);
			assert.equal((await history.feedback(TASK)).length, 1);

			// the same id with a different source, or none, is refused
			await assert.rejects(svc.add(TASK, { id: 'tracker:4711', text: 'please rename it', kind: 'suggestion', source: { ...SOURCE, url: 'https://elsewhere' } }, bob), HistoryEntryError);
			await assert.rejects(svc.add(TASK, { id: 'tracker:4711', text: 'please rename it', kind: 'suggestion' }, bob), /already used with different content/);

			// a source needs a system and an external id
			await assert.rejects(svc.add(TASK, { text: 'x', source: { system: '', externalId: '1' } }, bob), /source needs a system and an external id/);
			await assert.rejects(svc.add(TASK, { text: 'x', source: { system: 'github', externalId: ' ' } }, bob), HistoryEntryError);

			// an entry with no source is stored exactly as before: no source key
			const plain = await svc.add(TASK, { text: 'plain' }, bob);
			assert.equal('source' in plain, false);
			assert.equal((await history.feedback(TASK)).length, 2);
		} finally { k.done(); }
	});
});
