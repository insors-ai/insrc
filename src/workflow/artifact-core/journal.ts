/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The write journal port (sc2). A write stages the prepared head together with
 * its whole change log entry before anything changes, so a retry (or a start-up
 * recovery) can finish the same operation under the same operation id even after
 * the head was already replaced. s2 defines the port and an in-memory
 * implementation; s4 implements the durable pending-head file.
 */

import type { ChangeLogEntry } from './types.js';

export interface StagedOperation {
	/** A hash of the artifact id, the prior revision and the prepared bytes; also the id of the change log entry. */
	readonly operationId:   string;
	readonly priorRevision: number;
	/** The exact head text the write puts on disk. */
	readonly bytes:         string;
	/** The whole immutable change log entry, actor and timestamp included: recovery appends it as staged. */
	readonly entry:         ChangeLogEntry;
}

export interface WriteJournal {
	stage(id: string, op: StagedOperation): Promise<void>;
	/** The operation staged for `id` and not yet cleared, if any. */
	pending(id: string): Promise<StagedOperation | undefined>;
	clear(id: string, operationId: string): Promise<void>;
}

/** A journal that keeps staged operations in memory: for tests and the named non-durable store. It does not survive a restart. */
export function createMemoryJournal(): WriteJournal {
	const staged = new Map<string, StagedOperation>();
	return {
		stage: (id, op) => { staged.set(id, op); return Promise.resolve(); },
		pending: id => Promise.resolve(staged.get(id)),
		clear: (id, operationId) => {
			if (staged.get(id)?.operationId === operationId) staged.delete(id);
			return Promise.resolve();
		},
	};
}
