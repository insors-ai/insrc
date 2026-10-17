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
import { publishCreateOnly } from './create-only.js';
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

/** Longest a holder may keep the lock: the refresh's single deadline kills its git children and ends the refresh. */
export const REFRESH_DEADLINE_MS = 10_000;

/**
 * A lock older than this is stale and may be taken over. It is deliberately a multiple of
 * {@link REFRESH_DEADLINE_MS}: a live holder always finishes (and releases) within the deadline,
 * so a lock this old belongs to a dead or hung process and has no live releaser to race with.
 */
export const LOCK_STALE_MS = 30_000;

/**
 * Remote and branch names go into git argv. Accept what git accepts (any script, '+', '#', ...) but refuse what could be
 * read as an option or a revision expression or break a ref: a leading '-', whitespace and control characters,
 * ~ ^ : ? * [ \\, '..', '@{', '//', and a trailing '/', '.' or '.lock'.
 */
export function isSafeRefName(name: string): boolean {
	if (name.length === 0 || name.startsWith('-') || name.startsWith('/')) return false;
	if (/[\s\u0000-\u001f\u007f~^:?*[\\]/u.test(name)) return false;
	if (name.includes('..') || name.includes('@{') || name.includes('//') || name === '@') return false;
	return !(name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock'));
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
	try {
		writeFileSync(tmp, JSON.stringify(sighting, null, 2) + '\n', { flag: 'wx' });
	} catch (err) {
		try { unlinkSync(tmp); } catch { /* never created */ }
		throw err;
	}
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
	return publishCreateOnly(sightingPath(repo, teamDir), JSON.stringify(sighting, null, 2) + '\n');
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

const LOCK_BUSY = 'a refresh is already running for this repository';

function lockHolder(path: string, token: string): LockResult {
	return {
		ok: true,
		// Release only our own lock: after a stale takeover the old holder must not delete the new holder's file.
		release: () => {
			try {
				if (readFileSync(path, 'utf8') === token) unlinkSync(path);
			} catch { /* already gone */ }
		},
	};
}

/**
 * Exclusive per-repository lock; a lock older than {@link LOCK_STALE_MS} is taken over.
 *
 * A live lock is never moved or touched. Only a lock that looks stale is reclaimed,
 * and only by the one process holding a short-lived takeover guard, which re-checks
 * the lock's age and identity right before removing it. Because a live holder releases
 * within {@link REFRESH_DEADLINE_MS}, nobody can legitimately release a lock that is already
 * {@link LOCK_STALE_MS} old, so the reclaimer never races a live release. The create (`wx`) is the only
 * way to become the holder, so a reclaimer that loses the race simply reports busy.
 * The lock serialises refreshes; correctness does not depend on it, because every
 * write a refresh makes is itself atomic (unique-temp rename, create-only link, and
 * git's own atomic ref update), so an overlap in the rare reclaim window is harmless.
 */
export function acquireLock(repo: string, teamDir: string = PATHS.team, now: () => number = Date.now): LockResult {
	try {
		mkdirSync(seenDir(teamDir), { recursive: true });
	} catch (err) {
		return { ok: false, reason: `lock could not be taken: ${err instanceof Error ? err.message : String(err)}` };
	}
	const path = lockPath(repo, teamDir);
	const token = `${process.pid} ${randomBytes(8).toString('hex')}\n`;

	const create = (): LockResult | undefined => {
		try {
			const fd = openSync(path, 'wx');
			try { writeSync(fd, token); } finally { closeSync(fd); }
			return lockHolder(path, token);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
				return { ok: false, reason: `lock could not be taken: ${err instanceof Error ? err.message : String(err)}` };
			}
			return undefined;
		}
	};

	const first = create();
	if (first !== undefined) return first;

	let seen;
	try { seen = statSync(path); } catch { return create() ?? { ok: false, reason: LOCK_BUSY }; }
	if (now() - seen.mtimeMs <= LOCK_STALE_MS) return { ok: false, reason: LOCK_BUSY };

	// Looks stale: reclaim it under the takeover guard (one reclaimer at a time).
	const guardPath = `${path}.takeover`;
	let guardFd: number;
	try {
		guardFd = openSync(guardPath, 'wx');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
			// A crashed reclaimer would leave the guard behind: a guard older than the stale limit is removed.
			try { if (now() - statSync(guardPath).mtimeMs > LOCK_STALE_MS) unlinkSync(guardPath); } catch { /* best effort */ }
		}
		return { ok: false, reason: LOCK_BUSY };
	}
	try {
		let again;
		try { again = statSync(path); } catch { return create() ?? { ok: false, reason: LOCK_BUSY }; }
		// Remove only the very lock we judged stale: same file, still old.
		if (again.ino === seen.ino && again.dev === seen.dev && now() - again.mtimeMs > LOCK_STALE_MS) {
			try { unlinkSync(path); } catch { /* released meanwhile */ }
			return create() ?? { ok: false, reason: LOCK_BUSY };
		}
		return { ok: false, reason: LOCK_BUSY };
	} finally {
		closeSync(guardFd);
		try { unlinkSync(guardPath); } catch { /* best effort */ }
	}
}

/** True while a live refresh lock exists for this repository (a stale one does not count). */
export function refreshInProgress(repo: string, teamDir: string = PATHS.team, now: () => number = Date.now): boolean {
	try {
		return now() - statSync(lockPath(repo, teamDir)).mtimeMs <= LOCK_STALE_MS;
	} catch {
		return false;
	}
}
