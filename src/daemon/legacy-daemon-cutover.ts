/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { once } from 'node:events';
import { lstatSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { realpath } from 'node:fs/promises';
import { matchesDarwinPeer, observeDarwinExit, readDarwinIncarnation, readDarwinLaunchContext, readDarwinPeerCredentials } from '../shared/darwin-lifecycle.js';
import type { DarwinExitObservation, DarwinIncarnation } from '../shared/darwin-lifecycle.js';
import { acquireRunFileGuard, removeOwnedRunFile, runFileIdentity, sameRunFile } from '../shared/daemon-run-files.js';
import type { RunFileIdentity } from '../shared/daemon-run-files.js';
import { installationPaths } from '../shared/managed-daemon-installation.js';
import type { LegacyLaunchPin } from '../shared/installation-mutation-gate.js';
import { matchesInstalledDaemonArguments } from './legacy-launch-job.js';

export interface LegacyDaemonPin {
	readonly stateRoot: string;
	readonly runtime: string;
	readonly entry: string;
	readonly launch?: LegacyLaunchPin | undefined;
}

function requireSameFile(path: string, expected: RunFileIdentity, mayBeAbsent = false): void {
	const actual = runFileIdentity(path);
	if (actual === undefined ? !mayBeAbsent : !sameRunFile(actual, expected)) {
		throw new Error('legacy daemon run-file identity changed');
	}
}

/** Drain a cooperative legacy daemon on its authenticated socket. The observer never signals it. */
export async function drainLegacyDaemonForCutover(
	pin: LegacyDaemonPin, authorize: () => Promise<void>, timeoutMs = 30_000,
): Promise<DarwinIncarnation | undefined> {
	if (process.platform !== 'darwin' || await realpath(pin.stateRoot) !== pin.stateRoot) {
		throw new Error('legacy cutover requires a canonical macOS installation root');
	}
	const paths = installationPaths(pin.stateRoot);
	const uid = process.getuid?.();
	await authorize();
	const guard = acquireRunFileGuard(paths.runGuard);
	let observer: DarwinExitObservation | undefined;
	let socket: Socket | undefined;
	let target: DarwinIncarnation;
	let pidFile: RunFileIdentity;
	let socketFile: RunFileIdentity;
	try {
		try {
			const pidIdentity = runFileIdentity(paths.daemonPid);
			const socketIdentity = runFileIdentity(paths.daemonSocket);
			if (pidIdentity === undefined && socketIdentity === undefined && (pin.launch === undefined || pin.launch.kind === 'stopped')) return undefined;
			if (pidIdentity === undefined || socketIdentity === undefined) throw new Error('legacy daemon publication is incomplete');
			if (pin.launch !== undefined && (pin.launch.kind === 'stopped'
				|| !sameRunFile(pin.launch.pidFile, pidIdentity) || !sameRunFile(pin.launch.socketFile, socketIdentity))) {
				throw new Error('legacy daemon publication changed after admission');
			}
			pidFile = pidIdentity;
			socketFile = socketIdentity;
			const pidStat = lstatSync(paths.daemonPid);
			const socketStat = lstatSync(paths.daemonSocket);
			if (!pidStat.isFile() || pidStat.uid !== uid || pidStat.size > 32 || !socketStat.isSocket() || socketStat.uid !== uid) {
				throw new Error('legacy daemon run files are not owned by the installation user');
			}
			const pidText = readFileSync(paths.daemonPid, 'utf8').trim();
			if (!/^\d+$/.test(pidText)) throw new Error('legacy daemon pid file is invalid');
			target = await readDarwinIncarnation(Number(pidText));
			const { argv } = await readDarwinLaunchContext(target.pid);
			if (target.uid !== uid || await realpath(target.executable) !== await realpath(pin.runtime)
				|| !matchesInstalledDaemonArguments(argv, pin.runtime, pin.entry)
				|| (pin.launch !== undefined && !matchesDarwinPeer(target, target, pin.launch.process))) {
				throw new Error('legacy daemon process does not match the pinned entry');
			}
			observer = await observeDarwinExit(target, timeoutMs);
			socket = createConnection(paths.daemonSocket);
			socket.on('error', () => { /* surfaced by connect/write or exact-exit verification */ });
			await once(socket, 'connect', { signal: AbortSignal.timeout(Math.min(2_000, timeoutMs)) });
			const fd = (socket as Socket & { _handle?: { fd?: number } })._handle?.fd;
			if (fd === undefined) throw new Error('legacy daemon socket has no peer descriptor');
			const credentials = await readDarwinPeerCredentials(fd);
			const observed = await readDarwinIncarnation(target.pid);
			if (!matchesDarwinPeer(credentials, observed, target)) throw new Error('legacy daemon socket peer does not match the pinned process');
			requireSameFile(paths.daemonPid, pidFile);
			requireSameFile(paths.daemonSocket, socketFile);
			guard.assertOwned();
		} finally { guard.release(); }

		await authorize();
		await new Promise<void>((resolve, reject) => {
			socket!.write(JSON.stringify({ id: 1, method: 'daemon.shutdown', params: {} }) + '\n',
				error => error ? reject(error) : resolve());
		});
		if (!await observer.exited) throw new Error('legacy daemon exit was not observed');
		await authorize();
		const cleanup = acquireRunFileGuard(paths.runGuard);
		try {
			requireSameFile(paths.daemonPid, pidFile, true);
			requireSameFile(paths.daemonSocket, socketFile, true);
			removeOwnedRunFile(paths.daemonPid, pidFile, cleanup);
			removeOwnedRunFile(paths.daemonSocket, socketFile, cleanup);
		} finally { cleanup.release(); }
		return target;
	} finally {
		socket?.destroy();
		await observer?.close();
	}
}
