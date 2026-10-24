/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The editor's side of the approval exchange (sc4). It opens the daemon's `approval.subscribe`
 * stream when the extension attaches, shows each request as a notification with Approve and
 * Decline that names the tool, the repository and the exact arguments, answers through
 * `approval.answer`, forgets a request on a cancel frame, and reopens the stream after a daemon
 * restart. This module imports no editor API: the extension hands it a notifier built on the
 * real one.
 *
 * VS Code has no call that dismisses a message it has shown. A cancel frame therefore closes the
 * request here (a later click on the old notification sends nothing) and the notifier is told
 * to close it, which a notifier built on a closable surface can do.
 */

import type { IpcClient, IpcStreamHandle } from '../../../src/shared/ipc-client.js';
import type { ApprovalAnswerResult, ApprovalGateFrame, ApprovalRequest } from '../../../src/shared/types.js';

export type ApprovalChoice = 'approve' | 'decline';

/** One shown notification. */
export interface ShownApproval {
	/** The user's choice, or undefined when the notification was dismissed without one. */
	readonly choice: PromiseLike<ApprovalChoice | undefined>;
	/** Close the notification if the surface can. */
	close(): void;
}

export interface ApprovalNotifier {
	show(text: string, request: ApprovalRequest): ShownApproval;
}

export interface ApprovalPrompter {
	start(): void;
	stop(): void;
	/** The requests whose notification is still open. */
	open(): readonly string[];
}

const ARG_MAX = 300;

/** The notification text: tool, repository and the exact arguments. */
export function approvalText(r: ApprovalRequest): string {
	const args = JSON.stringify(r.arguments);
	const shown = args.length > ARG_MAX ? `${args.slice(0, ARG_MAX)}...` : args;
	const kind = r.approvalClass === 'destructive' ? 'Destructive call' : 'Approval needed';
	return `${kind}: ${r.toolId} in ${r.repoPath} with ${shown}`;
}

export function createApprovalPrompter(opts: {
	readonly client: IpcClient;
	readonly notifier: ApprovalNotifier;
	readonly reconnectMs?: number;
}): ApprovalPrompter {
	const { client, notifier } = opts;
	const reconnectMs = opts.reconnectMs ?? 2000;
	const shown = new Map<string, ShownApproval>();
	let handle: IpcStreamHandle | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = true;

	const forget = (requestId: string, close: boolean): void => {
		const s = shown.get(requestId);
		if (s === undefined) return;
		shown.delete(requestId);
		if (close) { try { s.close(); } catch { /* the surface is gone */ } }
	};

	const onRequest = (request: ApprovalRequest): void => {
		if (shown.has(request.requestId)) return;
		const s = notifier.show(approvalText(request), request);
		shown.set(request.requestId, s);
		void Promise.resolve(s.choice).then(choice => {
			// Closed by a cancel frame (or by a restart) before the user clicked: send nothing.
			if (shown.get(request.requestId) !== s) return;
			shown.delete(request.requestId);
			if (choice === undefined) return; // dismissed: the request stays open on other screens until it times out
			return client.rpc<ApprovalAnswerResult>('approval.answer', { requestId: request.requestId, decision: choice });
		}).catch(() => { /* the daemon went away; the request is denied with it */ });
	};

	const onFrame = (msg: { stream: string; data: unknown }): void => {
		if (msg.stream !== 'gate') return;
		const frame = msg.data as ApprovalGateFrame;
		if (frame.type === 'request') onRequest(frame.request);
		else if (frame.type === 'cancel') forget(frame.requestId, true);
	};

	const connect = (): void => {
		if (stopped || handle !== undefined || client.stream === undefined) return;
		handle = client.stream('approval.subscribe', {}, onFrame, () => {
			handle = undefined;
			for (const id of [...shown.keys()]) forget(id, true); // the daemon denied them when the stream ended
			if (stopped) return;
			timer = setTimeout(connect, reconnectMs);
			timer.unref?.();
		});
	};

	return {
		start() { stopped = false; connect(); },
		stop() {
			stopped = true;
			if (timer !== undefined) clearTimeout(timer);
			const h = handle; handle = undefined;
			h?.close();
			for (const id of [...shown.keys()]) forget(id, true);
		},
		open: () => [...shown.keys()],
	};
}
