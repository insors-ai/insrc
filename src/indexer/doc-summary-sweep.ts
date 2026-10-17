/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story b94cf2c9 S001/t3 — the whole-repo document-summary sweep.
 *
 * A sweep can take hours (about 30 s per document whose summary must be
 * rewritten), and it runs in the summary lane alongside code indexing. So,
 * before each document it:
 *
 *   - stops if the daemon is shutting down, after the summary in progress;
 *   - runs every queued single-document job first, so an edited document is
 *     summarised within about one summary of the edit;
 *   - re-reads the document, since code indexing may have deleted it after
 *     the sweep listed it.
 */

import type { SummariseDocResult } from '../analyze/summariser/index.js';
import type { Entity } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('indexer');

export interface DocSummarySweepDeps {
	getEntity(id: string): Promise<Entity | null>;
	summarise(entity: Entity): Promise<SummariseDocResult>;
	/** The next queued single-document job, removed from the queue, or undefined. */
	takeEdit(): { entityId: string } | undefined;
	runEdit(entityId: string): Promise<void>;
	shouldStop(): boolean;
	onProgress(done: number, total: number): void;
}

export interface DocSummarySweepCounts {
	readonly summarised: number;
	readonly skipped:    number;
	readonly failed:     number;
	/** Deleted or rewritten after the sweep listed it. */
	readonly gone:       number;
	readonly stopped:    boolean;
}

type Outcome = 'summarised' | 'skipped' | 'failed' | 'gone';

/** How one summariseDoc result counts. */
function classify(res: SummariseDocResult): Outcome {
	if (res.ok) return res.skipped === 'unchanged' ? 'skipped' : 'summarised';
	if (res.skipped === 'entity-gone' || res.skipped === 'body-changed') return 'gone';
	if (res.skipped !== undefined) return 'skipped';   // not-a-doc, body-empty
	return 'failed';
}

/** Summarise each listed document in order. Never throws for one document. */
export async function runDocSummarySweep(entityIds: readonly string[], deps: DocSummarySweepDeps): Promise<DocSummarySweepCounts> {
	const counts = { summarised: 0, skipped: 0, failed: 0, gone: 0 };
	let done = 0;
	for (const id of entityIds) {
		if (deps.shouldStop()) return { ...counts, stopped: true };
		for (let edit = deps.takeEdit(); edit !== undefined; edit = deps.takeEdit()) {
			await deps.runEdit(edit.entityId);
			if (deps.shouldStop()) return { ...counts, stopped: true };
		}
		try {
			const entity = await deps.getEntity(id);
			counts[entity === null ? 'gone' : classify(await deps.summarise(entity))] += 1;
		} catch (err) {
			// summariseDoc does not throw for model or schema failures, but a bug
			// or an OOM still could: one bad document does not stop the sweep.
			counts.failed += 1;
			log.warn({ entityId: id, err: err instanceof Error ? err.message : String(err) }, 'doc summariser: entity threw (continuing sweep)');
		}
		done += 1;
		deps.onProgress(done, entityIds.length);
	}
	// Shutdown during the last document still counts as a stopped sweep.
	return { ...counts, stopped: deps.shouldStop() };
}
