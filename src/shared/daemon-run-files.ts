/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { appendFileSync, closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
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

export interface RunFileGuardPin {
	readonly directory: Pick<RunFileIdentity, 'dev' | 'ino'>;
	readonly record: RunFileIdentity;
	readonly owner: ProcessIdentity;
	readonly nonce: string;
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

/** Pin the existing guard without removing or replacing its directory. */
export function readRunFileGuardPin(path: string): RunFileGuardPin | undefined {
	const directory = runFileIdentity(path);
	if (directory === undefined) return undefined;
	const recordPath = join(path, 'owner.json');
	const record = runFileIdentity(recordPath);
	const uid = process.getuid?.();
	const dir = lstatSync(path);
	const file = lstatSync(recordPath);
	if (record === undefined || !dir.isDirectory() || !file.isFile() || dir.uid !== uid || file.uid !== uid
		|| (dir.mode & 0o077) !== 0 || (file.mode & 0o077) !== 0 || file.nlink !== 1 || file.size > 8192) {
		throw new Error('run-file guard is not an owned private publication');
	}
	const value = ownerRecord(path);
	const after = runFileIdentity(recordPath);
	const afterDirectory = runFileIdentity(path);
	if (after === undefined || !sameRunFile(after, record) || afterDirectory?.dev !== directory.dev
		|| afterDirectory.ino !== directory.ino) throw new Error('run-file guard changed while being pinned');
	return { directory: { dev: directory.dev, ino: directory.ino }, record, ...value };
}

function sameOwner(a: ProcessIdentity, b: ProcessIdentity): boolean {
	return a.pid === b.pid && a.startedAt === b.startedAt && a.commandLine === b.commandLine;
}

/** Rotate the record atomically. The legacy guard pathname is continuously occupied. */
export function transferRunFileGuard(path: string, from: RunFileGuardPin, owner: ProcessIdentity, nonce: string): RunFileGuard {
	if (!/^[a-f0-9-]{36}$/.test(nonce)) throw new Error('invalid run-file guard transfer nonce');
	const pin = (): RunFileGuardPin => {
		const value = readRunFileGuardPin(path);
		if (value === undefined || value.directory.dev !== from.directory.dev || value.directory.ino !== from.directory.ino) {
			throw new Error('run-file guard directory was replaced');
		}
		return value;
	};
	const syncDirectory = () => {
		const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
		try { fsyncSync(fd); } finally { closeSync(fd); }
	};
	const pathToRecord = join(path, 'owner.json');
	const current = pin();
	if (current.nonce !== nonce || !sameOwner(current.owner, owner)) {
		if (current.nonce !== from.nonce || !sameOwner(current.owner, from.owner) || !sameRunFile(current.record, from.record)) {
			throw new Error('run-file guard transfer source does not match its pin');
		}
		const temporary = join(path, `transfer-${nonce}`);
		// A matching orphan can be resumed after the file was flushed but before the rename.
		const expected = JSON.stringify({ owner, nonce });
		const write = () => {
			const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
			try { writeFileSync(fd, expected); fsyncSync(fd); } finally { closeSync(fd); }
		};
		try { write(); } catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
			const staged = lstatSync(temporary);
			if (!staged.isFile() || staged.uid !== process.getuid?.() || staged.nlink !== 1 || (staged.mode & 0o077) !== 0
				|| staged.size > Buffer.byteLength(expected)) throw error;
			const found = readFileSync(temporary, 'utf8');
			if (found !== expected) {
				if (!expected.startsWith(found) || !sameRunFile(pin().record, current.record)) throw error;
				unlinkSync(temporary);
				write();
			}
		}
		if (!sameRunFile(pin().record, current.record)) throw new Error('run-file guard changed before transfer');
		renameSync(temporary, pathToRecord);
	}
	syncDirectory();
	const adopted = pin();
	const assertOwned = () => {
		const latest = pin();
		if (latest.nonce !== nonce || !sameOwner(latest.owner, owner) || !sameRunFile(latest.record, adopted.record)) {
			throw new Error('transferred run-file guard ownership changed');
		}
	};
	assertOwned();
	return { path, owner, nonce, assertOwned,
		release() { assertOwned(); unlinkSync(pathToRecord); rmdirSync(path); } };
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

/** The recorded owner is conclusively dead when its PID has exited (state gone), or when a reused PID's
 * recorded start marker names a previous boot: the occupant identity cannot be the recorded owner
 * whatever the PID now carries. Every other state withholds. */
function conclusivelyDeadOwner(record: { owner: ProcessIdentity; nonce: string }, read: ProcessIdentityReader): boolean {
	const state = processIdentityState(record.owner, read);
	if (state === 'gone') return true;
	if (state !== 'replaced') return false;
	const occupant = read(record.owner.pid);
	const recordedBoot = occupant === undefined ? undefined : bootSegment(record.owner.startedAt);
	const occupantBoot = occupant === undefined ? undefined : bootSegment(occupant.startedAt);
	return recordedBoot !== undefined && occupantBoot !== undefined && recordedBoot !== occupantBoot;
}

/** The guard's serialized reclaim claim: an exclusive file inside the guard directory. Exactly one
 * reclaimer at a time may hold it, pinning the examined evidence between the confirming re-reads and
 * the quarantine rename. A standing claim is honored unless its recorded holder is conclusively dead
 * (the same verdict as a stale guard owner), in which case it is recovered once by moving the
 * examined claim aside and removing it only when the moved bytes are still the examined dead
 * record — a live replacement claim another reclaimer published in the meantime is put back, never
 * removed, so a takeover cannot defeat a live holder's serialization. Any other contention or failure
 * leaves the guard untouched and withholds. The claim retires with the quarantine rename that
 * carries it out of the canonical path, or when its holder bails out. */
const RECLAIM_CLAIM = 'reclaim.claim';

/** This reclaimer's claim: the record it published and the exact bytes it wrote. */
interface ReclaimClaim {
	readonly nonce: string;
	readonly evidence: string;
}

/** Move the standing claim aside, then remove it only when the moved bytes are still the examined
 * record. The rename is atomic, so exactly one reclaimer can move the standing claim; a moved claim
 * that is not the examined record — a competing reclaimer's live replacement — is linked back so its
 * holder keeps the serialization, and deleted only when a newer claim already occupies the path, in
 * which case the displaced one is orphaned evidence its holder withholds on anyway. Returns true when
 * the examined claim was removed from the guard. */
function removeClaimIfUnchanged(path: string, examined: string): boolean {
	const claimPath = join(path, RECLAIM_CLAIM);
	const aside = join(path, `${RECLAIM_CLAIM}.aside-${randomUUID()}`);
	try { renameSync(claimPath, aside); } catch { return false; } // already moved, or carried out by a quarantine
	let moved: string | undefined;
	try { moved = readFileSync(aside, 'utf8'); } catch { /* leave a moved unreadable claim aside */ }
	if (moved !== examined) {
		// Never remove a claim this examination did not observe: put it back for its holder, and when a
		// newer claim already occupies the path the displaced record is orphaned evidence, not a lock.
		try { linkSync(aside, claimPath); } catch { /* best effort */ }
		try { unlinkSync(aside); } catch { /* best effort */ }
		return false;
	}
	try { unlinkSync(aside); } catch { return false; }
	return true;
}

function claimGuardForReclaim(path: string, owner: ProcessIdentity, read: ProcessIdentityReader): ReclaimClaim | undefined {
	const claimPath = join(path, RECLAIM_CLAIM);
	const nonce = randomUUID(), evidence = JSON.stringify({ owner, nonce });
	const claim = (): ReclaimClaim | undefined => {
		try { writeFileSync(claimPath, evidence, { flag: 'wx', mode: 0o600 }); return { nonce, evidence }; }
		catch { return undefined; } // a claim that cannot be created leaves the guard untouched and withholds
	};
	const created = claim();
	if (created !== undefined) return created;
	// A standing claim withholds unless its recorded holder is conclusively dead. The takeover moves the
	// examined claim aside and removes it only when the moved bytes are still the examined dead record:
	// a live replacement claim another reclaimer published after this verdict read the dead one is put
	// back untouched, so exactly one reclaimer ever recovers the dead claim and the rest withhold.
	let observed: string;
	let holder: { owner: ProcessIdentity; nonce: string };
	try { observed = readFileSync(claimPath, 'utf8'); holder = parseOwnerRecord(observed); } catch { return undefined; }
	if (!conclusivelyDeadOwner(holder, read)) return undefined;
	if (!removeClaimIfUnchanged(path, observed)) return undefined; // a competing reclaimer recovered it first
	return claim(); // one retry: a claim that still cannot be created leaves the guard untouched and withholds
}

/** The bytes currently published at the claim path, or undefined when they are absent or unreadable. */
function claimEvidence(path: string): string | undefined {
	try { return readFileSync(join(path, RECLAIM_CLAIM), 'utf8'); } catch { return undefined; }
}

/** The owner record currently published inside the guard, or undefined when it is absent or unreadable. */
function guardEvidence(path: string): string | undefined {
	try { return readFileSync(join(path, 'owner.json'), 'utf8'); } catch { return undefined; }
}

/**
 * Quarantine a stale guard whose recorded owner is conclusively dead and retry the mkdir once.
 *
 * Conclusively dead means the recorded PID has exited (state gone), or a reused PID whose recorded
 * start marker names a previous boot: the occupant identity cannot be the recorded owner whatever
 * the PID now carries. A same-boot PID reuse, a live owner, a darwin marker without a boot segment
 * and an unreadable record all withhold exactly as before.
 *
 * The reclaimer never renames a directory it did not examine: the verdict's record is re-read before
 * anything is touched, an exclusive claim file inside the guard serializes reclaimers, and the claim
 * itself is re-read before the rename, so no competing starter can replace the examined guard between
 * the confirming re-reads and the rename — a stale verdict cannot vacate a live replacement acquired
 * from the same dead guard mid-verdict, and a stale takeover cannot remove a live reclaimer's claim.
 * Returns true when the retry acquired the path. Returns false when the conflict was withheld, the
 * evidence or the claim changed under the claim, claim contention withstood, or a competing starter
 * won the retry: the caller then fails closed with the recomputed conflict rather than reclaiming twice.
 * A symlink throws first, so a link is never renamed whatever it targets.
 */
function quarantineDeadGuard(path: string, owner: ProcessIdentity, read: ProcessIdentityReader): boolean {
	if (runFileIdentity(path) === undefined) return false;
	let evidence: string | undefined;
	let record: { owner: ProcessIdentity; nonce: string } | undefined;
	let conclusivelyDead = false;
	try {
		evidence = readFileSync(join(path, 'owner.json'), 'utf8');
		const parsed = parseOwnerRecord(evidence);
		conclusivelyDead = conclusivelyDeadOwner(parsed, read);
		record = parsed;
	} catch { /* an unreadable record or unreadable identity withholds, exactly as before */ }
	if (!conclusivelyDead || record === undefined || evidence === undefined) return false;
	// Confirm the verdict's record still occupies the path before touching anything: a competing starter
	// may have quarantined the dead guard and published a live replacement since the verdict was read.
	if (guardEvidence(path) !== evidence) return false;
	// Serialize reclaimers: the claim pins the examined evidence, so the confirming re-reads below cannot
	// be invalidated by another reclaimer replacing the guard before the rename moves it.
	const claim = claimGuardForReclaim(path, owner, read);
	if (claim === undefined) return false;
	if (guardEvidence(path) !== evidence) {
		// The path is no longer the guard this verdict examined: retire this reclaimer's own claim without
		// moving anything else and fail closed; the recomputed conflict names the replacement's live owner.
		removeClaimIfUnchanged(path, claim.evidence);
		return false;
	}
	if (claimEvidence(path) !== claim.evidence) {
		// The claim is no longer this reclaimer's: a competing reclaimer's takeover moved it aside, so
		// that one withholds and a newer claim owns the serialization. Fail closed without touching it.
		return false;
	}
	const { owner: recordedOwner, nonce } = record;
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
		// Claim artifacts — the claim itself and any aside a takeover or retirement moved within the
		// guard — are the reclaimers' evidence, not the owner's; the quarantined record directory keeps
		// exactly what its owner published.
		try { for (const entry of readdirSync(target)) if (entry.startsWith(RECLAIM_CLAIM)) unlinkSync(join(target, entry)); } catch { /* best effort */ }
		// One best-effort recovery line; a log that cannot be written never blocks the restart.
		const line = `insrc run-file guard recovery: quarantined stale guard at ${path} to ${target} (owner pid=${recordedOwner.pid}, start=${recordedOwner.startedAt}, nonce=${nonce})\n`;
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
		if (!quarantineDeadGuard(path, owner, read)) {
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
