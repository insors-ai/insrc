/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's per-repository lifecycle registry (s4): one durable artifact store, history, LifecycleService, FeedbackService and IdentityService for each
 * repository, shared by every approval, review and round-record path in the daemon. A repository that cannot get an entry
 * (not a directory, a store that will not open) is refused with that error; there is no head-only fallback inside the daemon.
 */

import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { realpathSync } from 'node:fs';

import { creationContextProvider } from '../workflow/artifact-core/codecs.js';
import { ARTIFACTS_DIR } from '../workflow/storage.js';
import { createCompletionEvidence } from '../workflow/artifact-core/completion-evidence.js';
import { History } from '../workflow/artifact-core/history.js';
import { createFileJournal } from '../workflow/artifact-core/journal.js';
import { LifecycleService } from '../workflow/artifact-core/lifecycle-service.js';
import { createFileSidecarStore } from '../workflow/artifact-core/sidecar-store.js';
import { ArtifactStore } from '../workflow/artifact-core/store.js';
import { FeedbackService } from '../workflow/feedback/feedback-service.js';
import { IdentityService } from '../workflow/identity/identity-service.js';
import type { RoundWriter } from '../workflow/runners/build/round-writer.js';
import type { Actor } from '../workflow/artifact-core/types.js';

/** What a repository's entry holds. */
export interface RepoLifecycle {
	readonly store:   ArtifactStore;
	readonly service: LifecycleService;
	/** Feedback and replies on this repository's artifacts, over the same history and store (and so the same write queue). */
	readonly feedback: FeedbackService;
	/** Who is acting, and the person's declared ids. The identity file is per user, not per repository. */
	readonly identity: IdentityService;
}

const ENTRIES = new Map<string, RepoLifecycle>();

/** The one identity service: the identity file is per user, so every repository's entry and the identity methods share it. */
export const identityService = new IdentityService();

/** The registry entry of `repoPath`, created on first use. Throws when it cannot be created; a failed creation is not cached. */
export function lifecycleFor(requested: string): RepoLifecycle {
	if (requested.length === 0 || !existsSync(requested) || !statSync(requested).isDirectory()) {
		throw new Error(`no lifecycle store for '${requested}': it is not a repository directory`);
	}
	// One entry per repository however its path is written (a trailing slash, a relative path, a symlink): two entries would
	// have two write queues over the same artifacts.
	const repoPath = realpathSync(resolve(requested));
	const cached = ENTRIES.get(repoPath);
	if (cached !== undefined) return cached;
	const history = new History(createFileSidecarStore(repoPath));
	// The round records (BUILD, TESTS, code review) of a Trivial standalone build are the first records of their work item,
	// so with no anchor stamped yet their own clock is the anchor, as it is for the writers that created them before.
	const contexts = creationContextProvider(repoPath, { rootKinds: ['BUILD', 'TESTS', 'CR'] });
	const store = new ArtifactStore({ repoPath, history, journal: createFileJournal(repoPath), contexts });
	const service = new LifecycleService({ store, evidence: ctx => createCompletionEvidence(repoPath, { overrideReview: ctx.overrideReview }) });
	const entry = { store, service, feedback: new FeedbackService({ history, store }), identity: identityService };
	ENTRIES.set(repoPath, entry);
	return entry;
}

/** For tests: forget every entry. */
export function resetLifecycleRegistry(): void { ENTRIES.clear(); }

/** The repository root that holds `path` (the nearest parent with an artifacts folder), for a request that names an artifact and no repo. */
export function repoOfArtifactPath(path: string): string | undefined {
	let dir = dirname(path);
	for (;;) {
		if (existsSync(join(dir, ARTIFACTS_DIR))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

/** Who the store records for the rounds the build gate writes. */
export const BUILD_ACTOR: Actor = { id: 'insrc:build', kind: 'system', properties: {} };

/** The repository's round writer: its service and the actor the round is recorded under. */
export function roundWriterFor(repoPath: string, actor: Actor = BUILD_ACTOR): RoundWriter {
	return { writer: lifecycleFor(repoPath).service, actor };
}
