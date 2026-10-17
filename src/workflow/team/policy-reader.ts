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

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { findAnchor } from './anchor-finder.js';
import { POLICY_PATH, runGit } from './git.js';
import { parsePolicyFile, buildTeamPolicy } from './policy-parser.js';
import { acquireLock, isSafeRefName, mergeAnchor, publishSightingIfAbsent, readSighting } from './sighting-store.js';
import type { Sighting } from './sighting-store.js';
import type { PolicyAnchor, PolicyResult, TeamPolicy } from './types.js';

const log = getLogger('team-policy-reader');

export interface ReaderOptions {
	/** Where sightings live; defaults to ~/.insrc/team. Tests pass a scratch directory. */
	readonly teamDir?: string | undefined;
	readonly now?: (() => Date) | undefined;
	/** Seam for the create-only first-observation write; tests inject a failing one. */
	readonly publish?: typeof publishSightingIfAbsent | undefined;
	/** Test seam: runs after the policy is read and before the first sighting is recorded. */
	readonly beforeRecord?: (() => void) | undefined;
}

type Found =
	| { readonly kind: 'policy'; readonly policy: TeamPolicy }
	| { readonly kind: 'invalid'; readonly reason: string }
	| { readonly kind: 'error'; readonly reason: string; /** true when the file is known to exist but could not be read */ readonly exists: boolean }
	| { readonly kind: 'missing' };

/** An inspection that either answered or failed. A failure is never the same as "nothing there". */
export type Probe<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

function hasGitEntry(dir: string): boolean {
	let cur = resolve(dir);
	for (;;) {
		if (existsSync(join(cur, '.git'))) return true;
		const up = dirname(cur);
		if (up === cur) return false;
		cur = up;
	}
}

/**
 * Is `repo` inside a git repository? A directory with no `.git` anywhere up its tree is confirmed non-git; a git failure
 * where a `.git` entry does exist (a timeout, a damaged repository, a missing git program) is an error, not "not a repo".
 */
export function probeGitRepo(repo: string, timeoutMs?: number): Probe<boolean> {
	const out = runGit(repo, ['rev-parse', '--git-dir'], timeoutMs);
	if (out.ok) return { ok: true, value: true };
	return hasGitEntry(repo) ? { ok: false, reason: `the repository could not be inspected: ${out.stderr}` } : { ok: true, value: false };
}

export function isGitRepo(repo: string, timeoutMs?: number): boolean {
	const probe = probeGitRepo(repo, timeoutMs);
	return probe.ok && probe.value;
}

/** The policy remote: origin when present, else the sole remote, else none (never guessed). */
export function probeRemote(repo: string, timeoutMs?: number): Probe<string | undefined> {
	const listed = runGit(repo, ['remote'], timeoutMs);
	if (!listed.ok) return { ok: false, reason: `the remotes could not be listed: ${listed.stderr}` };
	const remotes = listed.stdout.split('\n').map(r => r.trim()).filter(r => r.length > 0 && isSafeRefName(r));
	if (remotes.includes('origin')) return { ok: true, value: 'origin' };
	return { ok: true, value: remotes.length === 1 ? remotes[0] : undefined };
}

export function pickRemote(repo: string, timeoutMs?: number): string | undefined {
	const probe = probeRemote(repo, timeoutMs);
	return probe.ok ? probe.value : undefined;
}

/** The default branch git itself recorded for the remote (refs/remotes/<remote>/HEAD); `quiet` failure means none is set. */
function probeRemoteHead(repo: string, remote: string): Probe<string | undefined> {
	const head = runGit(repo, ['symbolic-ref', '-q', `refs/remotes/${remote}/HEAD`]);
	if (!head.ok) return head.quiet === true ? { ok: true, value: undefined } : { ok: false, reason: `refs/remotes/${remote}/HEAD could not be read: ${head.stderr}` };
	const prefix = `refs/remotes/${remote}/`;
	const ref = head.stdout.trim();
	if (!ref.startsWith(prefix)) return { ok: true, value: undefined };
	const branch = ref.slice(prefix.length);
	return { ok: true, value: isSafeRefName(branch) ? branch : undefined };
}

/** Kept for callers that only want the answer: a failure reads as "not set". */
export function remoteHeadBranch(repo: string, remote: string): string | undefined {
	const probe = probeRemoteHead(repo, remote);
	return probe.ok ? probe.value : undefined;
}

type Rev = { readonly kind: 'found'; readonly sha: string } | { readonly kind: 'missing' } | { readonly kind: 'error'; readonly reason: string };

/**
 * Resolve a revision to a commit. `rev-parse --verify -q` exits quietly (no message) when the revision does not
 * exist; any message means git itself failed (a timeout, a damaged repository), which is not the same as absence.
 */
function resolveRev(repo: string, rev: string): Rev {
	const out = runGit(repo, ['rev-parse', '--verify', '-q', `${rev}^{commit}`]);
	if (out.ok) return { kind: 'found', sha: out.stdout.trim() };
	return out.quiet === true ? { kind: 'missing' } : { kind: 'error', reason: `${rev} could not be resolved: ${out.stderr}` };
}

function resolveSha(repo: string, rev: string): string | undefined {
	const r = resolveRev(repo, rev);
	return r.kind === 'found' ? r.sha : undefined;
}

/**
 * Read and parse the policy file as it stands at `rev` (a ref or a commit).
 * 'missing' means the revision does not exist or the file is confirmed absent from it; any other git failure
 * (a timeout, a damaged object, output too large) is an 'error', never taken for absence.
 */
function readAt(repo: string, rev: string, label: string, fetchedAt: string, anchor: PolicyAnchor): Found {
	// Pin the revision to one commit so the lookup and the read cannot see a ref that moves in between.
	const resolved = resolveRev(repo, rev);
	if (resolved.kind === 'missing') return { kind: 'missing' };
	if (resolved.kind === 'error') return { kind: 'error', reason: resolved.reason, exists: false };
	const sha = resolved.sha;
	const tree = runGit(repo, ['ls-tree', '--name-only', sha, '--', POLICY_PATH]);
	if (!tree.ok) return { kind: 'error', reason: `the policy file on ${label} could not be looked up: ${tree.stderr}`, exists: false };
	if (tree.stdout.trim().length === 0) return { kind: 'missing' };
	const shown = runGit(repo, ['show', `${sha}:${POLICY_PATH}`]);
	if (!shown.ok) return { kind: 'error', reason: `the policy file on ${label} could not be read: ${shown.stderr}`, exists: true };
	const parsed = parsePolicyFile(shown.stdout);
	if (!parsed.ok) return { kind: 'invalid', reason: `policy file on ${label} is invalid: ${parsed.reason}` };
	return { kind: 'policy', policy: buildTeamPolicy(parsed.value, { ref: label, fetchedAt, anchor }) };
}

function trackingRef(remote: string, branch: string): string {
	return `refs/remotes/${remote}/${branch}`;
}

type Scan =
	| { readonly kind: 'found'; readonly ref: string }
	| { readonly kind: 'none' }
	| { readonly kind: 'error'; readonly reason: string };

/**
 * Do any tracking refs of `remote` (the symbolic HEAD skipped) carry the policy file?
 * A listing or lookup that fails is an 'error', never taken for "no policy".
 */
function scanForPolicy(repo: string, remote: string): Scan {
	const listed = runGit(repo, ['for-each-ref', '--format=%(refname)', `refs/remotes/${remote}/`]);
	if (!listed.ok) return { kind: 'error', reason: `the fetched refs of remote '${remote}' could not be listed: ${listed.stderr}` };
	const head = `refs/remotes/${remote}/HEAD`;
	for (const ref of listed.stdout.split('\n').map(r => r.trim()).filter(r => r.length > 0 && r !== head)) {
		const tree = runGit(repo, ['ls-tree', '--name-only', ref, '--', POLICY_PATH]);
		if (!tree.ok) return { kind: 'error', reason: `${ref} could not be searched for the policy file: ${tree.stderr}` };
		if (tree.stdout.trim().length > 0) return { kind: 'found', ref };
	}
	return { kind: 'none' };
}

export function readPolicy(repo: string, opts: ReaderOptions = {}): PolicyResult<TeamPolicy | 'none'> {
	const now = (opts.now ?? ((): Date => new Date()))().toISOString();
	const seen = readSighting(repo, opts.teamDir);

	if (seen.kind === 'valid') return readKnownRepo(repo, seen.sighting);
	if (seen.kind === 'damaged') return readDamaged(repo, seen.reason, now);
	return readUnseen(repo, now, opts.teamDir, opts.publish ?? publishSightingIfAbsent, opts.beforeRecord);
}

/** A sighting exists: the repo is known to carry a policy, so it is never 'none'. */
function readKnownRepo(repo: string, s: Sighting): PolicyResult<TeamPolicy | 'none'> {
	const ref = trackingRef(s.remote, s.branch);
	const pinned = resolveSha(repo, ref) ?? ref; // one commit for the anchor and the read
	const anchor = s.anchor.known ? s.anchor : mergeAnchor(s.anchor, findAnchor(repo, pinned));
	let found = readAt(repo, pinned, ref, s.refreshedAt, anchor);
	let from = ref;
	if (found.kind === 'missing' && resolveRev(repo, ref).kind === 'missing') {
		// The tracking ref is gone (remote removed, ref pruned): the commit the last refresh recorded still holds the policy.
		found = readAt(repo, s.sha, ref, s.refreshedAt, anchor);
		from = `commit ${s.sha}`;
	}
	if (found.kind === 'policy') return { ok: true, value: found.policy };
	if (found.kind === 'invalid' || found.kind === 'error') return { ok: false, reason: found.reason };
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
		if (found.kind === 'invalid' || found.kind === 'error') return { ok: false, reason: found.reason };
	}
	return { ok: false, reason: `this repository has a damaged team-policy record (${why}) and the policy cannot be read; run 'team refresh' to repair it` };
}

/** No sighting: only local evidence of a policy on the default branch's tracking ref counts. */
function readUnseen(repo: string, now: string, teamDir: string | undefined, publish: typeof publishSightingIfAbsent, beforeRecord?: () => void): PolicyResult<TeamPolicy | 'none'> {
	const inRepo = probeGitRepo(repo);
	if (!inRepo.ok) return { ok: false, reason: inRepo.reason };
	if (!inRepo.value) return { ok: true, value: 'none' };
	const picked = probeRemote(repo);
	if (!picked.ok) return { ok: false, reason: picked.reason };
	const remote = picked.value;
	if (remote === undefined) return { ok: true, value: 'none' };
	const head = probeRemoteHead(repo, remote);
	if (!head.ok) return { ok: false, reason: head.reason };
	const branch = head.value;

	if (branch === undefined) {
		const scan = scanForPolicy(repo, remote);
		if (scan.kind === 'none') return { ok: true, value: 'none' };
		if (scan.kind === 'error') return { ok: false, reason: scan.reason };
		return {
			ok: false,
			reason: `the default branch of remote '${remote}' is not known, and a fetched ref (${scan.ref}) carries .insrc/policy.json; `
				+ `run 'team refresh --branch <default-branch-name>' to name the default branch`,
		};
	}

	const ref = trackingRef(remote, branch);
	const resolved = resolveRev(repo, ref);
	if (resolved.kind === 'missing') return { ok: true, value: 'none' };
	if (resolved.kind === 'error') return { ok: false, reason: resolved.reason };
	const sha = resolved.sha;
	const anchor = findAnchor(repo, sha);
	const found = readAt(repo, sha, ref, now, anchor);
	if (found.kind === 'missing') return { ok: true, value: 'none' };
	if (found.kind === 'error' && !found.exists) return { ok: false, reason: found.reason };

	// First observation of a policy file (valid, invalid or unreadable): remember this repo as a team repo, create-only.
	// Done under the same lock a refresh holds (taken without waiting): if a refresh is running it records the repo itself,
	// and the revision read above is checked again so a record is never made from a ref that has moved since.
	beforeRecord?.();
	const lock = acquireLock(repo, teamDir);
	if (lock.ok) {
		try {
			const again = resolveRev(repo, ref);
			if (again.kind === 'found' && again.sha === sha) {
				publish(repo, { remote, branch, branchSource: 'remote', sha, refreshedAt: now, anchor }, teamDir);
			}
		} catch (err) {
			log.warn({ err: err instanceof Error ? err.message : String(err) }, 'could not record first sighting; the result is unchanged');
		} finally {
			lock.release();
		}
	}
	return found.kind === 'policy' ? { ok: true, value: found.policy } : { ok: false, reason: found.reason };
}

/** The HLD's PolicyReader: `(repo) => PolicyResult<TeamPolicy | 'none'>`. */
export const policyReader = (repo: string): PolicyResult<TeamPolicy | 'none'> => readPolicy(repo);
