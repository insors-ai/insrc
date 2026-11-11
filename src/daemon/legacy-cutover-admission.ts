/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import {
	matchesDarwinPeer, readDarwinIncarnation, readDarwinLaunchContext, readDarwinPeerCredentials, readDarwinWorkingDirectory, swapDarwinDirectories,
} from '../shared/darwin-lifecycle.js';
import type { DarwinIncarnation } from '../shared/darwin-lifecycle.js';
import { runFileIdentity, sameRunFile } from '../shared/daemon-run-files.js';
import type { InstallationMutationGate, MutationReservation, UpdatePredecessor } from '../shared/installation-mutation-gate.js';
import { installationPaths, launchctl, requireQuiescentInstallation } from '../shared/managed-daemon-installation.js';
import type { ManagedInstallation } from '../shared/managed-daemon-installation.js';
import { inspectLegacyJob, matchesInstalledDaemonArguments, pinLegacyLaunchJob } from './legacy-launch-job.js';

const exec = promisify(execFile);
const MANAGED_ENTRY = 'out/daemon/index.js';
const BLOCKED = '#!/bin/sh\nprintf "%s\\n" "macOS daemon migration is in progress" >&2\nexit 4\n';
const LEGACY_LABELS = ['ai.insors.daemon', 'com.insors.insrc.recovery'];
type Gate = Pick<InstallationMutationGate, 'admit' | 'recordIntent' | 'recordReceipt'>;
type Route = Pick<UpdatePredecessor, 'launch' | 'legacy' | 'wasRunning'>;

function inside(root: string, path: string): boolean {
	const child = relative(root, path);
	return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function fail(message: string): never { throw new Error(`legacy cutover refused: ${message}`); }

async function registeredLegacyJobs(prior: ManagedInstallation, baseline: ManagedInstallation, labels: readonly string[], pid?: number) {
	const rows = (await launchctl(['list'])).split('\n').slice(1);
	const jobs: NonNullable<UpdatePredecessor['legacy']>[] = [];
	const listed = rows.flatMap(line => {
		const [jobPid, , label] = line.trim().split(/\s+/, 3);
		return label === undefined ? [] : [{ label, ownsProcess: pid !== undefined && Number(jobPid) === pid }];
	});
	for (let first = 0; first < listed.length; first += 12) {
		const batch = await Promise.all(listed.slice(first, first + 12).map(async item => ({
			...item, registration: await readJobRegistration(item.label),
		})));
		for (const { label, ownsProcess, registration } of batch) {
			if (ownsProcess && !labels.includes(label)) fail('live daemon belongs to an unsupported launch job');
			if (registration === undefined) {
				if (ownsProcess) fail('live daemon launch job disappeared');
				continue;
			}
			const defaultRoot = prior.releaseRoot === join(prior.stateRoot, 'daemon');
			const relevant = ownsProcess || registration.commands.some(arg => arg.includes(`${prior.releaseRoot}/`) || arg === prior.releaseRoot
				|| (defaultRoot && /(?:~|\$HOME)\/\.insrc\/daemon\//.test(arg)));
			if (!relevant) continue;
			if (!labels.includes(label)) fail('foreign launch job targets the legacy installation');
			if (registration.descriptor === undefined) fail('legacy job has no canonical descriptor');
			const legacy = await pinLegacyLaunchJob(prior, baseline, registration.descriptor);
			if (legacy.job.label !== label || !supportedJob(legacy, prior)) fail('legacy launch recipe is unsupported');
			jobs.push(legacy);
		}
	}
	if (jobs.length > 1) fail('more than one legacy launch job can own the installation');
	return jobs[0];
}

async function readJobRegistration(label: string) {
	const uid = process.getuid?.();
	if (uid === undefined || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label)) fail('invalid registered launch job identity');
	let rows: string[];
	try { rows = (await launchctl(['print', `gui/${uid}/${label}`])).split('\n'); }
	catch (error) {
		const missing = error as { code?: number; stderr?: string };
		if (missing.code === 113 && missing.stderr?.includes(`Could not find service "${label}" in domain for user gui: ${uid}`)) return undefined;
		throw error;
	}
	const paths = rows.filter(line => line.startsWith('\tpath = ')).map(line => line.slice('\tpath = '.length));
	const path = paths[0];
	const descriptor = paths.length === 1 && path !== undefined && isAbsolute(path) ? path : undefined;
	const start = rows.indexOf('\targuments = {');
	const end = rows.indexOf('\t}', start + 1);
	const commands = rows.flatMap(line => {
		const match = /^\t(?:program|working directory) = (.*)$/.exec(line);
		return match?.[1] === undefined ? [] : [match[1]];
	});
	if (start >= 0 && end > start) commands.push(...rows.slice(start + 1, end).map(line => line.trim()));
	return { descriptor, commands };
}

function supportedJob(legacy: NonNullable<UpdatePredecessor['legacy']>, prior: ManagedInstallation): boolean {
	const args = legacy.job.args;
	if (matchesInstalledDaemonArguments(args, prior.runtime, legacy.entry)) return legacy.job.workingDirectory === prior.releaseRoot;
	const script = join(prior.releaseRoot, 'scripts/daemon-ctl.sh');
	return legacy.job.label === 'ai.insors.daemon' && args.length === 3 && args[0] === '/bin/bash' && args[1] === '-c'
		&& (args[2] === `${script} start`
			|| (prior.releaseRoot === join(prior.stateRoot, 'daemon') && args[2] === '~/.insrc/daemon/scripts/daemon-ctl.sh start'));
}

/** Identify the exact legacy route from owned publications and the user's GUI launch domain. */
export async function discoverLegacyLaunch(
	prior: ManagedInstallation, baseline: ManagedInstallation, deps: { helper?: string; labels?: readonly string[] } = {},
): Promise<Route> {
	const { helper, labels = LEGACY_LABELS } = deps;
	if (prior.enabled || baseline.enabled || prior.stateRoot !== baseline.stateRoot || await realpath(prior.releaseRoot) !== prior.releaseRoot) {
		fail('legacy and candidate pins do not describe the same canonical state root');
	}
	const paths = installationPaths(prior.stateRoot);
	const pidFile = runFileIdentity(paths.daemonPid);
	const socketFile = runFileIdentity(paths.daemonSocket);
	let pid: number | undefined;
	if (pidFile !== undefined || socketFile !== undefined) {
		if (pidFile === undefined || socketFile === undefined) fail('legacy publication is incomplete');
		const info = await lstat(paths.daemonPid);
		const socket = await lstat(paths.daemonSocket);
		if (!info.isFile() || info.uid !== process.getuid?.() || info.size > 32 || !socket.isSocket() || socket.uid !== info.uid) {
			fail('legacy publication is not an owned PID and socket pair');
		}
		const value = (await readFile(paths.daemonPid, 'utf8')).trim();
		if (!/^\d+$/.test(value)) fail('legacy PID publication is malformed');
		pid = Number(value);
	}
	const legacy = await registeredLegacyJobs(prior, baseline, labels, pid);
	const job = legacy === undefined ? undefined : await inspectLegacyJob(legacy);
	if (legacy !== undefined && job === undefined) fail('legacy launch registration changed');
	if (pid === undefined || pidFile === undefined || socketFile === undefined) {
		if (job?.pid != null || legacy?.runAtLoad === true) fail('legacy job cannot be restored in its stopped state');
		await requireQuiescentInstallation(prior);
		return { launch: { kind: 'stopped' }, wasRunning: false, ...(legacy !== undefined ? { legacy } : {}) };
	}
	if (job?.pid != null && job.pid !== pid) fail('legacy job and daemon publication name different processes');
	const target = await readDarwinIncarnation(pid, helper);
	const context = await readDarwinLaunchContext(pid, helper);
	if (target.uid !== process.getuid?.() || target.executable !== prior.runtime || context.cwd !== prior.releaseRoot
		|| !matchesInstalledDaemonArguments(context.argv, prior.runtime, join(prior.releaseRoot, MANAGED_ENTRY))) {
		fail('legacy daemon does not match the approved installed launch recipe');
	}
	const socket = createConnection(paths.daemonSocket);
	try {
		await once(socket, 'connect', { signal: AbortSignal.timeout(2_000) });
		const fd = (socket as Socket & { _handle?: { fd?: number } })._handle?.fd;
		if (fd === undefined) fail('legacy daemon socket has no descriptor');
		const peer = await readDarwinPeerCredentials(fd, helper);
		const pidAgain = runFileIdentity(paths.daemonPid);
		const socketAgain = runFileIdentity(paths.daemonSocket);
		if (!matchesDarwinPeer(peer, await readDarwinIncarnation(pid, helper), target)
			|| pidAgain === undefined || socketAgain === undefined
			|| !sameRunFile(pidAgain, pidFile) || !sameRunFile(socketAgain, socketFile)) fail('legacy publication changed during verification');
	} finally { socket.destroy(); }
	return {
		launch: { kind: legacy === undefined ? 'direct' : 'job', process: target, ...context, pidFile, socketFile },
		wasRunning: true, ...(legacy !== undefined ? { legacy } : {}),
	};
}

interface DirectoryPin { readonly dev: string; readonly ino: string }
interface Fence {
	readonly canonical: string;
	readonly displaced: string;
	readonly legacy: DirectoryPin;
	readonly dispatcher: DirectoryPin;
}

async function directoryPin(path: string): Promise<DirectoryPin> {
	const info = await lstat(path, { bigint: true });
	if (!info.isDirectory() || Number(info.uid) !== process.getuid?.() || await realpath(path) !== path) fail('launcher path is not a canonical owned directory');
	return { dev: String(info.dev), ino: String(info.ino) };
}

function same(a: DirectoryPin, b: DirectoryPin): boolean { return a.dev === b.dev && a.ino === b.ino; }

async function layout(fence: Fence): Promise<'original' | 'fenced'> {
	const current = await directoryPin(fence.canonical);
	const other = await directoryPin(fence.displaced);
	if (same(current, fence.legacy) && same(other, fence.dispatcher)) return 'original';
	if (same(current, fence.dispatcher) && same(other, fence.legacy)) return 'fenced';
	return fail('launcher exchange identities no longer match');
}

async function requireNoLegacyMutator(roots: readonly string[], allowed: DarwinIncarnation | undefined, helper?: string): Promise<void> {
	const { stdout } = await exec('/bin/ps', ['-axww', '-o', 'uid=,pid=,stat=,command='], { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024 });
	for (const line of stdout.split('\n')) {
		const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line);
		if (match === null || Number(match[1]) !== process.getuid?.() || match[3]!.startsWith('Z')) continue;
		const pid = Number(match[2]);
		if (pid === process.pid) continue;
		if (pid === allowed?.pid && matchesDarwinPeer(allowed, await readDarwinIncarnation(pid, helper), allowed)) continue;
		const command = match[4]!;
		if (roots.some(root => command.includes(`${root}/`) || command.endsWith(` ${root}`))) {
			fail('an older launcher, updater or daemon still references the legacy checkout');
		}
		let cwd: string;
		try { cwd = await readDarwinWorkingDirectory(pid, helper); }
		catch (error) {
			try { process.kill(pid, 0); }
			catch (probe) { if ((probe as NodeJS.ErrnoException).code === 'ESRCH') continue; }
			const state = await exec('/bin/ps', ['-p', String(pid), '-o', 'stat='], { timeout: 2_000 }).catch(probe => {
				const failed = probe as { code?: number; stdout?: string; stderr?: string };
				if (failed.code === 1 && failed.stdout?.trim() === '' && failed.stderr?.trim() === '') return null;
				throw probe;
			});
			if (state === null || state.stdout.trim().startsWith('Z')) continue;
			throw error;
		}
		if (roots.some(root => inside(root, cwd))) {
			fail('an older launcher, updater or daemon still references the legacy checkout');
		}
	}
}

function fenceIntent(reservation: MutationReservation): Fence | undefined {
	const entry = reservation.entries.find(item => item.step === 'legacy-launcher-fence');
	if (entry === undefined) return undefined;
	const fence = JSON.parse(entry.intent) as Fence;
	if (reservation.kind !== 'update' || fence.canonical !== reservation.predecessor.pins?.prior.releaseRoot
		|| dirname(fence.displaced) !== dirname(fence.canonical) || !basename(fence.displaced).startsWith('.insrc-launcher-')) {
		fail('launcher fence is outside the pinned installation');
	}
	return fence;
}

/** Fence every supported canonical launcher before predecessor shutdown. Resume from the exact two directory identities. */
export async function fenceLegacyLauncher(gate: Gate, update: Extract<MutationReservation, { kind: 'update' }>, helper?: string): Promise<string> {
	const prior = update.predecessor.pins?.prior;
	const launch = update.predecessor.launch;
	if (prior === undefined || launch === undefined) fail('migration has no verified legacy route');
	const predecessor = launch.kind === 'stopped' ? undefined : launch.process;
	const canonical = prior.releaseRoot;
	const marker = installationPaths(prior.stateRoot).updateLock;
	if (runFileIdentity(marker) !== undefined) fail('an older updater owns the installation');
	await requireNoLegacyMutator([canonical], predecessor, helper);
	let active = await gate.admit(update);
	let fence = fenceIntent(active);
	if (fence === undefined) {
		const displaced = await mkdtemp(join(dirname(canonical), '.insrc-launcher-'));
		try {
			await mkdir(join(displaced, 'scripts'));
			for (const name of ['daemon-ctl.sh', 'insrc', 'insrc-daemon-install.sh']) {
				await writeFile(join(displaced, 'scripts', name), BLOCKED, { mode: 0o700, flag: 'wx' });
			}
			fence = { canonical, displaced, legacy: await directoryPin(canonical), dispatcher: await directoryPin(displaced) };
			await gate.recordIntent(update, 'legacy-launcher-fence', JSON.stringify(fence));
		} catch (error) {
			// The record write can report failure after becoming durable. Retain its directory if ownership is ambiguous.
			const saved = await gate.admit(update).catch(() => undefined);
			if (saved !== undefined && fenceIntent(saved) === undefined) await rm(displaced, { recursive: true, force: true });
			throw error;
		}
		active = await gate.admit(update);
	}
	if (await layout(fence) === 'original') {
		if (active.entries.find(entry => entry.step === 'legacy-launcher-fence')?.receipt !== undefined) fail('receipted launcher fence was reversed');
		await gate.admit(update);
		await swapDarwinDirectories(fence.canonical, fence.displaced, {
			device: fence.legacy.dev, leftInode: fence.legacy.ino, rightInode: fence.dispatcher.ino,
		}, helper);
	}
	if (await layout(fence) !== 'fenced') fail('launcher exchange did not publish its fence');
	if (runFileIdentity(join(canonical, MANAGED_ENTRY)) !== undefined || runFileIdentity(join(canonical, '.git')) !== undefined
		|| await readFile(join(canonical, 'scripts/daemon-ctl.sh'), 'utf8') !== BLOCKED) {
		fail('canonical dispatcher permits a legacy launch or update');
	}
	if (runFileIdentity(marker) !== undefined) fail('an older updater started before the launcher fence');
	await requireNoLegacyMutator([canonical, fence.displaced], predecessor, helper);
	if (active.entries.find(entry => entry.step === 'legacy-launcher-fence')?.receipt === undefined) {
		await gate.recordReceipt(update, 'legacy-launcher-fence', 'canonical dispatcher verified; legacy checkout retained');
	}
	return fence.displaced;
}

/** Restore the old canonical directory without following or replacing a foreign path. */
export async function restoreLegacyLauncher(gate: Gate, update: Extract<MutationReservation, { kind: 'update' }>, helper?: string): Promise<void> {
	const fence = fenceIntent(await gate.admit(update));
	if (fence === undefined || await layout(fence) === 'original') return;
	await gate.admit(update);
	await swapDarwinDirectories(fence.canonical, fence.displaced, {
		device: fence.legacy.dev, leftInode: fence.dispatcher.ino, rightInode: fence.legacy.ino,
	}, helper);
	if (await layout(fence) !== 'original') fail('launcher restoration did not recover the original checkout');
}
