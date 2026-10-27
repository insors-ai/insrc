/**
 * commitAndPushArtifactsViaRegistry (Story s10): commitAndPushArtifacts as a sequence of git tool calls through the executor.
 *
 * Same result and same reason texts as the old function: it never throws for an ordinary failure (not a work tree, no files, a git
 * failure) and reports it in the result. A DENIED call (no client, declined, expired) is different: it is thrown as ToolDenied, with
 * the phase that was denied, whether the commit had already been made and the paths left staged, so a caller that ignores the result
 * cannot go on past it.
 *
 * git_stage runs under its own approval before git_commit is asked: a denial at git_commit leaves the paths staged (as the old
 * function left them when git commit failed). Nothing is unstaged and a failed or denied push is not retried.
 */

import { existsSync } from 'node:fs';

import { gitCommitTool } from '../../daemon/tools/builtins/git/commit.js';
import { gitDiffTool } from '../../daemon/tools/builtins/git/diff.js';
import { gitPushTool } from '../../daemon/tools/builtins/git/push.js';
import { gitRevParseTool } from '../../daemon/tools/builtins/git/rev-parse.js';
import { gitStageTool } from '../../daemon/tools/builtins/git/stage.js';
import type { ToolDeps } from '../../daemon/tools/types.js';
import type { CommitArtifactsResult } from './github.js';
import { run } from './registry-table.js';
import type { Call } from './registry-table.js';
import { ToolDenied } from './tool-denied.js';
import type { CommitPhase } from './tool-denied.js';

export async function commitAndPushArtifactsViaRegistry(repoPath: string, paths: readonly string[], message: string, deps: ToolDeps): Promise<CommitArtifactsResult> {
	let committed = false;
	let staged: readonly string[] = [];
	/** A denied call is thrown with where the sequence stood; any other failure is returned to the caller of this helper as the call. */
	const denyOr = <D>(c: Call<D>, phase: CommitPhase): Call<D> => {
		if (!c.ok && c.failure.kind === 'denied') throw new ToolDenied(c.toolId, c.failure.denial ?? 'declined', { phase, committed, stagedPaths: staged });
		return c;
	};

	const inside = denyOr(await run(gitRevParseTool, { cwd: repoPath, isInsideWorkTree: true }, deps), 'rev-parse');
	if (!inside.ok || inside.data.values[0] !== 'true') return { committed: false, pushed: false, reason: 'not a git work tree' };

	const present = paths.filter(p => existsSync(p));
	if (present.length === 0) return { committed: false, pushed: false, reason: 'no artifact files on disk' };

	const stage = denyOr(await run(gitStageTool, { cwd: repoPath, op: 'stage', paths: [...present] }, deps), 'stage');
	if (!stage.ok) return { committed: false, pushed: false, reason: `git add failed: ${stage.failure.message}` };
	staged = present;

	// an empty staged diff is nothing to commit; a git_diff that fails is a failure, never read as changes or as nothing
	const diff = denyOr(await run(gitDiffTool, { cwd: repoPath, staged: true }, deps), 'diff');
	if (!diff.ok) return { committed: false, pushed: false, reason: `git diff failed: ${diff.failure.message}` };
	if (diff.data.files.length === 0) return { committed: false, pushed: false, reason: 'nothing to commit (already up to date)' };

	const commit = denyOr(await run(gitCommitTool, { cwd: repoPath, message }, deps), 'commit');
	if (!commit.ok) return { committed: false, pushed: false, reason: `git commit failed: ${commit.failure.message}` };
	committed = true;
	staged = [];

	// a plain `git push`: the remote, the refspec and the upstream come from the repository's own configuration, as before
	const push = denyOr(await run(gitPushTool, { cwd: repoPath, configured: true }, deps), 'push');
	if (!push.ok) return { committed: true, pushed: false, reason: `committed locally; push failed: ${push.failure.message}` };
	return { committed: true, pushed: true };
}
