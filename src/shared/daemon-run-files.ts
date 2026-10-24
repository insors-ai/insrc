/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { lstatSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
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

function ownerRecord(path: string): { owner: ProcessIdentity; nonce: string } {
	const value: unknown = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
	if (typeof value !== 'object' || value === null) throw new Error('invalid guard owner record');
	const record = value as Record<string, unknown>, owner = record['owner'] as Partial<ProcessIdentity> | undefined;
	if (typeof record['nonce'] !== 'string' || record['nonce'] === '' || owner === undefined || owner === null
		|| !Number.isSafeInteger(owner.pid) || (owner.pid ?? 0) <= 0
		|| typeof owner.startedAt !== 'string' || owner.startedAt === '' || typeof owner.commandLine !== 'string' || owner.commandLine === '') throw new Error('invalid guard owner identity');
	return { owner: owner as ProcessIdentity, nonce: record['nonce'] };
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

/** Caller holds the shared guard throughout verification and unlink. Missing owned files are harmless. */
export function removeOwnedRunFile(path: string, expected: RunFileIdentity | undefined, guard: RunFileGuard): void {
	guard.assertOwned();
	const current = runFileIdentity(path);
	if (current === undefined) return;
	if (expected === undefined || !sameRunFile(current, expected)) throw new Error(`run-file ownership changed at ${path}; replacement preserved`);
	unlinkSync(path);
}
