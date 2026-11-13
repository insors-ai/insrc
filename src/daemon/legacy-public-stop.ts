/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { acquireRunFileGuard, removeOwnedRunFile, runFileIdentity } from '../shared/daemon-run-files.js';
import { readFile } from 'node:fs/promises';
import { matchesDarwinPeer, observeDarwinExit, readDarwinIncarnation } from '../shared/darwin-lifecycle.js';
import type { DarwinIncarnation } from '../shared/darwin-lifecycle.js';
import { InstallationMutationGate } from '../shared/installation-mutation-gate.js';
import { installationPaths } from '../shared/managed-daemon-installation.js';

/** Run from an external controller so the reservation survives the daemon's shutdown. */
export async function stopRestoredLegacyProcess(
	stateRoot: string, target: DarwinIncarnation, drain: (id: string) => Promise<void>,
): Promise<void> {
	const gate = new InstallationMutationGate(stateRoot);
	const reservation = await gate.reserve({ kind: 'stop', owner: await readDarwinIncarnation(process.pid) });
	let intended = false;
	try {
		const observed = await readDarwinIncarnation(target.pid);
		if (!matchesDarwinPeer(target, observed, target)) throw new Error('restored legacy process changed');
		const paths = installationPaths(stateRoot);
		const capture = acquireRunFileGuard(paths.runGuard);
		let pid;
		let socket;
		try {
			pid = runFileIdentity(paths.daemonPid);
			socket = runFileIdentity(paths.daemonSocket);
			if (pid === undefined || socket === undefined) throw new Error('restored legacy publication is incomplete');
			if ((await readFile(paths.daemonPid, 'utf8')).trim() !== String(target.pid)) {
				throw new Error('restored legacy PID publication names another process');
			}
		} finally { capture.release(); }
		const observer = await observeDarwinExit(target, 45_000);
		try {
			await gate.recordIntent(reservation, 'restored-public-stop', JSON.stringify({ target, pid, socket }));
			intended = true;
			await drain(reservation.id);
			if (!await observer.exited) throw new Error('restored legacy process exit was not verified');
			const cleanup = acquireRunFileGuard(paths.runGuard);
			try {
				removeOwnedRunFile(paths.daemonPid, pid, cleanup);
				removeOwnedRunFile(paths.daemonSocket, socket, cleanup);
			} finally { cleanup.release(); }
			await gate.recordReceipt(reservation, 'restored-public-stop', JSON.stringify({ exit: target }));
			await gate.release(reservation);
		} finally { await observer.close(); }
	} catch (error) {
		if (!intended) await gate.release(reservation);
		throw error;
	}
}
