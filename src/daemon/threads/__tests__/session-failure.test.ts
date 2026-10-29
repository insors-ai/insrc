/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic 86197ac6, Story s3 / t9, over real session and shared-state workers wired by
 * startSessionRouting: a session worker's exit fails only that session's running and
 * queued requests; workflow.run.abort reaches the run's owner from any session, and an
 * owner's exit ends its runs 'error'; the shared-state worker's exit ends an open
 * todos.subscribe and the next chat.list starts a new one.
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-session-failure-'));
const REPO = mkdtempSync(join(tmpdir(), 'insrc-session-failure-repo-'));
process.env['HOME'] = HOME;
process.env['INSRC_TEST_HOOKS'] = '1';

const { getDb, initDb } = await import('../../../db/client.js');
const { closeGraphStore, declareLiveStoreOwner } = await import('../../../db/graph/store.js');
const { closeLanceConn } = await import('../../../db/lance/conn.js');
const { directDispatch } = await import('../../server.js');
const { ThreadServices } = await import('../main-services.js');
const { methodClasses } = await import('../method-class.js');
const { Router } = await import('../router.js');
const { OWNER_EXITED, startSessionRouting } = await import('../session-routing.js');
const { Supervisor } = await import('../supervisor.js');
import type { DeliverEnvelope } from '../../server.js';
import type { MethodClass, SessionId } from '../channel.js';
import type { SessionPool } from '../session-pool.js';

const classOf = (m: string): MethodClass | undefined => m.startsWith('test.') ? 'session' : methodClasses.classOf(m);
const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: '' }));
const router = new Router({ classOf, registry: services.registry, routed: new Set<MethodClass>(['session']), local: directDispatch({}), board: services.board });
let pool: SessionPool | undefined;
// The session pool's workers are supervised for errors and shutdown (s4).
const supervisor = new Supervisor({ services, router, shutdown: () => {} });

before(async () => {
	declareLiveStoreOwner();
	await initDb(await getDb());
	pool = startSessionRouting(services, router, 600_000, supervisor);
});
after(async () => {
	await pool?.close();
	await closeLanceConn();
	await closeGraphStore();
	for (const d of [HOME, REPO]) rmSync(d, { recursive: true, force: true });
});

let seq = 0;
/** A request as the socket sends it; resolves with its reply (or a stream's last frame) and keeps every frame. */
function ask(method: string, params: unknown, session?: SessionId, stream = false): { done: Promise<{ result?: unknown; error?: string }>; frames: { stream: string; data: unknown }[] } {
	const frames: { stream: string; data: unknown }[] = [];
	const done = new Promise<{ result?: unknown; error?: string }>(resolve => {
		const deliver: DeliverEnvelope = e => {
			if (e.kind === 'reply') { resolve({ ...(e.result !== undefined ? { result: e.result } : {}), ...(e.error !== undefined ? { error: e.error } : {}) }); return; }
			const frame = e.frame as { stream: string; data: unknown };
			frames.push(frame);
			if (frame.stream === 'done') resolve({ result: frame.data });
			if (frame.stream === 'error') resolve({ error: (frame.data as { error?: string }).error ?? 'error' });
		};
		router.forward({ kind: 'request', requestId: `f${++seq}`, method, params, stream, ...(session !== undefined ? { session } : {}) }, deliver);
	});
	return { done, frames };
}
const threadOf = (r: { result?: unknown }): number => (r.result as { threadId: number }).threadId;
const A: SessionId = { label: 'mcp', pid: 9001 };
const B: SessionId = { label: 'mcp', pid: 9002 };
const until = async (cond: () => boolean, what: string, ms = 10_000): Promise<void> => {
	for (const deadline = Date.now() + ms; !cond();) { assert.ok(Date.now() < deadline, what); await new Promise(r => setTimeout(r, 20)); }
};

test('failure: a session worker exit fails only its running and queued requests; the next request gets a new worker', { timeout: 60_000 }, async () => {
	const before = await ask('test.servingThread', null, A).done as { result: { threadId: number } };
	const running = ask('test.order', { tag: 'running', ms: 60_000, exitAfterMs: 200 }, A);
	const queued = ask('test.order', { tag: 'queued', ms: 10 }, A);
	const other = ask('test.order', { tag: 'other', ms: 400 }, B);
	const [r, q, o] = [await running.done, await queued.done, await other.done];
	assert.match(r.error ?? '', /^session worker failed: it exited with code 1$/, 'the running request');
	assert.match(q.error ?? '', /^session worker failed: /, 'the queued request');
	assert.equal(o.error, undefined, "the other session's request was answered");
	assert.equal((o.result as { tag: string }).tag, 'other');
	const afterExit = await ask('test.servingThread', null, A).done as { result: { threadId: number } };
	assert.notEqual(afterExit.result.threadId, before.result.threadId, "the session's next request runs on a new worker");
	assert.equal(services.registry.targetFor('session', A)?.threadId, afterExit.result.threadId, 'the new worker holds the slot');
});

test('runs: workflow.run.abort from another session reaches the owner; an owner exit makes polls return error with the named reason', { timeout: 60_000 }, async () => {
	const C: SessionId = { label: 'mcp', pid: 9101 };
	const D: SessionId = { label: 'mcp', pid: 9102 };
	const owner = await ask('test.servingThread', null, C).done as { result: { threadId: number } };
	assert.deepEqual((await ask('test.startRun', { repo: REPO, runId: 'run-abort' }, C).done).result, { runId: 'run-abort' });
	await until(() => services.board.snapshot().runs.some(r => r.runId === 'run-abort'), 'the run on the board');
	assert.equal(services.board.snapshot().runs.find(r => r.runId === 'run-abort')!.ownerThreadId, owner.result.threadId);
	assert.equal(((await ask('workflow.run.poll', { runId: 'run-abort', cursor: 0 }, D).done).result as { status: string }).status, 'running', 'polled from another session');
	assert.deepEqual((await ask('workflow.run.abort', { runId: 'run-abort' }, D).done).result, { ok: true }, "another session's abort reached the owner (only the owner knows the run)");
	await until(() => services.board.snapshot().runs.find(r => r.runId === 'run-abort')?.status === 'aborted', 'the run aborted');
	assert.equal(((await ask('workflow.run.poll', { runId: 'run-abort', cursor: 0 }, D).done).result as { status: string }).status, 'aborted');

	// The owner exits while a second run is still running.
	await ask('test.startRun', { repo: REPO, runId: 'run-orphan' }, C).done;
	await until(() => services.board.snapshot().runs.some(r => r.runId === 'run-orphan'), 'the second run on the board');
	const framesBefore = ((await ask('workflow.run.poll', { runId: 'run-orphan', cursor: 0 }, D).done).result as { frames: unknown[] }).frames;
	assert.match((await ask('test.order', { tag: 'crash', ms: 60_000, exitAfterMs: 100 }, C).done).error ?? '', /^session worker failed: /);
	const poll = (await ask('workflow.run.poll', { runId: 'run-orphan', cursor: 0 }, D).done).result as { status: string; error?: string; frames: unknown[] };
	assert.equal(poll.status, 'error');
	assert.equal(poll.error, OWNER_EXITED);
	assert.equal(OWNER_EXITED, 'the session worker running this workflow exited');
	assert.deepEqual(poll.frames, framesBefore, 'the frames so far are kept');
});

test('shared-state worker exit ends an open todos.subscribe with an error frame and the next chat.list starts a new one', { timeout: 60_000 }, async () => {
	assert.deepEqual((await ask('chat.list', {}, A).done).result, { sessions: [] }, 'the shared-state worker started on first need');
	const first = services.registry.targetFor('session', undefined, { shared: true })!.threadId;
	const subscription = ask('todos.subscribe', {}, A, true);
	// A todo list created on the shared-state worker reaches the open subscription there (it sends nothing until then).
	for (const deadline = Date.now() + 10_000; subscription.frames.length === 0;) {
		assert.ok(Date.now() < deadline, 'the subscription is open');
		const created = await ask('todos.create', { sessionId: 'sess-todos', title: 'probe', owner: 'user' }, A).done;
		assert.equal(created.error ?? (created.result as { error?: string }).error, undefined, JSON.stringify(created));
		await new Promise(r => setTimeout(r, 50));
	}
	assert.equal(subscription.frames[0]!.stream, 'todos');
	// The shared-state worker exits (the test hook every worker serves).
	await router.request('session', 'test.exit', null, { shared: true }).catch(() => {});
	const ended = await subscription.done;
	assert.match(ended.error ?? '', /^session worker failed: /, 'the open subscription ended with an error frame');
	assert.equal(subscription.frames.at(-1)!.stream, 'error');
	assert.deepEqual((await ask('chat.list', {}, A).done).result, { sessions: [] }, 'the next chat.list is answered');
	const second = services.registry.targetFor('session', undefined, { shared: true })!.threadId;
	assert.notEqual(second, first, 'by a new shared-state worker');
});

test("session failure: session workers are still recreated on demand with s3's failure messages under supervisor tracking", { timeout: 60_000 }, async () => {
	const F: SessionId = { label: 'mcp', pid: 9301 };
	const tracked = supervisor.createdCount();
	const first = threadOf(await ask('test.servingThread', null, F).done);
	assert.equal(supervisor.createdCount(), tracked + 1, "the session's worker is in the supervisor's created set");
	assert.match((await ask('test.order', { tag: 'crash', ms: 60_000, exitAfterMs: 100 }, F).done).error ?? '', /^session worker failed: it exited with code 1$/, "s3's failure message");
	await until(() => supervisor.createdCount() === tracked, 'the exited worker left the created set');
	const second = threadOf(await ask('test.servingThread', null, F).done);
	assert.notEqual(second, first, "the session's next request runs on a new worker");
	assert.equal(supervisor.createdCount(), tracked + 1, 'and the new worker is tracked too');
});

test('s4 ac2: a worker of each class exits mid-request; that request fails, the thread leaves threads and is replaced while others answer (session, shared-state)', { timeout: 60_000 }, async () => {
	const listed = (role: string) => services.board.snapshot().threads.filter(t => t.role === role).map(t => t.threadId);
	const G: SessionId = { label: 'mcp', pid: 9501 };
	const H: SessionId = { label: 'mcp', pid: 9502 };
	const g = threadOf(await ask('test.servingThread', null, G).done);
	const h = threadOf(await ask('test.servingThread', null, H).done);
	assert.ok(listed('session').includes(g) && listed('session').includes(h), 'both session threads are listed');
	assert.deepEqual(services.board.snapshot().threads.find(t => t.threadId === g)?.session, G);
	assert.match((await ask('test.order', { tag: 'crash', ms: 60_000, exitAfterMs: 100 }, G).done).error ?? '', /^session worker failed: /, 'its in-flight request fails');
	await until(() => !listed('session').includes(g), "the exited session's thread leaves threads");
	assert.equal(threadOf(await ask('test.servingThread', null, H).done), h, 'the other session keeps answering on its worker');
	const g2 = threadOf(await ask('test.servingThread', null, G).done);
	assert.notEqual(g2, g);
	assert.ok(listed('session').includes(g2), "the session's next request's new worker is listed");

	// The shared-state worker.
	assert.deepEqual((await ask('chat.list', {}, H).done).result, { sessions: [] });
	const shared = listed('shared-state');
	assert.equal(shared.length, 1, 'the shared-state thread is listed');
	await router.request('session', 'test.exit', null, { shared: true }).catch(() => {});
	await until(() => !listed('shared-state').includes(shared[0]!), 'the exited shared-state thread leaves threads');
	assert.deepEqual((await ask('chat.list', {}, H).done).result, { sessions: [] }, 'the next chat.list is answered');
	await until(() => listed('shared-state').length === 1 && listed('shared-state')[0] !== shared[0], 'by a new shared-state thread, listed');
});

// Last: it closes the pool.
test('close: a request in flight on a released worker is answered, and a request after close is refused', { timeout: 60_000 }, async () => {
	const E: SessionId = { label: 'mcp', pid: 9201 };
	const long = ask('test.order', { tag: 'long', ms: 60_000 }, E);
	await until(() => services.registry.targetFor('session', E) !== undefined, "E's worker started");
	await new Promise(r => setTimeout(r, 100));
	await pool!.close();
	assert.equal((await long.done).error, 'session worker failed: it was released', 'answered, not left hanging');
	assert.equal((await ask('test.servingThread', null, E).done).error, 'session worker could not start: the daemon is shutting down');
	assert.equal(services.registry.targetFor('session', undefined, { shared: true }), undefined, 'no worker started after close');
});
