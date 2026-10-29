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
			// Story 5d393a4b: families moved to the shared-state worker.
			'models.check': async () => { log.push(`${name} models.check`); return { checkId: 'c1' }; },
			'models.approve': async () => { log.push(`${name} models.approve`); return { ok: true }; },
			'codeReview.run': async () => { log.push(`${name} codeReview.run`); return { ok: true }; },
			'step.call': async p => { log.push(`${name} step.call ${(p as { tool: string }).tool}`); return { ok: true }; },
			// Replies at once; work it registers keeps its completion message (the ack) back until the test opens 'drain <tag>'.
			'x.drain': async (p, ctx) => {
				const tag = (p as { tag: string }).tag;
				log.push(`${name} start ${tag}`);
				ctx?.registerDrain?.(gates.get(`drain ${tag}`).wait.then(() => { log.push(`${name} drained ${tag}`); }));
				return tag;
			},
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
		await until(() => h.log.length > 0, 'the first starts');
		await tick(30);
		assert.deepEqual(h.log, ['mcp:1001 start one'], 'only the first runs');
		h.gates.open('one');
		await one.done;
		await until(() => h.log.includes('mcp:1001 start two') && two.replies.length >= 1, 'the second starts and sends a frame once the first replied');
		await tick(30);
		assert.deepEqual(h.log, ['mcp:1001 start one', 'mcp:1001 end one', 'mcp:1001 start two'], 'the second starts once the first replied');
		assert.ok(!h.log.includes('mcp:1001 start three'), 'a stream that sent frames has not ended: the third waits for its done frame');
		h.gates.open('two');
		await two.done;
		await until(() => h.log.includes('mcp:1001 start three'), 'the third starts at the stream\'s done frame');
		h.gates.open('three');
		await three.done;
		assert.deepEqual(h.log, ['mcp:1001 start one', 'mcp:1001 end one', 'mcp:1001 start two', 'mcp:1001 end two', 'mcp:1001 start three', 'mcp:1001 end three']);
		assert.deepEqual(h.pool.started, ['mcp:1001', 'mcp:1001', 'mcp:1001'], 'each started on the pool\'s worker');
		await until(() => h.pool.ended.length === 3, 'each ended for the pool at its ack');
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

test("router: a queued stream cancelled by its socket keeps the next request queued and its worker busy until the worker acks it, with or without a lifetime (ISSUE-7c39e5cd)", { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const bare = h.ask('s1', 'x.stream', { tag: 'bare' }, { session: A, stream: true });
		await until(() => h.log.includes('mcp:1001 start bare'), 'the bare stream runs');
		assert.deepEqual(h.pool.started, ['mcp:1001']);
		const lifetime = new RequestLifetime();
		const tracked = h.ask('s2', 'x.stream', { tag: 'tracked' }, { session: A, stream: true, lifetime });
		bare.cancel();
		await tick(30);
		assert.ok(!h.log.includes('mcp:1001 start tracked'), 'the next request waits: the cancelled stream still runs on the worker');
		assert.deepEqual(h.pool.ended, [], 'and the worker stays busy');
		h.gates.open('bare');
		await until(() => h.log.includes('mcp:1001 start tracked'), 'the next request runs once the worker acked the cancelled one');
		assert.deepEqual(h.pool.ended, ['mcp:1001'], 'the cancelled stream ended for the pool at its ack');
		tracked.cancel();
		await tick(30);
		assert.deepEqual(h.pool.ended, ['mcp:1001'], 'a cancelled stream with a lifetime is busy while its handler still runs on the worker');
		h.gates.open('tracked');
		await lifetime.completed;
		await until(() => h.pool.ended.length === 2, 'and ends once its worker acked it');
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
		await until(() => h.pool.started.filter(k => k === 'mcp:1002').length - h.pool.ended.filter(k => k === 'mcp:1002').length === 0, 'the next request counted and ended normally, at its ack');
	} finally { h.close(); }
});

/**
 * ISSUE-7c39e5cd: a request sent with an ack callback, over one fake worker whose port the test
 * also writes to (to send stray completion messages). The handler registers a drain the test
 * opens, so the worker's completion message comes only after it.
 */
function ackHarness() {
	const gates = new Gates();
	const registry = new TargetRegistry();
	const router = new Router({ classOf, registry, routed: new Set<MethodClass>(['session']), local: directDispatch({}) });
	const channel = new MessageChannel();
	const stop = serveRequests(channel.port2, directDispatch({
		'x.drain': async (p, ctx) => { const tag = (p as { tag: string }).tag; ctx?.registerDrain?.(gates.get(`drain ${tag}`).wait); return tag; },
	}));
	router.attach(950, channel.port1);
	const send = (id: string, params: unknown, onAck: () => void): unknown[] => {
		const replies: unknown[] = [];
		(router as unknown as { send(t: number, r: LocalRequestEnvelope, d: DeliverEnvelope, a?: () => void): () => void }).send(950, {
			kind: 'request', requestId: id, method: 'x.drain', params, stream: false, trustedContext: { connectionIdentity: 'socket', daemonEpoch: 'epoch' },
		}, e => { replies.push(e); }, onAck);
		return replies;
	};
	const pending = (id: string): boolean => (router as unknown as { pending: Map<string, unknown> }).pending.has(id);
	return { router, gates, worker: channel.port2, send, pending, close: () => { stop(); router.detach(950); channel.port1.close(); channel.port2.close(); } };
}

test('router: a request awaiting its ack stays pending past its reply; a duplicate or unknown completion message is ignored and onAck runs once (ISSUE-7c39e5cd)', { timeout: 10_000 }, async () => {
	const h = ackHarness();
	try {
		let acks = 0;
		const replies = h.send('k1', { tag: 'k1' }, () => { acks++; });
		await until(() => replies.length === 1, 'the reply is delivered at once');
		assert.deepEqual(replies[0], { kind: 'reply', requestId: 'k1', result: 'k1' });
		await tick(30);
		assert.equal(acks, 0, 'no ack while the work it registered is still draining');
		assert.equal(h.pending('k1'), true, 'still pending past its reply');
		h.gates.open('drain k1');
		await until(() => acks === 1, "the worker's completion message is the ack");
		assert.equal(h.pending('k1'), false);
		h.worker.postMessage({ kind: 'complete', requestId: 'k1' });
		h.worker.postMessage({ kind: 'complete', requestId: 'k1' });
		h.worker.postMessage({ kind: 'complete', requestId: 'nobody' });
		await tick(30);
		assert.equal(acks, 1, 'a duplicate or unknown completion is ignored');
		assert.equal(replies.length, 1);
	} finally { h.gates.open('drain k1'); h.close(); }
});

test("router: a postMessage failure answers 'request channel unavailable' and calls the ack once (ISSUE-7c39e5cd)", { timeout: 10_000 }, async () => {
	const h = ackHarness();
	try {
		let acks = 0;
		// A function cannot be structured-cloned: the post throws.
		const replies = h.send('k2', { tag: 'k2', f: () => 0 }, () => { acks++; });
		assert.deepEqual(replies, [{ kind: 'reply', requestId: 'k2', error: 'request channel unavailable' }]);
		assert.equal(acks, 1);
		assert.equal(h.pending('k2'), false);
		await tick(30);
		assert.equal(acks, 1, 'once');
	} finally { h.close(); }
});

test("router: detach answers a request awaiting its ack through the caller and hands back its ack; failWorker calls it after answering (ISSUE-7c39e5cd)", { timeout: 10_000 }, async () => {
	const h = ackHarness();
	try {
		const order: string[] = [];
		const replies: unknown[] = h.send('k3', { tag: 'k3' }, () => { order.push(`ack k3 after ${replies.length} replies`); });
		await until(() => replies.length === 1, 'replied; awaiting its ack');
		const sent: unknown[] = h.send('k4', { tag: 'k4' }, () => { order.push(`ack k4 after ${sent.length} replies`); });
		await until(() => sent.length === 1, 'k4 replied too');
		h.router.failWorker(950, 'it exited');
		assert.deepEqual(order, ['ack k3 after 2 replies', 'ack k4 after 2 replies'], "each orphan acked once, after failWorker's answer");
		assert.deepEqual(replies[1], { kind: 'reply', requestId: 'k3', error: 'session worker failed: it exited' });
		assert.equal(h.pending('k3'), false);
		const orphans = h.router.detach(950);
		assert.deepEqual(orphans, [], 'nothing left');
	} finally { h.gates.open('drain k3'); h.gates.open('drain k4'); h.close(); }
});

type AckPaths = {
	toSessionWorker(s: SessionId | undefined, r: LocalRequestEnvelope, d: DeliverEnvelope, dropped: () => void, onAck?: () => void): () => void;
	toShared(r: LocalRequestEnvelope, d: DeliverEnvelope, dropped: () => void, onAck?: () => void): () => void;
};
const TRUSTED = { connectionIdentity: 'socket', daemonEpoch: 'epoch' } as const;
const drainRequest = (id: string): LocalRequestEnvelope => ({ kind: 'request', requestId: id, method: 'x.drain', params: { tag: id }, stream: false, trustedContext: TRUSTED });

test("router: a pool start failure, a missing worker port and a cancel before the worker resolved each call the ack once; the pool ends an acked request at its ack (ISSUE-7c39e5cd)", { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const failing: SessionId = { label: 'mcp', pid: 1201 };
		const portless: SessionId = { label: 'mcp', pid: 1202 };
		h.router.useSessions({
			...h.sessions,
			workerFor: async s => {
				if (s?.pid === failing.pid) throw new Error('the worker could not start');
				if (s?.pid === portless.pid) return { threadId: 9999 };
				return h.sessions.workerFor(s);
			},
			// The harness's pool asserts it has the worker; the portless session's has no port to have.
			started: s => { if (s?.pid !== portless.pid) h.sessions.started(s); },
			ended: s => { if (s?.pid !== portless.pid) h.sessions.ended(s); },
		});
		const paths = h.router as unknown as AckPaths;
		const acks: string[] = [];
		const replies: unknown[] = [];
		paths.toSessionWorker(failing, drainRequest('f1'), e => { replies.push(e); }, () => {}, () => { acks.push('f1'); });
		await until(() => acks.length === 1, 'a start failure acks');
		assert.deepEqual(replies, [{ kind: 'reply', requestId: 'f1', error: 'the worker could not start' }]);
		paths.toSessionWorker(portless, drainRequest('p1'), e => { replies.push(e); }, () => {}, () => { acks.push('p1'); });
		await until(() => acks.length === 2, 'a missing port acks');
		assert.deepEqual(replies[1], { kind: 'reply', requestId: 'p1', error: "the session's worker thread is not available" });

		// Cancelled while its worker was still starting: acked at the cancel, never sent, never busy.
		h.slowStarts.add('mcp:1001');
		let dropped = 0;
		const cancel = paths.toSessionWorker(A, drainRequest('c1'), e => { replies.push(e); }, () => { dropped++; }, () => { acks.push('c1'); });
		cancel();
		assert.deepEqual(acks, ['f1', 'p1', 'c1'], 'acked at the cancel');
		assert.equal(dropped, 1);
		h.gates.open('start mcp:1001');
		await tick(30);
		assert.deepEqual(acks, ['f1', 'p1', 'c1'], 'once');
		assert.ok(!h.log.some(l => l.includes('start c1')), 'never sent');
		assert.deepEqual(h.pool.started, [], 'never counted busy');

		// Sent and replied: busy for the pool until its worker's ack, not its reply.
		paths.toSessionWorker(A, drainRequest('b1'), e => { replies.push(e); }, () => {}, () => { acks.push('b1'); });
		await until(() => replies.some(r => (r as { requestId: string }).requestId === 'b1'), 'b1 replied');
		await tick(30);
		assert.deepEqual(h.pool.started, ['mcp:1001']);
		assert.deepEqual(h.pool.ended, [], 'still busy past its reply');
		assert.equal(acks.includes('b1'), false);
		h.gates.open('drain b1');
		await until(() => acks.includes('b1'), 'acked');
		assert.deepEqual(h.pool.ended, ['mcp:1001'], 'the pool ended it at the ack');
	} finally { h.gates.open('start mcp:1001'); h.gates.open('drain b1'); h.close(); }
});

test("router: a shared-state request sent with an ack waits for the shared-state worker's ack, whether that worker is attached or reached through the pool (ISSUE-7c39e5cd)", { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const paths = h.router as unknown as AckPaths;
		const acks: string[] = [];
		const replies: string[] = [];
		const deliver: DeliverEnvelope = e => { replies.push((e as { requestId: string }).requestId); };
		// Attached and registered: sent directly.
		paths.toShared(drainRequest('s1'), deliver, () => {}, () => { acks.push('s1'); });
		await until(() => replies.includes('s1'), 's1 replied');
		await tick(30);
		assert.deepEqual(acks, [], 'no ack past the reply while its work drains');
		h.gates.open('drain s1');
		await until(() => acks.includes('s1'), 's1 acked');
		assert.ok(h.log.includes('shared drained s1'), 'the ack came after the drained work');

		// Not registered: through the pool's sharedWorker.
		// The harness keeps its registry inside the router.
		(h.router as unknown as { opts: { registry: TargetRegistry } }).opts.registry.unregister(h.sharedId());
		paths.toShared(drainRequest('s2'), deliver, () => {}, () => { acks.push('s2'); });
		await until(() => replies.includes('s2'), 's2 replied');
		await tick(30);
		assert.deepEqual(acks, ['s1'], 'no ack past the reply on the pool path either');
		h.gates.open('drain s2');
		await until(() => acks.includes('s2'), 's2 acked');
		assert.ok(h.log.includes('shared drained s2'));
	} finally { h.gates.open('drain s1'); h.gates.open('drain s2'); h.close(); }
});

test('router: a queued unary request whose socket closes while it runs keeps the next request queued until the worker acks the first, after its handler settled (ISSUE-7c39e5cd)', { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const first = h.ask('u1', 'x.order', { tag: 'u1' }, { session: A, lifetime: new RequestLifetime() });
		const second = h.ask('u2', 'x.order', { tag: 'u2' }, { session: A });
		await until(() => h.log.includes('mcp:1001 start u1'), 'the first runs');
		first.cancel();
		await tick(30);
		assert.deepEqual(h.log, ['mcp:1001 start u1'], 'its socket closed, but it still runs on the worker: the second waits');
		h.gates.open('u1');
		await until(() => h.log.includes('mcp:1001 start u2'), 'the second runs after the worker acked the first');
		assert.deepEqual(h.log.slice(0, 3), ['mcp:1001 start u1', 'mcp:1001 end u1', 'mcp:1001 start u2'], 'never overlapping');
		h.gates.open('u2');
		await second.done;
	} finally { h.gates.open('u1'); h.gates.open('u2'); h.close(); }
});

test("router: a queued unary reply is delivered at once, but the session's next request starts only after the worker's ack, after the work it registered with registerDrain is done (ISSUE-7c39e5cd)", { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const first = h.ask('d1', 'x.drain', { tag: 'd1' }, { session: A, trusted: TRUSTED, lifetime: new RequestLifetime() });
		const second = h.ask('d2', 'x.order', { tag: 'd2' }, { session: A });
		await first.done;
		assert.deepEqual(first.replies, [{ kind: 'reply', requestId: 'd1', result: 'd1' }], 'replied at once');
		await tick(30);
		assert.ok(!h.log.includes('mcp:1001 start d2'), 'the next waits while the work it registered drains');
		h.gates.open('drain d1');
		await until(() => h.log.includes('mcp:1001 start d2'), 'the next runs after the ack');
		assert.ok(h.log.indexOf('mcp:1001 drained d1') < h.log.indexOf('mcp:1001 start d2'), 'the drained work came first');
		h.gates.open('d2');
		await second.done;
	} finally { h.gates.open('drain d1'); h.gates.open('d2'); h.close(); }
});

test("router: a worker exit answers the session's running request with 'session worker failed' and the next queued request runs (ISSUE-7c39e5cd)", { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const running = h.ask('w1', 'x.order', { tag: 'w1' }, { session: A });
		const shared = h.ask('w2', 'chat.list', {}, { session: A });
		await until(() => h.log.includes('mcp:1001 start w1'), 'the first runs');
		await tick(20);
		assert.ok(!h.log.includes('shared chat.list'), 'the shared-state request waits in the queue');
		const id = (h.router as unknown as { pending: Map<string, { threadId: number }> }).pending.get('w1')!.threadId;
		h.router.failWorker(id, 'it exited', A);
		await running.done;
		assert.deepEqual(running.replies, [{ kind: 'reply', requestId: 'w1', error: 'session worker failed: it exited' }]);
		await shared.done;
		assert.ok(h.log.includes('shared chat.list'), 'the queue moved on: the next request ran on the shared-state worker');
	} finally { h.gates.open('w1'); h.close(); }
});

test("router: FIFO-exempt and unattributed requests keep today's ends: they never wait for an ack (ISSUE-7c39e5cd)", { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		// Unattributed: no FIFO, and the pool ends it at its reply although its drained work is still open.
		const loose = h.ask('n1', 'x.drain', { tag: 'n1' }, { trusted: TRUSTED, lifetime: new RequestLifetime() });
		await loose.done;
		await until(() => h.pool.ended.includes('unattributed'), 'ended for the pool at its reply');
		assert.ok(!h.log.includes('unattributed drained n1'), 'while its registered work still drains');
		// FIFO-exempt: answered while the session's queue is held by a request awaiting its ack.
		const held = h.ask('e1', 'x.drain', { tag: 'e1' }, { session: A, trusted: TRUSTED, lifetime: new RequestLifetime() });
		await held.done;
		const exempt = h.ask('e2', 'chat.cancel', {}, { session: A });
		await exempt.done;
		assert.ok(h.log.includes('shared chat.cancel'), 'the exempt request (a shared-state one) ran while the queue waited for an ack');
		assert.ok(!h.log.includes('mcp:1001 drained e1'), 'the queue was still held');
	} finally { h.gates.open('drain n1'); h.gates.open('drain e1'); h.close(); }
});

test("router: two sessions' model checks and code-review turns reach the one shared-state worker; other step tools stay on the session's worker (Story 5d393a4b)", { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const B: SessionId = { label: 'codex', pid: 1002 };
		await h.ask('m1', 'models.check', {}, { session: A }).done;
		await h.ask('m2', 'models.approve', {}, { session: B }).done;
		await h.ask('m3', 'codeReview.run', {}, { session: B }).done;
		await h.ask('m4', 'step.call', { tool: 'insrc_code_review_step' }, { session: A }).done;
		await h.ask('m5', 'step.call', { tool: 'insrc_analyze_step' }, { session: B }).done;
		assert.deepEqual(h.log, [
			'shared models.check', 'shared models.approve', 'shared codeReview.run', 'shared step.call insrc_code_review_step',
			'codex:1002 step.call insrc_analyze_step',
		], "a check started by one session is decided by another on the same worker; code-review turns from any session share it");
	} finally { h.close(); }
});

// Last in this file: it turns the maintenance lock on for the process.
test("router: a queued request refused under the maintenance lock is still acked by its worker and the session's queue moves on (ISSUE-7c39e5cd)", { timeout: 10_000 }, async () => {
	const { createLockBlock, installLockManager, LockManager } = await import('../../../shared/locks/lock-manager.js');
	const { enableMaintenanceLock, MAINTENANCE_LOCK } = await import('../../../shared/locks/maintenance-lock.js');
	const block = createLockBlock();
	installLockManager(block);
	const maintainer = new LockManager(block, { threadId: 9301 });
	enableMaintenanceLock();
	let granted!: () => void;
	let unlock!: () => void;
	const grantedP = new Promise<void>(r => { granted = r; });
	const held = new Promise<void>(r => { unlock = r; });
	const exclusive = maintainer.request(MAINTENANCE_LOCK, { mode: 'exclusive' }, async () => { granted(); await held; });
	await grantedP;
	const h = harness();
	try {
		const refused = h.ask('m1', 'x.order', { tag: 'm1' }, { session: A, lifetime: new RequestLifetime() });
		const next = h.ask('m2', 'x.order', { tag: 'm2' }, { session: A, lifetime: new RequestLifetime() });
		await refused.done;
		const reply = refused.replies[0] as { error?: string };
		assert.ok(typeof reply.error === 'string' && reply.error.length > 0, `refused under maintenance: ${JSON.stringify(reply)}`);
		assert.ok(!h.log.includes('mcp:1001 start m1'), 'its handler never ran');
		await next.done;
		assert.equal(typeof (next.replies[0] as { error?: string }).error, 'string', "the queue moved on to the next request at the refused one's ack (refused too, the lock is still held)");
		await until(() => h.pool.ended.length === 2, 'both ended for the pool at their acks');
	} finally { unlock(); await exclusive; h.close(); }
});
