/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The feedback service (s5): what a person sees of the feedback on an artifact. It sits on History and the durable sidecar,
 * has no edit or delete call, and builds the thread view at read.
 */

import type { History } from '../artifact-core/history.js';
import { buildThreads } from './threads.js';
import type { FeedbackThread } from './threads.js';

export interface FeedbackServiceDeps {
	readonly history: History;
}

export class FeedbackService {
	constructor(protected readonly deps: FeedbackServiceDeps) {}

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
