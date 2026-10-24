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

import type { IpcClient } from '../../shared/ipc-client.js';
import { createApprovalStream } from '../../shared/approval-stream.js';
import type { ApprovalAnswerResult, ApprovalRequest } from '../../shared/types.js';

export interface ApprovalWatcher {
	/** The requests waiting for an answer, oldest first. */
	pending(): readonly ApprovalRequest[];
	/** Call `listener` whenever the list changes. Returns the unsubscribe function. */
	subscribe(listener: () => void): () => void;
	/** Open the stream (and reopen it when it ends) until stop(). */
	start(): void;
	stop(): void;
	/** A one-line message about the last answer that did not go through, or undefined. */
	notice(): string | undefined;
	/** Answer a request; it leaves the list at once and comes back if the answer cannot be sent. */
	answer(requestId: string, decision: 'approve' | 'decline'): Promise<ApprovalAnswerResult>;
}

export function createApprovalWatcher(opts: { readonly client: IpcClient; readonly reconnectMs?: number | undefined }): ApprovalWatcher {
	let requests: ApprovalRequest[] = [];
	let note: string | undefined;
	const listeners = new Set<() => void>();
	const changed = (): void => { for (const l of [...listeners]) l(); };
	const set = (next: ApprovalRequest[]): void => { requests = next; changed(); };
	const setNote = (text: string | undefined): void => { note = text; changed(); };

	const stream = createApprovalStream({
		client: opts.client,
		reconnectMs: opts.reconnectMs,
		onRequest: r => { if (!requests.some(x => x.requestId === r.requestId)) set([...requests, r]); },
		onCancel: id => { if (requests.some(x => x.requestId === id)) set(requests.filter(x => x.requestId !== id)); },
		// The daemon denies what was pending when the stream ended, so nothing is left to answer.
		onEnd: () => { if (requests.length > 0) set([]); },
	});

	return {
		pending: () => requests,
		notice: () => note,
		subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
		start() { stream.start(); },
		stop() { stream.stop(); },
		async answer(requestId, decision) {
			const request = requests.find(r => r.requestId === requestId);
			if (request === undefined) return { accepted: false };
			// The prompt leaves at once; if the answer does not reach the daemon it comes back, with the reason.
			set(requests.filter(r => r.requestId !== requestId));
			try {
				const result = await opts.client.rpc<ApprovalAnswerResult>('approval.answer', { requestId, decision });
				setNote(result.accepted ? undefined : `${request.toolId}: that request was no longer open (it timed out, was cancelled or was answered elsewhere)`);
				return result;
			} catch (err) {
				if (!requests.some(r => r.requestId === requestId)) set([request, ...requests]);
				setNote(`could not send your answer for ${request.toolId}: ${err instanceof Error ? err.message : String(err)}`);
				throw err;
			}
		},
	};
}
