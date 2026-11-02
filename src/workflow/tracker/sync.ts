/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Deterministic tracker sync — pulls current GitHub issue state + labels
 * for an Epic and its Stories (the issues bound on their EPIC and STORY
 * heads), maps them to statuses, and writes them into the Define's
 * `meta.tracker` (which the chain report reads).
 * Read-only against the tracker; never edits issues.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getLogger } from '../../shared/logger.js';
import { GithubConfigError, resolveGithubConfig } from '../config/github.js';
import { ARTIFACTS_DIR, artifactJsonPath, defineArtifactId } from '../storage.js';
import { createDeadline } from '../team/sighting-store.js';
import type { Deadline } from '../team/sighting-store.js';
import { createGithubTracker } from './github-adapter.js';
import { createRegistryTable, workflowToolDeps } from './registry-table.js';
import type { RegistryTable } from './registry-table.js';
import { isToolDenied } from './tool-denied.js';
import { mapIssueStatus, type TrackerStatus } from './conventions.js';
import { missingCapabilities } from './port.js';
import type { TrackerPort } from './port.js';
import { patchTrackerMeta } from './refs.js';
import { unitIssueOf } from './unit-head.js';
import { readDefineArtifact } from '../gates.js';

const log = getLogger('tracker-sync');

/** The whole-refresh budget (the user's decision of 2026-10-23); each gh read also keeps its own registry limit (30 s). */
export const TRACKER_REFRESH_DEADLINE_MS = 120_000;

const TIME_LIMIT = 'time limit reached';

export type SyncResult =
	| { readonly status: 'synced';  readonly epicStatus: TrackerStatus; readonly storyStatus: Readonly<Record<string, TrackerStatus>> }
	| { readonly status: 'skipped'; readonly reason: string }
	| { readonly status: 'failed';  readonly reason: string };

/** What a sync is given besides the Epic: a port to read through (default: the GitHub adapter of the repo's config) and a Deadline. */
export interface SyncOptions {
	readonly port?: TrackerPort | undefined;
	readonly deadline?: Deadline | undefined;
}

/**
 * Read the Epic's and its Stories' issue status through the tracker port and write it into the Define's `meta.tracker`
 * (epicStatus, storyStatus, lastSyncedAt; nothing else). The Deadline is checked before every read and its signal reaches the gh
 * calls of the default adapter, so a call in flight is cancelled; a sync the Deadline stops writes nothing and is skipped.
 * A ToolDenied is rethrown.
 */
export async function syncTracker(repoPath: string, epicHash: string, table?: RegistryTable, opts: SyncOptions = {}): Promise<SyncResult> {
	const { deadline } = opts;
	const defineJson = artifactJsonPath(repoPath, defineArtifactId(epicHash));
	const epicRef = unitIssueOf(repoPath, epicHash);
	if (typeof epicRef !== 'string' || epicRef.length === 0) {
		return { status: 'skipped', reason: 'Epic not pushed yet (its head is not bound to an issue)' };
	}

	let port = opts.port;
	if (port === undefined) {
		try {
			const cfg = await resolveGithubConfig(repoPath);
			if (cfg.type === 'none') return { status: 'skipped', reason: `tracker disabled via config (source: ${cfg.source})` };
			const tableOf = table ?? createRegistryTable(workflowToolDeps(repoPath, deadline !== undefined ? { signal: deadline.signal } : {}));
			port = createGithubTracker(cfg.owner, cfg.repo, { repoPath, table: tableOf });
		} catch (err) {
			if (err instanceof GithubConfigError) return { status: 'skipped', reason: err.message };
			throw err;
		}
	}
	const readStatus = port.readIssueStatus?.bind(port);
	const missing = missingCapabilities(port.capabilities, new Set(['status-read']));
	if (missing.length > 0 || readStatus === undefined) {
		return { status: 'failed', reason: `the ${port.kind} tracker does not declare the needed capability: status-read` };
	}

	const timedOut = (): boolean => deadline !== undefined && (deadline.signal.aborted || deadline.remainingMs() <= 0);
	try {
		if (timedOut()) return { status: 'skipped', reason: TIME_LIMIT };
		const who = await port.whoAmI();
		if (!who.ok) return timedOut() ? { status: 'skipped', reason: TIME_LIMIT } : { status: 'skipped', reason: who.reason };

		const read = async (ref: string): Promise<{ status: TrackerStatus } | SyncResult> => {
			if (timedOut()) return { status: 'skipped', reason: TIME_LIMIT };
			const r = await readStatus(ref);
			if (r.ok) return { status: mapIssueStatus(r.value.state, r.value.labels) };
			return timedOut() ? { status: 'skipped', reason: TIME_LIMIT } : { status: 'failed', reason: r.reason };
		};
		const es = await read(epicRef);
		if (es.status === 'skipped' || es.status === 'failed') return es as SyncResult;
		const epicStatus = es.status as TrackerStatus;
		const storyStatus: Record<string, TrackerStatus> = {};
		for (const story of storiesOf(repoPath, epicHash)) {
			const ref = unitIssueOf(repoPath, epicHash, story);
			if (ref === undefined) continue;
			const s = await read(ref);
			if (s.status === 'skipped' || s.status === 'failed') return s as SyncResult;
			storyStatus[story] = s.status as TrackerStatus;
		}
		patchTrackerMeta(defineJson, { epicStatus, storyStatus, lastSyncedAt: new Date().toISOString() });
		return { status: 'synced', epicStatus, storyStatus };
	} catch (err) {
		if (isToolDenied(err)) throw err;   // a denied call stops the sync; it is not a failed one
		return { status: 'failed', reason: err instanceof Error ? err.message : String(err) };
	}
}

/** One Epic's result in a refresh. */
export interface TrackerRefreshEntry {
	readonly epicHash: string;
	readonly result:   SyncResult;
}

/** What a refresh did: one result per Epic and one warning line for each Epic that was skipped or failed. */
export interface TrackerRefreshReport {
	readonly results:  readonly TrackerRefreshEntry[];
	readonly warnings: readonly string[];
}

/** The hashes of the Epics that have a Define in the repo, in name order. */
function epicHashesOf(repoPath: string): string[] {
	let files: string[];
	try { files = readdirSync(join(repoPath, ARTIFACTS_DIR)); } catch { return []; }
	return files.map(f => /^DEF-([0-9a-f]+)\.json$/.exec(f)?.[1]).filter((h): h is string => h !== undefined).sort();
}

/**
 * Refresh the tracker status of one Epic (`epicHash`) or of every Epic of the repo that has a bound issue, under one Deadline
 * (default {@link TRACKER_REFRESH_DEADLINE_MS}). A repo with the tracker off makes no tracker call. Epics not reached before the
 * deadline are reported skipped with 'time limit reached'. Only a ToolDenied is thrown.
 */
export async function refreshTrackerStatus(repoPath: string, opts: { readonly epicHash?: string | undefined; readonly deadline?: Deadline | undefined; readonly port?: TrackerPort | undefined } = {}): Promise<TrackerRefreshReport> {
	const own = opts.deadline === undefined ? createDeadline(TRACKER_REFRESH_DEADLINE_MS) : undefined;
	const deadline = opts.deadline ?? own as Deadline;
	try {
		const hashes = opts.epicHash !== undefined ? [opts.epicHash] : epicHashesOf(repoPath);
		const results: TrackerRefreshEntry[] = [];
		const warnings: string[] = [];
		for (const epicHash of hashes) {
			const result = await syncTracker(repoPath, epicHash, undefined, { deadline, ...(opts.port !== undefined ? { port: opts.port } : {}) });
			// an Epic with no bound issue is not an event of this refresh when it was not asked for by name
			if (opts.epicHash === undefined && result.status === 'skipped' && /not pushed yet/.test(result.reason)) continue;
			results.push({ epicHash, result });
			if (result.status !== 'synced') {
				warnings.push(`tracker status of ${epicHash} ${result.status}: ${result.reason}`);
				log.warn({ epicHash, status: result.status, reason: result.reason }, 'tracker status not refreshed');
			}
		}
		return { results, warnings };
	} finally {
		own?.dispose();
	}
}

/** The ids of the Stories the Epic's Define lists; none when it cannot be read. */
function storiesOf(repoPath: string, epicHash: string): string[] {
	try { return readDefineArtifact(repoPath, epicHash).body.stories.map(s => s.id); } catch { return []; }
}
