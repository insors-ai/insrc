/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { realpath } from 'node:fs/promises';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { matchesDarwinPeer, readDarwinIncarnation, readDarwinPeerCredentials } from '../shared/darwin-lifecycle.js';
import type { DarwinPeerCredentials } from '../shared/darwin-lifecycle.js';
import { InstallationMutationGate } from '../shared/installation-mutation-gate.js';
import { rpc } from '../shared/ipc-client.js';
import { installationPaths, readManagedInstallation, requireQuiescentInstallation, supervisorJob } from '../shared/managed-daemon-installation.js';
import type { RegisteredManagedJob } from '../shared/managed-daemon-installation.js';
import { PATHS } from '../shared/paths.js';
import { DaemonSupervisor, SupervisorPublicShutdown } from '../daemon/supervisor.js';
import { SupervisorRunFiles } from '../daemon/supervisor-run-files.js';
import { listenForSupervisorControllers } from '../daemon/supervisor-socket.js';
import { qualifiedPairFromReservation } from '../daemon/release-compatibility.js';

async function verifyReady(socketPath: string, pid: number, uid: number): Promise<void> {
	let resolvePeer!: (peer: DarwinPeerCredentials) => void;
	let rejectPeer!: (error: unknown) => void;
	const peer = new Promise<DarwinPeerCredentials>((resolve, reject) => { resolvePeer = resolve; rejectPeer = reject; });
	const result = rpc('daemon.status', {}, () => {
		const socket = createConnection(socketPath);
		socket.once('error', rejectPeer);
		const closedBeforeConnect = () => rejectPeer(new Error('daemon readiness socket closed before connecting'));
		socket.once('close', closedBeforeConnect);
		socket.once('connect', () => {
			socket.removeListener('close', closedBeforeConnect);
			const fd = (socket as Socket & { _handle?: { fd?: number } })._handle?.fd;
			if (fd === undefined) rejectPeer(new Error('daemon readiness socket has no Unix descriptor'));
			else void readDarwinPeerCredentials(fd).then(resolvePeer, rejectPeer);
		});
		return socket;
	}, { timeoutMs: 2_000 });
	const [status, credentials] = await Promise.all([result, peer]);
	if (status === null || typeof status !== 'object' || credentials.pid !== pid || credentials.uid !== uid) {
		throw new Error('status socket does not belong to the managed child');
	}
}

async function main(): Promise<void> {
	const root = await realpath(PATHS.insrc);
	if (root !== process.argv[2]) throw new Error('supervisor root does not match this installation');
	const installation = await readManagedInstallation(root);
	if (installation === undefined) throw new Error('managed daemon rollout is not enabled');
	const paths = installationPaths(root);
	const gate = new InstallationMutationGate(root);
	const owner = await readDarwinIncarnation(process.pid);
	const publicShutdown = new SupervisorPublicShutdown(gate, owner);
	const supervisor = new DaemonSupervisor({
		installation: gate,
		daemon: {
			runtime: installation.runtime, entry: join(installation.releaseRoot, 'out/daemon/index.js'), cwd: installation.releaseRoot,
			env: { ...process.env, INSRC_MODE: 'daemon', INSRC_DAEMON_ROOT: installation.releaseRoot, PATH: installation.pathEnv },
		},
		configureLaunch(daemon, reservation) {
			const env = { ...daemon.env };
			delete env['INSRC_PROBATION_UPDATE'];
			delete env['INSRC_PROBATION_RELEASE'];
			if (reservation.kind === 'update' && installation.releaseId === reservation.predecessor.candidateRelease) {
				const { candidate } = qualifiedPairFromReservation(reservation);
				const step = (name: string) => reservation.entries.find(entry => entry.step === name);
				const stopped = JSON.parse(step('predecessor-stop')?.receipt ?? 'null') as
					{ generation?: string | null; state?: string; exit?: unknown } | null;
				const registered = JSON.parse(step('candidate-job')?.receipt ?? 'null') as RegisteredManagedJob | null;
				const job = supervisorJob(installation);
				if (stopped === null || stopped.state !== 'exited' || stopped.exit === undefined
					|| stopped.generation !== reservation.predecessor.generation
					|| step('predecessor-job-removal')?.receipt === undefined
					|| step('provisional-selector')?.receipt !== candidate.releaseId
					|| registered?.pid !== process.pid || registered.target !== `gui/${job.uid}/${job.label}`
					|| registered.incarnation === undefined || !matchesDarwinPeer(owner, owner, registered.incarnation)
					|| step('candidate-start')?.intent !== candidate.releaseId || step('candidate-start')?.receipt !== undefined) {
					throw new Error('candidate launch lacks exact job and predecessor admission');
				}
				env['INSRC_PROBATION_UPDATE'] = reservation.id;
				env['INSRC_PROBATION_RELEASE'] = candidate.releaseId;
			} else if (reservation.kind === 'update' && installation.releaseId !== reservation.predecessor.priorRelease) {
				throw new Error('pinned release does not belong to this update');
			}
			return { ...daemon, env };
		},
		runFiles: new SupervisorRunFiles({ guardPath: paths.runGuard, pidFile: paths.daemonPid, socketFile: paths.daemonSocket },
			{ ...owner, commandLine: owner.executable }, owner.uid),
		verifyReady: (_generation, pid) => verifyReady(paths.daemonSocket, pid, owner.uid),
		reconcileExit: generation => publicShutdown.reconciled(generation),
		allowInitialStart: async () => { await requireQuiescentInstallation(installation); return true; },
		publicArm: generation => publicShutdown.admit(generation),
	});
	await listenForSupervisorControllers(paths.socket, { installationRoot: root, releaseId: installation.releaseId }, supervisor);
}

try { await main(); }
catch (error) {
	process.stderr.write(`daemon supervisor refused startup: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 4;
}
