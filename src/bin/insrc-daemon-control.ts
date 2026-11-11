/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { access, lstat, realpath, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { stopDaemon } from '../cli/services/daemon.js';
import { captureDaemon, cleanupStoppedDaemon } from '../cli/services/lifecycle.js';
import { accepted, ManagedDaemonControl, openManagedSupervisorLink } from '../cli/services/managed-daemon-control.js';
import { readDarwinIncarnation } from '../shared/darwin-lifecycle.js';
import { SupervisorLifecycleError } from '../shared/daemon-supervisor-protocol.js';
import { InstallationMutationGate } from '../shared/installation-mutation-gate.js';
import { rpc } from '../shared/ipc-client.js';
import { installationPaths, readInstallationSelector, readManagedUpdateInputs, stageManagedInstallation, verifyManagedReleaseRuntime } from '../shared/managed-daemon-installation.js';
import { completeLegacyMigration, recoverInstalledManagedUpdate } from '../daemon/managed-update-recovery.js';
import { discoverLegacyLaunch } from '../daemon/legacy-cutover-admission.js';
import { readQualifiedReleasePairs, releaseDeclaration } from '../daemon/managed-update-launch.js';
import { requireQualifiedReleasePair } from '../daemon/release-compatibility.js';
import { readInstalledCommit } from '../daemon/installed-commit.js';
import { activateFreshManagedDaemon } from '../daemon/fresh-managed-activation.js';
import { captureManagedReleasePin } from '../daemon/managed-release-staging.js';
import { admitManagedPreparation, prepareLegacyUpgrade, runManagedPreparation } from '../daemon/managed-update-preparation.js';
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
		|| !/^[a-zA-Z0-9._-]+$/.test(releaseId)) {
		throw new Error('migrate requires legacy release root, release ID, and runtime');
	}
	const root = await realpath(PATHS.insrc);
	const baseline = await readInstallationSelector(root);
	if (baseline?.enabled === true) throw new Error('legacy migration requires an unmanaged predecessor');
	const { candidate, qualifications } = await readManagedUpdateInputs(root);
	if (baseline !== undefined && !isDeepStrictEqual(candidate, { ...baseline, enabled: true })) throw new Error('candidate differs from the staged release');
	const prior = { ...candidate, enabled: false, releaseRoot: await realpath(release), releaseId, runtime: await realpath(runtime) };
	if (prior.releaseRoot === candidate.releaseRoot) throw new Error('legacy and candidate releases require separate roots');
	const qualified = readQualifiedReleasePairs(qualifications);
	const declaredCandidate = await releaseDeclaration(candidate.releaseRoot);
	if (declaredCandidate.releaseId !== candidate.releaseId) throw new Error('candidate declaration differs from the staged release');
	const declaredPrior = qualified.find(pair => pair.prior.releaseId === prior.releaseId && pair.candidate.releaseId === candidate.releaseId)?.prior;
	if (declaredPrior === undefined) throw new Error('legacy release has no explicit qualification for the candidate');
	const compatibility = requireQualifiedReleasePair(declaredPrior, declaredCandidate, qualified);
	await verifyManagedReleaseRuntime(candidate);
	const route = await discoverLegacyLaunch(prior, baseline ?? { ...candidate, enabled: false });
	if (descriptor !== undefined && route.legacy?.job.descriptor !== await realpath(descriptor)) {
		throw new Error('legacy LaunchAgent does not match the requested descriptor');
	}
	const gate = new InstallationMutationGate(root);
	const reservation = await gate.reserve({
		kind: 'update', owner: await readDarwinIncarnation(process.pid),
		predecessor: {
			priorRelease: prior.releaseId, candidateRelease: candidate.releaseId, priorCommit: readInstalledCommit(prior.releaseRoot),
			...route, generation: null, pins: { prior, candidate }, ...(baseline === undefined ? { selectorAbsent: true } : {}),
		},
	});
	if (reservation.kind !== 'update') throw new Error('legacy migration did not reserve an update');
	const outcome = await completeLegacyMigration(gate, reservation, { prior, candidate, compatibility });
	process.stdout.write(`${outcome.decision}: ${outcome.detail}\n`);
	if (outcome.decision !== 'committed') process.exitCode = 4;
}

async function main(command: string): Promise<void> {
	if (command === 'dispatch') {
		const [root, name, ...args] = process.argv.slice(3);
		if (root === undefined || await realpath(PATHS.insrc) !== root || !['daemon-ctl.sh', 'insrc', 'insrc-mcp.js', 'insrc-daemon-install.sh'].includes(name ?? '')) {
			throw new Error('invalid managed launcher dispatch');
		}
		const state = await new InstallationMutationGate(root).read();
		const selected = await readInstallationSelector(root);
		const recovery = name === 'daemon-ctl.sh' && args[0] === 'recover';
		if (state.active !== null && !recovery) throw new Error('macOS daemon migration is in progress');
		const target = selected?.enabled ? selected : recovery && state.active?.kind === 'update' ? state.active.predecessor.pins?.candidate : undefined;
		if (target === undefined) throw new Error('macOS daemon migration is in progress');
		const executable = name === 'insrc-mcp.js' ? target.runtime : '/bin/bash';
		const entry = join(target.releaseRoot, name === 'insrc-mcp.js' ? 'out/bin' : 'scripts', name!);
		const child = spawn(executable, [entry, ...args], { env: { ...process.env, INSRC_DAEMON_ROOT: target.releaseRoot }, stdio: 'inherit' });
		process.exitCode = await new Promise<number>((resolve, reject) => {
			child.once('error', reject);
			child.once('exit', code => resolve(code ?? 4));
		});
		return;
	}
	if (command === 'prepare-legacy-upgrade') {
		const [checkout, repoUrl, branch, bootstrap] = process.argv.slice(3);
		if (process.platform !== 'darwin' || checkout === undefined) throw new Error('legacy upgrade requires a macOS checkout');
		let ownedBridge: string | undefined;
		if (bootstrap !== undefined) {
			const info = await lstat(bootstrap);
			const root = await realpath(bootstrap);
			if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0
				|| !basename(root).startsWith('insrc-upgrade-')
				|| await realpath(fileURLToPath(import.meta.url)) !== join(root, 'checkout/out/bin/insrc-daemon-control.js')) {
				throw new Error('invalid temporary upgrade bridge');
			}
			ownedBridge = root;
		}
		try {
			const outcome = await prepareLegacyUpgrade(await realpath(PATHS.insrc), checkout, { repoUrl, branch });
			process.stdout.write(`${outcome.decision}: ${outcome.detail}\n`);
			if (outcome.decision !== 'committed') process.exitCode = 4;
		} finally { if (ownedBridge !== undefined) await rm(ownedBridge, { recursive: true, force: true }); }
		return;
	}
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
	if (!['start', 'stop', 'restart', 'update', 'update-local', 'status', 'recover'].includes(command)) return legacyStop(command);

	if (command === 'recover' && process.platform === 'darwin'
		&& await access(installationPaths(PATHS.insrc).directory).then(() => true, () => false)) {
		const gate = new InstallationMutationGate(await realpath(PATHS.insrc));
		const pending = (await gate.read()).active;
		if (pending?.kind === 'start' && pending.activation !== undefined) {
			await activateFreshManagedDaemon(pending.activation);
			return;
		}
		if (pending?.kind === 'update') {
			const outcome = await recoverInstalledManagedUpdate(gate, pending.id, await readDarwinIncarnation(process.pid));
			process.stdout.write(`${outcome.decision}: ${outcome.detail}\n`);
			if (outcome.decision === 'operator-recovery' && (await gate.read()).active !== null) process.exitCode = 4;
			return;
		}
	}
	const installation = await readInstallationSelector(PATHS.insrc);
	if (installation === undefined) {
		if (process.platform === 'darwin' && await access(installationPaths(PATHS.insrc).directory).then(() => true, () => false)) {
			const active = (await new InstallationMutationGate(PATHS.insrc).read()).active;
			if (active?.kind === 'start' && active.activation !== undefined) {
				throw new Error('fresh daemon activation is in progress; retry the installer to recover');
			}
			if (active?.kind === 'update') throw new Error('legacy cutover owns the installation');
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
		await control.recoverStoppedLifecycle();
		process.stdout.write('verified stopped lifecycle reservation recovered\n');
		return;
	}
	if (command === 'update' || command === 'update-local') {
		const preparation = await admitManagedPreparation(installation.stateRoot);
		if (command === 'update' && preparation.state === 'running') {
			process.stdout.write(JSON.stringify(await rpc('daemon.update', {}, undefined, { timeoutMs: 20_000 })) + '\n');
		} else {
			const { prior, gate, reserve } = preparation;
			const outcome = await runManagedPreparation(gate, await reserve(), prior,
				{ repoUrl: process.env['INSRC_DAEMON_UPDATE_REPO_URL'], branch: process.env['INSRC_DAEMON_UPDATE_BRANCH'] });
			process.stdout.write(`${outcome.decision}: ${outcome.detail}\n`);
			if (outcome.decision !== 'committed') process.exitCode = 4;
		}
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
