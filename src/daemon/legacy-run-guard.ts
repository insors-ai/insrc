/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { randomUUID } from 'node:crypto';
import { constants, mkdtempSync, renameSync, rmdirSync, unlinkSync } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, rmdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { matchesDarwinPeer, publishDarwinDirectory, readDarwinIncarnation } from '../shared/darwin-lifecycle.js';
import type { DarwinIncarnation } from '../shared/darwin-lifecycle.js';
import { readRunFileGuardPin, runFileIdentity, sameRunFile, transferRunFileGuard } from '../shared/daemon-run-files.js';
import type { RunFileGuard, RunFileGuardPin } from '../shared/daemon-run-files.js';
import type { InstallationMutationGate, MutationReservation } from '../shared/installation-mutation-gate.js';
import { installationPaths } from '../shared/managed-daemon-installation.js';

type Update = Extract<MutationReservation, { kind: 'update' }>;
type Gate = Pick<InstallationMutationGate, 'admit' | 'recordIntent' | 'recordReceipt'>;
const HOLD = 'legacy-run-guard';
const TRANSFER = 'legacy-guard-transfer';
interface Owner { readonly incarnation: DarwinIncarnation; readonly nonce: string }
interface Transfer extends Owner { readonly from: RunFileGuardPin }

function entry(update: MutationReservation, name: string) { return update.entries.find(step => step.step === name); }

function processOwner(incarnation: DarwinIncarnation) {
	return { pid: incarnation.pid, startedAt: incarnation.startedAt, commandLine: incarnation.executable };
}

function matches(pin: RunFileGuardPin, owner: Owner): boolean {
	const expected = processOwner(owner.incarnation);
	return pin.nonce === owner.nonce && pin.owner.pid === expected.pid
		&& pin.owner.startedAt === expected.startedAt && pin.owner.commandLine === expected.commandLine;
}

function sameGuard(a: RunFileGuardPin, b: RunFileGuardPin): boolean {
	return a.directory.dev === b.directory.dev && a.directory.ino === b.directory.ino && sameRunFile(a.record, b.record);
}

async function syncDirectory(path: string): Promise<void> {
	const fd = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
	try { await fd.sync(); } finally { await fd.close(); }
}

async function stageGuard(path: string, holder: Owner): Promise<RunFileGuardPin> {
	await mkdir(path, { mode: 0o700 }).catch(error => {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
	});
	const directory = await lstat(path);
	const names = await readdir(path);
	if (!directory.isDirectory() || directory.uid !== process.getuid?.() || (directory.mode & 0o077) !== 0
		|| names.some(name => name !== 'owner.json')) throw new Error('legacy guard staging directory changed');
	const file = join(path, 'owner.json');
	const expected = JSON.stringify({ owner: processOwner(holder.incarnation), nonce: holder.nonce });
	let needsRecord = true;
	if (names.includes('owner.json')) {
		const record = await lstat(file);
		if (!record.isFile() || record.uid !== directory.uid || record.nlink !== 1 || (record.mode & 0o077) !== 0
			|| record.size > Buffer.byteLength(expected)) throw new Error('legacy guard staged owner record changed');
		const bytes = await readFile(file, 'utf8');
		if (!expected.startsWith(bytes)) throw new Error('legacy guard staged owner record changed');
		needsRecord = bytes !== expected;
		if (needsRecord) await unlink(file);
	}
	const fd = await open(file, needsRecord ? 'wx' : 'r', 0o600);
	try {
		if (needsRecord) await fd.writeFile(expected);
		await fd.sync();
	} finally { await fd.close(); }
	await syncDirectory(path);
	const staged = readRunFileGuardPin(path);
	if (staged === undefined || !matches(staged, holder)) throw new Error('legacy guard did not stage its exact owner');
	return staged;
}

/** The fenced launcher excludes legacy writers while the controller installs the first guard. */
export async function holdLegacyRunGuard(gate: Gate, update: Update, stateRoot: string, helper?: string): Promise<RunFileGuard> {
	const path = installationPaths(stateRoot).runGuard;
	const active = await gate.admit(update);
	if (entry(active, 'legacy-launcher-fence')?.receipt === undefined || entry(active, 'predecessor-stop')?.receipt === undefined) {
		throw new Error('legacy guard requires a fenced launcher and verified predecessor stop');
	}
	const recorded = entry(active, HOLD);
	const holder: Owner = recorded === undefined
		? { incarnation: update.owner, nonce: randomUUID() } : JSON.parse(recorded.intent) as Owner;
	if (!matchesDarwinPeer(update.owner, update.owner, holder.incarnation)) throw new Error('legacy guard holder changed');
	if (recorded === undefined) await gate.recordIntent(update, HOLD, JSON.stringify(holder));
	let current = readRunFileGuardPin(path);
	if (current === undefined && recorded?.receipt === undefined) {
		const staging = `${path}.${update.id}`;
		const staged = await stageGuard(staging, holder);
		await gate.admit(update);
		await publishDarwinDirectory(staging, path, staged.directory, helper);
		current = readRunFileGuardPin(path);
		if (current === undefined || !sameGuard(current, staged)) throw new Error('legacy guard published a different directory');
	}
	await syncDirectory(dirname(path));
	if (current === undefined || !matches(current, holder)
		|| (recorded?.receipt !== undefined && !sameGuard(current, JSON.parse(recorded.receipt) as RunFileGuardPin))) {
		throw new Error('legacy guard differs from the controller reservation');
	}
	if (recorded?.receipt === undefined) await gate.recordReceipt(update, HOLD, JSON.stringify(current));
	return transferRunFileGuard(path, current, current.owner, current.nonce);
}

/** Called after authenticating the idle supervisor and verifying its exact registered job. */
export async function giveLegacyRunGuard(gate: Gate, update: Update, stateRoot: string, to: DarwinIncarnation, helper?: string): Promise<void> {
	const path = installationPaths(stateRoot).runGuard;
	const active = await gate.admit(update);
	const hold = entry(active, HOLD);
	const job = JSON.parse(entry(active, 'candidate-job')?.receipt ?? 'null') as { incarnation?: DarwinIncarnation } | null;
	if (hold?.receipt === undefined || job?.incarnation === undefined || !matchesDarwinPeer(to, to, job.incarnation)) {
		throw new Error('guard transfer lacks its prior owner or exact successor job');
	}
	const from = JSON.parse(hold.receipt) as RunFileGuardPin;
	const step = entry(active, TRANSFER);
	const offer: Transfer = step === undefined ? { from, incarnation: to, nonce: randomUUID() } : JSON.parse(step.intent) as Transfer;
	if (!sameGuard(offer.from, from) || !matchesDarwinPeer(to, to, offer.incarnation)
		|| !matchesDarwinPeer(to, await readDarwinIncarnation(to.pid, helper), to)) throw new Error('guard transfer successor changed');
	if (step === undefined) await gate.recordIntent(update, TRANSFER, JSON.stringify(offer));
	await gate.admit(update);
	transferRunFileGuard(path, from, processOwner(to), offer.nonce);
	const accepted = readRunFileGuardPin(path);
	if (accepted === undefined || !matches(accepted, offer)
		|| (step?.receipt !== undefined && !sameGuard(accepted, JSON.parse(step.receipt) as RunFileGuardPin))) {
		throw new Error('legacy guard transfer receipt disagrees with the guard');
	}
	if (step?.receipt === undefined) await gate.recordReceipt(update, TRANSFER, JSON.stringify(accepted));
}

export function adoptLegacyRunGuard(path: string, update: MutationReservation, owner: DarwinIncarnation): RunFileGuard | undefined {
	const step = entry(update, TRANSFER);
	if (step === undefined) return undefined;
	if (step.receipt === undefined) throw new Error('guard transfer receipt is outstanding');
	const offer = JSON.parse(step.intent) as Transfer;
	const pin = readRunFileGuardPin(path);
	if (pin === undefined || !matches(pin, offer) || !sameGuard(pin, JSON.parse(step.receipt) as RunFileGuardPin)
		|| !matchesDarwinPeer(owner, owner, offer.incarnation)) throw new Error('supervisor cannot adopt the receipted guard');
	const guard = transferRunFileGuard(path, pin, pin.owner, pin.nonce);
	return { ...guard, release() {
		// Rename the occupied directory away in one operation. A crash cannot leave
		// the public guard path with its owner record removed.
		const scratch = mkdtempSync(`${path}.released-`);
		const retired = join(scratch, 'guard');
		try {
			guard.assertOwned();
			renameSync(path, retired);
			unlinkSync(join(retired, 'owner.json'));
			rmdirSync(retired);
		} finally { rmdirSync(scratch); }
	} };
}

/** The caller proves the candidate is idle or reaped and retains the launcher fence. */
export async function settleLegacyRunGuard(gate: Gate, update: Update, stateRoot: string,
	purpose: 'lifecycle' | 'reconcile' = 'lifecycle', helper?: string,
): Promise<void> {
	const active = await gate.admit(update, purpose);
	const hold = entry(active, HOLD);
	if (hold === undefined) return;
	const path = installationPaths(stateRoot).runGuard;
	const holder = JSON.parse(hold.intent) as Owner;
	const transfer = entry(active, TRANSFER);
	const offer = transfer === undefined ? undefined : JSON.parse(transfer.intent) as Transfer;
	const current = readRunFileGuardPin(path);
	if (current !== undefined) {
		const original = hold.receipt === undefined ? undefined : JSON.parse(hold.receipt) as RunFileGuardPin;
		const final = transfer?.receipt === undefined ? undefined : JSON.parse(transfer.receipt) as RunFileGuardPin;
		const valid = matches(current, holder) && (original === undefined || sameGuard(current, original))
			|| (offer !== undefined && matches(current, offer) && current.directory.dev === offer.from.directory.dev
				&& current.directory.ino === offer.from.directory.ino && (final === undefined || sameGuard(current, final)));
		if (!valid) throw new Error('cannot retire a guard outside this legacy cutover');
		await publishDarwinDirectory(path, `${path}.${update.id}.settled`, current.directory, helper);
		await syncDirectory(dirname(path));
	}
	for (const owned of [`${path}.${update.id}`, `${path}.${update.id}.settled`]) {
		if (runFileIdentity(owned) === undefined) continue;
		const info = await lstat(owned);
		if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) {
			throw new Error('cannot remove an unowned legacy guard directory');
		}
		const names = await readdir(owned);
		if (names.length === 0) { await rmdir(owned); continue; }
		const pinned = owned.endsWith('.settled') ? readRunFileGuardPin(owned) : await stageGuard(owned, holder);
		if (pinned === undefined || (!matches(pinned, holder) && (offer === undefined || !matches(pinned, offer)))) {
			throw new Error('cannot remove an unowned legacy guard artifact');
		}
		const staged = offer === undefined ? undefined : `transfer-${offer.nonce}`;
		if (names.some(name => name !== 'owner.json' && name !== staged)) throw new Error('unrecognized legacy guard artifact');
		if (staged !== undefined && names.includes(staged)) await unlink(join(owned, staged));
		await unlink(join(owned, 'owner.json'));
		await rmdir(owned);
	}
}
