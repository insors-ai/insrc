import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkHeadIntegrity, checkIntegrity, contentHash } from '../lifecycle.js';
import type { ContentView } from '../lifecycle.js';
import type { Actor, ChangeLogEntry } from '../types.js';

const alice: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const payload = { body: { a: 1 }, citations: [] };
const good = contentHash('d', payload);

const head = (number: number, stored: string): ContentView => ({
	description: 'd', payload,
	lifecycle: { status: 'draft', revision: { number, contentHash: stored, at: '', by: alice }, signoffs: [] },
});
const entry = (number: number | undefined, hash = good): ChangeLogEntry => ({
	id: 'e', actor: alice, timestamp: 't', operation: 'update',
	...(number !== undefined ? { revision: { number, contentHash: hash } } : {}),
});

describe('integrity', () => {
	it('checkHeadIntegrity and checkIntegrity report every reason and treat unhashed and unlogged heads as ok', () => {
		assert.deepEqual(checkHeadIntegrity(head(1, good)), { ok: true });
		assert.deepEqual(checkHeadIntegrity(head(1, '')), { ok: true });
		assert.deepEqual(checkHeadIntegrity(head(1, 'f'.repeat(64))), { ok: false, reason: 'hash-mismatch' });

		assert.deepEqual(checkIntegrity(head(2, good), entry(2)), { ok: true });
		assert.deepEqual(checkIntegrity(head(2, good), undefined), { ok: true });
		assert.deepEqual(checkIntegrity(head(2, good), entry(undefined)), { ok: true });
		assert.deepEqual(checkIntegrity(head(2, ''), entry(5)), { ok: true });
		assert.deepEqual(checkIntegrity(head(3, good), entry(2)), { ok: false, reason: 'head-ahead-of-log' });
		assert.deepEqual(checkIntegrity(head(2, good), entry(3)), { ok: false, reason: 'log-ahead-of-head' });
		assert.deepEqual(checkIntegrity(head(2, good), entry(2, 'a'.repeat(64))), { ok: false, reason: 'hash-mismatch' });
		assert.deepEqual(checkIntegrity(head(2, good), entry(2, '')), { ok: true });
		assert.deepEqual(checkIntegrity(head(2, 'f'.repeat(64)), entry(2)), { ok: false, reason: 'hash-mismatch' });
	});
});
