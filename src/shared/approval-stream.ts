/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The client side of the approval stream (sc4), shared by the terminal client and the editor so
 * the reconnect and shutdown rules live in one place: open `approval.subscribe`, hand each
 * request and each cancel to the client, and when the stream ends (the daemon went away) tell the
 * client to forget what it showed, then open the stream again after a delay until stop().
 */

import type { IpcClient, IpcStreamHandle } from './ipc-client.js';
import type { ApprovalGateFrame, ApprovalRequest } from './types.js';

export interface ApprovalStreamOpts {
	readonly client:      IpcClient;
	readonly reconnectMs?: number | undefined;
	readonly onRequest:   (request: ApprovalRequest) => void;
	readonly onCancel:    (requestId: string) => void;
	/** The stream ended or was stopped: everything that was waiting is gone (the daemon denies it). */
	readonly onEnd:       (err?: Error) => void;
}

export interface ApprovalStream {
	start(): void;
	stop(): void;
}

export function createApprovalStream(opts: ApprovalStreamOpts): ApprovalStream {
	const reconnectMs = opts.reconnectMs ?? 2000;
	let handle: IpcStreamHandle | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = true;

	const open = (): void => {
		if (stopped || handle !== undefined || opts.client.stream === undefined) return;
		handle = opts.client.stream('approval.subscribe', {}, msg => {
			if (msg.stream !== 'gate') return;
			const frame = msg.data as ApprovalGateFrame;
			if (frame.type === 'request') opts.onRequest(frame.request);
			else if (frame.type === 'cancel') opts.onCancel(frame.requestId);
		}, err => {
			handle = undefined;
			opts.onEnd(err);
			if (stopped) return;
			timer = setTimeout(open, reconnectMs);
			timer.unref?.();
		});
	};

	return {
		start() { stopped = false; open(); },
		stop() {
			stopped = true;
			if (timer !== undefined) clearTimeout(timer);
			timer = undefined;
			const h = handle; handle = undefined;
			if (h !== undefined) h.close();   // IpcStreamHandle.close() runs onClose once, which calls onEnd
			else opts.onEnd();
		},
	};
}
