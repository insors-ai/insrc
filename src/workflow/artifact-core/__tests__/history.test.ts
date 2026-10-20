import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { History } from '../history.js';
import { createMemorySidecar } from '../sidecar.js';
import { HistoryEntryError, HistoryReadError } from '../types.js';
import type { Actor, ChangeLogEntry, Feedback } from '../types.js';
import { InvalidArtifactKeyError } from '../../artifact-ids.js';

const ID = 'LLD-0123456789abcdef-s2';
const actor: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const fb = (id: string, over: Partial<Feedback> = {}): Feedback =>
	({ id, text: 'fix this', actor, timestamp: '2026-10-20T10:00:00Z', feedback: [], kind: 'comment', ...over });
const entry = (id: string, over: Partial<ChangeLogEntry> = {}): ChangeLogEntry =>
	({ id, actor, timestamp: '2026-10-20T11:00:00Z', operation: 'update', ...over });

describe('History', () => {
	it('History validates feedback and keeps the anchor through a round trip, and openFeedback closes entries by addresses', async () => {
		const h = new History(createMemorySidecar());
		const anchor = { quote: 'q', prefix: 'pre', suffix: 'suf', section: 'sec', lines: [3, 5] as [number, number] };
		await h.appendFeedback(ID, fb('f1', { anchor }));
		assert.deepEqual((await h.feedback(ID))[0]?.anchor, anchor);

		const bad: [string, Feedback][] = [
			['empty text', fb('b1', { text: '  ' })],
			['unknown kind', fb('b2', { kind: 'shout' as Feedback['kind'] })],
			['quote over 500', fb('b3', { anchor: { quote: 'x'.repeat(501) } })],
			['prefix over 40', fb('b4', { anchor: { prefix: 'x'.repeat(41) } })],
			['suffix over 40', fb('b5', { anchor: { suffix: 'x'.repeat(41) } })],
			['lines out of order', fb('b6', { anchor: { lines: [5, 3] } })],
			['lines not integers', fb('b7', { anchor: { lines: [1.5, 3] } })],
			['no id', fb('')],
			['replies not a list', { ...fb('b12'), feedback: null as never }],
			['a bad reply', fb('b13', { feedback: [fb('r1', { text: '' })] })],
			['a reply that is not an entry', fb('b14', { feedback: [42 as never] })],
			['anchor quote not text', fb('b15', { anchor: { quote: 42 as never } })],
			['anchor not an object', fb('b16', { anchor: 'x' as never })],
			['revision not an integer', fb('b17', { revision: 1.5 })],
			['source without an external id', fb('b18', { source: { system: 'github' } as never })],
			['actor without kind and properties', { ...fb('b10'), actor: { id: 'github:alice' } as never }],
			['actor of an unknown kind', { ...fb('b11'), actor: { ...actor, kind: 'robot' } as never }],
			['lines not a list', fb('b8', { anchor: { lines: 42 as never } })],
			['lines of one', fb('b9', { anchor: { lines: [1] as never } })],
		];
		for (const [why, f] of bad) await assert.rejects(h.appendFeedback(ID, f), HistoryEntryError, why);
		await h.appendFeedback(ID, fb('with-reply', { feedback: [fb('r2')], revision: 2, batchId: 'b', source: { system: 'github', externalId: '9', url: 'u' } }));
		// optional log fields are validated too: addresses as a bare string would silently close nothing
		for (const [why, bad] of [
			['addresses a string', { addresses: 'f1' }], ['addresses a list of numbers', { addresses: [1] }],
			['revision without a hash', { revision: { number: 1 } }], ['status without to', { status: { from: 'a' } }],
			['outcome without a summary', { outcome: { result: 'ok' } }], ['a bad reference', { references: [{}] }],
		] as const) await assert.rejects(h.appendLog(ID, entry('bad', bad as never)), HistoryEntryError, why);
		await new History(createMemorySidecar()).appendLog(ID, entry('good', {
			addresses: ['f1'], revision: { number: 1, contentHash: 'h' }, status: { from: 'draft', to: 'approved' },
			outcome: { result: 'ok', summary: 's' }, references: [{ entityId: 'o/r#1', type: 'github:issue', relation: 'tracked-by' }],
		}));
		// limits are inclusive
		await h.appendFeedback(ID, fb('ok', { anchor: { quote: 'x'.repeat(500), prefix: 'x'.repeat(40), suffix: 'x'.repeat(40), lines: [2, 2] } }));
		await assert.rejects(h.appendFeedback('not-an-id', fb('f9')), InvalidArtifactKeyError);

		// the log: validation and tail
		await assert.rejects(h.appendLog(ID, entry('e0', { operation: 'explode' as ChangeLogEntry['operation'] })), HistoryEntryError);
		await assert.rejects(h.appendLog(ID, { ...entry('e0'), timestamp: '' }), HistoryEntryError);
		assert.equal(await h.logTail(ID), undefined);

		// openness: addressed by listed id, by 'all', and not by an earlier entry
		const h2 = new History(createMemorySidecar());
		await h2.appendFeedback(ID, fb('f1'));
		await h2.appendFeedback(ID, fb('f2'));
		await h2.appendFeedback(ID, fb('f3', { timestamp: '2026-10-20T12:00:00Z' }));
		assert.deepEqual((await h2.openFeedback(ID)).map(f => f.id), ['f1', 'f2', 'f3']);
		await h2.appendLog(ID, entry('e1', { addresses: ['f1'] }));
		assert.deepEqual((await h2.openFeedback(ID)).map(f => f.id), ['f2', 'f3']);
		await h2.appendLog(ID, entry('e2', { addresses: 'all' }));
		assert.deepEqual((await h2.openFeedback(ID)).map(f => f.id), ['f3'], 'f3 came after both entries');
		assert.equal((await h2.logTail(ID))?.id, 'e2');
		assert.equal((await h2.log(ID)).length, 2);
		// another artifact's records never leak in
		assert.deepEqual(await h2.log('LLD-0123456789abcdef-s3'), []);
	});

	it('a failing or malformed reader surfaces as HistoryReadError', async () => {
		const broken = { appendRecord: () => Promise.resolve(), readRecords: () => Promise.reject(new Error('disk')) };
		await assert.rejects(new History(broken).log(ID), HistoryReadError);
		const junk = { appendRecord: () => Promise.resolve(), readRecords: () => Promise.resolve([1]) } as never;
		await assert.rejects(new History(junk).feedback(ID), HistoryReadError);
	});

	it('a corrupt sidecar entry is a HistoryReadError, a same-time entry does not close later feedback, and a repeated append reads once', async () => {
		const ID2 = ID;
		for (const bad of [{}, { id: 'e' }, { id: 'e', actor, timestamp: 't', operation: 'nope' }]) {
			const io = { appendRecord: () => Promise.resolve(), readRecords: () => Promise.resolve([bad]) } as never;
			await assert.rejects(new History(io).log(ID2), HistoryReadError);
		}
		await assert.rejects(new History({ appendRecord: () => Promise.resolve(), readRecords: () => Promise.resolve([{}]) } as never).feedback(ID2), HistoryReadError);

		const h = new History(createMemorySidecar());
		await h.appendFeedback(ID2, fb('f1', { timestamp: '2026-10-20T10:00:00Z' }));
		await h.appendLog(ID2, entry('e1', { timestamp: '2026-10-20T10:00:00Z', addresses: 'all' }));
		assert.deepEqual((await h.openFeedback(ID2)).map(f => f.id), ['f1'], 'an entry at the same instant does not close it');
		await h.appendLog(ID2, entry('e2', { timestamp: '2026-10-20T10:00:01Z', addresses: ['f1'] }));
		assert.deepEqual(await h.openFeedback(ID2), []);

		const dup = new History(createMemorySidecar());
		await dup.appendLog(ID2, entry('e1'));
		await dup.appendLog(ID2, entry('e1'));
		await dup.appendFeedback(ID2, fb('f1'));
		await dup.appendFeedback(ID2, fb('f1'));
		assert.equal((await dup.log(ID2)).length, 1);
		assert.equal((await dup.feedback(ID2)).length, 1);
	});
});
