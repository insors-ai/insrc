/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Deterministic tracker sync — pulls current GitHub issue state + labels
 * for an Epic and its Stories, maps them to statuses, and writes them
 * into the Define's `meta.tracker` (which the chain report reads).
 * Read-only against GitHub; never edits issues.
 */

import { GithubConfigError, resolveGithubConfig } from '../config/github.js';
import { defineArtifactPaths } from '../storage.js';
import { ghAuthOk, ghGetIssueState } from './github.js';
import { mapIssueStatus, type TrackerStatus } from './conventions.js';
import { patchTrackerMeta, readTrackerMeta } from './refs.js';

export type SyncResult =
	| { readonly status: 'synced';  readonly epicStatus: TrackerStatus; readonly storyStatus: Readonly<Record<string, TrackerStatus>> }
	| { readonly status: 'skipped'; readonly reason: string }
	| { readonly status: 'failed';  readonly reason: string };

export function syncTracker(repoPath: string, epicHash: string): SyncResult {
	const definePaths = defineArtifactPaths(repoPath, epicHash);
	const tracker = readTrackerMeta(definePaths.json);
	const epicRef = tracker?.epicRef;
	if (typeof epicRef !== 'string' || epicRef.length === 0) {
		return { status: 'skipped', reason: 'Epic not pushed yet (no epicRef in meta.tracker)' };
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

	const auth = ghAuthOk();
	if (!auth.ok) return { status: 'skipped', reason: auth.reason };

	try {
		const es = ghGetIssueState(owner, repo, epicRef);
		const epicStatus = mapIssueStatus(es.state, es.labels);
		const storyStatus: Record<string, TrackerStatus> = {};
		for (const [storyId, ref] of Object.entries(tracker?.storyRefs ?? {})) {
			const s = ghGetIssueState(owner, repo, ref);
			storyStatus[storyId] = mapIssueStatus(s.state, s.labels);
		}
		patchTrackerMeta(definePaths.json, { epicStatus, storyStatus, lastSyncedAt: new Date().toISOString() });
		return { status: 'synced', epicStatus, storyStatus };
	} catch (err) {
		return { status: 'failed', reason: err instanceof Error ? err.message : String(err) };
	}
}
