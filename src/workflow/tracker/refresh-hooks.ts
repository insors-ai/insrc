/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The two post-success rules that refresh the tracker status (Story s9): one after `git_pull`, one after `git_push`.
 *
 * A rule acts only when the call named its repository (`input.cwd`) and that path is, once both are canonical, a registered
 * repository root: a subdirectory, a linked worktree (the handoff park pushes from a temporary one) and an unregistered path
 * run no refresh. A dry-run pull and a push that pushed nothing run none either. A rule throws one line when the refresh was
 * skipped, failed or denied, so the executor reports it as `hookFailures` and the git tool stays a success.
 */

import { realpath } from 'node:fs/promises';
import { registerToolHook } from '../../daemon/tools/hooks.js';
import type { ToolHookContext } from '../../daemon/tools/types.js';
import { refreshTrackerStatus } from './sync.js';
import type { TrackerRefreshReport } from './sync.js';

export interface TrackerRefreshHookDeps {
	/** The paths of the registered repositories. */
	readonly registeredRepos: () => Promise<ReadonlySet<string>>;
	/** The refresh the rules run; each call has its own Deadline. */
	readonly refresh?: ((repoPath: string) => Promise<TrackerRefreshReport>) | undefined;
}

async function canonical(path: string): Promise<string | undefined> {
	try { return await realpath(path); } catch { return undefined; }
}

/** The registered root `cwd` is, or undefined when it is not one. */
async function registeredRootOf(cwd: unknown, registered: () => Promise<ReadonlySet<string>>): Promise<string | undefined> {
	if (typeof cwd !== 'string' || cwd.length === 0) return undefined;
	const real = await canonical(cwd);
	if (real === undefined) return undefined;
	for (const path of await registered()) {
		if (await canonical(path) === real) return path;
	}
	return undefined;
}

function rule(id: string, toolId: string, applies: (ctx: ToolHookContext) => boolean, deps: TrackerRefreshHookDeps) {
	return {
		id, toolId,
		async run(ctx: ToolHookContext): Promise<void> {
			if (!applies(ctx)) return;
			const root = await registeredRootOf((ctx.input as { cwd?: unknown } | null)?.cwd, deps.registeredRepos);
			if (root === undefined) return;
			const report = await (deps.refresh ?? ((repo: string) => refreshTrackerStatus(repo)))(root);
			if (report.warnings.length > 0) throw new Error(report.warnings.join('; '));
		},
	};
}

/** Register the two rules; called once at daemon start. */
export function registerTrackerRefreshHooks(deps: TrackerRefreshHookDeps): void {
	const notDry = (ctx: ToolHookContext): boolean => (ctx.input as { dryRun?: unknown } | null)?.dryRun !== true;
	const pushed = (ctx: ToolHookContext): boolean => (ctx.result as { data?: { pushed?: unknown } }).data?.pushed === true;
	registerToolHook(rule('tracker-refresh-after-pull', 'git_pull', notDry, deps));
	registerToolHook(rule('tracker-refresh-after-push', 'git_push', pushed, deps));
}
