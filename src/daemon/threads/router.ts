/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The router (Epic 86197ac6, Story s2): the IpcServer's forward on the main
 * thread. Each request is classified with the method-class registry; a routed
 * class (admin, indexing) goes as a request envelope to the worker registered
 * for it, and its replies and frames come back over that worker's channel;
 * every other request runs in this thread, as before.
 *
 * A request whose worker is not registered (it is starting or being replaced)
 * is held until one registers, at most holdMs, then answered with an error.
 */

import type { MessagePort } from 'node:worker_threads';

import { getLogger } from '../../shared/logger.js';
import type { IpcStreamMessage } from '../../shared/types.js';
import type { DeliverEnvelope, ForwardRequest } from '../server.js';
import type { CancelEnvelope, FrameEnvelope, MethodClass, ReplyEnvelope, RequestEnvelope } from './channel.js';
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
}

interface Pending {
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
	readonly request: RequestEnvelope;
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
	private seq = 0;

	constructor(private readonly opts: RouterOptions) {
		this.holdMs = opts.holdMs ?? DEFAULT_HOLD_MS;
	}

	/** The forward the IpcServer uses. */
	readonly forward: ForwardRequest = (request, deliver) => {
		const cls = this.opts.classOf(request.method);
		if (cls === undefined || !this.opts.routed.has(cls)) return this.opts.local(request, deliver);
		const target = this.opts.registry.targetFor(cls);
		if (target !== undefined && this.ports.has(target.threadId)) return this.send(target.threadId, request, deliver);
		return this.hold(cls, request, deliver);
	};

	/**
	 * Ask the worker of `cls` directly (not through classOf): the indexing port
	 * and in-daemon calls. Held like a socket request while no worker is
	 * registered. underHold marks a call made under the caller's maintenance hold.
	 */
	request(cls: MethodClass, method: string, params: unknown, opts: { readonly underHold?: boolean | undefined } = {}): Promise<unknown> {
		const request: RequestEnvelope = {
			kind: 'request', requestId: `internal-${++this.seq}`, method, params, stream: false,
			...(opts.underHold === true ? { underHold: true } : {}),
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
			if (!isReplyOrFrame(msg)) return;
			const pending = this.pending.get(msg.requestId);
			if (pending === undefined) return;   // its socket closed, or the request was failed
			if (msg.kind === 'reply') this.pending.delete(msg.requestId);
			else {
				const stream = (msg.frame as IpcStreamMessage).stream;
				if (stream === 'done' || stream === 'error') this.pending.delete(msg.requestId);
			}
			pending.deliver(msg);
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
				h.localCancel = this.opts.local(h.request, h.deliver);
				continue;
			}
			const target = this.opts.registry.targetFor(h.cls);
			if (target === undefined || !this.ports.has(target.threadId)) continue;
			this.release(h);
			h.sentTo = target.threadId;
			this.send(target.threadId, h.request, h.deliver);
		}
	}

	private send(threadId: number, request: RequestEnvelope, deliver: DeliverEnvelope): () => void {
		const port = this.ports.get(threadId)!;
		this.pending.set(request.requestId, { threadId, method: request.method, stream: request.stream, deliver });
		port.postMessage(request);
		return () => this.cancel(threadId, request);
	}

	private hold(cls: MethodClass, request: RequestEnvelope, deliver: DeliverEnvelope): () => void {
		const held: Held = {
			cls, request, deliver, cancelled: false,
			timer: setTimeout(() => {
				this.release(held);
				if (held.cancelled) return;
				log.warn({ method: request.method, cls, holdMs: this.holdMs }, 'router: no worker registered for the request\'s class in time');
				deliver({ kind: 'reply', requestId: request.requestId, error: `the daemon's ${cls} thread is not available` });
			}, this.holdMs),
		};
		this.held.add(held);
		return () => {
			if (held.sentTo !== undefined) { this.cancel(held.sentTo, request); return; }
			if (held.localCancel !== undefined) { held.localCancel(); return; }
			held.cancelled = true;
			this.release(held);
		};
	}

	private release(h: Held): void {
		clearTimeout(h.timer);
		this.held.delete(h);
	}

	/** The request's socket closed: a stream is cancelled on its worker; a unary request runs on and its reply is dropped there. */
	private cancel(threadId: number, request: RequestEnvelope): void {
		if (!request.stream) return;
		this.pending.delete(request.requestId);
		this.ports.get(threadId)?.postMessage({ kind: 'cancel', requestId: request.requestId } satisfies CancelEnvelope);
	}
}
