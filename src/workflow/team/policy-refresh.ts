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
import { isToolDenied } from '../tracker/tool-denied.js';
import { findAnchor } from './anchor-finder.js';
import { resolveDefaultBranch } from './branch-resolution.js';
import { POLICY_PATH } from './git.js';
import { refreshGit, refreshLocal } from './refresh-git.js';
import type { RefreshGit, RefreshLocal } from './refresh-git.js';
import { parsePolicyFile } from './policy-parser.js';
import { isGitRepo, pickRemote } from './policy-reader.js';
import { REFRESH_DEADLINE_MS, createDeadline, acquireLock, resolveRepoIdentity, mergeAnchor, readSighting, removeSighting, writeSighting } from './sighting-store.js';
import type { Deadline } from './sighting-store.js';
import type { PolicyAnchor, PolicyRefreshOutcome, PolicyResult } from './types.js';

const log = getLogger('team-policy-refresh');

export interface RefreshOptions {
	/** The default branch's name from --branch; used only when the remote cannot name it. */
	readonly branch?: string | undefined;
	readonly teamDir?: string | undefined;
	readonly now?: (() => Date) | undefined;
	readonly deadlineMs?: number | undefined;
	/** Stops the refresh at the call that is running (the executor kills it): the daemon method was cancelled or the connection closed. */
	readonly signal?: AbortSignal | undefined;
	/** Test seams. */
	readonly git?: RefreshGit | undefined;
	readonly write?: ((...args: Parameters<typeof writeSighting>) => void | Promise<void>) | undefined;
	readonly local?: RefreshLocal | undefined;
	readonly anchor?: ((repo: string, trackingRef: string, budget?: () => number) => PolicyAnchor | Promise<PolicyAnchor>) | undefined;
}

function fail(reason: string): { ok: false; reason: string } {
	return { ok: false, reason };
}

/** The LLD's `PolicyRefresh`: `(repo, branch?)`. The second argument may also be a full options object. */
export async function refreshPolicy(repo: string, optsOrBranch: RefreshOptions | string = {}): Promise<PolicyResult<PolicyRefreshOutcome>> {
	const opts: RefreshOptions = typeof optsOrBranch === 'string' ? { branch: optsOrBranch } : optsOrBranch;
	// One deadline for the whole refresh, started before the first git call; every call takes what is left of it.
	const deadline = createDeadline(opts.deadlineMs ?? REFRESH_DEADLINE_MS);
	try {
		if (deadline.remainingMs() <= 0) return fail('the refresh deadline passed before it started');
		if (!(await isGitRepo(repo, deadline.remainingMs(), opts.signal))) return fail('this directory is not a git repository');

		await resolveRepoIdentity(repo, Math.max(1, deadline.remainingMs()), opts.signal); // ask git once, inside the budget; the store reuses the answer
		const lock = await acquireLock(repo, opts.teamDir);
		if (!lock.ok) return fail(lock.reason);
		try {
			return await refreshLocked(repo, opts, deadline);
		} finally {
			lock.release();
		}
	} finally {
		deadline.dispose();
	}
}

async function refreshLocked(repo: string, opts: RefreshOptions, deadline: Deadline): Promise<PolicyResult<PolicyRefreshOutcome>> {
	const git = opts.git ?? refreshGit(opts.signal);
	const write = opts.write ?? writeSighting;
	const local = opts.local ?? refreshLocal(opts.signal);
	const now = (opts.now ?? ((): Date => new Date()))().toISOString();
	const seen = await readSighting(repo, opts.teamDir);
	const sighting = seen.kind === 'valid' ? seen.sighting : undefined;
	const remote = sighting?.remote ?? await pickRemote(repo, Math.max(1, deadline.remainingMs()), opts.signal);
	if (remote === undefined) return fail('no single remote to refresh from: add a remote named origin');

	const decision = await resolveDefaultBranch({ repo, remote, sighting, supplied: opts.branch, deadline, git });
	if (!decision.ok) return fail(decision.reason);
	const { branch } = decision;
	const ref = `refs/remotes/${remote}/${branch}`;

	const fetched = await git.fetchRefs(repo, { remote, refspecs: [`+refs/heads/${branch}:${ref}`] }, deadline);
	if (!fetched.ok) return fail(`fetching '${branch}' from '${remote}' failed: ${fetched.stderr}`);

	const sha = await local.resolveCommit(repo, ref, deadline);
	if (!sha.ok) return fail(`'${branch}' was fetched but ${ref} cannot be resolved`);
	const commit = sha.value.trim();
	const warnings: string[] = [];

	// Tell "the file is not on the branch" (the listing succeeds and lists nothing) from any other git failure,
	// which must never be mistaken for a removal.
	const tree = await local.policyNames(repo, commit, POLICY_PATH, deadline);
	if (!tree.ok) return fail(`could not look for the policy file on ${ref} (${tree.stderr}); nothing was changed`);

	if (tree.value.length === 0) {
		// The policy file is not on the default branch: a deliberate removal reads as solo again.
		// If the remote HEAD may still name another retained branch (which could still hold an old policy), it is not
		// cosmetic any more: fix it BEFORE touching the record, and if that fails leave everything as it was and fail.
		let head: { ok: true } | { ok: false; warning: string } | undefined;
		if (await remoteHeadMayBeStale(local, repo, remote, branch, deadline)) {
			head = await setRemoteHead(local, repo, remote, branch, deadline);
			if (!head.ok) {
				return fail(`the policy file is absent on '${branch}', but refs/remotes/${remote}/HEAD may still point at another branch and could not be updated (${head.warning}); `
					+ 'the record was kept, so run the refresh again');
			}
		}
		try {
			await removeSighting(repo, opts.teamDir);
		} catch (err) {
			return fail(`the policy file is absent on '${branch}' but the stored record could not be removed (${err instanceof Error ? err.message : String(err)}); the next refresh retries`);
		}
		// Update the remote HEAD once: reuse the result when it was already fixed above.
		head ??= await setRemoteHead(local, repo, remote, branch, deadline);
		if (!head.ok) warnings.push(head.warning);
		return { ok: true, value: { kind: 'absent', branch, warnings } };
	}

	// The file exists. Whatever happens next, remember this repo as a team repo: even a file that cannot be read is evidence.
	const shown = await local.policyText(repo, commit, POLICY_PATH, deadline);
	const parsed = shown.ok ? parsePolicyFile(shown.value) : undefined;
	const anchor = mergeAnchor(sighting?.anchor, await (opts.anchor ?? findAnchor)(repo, commit, () => deadline.remainingMs(), opts.signal));
	// An anchor lookup that ran out of time reads as 'unknown'; never record a result the deadline cut short.
	if (deadline.remainingMs() <= 0) return fail('the refresh deadline passed before the policy could be recorded; nothing was recorded');
	try {
		await write(repo, { remote, branch, branchSource: decision.source, sha: commit, refreshedAt: now, anchor }, opts.teamDir);
	} catch (err) {
		if (isToolDenied(err)) throw err;
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'could not record the fetched policy');
		return fail(`the fetched policy could not be recorded (${err instanceof Error ? err.message : String(err)}); ${ref} has already moved, and the next refresh repairs the record`);
	}
	if (!shown.ok || parsed === undefined) {
		return fail(`the policy file on ${ref} exists but could not be read (${shown.ok ? 'unreadable' : shown.stderr}); the repository was recorded as carrying a policy, so team actions are refused until it can be read`);
	}

	const head = await setRemoteHead(local, repo, remote, branch, deadline);
	if (!head.ok) warnings.push(head.warning);
	return parsed.ok
		? { ok: true, value: { kind: 'fetched', branch, sha: commit, warnings } }
		: { ok: true, value: { kind: 'invalid', branch, reason: parsed.reason, warnings } };
}

/** Keep a clone-style remote HEAD pointing at the default branch. A failure is reported to the caller to decide. */
async function setRemoteHead(local: RefreshLocal, repo: string, remote: string, branch: string, deadline: Deadline): Promise<{ ok: true } | { ok: false; warning: string }> {
	const head = await local.setRemoteHead(repo, remote, branch, deadline);
	return head.ok ? { ok: true } : { ok: false, warning: `could not update refs/remotes/${remote}/HEAD (${head.stderr}); the recorded branch is used instead` };
}

/**
 * True unless the remote HEAD is known to name `branch`. An unset HEAD counts too: the reader then searches every fetched
 * ref for a policy, so a retained branch with an old policy would make a removed policy look present. A HEAD that cannot be
 * inspected is of course unknown.
 */
async function remoteHeadMayBeStale(local: RefreshLocal, repo: string, remote: string, branch: string, deadline: Deadline): Promise<boolean> {
	const head = await local.remoteHead(repo, remote, deadline);
	return !head.ok || head.value?.trim() !== `refs/remotes/${remote}/${branch}`;
}
