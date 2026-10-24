/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon-owned approval broker (sc4). It holds every pending approval request, the
 * timeout and the answer check, so no caller can replace the gate: the executor hands it
 * the exact call and waits; clients that opened an approval stream see the request and
 * answer by one RPC.
 *
 * - "A client is attached" means "at least one approval stream is open". With none open,
 *   ask() resolves 'no-client' at once.
 * - The first answer for a request wins; an unknown, expired or already answered id is refused.
 * - A request still pending when a client subscribes is replayed to it.
 * - When the last stream closes, every pending request resolves 'no-client'.
 * - Nothing is persisted: a restart loses the pending requests and the calls waiting on them
 *   fail with the connection.
 * - ask() never rejects.
 */

import { getLogger } from '../shared/logger.js';
import type { ApprovalGateFrame } from '../shared/types.js';
import type { ApprovalAnswer, ApprovalDenial, ApprovalGate, ApprovalRequest } from './tools/types.js';

const log = getLogger('approval-broker');

/** How long a request waits for an answer. */
export const APPROVAL_WAIT_MS = 300_000;

/** What a subscribed client is sent. 'cancel' closes a prompt that is no longer open, whatever the reason. */
export type ApprovalFrame = ApprovalGateFrame;

interface Pending {
	readonly request: ApprovalRequest;
	readonly settle:  (outcome: ApprovalAnswer | ApprovalDenial) => void;
	readonly timer:   ReturnType<typeof setTimeout>;
	readonly detach:  () => void;
}

export class ApprovalBroker implements ApprovalGate {
	private readonly pending = new Map<string, Pending>();
	private readonly streams = new Set<(frame: ApprovalFrame) => void>();

	/** Open an approval stream. Returns the function that closes it. Pending requests are replayed first. */
	subscribe(send: (frame: ApprovalFrame) => void): () => void {
		this.streams.add(send);
		for (const p of this.pending.values()) this.deliver(send, { type: 'request', request: p.request });
		return () => this.unsubscribe(send);
	}

	ask(request: ApprovalRequest, signal?: AbortSignal): Promise<ApprovalAnswer | ApprovalDenial> {
		if (this.streams.size === 0) return Promise.resolve('no-client');
		if (signal?.aborted === true) return Promise.resolve('cancelled');
		if (this.pending.has(request.requestId)) {
			log.error({ requestId: request.requestId }, 'duplicate approval request id; denying');
			return Promise.resolve('no-client');
		}
		return new Promise(resolve => {
			const wait = Math.max(0, Date.parse(request.expiresAt) - Date.now());
			const onAbort = (): void => this.finish(request.requestId, 'cancelled', 'cancelled');
			const timer = setTimeout(() => this.finish(request.requestId, 'timed-out', 'timed-out'), Number.isFinite(wait) ? wait : APPROVAL_WAIT_MS);
			signal?.addEventListener('abort', onAbort, { once: true });
			this.pending.set(request.requestId, {
				request, settle: resolve, timer,
				detach: () => signal?.removeEventListener('abort', onAbort),
			});
			this.broadcast({ type: 'request', request });
		});
	}

	/** Record a client's answer. Only the first answer for a pending request is accepted. */
	answer(requestId: string, decision: 'approve' | 'decline'): { accepted: boolean } {
		const p = this.pending.get(requestId);
		if (p === undefined) {
			log.warn({ requestId }, 'answer for an unknown, expired or already answered approval request');
			return { accepted: false };
		}
		// An answer that arrives after the expiry but before the timer callback ran does not count.
		if (Date.parse(p.request.expiresAt) <= Date.now()) {
			this.finish(requestId, 'timed-out', 'timed-out');
			return { accepted: false };
		}
		this.finish(requestId, decision === 'approve' ? { requestId, decision } : 'declined', 'answered');
		return { accepted: true };
	}

	/** Number of requests waiting for an answer. */
	get pendingCount(): number { return this.pending.size; }

	private finish(requestId: string, outcome: ApprovalAnswer | ApprovalDenial, reason: 'answered' | 'timed-out' | 'cancelled' | 'no-client'): void {
		const p = this.pending.get(requestId);
		if (p === undefined) return;
		this.pending.delete(requestId);
		clearTimeout(p.timer);
		p.detach();
		p.settle(outcome);
		if (reason !== 'no-client') this.broadcast({ type: 'cancel', requestId, reason });
	}

	private unsubscribe(send: (frame: ApprovalFrame) => void): void {
		if (!this.streams.delete(send)) return;
		if (this.streams.size > 0) return;
		for (const id of [...this.pending.keys()]) this.finish(id, 'no-client', 'no-client');
	}

	private broadcast(frame: ApprovalFrame): void {
		for (const send of [...this.streams]) this.deliver(send, frame);
	}

	private deliver(send: (frame: ApprovalFrame) => void, frame: ApprovalFrame): void {
		try { send(frame); } catch (err) { log.warn({ err: (err as Error).message }, 'approval frame could not be sent; dropping that stream'); this.unsubscribe(send); }
	}
}
