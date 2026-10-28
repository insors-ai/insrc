/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Deterministic tracker sync — pulls current GitHub issue state + labels
 * for an Epic and its Stories (the issues bound on their EPIC and STORY
 * heads), maps them to statuses, and writes them into the Define's
 * `meta.tracker` (which the chain report reads).
 * Read-only against GitHub; never edits issues.
 */

import { GithubConfigError, resolveGithubConfig } from '../config/github.js';
import { artifactJsonPath, defineArtifactId } from '../storage.js';
import { createRegistryTable, workflowToolDeps } from './registry-table.js';
import type { RegistryTable } from './registry-table.js';
import { isToolDenied } from './tool-denied.js';
import { mapIssueStatus, type TrackerStatus } from './conventions.js';
import { patchTrackerMeta } from './refs.js';
import { unitIssueOf } from './unit-head.js';
import { readDefineArtifact } from '../gates.js';

export type SyncResult =
	| { readonly status: 'synced';  readonly epicStatus: TrackerStatus; readonly storyStatus: Readonly<Record<string, TrackerStatus>> }
	| { readonly status: 'skipped'; readonly reason: string }
	| { readonly status: 'failed';  readonly reason: string };

export async function syncTracker(repoPath: string, epicHash: string, table: RegistryTable = createRegistryTable(workflowToolDeps(repoPath))): Promise<SyncResult> {
	const defineJson = artifactJsonPath(repoPath, defineArtifactId(epicHash));
	const epicRef = unitIssueOf(repoPath, epicHash);
	if (typeof epicRef !== 'string' || epicRef.length === 0) {
		return { status: 'skipped', reason: 'Epic not pushed yet (its head is not bound to an issue)' };
	}

	let cfgType: string;
	let owner: string;
	let repo: string;
	try {
		const cfg = resolveGithubConfig(repoPath);
		if (cfg.type === 'none') return { status: 'skipped', reason: `tracker disabled via config (source: ${cfg.source})` };
		cfgType = cfg.type; owner = cfg.owner; repo = cfg.repo;
	} catch (err) {
		if (err instanceof GithubConfigError) return { status: 'skipped', reason: err.message };
		throw err;
	}
	void cfgType;

	const auth = await table.ghAuthOk();
	if (!auth.ok) return { status: 'skipped', reason: auth.reason };

	try {
		const es = await table.ghGetIssueState(owner, repo, epicRef);
		const epicStatus = mapIssueStatus(es.state, es.labels);
		const storyStatus: Record<string, TrackerStatus> = {};
		for (const story of storiesOf(repoPath, epicHash)) {
			const ref = unitIssueOf(repoPath, epicHash, story);
			if (ref === undefined) continue;
			const s = await table.ghGetIssueState(owner, repo, ref);
			storyStatus[story] = mapIssueStatus(s.state, s.labels);
		}
		patchTrackerMeta(defineJson, { epicStatus, storyStatus, lastSyncedAt: new Date().toISOString() });
		return { status: 'synced', epicStatus, storyStatus };
	} catch (err) {
		if (isToolDenied(err)) throw err;   // a denied call stops the sync; it is not a failed one
		return { status: 'failed', reason: err instanceof Error ? err.message : String(err) };
	}
}

/** The ids of the Stories the Epic's Define lists; none when it cannot be read. */
function storiesOf(repoPath: string, epicHash: string): string[] {
	try { return readDefineArtifact(repoPath, epicHash).body.stories.map(s => s.id); } catch { return []; }
}
