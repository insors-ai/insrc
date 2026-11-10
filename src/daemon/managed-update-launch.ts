/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { accepted, openManagedSupervisorLink } from '../cli/services/managed-daemon-control.js';
import { readDarwinIncarnation } from '../shared/darwin-lifecycle.js';
import { InstallationMutationGate } from '../shared/installation-mutation-gate.js';
import type { MutationReservation } from '../shared/installation-mutation-gate.js';
import { readManagedInstallation, readManagedUpdateInputs, verifyManagedReleaseRuntime } from '../shared/managed-daemon-installation.js';
import { PATHS } from '../shared/paths.js';
import { readInstalledCommit } from './installed-commit.js';
import { qualifyManagedUpdate } from './managed-update-handoff.js';
import type { ManagedUpdatePins } from './managed-update-handoff.js';
import { readReleaseCompatibility } from './release-compatibility.js';

type Update = Extract<MutationReservation, { kind: 'update' }>;
type UpdateGate = Pick<InstallationMutationGate, 'admit' | 'recordIntent' | 'recordReceipt' | 'cancelUnstartedUpdate'>;
const LAUNCH_TIMEOUT_MS = 15_000;
const RELEASE = 'start-acknowledged-update';

function reservationId(message: unknown): string {
	const value = message as { updateId?: unknown } | null;
	if (typeof value?.updateId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.updateId)) {
		throw new Error('detached updater did not return a reservation ID');
	}
	return value.updateId;
}

/** Return the reservation while retaining the private channel until the response writer confirms delivery. */
export async function launchManagedUpdate(
	entry: string, args: readonly string[], awaitReply: () => Promise<boolean>,
): Promise<{ launched: true; updateId: string }> {
	const env = { ...process.env };
	delete env['INSRC_SUPERVISOR_GENERATION'];
	delete env['INSRC_PROBATION_UPDATE'];
	delete env['INSRC_PROBATION_RELEASE'];
	const child = fork(entry, [...args], { detached: true, env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
	let updateId: string;
	try {
		updateId = await waitForReservation(child);
	} catch (error) {
		if (child.connected) child.disconnect();
		throw error;
	}
	void awaitReply().then(written => {
		if (written && child.connected) {
			child.send(RELEASE, error => {
				if (child.connected) child.disconnect();
				if (!error) child.unref();
			});
		} else if (child.connected) child.disconnect();
	}, () => { if (child.connected) child.disconnect(); });
	return { launched: true, updateId };
}

function waitForReservation(child: ChildProcess): Promise<string> {
	return new Promise((resolve, reject) => {
		const fail = () => finish(undefined);
		const timer = setTimeout(fail, LAUNCH_TIMEOUT_MS);
		const onMessage = (message: unknown) => finish(message);
		const finish = (message: unknown) => {
			clearTimeout(timer);
			child.removeListener('message', onMessage);
			child.removeListener('disconnect', fail);
			child.removeListener('exit', fail);
			try { resolve(reservationId(message)); } catch (error) { reject(error); }
		};
		child.once('message', onMessage);
		child.once('disconnect', fail);
		child.once('exit', fail);
		// Keep consuming late child errors after the reservation has been sent.
		child.on('error', fail);
	});
}

/** The detached owner reserves first, and may only stage the update after the private release. */
export async function runAcknowledgedManagedUpdate<T>(
	gate: UpdateGate, reserve: () => Promise<Update>, pins: ManagedUpdatePins,
	stage: (gate: UpdateGate, update: Update, pins: ManagedUpdatePins) => Promise<T>,
): Promise<T | undefined> {
	const update = await reserve();
	if (!await waitForLaunch(update.id)) {
		await gate.cancelUnstartedUpdate(update);
		return undefined;
	}
	return stage(gate, update, pins);
}

function waitForLaunch(updateId: string): Promise<boolean> {
	if (!process.connected || process.send === undefined) return Promise.resolve(false);
	return new Promise(resolve => {
		const disconnected = () => finish(false);
		const timeout = setTimeout(disconnected, LAUNCH_TIMEOUT_MS);
		const message = (value: unknown) => finish(value === RELEASE);
		const finish = (admitted: boolean) => {
			clearTimeout(timeout);
			process.removeListener('disconnect', disconnected);
			process.removeListener('message', message);
			resolve(admitted);
		};
		process.once('disconnect', disconnected);
		process.once('message', message);
		process.send!({ updateId }, error => { if (error) finish(false); });
	});
}

async function releaseDeclaration(root: string) {
	const path = join(root, 'out/release-compatibility.json');
	const info = await lstat(path);
	if (!info.isFile() || info.size > 8_192 || (info.mode & 0o022) !== 0
		|| (info.uid !== 0 && info.uid !== process.getuid?.())) throw new Error('release declaration is not a bounded owned file');
	return readReleaseCompatibility(JSON.parse(await readFile(path, 'utf8')));
}

/** Preflight and reserve inside the detached daemon-owned process so it owns all receipts. */
export async function prepareManagedUpdate() {
	const root = await realpath(PATHS.insrc);
	const prior = await readManagedInstallation(root);
	if (prior === undefined) throw new Error('managed update requires an enabled installed daemon');
	const { candidate, qualifications } = await readManagedUpdateInputs(root);
	if (!Array.isArray(qualifications)) throw new Error('invalid qualified release pair list');
	const qualified = qualifications.map((value: unknown) => {
		if (typeof value !== 'object' || value === null) throw new Error('invalid qualified release pair');
		const pair = value as { prior?: unknown; candidate?: unknown };
		return { prior: readReleaseCompatibility(pair.prior), candidate: readReleaseCompatibility(pair.candidate) };
	});
	const pins = qualifyManagedUpdate(prior, candidate,
		await releaseDeclaration(prior.releaseRoot), await releaseDeclaration(candidate.releaseRoot), qualified);
	await verifyManagedReleaseRuntime(prior);
	await verifyManagedReleaseRuntime(candidate);
	const link = await openManagedSupervisorLink(prior);
	const gate = new InstallationMutationGate(root);
	try {
		const status = accepted(await link.call({ op: 'status', generation: null }));
		if (!['idle', 'exited', 'running'].includes(status.state)) throw new Error('predecessor is already changing state');
		const owner = await readDarwinIncarnation(process.pid);
		return {
			pins, gate,
			reserve: async (): Promise<Update> => {
				const reservation = await gate.reserve({
					kind: 'update', owner, predecessor: {
						priorRelease: prior.releaseId, candidateRelease: candidate.releaseId,
						wasRunning: status.state === 'running', generation: status.generation,
						priorCommit: readInstalledCommit(prior.releaseRoot), pins: { prior, candidate },
					},
				}) as Update;
				try {
					const selected = await readManagedInstallation(root);
					if (JSON.stringify(selected) !== JSON.stringify(prior)) throw new Error('installation selector changed before update reservation');
					return reservation;
				} catch (error) {
					await gate.cancelUnstartedUpdate(reservation);
					throw error;
				}
			},
		};
	} finally { link.close(); }
}
