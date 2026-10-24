/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The terminal client's side of the approval exchange (sc4). It opens the daemon's
 * `approval.subscribe` stream at attach, keeps the list of requests that are waiting for
 * an answer, answers through `approval.answer`, and reopens the stream after a daemon
 * restart (a restart loses the pending requests, so the list is cleared when the stream ends).
 */

import { getLogger } from '../../shared/logger.js';
import type { IpcClient, IpcStreamHandle } from '../../shared/ipc-client.js';
import type { ApprovalAnswerResult, ApprovalGateFrame, ApprovalRequest } from '../../shared/types.js';

const log = getLogger('cli-approval');

export interface ApprovalWatcher {
	/** The requests waiting for an answer, oldest first. */
	pending(): readonly ApprovalRequest[];
	/** Call `listener` whenever the list changes. Returns the unsubscribe function. */
	subscribe(listener: () => void): () => void;
	/** Open the stream (and reopen it when it ends) until stop(). */
	start(): void;
	stop(): void;
	/** Answer a request; it leaves the list at once. */
	answer(requestId: string, decision: 'approve' | 'decline'): Promise<ApprovalAnswerResult>;
}

export function createApprovalWatcher(opts: { readonly client: IpcClient; readonly reconnectMs?: number }): ApprovalWatcher {
	const { client } = opts;
	const reconnectMs = opts.reconnectMs ?? 2000;
	let requests: ApprovalRequest[] = [];
	const listeners = new Set<() => void>();
	let handle: IpcStreamHandle | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = true;

	const changed = (): void => { for (const l of [...listeners]) l(); };
	const set = (next: ApprovalRequest[]): void => { requests = next; changed(); };

	const onFrame = (msg: { stream: string; data: unknown }): void => {
		if (msg.stream !== 'gate') return;
		const frame = msg.data as ApprovalGateFrame;
		if (frame.type === 'request') {
			if (!requests.some(r => r.requestId === frame.request.requestId)) set([...requests, frame.request]);
		} else if (frame.type === 'cancel') {
			if (requests.some(r => r.requestId === frame.requestId)) set(requests.filter(r => r.requestId !== frame.requestId));
		}
	};

	const open = (): void => {
		if (stopped || handle !== undefined || client.stream === undefined) return;
		handle = client.stream('approval.subscribe', {}, onFrame, err => {
			handle = undefined;
			// The daemon denies what was pending when the stream ended, so nothing is left to answer.
			if (requests.length > 0) set([]);
			if (stopped) return;
			if (err !== undefined) log.debug({ err: err.message }, 'approval stream ended; reopening');
			timer = setTimeout(open, reconnectMs);
			timer.unref?.();
		});
	};

	return {
		pending: () => requests,
		subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
		start() { stopped = false; open(); },
		stop() {
			stopped = true;
			if (timer !== undefined) clearTimeout(timer);
			const h = handle; handle = undefined;
			h?.close();
			if (requests.length > 0) set([]);
		},
		async answer(requestId, decision) {
			if (requests.some(r => r.requestId === requestId)) set(requests.filter(r => r.requestId !== requestId));
			return client.rpc<ApprovalAnswerResult>('approval.answer', { requestId, decision });
		},
	};
}
