/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The durable artifact store, history and LifecycleService of one repository, built from its files: the file sidecar, the journal under
 * `.insrc`, and the completion evidence read from the stored heads. The daemon keeps one of these per repository (its registry caches
 * them); a caller outside the daemon, such as the CLI's approve command or a test, builds its own. Two builds over one repository
 * are two write queues, so a long-lived process should keep one.
 */

import { creationContextProvider } from './codecs.js';
import { createCompletionEvidence } from './completion-evidence.js';
import { History } from './history.js';
import { createFileJournal } from './journal.js';
import { LifecycleService } from './lifecycle-service.js';
import { createFileSidecarStore } from './sidecar-store.js';
import type { SidecarFile, SidecarIo } from './sidecar.js';
import { ArtifactStore } from './store.js';

export interface RepoLifecycleBase {
	readonly history: History;
	readonly store:   ArtifactStore;
	readonly service: LifecycleService;
}

/** What a caller is told as writes commit: for the repair report, which has to be exact even when the operation around a write then fails. */
export interface RepoWriteObserver {
	/** A line is on disk in an artifact's log or feedback file. */
	readonly appended?:     ((file: SidecarFile, artifactId: string) => void) | undefined;
	/** A head file has been replaced. */
	readonly headReplaced?: ((path: string) => void) | undefined;
	/** Replaces the head file; the atomic writer by default. */
	readonly writeHead?:    ((path: string, bytes: string) => void) | undefined;
}

/** The sidecar with every append reported once it is on disk. */
function observedSidecar(io: SidecarIo, observer: RepoWriteObserver | undefined): SidecarIo {
	if (observer?.appended === undefined) return io;
	const appended = observer.appended;
	return {
		readRecords: (file, id) => io.readRecords(file, id),
		appendRecord: async (file, record) => { await io.appendRecord(file, record); appended(file, record.artifactId); },
	};
}

export function createRepoLifecycle(repoPath: string, observer?: RepoWriteObserver): RepoLifecycleBase {
	const history = new History(observedSidecar(createFileSidecarStore(repoPath), observer));
	// The round records (BUILD, TESTS, code review) of a Trivial standalone build are the first records of their work item,
	// so with no anchor stamped yet their own clock is the anchor, as it is for the writers that created them before.
	const contexts = creationContextProvider(repoPath, { rootKinds: ['BUILD', 'TESTS', 'CR'] });
	const store = new ArtifactStore({ repoPath, history, journal: createFileJournal(repoPath), contexts, ...(observer?.writeHead !== undefined ? { writeHead: observer.writeHead } : {}), ...(observer?.headReplaced !== undefined ? { headReplaced: observer.headReplaced } : {}) });
	const service = new LifecycleService({ store, evidence: ctx => createCompletionEvidence(repoPath, { overrideReview: ctx.overrideReview }) });
	return { history, store, service };
}
