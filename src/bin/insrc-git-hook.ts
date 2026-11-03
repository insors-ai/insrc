/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/**
 * The git hook entry: a hook block installed by `repo.gitHooks.install` runs this in the background with the repository root.
 * It asks the daemon to refresh the tracker status of every Epic of that repository and exits 0 whatever happens, so a hook can
 * never change the outcome of the git command that fired it: the daemon not running, a timeout, an error answer and a
 * repository the daemon does not know are all ignored.
 *
 * Usage: insrc-git-hook <repository root>
 *
 * It imports only the shared rpc client (which reads the socket path from the paths module) so it starts fast.
 */

import { pathToFileURL } from 'node:url';
import { rpc } from '../shared/ipc-client.js';

/** How long the hook waits for the daemon to answer; the refresh itself keeps running in the daemon when this passes. */
export const HOOK_TIMEOUT_MS = 10_000;

/** One call to the daemon; replaceable so a test needs no socket. */
export type HookCall = (method: string, params: unknown, timeoutMs: number) => Promise<unknown>;

const daemonCall: HookCall = (method, params, timeoutMs) => rpc(method, params, undefined, { timeoutMs });

/** Ask the daemon for a repository-wide tracker refresh. Never throws. */
export async function runGitHook(args: readonly string[], call: HookCall = daemonCall): Promise<void> {
	const repoPath = args[0];
	if (repoPath === undefined || repoPath.length === 0) return;
	try {
		await call('tracker.sync', { repoPath }, HOOK_TIMEOUT_MS);
	} catch {
		// a hook never fails git: the refresh is simply missed and the next one catches up
	}
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await runGitHook(process.argv.slice(2));
	process.exitCode = 0;
}
