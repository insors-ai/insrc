/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { processIdentityState, requireProcessIdentity } from './daemon-process.js';
import type { ProcessIdentity, ProcessIdentityReader } from './daemon-process.js';

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

function ownerRecord(path: string): { owner: ProcessIdentity; nonce: string } {
	const value: unknown = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
	if (typeof value !== 'object' || value === null) throw new Error('invalid guard owner record');
	const record = value as Record<string, unknown>, owner = record['owner'] as Partial<ProcessIdentity> | undefined;
	if (typeof record['nonce'] !== 'string' || record['nonce'] === '' || owner === undefined || owner === null
		|| !Number.isSafeInteger(owner.pid) || (owner.pid ?? 0) <= 0
		|| typeof owner.startedAt !== 'string' || owner.startedAt === '' || typeof owner.commandLine !== 'string' || owner.commandLine === '') throw new Error('invalid guard owner identity');
	return { owner: owner as ProcessIdentity, nonce: record['nonce'] };
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

/** A conflicting or orphaned guard is never automatically reclaimed. */
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

/** Atomic directory creation serializes cooperating startup and cleanup across asynchronous close. */
export function acquireRunFileGuard(path: string, owner: ProcessIdentity = requireProcessIdentity(process.pid)): RunFileGuard {
	try { mkdirSync(path, { mode: 0o700 }); }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(runFileGuardConflict(path) ?? `run-file guard changed during acquisition at ${path}`);
		throw error;
	}
	const directory = runFileIdentity(path)!;
	const nonce = randomUUID();
	const recordPath = join(path, 'owner.json');
	// A crash or failed record write deliberately leaves a fail-closed orphan, never an unlocked partial publication.
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
