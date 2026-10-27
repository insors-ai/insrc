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
 */

import type { MessagePort } from 'node:worker_threads';

import { getLogger } from '../../shared/logger.js';
import { holdsMaintenanceLock } from '../../shared/locks/maintenance-lock.js';
import type { IpcStreamMessage } from '../../shared/types.js';
import type { RequestLifetime } from '../request-context.js';
import type { DeliverEnvelope, ForwardRequest } from '../server.js';
import type { CancelEnvelope, FrameEnvelope, MethodClass, ReplyEnvelope, LocalRequestEnvelope } from './channel.js';
import { MAIN_DAEMON_CONNECTION_METHODS } from './method-class.js';
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
	readonly onRequest?: ((method: string, cls: MethodClass | undefined) => () => void) | undefined;
}

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
	private readonly holdMs: number;
	/** opts.local, each request under the maintenance lock's request hold. */
	private readonly local: ForwardRequest;
	private seq = 0;

	constructor(private readonly opts: RouterOptions) {
		this.holdMs = opts.holdMs ?? DEFAULT_HOLD_MS;
		this.local = holdingForward(opts.local);
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
		const target = this.opts.registry.targetFor(cls);
		if (target !== undefined && this.ports.has(target.threadId)) return this.send(target.threadId, request, deliver);
		return this.hold(cls, request, deliver, dropped);
	}

	/**
	 * Ask the worker of `cls` directly (not through classOf): the indexing port
	 * and in-daemon calls. Held like a socket request while no worker is
	 * registered. underHold marks a call made under the caller's maintenance
	 * hold; by default, whether this context holds it (a nested call).
	 */
	request(cls: MethodClass, method: string, params: unknown, opts: { readonly underHold?: boolean | undefined } = {}): Promise<unknown> {
		const request: LocalRequestEnvelope = {
			kind: 'request', requestId: `internal-${++this.seq}`, method, params, stream: false,
			...((opts.underHold ?? holdsMaintenanceLock()) ? { underHold: true } : {}),
		};
		return new Promise((resolve, reject) => {
			const deliver: DeliverEnvelope = (envelope) => {
				if (envelope.kind !== 'reply') return;
				if (envelope.error !== undefined) reject(new Error(envelope.error)); else resolve(envelope.result);
			};
			const target = this.opts.registry.targetFor(cls);
			if (target !== undefined && this.ports.has(target.threadId)) this.send(target.threadId, request, deliver);
			else this.hold(cls, request, deliver);
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
			const target = this.opts.registry.targetFor(h.cls);
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

	private hold(cls: MethodClass, request: LocalRequestEnvelope, deliver: DeliverEnvelope, dropped: () => void = () => {}): () => void {
		const held: Held = {
			cls, request, deliver, cancelled: false,
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
