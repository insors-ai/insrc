/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { dirname, isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { matchesDarwinPeer, observeDarwinExit, readDarwinIncarnation, readDarwinLaunchContext, readDarwinPeerCredentials, verifyDarwinJobProcess } from '../shared/darwin-lifecycle.js';
import { runFileIdentity, sameRunFile } from '../shared/daemon-run-files.js';
import type { LegacyLaunchPin, UpdatePredecessor } from '../shared/installation-mutation-gate.js';
import { rpc } from '../shared/ipc-client.js';
import { inspectPinnedLaunchJob, installationPaths, launchctl, requireQuiescentInstallation, supervisorJob } from '../shared/managed-daemon-installation.js';
import type { ManagedInstallation } from '../shared/managed-daemon-installation.js';

type Legacy = NonNullable<UpdatePredecessor['legacy']>;
const exec = promisify(execFile);
const PASSIVE_KEYS = new Set([
	'Label', 'Program', 'ProgramArguments', 'WorkingDirectory', 'EnvironmentVariables',
	'RunAtLoad', 'KeepAlive', 'StandardOutPath', 'StandardErrorPath', 'ExitTimeOut', 'ProcessType',
]);

async function descriptorBytes(path: string): Promise<Buffer> {
	const info = await lstat(path);
	if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || (info.mode & 0o022) !== 0 || info.size > 16_384) {
		throw new Error('legacy LaunchAgent descriptor is not a bounded owned file');
	}
	return readFile(path);
}

function hash(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

/** Build the private rollback descriptor without invoking the archived shell launcher. */
export async function guardedLegacyShellJob(
	legacy: Legacy, prior: ManagedInstallation, archive: string, preload: string, destination: string,
): Promise<{ job: typeof legacy.job; bytes: Buffer; descriptorHash: string }> {
	const { job } = legacy;
	const original = join(prior.releaseRoot, 'scripts/daemon-ctl.sh');
	if (job.label !== 'ai.insors.daemon' || job.program !== '/bin/bash' || job.args.length !== 3
		|| job.args[0] !== '/bin/bash' || job.args[1] !== '-c'
		|| (job.args[2] !== `${original} start`
			&& !(prior.releaseRoot === join(prior.stateRoot, 'daemon') && job.args[2] === '~/.insrc/daemon/scripts/daemon-ctl.sh start'))
		|| archive === prior.releaseRoot || ![archive, preload, destination].every(isAbsolute)) {
		throw new Error('legacy shell launch job does not match the guarded rollback profile');
	}
	const originalBytes = await descriptorBytes(job.descriptor);
	if (hash(originalBytes) !== legacy.descriptorHash) throw new Error('saved legacy LaunchAgent descriptor changed');
	const { stdout } = await exec('/usr/bin/plutil', ['-convert', 'json', '-o', '-', job.descriptor], {
		encoding: 'utf8', timeout: 2_000, maxBuffer: 32_768,
	});
	if (hash(await descriptorBytes(job.descriptor)) !== legacy.descriptorHash) throw new Error('saved legacy LaunchAgent descriptor changed');
	const source = JSON.parse(stdout) as Record<string, unknown>;
	const args = [prior.runtime, '--import', preload, '--import', 'tsx/esm', join(archive, 'out/daemon/index.js')];
	const environment = new Map<string, string>([['HOME', dirname(prior.stateRoot)], ['PATH', prior.pathEnv]]);
	const inherited = source['EnvironmentVariables'];
	if (inherited !== undefined) {
		if (inherited === null || typeof inherited !== 'object' || Array.isArray(inherited)) {
			throw new Error('legacy shell launch job environment is unsupported');
		}
		for (const [key, value] of Object.entries(inherited)) {
			if (key === 'NODE_OPTIONS' || key === 'NODE_PATH') continue;
			if (!['HOME', 'PATH', 'INSRC_DAEMON_ROOT', 'INSRC_MODE', 'INSRC_LOG_LEVEL'].includes(key)
				|| typeof value !== 'string' || /[\u0000-\u001f]/.test(value)) throw new Error('legacy shell launch job environment is unsupported');
			environment.set(key, value);
		}
	}
	environment.set('INSRC_DAEMON_ROOT', prior.releaseRoot);
	environment.set('INSRC_MODE', 'daemon');
	if (environment.get('HOME') !== dirname(prior.stateRoot)) throw new Error('legacy shell launch job belongs to another state root');
	const text = (value: string) => '<string>' + value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') + '</string>';
	const field = (key: string, value: string) => '<key>' + key + '</key>' + value;
	const env = [...environment].map(([key, value]) => field(key, text(value))).join('');
	const ancillary = ['StandardOutPath', 'StandardErrorPath', 'ProcessType', 'ExitTimeOut'].map(key => {
		const value = source[key];
		if (value === undefined) return '';
		if (key === 'ExitTimeOut' && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
			return field(key, `<integer>${value}</integer>`);
		}
		if (typeof value !== 'string' || key === 'ExitTimeOut') throw new Error('legacy shell launch job policy is unsupported');
		return field(key, text(value));
	}).join('');
	const bytes = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict>'
		+ field('Label', text(job.label)) + field('ProgramArguments', '<array>' + args.map(text).join('') + '</array>')
		+ field('WorkingDirectory', text(archive)) + field('RunAtLoad', legacy.runAtLoad ? '<true/>' : '<false/>')
		+ field('KeepAlive', '<false/>') + field('EnvironmentVariables', '<dict>' + env + '</dict>') + ancillary + '</dict></plist>\n');
	return { job: { ...job, program: prior.runtime, args, workingDirectory: archive, descriptor: destination },
		bytes, descriptorHash: hash(bytes) };
}

/** A supported legacy LaunchAgent has no trigger or automatic restart policy. */
export async function pinLegacyLaunchJob(
	prior: ManagedInstallation, baseline: ManagedInstallation, descriptorPath: string,
): Promise<Legacy> {
	const descriptor = await realpath(descriptorPath);
	const before = await descriptorBytes(descriptor);
	const { stdout } = await exec('/usr/bin/plutil', ['-convert', 'json', '-o', '-', descriptor], {
		encoding: 'utf8', timeout: 2_000, maxBuffer: 32_768,
	});
	const plist = JSON.parse(stdout) as Record<string, unknown>;
	const args = plist['ProgramArguments'];
	const uid = process.getuid?.();
	const label = plist['Label'];
	const cwd = plist['WorkingDirectory'];
	if (uid === undefined || uid <= 0 || typeof label !== 'string' || label === supervisorJob(baseline).label
		|| !Array.isArray(args) || typeof args[0] !== 'string' || !args[0].startsWith('/')
		|| args.some(arg => typeof arg !== 'string' || /[\r\n\0]/.test(arg))
		|| (plist['Program'] !== undefined && plist['Program'] !== args[0])
		|| (cwd !== undefined && (typeof cwd !== 'string' || cwd !== prior.releaseRoot))
		|| (plist['KeepAlive'] !== undefined && plist['KeepAlive'] !== false)
		|| (plist['RunAtLoad'] !== undefined && plist['RunAtLoad'] !== false && plist['RunAtLoad'] !== true)
		|| Object.keys(plist).some(key => !PASSIVE_KEYS.has(key))
		|| hash(await descriptorBytes(descriptor)) !== hash(before)) {
		throw new Error('legacy LaunchAgent has an unsupported or changing restart policy or descriptor');
	}
	return {
		baseline, entry: join(prior.releaseRoot, 'out/daemon/index.js'), descriptorHash: hash(before),
		runAtLoad: plist['RunAtLoad'] === true,
		job: { uid, label, descriptor, program: args[0], args, ...(typeof cwd === 'string' ? { workingDirectory: cwd } : {}) },
	};
}

async function verifyDescriptor(legacy: Legacy): Promise<void> {
	if (hash(await descriptorBytes(legacy.job.descriptor)) !== legacy.descriptorHash) throw new Error('saved legacy LaunchAgent descriptor changed');
}

export async function inspectLegacyJob(legacy: Legacy) {
	await verifyDescriptor(legacy);
	return inspectPinnedLaunchJob({ ...legacy.job, runAtLoad: legacy.runAtLoad });
}

export function matchesInstalledDaemonArguments(argv: readonly string[], runtime: string, entry: string): boolean {
	if (argv[0] !== runtime && argv[0] !== 'node') return false;
	return (argv.length === 2 && argv[1] === entry)
		|| (argv.length === 4 && argv[1] === '--import' && argv[2] === 'tsx/esm' && argv[3] === entry);
}

/** The daemon must already have completed its cooperative drain. */
export async function removeLegacyJob(legacy: Legacy, authorize: () => Promise<void>): Promise<void> {
	const registered = await inspectLegacyJob(legacy);
	if (registered === undefined) throw new Error('legacy LaunchAgent registration disappeared');
	const target = registered.pid === null ? undefined : await readDarwinIncarnation(registered.pid);
	const observer = target === undefined ? undefined : await observeDarwinExit(target, 10_000);
	try {
		await authorize();
		if (target !== undefined) await verifyDarwinJobProcess({ ...legacy.job, runAtLoad: legacy.runAtLoad }, target);
		else if ((await inspectLegacyJob(legacy))?.pid !== null) throw new Error('legacy LaunchAgent changed before removal');
		try { await launchctl(['bootout', registered.target]); } catch { /* Resolve lost acknowledgement using the exact job. */ }
		if (observer !== undefined && !await observer.exited) throw new Error('legacy LaunchAgent process exit is unconfirmed');
		if (await inspectLegacyJob(legacy) !== undefined) throw new Error('legacy LaunchAgent removal is unconfirmed');
	} finally { await observer?.close(); }
}

export async function verifyLegacyService(legacy: Legacy, prior: ManagedInstallation, wasRunning: boolean): Promise<void> {
	const registered = await inspectLegacyJob(legacy);
	if (registered === undefined) throw new Error('saved legacy LaunchAgent is not registered');
	if (!wasRunning) {
		if (registered.pid !== null) throw new Error('previously stopped legacy LaunchAgent is running');
		await requireQuiescentInstallation(prior);
		return;
	}
	const target = await verifyLegacyDaemonReady(prior, legacy.entry);
	if (registered.pid !== null && registered.pid !== target.pid) throw new Error('legacy registration and daemon readiness name different processes');
}

async function verifyLegacyDaemonReady(prior: ManagedInstallation, entry: string, argv?: readonly string[]) {
	const paths = installationPaths(prior.stateRoot);
	const publication = runFileIdentity(paths.daemonSocket);
	const pidPublication = runFileIdentity(paths.daemonPid);
	if (publication === undefined || pidPublication === undefined) throw new Error('legacy daemon readiness is unpublished');
	const pidInfo = await lstat(paths.daemonPid);
	if (!pidInfo.isFile() || pidInfo.size > 32 || pidInfo.uid !== process.getuid?.()) throw new Error('legacy PID publication is invalid');
	const text = (await readFile(paths.daemonPid, 'utf8')).trim();
	if (!/^\d+$/.test(text)) throw new Error('legacy PID publication is invalid');
	const target = await readDarwinIncarnation(Number(text));
	const context = await readDarwinLaunchContext(target.pid);
	if (target.uid !== process.getuid?.() || await realpath(target.executable) !== prior.runtime
		|| context.cwd !== prior.releaseRoot || !matchesInstalledDaemonArguments(context.argv, prior.runtime, entry)
		|| (argv !== undefined && (argv.length !== context.argv.length || argv.slice(1).some((arg, index) => arg !== context.argv[index + 1])))) {
		throw new Error('legacy daemon readiness belongs to a different release');
	}
	type Peer = Awaited<ReturnType<typeof readDarwinPeerCredentials>>;
	let resolve!: (value: Peer) => void;
	let reject!: (error: unknown) => void;
	const peer = new Promise<Peer>((done, fail) => { resolve = done; reject = fail; });
	const status = rpc('daemon.status', {}, () => {
		const socket = createConnection(paths.daemonSocket);
		const closed = () => reject(new Error('legacy readiness socket closed before connecting'));
		socket.once('close', closed);
		socket.once('error', reject);
		socket.once('connect', () => {
			socket.removeListener('close', closed);
			const fd = (socket as Socket & { _handle?: { fd?: number } })._handle?.fd;
			if (fd === undefined) reject(new Error('legacy readiness socket has no peer descriptor'));
			else void readDarwinPeerCredentials(fd).then(resolve, reject);
		});
		return socket;
	}, { timeoutMs: 2_000 });
	const [answer, credentials] = await Promise.all([status, peer]);
	const observed = await readDarwinIncarnation(target.pid);
	const current = runFileIdentity(paths.daemonSocket);
	const currentPid = runFileIdentity(paths.daemonPid);
	if (answer === null || typeof answer !== 'object' || !matchesDarwinPeer(credentials, observed, target)
		|| current === undefined || !sameRunFile(current, publication)
		|| currentPid === undefined || !sameRunFile(currentPid, pidPublication)) {
		throw new Error('legacy daemon readiness does not match the saved release');
	}
	return target;
}

export async function restoreLegacyService(legacy: Legacy, prior: ManagedInstallation, wasRunning: boolean, authorize: () => Promise<void>): Promise<void> {
	let job = await inspectLegacyJob(legacy);
	const bootstrapped = job === undefined;
	if (job === undefined) {
		await requireQuiescentInstallation(prior);
		await authorize();
		await verifyDescriptor(legacy);
		try { await launchctl(['bootstrap', `gui/${legacy.job.uid}`, legacy.job.descriptor]); }
		catch { /* An existing exact registration can still be verified. */ }
		const until = performance.now() + 4_000;
		for (;;) {
			try { job = await inspectLegacyJob(legacy); }
			catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'launch-job-starting') throw error;
			}
			if (job !== undefined) break;
			if (performance.now() >= until) throw new Error('saved legacy LaunchAgent was not restored');
			await delay(100);
		}
	}
	if (wasRunning && job.pid === null && (!bootstrapped || !legacy.runAtLoad)) {
		const paths = installationPaths(prior.stateRoot);
		if (runFileIdentity(paths.daemonPid) === undefined && runFileIdentity(paths.daemonSocket) === undefined) {
			await requireQuiescentInstallation(prior);
			await authorize();
			if ((await inspectLegacyJob(legacy))?.pid === null) await launchctl(['kickstart', job.target]);
		}
	}
	const deadline = performance.now() + (wasRunning ? 60_000 : 0);
	for (;;) {
		try { await verifyLegacyService(legacy, prior, wasRunning); return; }
		catch (error) {
			if (performance.now() >= deadline) throw error;
			await delay(200);
		}
	}
}

/** Restore a direct process with its qualified installed command and pinned working directory. */
export function verifyDirectLegacyService(prior: ManagedInstallation, launch: Exclude<LegacyLaunchPin, { kind: 'stopped' }>) {
	return verifyLegacyDaemonReady(prior, join(prior.releaseRoot, 'out/daemon/index.js'), launch.argv);
}

export async function restoreDirectLegacyService(prior: ManagedInstallation,
	launch: Exclude<LegacyLaunchPin, { kind: 'stopped' }>, authorize: () => Promise<void>,
): Promise<void> {
	const entry = join(prior.releaseRoot, 'out/daemon/index.js');
	if (launch.kind !== 'direct' || launch.cwd !== prior.releaseRoot || !matchesInstalledDaemonArguments(launch.argv, prior.runtime, entry)
		|| await realpath(launch.cwd) !== launch.cwd) throw new Error('direct rollback recipe changed');
	const ready = () => verifyDirectLegacyService(prior, launch);
	if (await ready().then(() => true, () => false)) return;
	let spawnedPid: number | undefined;
	// A prior rollback may have spawned the child just before the controller died.
	// In that case wait for its exact readiness instead of issuing a second spawn.
	if (await requireQuiescentInstallation(prior).then(() => true, () => false)) {
		await authorize();
		await requireQuiescentInstallation(prior);
		const env: NodeJS.ProcessEnv = { ...process.env, INSRC_MODE: 'daemon', INSRC_DAEMON_ROOT: prior.releaseRoot,
			HOME: join(prior.stateRoot, '..'), PATH: prior.pathEnv };
		delete env['INSRC_SUPERVISOR_GENERATION'];
		delete env['INSRC_PROBATION_UPDATE'];
		delete env['INSRC_PROBATION_RELEASE'];
		const child = spawn(prior.runtime, launch.argv.slice(1), { cwd: launch.cwd, env, detached: true, stdio: 'ignore' });
		await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
		spawnedPid = child.pid;
		child.unref();
	}
	const deadline = performance.now() + 60_000;
	for (;;) {
		try {
			const target = await ready();
			if (spawnedPid !== undefined && spawnedPid !== target.pid) throw new Error('direct rollback readiness belongs to another process');
			return;
		} catch (error) {
			if (performance.now() >= deadline) throw error;
			await delay(200);
		}
	}
}
