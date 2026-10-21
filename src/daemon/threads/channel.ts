/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Thread channel (Epic 86197ac6, Story s1, contract sc3): the message contract
 * between the daemon's main thread and its worker threads.
 *
 * Two kinds of traffic cross a channel port:
 * - request routing: request, reply, stream-frame and cancel envelopes that
 *   carry an IPC request to the worker serving it and its answer back;
 * - the hub: a worker asks the main thread's shared services (step state,
 *   status board, registry) with a request that gets one reply, or tells them
 *   something with a one-way message.
 *
 * The worker side of the hub is HubClient. When its port closes, every request
 * still waiting is rejected with HubUnavailableError, so none hangs.
 */

import type { MessagePort } from 'node:worker_threads';

import { getLogger } from '../../shared/logger.js';

const log = getLogger('thread-channel');

// ---------------------------------------------------------------------------
// Request routing envelopes (sc3)
// ---------------------------------------------------------------------------

export type MethodClass = 'admin' | 'session' | 'indexing';

export interface SessionId { readonly label: string; readonly pid: number; }

export interface RequestEnvelope {
	readonly kind: 'request';
	readonly requestId: string;
	readonly method: string;
	readonly params: unknown;
	readonly stream: boolean;
	readonly session?: SessionId | undefined;
}
export interface ReplyEnvelope { readonly kind: 'reply'; readonly requestId: string; readonly result?: unknown; readonly error?: string | undefined; }
export interface FrameEnvelope { readonly kind: 'frame'; readonly requestId: string; readonly frame: unknown; }
export interface CancelEnvelope { readonly kind: 'cancel'; readonly requestId: string; }
export type ChannelEnvelope = RequestEnvelope | ReplyEnvelope | FrameEnvelope | CancelEnvelope;

// ---------------------------------------------------------------------------
// Hub protocol
// ---------------------------------------------------------------------------

/** A worker's request to a main-thread service; answered by exactly one HubReply. */
export interface HubRequest { readonly kind: 'hub-request'; readonly requestId: string; readonly op: string; readonly args: unknown; }
export type HubReply =
	| { readonly kind: 'hub-reply'; readonly requestId: string; readonly ok: true; readonly value: unknown }
	| { readonly kind: 'hub-reply'; readonly requestId: string; readonly ok: false; readonly error: { readonly name: string; readonly message: string } };
/** A worker's one-way message to a main-thread service (status publishes); never answered. */
export interface HubMessage { readonly kind: 'hub-message'; readonly op: string; readonly args: unknown; }

export type HubHandler = (args: unknown) => unknown;
export type HubHandlers = Readonly<Record<string, HubHandler>>;

export class HubUnavailableError extends Error {
	constructor(op: string, why: string) {
		super(`hub request '${op}' failed: ${why}`);
		this.name = 'HubUnavailableError';
	}
}

/** An error a hub service threw, re-raised in the worker with its name and message. */
export class HubRemoteError extends Error {
	constructor(name: string, message: string) {
		super(message);
		this.name = name;
	}
}

/** The port a hub speaks over: a MessagePort, or a worker's parentPort. */
type Port = Pick<MessagePort, 'postMessage' | 'on' | 'off'>;

/**
 * Serve the main thread's hub services on one worker's port. A request whose
 * op has no handler is answered with an error, never left unanswered.
 */
export function serveHub(port: Port, handlers: HubHandlers): () => void {
	const onMessage = (msg: unknown): void => {
		if (isHubMessage(msg)) {
			const handler = handlers[msg.op];
			if (handler === undefined) { log.warn({ op: msg.op }, 'hub: no handler for one-way message'); return; }
			try { void handler(msg.args); } catch (e) { log.warn({ op: msg.op, err: (e as Error).message }, 'hub: one-way handler threw'); }
			return;
		}
		if (!isHubRequest(msg)) return;
		const reply = (r: HubReply): void => port.postMessage(r);
		const handler = handlers[msg.op];
		if (handler === undefined) {
			reply({ kind: 'hub-reply', requestId: msg.requestId, ok: false, error: { name: 'HubUnknownOpError', message: `no hub service for '${msg.op}'` } });
			return;
		}
		Promise.resolve()
			.then(() => handler(msg.args))
			.then(value => reply({ kind: 'hub-reply', requestId: msg.requestId, ok: true, value }),
			      (e: unknown) => reply({ kind: 'hub-reply', requestId: msg.requestId, ok: false, error: errorShape(e) }));
	};
	port.on('message', onMessage);
	return () => port.off('message', onMessage);
}

/** A worker's client for the main thread's hub. */
export class HubClient {
	private readonly pending = new Map<string, { readonly op: string; readonly resolve: (v: unknown) => void; readonly reject: (e: Error) => void }>();
	private seq = 0;
	private closed = false;

	constructor(private readonly port: Port & Pick<MessagePort, 'once'>) {
		port.on('message', (msg: unknown) => {
			if (!isHubReply(msg)) return;
			const waiting = this.pending.get(msg.requestId);
			if (waiting === undefined) return;
			this.pending.delete(msg.requestId);
			if (msg.ok) waiting.resolve(msg.value);
			else waiting.reject(new HubRemoteError(msg.error.name, msg.error.message));
		});
		port.once('close', () => this.fail('the hub port closed'));
	}

	/** Ask a hub service; resolves with its answer, rejects with its error or with HubUnavailableError. */
	request<T>(op: string, args: unknown): Promise<T> {
		if (this.closed) return Promise.reject(new HubUnavailableError(op, 'the hub port is closed'));
		const requestId = `h${++this.seq}`;
		return new Promise<T>((resolve, reject) => {
			this.pending.set(requestId, { op, resolve: resolve as (v: unknown) => void, reject });
			try {
				this.port.postMessage({ kind: 'hub-request', requestId, op, args } satisfies HubRequest);
			} catch (e) {
				this.pending.delete(requestId);
				reject(e as Error);   // e.g. DataCloneError for a payload that cannot cross threads
			}
		});
	}

	/** Tell a hub service something; no answer. */
	send(op: string, args: unknown): void {
		if (this.closed) return;
		this.port.postMessage({ kind: 'hub-message', op, args } satisfies HubMessage);
	}

	/** Requests still waiting for an answer. */
	get pendingCount(): number { return this.pending.size; }

	private fail(why: string): void {
		this.closed = true;
		for (const [id, waiting] of this.pending) {
			this.pending.delete(id);
			waiting.reject(new HubUnavailableError(waiting.op, why));
		}
	}
}

function errorShape(e: unknown): { readonly name: string; readonly message: string } {
	return e instanceof Error ? { name: e.name, message: e.message } : { name: 'Error', message: String(e) };
}

function isObj(m: unknown): m is Record<string, unknown> { return typeof m === 'object' && m !== null; }
function isHubRequest(m: unknown): m is HubRequest { return isObj(m) && m['kind'] === 'hub-request' && typeof m['requestId'] === 'string' && typeof m['op'] === 'string'; }
function isHubMessage(m: unknown): m is HubMessage { return isObj(m) && m['kind'] === 'hub-message' && typeof m['op'] === 'string'; }
function isHubReply(m: unknown): m is HubReply { return isObj(m) && m['kind'] === 'hub-reply' && typeof m['requestId'] === 'string'; }
