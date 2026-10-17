/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * PolicyRefresh (Story s2): the one call that uses the network.
 *
 * Under a per-repository lock and one shared 10 second deadline:
 *   1. decide the default branch (see branch-resolution.ts);
 *   2. fetch ONLY that branch into its tracking ref (explicit refspec and an empty
 *      --refmap, so configured fetch refspecs, tags and FETCH_HEAD are not touched);
 *   3. read the policy from the updated tracking ref and find the anchor;
 *   4. write the sighting (or remove it when the policy file is gone);
 *   5. point the remote HEAD at the branch. This last step is cosmetic.
 * The sighting is written before the cosmetic step and carries the branch, so the
 * reader never depends on the remote HEAD once a sighting exists; if step 4 fails
 * after the ref moved, the refresh reports failure (the next refresh repairs it).
 */

import { getLogger } from '../../shared/logger.js';
import { findAnchor } from './anchor-finder.js';
import { resolveDefaultBranch } from './branch-resolution.js';
import { createDeadline, runGitAsync } from './git-async.js';
import type { Deadline, GitAsync } from './git-async.js';
import { POLICY_PATH, runGit } from './git.js';
import type { GitRun } from './git.js';
import { parsePolicyFile } from './policy-parser.js';
import { isGitRepo, pickRemote } from './policy-reader.js';
import { REFRESH_DEADLINE_MS, acquireLock, mergeAnchor, readSighting, removeSighting, writeSighting } from './sighting-store.js';
import type { PolicyRefreshOutcome, PolicyResult } from './types.js';

const log = getLogger('team-policy-refresh');

export interface RefreshOptions {
	/** The default branch's name from --branch; used only when the remote cannot name it. */
	readonly branch?: string | undefined;
	readonly teamDir?: string | undefined;
	readonly now?: (() => Date) | undefined;
	readonly deadlineMs?: number | undefined;
	/** Test seams. */
	readonly git?: GitAsync | undefined;
	readonly write?: typeof writeSighting | undefined;
	readonly local?: LocalGit | undefined;
	readonly anchor?: typeof findAnchor | undefined;
}

type LocalGit = (repo: string, args: readonly string[], deadline: Deadline) => GitRun;

/** A local git call that shares the refresh's single deadline instead of carrying its own timeout. */
const defaultLocalGit: LocalGit = (repo, args, deadline) => {
	const left = deadline.remainingMs();
	if (left <= 0) return { ok: false, stderr: 'the refresh deadline passed' };
	return runGit(repo, args, left);
};

function fail(reason: string): { ok: false; reason: string } {
	return { ok: false, reason };
}

export async function refreshPolicy(repo: string, opts: RefreshOptions = {}): Promise<PolicyResult<PolicyRefreshOutcome>> {
	// One deadline for the whole refresh, started before the first git call.
	const deadline = createDeadline(opts.deadlineMs ?? REFRESH_DEADLINE_MS);
	if (deadline.remainingMs() <= 0) return fail('the refresh deadline passed before it started');
	if (!isGitRepo(repo, deadline.remainingMs())) return fail('this directory is not a git repository');

	const lock = acquireLock(repo, opts.teamDir);
	if (!lock.ok) return fail(lock.reason);
	try {
		return await refreshLocked(repo, opts, deadline);
	} finally {
		lock.release();
	}
}

async function refreshLocked(repo: string, opts: RefreshOptions, deadline: Deadline): Promise<PolicyResult<PolicyRefreshOutcome>> {
	const git = opts.git ?? runGitAsync;
	const write = opts.write ?? writeSighting;
	const localGit = opts.local ?? defaultLocalGit;
	const now = (opts.now ?? ((): Date => new Date()))().toISOString();
	const seen = readSighting(repo, opts.teamDir);
	const sighting = seen.kind === 'valid' ? seen.sighting : undefined;
	const remote = sighting?.remote ?? pickRemote(repo, Math.max(1, deadline.remainingMs()));
	if (remote === undefined) return fail('no single remote to refresh from: add a remote named origin');

	const decision = await resolveDefaultBranch({ repo, remote, sighting, supplied: opts.branch, deadline, git });
	if (!decision.ok) return fail(decision.reason);
	const { branch } = decision;
	const ref = `refs/remotes/${remote}/${branch}`;

	const fetched = await git(repo, ['fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', '--no-prune', '--refmap=', remote, `+refs/heads/${branch}:${ref}`], deadline);
	if (!fetched.ok) return fail(`fetching '${branch}' from '${remote}' failed: ${fetched.stderr}`);

	const sha = localGit(repo, ['rev-parse', '--verify', '-q', `${ref}^{commit}`], deadline);
	if (!sha.ok) return fail(`'${branch}' was fetched but ${ref} cannot be resolved`);
	const commit = sha.stdout.trim();
	const warnings: string[] = [];

	// Tell "the file is not on the branch" (ls-tree succeeds and lists nothing) from any other git failure,
	// which must never be mistaken for a removal.
	const tree = localGit(repo, ['ls-tree', '--name-only', ref, '--', POLICY_PATH], deadline);
	if (!tree.ok) return fail(`could not look for the policy file on ${ref} (${tree.stderr}); nothing was changed`);

	if (tree.stdout.trim().length === 0) {
		// The policy file is not on the default branch: a deliberate removal reads as solo again.
		// If the remote HEAD may still name another retained branch (which could still hold an old policy), it is not
		// cosmetic any more: fix it BEFORE touching the record, and if that fails leave everything as it was and fail.
		if (remoteHeadMayBeStale(localGit, repo, remote, branch, deadline)) {
			const fixed = setRemoteHead(localGit, repo, remote, branch, deadline);
			if (!fixed.ok) {
				return fail(`the policy file is absent on '${branch}', but refs/remotes/${remote}/HEAD may still point at another branch and could not be updated (${fixed.warning}); `
					+ 'the record was kept, so run the refresh again');
			}
		}
		try {
			removeSighting(repo, opts.teamDir);
		} catch (err) {
			return fail(`the policy file is absent on '${branch}' but the stored record could not be removed (${err instanceof Error ? err.message : String(err)}); the next refresh retries`);
		}
		const head = setRemoteHead(localGit, repo, remote, branch, deadline);
		if (!head.ok) warnings.push(head.warning);
		return { ok: true, value: { kind: 'absent', branch, warnings } };
	}

	const shown = localGit(repo, ['show', `${ref}:${POLICY_PATH}`], deadline);
	if (!shown.ok) return fail(`the policy file on ${ref} could not be read (${shown.stderr}); nothing was changed`);
	const parsed = parsePolicyFile(shown.stdout);
	const anchor = mergeAnchor(sighting?.anchor, (opts.anchor ?? findAnchor)(repo, ref, () => deadline.remainingMs()));
	// An anchor lookup that ran out of time reads as 'unknown'; never record a result the deadline cut short.
	if (deadline.remainingMs() <= 0) return fail('the refresh deadline passed before the policy could be recorded; nothing was recorded');
	try {
		write(repo, { remote, branch, branchSource: decision.source, sha: commit, refreshedAt: now, anchor }, opts.teamDir);
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'could not record the fetched policy');
		return fail(`the fetched policy could not be recorded (${err instanceof Error ? err.message : String(err)}); ${ref} has already moved, and the next refresh repairs the record`);
	}

	const head = setRemoteHead(localGit, repo, remote, branch, deadline);
	if (!head.ok) warnings.push(head.warning);
	return parsed.ok
		? { ok: true, value: { kind: 'fetched', branch, sha: commit, warnings } }
		: { ok: true, value: { kind: 'invalid', branch, reason: parsed.reason, warnings } };
}

/** Keep a clone-style remote HEAD pointing at the default branch. A failure is reported to the caller to decide. */
function setRemoteHead(localGit: LocalGit, repo: string, remote: string, branch: string, deadline: Deadline): { ok: true } | { ok: false; warning: string } {
	const head = localGit(repo, ['symbolic-ref', `refs/remotes/${remote}/HEAD`, `refs/remotes/${remote}/${branch}`], deadline);
	return head.ok ? { ok: true } : { ok: false, warning: `could not update refs/remotes/${remote}/HEAD (${head.stderr}); the recorded branch is used instead` };
}

/**
 * True unless the remote HEAD is known to be absent or to name `branch`. A HEAD that cannot be inspected
 * (a failing git, a spent deadline) counts as possibly stale, so the caller fails closed.
 */
function remoteHeadMayBeStale(localGit: LocalGit, repo: string, remote: string, branch: string, deadline: Deadline): boolean {
	const head = localGit(repo, ['symbolic-ref', '-q', `refs/remotes/${remote}/HEAD`], deadline);
	if (!head.ok) return head.stderr !== ''; // `-q` exits 1 with no message when the ref is simply not a symbolic ref
	return head.stdout.trim() !== `refs/remotes/${remote}/${branch}`;
}
