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
import type { GitAsync } from './git-async.js';
import { POLICY_PATH, runGit } from './git.js';
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
}

function fail(reason: string): { ok: false; reason: string } {
	return { ok: false, reason };
}

export async function refreshPolicy(repo: string, opts: RefreshOptions = {}): Promise<PolicyResult<PolicyRefreshOutcome>> {
	if (!isGitRepo(repo)) return fail('this directory is not a git repository');

	const lock = acquireLock(repo, opts.teamDir);
	if (!lock.ok) return fail(lock.reason);
	try {
		return await refreshLocked(repo, opts);
	} finally {
		lock.release();
	}
}

async function refreshLocked(repo: string, opts: RefreshOptions): Promise<PolicyResult<PolicyRefreshOutcome>> {
	const git = opts.git ?? runGitAsync;
	const write = opts.write ?? writeSighting;
	const now = (opts.now ?? ((): Date => new Date()))().toISOString();
	const deadline = createDeadline(opts.deadlineMs ?? REFRESH_DEADLINE_MS);

	const seen = readSighting(repo, opts.teamDir);
	const sighting = seen.kind === 'valid' ? seen.sighting : undefined;
	const remote = sighting?.remote ?? pickRemote(repo);
	if (remote === undefined) return fail('no single remote to refresh from: add a remote named origin');

	const decision = await resolveDefaultBranch({ repo, remote, sighting, supplied: opts.branch, deadline, git });
	if (!decision.ok) return fail(decision.reason);
	const { branch } = decision;
	const ref = `refs/remotes/${remote}/${branch}`;

	const fetched = await git(repo, ['fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', '--no-prune', '--refmap=', remote, `+refs/heads/${branch}:${ref}`], deadline);
	if (!fetched.ok) return fail(`fetching '${branch}' from '${remote}' failed: ${fetched.stderr}`);

	const sha = runGit(repo, ['rev-parse', '--verify', '-q', `${ref}^{commit}`]);
	if (!sha.ok) return fail(`'${branch}' was fetched but ${ref} cannot be resolved`);
	const commit = sha.stdout.trim();
	const warnings: string[] = [];

	const shown = runGit(repo, ['show', `${ref}:${POLICY_PATH}`]);
	if (!shown.ok) {
		// The policy file is not on the default branch: a deliberate removal reads as solo again.
		try {
			removeSighting(repo, opts.teamDir);
		} catch (err) {
			return fail(`the policy file is absent on '${branch}' but the stored record could not be removed (${err instanceof Error ? err.message : String(err)}); the next refresh retries`);
		}
		setRemoteHead(repo, remote, branch, warnings);
		return { ok: true, value: { kind: 'absent', branch, warnings } };
	}

	const parsed = parsePolicyFile(shown.stdout);
	const anchor = mergeAnchor(sighting?.anchor, findAnchor(repo, ref));
	try {
		write(repo, { remote, branch, branchSource: decision.source, sha: commit, refreshedAt: now, anchor }, opts.teamDir);
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'could not record the fetched policy');
		return fail(`the fetched policy could not be recorded (${err instanceof Error ? err.message : String(err)}); ${ref} has already moved, and the next refresh repairs the record`);
	}

	setRemoteHead(repo, remote, branch, warnings);
	return parsed.ok
		? { ok: true, value: { kind: 'fetched', branch, sha: commit, warnings } }
		: { ok: true, value: { kind: 'invalid', branch, reason: parsed.reason, warnings } };
}

/** Keep a clone-style remote HEAD consistent. Cosmetic: a failure is only a warning. */
function setRemoteHead(repo: string, remote: string, branch: string, warnings: string[]): void {
	const head = runGit(repo, ['symbolic-ref', `refs/remotes/${remote}/HEAD`, `refs/remotes/${remote}/${branch}`]);
	if (!head.ok) warnings.push(`could not update refs/remotes/${remote}/HEAD (${head.stderr}); the recorded branch is used instead`);
}
