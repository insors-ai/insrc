/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * PolicyReader (Story s2, HLD contract sc2).
 *
 * Non-interactive and network-free: it reads the policy from the
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
import { catFileExists, catFileText, forEachRef, GitCallFailed, LOCAL_GIT_TIMEOUT_MS, lsTreeNames, remoteNames, revParse, revParseValues, symbolicRef } from '../git-calls.js';
import { POLICY_PATH } from './types.js';
import { parsePolicyFile, buildTeamPolicy } from './policy-parser.js';
import { acquireLock, isSafeRefName, mergeAnchor, publishSightingIfAbsent, readSighting } from './sighting-store.js';
import type { Sighting } from './sighting-store.js';
import { isToolDenied } from '../tracker/tool-denied.js';
import type { PolicyAnchor, PolicyReadOptions, PolicyResult, TeamPolicy } from './types.js';

const log = getLogger('team-policy-reader');

export interface ReaderOptions {
	/** Where sightings live; defaults to ~/.insrc/team. Tests pass a scratch directory. */
	readonly teamDir?: string | undefined;
	readonly now?: (() => Date) | undefined;
	/** Seam for the create-only first-observation write; tests inject a failing one. */
	readonly publish?: ((...args: Parameters<typeof publishSightingIfAbsent>) => 'created' | 'exists' | Promise<'created' | 'exists'>) | undefined;
	/** Test seam: runs after the policy is read and before the first sighting is recorded. */
	readonly beforeRecord?: (() => void) | undefined;
	/** Stops the git reads of this call (the executor kills the running one). */
	readonly signal?: AbortSignal | undefined;
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
 *
 * Every git read below goes through the tool registry (Story s9). A call the user or a missing client denied is thrown as
 * ToolDenied and ends the read; any other failure keeps the result it had when git was run directly.
 */
export async function probeGitRepo(repo: string, timeoutMs?: number, signal?: AbortSignal): Promise<Probe<boolean>> {
	try {
		await revParseValues(repo, { gitDir: true }, { timeoutMs: timeoutMs ?? LOCAL_GIT_TIMEOUT_MS, signal });
		return { ok: true, value: true };
	} catch (err) {
		if (!(err instanceof GitCallFailed)) throw err;
		return hasGitEntry(repo) ? { ok: false, reason: `the repository could not be inspected: ${err.message}` } : { ok: true, value: false };
	}
}

export async function isGitRepo(repo: string, timeoutMs?: number, signal?: AbortSignal): Promise<boolean> {
	const probe = await probeGitRepo(repo, timeoutMs, signal);
	return probe.ok && probe.value;
}

/** The policy remote: origin when present, else the sole remote, else none (never guessed). */
export async function probeRemote(repo: string, timeoutMs?: number, signal?: AbortSignal): Promise<Probe<string | undefined>> {
	let names: string[];
	try {
		names = await remoteNames(repo, { timeoutMs: timeoutMs ?? LOCAL_GIT_TIMEOUT_MS, signal });
	} catch (err) {
		if (!(err instanceof GitCallFailed)) throw err;
		return { ok: false, reason: `the remotes could not be listed: ${err.message}` };
	}
	const remotes = names.map(r => r.trim()).filter(r => r.length > 0 && isSafeRefName(r));
	if (remotes.includes('origin')) return { ok: true, value: 'origin' };
	return { ok: true, value: remotes.length === 1 ? remotes[0] : undefined };
}

export async function pickRemote(repo: string, timeoutMs?: number, signal?: AbortSignal): Promise<string | undefined> {
	const probe = await probeRemote(repo, timeoutMs, signal);
	return probe.ok ? probe.value : undefined;
}

/** The default branch git itself recorded for the remote (refs/remotes/<remote>/HEAD); an unset symbolic ref means none is set. */
async function probeRemoteHead(repo: string, remote: string, signal?: AbortSignal): Promise<Probe<string | undefined>> {
	let ref: string | undefined;
	try {
		ref = await symbolicRef(repo, `refs/remotes/${remote}/HEAD`, { timeoutMs: LOCAL_GIT_TIMEOUT_MS, signal });
	} catch (err) {
		if (!(err instanceof GitCallFailed)) throw err;
		return { ok: false, reason: `refs/remotes/${remote}/HEAD could not be read: ${err.message}` };
	}
	const prefix = `refs/remotes/${remote}/`;
	if (ref === undefined || !ref.trim().startsWith(prefix)) return { ok: true, value: undefined };
	const branch = ref.trim().slice(prefix.length);
	return { ok: true, value: isSafeRefName(branch) ? branch : undefined };
}

/** Kept for callers that only want the answer: a failure reads as "not set". */
export async function remoteHeadBranch(repo: string, remote: string, signal?: AbortSignal): Promise<string | undefined> {
	const probe = await probeRemoteHead(repo, remote, signal);
	return probe.ok ? probe.value : undefined;
}

type Rev = { readonly kind: 'found'; readonly sha: string } | { readonly kind: 'missing' } | { readonly kind: 'error'; readonly reason: string };

/**
 * Resolve a revision to a commit. A revision that is not a commit is 'missing' (git_cat_file answers that as a value); a
 * failure of git itself (a timeout, a damaged repository) is not the same as absence.
 */
async function resolveRev(repo: string, rev: string, signal?: AbortSignal): Promise<Rev> {
	try {
		if (!(await catFileExists(repo, `${rev}^{commit}`, { timeoutMs: LOCAL_GIT_TIMEOUT_MS, signal }))) return { kind: 'missing' };
		return { kind: 'found', sha: await revParse(repo, `${rev}^{commit}`, { verify: true }, { timeoutMs: LOCAL_GIT_TIMEOUT_MS, signal }) };
	} catch (err) {
		if (!(err instanceof GitCallFailed)) throw err;
		return { kind: 'error', reason: `${rev} could not be resolved: ${err.message}` };
	}
}

async function resolveSha(repo: string, rev: string, signal?: AbortSignal): Promise<string | undefined> {
	const r = await resolveRev(repo, rev, signal);
	return r.kind === 'found' ? r.sha : undefined;
}

/**
 * Read and parse the policy file as it stands at `rev` (a ref or a commit).
 * 'missing' means the revision does not exist or the file is confirmed absent from it; any other git failure
 * (a timeout, a damaged object, output too large) is an 'error', never taken for absence.
 */
async function readAt(repo: string, rev: string, label: string, fetchedAt: string, anchor: PolicyAnchor, signal?: AbortSignal): Promise<Found> {
	// Pin the revision to one commit so the lookup and the read cannot see a ref that moves in between.
	const resolved = await resolveRev(repo, rev, signal);
	if (resolved.kind === 'missing') return { kind: 'missing' };
	if (resolved.kind === 'error') return { kind: 'error', reason: resolved.reason, exists: false };
	const sha = resolved.sha;
	let names: string[];
	try {
		names = await lsTreeNames(repo, sha, [POLICY_PATH], { timeoutMs: LOCAL_GIT_TIMEOUT_MS, signal });
	} catch (err) {
		if (!(err instanceof GitCallFailed)) throw err;
		return { kind: 'error', reason: `the policy file on ${label} could not be looked up: ${err.message}`, exists: false };
	}
	if (names.length === 0) return { kind: 'missing' };
	let text: string | undefined;
	try {
		text = await catFileText(repo, sha, POLICY_PATH, { timeoutMs: LOCAL_GIT_TIMEOUT_MS, signal });
	} catch (err) {
		if (!(err instanceof GitCallFailed)) throw err;
		return { kind: 'error', reason: `the policy file on ${label} could not be read: ${err.message}`, exists: true };
	}
	if (text === undefined) return { kind: 'error', reason: `the policy file on ${label} could not be read: it is not in the tree`, exists: true };
	const parsed = parsePolicyFile(text);
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
async function scanForPolicy(repo: string, remote: string, signal?: AbortSignal): Promise<Scan> {
	let listed: Array<Record<string, string>>;
	try {
		listed = await forEachRef(repo, { pattern: [`refs/remotes/${remote}/`], fields: ['refname'] }, { timeoutMs: LOCAL_GIT_TIMEOUT_MS, signal });
	} catch (err) {
		if (!(err instanceof GitCallFailed)) throw err;
		return { kind: 'error', reason: `the fetched refs of remote '${remote}' could not be listed: ${err.message}` };
	}
	const head = `refs/remotes/${remote}/HEAD`;
	for (const ref of listed.map(r => (r['refname'] ?? '').trim()).filter(r => r.length > 0 && r !== head)) {
		try {
			if ((await lsTreeNames(repo, ref, [POLICY_PATH], { timeoutMs: LOCAL_GIT_TIMEOUT_MS, signal })).length > 0) return { kind: 'found', ref };
		} catch (err) {
			if (!(err instanceof GitCallFailed)) throw err;
			return { kind: 'error', reason: `${ref} could not be searched for the policy file: ${err.message}` };
		}
	}
	return { kind: 'none' };
}

export async function readPolicy(repo: string, opts: ReaderOptions = {}): Promise<PolicyResult<TeamPolicy | 'none'>> {
	const now = (opts.now ?? ((): Date => new Date()))().toISOString();
	const seen = await readSighting(repo, opts.teamDir);

	if (seen.kind === 'valid') return readKnownRepo(repo, seen.sighting, opts.signal);
	if (seen.kind === 'damaged') return readDamaged(repo, seen.reason, now, opts.signal);
	return readUnseen(repo, now, opts.teamDir, opts.publish ?? publishSightingIfAbsent, opts.beforeRecord, opts.signal);
}

/** A sighting exists: the repo is known to carry a policy, so it is never 'none'. */
async function readKnownRepo(repo: string, s: Sighting, signal?: AbortSignal): Promise<PolicyResult<TeamPolicy | 'none'>> {
	const ref = trackingRef(s.remote, s.branch);
	const pinned = (await resolveSha(repo, ref, signal)) ?? ref; // one commit for the anchor and the read
	const anchor = s.anchor.known ? s.anchor : mergeAnchor(s.anchor, await findAnchor(repo, pinned, undefined, signal));
	let found = await readAt(repo, pinned, ref, s.refreshedAt, anchor, signal);
	let from = ref;
	if (found.kind === 'missing' && (await resolveRev(repo, ref, signal)).kind === 'missing') {
		// The tracking ref is gone (remote removed, ref pruned): the commit the last refresh recorded still holds the policy.
		found = await readAt(repo, s.sha, ref, s.refreshedAt, anchor, signal);
		from = `commit ${s.sha}`;
	}
	if (found.kind === 'policy') return { ok: true, value: found.policy };
	if (found.kind === 'invalid' || found.kind === 'error') return { ok: false, reason: found.reason };
	return { ok: false, reason: `this repository is known to carry a team policy but it cannot be read from ${from}; run 'team refresh' to fetch it` };
}

/** The sighting is damaged: that is evidence of a policy, never absence. Try the remote HEAD branch, else refuse. */
async function readDamaged(repo: string, why: string, now: string, signal?: AbortSignal): Promise<PolicyResult<TeamPolicy | 'none'>> {
	const remote = await pickRemote(repo, undefined, signal);
	const branch = remote === undefined ? undefined : await remoteHeadBranch(repo, remote, signal);
	if (remote !== undefined && branch !== undefined) {
		const ref = trackingRef(remote, branch);
		const found = await readAt(repo, ref, ref, now, await findAnchor(repo, ref, undefined, signal), signal);
		if (found.kind === 'policy') return { ok: true, value: found.policy };
		if (found.kind === 'invalid' || found.kind === 'error') return { ok: false, reason: found.reason };
	}
	return { ok: false, reason: `this repository has a damaged team-policy record (${why}) and the policy cannot be read; run 'team refresh' to repair it` };
}

/** No sighting: only local evidence of a policy on the default branch's tracking ref counts. */
async function readUnseen(repo: string, now: string, teamDir: string | undefined, publish: NonNullable<ReaderOptions['publish']>, beforeRecord?: () => void, signal?: AbortSignal): Promise<PolicyResult<TeamPolicy | 'none'>> {
	const inRepo = await probeGitRepo(repo, undefined, signal);
	if (!inRepo.ok) return { ok: false, reason: inRepo.reason };
	if (!inRepo.value) return { ok: true, value: 'none' };
	const picked = await probeRemote(repo, undefined, signal);
	if (!picked.ok) return { ok: false, reason: picked.reason };
	const remote = picked.value;
	if (remote === undefined) return { ok: true, value: 'none' };
	const head = await probeRemoteHead(repo, remote, signal);
	if (!head.ok) return { ok: false, reason: head.reason };
	const branch = head.value;

	if (branch === undefined) {
		const scan = await scanForPolicy(repo, remote, signal);
		if (scan.kind === 'none') return { ok: true, value: 'none' };
		if (scan.kind === 'error') return { ok: false, reason: scan.reason };
		return {
			ok: false,
			reason: `the default branch of remote '${remote}' is not known, and a fetched ref (${scan.ref}) carries .insrc/policy.json; `
				+ `run 'team refresh --branch <default-branch-name>' to name the default branch`,
		};
	}

	const ref = trackingRef(remote, branch);
	const resolved = await resolveRev(repo, ref, signal);
	if (resolved.kind === 'missing') return { ok: true, value: 'none' };
	if (resolved.kind === 'error') return { ok: false, reason: resolved.reason };
	const sha = resolved.sha;
	const anchor = await findAnchor(repo, sha, undefined, signal);
	const found = await readAt(repo, sha, ref, now, anchor, signal);
	if (found.kind === 'missing') return { ok: true, value: 'none' };
	if (found.kind === 'error' && !found.exists) return { ok: false, reason: found.reason };

	// First observation of a policy file (valid, invalid or unreadable): remember this repo as a team repo, create-only.
	// Done under the same lock a refresh holds (taken without waiting): if a refresh is running it records the repo itself,
	// and the revision read above is checked again so a record is never made from a ref that has moved since.
	beforeRecord?.();
	const lock = await acquireLock(repo, teamDir);
	if (lock.ok) {
		try {
			const again = await resolveRev(repo, ref, signal);
			if (again.kind === 'found' && again.sha === sha) {
				await publish(repo, { remote, branch, branchSource: 'remote', sha, refreshedAt: now, anchor }, teamDir);
			}
		} catch (err) {
			if (isToolDenied(err)) throw err;
			log.warn({ err: err instanceof Error ? err.message : String(err) }, 'could not record first sighting; the result is unchanged');
		} finally {
			lock.release();
		}
	}
	return found.kind === 'policy' ? { ok: true, value: found.policy } : { ok: false, reason: found.reason };
}

/** The HLD's PolicyReader: `(repo, opts?) => Promise<PolicyResult<TeamPolicy | 'none'>>`. */
export const policyReader = (repo: string, opts: PolicyReadOptions = {}): Promise<PolicyResult<TeamPolicy | 'none'>> => readPolicy(repo, opts.signal !== undefined ? { signal: opts.signal } : {});
