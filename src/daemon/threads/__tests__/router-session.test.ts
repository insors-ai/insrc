/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic 86197ac6, Story s3 / t8: the router's session routing and per-session FIFO, over
 * in-thread fake workers (MessageChannel ports served with serveRequests) and a fake pool.
 * The tests decide when each request ends, so the ordering they check is exact.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel, threadId as mainThreadId } from 'node:worker_threads';

import { RequestLifetime } from '../../request-context.js';
import { directDispatch } from '../../server.js';
import type { DeliverEnvelope, RpcHandlers, StreamHandlers } from '../../server.js';
import { methodClasses } from '../method-class.js';
import { TargetRegistry } from '../registry.js';
import { Router } from '../router.js';
import type { RouterSessions } from '../router.js';
import { serveRequests } from '../worker-requests.js';
import type { LocalRequestEnvelope, MethodClass, SessionId } from '../channel.js';

/** x.* test methods are session-class; everything else as the daemon classifies it. */
const classOf = (m: string): MethodClass | undefined => m.startsWith('x.') ? 'session' : methodClasses.classOf(m);
const tick = (ms = 10): Promise<void> => new Promise(r => setTimeout(r, ms));
/** Wait until `cond` holds (at most 5 s), instead of a fixed sleep racing the work. */
const until = async (cond: () => boolean, what: string): Promise<void> => {
	for (const deadline = Date.now() + 5_000; !cond();) { assert.ok(Date.now() < deadline, what); await tick(5); }
};

/** A gate per tag: a request tagged t waits until the test opens t. */
class Gates {
	private readonly gates = new Map<string, { wait: Promise<void>; open: () => void }>();
	get(tag: string): { wait: Promise<void>; open: () => void } {
		let g = this.gates.get(tag);
		if (g === undefined) { let open!: () => void; const wait = new Promise<void>(r => { open = r; }); g = { wait, open }; this.gates.set(tag, g); }
		return g;
	}
	open(tag: string): void { this.get(tag).open(); }
}

interface Harness {
	router: Router;
	log: string[];
	gates: Gates;
	pool: { started: string[]; ended: string[]; queued: number[]; startedOn: number[]; endedOn: number[] };
	sessions: RouterSessions;
	sharedId: () => number;
	/** Session keys whose worker start waits for the gate 'start <key>'. */
	slowStarts: Set<string>;
	ask(id: string, method: string, params: unknown, opts?: { session?: SessionId; stream?: boolean; trusted?: LocalRequestEnvelope['trustedContext']; lifetime?: RequestLifetime }): { replies: unknown[]; cancel: () => void; done: Promise<void> };
	close(): void;
}

/** A router with a fake pool: one in-thread worker per session key (and the unattributed one), plus a shared-state worker. */
function harness(): Harness {
	const log: string[] = [];
	const gates = new Gates();
	const registry = new TargetRegistry();
	const ports: MessageChannel[] = [];
	const stops: (() => void)[] = [];
	const local: RpcHandlers = {
		'x.local': async () => { log.push('local x.local'); return 'local'; },
		'db.listConnections': async () => { log.push('local db.listConnections'); return []; },
		'workflow.run.abort': async () => { log.push('local workflow.run.abort'); return { ok: true }; },
	};
	const router = new Router({ classOf, registry, routed: new Set<MethodClass>(['session']), local: directDispatch(local), sessions: undefined as never });
	let nextThread = 500;
	const handlers = (name: string): { rpc: RpcHandlers; stream: StreamHandlers } => ({
		rpc: {
			'x.order': async p => { const tag = (p as { tag: string }).tag; log.push(`${name} start ${tag}`); await gates.get(tag).wait; log.push(`${name} end ${tag}`); return tag; },
			'workflow.run.poll': async () => { log.push(`${name} workflow.run.poll`); return { status: 'running' }; },
			'chat.cancel': async () => { log.push(`${name} chat.cancel`); return { ok: true }; },
			'chat.list': async () => { log.push(`${name} chat.list`); return []; },
			'workflow.run.abort': async () => { log.push(`${name} workflow.run.abort`); return { ok: true }; },
		},
		stream: {
			'x.stream': async (p, send) => {
				const tag = (p as { tag: string }).tag;
				log.push(`${name} start ${tag}`);
				send({ id: 0, stream: 'delta', data: 'partial' });
				await gates.get(tag).wait;
				log.push(`${name} end ${tag}`);
				send({ id: 0, stream: 'done', data: tag });
			},
		},
	});
	const startWorker = (name: string): number => {
		const channel = new MessageChannel();
		ports.push(channel);
		const { rpc, stream } = handlers(name);
		stops.push(serveRequests(channel.port2, directDispatch(rpc, stream)));
		const threadId = nextThread++;
		router.attach(threadId, channel.port1);
		return threadId;
	};
	const workers = new Map<string, number>();
	const pool = { started: [] as string[], ended: [] as string[], queued: [] as number[], startedOn: [] as number[], endedOn: [] as number[] };
	const keyOf = (s?: SessionId): string => s === undefined ? 'unattributed' : `${s.label}:${s.pid}`;
	let sharedId = -1;
	const slowStarts = new Set<string>();
	const sessions: RouterSessions = {
		sharedWorker: async () => ({ threadId: sharedId }),
		workerFor: async s => {
			const key = keyOf(s);
			if (slowStarts.has(key)) await gates.get(`start ${key}`).wait;
			let id = workers.get(key);
			if (id === undefined) { id = startWorker(key); workers.set(key, id); }
			return { threadId: id };
		},
		// The pool only counts a request whose worker it already has.
		started: s => { assert.ok(workers.has(keyOf(s)), `started reported for ${keyOf(s)} before its worker exists`); pool.started.push(keyOf(s)); },
		ended: s => pool.ended.push(keyOf(s)),
		setQueued: (_s, n) => pool.queued.push(n),
		startedOn: id => pool.startedOn.push(id),
		endedOn: id => pool.endedOn.push(id),
	};
	router.useSessions(sessions);
	sharedId = startWorker('shared');
	registry.register({ threadId: sharedId, cls: 'session', shared: true });
	return {
		router, log, gates, pool, sessions, sharedId: () => sharedId, slowStarts,
		ask(id, method, params, opts = {}) {
			const replies: unknown[] = [];
			let finished!: () => void;
			const done = new Promise<void>(r => { finished = r; });
			const deliver: DeliverEnvelope = e => {
				replies.push(e);
				if (e.kind === 'reply' || ['done', 'error'].includes((e.frame as { stream: string }).stream)) finished();
			};
			const cancel = router.forward({
				kind: 'request', requestId: id, method, params, stream: opts.stream ?? false,
				...(opts.session !== undefined ? { session: opts.session } : {}),
				...(opts.trusted !== undefined ? { trustedContext: opts.trusted } : {}),
				...(opts.lifetime !== undefined ? { lifetime: opts.lifetime } : {}),
			}, deliver);
			return { replies, cancel, done };
		},
		close() { for (const s of stops) s(); for (const c of ports) { c.port1.close(); c.port2.close(); } },
	};
}

const A: SessionId = { label: 'mcp', pid: 1001 };

test("router: one session's three requests reach its worker in arrival order; a stream ends at its done/error frame", { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const one = h.ask('r1', 'x.order', { tag: 'one' }, { session: A });
		const two = h.ask('r2', 'x.stream', { tag: 'two' }, { session: A, stream: true });
		const three = h.ask('r3', 'x.order', { tag: 'three' }, { session: A });
		await tick(30);
		assert.deepEqual(h.log, ['mcp:1001 start one'], 'only the first runs');
		h.gates.open('one');
		await one.done;
		await tick(30);
		assert.deepEqual(h.log, ['mcp:1001 start one', 'mcp:1001 end one', 'mcp:1001 start two'], 'the second starts once the first replied');
		assert.ok(two.replies.length >= 1, 'the stream sent a frame');
		await tick(30);
		assert.ok(!h.log.includes('mcp:1001 start three'), 'a stream that sent frames has not ended: the third waits for its done frame');
		h.gates.open('two');
		await two.done;
		await tick(30);
		assert.ok(h.log.includes('mcp:1001 start three'), 'the third starts at the stream\'s done frame');
		h.gates.open('three');
		await three.done;
		assert.deepEqual(h.log, ['mcp:1001 start one', 'mcp:1001 end one', 'mcp:1001 start two', 'mcp:1001 end two', 'mcp:1001 start three', 'mcp:1001 end three']);
		assert.deepEqual(h.pool.started, ['mcp:1001', 'mcp:1001', 'mcp:1001'], 'each started on the pool\'s worker');
		assert.equal(h.pool.ended.length, 3);
	} finally { h.close(); }
});

test('router: FIFO-exempt methods are forwarded during a long request; a cancelled queued request is removed', { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const long = h.ask('r1', 'x.order', { tag: 'long' }, { session: A });
		await tick(20);
		const poll = h.ask('r2', 'workflow.run.poll', { runId: 'w' }, { session: A });
		const cancelChat = h.ask('r3', 'chat.cancel', { sessionId: 'c' }, { session: A });
		await poll.done;
		await cancelChat.done;
		assert.equal(h.log[0], 'mcp:1001 start long');
		assert.deepEqual(h.log.slice(1).sort(), ['mcp:1001 workflow.run.poll', 'shared chat.cancel'], 'both answered while the long request runs (in either order); chat.* on the shared-state worker');
		assert.ok(!h.log.includes('mcp:1001 end long'), 'the long request is still running');
		const queued = h.ask('r4', 'x.order', { tag: 'dropped' }, { session: A });
		const after = h.ask('r5', 'x.order', { tag: 'after' }, { session: A });
		await tick(20);
		queued.cancel();
		h.gates.open('long');
		await long.done;
		h.gates.open('after');
		await after.done;
		assert.ok(!h.log.some(l => l.includes('dropped')), 'the cancelled queued request never reached the worker');
		assert.deepEqual(h.log.slice(3), ['mcp:1001 end long', 'mcp:1001 start after', 'mcp:1001 end after'], 'the next one ran when the running one ended');
		assert.deepEqual(queued.replies, [], 'and got no reply');
	} finally { h.close(); }
});

test('router: connection-scoped requests stay local; unattributed requests interleave without a FIFO', { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		// A trusted connection session, or a connection-management method: served on this thread.
		const scoped = h.ask('c1', 'x.local', null, { session: A, trusted: { connectionIdentity: 'c', daemonEpoch: 'e', connectionSession: {} as never } });
		const managed = h.ask('c2', 'db.listConnections', {}, { session: A });
		await scoped.done;
		await managed.done;
		assert.deepEqual(h.log, ['local x.local', 'local db.listConnections']);
		assert.deepEqual(h.pool.started, [], 'neither reached a worker');
		// No identity: the unattributed worker, both at once.
		const u1 = h.ask('u1', 'x.order', { tag: 'u1' });
		const u2 = h.ask('u2', 'x.order', { tag: 'u2' });
		await tick(30);
		assert.deepEqual(h.log.slice(2), ['unattributed start u1', 'unattributed start u2'], 'the second started before the first ended');
		h.gates.open('u2');
		await u2.done;
		h.gates.open('u1');
		await u1.done;
		assert.deepEqual(h.pool.queued, [], 'no FIFO was kept for them');
	} finally { h.close(); }
});

test('router: a running stream cancelled by its socket ends for the pool (no lifetime, and once its lifetime completes)', { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const bare = h.ask('s1', 'x.stream', { tag: 'bare' }, { session: A, stream: true });
		await until(() => h.log.includes('mcp:1001 start bare'), 'the bare stream runs');
		assert.deepEqual(h.pool.started, ['mcp:1001']);
		bare.cancel();
		assert.deepEqual(h.pool.ended, ['mcp:1001'], 'a cancelled stream with no lifetime ends at its cancel');
		const lifetime = new RequestLifetime();
		const tracked = h.ask('s2', 'x.stream', { tag: 'tracked' }, { session: A, stream: true, lifetime });
		await until(() => h.log.includes('mcp:1001 start tracked'), 'the next request ran once the cancelled one ended');
		assert.deepEqual(h.pool.started, ['mcp:1001', 'mcp:1001']);
		tracked.cancel();
		await tick(30);
		assert.deepEqual(h.pool.ended, ['mcp:1001'], 'a cancelled stream with a lifetime is busy while its handler still runs on the worker');
		h.gates.open('tracked');
		await lifetime.completed;
		await until(() => h.pool.ended.length === 2, 'and ends once its worker completed it');
		assert.ok(!tracked.replies.some(r => ['done', 'error'].includes(((r as { frame?: { stream?: string } }).frame?.stream) ?? '')), 'no last frame was needed');
	} finally { h.gates.open('bare'); h.gates.open('tracked'); h.close(); }
});

test("router: workflow.run.abort reaches a worker-owned run's owner as a busy request, and a main-thread run here", { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const owner = h.sharedId();
		h.router.useSessions(h.sessions, runId => runId === 'main-run' ? mainThreadId : runId === 'worker-run' ? owner : undefined);
		await h.ask('a1', 'workflow.run.abort', { runId: 'worker-run' }, { session: A }).done;
		assert.deepEqual(h.log, ['shared workflow.run.abort'], "to the owner's worker");
		assert.deepEqual(h.pool.startedOn, [owner], 'counted busy while it runs');
		assert.deepEqual(h.pool.endedOn, [owner], 'and ended at its reply');
		await h.ask('a2', 'workflow.run.abort', { runId: 'main-run' }, { session: A }).done;
		assert.deepEqual(h.log.slice(1), ['local workflow.run.abort'], 'a run owned by this thread is aborted here');
		assert.deepEqual(h.pool.started, [], 'neither went to the session worker');
	} finally { h.close(); }
});

test("router: a session worker's exit fails its queued requests but keeps one bound for the shared-state worker", { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const running = h.ask('f1', 'x.order', { tag: 'stuck' }, { session: A });
		await until(() => h.log.includes('mcp:1001 start stuck'), 'the first request runs');
		const own = h.ask('f2', 'x.order', { tag: 'own' }, { session: A });
		const list = h.ask('f3', 'chat.list', {}, { session: A });
		await until(() => h.pool.queued.at(-1) === 2, 'both queued behind it');
		const worker = (await h.sessions.workerFor(A)).threadId;
		h.router.failWorker(worker, 'boom', A);
		await running.done;
		await own.done;
		await list.done;
		assert.deepEqual(running.replies.map(r => (r as { error?: string }).error), ['session worker failed: boom']);
		assert.deepEqual(own.replies.map(r => (r as { error?: string }).error), ['session worker failed: boom'], 'its own queued request is failed');
		assert.deepEqual(list.replies.map(r => (r as { error?: string }).error), [undefined], 'the shared-state one ran');
		assert.ok(h.log.includes('shared chat.list'));
		assert.ok(!h.log.includes('mcp:1001 start own'));
	} finally { h.gates.open('stuck'); h.close(); }
});

test('router: a request cancelled while its worker is still starting never leaves the worker busy', { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const B: SessionId = { label: 'mcp', pid: 1002 };
		h.slowStarts.add('mcp:1002');
		const lifetime = new RequestLifetime();
		const cold = h.ask('c1', 'x.stream', { tag: 'cold' }, { session: B, stream: true, lifetime });
		await tick(10);
		cold.cancel();
		h.gates.open('start mcp:1002');
		await h.sessions.workerFor(B);
		await tick(20);
		const started = h.pool.started.filter(k => k === 'mcp:1002').length;
		const ended = h.pool.ended.filter(k => k === 'mcp:1002').length;
		assert.equal(started - ended, 0, `busy count balanced (started ${started}, ended ${ended})`);
		assert.ok(!h.log.includes('mcp:1002 start cold'), 'the cancelled request never reached the worker');
		const next = h.ask('c2', 'x.order', { tag: 'warm' }, { session: B });
		h.gates.open('warm');
		await next.done;
		assert.equal(h.pool.started.filter(k => k === 'mcp:1002').length - h.pool.ended.filter(k => k === 'mcp:1002').length, 0, 'the next request counted and ended normally');
	} finally { h.close(); }
});
