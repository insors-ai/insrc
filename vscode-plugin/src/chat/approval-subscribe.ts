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

import type { IpcClient } from '../../../src/shared/ipc-client.js';
import { createApprovalStream } from '../../../src/shared/approval-stream.js';
import type { ApprovalAnswerResult, ApprovalRequest } from '../../../src/shared/types.js';

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
	/** Tell the user something that is not a question (an answer that arrived too late). */
	notice?(text: string): void;
}

export interface ApprovalPrompter {
	start(): void;
	stop(): void;
	/** The requests whose notification is still open. */
	open(): readonly string[];
}

const ARG_MAX = 300;

/** The notification text: tool, repository and the exact arguments; a long one keeps its length. */
export function approvalText(r: ApprovalRequest): string {
	const args = JSON.stringify(r.arguments);
	const shown = args.length > ARG_MAX ? `${args.slice(0, ARG_MAX)}... [${args.length} characters in total; see the full call]` : args;
	const kind = r.approvalClass === 'destructive' ? 'Destructive call' : 'Approval needed';
	return `${kind}: ${r.toolId} in ${r.repoPath} with ${shown}`;
}

/** The whole request, as the user can inspect it before answering (what the notification cannot hold). */
export function approvalDetails(r: ApprovalRequest): string {
	return JSON.stringify({
		tool: r.toolId, class: r.approvalClass, repository: r.repoPath, arguments: r.arguments,
		...(r.preview !== undefined ? { preview: r.preview } : {}), reason: r.reason, expiresAt: r.expiresAt,
	}, null, 2);
}

export function createApprovalPrompter(opts: {
	readonly client: IpcClient;
	readonly notifier: ApprovalNotifier;
	readonly reconnectMs?: number | undefined;
}): ApprovalPrompter {
	const { client, notifier } = opts;
	const shown = new Map<string, ShownApproval>();

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
		void Promise.resolve(s.choice).then(async choice => {
			// Closed by a cancel frame (or by a restart) before the user clicked: send nothing.
			if (shown.get(request.requestId) !== s) return;
			shown.delete(request.requestId);
			if (choice === undefined) return; // dismissed: the request stays open on other screens until it times out
			const result = await client.rpc<ApprovalAnswerResult>('approval.answer', { requestId: request.requestId, decision: choice });
			if (!result.accepted) notifier.notice?.(`${request.toolId}: that approval request was no longer open (it timed out, was cancelled or was answered elsewhere)`);
		}).catch(err => {
			notifier.notice?.(`${request.toolId}: your answer could not be sent (${err instanceof Error ? err.message : String(err)}); the call was denied`);
		});
	};

	const stream = createApprovalStream({
		client,
		reconnectMs: opts.reconnectMs,
		onRequest,
		onCancel: id => forget(id, true),
		// The daemon denied what was open when the stream ended.
		onEnd: () => { for (const id of [...shown.keys()]) forget(id, true); },
	});

	return {
		start: () => stream.start(),
		stop: () => stream.stop(),
		open: () => [...shown.keys()],
	};
}
