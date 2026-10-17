/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sighting store (Story s2).
 *
 * One small file per repository under `~/.insrc/team/seen/` records that the
 * repo has been seen carrying a policy: the remote and default branch it was
 * read from, the last fetched sha and the grandfathering anchor. A damaged
 * file is evidence the repo carries a policy, never absence.
 *
 * `writeAtomic` in ../storage.ts uses a fixed `.tmp` name and no lock, so it is
 * unsafe for two writers of one target; this store writes through a unique
 * temp name instead, publishes create-only by hard link, and serialises
 * refreshes with an exclusive lock file.
 */

import { createHash, randomBytes } from 'node:crypto';
import { closeSync, linkSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { PATHS } from '../../shared/paths.js';
import type { PolicyAnchor } from './types.js';

export type BranchSource = 'remote' | 'user';

export interface Sighting {
	readonly remote:       string;
	readonly branch:       string;
	readonly branchSource: BranchSource;
	readonly sha:          string;
	readonly refreshedAt:  string;
	readonly anchor:       PolicyAnchor;
}

export type SightingRead =
	| { readonly kind: 'absent' }
	| { readonly kind: 'damaged'; readonly reason: string }
	| { readonly kind: 'valid'; readonly sighting: Sighting };

/** A lock older than this is stale and may be taken over. */
export const LOCK_STALE_MS = 30_000;

/** Remote and branch names go into git argv: keep them to a safe, boring alphabet. */
export function isSafeRefName(name: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(name) && !name.includes('..') && !name.endsWith('/') && !name.endsWith('.lock');
}

/** 16 hex characters of the sha256 of the repository's real path. */
export function sightingKey(repo: string): string {
	let real: string;
	try {
		real = realpathSync(repo);
	} catch {
		real = resolve(repo);
	}
	return createHash('sha256').update(real).digest('hex').slice(0, 16);
}

function seenDir(teamDir: string): string {
	return join(teamDir, 'seen');
}

export function sightingPath(repo: string, teamDir: string = PATHS.team): string {
	return join(seenDir(teamDir), `${sightingKey(repo)}.json`);
}

function lockPath(repo: string, teamDir: string): string {
	return join(seenDir(teamDir), `${sightingKey(repo)}.lock`);
}

function validateSighting(raw: unknown): Sighting | string {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'sighting is not an object';
	const o = raw as Record<string, unknown>;
	const { remote, branch, branchSource, sha, refreshedAt, anchor } = o;
	if (typeof remote !== 'string' || !isSafeRefName(remote)) return "sighting 'remote' is missing or unsafe";
	if (typeof branch !== 'string' || !isSafeRefName(branch)) return "sighting 'branch' is missing or unsafe";
	if (branchSource !== 'remote' && branchSource !== 'user') return "sighting 'branchSource' must be 'remote' or 'user'";
	if (typeof sha !== 'string' || !/^[0-9a-f]{40,64}$/.test(sha)) return "sighting 'sha' must be a git object id";
	if (typeof refreshedAt !== 'string' || refreshedAt.length === 0) return "sighting 'refreshedAt' is missing";
	if (typeof anchor !== 'object' || anchor === null) return "sighting 'anchor' is missing";
	const a = anchor as Record<string, unknown>;
	if (typeof a['known'] !== 'boolean' || typeof a['firstCommit'] !== 'string' || typeof a['firstCommitTime'] !== 'string') {
		return "sighting 'anchor' must have known, firstCommit and firstCommitTime";
	}
	if (a['known'] === false && (a['firstCommit'] !== '' || a['firstCommitTime'] !== '')) return 'an unknown anchor must have empty commit and time';
	if (a['known'] === true && (a['firstCommit'] === '' || a['firstCommitTime'] === '')) return 'a known anchor must have a commit and time';
	return { remote, branch, branchSource, sha, refreshedAt, anchor: { known: a['known'], firstCommit: a['firstCommit'], firstCommitTime: a['firstCommitTime'] } };
}

export function readSighting(repo: string, teamDir: string = PATHS.team): SightingRead {
	const path = sightingPath(repo, teamDir);
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'absent' };
		return { kind: 'damaged', reason: `sighting could not be read: ${err instanceof Error ? err.message : String(err)}` };
	}
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { kind: 'damaged', reason: 'sighting is not valid JSON' };
	}
	const checked = validateSighting(raw);
	return typeof checked === 'string' ? { kind: 'damaged', reason: checked } : { kind: 'valid', sighting: checked };
}

function writeUniqueTemp(repo: string, sighting: Sighting, teamDir: string): string {
	mkdirSync(seenDir(teamDir), { recursive: true });
	const tmp = join(seenDir(teamDir), `${sightingKey(repo)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
	writeFileSync(tmp, JSON.stringify(sighting, null, 2) + '\n', { flag: 'wx' });
	return tmp;
}

/** Overwrite the sighting (refresh, under the lock). Throws if it cannot be written. */
export function writeSighting(repo: string, sighting: Sighting, teamDir: string = PATHS.team): void {
	const tmp = writeUniqueTemp(repo, sighting, teamDir);
	try {
		renameSync(tmp, sightingPath(repo, teamDir));
	} catch (err) {
		try { unlinkSync(tmp); } catch { /* best effort */ }
		throw err;
	}
}

/**
 * Publish the sighting only if none exists (reader, first observation). A hard
 * link to an existing name fails, so an existing or damaged sighting is never
 * overwritten. Throws on any failure other than "already exists".
 */
export function publishSightingIfAbsent(repo: string, sighting: Sighting, teamDir: string = PATHS.team): 'created' | 'exists' {
	const tmp = writeUniqueTemp(repo, sighting, teamDir);
	try {
		linkSync(tmp, sightingPath(repo, teamDir));
		return 'created';
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'EEXIST') return 'exists';
		throw err;
	} finally {
		try { unlinkSync(tmp); } catch { /* best effort */ }
	}
}

export function removeSighting(repo: string, teamDir: string = PATHS.team): void {
	try {
		unlinkSync(sightingPath(repo, teamDir));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
	}
}

/** A known anchor is never replaced by an unknown one; an unknown one gives way to a known one. */
export function mergeAnchor(existing: PolicyAnchor | undefined, incoming: PolicyAnchor): PolicyAnchor {
	if (existing === undefined) return incoming;
	if (existing.known && !incoming.known) return existing;
	return incoming;
}

export type LockResult =
	| { readonly ok: true; readonly release: () => void }
	| { readonly ok: false; readonly reason: string };

/** Exclusive per-repository lock; a lock older than {@link LOCK_STALE_MS} is taken over. */
export function acquireLock(repo: string, teamDir: string = PATHS.team, now: () => number = Date.now): LockResult {
	mkdirSync(seenDir(teamDir), { recursive: true });
	const path = lockPath(repo, teamDir);
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const fd = openSync(path, 'wx');
			try { writeSync(fd, `${process.pid} ${now()}\n`); } finally { closeSync(fd); }
			return { ok: true, release: () => { try { unlinkSync(path); } catch { /* already gone */ } } };
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
				return { ok: false, reason: `lock could not be taken: ${err instanceof Error ? err.message : String(err)}` };
			}
		}
		let ageMs: number;
		try {
			ageMs = now() - statSync(path).mtimeMs;
		} catch {
			continue; // released between the open and the stat: retry
		}
		if (ageMs <= LOCK_STALE_MS) return { ok: false, reason: 'a refresh is already running for this repository' };
		try { unlinkSync(path); } catch { /* another process took it over first */ }
	}
	return { ok: false, reason: 'a refresh is already running for this repository' };
}
