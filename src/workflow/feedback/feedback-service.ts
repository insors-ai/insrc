/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The feedback service (s5): what a person does and sees with the feedback on an artifact. It sits on History and the durable
 * sidecar, has no edit or delete call (a stored line is never changed), and builds the thread view at read.
 */

import { randomUUID } from 'node:crypto';

import { isActor, isNamespacedActorId } from '../artifact-core/decode.js';
import type { History } from '../artifact-core/history.js';
import type { ArtifactStore } from '../artifact-core/store.js';
import { HistoryEntryError } from '../artifact-core/types.js';
import type { Actor, Feedback } from '../artifact-core/types.js';
import { buildThreads } from './threads.js';
import type { FeedbackThread } from './threads.js';

export interface FeedbackServiceDeps {
	readonly history: History;
	readonly store:   ArtifactStore;
	readonly now?:    (() => Date) | undefined;
}

/** What a caller supplies for one entry; the service adds the id (unless given), the time, the revision and the actor. */
export interface FeedbackInput {
	readonly text:       string;
	readonly kind?:      Feedback['kind'] | undefined;
	readonly anchor?:    Feedback['anchor'] | undefined;
	/** The id of the root entry this replies to. */
	readonly inReplyTo?: string | undefined;
	readonly batchId?:   string | undefined;
	/** A caller-chosen key: adding the same id with the same fields again returns the stored entry and appends nothing. */
	readonly id?:        string | undefined;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export class FeedbackService {
	constructor(protected readonly deps: FeedbackServiceDeps) {}

	/**
	 * Record one entry or reply on an artifact, a Task included, under the artifact's queue so the lookup and the append are
	 * atomic within the process. Returns the entry as stored. A repeated caller id with the same caller-supplied fields returns
	 * the stored entry (its original time and revision) and appends nothing; with different fields it is refused.
	 */
	async add(artifactId: string, input: FeedbackInput, actor: Actor): Promise<Feedback> {
		const { history, store } = this.deps;
		if (!isActor(actor) || !isNamespacedActorId(actor.id)) {
			throw new HistoryEntryError(`feedback on ${artifactId}: the actor '${String(actor?.id)}' has no namespaced lower-case id such as github:alice`);
		}
		if (typeof input.text !== 'string' || input.text.trim() === '') throw new HistoryEntryError(`feedback on ${artifactId}: the text is blank`);
		const kind = input.kind ?? 'comment';
		return store.exclusive(artifactId, async () => {
			const head = await store.read(artifactId);                  // ArtifactNotFoundError when there is no head
			const existing = await history.feedback(artifactId);

			if (input.inReplyTo !== undefined) {
				const parent = existing.find(f => f.id === input.inReplyTo);
				if (parent === undefined) throw new HistoryEntryError(`feedback on ${artifactId}: the reply names '${input.inReplyTo}', which is not an entry of this artifact`);
				if (parent.inReplyTo !== undefined) throw new HistoryEntryError(`feedback on ${artifactId}: '${input.inReplyTo}' is itself a reply; reply to the thread's root`);
			}

			const id = input.id ?? randomUUID().replace(/-/g, '');
			const stored = existing.find(f => f.id === id);
			if (stored !== undefined) {
				const retry = stored.text === input.text && stored.kind === kind && same(stored.anchor, input.anchor)
					&& stored.inReplyTo === input.inReplyTo && stored.batchId === input.batchId && stored.actor.id === actor.id;
				if (!retry) throw new HistoryEntryError(`feedback on ${artifactId}: id '${id}' is already used with different content`);
				return stored;
			}

			const entry: Feedback = {
				id,
				text:      input.text,
				actor,
				timestamp: (this.deps.now ?? (() => new Date()))().toISOString(),
				feedback:  [],
				kind,
				revision:  head.lifecycle.revision.number,
				...(input.anchor !== undefined ? { anchor: input.anchor } : {}),
				...(input.inReplyTo !== undefined ? { inReplyTo: input.inReplyTo } : {}),
				...(input.batchId !== undefined ? { batchId: input.batchId } : {}),
			};
			await history.appendFeedback(artifactId, entry);
			return entry;
		});
	}

	/**
	 * The artifact's feedback as threads, roots in reader order (timestamp, then id). With `open`, only threads whose root no
	 * later update addressed; a reply is never listed on its own.
	 */
	async threads(artifactId: string, scope: { readonly open?: boolean | undefined } = {}): Promise<FeedbackThread[]> {
		const { history } = this.deps;
		const feedback = await history.feedback(artifactId);
		const log = await history.log(artifactId);
		const open = await history.openFeedback(artifactId);
		const openIds = new Set(open.map(f => f.id));
		const all = buildThreads(feedback, log, id => openIds.has(id));
		return scope.open === true ? all.filter(t => !t.addressed) : all;
	}
}
