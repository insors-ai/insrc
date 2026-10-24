/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's one approval broker and its IPC handlers (sc4).
 *
 *   approval.subscribe (stream)  a client opens it and receives `gate` frames (ApprovalGateFrame);
 *                                closing the socket closes the subscription
 *   approval.answer    (rpc)     { requestId, decision } -> { accepted }
 *
 * The executor reaches the broker through getApprovalGate(); no caller can supply or replace it.
 */

import type { ApprovalAnswerParams, ApprovalAnswerResult, IpcStreamMessage } from '../shared/types.js';
import { ApprovalBroker } from './approval-broker.js';
import type { ApprovalGate } from './tools/types.js';

export function createApprovalRpc(broker: ApprovalBroker) {
	return {
		async subscribe(_params: unknown, send: (msg: IpcStreamMessage) => void, signal: AbortSignal): Promise<void> {
			if (signal.aborted) return;
			const close = broker.subscribe(frame => send({ id: 0, stream: 'gate', data: frame }));
			await new Promise<void>(resolve => {
				if (signal.aborted) { resolve(); return; }
				signal.addEventListener('abort', () => resolve(), { once: true });
			});
			close();
		},

		async answer(params: unknown): Promise<ApprovalAnswerResult> {
			const p = params as Partial<ApprovalAnswerParams> | null;
			if (p === null || typeof p !== 'object' || typeof p.requestId !== 'string' || (p.decision !== 'approve' && p.decision !== 'decline')) {
				throw new Error('approval.answer needs { requestId: string, decision: "approve" | "decline" }');
			}
			return broker.answer(p.requestId, p.decision);
		},
	};
}

/** The daemon's single broker, created when this module loads (at daemon start). */
export const approvalBroker = new ApprovalBroker();
const rpc = createApprovalRpc(approvalBroker);
export const approvalSubscribe = rpc.subscribe;
export const approvalAnswer = rpc.answer;

export function getApprovalGate(): ApprovalGate {
	return approvalBroker;
}
