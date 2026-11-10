/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { realpath } from 'node:fs/promises';
import { stopDaemon } from '../cli/services/daemon.js';
import { captureDaemon, cleanupStoppedDaemon } from '../cli/services/lifecycle.js';
import { ManagedDaemonControl } from '../cli/services/managed-daemon-control.js';
import { readDarwinIncarnation } from '../shared/darwin-lifecycle.js';
import { SupervisorLifecycleError } from '../shared/daemon-supervisor-protocol.js';
import { InstallationMutationGate } from '../shared/installation-mutation-gate.js';
import { rpc } from '../shared/ipc-client.js';
import { readManagedInstallation, stageManagedInstallation } from '../shared/managed-daemon-installation.js';
import { recoverInstalledManagedUpdate } from '../daemon/managed-update-recovery.js';
import { PATHS } from '../shared/paths.js';

const NOT_MANAGED = 10;

function stopWait(seconds: string): number {
	const value = Number(seconds);
	if (!Number.isFinite(value) || value < 0 || value > 3600) throw new Error('invalid daemon stop wait');
	return Math.floor(value * 1000);
}

async function legacyStop(seconds: string): Promise<void> {
	const milliseconds = stopWait(seconds);
	const captured = await captureDaemon();
	if (!captured.target) {
		cleanupStoppedDaemon(captured);
		process.stdout.write('daemon shut down (no live original process)\n');
		return;
	}
	const result = await stopDaemon({ capture: async () => captured, stopWaitMs: milliseconds });
	process.stdout.write(result.forced ? `daemon did not stop within ${seconds} s; killed (pid ${result.pid})\n` : 'daemon shut down\n');
}

async function stage(release: string | undefined, releaseId: string | undefined): Promise<void> {
	if (process.platform !== 'darwin' || release === undefined || releaseId === undefined
		|| !/^[a-zA-Z0-9._-]+$/.test(releaseId)) throw new Error('stage requires a pinned Darwin release and release ID');
	const stateRoot = await realpath(PATHS.insrc);
	const gate = new InstallationMutationGate(stateRoot);
	const reservation = await gate.reserve({ kind: 'start', owner: await readDarwinIncarnation(process.pid) });
	await gate.recordIntent(reservation, 'stage', releaseId);
	await stageManagedInstallation({
		version: 1, stateRoot, releaseRoot: await realpath(release), releaseId, runtime: await realpath(process.execPath),
		pathEnv: process.env['PATH'] ?? '/usr/bin:/bin', enabled: false,
	}, async () => { await gate.admit(reservation); });
	await gate.recordReceipt(reservation, 'stage', 'staged with installed rollout disabled');
	await gate.release(reservation);
	process.stdout.write('managed daemon descriptor staged\n');
}

async function main(command: string): Promise<void> {
	if (command === 'stage') return stage(process.argv[3], process.argv[4]);
	if (!['start', 'stop', 'restart', 'update', 'status', 'recover'].includes(command)) return legacyStop(command);

	const installation = await readManagedInstallation();
	if (installation === undefined) { process.exitCode = NOT_MANAGED; return; }
	const control = new ManagedDaemonControl(installation);
	if (command === 'status') {
		try { process.stdout.write(JSON.stringify(await rpc('daemon.status', {}, undefined, { timeoutMs: 3000 }), null, 2) + '\n'); }
		catch { process.stdout.write(await control.recoveryStatus() + '\n'); }
		return;
	}
	if (command === 'recover') {
		const gate = new InstallationMutationGate(installation.stateRoot);
		const active = (await gate.read()).active;
		if (active?.kind === 'update') {
			const outcome = await recoverInstalledManagedUpdate(gate, active.id, await readDarwinIncarnation(process.pid));
			process.stdout.write(`${outcome.decision}: ${outcome.detail}\n`);
			if (outcome.decision === 'operator-recovery' && (await gate.read()).active !== null) process.exitCode = 4;
			return;
		}
		await control.recoverStoppedLifecycle();
		process.stdout.write('verified stopped lifecycle reservation recovered\n');
		return;
	}
	if (command === 'update') {
		process.stdout.write(JSON.stringify(await rpc('daemon.update', {}, undefined, { timeoutMs: 20_000 })) + '\n');
		return;
	}
	if (command !== 'start' && command !== 'stop' && command !== 'restart') throw new Error('invalid lifecycle command');
	const milliseconds = stopWait(process.argv[3] ?? '30');
	try {
		const result = await control.run(command, milliseconds === 0 ? 1 : milliseconds);
		if (command === 'stop') process.stdout.write(result.forced ? 'managed daemon force-stopped\n' : 'daemon shut down\n');
		else process.stdout.write(command === 'restart' ? 'daemon restarted\n' : 'daemon running\n');
	} catch (error) {
		if (command !== 'stop' || !(error instanceof SupervisorLifecycleError) || error.code !== 'not-running') throw error;
		process.stdout.write('daemon shut down (no active generation)\n');
	}
}

try { await main(process.argv[2] ?? '30'); }
catch (error) {
	process.stderr.write(`daemon lifecycle refused: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 4;
}
