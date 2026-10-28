/**
 * `tracker.sync` and `tracker.setup` at the daemon (Story s10): the terminal client calls these instead of running the tracker code itself.
 * A ToolDenied is not caught here: it reaches the client as the error of the call.
 */

import { githubConfigPath } from '../workflow/config/github.js';
import {
	configAlreadyDetail, configWrittenDetail, planTrackerConfig, runTrackerSetup,
} from '../workflow/tracker/setup.js';
import type { ConfigOutcome, TrackerSetupOptions, TrackerSetupReport } from '../workflow/tracker/setup.js';
import { syncTracker } from '../workflow/tracker/sync.js';
import type { SyncResult } from '../workflow/tracker/sync.js';
import type { RpcHandler } from './server.js';

/** `tracker.sync` {repoPath, epicHash}. */
export async function handleTrackerSync(params: unknown): Promise<SyncResult | { error: string }> {
	const p = (params ?? {}) as { repoPath?: unknown; epicHash?: unknown };
	if (typeof p.repoPath !== 'string' || p.repoPath.length === 0) return { error: 'tracker.sync: `repoPath` is required' };
	if (typeof p.epicHash !== 'string' || p.epicHash.length === 0) return { error: 'tracker.sync: `epicHash` is required' };
	return await syncTracker(p.repoPath, p.epicHash);
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
