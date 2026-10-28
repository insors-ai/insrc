/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Target registry (Epic 86197ac6, Story s1, contract sc3): which worker thread
 * serves which class of request. Lives on the main thread, which routes.
 *
 * At most one live target each for admin work, indexing work, requests that
 * carry no valid client identity (the unattributed worker) and the session-class
 * families whose state is one process-wide copy (the shared-state worker, s3),
 * and at most one per session (client label + process id).
 */

import type { MethodClass, SessionId } from './channel.js';

export interface ThreadTarget {
	readonly threadId: number;
	readonly cls: MethodClass;
	readonly session?: SessionId | undefined;
	/** The one shared worker for session-class requests that carry no valid identity. */
	readonly unattributed?: true | undefined;
	/** The one shared-state worker (s3): chat, todos and understanding, whose state is one process-wide copy. */
	readonly shared?: true | undefined;
}

export class TargetConflictError extends Error {
	constructor(readonly slot: string, readonly liveThreadId: number) {
		super(`a live target already serves ${slot} (thread ${liveThreadId})`);
		this.name = 'TargetConflictError';
	}
}

function slotOf(t: Pick<ThreadTarget, 'cls' | 'session' | 'unattributed' | 'shared'>): string {
	if (t.cls !== 'session') return t.cls;
	// Checked first: the shared-state target has no session either, but is not the unattributed one.
	if (t.shared === true) return 'session:shared';
	if (t.unattributed === true || t.session === undefined) return 'session:unattributed';
	return `session:${t.session.label}:${t.session.pid}`;
}

export class TargetRegistry {
	private readonly bySlot = new Map<string, ThreadTarget>();

	register(target: ThreadTarget): void {
		const slot = slotOf(target);
		const live = this.bySlot.get(slot);
		if (live !== undefined) throw new TargetConflictError(slot, live.threadId);
		this.bySlot.set(slot, target);
	}

	/** Remove every target the thread registered; unknown threads are a no-op. */
	unregister(threadId: number): void {
		for (const [slot, t] of this.bySlot) if (t.threadId === threadId) this.bySlot.delete(slot);
	}

	/**
	 * The target for a request; a session-class request without identity resolves to the
	 * unattributed target, and only one asked for with `shared` to the shared-state target.
	 */
	targetFor(cls: MethodClass, session?: SessionId, opts: { readonly shared?: true | undefined } = {}): ThreadTarget | undefined {
		return this.bySlot.get(slotOf({ cls, session, shared: opts.shared }));
	}

	targets(): readonly ThreadTarget[] {
		return [...this.bySlot.values()];
	}
}
