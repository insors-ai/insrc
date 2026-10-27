/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The maintenance lock at a request's entry (Epic 86197ac6, Story s2): the
 * router's forward for the requests this thread serves, and a worker's request
 * entry. A request takes 'daemon.maintenance' shared with no wait and holds it
 * until it ends (its reply, or its stream's last frame); refused, it is
 * answered "daemon busy: ..." and nothing runs.
 *
 * Not held: daemon.status (answered during maintenance), daemon.compact (it
 * starts maintenance), the subscription streams (they hold it per refresh,
 * so an open stream never blocks maintenance), a request made under the
 * caller's hold (underHold, or this context already holds it).
 */

import type { IpcStreamMessage } from '../../shared/types.js';
import { holdsMaintenanceLock, maintenanceLockEnabled, withRequestHold } from '../../shared/locks/maintenance-lock.js';
import type { DeliverEnvelope, ForwardRequest } from '../server.js';

/** Methods that run without the request hold. */
export const UNHELD_METHODS: ReadonlySet<string> = new Set(['daemon.status', 'daemon.compact', 'understanding.watch', 'todos.subscribe']);

/**
 * How long a cancelled stream with no request lifetime keeps its hold for the
 * handler to send its terminal frame; after it, the hold is released anyway so
 * a handler that never ends cannot block maintenance for good.
 */
export const CANCELLED_STREAM_SETTLE_MS = 10_000;

/** `forward`, with each request run under the maintenance lock's shared hold. */
export function holdingForward(forward: ForwardRequest): ForwardRequest {
	return (request, deliver) => {
		if (!maintenanceLockEnabled() || (UNHELD_METHODS.has(request.method) && request.trustedContext?.connectionSession === undefined && request.trustedContext?.connectionExecution?.mode !== 'session-memory') || request.underHold === true || holdsMaintenanceLock()) {
			return forward(request, deliver);
		}
		let cancel: (() => void) | undefined;
		let cancelled = false;
		let release: () => void = () => {};
		const complete = (): void => request.lifetime?.complete();
		const reply = (envelope: Parameters<DeliverEnvelope>[0]): void => {
			try { if (!cancelled) deliver(envelope); } finally { complete(); }
		};
		void withRequestHold(() => new Promise<void>(resolve => {
			release = resolve;
			if (cancelled || request.lifetime?.signal.aborted) { complete(); resolve(); return; }
			if (request.lifetime) void Promise.all([request.lifetime.completed, request.lifetime.drained]).then(() => resolve());
			const ending: DeliverEnvelope = envelope => {
				try { deliver(envelope); }
				finally {
					if (envelope.kind === 'reply') { complete(); if (!request.lifetime) resolve(); }
					else {
						const stream = (envelope.frame as IpcStreamMessage).stream;
						if (!request.lifetime && (stream === 'done' || stream === 'error')) resolve();
					}
				}
			};
			try { cancel = forward(request, ending); }
			catch (err) { try { reply({kind:'reply', requestId:request.requestId, error:err instanceof Error ? err.message : String(err)}); } finally { if (!request.lifetime) resolve(); } }
		})).then(
			outcome => {
				if (outcome.ran) return;
				reply(request.stream
					? { kind: 'frame', requestId: request.requestId, frame: { id: 0, stream: 'error', data: { error: outcome.busy, recoverable: true } } }
					: { kind: 'reply', requestId: request.requestId, error: outcome.busy });
			},
			(err: unknown) => reply({ kind: 'reply', requestId: request.requestId, error: err instanceof Error ? err.message : String(err) }),
		).catch(() => { complete(); });
		return () => {
			cancelled = true;
			request.lifetime?.abort();
			if (cancel) cancel();
			else complete();
			// A stream with no lifetime is held until its handler's terminal frame (bounded), not
			// released at the cancel: the handler may still be finishing a write.
			if (request.stream && !request.lifetime) setTimeout(() => release(), CANCELLED_STREAM_SETTLE_MS).unref();
		};
	};
}
