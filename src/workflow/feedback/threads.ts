/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The thread view of an artifact's feedback (s5). A stored feedback line is never rewritten, so a reply is its own line that
 * names its root in `inReplyTo`; the thread is built here, at read, and never stored.
 */

import { compareEntries } from '../artifact-core/sidecar-store.js';
import type { ChangeLogEntry, Feedback } from '../artifact-core/types.js';

/** One root feedback entry with the replies that name it, and whether a later update addressed it. */
export interface FeedbackThread {
	readonly root:         Feedback;
	/** The reply lines that name the root, in reader order (timestamp, then id). */
	readonly replies:      readonly Feedback[];
	/** True when a later update entry addressed the root (a reply carries no state of its own). */
	readonly addressed:    boolean;
	/** The id of the earliest update entry that addressed the root. */
	readonly addressedBy?: string | undefined;
	/** True for a reply whose parent is missing, or is itself a reply, which is returned as a root rather than dropped. */
	readonly orphan?:      boolean | undefined;
}

/**
 * Nest `feedback` (reader order) into threads. `isOpen` says whether a root is still open, as History.openFeedback decides;
 * the log is read only to name the entry that addressed a root.
 */
export function buildThreads(feedback: readonly Feedback[], log: readonly ChangeLogEntry[], isOpen: (id: string) => boolean): FeedbackThread[] {
	const roots = new Map<string, Feedback>();
	for (const f of feedback) if (f.inReplyTo === undefined) roots.set(f.id, f);
	const repliesOf = new Map<string, Feedback[]>();
	const orphans: Feedback[] = [];
	for (const f of feedback) {
		if (f.inReplyTo === undefined) continue;
		const list = roots.has(f.inReplyTo) ? repliesOf.get(f.inReplyTo) ?? [] : undefined;
		if (list === undefined) orphans.push(f);
		else { list.push(f); repliesOf.set(f.inReplyTo, list); }
	}
	const thread = (root: Feedback, orphan: boolean): FeedbackThread => {
		const open = isOpen(root.id);
		const by = open ? undefined : log.find(e => compareEntries(e, root) > 0 && (e.addresses === 'all' || (Array.isArray(e.addresses) && e.addresses.includes(root.id))));
		return { root, replies: orphan ? [] : repliesOf.get(root.id) ?? [], addressed: !open, ...(by !== undefined ? { addressedBy: by.id } : {}), ...(orphan ? { orphan: true } : {}) };
	};
	return [...roots.values(), ...orphans].sort(compareEntries).map(f => thread(f, f.inReplyTo !== undefined));
}
