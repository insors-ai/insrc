/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic 86197ac6, Story s4 / t2: the router publishes what each worker thread it sends requests
 * to is doing, over in-thread fake workers (MessageChannel ports served with serveRequests) and
 * a recording board. The tests decide when each request ends.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';

import { RequestLifetime } from '../../request-context.js';
import { directDispatch } from '../../server.js';
import type { DeliverEnvelope } from '../../server.js';
import { TargetRegistry } from '../registry.js';
import type { ThreadTarget } from '../registry.js';
import { Router } from '../router.js';
import type { RouterSessions } from '../router.js';
import type { ThreadStatus } from '../status-board.js';
import { serveRequests } from '../worker-requests.js';
import type { MethodClass, SessionId } from '../channel.js';

/** a.* methods are admin-class, x.* session-class. */
const classOf = (m: string): MethodClass | undefined => m.startsWith('a.') ? 'admin' : m.startsWith('x.') ? 'session' : undefined;
const tick = (ms = 5): Promise<void> => new Promise(r => setTimeout(r, ms));
const until = async (cond: () => boolean, what: string): Promise<void> => {
	for (const deadline = Date.now() + 5_000; !cond();) { assert.ok(Date.now() < deadline, what); await tick(); }
};

function harness() {
	// A gate per tag, made by whichever side touches it first (the worker may not have started the handler yet).
	const gates = new Map<string, { wait: Promise<void>; open: () => void }>();
	const at = (tag: string): { wait: Promise<void>; open: () => void } => {
		let g = gates.get(tag);
		if (g === undefined) { let open!: () => void; const wait = new Promise<void>(r => { open = r; }); g = { wait, open }; gates.set(tag, g); }
		return g;
	};
	const gate = (tag: string): Promise<void> => at(tag).wait;
	const open = (tag: string): void => { at(tag).open(); };
	const states = new Map<number, ThreadStatus>();
	const forgotten: number[] = [];
	const board = { publish: (s: ThreadStatus) => { states.set(s.threadId, s); }, forget: (id: number) => { forgotten.push(id); states.delete(id); } };
	const registry = new TargetRegistry();
	const router = new Router({ classOf, registry, routed: new Set<MethodClass>(['admin', 'session']), local: directDispatch({}), board });
	const channels: MessageChannel[] = [];
	const stops: (() => void)[] = [];
	const rpc = {
		'a.order': async (p: unknown) => { await gate((p as { tag: string }).tag); return 'ok'; },
		'x.order': async (p: unknown) => { await gate((p as { tag: string }).tag); return 'ok'; },
	};
	const stream = {
		'a.stream': async (p: unknown, send: (m: { id: number; stream: string; data: unknown }) => void) => {
			send({ id: 0, stream: 'delta', data: 'partial' });
			await gate((p as { tag: string }).tag);
			send({ id: 0, stream: 'done', data: 'end' });
		},
	};
	/** A worker registered as `target` and attached, the order the daemon uses. */
	const worker = (target: ThreadTarget): void => {
		const channel = new MessageChannel();
		channels.push(channel);
		stops.push(serveRequests(channel.port2, directDispatch(rpc, stream as never)));
		registry.register(target);
		router.attach(target.threadId, channel.port1);
	};
	let seq = 0;
	const ask = (method: string, tag: string, opts: { session?: SessionId; stream?: boolean; lifetime?: RequestLifetime } = {}) => {
		let finished!: () => void;
		const done = new Promise<void>(r => { finished = r; });
		const deliver: DeliverEnvelope = e => {
			if (e.kind === 'reply' || ['done', 'error'].includes((e.frame as { stream: string }).stream)) finished();
		};
		const cancel = router.forward({
			kind: 'request', requestId: `v${++seq}`, method, params: { tag }, stream: opts.stream ?? false,
			...(opts.session !== undefined ? { session: opts.session } : {}),
			...(opts.lifetime !== undefined ? { lifetime: opts.lifetime } : {}),
		}, deliver);
		return { done, cancel };
	};
	const close = (): void => { for (const s of stops) s(); for (const c of channels) { c.port1.close(); c.port2.close(); } };
	return { router, registry, states, forgotten, worker, ask, open, close };
}

test("router thread view: attach publishes idle with the registry's role; a request marks busy with its method and since; its reply marks idle", { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const A: SessionId = { label: 'mcp', pid: 801 };
		h.worker({ threadId: 701, cls: 'admin' });
		h.worker({ threadId: 702, cls: 'indexing' });
		h.worker({ threadId: 703, cls: 'session', session: A });
		h.worker({ threadId: 704, cls: 'session', unattributed: true });
		h.worker({ threadId: 705, cls: 'session', shared: true });
		assert.deepEqual(h.states.get(701), { threadId: 701, cls: 'admin', role: 'admin', busy: false, queued: 0 });
		assert.equal(h.states.get(702)?.role, 'code-indexing');
		assert.deepEqual(h.states.get(703), { threadId: 703, cls: 'session', role: 'session', session: A, busy: false, queued: 0 });
		assert.equal(h.states.get(704)?.role, 'unattributed');
		assert.equal(h.states.get(705)?.role, 'shared-state');
		assert.equal(h.states.get(705)?.session, undefined);

		const before = Date.now();
		const one = h.ask('a.order', 'one');
		const busy = h.states.get(701)!;
		assert.equal(busy.busy, true);
		assert.equal(busy.method, 'a.order');
		assert.ok(busy.since! >= before && busy.since! <= Date.now(), 'since is when it was sent');
		h.open('one');
		await one.done;
		assert.deepEqual(h.states.get(701), { threadId: 701, cls: 'admin', role: 'admin', busy: false, queued: 0 }, 'idle again at its reply');
	} finally { h.close(); }
});

test('router thread view: the oldest in-flight request names method and since; a stream is busy until its done or error frame, a cancelled stream until its lifetime completes', { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		h.worker({ threadId: 711, cls: 'admin' });
		const first = h.ask('a.order', 'first');
		const firstSince = h.states.get(711)!.since;
		await tick(3);
		const second = h.ask('a.stream', 'second', { stream: true });
		assert.equal(h.states.get(711)?.method, 'a.order', 'the oldest names the thread');
		assert.equal(h.states.get(711)?.since, firstSince);
		h.open('first');
		await first.done;
		assert.equal(h.states.get(711)?.method, 'a.stream', 'then the next oldest');
		assert.equal(h.states.get(711)?.busy, true, 'a stream that sent frames is still busy');
		h.open('second');
		await second.done;
		assert.equal(h.states.get(711)?.busy, false, 'the done frame ends it');

		// A stream cancelled by its socket stays busy while its worker still runs it, until its lifetime completes.
		const lifetime = new RequestLifetime();
		const cancelled = h.ask('a.stream', 'cancelled', { stream: true, lifetime });
		await tick(10);
		cancelled.cancel();
		await tick(20);
		assert.equal(h.states.get(711)?.busy, true, 'busy until the worker completes it');
		h.open('cancelled');
		await lifetime.completed;
		await until(() => h.states.get(711)?.busy === false, 'idle once the lifetime completes');
	} finally { h.close(); }
});

test("router thread view: a session worker's queued equals its FIFO length; detach forgets the thread and nothing re-adds it", { timeout: 10_000 }, async () => {
	const h = harness();
	try {
		const A: SessionId = { label: 'mcp', pid: 821 };
		h.worker({ threadId: 721, cls: 'session', session: A });
		const sessions: RouterSessions = {
			workerFor: async () => ({ threadId: 721 }), sharedWorker: async () => ({ threadId: 721 }),
			started: () => {}, ended: () => {}, setQueued: () => {}, startedOn: () => {}, endedOn: () => {},
		};
		h.router.useSessions(sessions);
		const one = h.ask('x.order', 'q1', { session: A });
		await until(() => h.states.get(721)?.busy === true, 'the first is sent');
		assert.equal(h.states.get(721)?.queued, 0);
		h.ask('x.order', 'q2', { session: A });
		h.ask('x.order', 'q3', { session: A });
		assert.equal(h.states.get(721)?.queued, 2, 'two wait in the FIFO, published as they queue');
		assert.equal(h.states.get(721)?.method, 'x.order');
		h.open('q1');
		await one.done;
		await until(() => h.states.get(721)?.queued === 1, 'one waits after the first ended');

		h.router.detach(721);
		assert.deepEqual(h.forgotten, [721]);
		assert.equal(h.states.has(721), false, 'forgotten');
		// The session's queue changes after the detach (a new request queues behind the running one): nothing republishes it.
		h.ask('x.order', 'q4', { session: A });
		await tick(20);
		assert.equal(h.states.has(721), false, 'no later publish re-adds a detached thread');
	} finally { h.close(); }
});
