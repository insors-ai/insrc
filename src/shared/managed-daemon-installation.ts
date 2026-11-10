/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdir, open, readFile, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { dirname, isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { isDeepStrictEqual } from 'node:util';
import { darwinLaunchLabel, matchesDarwinPeer, observeDarwinExit, readDarwinIncarnation, verifyDarwinJobProcess, verifyDarwinLaunchJob } from './darwin-lifecycle.js';
import type { DarwinIncarnation, DarwinLaunchJob, VerifiedDarwinLaunchJob } from './darwin-lifecycle.js';
import { PATHS } from './paths.js';
import { SupervisorLifecycleError } from './daemon-supervisor-protocol.js';
import { runFileIdentity, sameRunFile } from './daemon-run-files.js';

const exec = promisify(execFile);
const MANIFEST = 'installation.json';
const DIRECTORY = 'managed-lifecycle';

export interface ManagedInstallation {
	readonly version: 1;
	readonly stateRoot: string;
	readonly releaseRoot: string;
	readonly releaseId: string;
	readonly runtime: string;
	readonly pathEnv: string;
	readonly enabled: boolean;
}

export interface RegisteredManagedJob extends VerifiedDarwinLaunchJob {
	readonly incarnation?: DarwinIncarnation;
}

export function installationPaths(root: string) {
	const directory = join(root, DIRECTORY);
	return {
		directory, manifest: join(directory, MANIFEST), socket: join(directory, 'control.sock'),
		descriptor: join(directory, 'supervisor.plist'),
		daemonPid: join(root, 'daemon.pid'), daemonSocket: join(root, 'daemon.sock'),
		runGuard: join(root, 'daemon.run-files.guard'), updateLock: join(root, 'daemon.update.lock'),
	};
}

function uid(): number {
	const result = process.getuid?.();
	if (process.platform !== 'darwin' || !result) throw new Error('managed installation requires an unprivileged macOS user');
	return result;
}

function failure(message: string): never {
	throw new SupervisorLifecycleError('ownership-conflict', message);
}

async function exists(path: string): Promise<boolean> {
	try { await lstat(path); return true; }
	catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

async function privateFile(path: string): Promise<void> {
	const info = await lstat(path);
	if (!info.isFile() || info.uid !== uid() || info.nlink !== 1 || (info.mode & 0o077) !== 0 || info.size > 8192) {
		failure('managed installation file is not private and owned');
	}
}

async function privateDirectory(path: string): Promise<void> {
	const info = await lstat(path);
	if (!info.isDirectory() || info.uid !== uid() || (info.mode & 0o077) !== 0) {
		failure('managed installation directory is not private and owned');
	}
}

async function parseInstallation(path: string, root: string): Promise<ManagedInstallation> {
	await privateFile(path);
	const value = JSON.parse(await readFile(path, 'utf8')) as Partial<ManagedInstallation>;
	if (value === null || value.version !== 1 || value.stateRoot !== root || typeof value.enabled !== 'boolean'
		|| typeof value.releaseRoot !== 'string' || !isAbsolute(value.releaseRoot)
		|| typeof value.runtime !== 'string' || !isAbsolute(value.runtime)
		|| typeof value.pathEnv !== 'string' || /[\r\n\0]/.test(value.pathEnv)
		|| typeof value.releaseId !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(value.releaseId)
		|| await realpath(root) !== root || await realpath(value.releaseRoot) !== value.releaseRoot
		|| await realpath(value.runtime) !== value.runtime) failure('managed installation does not match its canonical root or pinned release');
	return value as ManagedInstallation;
}

/** The rollout is selected only by an enabled descriptor for this exact installation. */
export async function readManagedInstallation(root = PATHS.insrc): Promise<ManagedInstallation | undefined> {
	const installation = await readInstallationSelector(root);
	return installation?.enabled ? installation : undefined;
}

export async function readInstallationSelector(root: string): Promise<ManagedInstallation | undefined> {
	if (process.platform !== 'darwin') return undefined;
	const paths = installationPaths(root);
	if (!await exists(paths.manifest)) return undefined;
	await privateDirectory(paths.directory);
	return parseInstallation(paths.manifest, root);
}

/** Deployment stages these inputs outside either mutable installation selector. */
export async function readManagedUpdateInputs(root: string): Promise<{ candidate: ManagedInstallation; qualifications: unknown }> {
	const { directory } = installationPaths(root);
	await privateDirectory(directory);
	const candidate = await parseInstallation(join(directory, 'update-candidate.json'), root);
	const path = join(directory, 'update-qualifications.json');
	await privateFile(path);
	return { candidate, qualifications: JSON.parse(await readFile(path, 'utf8')) as unknown };
}

export async function verifyManagedReleaseRuntime(installation: ManagedInstallation): Promise<void> {
	const job = supervisorJob(installation);
	await access(installation.runtime, constants.X_OK);
	for (const file of [installation.runtime, job.args[1]!, join(installation.releaseRoot, 'out/daemon/index.js')]) {
		await access(file, constants.R_OK);
		if (!(await lstat(file)).isFile()) failure('pinned release runtime file is unavailable');
	}
}

export function supervisorJob(installation: ManagedInstallation): DarwinLaunchJob {
	const paths = installationPaths(installation.stateRoot);
	return {
		uid: uid(), label: darwinLaunchLabel(installation.stateRoot, uid()),
		descriptor: paths.descriptor, program: installation.runtime,
		args: [installation.runtime, join(installation.releaseRoot, 'out/bin/insrc-daemon-supervisor.js'), installation.stateRoot],
	};
}

export async function launchctl(args: readonly string[]): Promise<string> {
	const { stdout } = await exec('/bin/launchctl', [...args], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
	return stdout;
}

export async function inspectManagedJob(installation: ManagedInstallation): Promise<VerifiedDarwinLaunchJob | undefined> {
	return inspectPinnedLaunchJob(supervisorJob(installation));
}

export async function inspectPinnedLaunchJob(job: DarwinLaunchJob): Promise<VerifiedDarwinLaunchJob | undefined> {
	try { return await verifyDarwinLaunchJob(job, target => launchctl(['print', target])); }
	catch (error) {
		const missing = error as { code?: number; stderr?: string };
		if (missing.code === 113 && missing.stderr?.includes(`Could not find service "${job.label}" in domain for user gui: ${job.uid}`)) {
			return undefined;
		}
		throw error;
	}
}

/** A legacy predecessor must be stopped by its owner before managed cutover. */
export async function requireQuiescentInstallation(installation: ManagedInstallation): Promise<void> {
	const paths = installationPaths(installation.stateRoot);
	for (const path of [paths.daemonPid, paths.daemonSocket, paths.runGuard, paths.updateLock]) {
		if (await exists(path)) failure(`installation is not quiescent: ${path}`);
	}
	const { stdout } = await exec('/bin/ps', ['-axww', '-o', 'command='], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
	const entries = [installation.releaseRoot, process.env['INSRC_DAEMON_ROOT'] ?? join(installation.stateRoot, 'daemon')]
		.map(root => join(root, 'out/daemon/index.js'));
	if (stdout.split('\n').some(line => line.trim().split(/\s+/)[0]?.includes('node') && entries.some(entry => line.includes(entry)))) {
		failure('a process still runs the installed legacy daemon entry');
	}
}

function xml(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function descriptor(job: DarwinLaunchJob, installation: ManagedInstallation): string {
	const args = job.args.map(arg => `<string>${xml(arg)}</string>`).join('');
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xml(job.label)}</string>
<key>ProgramArguments</key><array>${args}</array>
<key>WorkingDirectory</key><string>${xml(installation.releaseRoot)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(installation.pathEnv)}</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><false/>
<key>StandardOutPath</key><string>${xml(join(installationPaths(installation.stateRoot).directory, 'supervisor.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(installationPaths(installation.stateRoot).directory, 'supervisor.log'))}</string>
</dict></plist>
`;
}

/** A crash between the two atomic selector writes can leave either pinned file on either side. */
export async function verifyManagedSelectorFiles(first: ManagedInstallation, second = first): Promise<void> {
	const paths = installationPaths(first.stateRoot);
	if (first.stateRoot !== second.stateRoot) failure('selector pins refer to different installations');
	await privateDirectory(paths.directory);
	await privateFile(paths.descriptor);
	const selected = await parseInstallation(paths.manifest, first.stateRoot);
	const contents = await readFile(paths.descriptor, 'utf8');
	const allowed = [first, second];
	if (!allowed.some(pin => isDeepStrictEqual(pin, selected))
		|| !allowed.some(pin => contents === descriptor(supervisorJob(pin), pin))) {
		failure('installation selector or descriptor is outside the pinned releases');
	}
}

async function publishPrivateFile(path: string, contents: string): Promise<void> {
	const temporary = `${path}.${randomUUID()}`;
	try {
		const file = await open(temporary, 'wx', 0o600);
		try { await file.writeFile(contents); await file.sync(); } finally { await file.close(); }
		await rename(temporary, path);
		const directory = await open(dirname(path), 'r');
		try { await directory.sync(); } finally { await directory.close(); }
	} finally {
		await rm(temporary, { force: true });
	}
}

/** Replace the selector only while a durable transaction fences ordinary lifecycle operations. */
export async function publishManagedSelector(installation: ManagedInstallation, revalidate: () => Promise<void>): Promise<void> {
	const paths = installationPaths(installation.stateRoot);
	await privateDirectory(paths.directory);
	await privateFile(paths.descriptor);
	await privateFile(paths.manifest);
	await revalidate();
	await publishPrivateFile(paths.descriptor, descriptor(supervisorJob(installation), installation));
	await revalidate();
	await publishPrivateFile(paths.manifest, JSON.stringify(installation) + '\n');
	await verifyManagedSelectorFiles(installation);
}

/** Unload the pinned job after its child has exited and retain exact proof of the job's own exit. */
export async function removeManagedJob(
	installation: ManagedInstallation, revalidate: () => Promise<void>, expected?: DarwinIncarnation,
): Promise<{
	job: VerifiedDarwinLaunchJob;
	startedAt: string | null;
} | undefined> {
	const job = await inspectManagedJob(installation);
	if (job === undefined) return;
	const socket = installationPaths(installation.stateRoot).socket;
	const priorSocket = await lstat(socket).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== 'ENOENT') throw error;
	});
	const socketIdentity = runFileIdentity(socket);
	if (priorSocket !== undefined && (!priorSocket.isSocket() || priorSocket.uid !== uid())) failure('unexpected supervisor socket');
	if (job.pid === null && priorSocket !== undefined) failure('inactive job has an unverifiable socket');
	const target = job.pid === null ? undefined : await readDarwinIncarnation(job.pid);
	if (expected !== undefined && (target === undefined || !matchesDarwinPeer(target, target, expected))) {
		failure('registered supervisor no longer matches its recorded incarnation');
	}
	const observer = target === undefined ? undefined : await observeDarwinExit(target, 10_000);
	try {
		await revalidate();
		if (target !== undefined) await verifyDarwinJobProcess(supervisorJob(installation), target);
		else if ((await inspectManagedJob(installation))?.pid !== null) failure('inactive job changed before removal');
		try { await launchctl(['bootout', job.target]); }
		catch { /* Verify removal and exact exit even if launchctl lost its acknowledgement. */ }
		if (observer !== undefined && !await observer.exited) failure('supervisor exit is unconfirmed');
		if (await inspectManagedJob(installation) !== undefined) failure('supervisor job removal is unconfirmed');
		if (priorSocket !== undefined) {
			const current = runFileIdentity(socket);
			if (current !== undefined) {
				if (socketIdentity === undefined || !sameRunFile(current, socketIdentity)) failure('supervisor socket changed during unload');
				await revalidate();
				await verifyNoSupervisorListener(socket);
				const after = runFileIdentity(socket);
				if (after === undefined || !sameRunFile(after, current)) failure('supervisor socket changed during stale-listener check');
				await unlink(socket);
			}
		}
	} finally { await observer?.close(); }
	return { job, startedAt: target?.startedAt ?? null };
}

async function verifyNoSupervisorListener(path: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const socket = createConnection(path);
		socket.setTimeout(2_000, () => socket.destroy(new Error('supervisor listener check timed out')));
		socket.once('connect', () => { socket.destroy(); reject(new Error('supervisor socket still has a listener')); });
		socket.once('error', (error: NodeJS.ErrnoException) => {
			if (error.code === 'ECONNREFUSED') resolve();
			else reject(error);
		});
	});
}

/** Stage a private launch descriptor. The supported rollout must explicitly enable it later. */
export async function stageManagedInstallation(
	installation: ManagedInstallation, revalidate: () => Promise<void>, legacyCutover = false,
): Promise<void> {
	if (installation.enabled) failure('staging cannot enable installed rollout');
	const paths = installationPaths(installation.stateRoot);
	const job = supervisorJob(installation);
	if (!legacyCutover) await requireQuiescentInstallation(installation);
	if (await inspectManagedJob(installation) !== undefined) failure('a launch job is already registered for this installation');
	await access(installation.runtime, constants.X_OK);
	await access(job.args[1]!, constants.R_OK);
	await mkdir(paths.directory, { mode: 0o700, recursive: true });
	await privateDirectory(paths.directory);
	await revalidate();
	await writeFile(paths.descriptor, descriptor(job, installation), { flag: 'wx', mode: 0o600 });
	await writeFile(paths.manifest, JSON.stringify(installation) + '\n', { flag: 'wx', mode: 0o600 });
}

export async function ensureManagedJob(
	installation: ManagedInstallation,
	revalidate: () => Promise<void>,
	journal: { intent(detail: string): Promise<void>; receipt(detail: string): Promise<void> },
): Promise<void> {
	const current = await inspectManagedJob(installation);
	if (current?.pid != null) return;
	await requireQuiescentInstallation(installation);
	const job = supervisorJob(installation);
	if (current === undefined) {
		await journal.intent(`register ${job.label}`);
		const admitted = await registerManagedJob(installation, revalidate);
		if (admitted === undefined) failure('launch job registration is unconfirmed');
		await journal.receipt(admitted.target);
		return;
	} else {
		await journal.intent(`start ${current.target}`);
		await revalidate();
		await launchctl(['kickstart', current.target]);
	}
	const verified = await inspectManagedJob(installation);
	if (verified === undefined) failure('launch job registration is unconfirmed');
	await journal.receipt(verified.target);
}

/** A failed bootstrap may still have registered this job. Resolve its pinned identity within a bounded window. */
export async function registerManagedJob(
	installation: ManagedInstallation, revalidate: () => Promise<void>,
): Promise<RegisteredManagedJob | undefined> {
	const job = supervisorJob(installation);
	await privateFile(job.descriptor);
	if (await readFile(job.descriptor, 'utf8') !== descriptor(job, installation)) failure('staged launch descriptor changed');
	if (await inspectManagedJob(installation) !== undefined) failure('a job already occupies the requested launch label');
	await revalidate();
	try { await launchctl(['bootstrap', `gui/${job.uid}`, job.descriptor]); }
	catch { /* Inspect registration even when launchctl did not confirm bootstrap. */ }
	const deadline = performance.now() + 4_000;
	for (;;) {
		try {
			const result = await inspectManagedJob(installation);
			if (result?.pid != null) {
				const incarnation = await readDarwinIncarnation(result.pid);
				return { ...await verifyDarwinJobProcess(job, incarnation), incarnation };
			}
			if (performance.now() >= deadline) return result;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'launch-job-starting' || performance.now() >= deadline) throw error;
		}
		await delay(100);
	}
}
