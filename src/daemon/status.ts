/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The `daemon.status` payload (Epic c2ba6fa6, Story s4). Split out of the
 * handler registry so that the one thing the request must do when the graph
 * store has failed — still answer, and say why — can be tested without a
 * running daemon.
 */

import { getStoreHealth, recordStoreFailureIfLockError } from '../db/graph/store.js';
import type { StoreHealth } from '../db/graph/store.js';
import type { DaemonStatus, QueueLanes, RegisteredRepo, UnattributedUnwritableCount } from '../shared/types.js';
import type { IndexingStatus } from './threads/status-board.js';

/** What the user is told. It states the cause and the remedy, and does not
 *  repeat the store library's own text, which blames a system limit. */
export const STORE_LOCKS_LOST_CAUSE =
	"Another process opened and closed the graph store after the daemon had lost its file lock on the store's lock file, " +
	"which removed the store's locks. Nothing can be read or written until the daemon is restarted.";

/** The status field for a store health record: undefined while it is ok. */
export function storeFailureForStatus(health: StoreHealth): DaemonStatus['storeFailure'] {
	if (health.state === 'ok') return undefined;
	return { kind: 'locks-lost', at: health.at, operation: health.operation, cause: STORE_LOCKS_LOST_CAUSE };
}

export interface DaemonStatusSources {
	readonly uptimeSec:       number;
	/** Reads the repository list FROM THE STORE; throws once the store has failed. */
	readonly listRepos:       () => Promise<RegisteredRepo[]>;
	readonly queueDepth:      number;
	readonly modelState:      { status: string; pct?: number | undefined };
	readonly installedCommit: string;
	/** Best-effort; undefined when the file is absent or cannot be read. */
	readonly lmdbFileSizeMb?: number | undefined;
	/** Test seam; production reads the store module's record. */
	readonly storeHealth?:    () => StoreHealth;
	/** The queue's per-lane state; absent, the status carries no `queueLanes`. */
	readonly queueLanes?:     () => QueueLanes;
	/** The daemon-wide unattributed count (Epic c2ba6fa6 s1); undefined leaves the field out. */
	readonly unattributedUnwritable?: () => Promise<UnattributedUnwritableCount | undefined>;
}

/** The queue's per-lane state, with the running summary sweep's progress on the summary lane. */
export function composeQueueLanes(
	lanes: { index: { depth: number; running: boolean }; summary: { depth: number; running: boolean } },
	sweep: { repoPath: string; done: number; total: number } | undefined,
): QueueLanes {
	return { index: { ...lanes.index }, summary: { ...lanes.summary, ...(sweep !== undefined && { sweep: { ...sweep } }) } };
}

/**
 * daemon.status's queue fields from the status board's two published lanes,
 * mapped as composeQueueLanes maps the live queue today: queueDepth is both
 * lanes' depth, and each lane's running flag is whether it is processing.
 */
export function queueStatusFromBoard(indexing: IndexingStatus): { queueDepth: number; queueLanes: QueueLanes } {
	return {
		queueDepth: indexing.index.depth + indexing.summary.depth,
		queueLanes: composeQueueLanes(
			{ index: { depth: indexing.index.depth, running: indexing.index.processing }, summary: { depth: indexing.summary.depth, running: indexing.summary.processing } },
			indexing.sweep,
		),
	};
}

/**
 * Build the status. The repository list is the one field read from the store,
 * and that read throws once the store has lost its locks — which is exactly
 * the moment the status is needed. So the read is guarded: on a store failure
 * the status is answered with an empty repository list and `storeFailure`.
 * Any other error from the read propagates as before.
 */
export async function buildDaemonStatus(src: DaemonStatusSources): Promise<DaemonStatus> {
	const health = src.storeHealth ?? getStoreHealth;

	let repos: RegisteredRepo[] = [];
	if (health().state === 'ok') {
		try {
			repos = await src.listRepos();
		} catch (err) {
			// A lock failure first met by this very read is recorded here.
			if (!recordStoreFailureIfLockError(err, 'request daemon.status') && health().state === 'ok') throw err;
		}
	}

	const failure = storeFailureForStatus(health());
	const unattributed = health().state === 'ok' ? await src.unattributedUnwritable?.() : undefined;
	return {
		uptime: src.uptimeSec,
		repos,
		queueDepth: src.queueDepth,
		embeddingsPending: src.queueDepth, // approximate
		modelPullStatus: src.modelState.status === 'pulling' ? 'pulling' : 'ready',
		...(src.modelState.pct !== undefined && { modelPullPct: src.modelState.pct }),
		installedCommit: src.installedCommit,
		...(src.lmdbFileSizeMb !== undefined && { lmdbFileSizeMb: src.lmdbFileSizeMb }),
		...(failure !== undefined && { storeFailure: failure }),
		...(src.queueLanes !== undefined && { queueLanes: src.queueLanes() }),
		...(unattributed !== undefined && { unattributedUnwritable: unattributed }),
	};
}
