import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkIntegrity, contentHash } from '../lifecycle.js';
import type { ContentView } from '../lifecycle.js';
import type { Actor, ChangeLogEntry } from '../types.js';

const alice: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const payload = { body: { a: 1 }, citations: [] };
const good = contentHash('d', payload);

const head = (number: number): ContentView => ({ description: 'd', payload, lifecycle: { status: 'draft', revision: { number, contentHash: good, at: '', by: alice }, signoffs: [] } });
const content = (id: string, number: number, hash = good): ChangeLogEntry => ({ id, actor: alice, timestamp: 't', operation: 'update', revision: { number, contentHash: hash } });
/** A build round or a feedback post receipt: an update entry that carries no revision. */
const receipt = (id: string, kind: string): ChangeLogEntry => ({ id, actor: alice, timestamp: 't', operation: 'update', outcome: { result: 'posted', summary: 's', data: { kind } } });

describe('integrity-receipts', () => {
	it('a revision-less receipt or build round after the last content entry does not make a head that differs from that entry pass the integrity check', () => {
		const log = [content('a', 1), content('b', 2), receipt('r1', 'feedback-post'), receipt('r2', 'build-round')];

		// a head that matches the last content entry passes, with the receipts after it
		assert.deepEqual(checkIntegrity(head(2), log), { ok: true });
		assert.deepEqual(checkIntegrity(head(2), log.slice(0, 2)), { ok: true });

		// a head ahead of, behind or different from that entry is still caught: the receipts do not stand in for it
		assert.deepEqual(checkIntegrity(head(3), log), { ok: false, reason: 'head-ahead-of-log' });
		assert.deepEqual(checkIntegrity(head(1), log), { ok: false, reason: 'log-ahead-of-head' });
		const differing = [content('a', 1), content('b', 2, 'a'.repeat(64)), receipt('r1', 'feedback-post')];
		assert.deepEqual(checkIntegrity(head(2), differing), { ok: false, reason: 'hash-mismatch' });

		// a log of receipts only is no history; an empty log is none
		assert.deepEqual(checkIntegrity(head(2), [receipt('r1', 'build-round')]), { ok: true });
		assert.deepEqual(checkIntegrity(head(2), []), { ok: true });
		assert.deepEqual(checkIntegrity(head(2), undefined), { ok: true });

		// a single entry still works as before: the caller already picked it
		assert.deepEqual(checkIntegrity(head(3), content('b', 2)), { ok: false, reason: 'head-ahead-of-log' });
	});
});
