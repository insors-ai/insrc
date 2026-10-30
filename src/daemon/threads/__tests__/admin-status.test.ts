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

const RUN = { model: 'm', frames: [], startedAt: 1 };
const statusOver = (snapshot: () => StatusSnapshot, now: () => number) => createAdminStatus({
	snapshot: async () => snapshot(),
	info: async () => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: 'abc' }),
	readRepos: async () => [],
	readUnattributed: async () => undefined,
	now,
});

test('admin status: threads carries role, cls, session, busy, method, elapsedMs, queued and activeRuns from one board snapshot; other fields unchanged; absent when no thread is published', async () => {
	const base: StatusSnapshot = { threads: [], clients: [], runs: [], indexing: IDLE, store: { repos: [], publishedAt: 1 } };
	const withThreads: StatusSnapshot = {
		...base,
		threads: [
			{ threadId: 3, cls: 'admin', role: 'admin', busy: false, queued: 0 },
			{ threadId: 9, cls: 'session', role: 'session', session: { label: 'mcp', pid: 77 }, busy: true, method: 'step.call', since: 1_000, queued: 2 },
		],
		runs: [{ ...RUN, runId: 'r1', status: 'running', ownerThreadId: 9 }],
	};
	let snap = base;
	const status = statusOver(() => snap, () => 61_000);
	const without = await status.daemonStatus();
	assert.equal('threads' in without, false, 'no threads field when none is published');
	snap = withThreads;
	const withField = await status.daemonStatus();
	const { threads, ...rest } = withField;
	assert.deepEqual(rest, without, 'every other field equals the answer without threads');
	assert.deepEqual(threads, [
		{ threadId: 3, role: 'admin', cls: 'admin', busy: false, queued: 0, activeRuns: 0 },
		{ threadId: 9, role: 'session', cls: 'session', session: { label: 'mcp', pid: 77 }, busy: true, method: 'step.call', elapsedMs: 60_000, queued: 2, activeRuns: 1 },
	]);
});

test("admin status: activeRuns counts only that thread's running runs, and the document-summary thread is busy while the summary lane processes", async () => {
	let summaryProcessing = false;
	const snap = (): StatusSnapshot => ({
		clients: [], store: { repos: [], publishedAt: 1 },
		indexing: { index: { depth: 0, processing: false }, summary: { depth: 1, processing: summaryProcessing }, idle: !summaryProcessing },
		threads: [
			{ threadId: 5, cls: 'session', role: 'session', session: { label: 'mcp', pid: 1 }, busy: false, queued: 0 },
			{ threadId: 6, cls: 'session', role: 'session', session: { label: 'mcp', pid: 2 }, busy: false, queued: 0 },
			// The summary worker serves no requests: the router never marks it busy.
			{ threadId: 8, cls: 'indexing', role: 'document-summary', busy: false, queued: 0 },
		],
		runs: [
			{ ...RUN, runId: 'a', status: 'running', ownerThreadId: 5 },
			{ ...RUN, runId: 'b', status: 'running', ownerThreadId: 5 },
			{ ...RUN, runId: 'c', status: 'done', ownerThreadId: 5 },
			{ ...RUN, runId: 'd', status: 'error', ownerThreadId: 6 },
			{ ...RUN, runId: 'e', status: 'running', ownerThreadId: 6 },
		],
	});
	const status = statusOver(snap, () => 10);
	const byId = async () => new Map((await status.threads()).map(t => [t.threadId, t]));
	let views = await byId();
	assert.equal(views.get(5)?.activeRuns, 2, 'two running, one done: only the running ones');
	assert.equal(views.get(6)?.activeRuns, 1, "only its own running run, not another thread's");
	assert.deepEqual(views.get(8), { threadId: 8, role: 'document-summary', cls: undefined, busy: false, queued: 0, activeRuns: 0 });
	summaryProcessing = true;
	views = await byId();
	assert.equal(views.get(8)?.busy, true, 'busy while the summary lane processes');
	assert.equal(views.get(5)?.busy, false, 'other threads unaffected');
});

test('admin handlers: daemon.debug-status keeps clients as before and adds threads', async () => {
	const { adminWorkerHandlers } = await import('../../admin-handlers.js');
	const clients = [{ id: 1, label: 'mcp', connectedAt: 5, pid: 42, lastMethod: 'daemon.status' }];
	let threads: { threadId: number; role: 'admin'; cls: 'admin'; busy: boolean; queued: number; activeRuns: number }[] = [];
	const handlers = adminWorkerHandlers({
		shutdown: () => {}, status: async () => assert.fail('not asked'), repoList: async () => [],
		clients: async () => clients, threads: async () => threads,
	});
	assert.deepEqual(await handlers['daemon.debug-status']!(undefined), { clients }, 'no threads published: the answer is exactly as before');
	threads = [{ threadId: 3, role: 'admin', cls: 'admin', busy: false, queued: 0, activeRuns: 0 }];
	assert.deepEqual(await handlers['daemon.debug-status']!(undefined), { clients, threads }, 'clients unchanged, threads added');
});

test('admin handlers: the worker table serves mcp.status (method-class routes it to the admin worker)', async () => {
	const { adminWorkerHandlers, sharedAdminHandlers } = await import('../../admin-handlers.js');
	// Regression: 'mcp.status' is classed 'admin', so with daemon threads the socket's
	// request lands on THIS worker — a worker-side omission answered
	// 'unknown method: mcp.status' even though the main thread's table had it.
	const handlers = adminWorkerHandlers({
		shutdown: () => {}, status: async () => assert.fail('not asked'), repoList: async () => [],
		clients: async () => [], threads: async () => [],
	});
	assert.equal(typeof handlers['mcp.status'], 'function', 'the admin worker serves mcp.status');
	assert.equal(typeof sharedAdminHandlers(() => {})['mcp.status'], 'function', 'sharedAdminHandlers carries it, so main and worker serve one source');
});
