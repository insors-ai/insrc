/**
 * Epic 86197ac6, Story s2 / t10: the admin worker's daemon.status. When it waits for the
 * store slot's first publish, the queue fields come from a snapshot taken after the wait.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAdminStatus } from '../admin-status.js';
import type { IndexingStatus, StatusSnapshot } from '../status-board.js';

const IDLE: IndexingStatus = { index: { depth: 0, processing: false }, summary: { depth: 0, processing: false }, idle: true };
const BUSY: IndexingStatus = { index: { depth: 3, processing: true }, summary: { depth: 0, processing: false }, idle: false };

test('daemon.status that waited for the first publish reports the queue as it is after the wait, not before it', async () => {
	let published = false;
	const snap = (): StatusSnapshot => ({
		threads: [], clients: [], runs: [],
		indexing: published ? BUSY : IDLE,
		store: published ? { repos: [], publishedAt: 1 } : { publishedAt: 0 },
	});
	setTimeout(() => { published = true; }, 150);
	const status = createAdminStatus({
		snapshot: async () => snap(),
		info: async () => ({ startedAt: Date.now(), modelState: { status: 'ready' }, installedCommit: '' }),
		readRepos: async () => assert.fail('the published list is used'),
		readUnattributed: async () => undefined,
		firstPublishMs: 5_000,
	});
	const answer = await status.daemonStatus() as unknown as { queueDepth: number };
	assert.equal(answer.queueDepth, 3, 'the queue after the publish: indexing started during the wait');
});
