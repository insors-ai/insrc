/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's per-repository lifecycle registry (s4): one durable artifact store, history and LifecycleService for each
 * repository, shared by every approval, review and round-record path in the daemon. A repository that cannot get an entry
 * (not a directory, a store that will not open) is refused with that error; there is no head-only fallback inside the daemon.
 */

import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createCompletionEvidence } from '../workflow/artifact-core/completion-evidence.js';
import { History } from '../workflow/artifact-core/history.js';
import { createFileJournal } from '../workflow/artifact-core/journal.js';
import { LifecycleService } from '../workflow/artifact-core/lifecycle-service.js';
import { createFileSidecarStore } from '../workflow/artifact-core/sidecar-store.js';
import { ArtifactStore } from '../workflow/artifact-core/store.js';

/** What a repository's entry holds. */
export interface RepoLifecycle {
	readonly store:   ArtifactStore;
	readonly service: LifecycleService;
}

const ENTRIES = new Map<string, RepoLifecycle>();

/** The registry entry of `repoPath`, created on first use. Throws when it cannot be created; a failed creation is not cached. */
export function lifecycleFor(repoPath: string): RepoLifecycle {
	const cached = ENTRIES.get(repoPath);
	if (cached !== undefined) return cached;
	if (repoPath.length === 0 || !existsSync(repoPath) || !statSync(repoPath).isDirectory()) {
		throw new Error(`no lifecycle store for '${repoPath}': it is not a repository directory`);
	}
	const history = new History(createFileSidecarStore(repoPath));
	const store = new ArtifactStore({ repoPath, history, journal: createFileJournal(repoPath) });
	const service = new LifecycleService({ store, evidence: ctx => createCompletionEvidence(repoPath, { overrideReview: ctx.overrideReview }) });
	const entry = { store, service };
	ENTRIES.set(repoPath, entry);
	return entry;
}

/** For tests: forget every entry. */
export function resetLifecycleRegistry(): void { ENTRIES.clear(); }

/** The repository root that holds `path` (the nearest parent with a `.insrc` folder), for a request that names an artifact and no repo. */
export function repoOfArtifactPath(path: string): string | undefined {
	let dir = dirname(path);
	for (;;) {
		if (existsSync(join(dir, '.insrc'))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}
