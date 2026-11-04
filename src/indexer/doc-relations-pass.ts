/**
 * The document-relations pass (Epic c2ba6fa6 s10): the mid-tier model's
 * proposed relationships for a graph-complete repository's new or changed
 * documents. Implemented by s10/t7; until then it examines nothing.
 */

import type { SubsystemsOutcome } from './subsystem-scheduler.js';

export interface DocRelationsPassDeps {
	readonly repoPath:         string;
	readonly waitForCodeIdle?: (() => Promise<void>) | undefined;
	readonly isCodeIdle?:      (() => boolean) | undefined;
	readonly shouldStop?:      (() => boolean) | undefined;
}

export async function runDocRelationsPass(deps: DocRelationsPassDeps): Promise<SubsystemsOutcome> {
	void deps;
	return { summariesFailed: 0, stopped: false, startedAt: Date.now(), grouped: false };
}
