/**
 * daemon.status advertises what the daemon can do (Story
 * 65b643840a294422/s1, task t15): the shared status builder carries
 * `features`, and both the threaded admin handler and the single-threaded
 * handler return it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { buildHandlerRuntime } from '../handler-runtime.js';
import { buildDaemonStatus, DAEMON_FEATURES } from '../status.js';
import { createAdminStatus } from '../threads/admin-status.js';
import type { IndexingStatus, StatusSnapshot } from '../threads/status-board.js';
import type { DaemonStatus } from '../../shared/types.js';

const IDLE: IndexingStatus = { index: { depth: 0, processing: false }, summary: { depth: 0, processing: false }, idle: true };

test('buildDaemonStatus includes analyze-request and both the threaded admin handler and the single-threaded handler return it', async () => {
	// the shared builder
	const built = await buildDaemonStatus({
		uptimeSec: 1, listRepos: async () => [], queueDepth: 0, modelState: { status: 'ready' }, installedCommit: 'abc',
	});
	assert.deepEqual(built.features, ['analyze-request']);
	assert.equal(DAEMON_FEATURES.includes('analyze-request'), true);

	// the threaded daemon's admin handler
	const snapshot = (): StatusSnapshot => ({ threads: [], clients: [], runs: [], indexing: IDLE, store: { repos: [], publishedAt: 1 } });
	const threaded = await createAdminStatus({
		snapshot: async () => snapshot(),
		info: async () => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: 'abc' }),
		readRepos: async () => [], readUnattributed: async () => undefined,
	}).daemonStatus() as DaemonStatus;
	assert.deepEqual(threaded.features, ['analyze-request']);

	// the single-threaded daemon's handler, through the real handler table
	const dir = mkdtempSync(join(tmpdir(), 'daemon-status-features-'));
	await closeGraphStore();
	setGraphStorePath(join(dir, 'graph.lmdb'));
	try {
		const queue = { depth: 0, laneStatus: () => ({ index: { depth: 0, running: false }, summary: { depth: 0, running: false } }) };
		const indexer = { summarySweepProgress: () => undefined };
		const runtime = buildHandlerRuntime({
			db: null, configStore: {} as never, queue: queue as never, indexer: indexer as never, startedAt: Date.now(),
			shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
		});
		const single = await runtime.rpcHandlers['daemon.status']!({}, undefined as never) as DaemonStatus;
		assert.deepEqual(single.features, ['analyze-request']);
	} finally {
		await closeGraphStore();
		rmSync(dir, { recursive: true, force: true });
	}

	// a status from a daemon that predates the field has none: a consumer reads that as no feature
	const old: DaemonStatus = { uptime: 1, repos: [], queueDepth: 0, embeddingsPending: 0, installedCommit: '' };
	assert.equal(old.features?.includes('analyze-request') ?? false, false);
});
