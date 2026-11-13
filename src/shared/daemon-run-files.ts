/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { processIdentityState, readProcessIdentity, requireProcessIdentity } from './daemon-process.js';
import type { ProcessIdentity, ProcessIdentityReader } from './daemon-process.js';
import { PATHS } from './paths.js';

export interface RunFileIdentity {
	readonly dev: string;
	readonly ino: string;
	readonly ctimeNs: string;
	readonly mtimeNs: string;
	readonly size: string;
}

/** Do not follow links when establishing ownership of an endpoint or PID file. */
export function runFileIdentity(path: string): RunFileIdentity | undefined {
	try {
		const stat = lstatSync(path, { bigint: true });
		if (stat.isSymbolicLink()) throw new Error(`run-file ownership conflict: symbolic link at ${path}`);
		return { dev: String(stat.dev), ino: String(stat.ino), ctimeNs: String(stat.ctimeNs), mtimeNs: String(stat.mtimeNs), size: String(stat.size) };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw error;
	}
}

export function sameRunFile(a: RunFileIdentity, b: RunFileIdentity): boolean {
	return a.dev === b.dev && a.ino === b.ino && a.ctimeNs === b.ctimeNs && a.mtimeNs === b.mtimeNs && a.size === b.size;
}

export interface RunFileGuard {
	readonly path: string;
	readonly owner: ProcessIdentity;
	readonly nonce: string;
	assertOwned(): void;
	release(): void;
}

function parseOwnerRecord(evidence: string): { owner: ProcessIdentity; nonce: string } {
	const value: unknown = JSON.parse(evidence);
	if (typeof value !== 'object' || value === null) throw new Error('invalid guard owner record');
	const record = value as Record<string, unknown>, owner = record['owner'] as Partial<ProcessIdentity> | undefined;
	if (typeof record['nonce'] !== 'string' || record['nonce'] === '' || owner === undefined || owner === null
		|| !Number.isSafeInteger(owner.pid) || (owner.pid ?? 0) <= 0
		|| typeof owner.startedAt !== 'string' || owner.startedAt === '' || typeof owner.commandLine !== 'string' || owner.commandLine === '') throw new Error('invalid guard owner identity');
	return { owner: owner as ProcessIdentity, nonce: record['nonce'] };
}

function ownerRecord(path: string): { owner: ProcessIdentity; nonce: string } {
	return parseOwnerRecord(readFileSync(join(path, 'owner.json'), 'utf8'));
}

/** A conflicting guard whose owner is live or unverifiable is never automatically reclaimed; only a conclusively
 * dead recorded owner is, in quarantineDeadGuard below. */
export function runFileGuardConflict(path: string, read?: ProcessIdentityReader | undefined): string | undefined {
	if (runFileIdentity(path) === undefined) return undefined;
	let evidence: string;
	try {
		const record = ownerRecord(path);
		const state = processIdentityState(record.owner, read);
		evidence = `owner pid=${record.owner.pid}, start=${record.owner.startedAt}, nonce=${record.nonce}, state=${state}`;
	} catch (error) { evidence = `unverifiable owner (${error instanceof Error ? error.message : String(error)})`; }
	return `run-file ownership conflict at ${path}: ${evidence}. Restart is withheld. An operator must verify the original owner has ended and quarantine this exact guard before retrying; it was not reclaimed automatically.`;
}

/** The boot segment of a Linux start marker, or undefined when the marker carries none. */
function bootSegment(startedAt: string): string | undefined {
	const segments = startedAt.split(':');
	return segments.length === 3 && segments[0] === 'linux' ? segments[1] : undefined;
}

/**
 * Quarantine a stale guard whose recorded owner is conclusively dead and retry the mkdir once.
 *
 * Conclusively dead means the recorded PID has exited (state gone), or a reused PID whose recorded
 * start marker names a previous boot: the occupant identity cannot be the recorded owner whatever
 * the PID now carries. A same-boot PID reuse, a live owner, a darwin marker without a boot segment
 * and an unreadable record all withhold exactly as before.
 *
 * Returns true when the retry acquired the path. Returns false when the conflict was withheld, a
 * competing starter won the retry, or the rename moved a replacement guard the verdict never
 * examined (restored to the path first): the caller then fails closed with the recomputed
 * conflict rather than reclaiming twice. A symlink throws first, so a link is never renamed
 * whatever it targets.
 */
function quarantineDeadGuard(path: string, read: ProcessIdentityReader): boolean {
	if (runFileIdentity(path) === undefined) return false;
	let evidence: string | undefined;
	let record: { owner: ProcessIdentity; nonce: string } | undefined;
	let conclusivelyDead = false;
	try {
		evidence = readFileSync(join(path, 'owner.json'), 'utf8');
		record = parseOwnerRecord(evidence);
		const state = processIdentityState(record.owner, read);
		if (state === 'gone') conclusivelyDead = true;
		else if (state === 'replaced') {
			// A reused PID: conclusively dead only when the recorded start marker names a previous boot,
			// so the occupant identity cannot be the recorded owner whatever the PID now carries.
			const occupant = read(record.owner.pid);
			const recordedBoot = occupant === undefined ? undefined : bootSegment(record.owner.startedAt);
			const occupantBoot = occupant === undefined ? undefined : bootSegment(occupant.startedAt);
			conclusivelyDead = recordedBoot !== undefined && occupantBoot !== undefined && recordedBoot !== occupantBoot;
		}
	} catch { /* an unreadable record or unreadable identity withholds, exactly as before */ }
	if (!conclusivelyDead || record === undefined) return false;
	const { owner, nonce } = record;
	// Quarantine the exact guard the way an operator would, keeping its record as evidence. The recorded
	// nonce disambiguates the second-precision timestamp; a collision takes the next suffix.
	const base = `${path}.quarantine-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}-${nonce}`;
	let target = base, suffix = 0, quarantined = false;
	for (;;) {
		while (existsSync(target)) target = `${base}.${++suffix}`;
		try { renameSync(path, target); quarantined = true; break; }
		catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			// The suffix candidate was taken between the check and the rename; take the next one.
			if (code === 'ENOTEMPTY' || code === 'EEXIST') continue;
			// A competing starter quarantined it first; the path may already be free.
			if (code === 'ENOENT') break;
			throw error;
		}
	}
	if (quarantined) {
		// The rename is atomic, but the evidence is not: a competing starter may have quarantined the
		// dead guard and re-acquired the path between this verdict and this rename, so what moved may be
		// a replacement guard. Verify the moved directory still carries the exact record verdicted dead;
		// a fresh record carries a fresh nonce, so byte identity proves the directory is the one examined.
		let movedEvidence: string | undefined;
		try { movedEvidence = readFileSync(join(target, 'owner.json'), 'utf8'); } catch { /* an in-flight publication has no record yet */ }
		if (movedEvidence !== evidence) {
			// A replacement was moved aside: restore it so its live owner keeps the guard, then fail closed.
			try { renameSync(target, path); }
			catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code !== 'ENOTEMPTY' && code !== 'EEXIST') throw error;
				// The path was re-acquired while the replacement was held aside. The record is preserved
				// where it was moved (its owner fails closed at its next ownership assertion) and the
				// path's new owner stays the only live owner; say so and fail closed either way.
				try { appendFileSync(PATHS.daemonLog, `insrc run-file guard recovery: a replacement guard at ${path} was moved to ${target} during a stale reclaim and could not be restored; its owner record is preserved there\n`); } catch { /* best effort */ }
			}
			return false;
		}
		// One best-effort recovery line; a log that cannot be written never blocks the restart.
		const line = `insrc run-file guard recovery: quarantined stale guard at ${path} to ${target} (owner pid=${owner.pid}, start=${owner.startedAt}, nonce=${nonce})\n`;
		try { appendFileSync(PATHS.daemonLog, line); } catch { /* best effort */ }
	}
	try { mkdirSync(path, { mode: 0o700 }); return true; }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
		throw error;
	}
}

/** Atomic directory creation serializes cooperating startup and cleanup across asynchronous close. */
export function acquireRunFileGuard(path: string, owner: ProcessIdentity = requireProcessIdentity(process.pid), read: ProcessIdentityReader = readProcessIdentity): RunFileGuard {
	try { mkdirSync(path, { mode: 0o700 }); }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
		// A conclusively dead recorded owner is quarantined with one retry; every other conflict,
		// including one the retry loses to a competing starter, fails closed with the conflict evidence.
		if (!quarantineDeadGuard(path, read)) {
			throw new Error(runFileGuardConflict(path, read) ?? `run-file guard changed during acquisition at ${path}`);
		}
	}
	const directory = runFileIdentity(path)!;
	const nonce = randomUUID();
	const recordPath = join(path, 'owner.json');
	// A crash or failed record write deliberately leaves a fail-closed orphan, never an unlocked partial
	// publication; the next startup reclaims such an orphan only through the dead-owner quarantine above.
	writeFileSync(recordPath, JSON.stringify({ owner, nonce }), { flag: 'wx', mode: 0o600 });
	const recordIdentity = runFileIdentity(recordPath)!;
	let released = false;
	const assertOwned = (): void => {
		const current = runFileIdentity(path), currentRecord = runFileIdentity(recordPath);
		if (released || current === undefined || current.dev !== directory.dev || current.ino !== directory.ino
			|| currentRecord === undefined || !sameRunFile(currentRecord, recordIdentity)
			|| ownerRecord(path).nonce !== nonce) throw new Error(`run-file guard ownership changed at ${path}`);
	};
	return {
		path, owner, nonce, assertOwned,
		release() {
			assertOwned();
			unlinkSync(recordPath);
			rmdirSync(path); // Never recursively remove unexpected or replacement files.
			released = true;
		},
	};
}

/** Local view of a supervisor-owned guard. The child never removes the guard or owner record. */
export function borrowRunFileGuard(path: string, supervisorPid: number, assertGrant: () => void): RunFileGuard {
	const directory = runFileIdentity(path);
	const recordPath = join(path, 'owner.json');
	const recordIdentity = runFileIdentity(recordPath);
	const record = ownerRecord(path);
	if (directory === undefined || recordIdentity === undefined || record.owner.pid !== supervisorPid) {
		throw new Error('run-file guard does not belong to the supervisor');
	}
	const assertOwned = (): void => {
		assertGrant();
		const current = runFileIdentity(path), currentRecord = runFileIdentity(recordPath);
		if (process.ppid !== supervisorPid || current?.dev !== directory.dev || current.ino !== directory.ino
			|| currentRecord === undefined || !sameRunFile(currentRecord, recordIdentity)
			|| ownerRecord(path).nonce !== record.nonce) throw new Error('borrowed run-file guard changed');
	};
	assertOwned();
	return { path, owner: record.owner, nonce: record.nonce, assertOwned,
		release() { throw new Error('only the supervisor can release the run-file guard'); } };
}

/**
 * Caller must hold the SAME guard used by every cooperating managed publisher
 * of this path through verification and unlink. Observed mismatches fail closed.
 * This is not atomic conditional unlink against writers outside that protocol.
 */
export function removeOwnedRunFile(path: string, expected: RunFileIdentity | undefined, guard: RunFileGuard): void {
	guard.assertOwned();
	const current = runFileIdentity(path);
	if (current === undefined) return;
	if (expected === undefined || !sameRunFile(current, expected)) throw new Error(`run-file ownership changed at ${path}; replacement preserved`);
	unlinkSync(path);
}
