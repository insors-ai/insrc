/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The nightly conversation prune and compaction (step 8 of the daemon's boot).
 * With daemon threads each sweep runs under the maintenance lock's shared
 * hold, waiting for maintenance rather than writing during it (Epic 86197ac6
 * s2).
 */

import type { DbClient } from '../db/client.js';
import { compactConversations } from '../db/compaction.js';
import { pruneConversations } from '../db/conversations.js';
import { embedQuery } from '../indexer/embedder.js';
import { withTimerHold } from '../shared/locks/maintenance-lock.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('daemon');

export const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** The sweep's two writes; injected by tests. */
export interface PruneOps {
	readonly prune: (db: DbClient) => Promise<{ expired: number; capped: number }>;
	readonly compact: (db: DbClient) => ReturnType<typeof compactConversations>;
}

const realOps: PruneOps = {
	prune: pruneConversations,
	compact: db => compactConversations(db, async text => embedQuery(text)),
};

/** One sweep: prune expired and over-cap sessions, then compact conversations. Never throws. */
export async function runPruneSweep(db: DbClient, ops: PruneOps = realOps): Promise<void> {
	try {
		await withTimerHold(async () => {
			const result = await ops.prune(db);
			if (result.expired > 0 || result.capped > 0) {
				log.info(`pruned ${result.expired} expired + ${result.capped} capped sessions`);
			}
			const compactResult = await ops.compact(db);
			const totalCompacted = compactResult.warmCompressed + compactResult.coldMerged + compactResult.archived;
			if (totalCompacted > 0 || compactResult.directives > 0) {
				log.info({ ...compactResult }, 'conversation compaction');
			}
		});
	} catch (err) {
		log.error({ err }, 'pruning/compaction error');
	}
}

/** Run the sweep every `intervalMs`; returns the timer. */
export function schedulePruneTimer(db: DbClient, intervalMs: number = PRUNE_INTERVAL_MS, ops: PruneOps = realOps): NodeJS.Timeout {
	return setInterval(() => { void runPruneSweep(db, ops); }, intervalMs);
}
