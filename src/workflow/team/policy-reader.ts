/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * PolicyReader (Story s2, HLD contract sc2).
 *
 * Synchronous, non-interactive and network-free: it reads the policy from the
 * local copy git keeps of the remote default branch (the remote-tracking ref),
 * never from the working tree or another branch, and never guesses a branch.
 *
 * Order of evidence:
 *   1. A sighting (even a damaged one) says the repo carries a policy and takes
 *      precedence over every solo-repo shortcut: such a repo is never 'none'.
 *   2. With no sighting, a repo with no remote, no remote HEAD, or no policy on a
 *      fetched ref is a solo repo ('none'); a policy on a fetched ref whose branch
 *      is not known as the default is refused with an instruction, never applied.
 */

import { getLogger } from '../../shared/logger.js';
import { findAnchor } from './anchor-finder.js';
import { POLICY_PATH, runGit } from './git.js';
import { parsePolicyFile, buildTeamPolicy } from './policy-parser.js';
import { isSafeRefName, mergeAnchor, publishSightingIfAbsent, readSighting } from './sighting-store.js';
import type { Sighting } from './sighting-store.js';
import type { PolicyAnchor, PolicyResult, TeamPolicy } from './types.js';

const log = getLogger('team-policy-reader');

export interface ReaderOptions {
	/** Where sightings live; defaults to ~/.insrc/team. Tests pass a scratch directory. */
	readonly teamDir?: string | undefined;
	readonly now?: (() => Date) | undefined;
	/** Seam for the create-only first-observation write; tests inject a failing one. */
	readonly publish?: typeof publishSightingIfAbsent | undefined;
}

type Found =
	| { readonly kind: 'policy'; readonly policy: TeamPolicy }
	| { readonly kind: 'invalid'; readonly reason: string }
	| { readonly kind: 'missing' };

export function isGitRepo(repo: string): boolean {
	return runGit(repo, ['rev-parse', '--git-dir']).ok;
}

/** The policy remote: origin when present, else the sole remote, else none (never guessed). */
export function pickRemote(repo: string): string | undefined {
	const listed = runGit(repo, ['remote']);
	if (!listed.ok) return undefined;
	const remotes = listed.stdout.split('\n').map(r => r.trim()).filter(r => r.length > 0 && isSafeRefName(r));
	if (remotes.includes('origin')) return 'origin';
	return remotes.length === 1 ? remotes[0] : undefined;
}

/** The default branch git itself recorded for the remote (refs/remotes/<remote>/HEAD), if any. */
export function remoteHeadBranch(repo: string, remote: string): string | undefined {
	const head = runGit(repo, ['symbolic-ref', '-q', `refs/remotes/${remote}/HEAD`]);
	if (!head.ok) return undefined;
	const prefix = `refs/remotes/${remote}/`;
	const ref = head.stdout.trim();
	if (!ref.startsWith(prefix)) return undefined;
	const branch = ref.slice(prefix.length);
	return isSafeRefName(branch) ? branch : undefined;
}

function resolveSha(repo: string, rev: string): string | undefined {
	const out = runGit(repo, ['rev-parse', '--verify', '-q', `${rev}^{commit}`]);
	return out.ok ? out.stdout.trim() : undefined;
}

/** Read and parse the policy file as it stands at `rev` (a ref or a commit). */
function readAt(repo: string, rev: string, label: string, fetchedAt: string, anchor: PolicyAnchor): Found {
	const shown = runGit(repo, ['show', `${rev}:${POLICY_PATH}`]);
	if (!shown.ok) return { kind: 'missing' };
	const parsed = parsePolicyFile(shown.stdout);
	if (!parsed.ok) return { kind: 'invalid', reason: `policy file on ${label} is invalid: ${parsed.reason}` };
	return { kind: 'policy', policy: buildTeamPolicy(parsed.value, { ref: label, fetchedAt, anchor }) };
}

function trackingRef(remote: string, branch: string): string {
	return `refs/remotes/${remote}/${branch}`;
}

/** Tracking refs of `remote` (symbolic HEAD skipped) that carry the policy file. */
function refsCarryingPolicy(repo: string, remote: string): string[] {
	const listed = runGit(repo, ['for-each-ref', '--format=%(refname)', `refs/remotes/${remote}/`]);
	if (!listed.ok) return [];
	const head = `refs/remotes/${remote}/HEAD`;
	return listed.stdout.split('\n').map(r => r.trim()).filter(r => r.length > 0 && r !== head)
		.filter(r => runGit(repo, ['cat-file', '-e', `${r}:${POLICY_PATH}`]).ok);
}

export function readPolicy(repo: string, opts: ReaderOptions = {}): PolicyResult<TeamPolicy | 'none'> {
	const now = (opts.now ?? ((): Date => new Date()))().toISOString();
	const seen = readSighting(repo, opts.teamDir);

	if (seen.kind === 'valid') return readKnownRepo(repo, seen.sighting);
	if (seen.kind === 'damaged') return readDamaged(repo, seen.reason, now);
	return readUnseen(repo, now, opts.teamDir, opts.publish ?? publishSightingIfAbsent);
}

/** A sighting exists: the repo is known to carry a policy, so it is never 'none'. */
function readKnownRepo(repo: string, s: Sighting): PolicyResult<TeamPolicy | 'none'> {
	const ref = trackingRef(s.remote, s.branch);
	const anchor = s.anchor.known ? s.anchor : mergeAnchor(s.anchor, findAnchor(repo, ref));
	let found = readAt(repo, ref, ref, s.refreshedAt, anchor);
	let from = ref;
	if (found.kind === 'missing' && resolveSha(repo, ref) === undefined) {
		// The tracking ref is gone (remote removed, ref pruned): the commit the last refresh recorded still holds the policy.
		found = readAt(repo, s.sha, ref, s.refreshedAt, anchor);
		from = `commit ${s.sha}`;
	}
	if (found.kind === 'policy') return { ok: true, value: found.policy };
	if (found.kind === 'invalid') return { ok: false, reason: found.reason };
	return { ok: false, reason: `this repository is known to carry a team policy but it cannot be read from ${from}; run 'team refresh' to fetch it` };
}

/** The sighting is damaged: that is evidence of a policy, never absence. Try the remote HEAD branch, else refuse. */
function readDamaged(repo: string, why: string, now: string): PolicyResult<TeamPolicy | 'none'> {
	const remote = pickRemote(repo);
	const branch = remote === undefined ? undefined : remoteHeadBranch(repo, remote);
	if (remote !== undefined && branch !== undefined) {
		const ref = trackingRef(remote, branch);
		const found = readAt(repo, ref, ref, now, findAnchor(repo, ref));
		if (found.kind === 'policy') return { ok: true, value: found.policy };
		if (found.kind === 'invalid') return { ok: false, reason: found.reason };
	}
	return { ok: false, reason: `this repository has a damaged team-policy record (${why}) and the policy cannot be read; run 'team refresh' to repair it` };
}

/** No sighting: only local evidence of a policy on the default branch's tracking ref counts. */
function readUnseen(repo: string, now: string, teamDir: string | undefined, publish: typeof publishSightingIfAbsent): PolicyResult<TeamPolicy | 'none'> {
	if (!isGitRepo(repo)) return { ok: true, value: 'none' };
	const remote = pickRemote(repo);
	if (remote === undefined) return { ok: true, value: 'none' };
	const branch = remoteHeadBranch(repo, remote);

	if (branch === undefined) {
		const carrying = refsCarryingPolicy(repo, remote);
		if (carrying.length === 0) return { ok: true, value: 'none' };
		return {
			ok: false,
			reason: `the default branch of remote '${remote}' is not known, and a fetched ref (${carrying[0]}) carries .insrc/policy.json; `
				+ `run 'team refresh --branch <default-branch-name>' to name the default branch`,
		};
	}

	const ref = trackingRef(remote, branch);
	const anchor = findAnchor(repo, ref);
	const found = readAt(repo, ref, ref, now, anchor);
	if (found.kind === 'missing') return { ok: true, value: 'none' };

	// First observation of a policy file (valid or invalid): remember this repo as a team repo, create-only.
	const sha = resolveSha(repo, ref);
	if (sha !== undefined) {
		try {
			publish(repo, { remote, branch, branchSource: 'remote', sha, refreshedAt: now, anchor }, teamDir);
		} catch (err) {
			log.warn({ err: err instanceof Error ? err.message : String(err) }, 'could not record first sighting; the result is unchanged');
		}
	}
	return found.kind === 'policy' ? { ok: true, value: found.policy } : { ok: false, reason: found.reason };
}

/** The HLD's PolicyReader: `(repo) => PolicyResult<TeamPolicy | 'none'>`. */
export const policyReader = (repo: string): PolicyResult<TeamPolicy | 'none'> => readPolicy(repo);
