/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { access, realpath } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { stopDaemon } from '../cli/services/daemon.js';
import { captureDaemon, cleanupStoppedDaemon } from '../cli/services/lifecycle.js';
import { accepted, ManagedDaemonControl, openManagedSupervisorLink } from '../cli/services/managed-daemon-control.js';
import { readDarwinIncarnation } from '../shared/darwin-lifecycle.js';
import { SupervisorLifecycleError } from '../shared/daemon-supervisor-protocol.js';
import { InstallationMutationGate } from '../shared/installation-mutation-gate.js';
import { runFileIdentity } from '../shared/daemon-run-files.js';
import { rpc } from '../shared/ipc-client.js';
import { installationPaths, readInstallationSelector, readManagedUpdateInputs, stageManagedInstallation, verifyManagedReleaseRuntime } from '../shared/managed-daemon-installation.js';
import { completeLegacyMigration, recoverInstalledManagedUpdate } from '../daemon/managed-update-recovery.js';
import { inspectLegacyJob, pinLegacyLaunchJob, verifyLegacyService } from '../daemon/legacy-launch-job.js';
import { readQualifiedReleasePairs, releaseDeclaration } from '../daemon/managed-update-launch.js';
import { requireQualifiedReleasePair } from '../daemon/release-compatibility.js';
import { readInstalledCommit } from '../daemon/installed-commit.js';
import { activateFreshManagedDaemon } from '../daemon/fresh-managed-activation.js';
import { captureManagedReleasePin } from '../daemon/managed-release-staging.js';
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

async function stage(release: string | undefined, releaseId: string | undefined, legacyCutover = false): Promise<void> {
	if (process.platform !== 'darwin' || release === undefined || releaseId === undefined
		|| !/^[a-zA-Z0-9._-]+$/.test(releaseId)) throw new Error('stage requires a pinned Darwin release and release ID');
	const stateRoot = await realpath(PATHS.insrc);
	const gate = new InstallationMutationGate(stateRoot);
	const reservation = await gate.reserve({ kind: 'start', owner: await readDarwinIncarnation(process.pid) });
	await gate.recordIntent(reservation, 'stage', releaseId);
	await stageManagedInstallation({
		version: 1, stateRoot, releaseRoot: await realpath(release), releaseId, runtime: await realpath(process.execPath),
		pathEnv: process.env['PATH'] ?? '/usr/bin:/bin', enabled: false,
	}, async () => { await gate.admit(reservation); }, legacyCutover);
	await gate.recordReceipt(reservation, 'stage', 'staged with installed rollout disabled');
	await gate.release(reservation);
	process.stdout.write('managed daemon descriptor staged\n');
}

async function migrate([release, releaseId, runtime, descriptor]: readonly string[]): Promise<void> {
	if (process.platform !== 'darwin' || release === undefined || releaseId === undefined || runtime === undefined
		|| descriptor === undefined || !/^[a-zA-Z0-9._-]+$/.test(releaseId)) {
		throw new Error('migrate requires legacy release root, release ID, runtime, and LaunchAgent descriptor');
	}
	const root = await realpath(PATHS.insrc);
	const baseline = await readInstallationSelector(root);
	if (baseline === undefined || baseline.enabled) throw new Error('legacy migration requires a disabled staged selector');
	const { candidate, qualifications } = await readManagedUpdateInputs(root);
	if (!isDeepStrictEqual(candidate, { ...baseline, enabled: true })) throw new Error('candidate differs from the staged release');
	const prior = { ...baseline, releaseRoot: await realpath(release), releaseId, runtime: await realpath(runtime) };
	if (prior.releaseRoot === candidate.releaseRoot) throw new Error('legacy and candidate releases require separate roots');
	const qualified = readQualifiedReleasePairs(qualifications);
	const declaredCandidate = await releaseDeclaration(candidate.releaseRoot);
	if (declaredCandidate.releaseId !== candidate.releaseId) throw new Error('candidate declaration differs from the staged release');
	const declaredPrior = qualified.find(pair => pair.prior.releaseId === prior.releaseId && pair.candidate.releaseId === candidate.releaseId)?.prior;
	if (declaredPrior === undefined) throw new Error('legacy release has no explicit qualification for the candidate');
	const compatibility = requireQualifiedReleasePair(declaredPrior, declaredCandidate, qualified);
	await verifyManagedReleaseRuntime(candidate);
	const legacy = await pinLegacyLaunchJob(prior, baseline, descriptor);
	await access(legacy.entry);
	const job = await inspectLegacyJob(legacy);
	if (job === undefined) throw new Error('legacy LaunchAgent must be registered before migration');
	const paths = installationPaths(root);
	const wasRunning = runFileIdentity(paths.daemonPid) !== undefined || runFileIdentity(paths.daemonSocket) !== undefined;
	if (!wasRunning && legacy.runAtLoad) throw new Error('saved LaunchAgent would start during rollback of a stopped installation');
	await verifyLegacyService(legacy, prior, wasRunning);
	const gate = new InstallationMutationGate(root);
	const reservation = await gate.reserve({
		kind: 'update', owner: await readDarwinIncarnation(process.pid),
		predecessor: {
			priorRelease: prior.releaseId, candidateRelease: candidate.releaseId, priorCommit: readInstalledCommit(prior.releaseRoot),
			wasRunning, generation: null, pins: { prior, candidate }, legacy,
		},
	});
	if (reservation.kind !== 'update') throw new Error('legacy migration did not reserve an update');
	const outcome = await completeLegacyMigration(gate, reservation, { prior, candidate, compatibility });
	process.stdout.write(`${outcome.decision}: ${outcome.detail}\n`);
	if (outcome.decision !== 'committed') process.exitCode = 4;
}

async function main(command: string): Promise<void> {
	if (command === 'activate-fresh') {
		const [release, intent] = process.argv.slice(3);
		if (release === undefined || (intent !== 'start' && intent !== 'idle')) throw new Error('activate-fresh requires a release and start or idle intent');
		const stateRoot = await realpath(PATHS.insrc);
		const pin = await captureManagedReleasePin(await realpath(release), process.execPath);
		await activateFreshManagedDaemon({
			installation: { version: 1, stateRoot, releaseRoot: pin.root, releaseId: pin.commit, runtime: pin.runtime,
				pathEnv: process.env['PATH'] ?? '/usr/bin:/bin', enabled: true },
			startChild: intent === 'start',
			fingerprint: pin.fingerprint,
		});
		process.stdout.write(intent === 'start' ? 'managed daemon started\n' : 'managed daemon installed and idle\n');
		return;
	}
	if (command === 'resume-fresh') {
		const stateRoot = await realpath(PATHS.insrc);
		const active = (await new InstallationMutationGate(stateRoot).read()).active;
		if (active?.kind !== 'start' || active.activation === undefined) {
			const release = process.argv[3];
			const selected = release === undefined ? undefined : await readInstallationSelector(stateRoot);
			if (active === null && release !== undefined && selected?.enabled === true && selected.releaseRoot === await realpath(release)) {
				const link = await openManagedSupervisorLink(selected);
				try {
					const status = accepted(await link.call({ op: 'status', generation: null }));
					if (status.state !== 'idle' && status.state !== 'running') throw new Error('completed fresh installation is not settled');
				} finally { link.close(); }
				return;
			}
			process.exitCode = NOT_MANAGED;
			return;
		}
		await activateFreshManagedDaemon(active.activation);
		process.stdout.write('managed daemon activation recovered\n');
		return;
	}
	if (command === 'stage' || command === 'stage-legacy') return stage(process.argv[3], process.argv[4], command === 'stage-legacy');
	if (command === 'migrate') return migrate(process.argv.slice(3));
	if (!['start', 'stop', 'restart', 'update', 'status', 'recover'].includes(command)) return legacyStop(command);

	const installation = await readInstallationSelector(PATHS.insrc);
	if (installation === undefined) {
		if (process.platform === 'darwin' && await access(installationPaths(PATHS.insrc).directory).then(() => true, () => false)) {
			const active = (await new InstallationMutationGate(PATHS.insrc).read()).active;
			if (active?.kind === 'start' && active.activation !== undefined) {
				if (command !== 'recover') throw new Error('fresh daemon activation is in progress; retry the installer to recover');
				await activateFreshManagedDaemon(active.activation);
				return;
			}
		}
		process.exitCode = NOT_MANAGED;
		return;
	}
	const control = new ManagedDaemonControl(installation);
	const gate = new InstallationMutationGate(installation.stateRoot);
	const active = (await gate.read()).active;
	if (!installation.enabled && active?.kind !== 'update') { process.exitCode = NOT_MANAGED; return; }
	if (!installation.enabled && command !== 'recover' && command !== 'status') throw new Error('legacy cutover owns the installation');
	if (command === 'status') {
		try { process.stdout.write(JSON.stringify(await rpc('daemon.status', {}, undefined, { timeoutMs: 3000 }), null, 2) + '\n'); }
		catch { process.stdout.write(await control.recoveryStatus() + '\n'); }
		return;
	}
	if (command === 'recover') {
		if (active?.kind === 'start' && active.activation !== undefined) {
			await activateFreshManagedDaemon(active.activation);
			return;
		}
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
