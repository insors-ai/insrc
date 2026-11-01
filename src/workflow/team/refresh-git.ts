/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The git calls of the policy refresh (Story s9), over the tool registry, under the refresh's one Deadline.
 *
 * Every call takes the time that is left of the deadline as its time limit and the refresh's own signal (if any), so the
 * refresh stays inside REFRESH_DEADLINE_MS in total, starts no call once the budget is spent, and a call that runs past it
 * is stopped by the executor. An ordinary failure is a value (the refresh reports it); a call the user or a missing
 * client denied, or a cancellation by the caller's signal, is thrown as ToolDenied and ends the refresh at that call.
 */

import type { GitLsRemoteData } from '../../daemon/tools/builtins/git/schemas.js';
import { gitCall, GitCallFailed, catFileText, lsRemote, lsTreeNames, revParse, symbolicRef, fetchRefs } from '../git-calls.js';
import { gitSymbolicRefTool } from '../../daemon/tools/builtins/git/symbolic-ref.js';
import type { Deadline } from './sighting-store.js';

/** The outcome of one call: its value, or why it failed (and whether the deadline was the reason). */
export type RefreshRun<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly stderr: string; readonly timedOut: boolean };

/** The network calls of the refresh. */
export interface RefreshGit {
	lsRemote(repo: string, query: { readonly remote: string; readonly heads?: boolean; readonly symref?: boolean; readonly patterns?: readonly string[] }, deadline: Deadline): Promise<RefreshRun<GitLsRemoteData>>;
	fetchRefs(repo: string, query: { readonly remote: string; readonly refspecs: readonly string[] }, deadline: Deadline): Promise<RefreshRun<void>>;
}

/** The local calls of the refresh. */
export interface RefreshLocal {
	/** The commit a ref names. */
	resolveCommit(repo: string, ref: string, deadline: Deadline): Promise<RefreshRun<string>>;
	/** The names the policy file path lists in the tree of a commit (empty: the file is not there). */
	policyNames(repo: string, commit: string, path: string, deadline: Deadline): Promise<RefreshRun<string[]>>;
	/** The text of the policy file at a commit. */
	policyText(repo: string, commit: string, path: string, deadline: Deadline): Promise<RefreshRun<string>>;
	/** The ref `refs/remotes/<remote>/HEAD` names, or undefined when it is not set. */
	remoteHead(repo: string, remote: string, deadline: Deadline): Promise<RefreshRun<string | undefined>>;
	/** Point `refs/remotes/<remote>/HEAD` at the branch. */
	setRemoteHead(repo: string, remote: string, branch: string, deadline: Deadline): Promise<RefreshRun<void>>;
}

/** Run `call` with what is left of the deadline; an ordinary failure becomes a value, a denial is thrown. */
async function within<T>(deadline: Deadline, signal: AbortSignal | undefined, call: (o: { timeoutMs: number; signal: AbortSignal | undefined }) => Promise<T>): Promise<RefreshRun<T>> {
	const left = deadline.remainingMs();
	if (left <= 0) return { ok: false, stderr: 'the refresh deadline passed before git could run', timedOut: true };
	try {
		return { ok: true, value: await call({ timeoutMs: left, signal }) };
	} catch (err) {
		if (!(err instanceof GitCallFailed)) throw err;
		if (err.kind === 'schema-mismatch' || err.kind === 'conversion-failed') throw err;
		const timedOut = err.kind === 'timed-out';
		return { ok: false, stderr: timedOut ? 'git did not finish within the refresh deadline' : err.message, timedOut };
	}
}

export function refreshGit(signal?: AbortSignal): RefreshGit {
	return {
		lsRemote: (repo, query, deadline) => within(deadline, signal, o => lsRemote(repo, { remote: query.remote, ...(query.heads === true ? { heads: true } : {}), ...(query.symref === true ? { symref: true } : {}), ...(query.patterns !== undefined ? { patterns: [...query.patterns] } : {}) }, o)),
		fetchRefs: (repo, query, deadline) => within(deadline, signal, async o => {
			await fetchRefs(repo, { remote: query.remote, refspecs: [...query.refspecs], noTags: true, noWriteFetchHead: true, noRecurseSubmodules: true, noPrune: true, refmap: '' }, o);
		}),
	};
}

export function refreshLocal(signal?: AbortSignal): RefreshLocal {
	return {
		resolveCommit: (repo, ref, deadline) => within(deadline, signal, o => revParse(repo, `${ref}^{commit}`, { verify: true }, o)),
		policyNames: (repo, commit, path, deadline) => within(deadline, signal, o => lsTreeNames(repo, commit, [path], o)),
		policyText: (repo, commit, path, deadline) => within(deadline, signal, async o => {
			const text = await catFileText(repo, commit, path, o);
			if (text === undefined) throw new GitCallFailed('git_cat_file', 'rejected', `${path} is not in the tree of ${commit}`);
			return text;
		}),
		remoteHead: (repo, remote, deadline) => within(deadline, signal, o => symbolicRef(repo, `refs/remotes/${remote}/HEAD`, o)),
		setRemoteHead: (repo, remote, branch, deadline) => within(deadline, signal, async o => {
			await gitCall(gitSymbolicRefTool, { ref: `refs/remotes/${remote}/HEAD`, op: 'set', target: `refs/remotes/${remote}/${branch}` }, repo, o);
		}),
	};
}
