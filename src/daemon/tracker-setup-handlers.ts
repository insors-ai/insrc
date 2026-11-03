/**
 * `tracker.sync` and `tracker.setup` at the daemon (Story s10): the terminal client calls these instead of running the tracker code itself.
 * A ToolDenied is not caught here: it reaches the client as the error of the call.
 */

import { githubConfigPath } from '../workflow/config/github.js';
import {
	configAlreadyDetail, configWrittenDetail, planTrackerConfig, runTrackerSetup,
} from '../workflow/tracker/setup.js';
import type { ConfigOutcome, TrackerSetupOptions, TrackerSetupReport } from '../workflow/tracker/setup.js';
import { refreshTrackerStatus } from '../workflow/tracker/sync.js';
import type { SyncResult } from '../workflow/tracker/sync.js';
import type { RpcHandler } from './server.js';

/** What a repository-wide `tracker.sync` answers: how many Epics were refreshed, or why none was or all were not. */
export type RepoSyncResult =
	| { readonly status: 'synced';  readonly refreshed: number }
	| { readonly status: 'skipped'; readonly reason: string }
	| { readonly status: 'failed';  readonly reason: string };

/** The repositories a repository-wide refresh is running for; a second call for one of them is skipped, not queued. */
const refreshing = new Set<string>();

async function syncRepository(repoPath: string): Promise<RepoSyncResult> {
	if (refreshing.has(repoPath)) return { status: 'skipped', reason: 'a refresh of this repository is already running' };
	refreshing.add(repoPath);
	try {
		const report = await refreshTrackerStatus(repoPath);
		if (report.results.length === 0) return { status: 'skipped', reason: 'nothing to refresh' };
		const reason = report.warnings.join('; ');
		if (report.results.some(entry => entry.result.status === 'failed')) return { status: 'failed', reason };
		if (report.results.some(entry => entry.result.status === 'skipped')) return { status: 'skipped', reason };
		return { status: 'synced', refreshed: report.results.length };
	} finally {
		refreshing.delete(repoPath);
	}
}

/** `tracker.sync` {repoPath, epicHash?}: one Epic, or every Epic of the repository when epicHash is left out. */
export async function handleTrackerSync(params: unknown): Promise<SyncResult | RepoSyncResult | { error: string }> {
	const p = (params ?? {}) as { repoPath?: unknown; epicHash?: unknown };
	if (typeof p.repoPath !== 'string' || p.repoPath.length === 0) return { error: 'tracker.sync: `repoPath` is required' };
	if (p.epicHash === undefined) return syncRepository(p.repoPath);
	if (typeof p.epicHash !== 'string' || p.epicHash.length === 0) return { error: 'tracker.sync: `epicHash` must be a non-empty string when given' };
	const entry = (await refreshTrackerStatus(p.repoPath, { epicHash: p.epicHash })).results[0];
	return entry?.result ?? { status: 'skipped', reason: 'nothing to refresh' };
}

type EnsureReply = { readonly ok: true; readonly changed: boolean } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

/**
 * `tracker.setup` {repoPath, opts}: plan the config step, have the daemon's own repo.trackerConfig.ensure write it when it needs
 * writing (the daemon is the only writer of github.json), then run the checklist with that outcome.
 */
export async function handleTrackerSetup(params: unknown, ensure: RpcHandler): Promise<TrackerSetupReport | { error: string }> {
	const p = (params ?? {}) as { repoPath?: unknown; opts?: unknown };
	if (typeof p.repoPath !== 'string' || p.repoPath.length === 0) return { error: 'tracker.setup: `repoPath` is required' };
	const opts = (p.opts !== null && typeof p.opts === 'object' ? p.opts : {}) as TrackerSetupOptions;
	const plan = await planTrackerConfig(p.repoPath);
	let configOutcome: ConfigOutcome;
	if (plan.status !== 'needs-write') {
		configOutcome = { status: plan.status, detail: plan.detail };
	} else {
		const path = githubConfigPath();
		try {
			const reply = await ensure({ repo: p.repoPath, owner: plan.owner, name: plan.name }) as EnsureReply;
			configOutcome = !reply.ok ? { status: 'failed', detail: reply.error.message }
				: reply.changed ? { status: 'done', detail: configWrittenDetail(path, plan.owner, plan.name) }
				: { status: 'already', detail: configAlreadyDetail(path, plan.owner, plan.name) };
		} catch (err) {
			configOutcome = { status: 'failed', detail: `could not write ${path}: ${err instanceof Error ? err.message : String(err)}` };
		}
	}
	return await runTrackerSetup(p.repoPath, { ...opts, configOutcome });
}
