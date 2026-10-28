/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The router (Epic 86197ac6, Story s2): the IpcServer's forward on the main
 * thread. Each request is classified with the method-class registry; a routed
 * class (admin, indexing) goes as a request envelope to the worker registered
 * for it, and its replies and frames come back over that worker's channel;
 * every other request runs in this thread, as before, under the maintenance
 * lock's request hold (a routed request takes it on its worker).
 *
 * A request whose worker is not registered (it is starting or being replaced)
 * is held until one registers, at most holdMs, then answered with an error.
 *
 * Session work (s3), once routed: a chat, todos or understanding method goes to the
 * shared-state worker; any other session-class method to its session's worker from the
 * session pool, or to the unattributed worker when the request carries no client
 * identity. A session's requests run one at a time in arrival order (its FIFO, held here):
 * each is sent once the one before it ended (its reply, its stream's done or error frame,
 * or its cancel). Subscriptions and the methods that observe or control a running request
 * (FIFO_EXEMPT_METHODS) are sent at once, and the unattributed worker's requests interleave
 * as on a single thread. Requests bound to a connection session stay on this thread.
 */

import type { MessagePort } from 'node:worker_threads';

import { getLogger } from '../../shared/logger.js';
import { holdsMaintenanceLock } from '../../shared/locks/maintenance-lock.js';
import type { IpcStreamMessage } from '../../shared/types.js';
import type { RequestLifetime } from '../request-context.js';
import type { DeliverEnvelope, ForwardRequest } from '../server.js';
import type { CancelEnvelope, FrameEnvelope, MethodClass, ReplyEnvelope, LocalRequestEnvelope, SessionId } from './channel.js';
import { FIFO_EXEMPT_METHODS, MAIN_DAEMON_CONNECTION_METHODS, SHARED_STATE_METHODS } from './method-class.js';
import { wireRequest } from './channel.js';
import { holdingForward } from './maintenance-entry.js';
import type { TargetRegistry } from './registry.js';

const log = getLogger('router');

/** How long a request waits for its class's worker to register. */
export const DEFAULT_HOLD_MS = 30_000;

export interface RouterOptions {
	readonly classOf: (method: string) => MethodClass | undefined;
	readonly registry: TargetRegistry;
	/** The classes whose requests go to a worker; every other request runs in this thread. */
	readonly routed: ReadonlySet<MethodClass>;
	/** Serves the requests that run in this thread (directDispatch over the main thread's tables). */
	readonly local: ForwardRequest;
	readonly holdMs?: number | undefined;
	/** Told of every request as it arrives; the call it returns is made when the request ends (idle detection). */
	readonly onRequest?: ((method: string, cls: MethodClass | undefined) => () => void) | undefined;	/** The session pool, once session work is routed (s3): a session's worker, and its requests' activity. */
	readonly sessions?: RouterSessions | undefined;
}

/** The session pool as the router uses it (s3, sc6). */
export interface RouterSessions {
	/** The session's worker (the unattributed worker for no session), started if it has none. */
	workerFor(session?: SessionId): Promise<{ readonly threadId: number }>;
	/** The shared-state worker, started if it has none. */
	sharedWorker(): Promise<{ readonly threadId: number }>;
	/** A request of the session started on its worker, and ended. */
	started(session: SessionId | undefined): void;
	ended(session: SessionId | undefined): void;
	/** How many of the session's requests wait in its FIFO. */
	setQueued(session: SessionId | undefined, queued: number): void;
}

/** One request in a session's FIFO. */
interface Queued {
	readonly request: LocalRequestEnvelope;
	readonly deliver: DeliverEnvelope;
	started: boolean;
	/** Sends the request to its worker; set once started. */
	cancel?: () => void;
	run(): void;
	drop(): void;
}

interface Fifo {
	readonly session: SessionId;
	running?: Queued | undefined;
	readonly waiting: Queued[];
}

/** A reply, or a stream's last frame: the request has ended. */
const isTerminal = (envelope: ReplyEnvelope | FrameEnvelope): boolean => {
	if (envelope.kind === 'reply') return true;
	const stream = (envelope.frame as IpcStreamMessage).stream;
	return stream === 'done' || stream === 'error';
};

interface Pending {
	readonly lifetime?: RequestLifetime | undefined;
	readonly threadId: number;
	readonly method: string;
	readonly stream: boolean;
	readonly deliver: DeliverEnvelope;
}

/** A request in flight on a worker that exited, for the caller to fail. */
export interface OrphanedRequest {
	readonly requestId: string;
	readonly method: string;
	readonly stream: boolean;
	readonly deliver: DeliverEnvelope;
}

interface Held {
	readonly cls: MethodClass;
	readonly request: LocalRequestEnvelope;
	readonly deliver: DeliverEnvelope;
	readonly timer: NodeJS.Timeout;
	/** Held for the shared-state target (Router.request with shared), not the class's own. */
	readonly shared?: true | undefined;
	cancelled: boolean;
	/** Set once the request has been sent to a worker. */
	sentTo?: number;
	/** Set once the request was handed to this thread because its class stopped being routed. */
	localCancel?: () => void;
}

const isReplyOrFrame = (m: unknown): m is ReplyEnvelope | FrameEnvelope => {
	const kind = (m as { kind?: unknown } | null)?.kind;
	return kind === 'reply' || kind === 'frame';
};

export class Router {
	private readonly ports = new Map<number, MessagePort>();
	private readonly listeners = new Map<number, (msg: unknown) => void>();
	private readonly pending = new Map<string, Pending>();
	private readonly held = new Set<Held>();
	private readonly fifos = new Map<string, Fifo>();
	private sessions: RouterSessions | undefined;
	/** The thread that owns a detached run (the status board), for workflow.run.abort. */
	private runOwner: ((runId: string) => number | undefined) | undefined;
	private readonly holdMs: number;
	/** opts.local, each request under the maintenance lock's request hold. */
	private readonly local: ForwardRequest;
	private seq = 0;

	constructor(private readonly opts: RouterOptions) {
		this.holdMs = opts.holdMs ?? DEFAULT_HOLD_MS;
		this.sessions = opts.sessions;
		this.local = holdingForward(opts.local);
	}

	/** Route session work through the session pool from now on (s3); `runOwner` names a detached run's owner thread. */
	useSessions(sessions: RouterSessions, runOwner?: (runId: string) => number | undefined): void {
		this.sessions = sessions;
		this.runOwner = runOwner;
	}

	/**
	 * A pool worker exited (s3): the requests it was serving are answered 'session worker
	 * failed: <reason>' (an error frame for a stream), and so are its session's queued ones.
	 */
	failWorker(threadId: number, reason: string, session?: SessionId): void {
		const error = `session worker failed: ${reason}`;
		const answer = (requestId: string, stream: boolean, deliver: DeliverEnvelope): void => {
			deliver(stream
				? { kind: 'frame', requestId, frame: { id: 0, stream: 'error', data: { error, recoverable: true } } }
				: { kind: 'reply', requestId, error });
		};
		if (session !== undefined) {
			// The queue first: the running request's failure below would otherwise send the next one to the dead worker.
			const fifo = this.fifos.get(`${session.label}:${session.pid}`);
			for (const item of fifo?.waiting.splice(0) ?? []) {
				try { answer(item.request.requestId, item.request.stream, item.deliver); }
				finally { item.request.lifetime?.complete(); }
			}
			if (fifo !== undefined) this.sessions?.setQueued(session, 0);
		}
		for (const orphan of this.detach(threadId)) answer(orphan.requestId, orphan.stream, orphan.deliver);
	}

	/** The forward the IpcServer uses. */
	readonly forward: ForwardRequest = (request, deliver) => {
		const cls = this.opts.classOf(request.method);
		const ended = this.opts.onRequest?.(request.method, cls);
		let finished = false;
		const finish = (): void => { if (!finished) { finished = true; ended?.(); } };
		if (request.lifetime) void Promise.all([request.lifetime.completed, request.lifetime.drained]).then(finish);
		// A request cancelled while still held for a worker gets no reply: its activity ends at the cancel.
		const dropped = (): void => { if (!request.lifetime) finish(); };
		const cancel = this.dispatch(cls, request, envelope => {
			try { deliver(envelope); }
			finally {
				if (envelope.kind === 'reply') {
					if (!request.stream) request.lifetime?.complete();
					if (!request.lifetime) finish();
				} else {
					const stream = (envelope.frame as IpcStreamMessage).stream;
					if (!request.lifetime && (stream === 'done' || stream === 'error')) finish();
				}
			}
		}, dropped);
		return () => { if (request.stream && !request.lifetime) finish(); cancel(); };
	};

	private dispatch(cls: MethodClass | undefined, request: LocalRequestEnvelope, deliver: DeliverEnvelope, dropped: () => void = () => {}): () => void {
		if (request.trustedContext?.connectionSession !== undefined || request.trustedContext?.connectionExecution?.mode === 'session-memory'
			|| MAIN_DAEMON_CONNECTION_METHODS.has(request.method) || cls === undefined || !this.opts.routed.has(cls)) return this.local(request, deliver);
		if (cls === 'session' && this.sessions !== undefined) return this.dispatchSession(request, deliver, dropped);
		const target = this.opts.registry.targetFor(cls);
		if (target !== undefined && this.ports.has(target.threadId)) return this.send(target.threadId, request, deliver);
		return this.hold(cls, request, deliver, dropped);
	}

	/** A session-class request (s3): to the shared-state worker or the session's worker, through the session's FIFO unless exempt or unattributed. */
	private dispatchSession(request: LocalRequestEnvelope, deliver: DeliverEnvelope, dropped: () => void): () => void {
		// An abort goes to the thread that owns the run, whichever session sends it.
		if (request.method === 'workflow.run.abort') {
			const owner = this.runOwner?.(String((request.params as { runId?: unknown } | null)?.runId ?? ''));
			if (owner !== undefined && this.ports.has(owner)) return this.send(owner, request, deliver);
		}
		const shared = SHARED_STATE_METHODS.has(request.method);
		const send = (d: DeliverEnvelope): () => void => shared
			? this.toShared(request, d, dropped)
			: this.toSessionWorker(request.session, request, d, dropped);
		if (request.session === undefined || FIFO_EXEMPT_METHODS.has(request.method)) return send(deliver);
		return this.enqueue(request.session, request, deliver, send, dropped);
	}

	/** To the shared-state worker, which the pool starts (again, after an exit) when there is none. */
	private toShared(request: LocalRequestEnvelope, deliver: DeliverEnvelope, dropped: () => void): () => void {
		const target = this.opts.registry.targetFor('session', undefined, { shared: true });
		if (target !== undefined && this.ports.has(target.threadId)) return this.send(target.threadId, request, deliver);
		return this.toPoolWorker(() => this.sessions!.sharedWorker(), request, deliver, dropped);
	}

	/** To the session's worker (the unattributed worker for no session), started by the pool if it has none. */
	private toSessionWorker(session: SessionId | undefined, request: LocalRequestEnvelope, deliver: DeliverEnvelope, dropped: () => void): () => void {
		const sessions = this.sessions!;
		// Reported started once the pool has the worker (a start before it would be lost, and the idle sweep could
		// release the worker mid-request); reported ended only if it was reported started.
		let begun = false;
		const worker = (): Promise<{ readonly threadId: number }> => sessions.workerFor(session).then(w => { sessions.started(session); begun = true; return w; });
		return this.toPoolWorker(worker, request, deliver, dropped, () => { if (begun) sessions.ended(session); });
	}

	/** To a pool worker once `worker` resolves; `done` runs once when the request ends, fails or is cancelled first. */
	private toPoolWorker(worker: () => Promise<{ readonly threadId: number }>, request: LocalRequestEnvelope, deliver: DeliverEnvelope, dropped: () => void, done: () => void = () => {}): () => void {
		let cancelled = false;
		let sent: (() => void) | undefined;
		let ended = false;
		const end = (): void => { if (!ended) { ended = true; done(); } };
		const fail = (error: string): void => {
			try {
				deliver(request.stream
					? { kind: 'frame', requestId: request.requestId, frame: { id: 0, stream: 'error', data: { error, recoverable: true } } }
					: { kind: 'reply', requestId: request.requestId, error });
			} finally { request.lifetime?.complete(); end(); }
		};
		const tracked: DeliverEnvelope = envelope => {
			try { deliver(envelope); } finally { if (isTerminal(envelope)) end(); }
		};
		void worker().then(
			worker => {
				if (cancelled) { end(); return; }
				if (!this.ports.has(worker.threadId)) { fail('the session\'s worker thread is not available'); return; }
				sent = this.send(worker.threadId, request, tracked);
			},
			(err: unknown) => { if (!cancelled) fail(err instanceof Error ? err.message : String(err)); else end(); },
		);
		return () => {
			cancelled = true;
			if (sent !== undefined) { sent(); return; }
			request.lifetime?.abort();
			request.lifetime?.complete();
			end();
			dropped();
		};
	}

	/** Through the session's FIFO: sent once the session's previous request has ended. */
	private enqueue(session: SessionId, request: LocalRequestEnvelope, deliver: DeliverEnvelope, send: (d: DeliverEnvelope) => () => void, dropped: () => void): () => void {
		const key = `${session.label}:${session.pid}`;
		let fifo = this.fifos.get(key);
		if (fifo === undefined) { fifo = { session, waiting: [] }; this.fifos.set(key, fifo); }
		const f = fifo;
		const item: Queued = {
			request, deliver, started: false,
			run: () => {
				item.started = true;
				item.cancel = send(envelope => {
					try { deliver(envelope); } finally { if (isTerminal(envelope)) this.next(key, item); }
				});
			},
			drop: () => {
				request.lifetime?.abort();
				request.lifetime?.complete();
				dropped();
			},
		};
		if (f.running === undefined) { f.running = item; item.run(); }
		else { f.waiting.push(item); this.sessions!.setQueued(session, f.waiting.length); }
		return () => {
			if (!item.started) {
				const at = f.waiting.indexOf(item);
				if (at >= 0) { f.waiting.splice(at, 1); this.sessions!.setQueued(session, f.waiting.length); }
				item.drop();
				return;
			}
			item.cancel?.();
			this.next(key, item);
		};
	}

	/** `item` ended (or was cancelled): the next request of its session's FIFO starts. */
	private next(key: string, item: Queued): void {
		const fifo = this.fifos.get(key);
		if (fifo === undefined || fifo.running !== item) return;
		fifo.running = fifo.waiting.shift();
		this.sessions!.setQueued(fifo.session, fifo.waiting.length);
		if (fifo.running !== undefined) fifo.running.run();
		else this.fifos.delete(key);
	}

	/**
	 * Ask the worker of `cls` directly (not through classOf): the indexing port
	 * and in-daemon calls. Held like a socket request while no worker is
	 * registered. underHold marks a call made under the caller's maintenance
	 * hold; by default, whether this context holds it (a nested call). shared sends a
	 * session-class call to the shared-state worker (s3); it never enters a session FIFO.
	 */
	request(cls: MethodClass, method: string, params: unknown, opts: { readonly underHold?: boolean | undefined; readonly shared?: true | undefined } = {}): Promise<unknown> {
		const request: LocalRequestEnvelope = {
			kind: 'request', requestId: `internal-${++this.seq}`, method, params, stream: false,
			...((opts.underHold ?? holdsMaintenanceLock()) ? { underHold: true } : {}),
		};
		return new Promise((resolve, reject) => {
			const deliver: DeliverEnvelope = (envelope) => {
				if (envelope.kind !== 'reply') return;
				if (envelope.error !== undefined) reject(new Error(envelope.error)); else resolve(envelope.result);
			};
			const target = this.opts.registry.targetFor(cls, undefined, { shared: opts.shared });
			if (target !== undefined && this.ports.has(target.threadId)) this.send(target.threadId, request, deliver);
			else if (opts.shared && this.sessions !== undefined) this.toPoolWorker(() => this.sessions!.sharedWorker(), request, deliver, () => {});
			else this.hold(cls, request, deliver, () => {}, opts.shared);
		});
	}

	/** A worker's channel: its replies and frames are routed back to their requests. */
	attach(threadId: number, port: MessagePort): void {
		const onMessage = (msg: unknown): void => {
			const completion = (msg as { kind?: string } | null)?.kind === 'complete';
			if (!isReplyOrFrame(msg) && !completion) return;
			const response = msg as ReplyEnvelope | FrameEnvelope;
			const pending = this.pending.get(response.requestId);
			if (pending === undefined || pending.threadId !== threadId) return;
			if (completion) {
				if (pending.lifetime) { this.pending.delete(response.requestId); pending.lifetime.complete(); }
				return;
			}
			if (response.kind === 'reply') { if (!pending.lifetime) this.pending.delete(response.requestId); }
			else {
				const stream = ((response as FrameEnvelope).frame as IpcStreamMessage).stream;
				if (!pending.lifetime && (stream === 'done' || stream === 'error')) this.pending.delete(response.requestId);
			}
			pending.deliver(response);
		};
		this.ports.set(threadId, port);
		this.listeners.set(threadId, onMessage);
		port.on('message', onMessage);
		this.targetsChanged();
	}

	/** Forget a worker's channel (it exited); its in-flight requests are returned for the caller to fail. */
	detach(threadId: number): OrphanedRequest[] {
		const port = this.ports.get(threadId);
		const listener = this.listeners.get(threadId);
		if (port !== undefined && listener !== undefined) port.off('message', listener);
		this.ports.delete(threadId);
		this.listeners.delete(threadId);
		const orphaned: OrphanedRequest[] = [];
		for (const [requestId, p] of this.pending) {
			if (p.threadId !== threadId) continue;
			this.pending.delete(requestId);
			p.lifetime?.complete();
			orphaned.push({ requestId, method: p.method, stream: p.stream, deliver: p.deliver });
		}
		return orphaned;
	}

	/**
	 * A target registered, or a class stopped being routed: send the requests
	 * held for a registered target, and serve here those whose class is no
	 * longer routed.
	 */
	targetsChanged(): void {
		for (const h of [...this.held]) {
			if (h.cancelled) { this.release(h); continue; }
			if (!this.opts.routed.has(h.cls)) {
				this.release(h);
				h.localCancel = this.local(h.request, h.deliver);
				continue;
			}
			const target = this.opts.registry.targetFor(h.cls, undefined, { shared: h.shared });
			if (target === undefined || !this.ports.has(target.threadId)) continue;
			this.release(h);
			h.sentTo = target.threadId;
			this.send(target.threadId, h.request, h.deliver);
		}
	}

	private send(threadId: number, request: LocalRequestEnvelope, deliver: DeliverEnvelope): () => void {
		const port = this.ports.get(threadId)!;
		this.pending.set(request.requestId, { threadId, method: request.method, stream: request.stream, deliver, ...(request.stream && request.lifetime ? { lifetime: request.lifetime } : {}) });
		try { port.postMessage(wireRequest(request)); }
		catch {
			this.pending.delete(request.requestId);
			try { deliver({kind:'reply', requestId:request.requestId, error:'request channel unavailable'}); }
			finally { request.lifetime?.complete(); }
		}
		return () => this.cancel(threadId, request);
	}

	private hold(cls: MethodClass, request: LocalRequestEnvelope, deliver: DeliverEnvelope, dropped: () => void = () => {}, shared?: true): () => void {
		const held: Held = {
			cls, request, deliver, cancelled: false, ...(shared ? { shared } : {}),
			timer: setTimeout(() => {
				this.release(held);
				if (held.cancelled) return;
				log.warn({ method: request.method, cls, holdMs: this.holdMs }, 'router: no worker registered for the request\'s class in time');
				try { deliver({ kind: 'reply', requestId: request.requestId, error: `the daemon's ${cls} thread is not available` }); }
				finally { request.lifetime?.complete(); }
			}, this.holdMs),
		};
		this.held.add(held);
		return () => {
			if (held.sentTo !== undefined) { this.cancel(held.sentTo, request); return; }
			if (held.localCancel !== undefined) { held.localCancel(); return; }
			held.cancelled = true;
			request.lifetime?.abort();
			request.lifetime?.complete();
			this.release(held);
			dropped();
		};
	}

	private release(h: Held): void {
		clearTimeout(h.timer);
		this.held.delete(h);
	}

	/** The request's socket closed: a stream is cancelled on its worker; a unary request runs on and its reply is dropped there. */
	private cancel(threadId: number, request: LocalRequestEnvelope): void {
		if (!request.stream) return;
		request.lifetime?.abort();
		if (!request.lifetime) this.pending.delete(request.requestId);
		this.ports.get(threadId)?.postMessage({ kind: 'cancel', requestId: request.requestId } satisfies CancelEnvelope);
	}
}
