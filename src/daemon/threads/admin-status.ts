/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * daemon.status and repo.list on the admin worker (Epic 86197ac6, Story s2):
 * answered from the status board (the code-indexing worker publishes the
 * repositories, their completeness and the unattributed count; both indexing
 * lanes are published as they change) and the main thread's daemon.info,
 * without calling into a busy thread.
 *
 * Until the code-indexing worker's first store publish, the worker waits for
 * it at most firstPublishMs, once; past that it reads the registry from the
 * store itself, as the daemon does today, so the list is never answered empty
 * for want of a publish.
 */

import type { DaemonStatus, UnattributedUnwritableCount } from '../../shared/types.js';
import { buildDaemonStatus, queueStatusFromBoard } from '../status.js';
import type { DaemonInfo } from './main-services.js';
import type { RepoStatusSnapshot, StatusSnapshot, StoreStatusSnapshot } from './status-board.js';

export const FIRST_PUBLISH_WAIT_MS = 5_000;

export interface AdminStatusDeps {
	readonly snapshot: () => Promise<StatusSnapshot>;
	readonly info: () => Promise<DaemonInfo>;
	/** Today's read: the registry from the store, each row with its completeness. */
	readonly readRepos: () => Promise<RepoStatusSnapshot[]>;
	/** Today's read of the unattributed count from the store. */
	readonly readUnattributed: () => Promise<UnattributedUnwritableCount | undefined>;
	readonly firstPublishMs?: number | undefined;
	readonly now?: (() => number) | undefined;
}

export interface AdminStatus {
	daemonStatus(): Promise<DaemonStatus>;
	repoList(): Promise<RepoStatusSnapshot[]>;
}

export function createAdminStatus(deps: AdminStatusDeps): AdminStatus {
	const now = deps.now ?? Date.now;
	const limit = deps.firstPublishMs ?? FIRST_PUBLISH_WAIT_MS;
	let firstPublish: Promise<void> | undefined;

	/** Resolves once the store slot has been published, or after the limit. */
	const waitForFirstPublish = async (): Promise<void> => {
		const deadline = now() + limit;
		while (now() < deadline) {
			if ((await deps.snapshot()).store.repos !== undefined) return;
			await new Promise(res => setTimeout(res, Math.min(100, Math.max(0, deadline - now()))));
		}
	};

	/** The board's store slot, after waiting (once) for its first publish. */
	const storeSlot = async (snap: StatusSnapshot): Promise<StoreStatusSnapshot> => {
		if (snap.store.repos !== undefined) return snap.store;
		firstPublish ??= waitForFirstPublish();
		await firstPublish;
		return (await deps.snapshot()).store;
	};

	return {
		async repoList() {
			const store = await storeSlot(await deps.snapshot());
			return store.repos !== undefined ? [...store.repos] : await deps.readRepos();
		},

		async daemonStatus() {
			const info = await deps.info();
			const first = await deps.snapshot();
			const store = await storeSlot(first);
			// After a wait for the first publish, the queue is read from a snapshot taken after it.
			const snap = store === first.store ? first : await deps.snapshot();
			const published = store.repos !== undefined;
			const { queueDepth, queueLanes } = queueStatusFromBoard(snap.indexing);
			const status = await buildDaemonStatus({
				uptimeSec: Math.floor((now() - info.startedAt) / 1000),
				// From the board once published; buildDaemonStatus still guards this
				// read with the store's health, as today.
				listRepos: async () => published ? [...store.repos!] : await deps.readRepos(),
				unattributedUnwritable: async () => published ? store.unattributedUnwritable : await deps.readUnattributed(),
				queueDepth,
				queueLanes: () => queueLanes,
				modelState: info.modelState,
				installedCommit: info.installedCommit,
				lmdbFileSizeMb: info.lmdbFileSizeMb,
			});
			return info.maintenance !== undefined ? { ...status, maintenance: info.maintenance } : status;
		},
	};
}
