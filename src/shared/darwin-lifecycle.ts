/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { onUtf8Data } from './utf8-stream.js';

const HELPER = fileURLToPath(new URL('../../out/bin/insrc-darwin-lifecycle', import.meta.url));
const ATTACH_TIMEOUT_MS = 2_000;
const exec = promisify(execFile);

export interface DarwinIncarnation {
	readonly pid: number;
	readonly uid: number;
	readonly startedAt: string;
	readonly executable: string;
}

export interface DarwinPeerCredentials {
	readonly pid: number;
	readonly uid: number;
}

function requireDarwin(): void {
	if (process.platform !== 'darwin') throw new Error('Darwin lifecycle observations require macOS');
}

function pidArgument(pid: number): string {
	if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 0x7fff_ffff) throw new Error('invalid process id');
	return String(pid);
}

export async function readDarwinIncarnation(pid: number, executable = HELPER): Promise<DarwinIncarnation> {
	requireDarwin();
	const { stdout: output } = await exec(executable, ['identity', pidArgument(pid)], {
		encoding: 'utf8', timeout: ATTACH_TIMEOUT_MS, maxBuffer: 8192,
	});
	const [marker, path, end, ...rest] = output.split('\0');
	const match = /^(\d+):(\d+):(\d+):(\d+)$/.exec(marker ?? '');
	if (match === null || Number(match[1]) !== pid || path === undefined || !isAbsolute(path)
		|| end !== '' || rest.length !== 0) throw new Error('invalid Darwin process identity');
	return { pid, uid: Number(match[2]), startedAt: `${match[3]}:${match[4]}`, executable: path };
}

export async function readDarwinLaunchContext(pid: number, executable = HELPER): Promise<{ cwd: string; argv: string[] }> {
	requireDarwin();
	const { stdout } = await exec(executable, ['context', pidArgument(pid)], { encoding: 'utf8', timeout: ATTACH_TIMEOUT_MS, maxBuffer: 1024 * 1024 });
	const [cwd, ...args] = stdout.split('\0');
	if (cwd === undefined || !isAbsolute(cwd) || args.pop() !== '' || args.length === 0) {
		throw new Error('invalid Darwin launch context');
	}
	return { cwd, argv: args };
}

export async function readDarwinWorkingDirectories(
	pids: readonly number[], executable = HELPER,
): Promise<readonly { pid: number; cwd?: string; errno?: number }[]> {
	requireDarwin();
	if (pids.length === 0) return [];
	if (pids.length > 256) throw new Error('too many working directory probes');
	const { stdout } = await exec(executable, ['cwd-batch', ...pids.map(pidArgument)], {
		encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024,
	});
	const fields = stdout.split('\0');
	if (fields.length !== 3 * pids.length + 1 || fields.at(-1) !== '') throw new Error('invalid Darwin working directories');
	return pids.map((pid, index) => {
		const [reported, cwd, error] = fields.slice(index * 3, index * 3 + 3);
		if (reported !== String(pid) || cwd === undefined || error === undefined || !/^\d+$/.test(error)
			|| (error === '0' ? !isAbsolute(cwd) : cwd !== '')) throw new Error('invalid Darwin working directory');
		return error === '0' ? { pid, cwd } : { pid, errno: Number(error) };
	});
}

/** Exchange owned directories on the same volume in one rename operation. */
export async function swapDarwinDirectories(
	left: string, right: string, expected: { device: string; leftInode: string; rightInode: string }, executable = HELPER,
): Promise<void> {
	requireDarwin();
	await exec(executable, ['swap-directories', left, right, expected.device, expected.leftInode, expected.rightInode], {
		timeout: ATTACH_TIMEOUT_MS, maxBuffer: 8192,
	});
}

/** Inspect the caller's existing connected socket via its inherited duplicate. */
export async function readDarwinPeerCredentials(socketFd: number, executable = HELPER): Promise<DarwinPeerCredentials> {
	requireDarwin();
	if (!Number.isInteger(socketFd) || socketFd < 0) throw new Error('invalid Unix socket descriptor');
	const observer = spawn(executable, ['peer'], {
		stdio: ['ignore', 'pipe', 'ignore', socketFd], timeout: ATTACH_TIMEOUT_MS,
	});
	const output = await new Promise<string>((resolve, reject) => {
		let received = '';
		observer.once('error', reject);
		onUtf8Data(observer.stdout, text => {
			received += text;
			if (received.length > 128) {
				observer.kill();
				reject(new Error('Darwin peer observation exceeded its bound'));
			}
		});
		observer.once('close', code => {
			if (code === 0) resolve(received);
			else reject(new Error('Darwin peer observation failed'));
		});
	});
	const match = /^(\d+):(\d+)\n$/.exec(output);
	if (match === null || Number(match[1]) <= 0) throw new Error('invalid Darwin socket peer');
	return { pid: Number(match[1]), uid: Number(match[2]) };
}

export function matchesDarwinPeer(credentials: DarwinPeerCredentials, observed: DarwinIncarnation, expected: DarwinIncarnation): boolean {
	return credentials.pid === expected.pid && credentials.uid === expected.uid
		&& observed.pid === expected.pid && observed.uid === expected.uid
		&& observed.startedAt === expected.startedAt && observed.executable === expected.executable;
}

export interface DarwinExitObservation {
	/** False means the exact exit was not verified, including timeout or cancellation. */
	readonly exited: Promise<boolean>;
	close(): Promise<void>;
}

/** The helper retains the kernel observer. Stopping it never signals the watched process. */
export async function observeDarwinExit(
	target: DarwinIncarnation,
	timeoutMs: number,
	executable = HELPER,
): Promise<DarwinExitObservation> {
	requireDarwin();
	if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 0x7fff_ffff - ATTACH_TIMEOUT_MS) {
		throw new Error('invalid exit observation timeout');
	}
	const marker = `${target.pid}:${target.uid}:${target.startedAt}`;
	const observer = spawn(executable, ['observe', pidArgument(target.pid), marker, target.executable, String(timeoutMs)], {
		stdio: ['ignore', 'pipe', 'ignore'],
		timeout: timeoutMs + ATTACH_TIMEOUT_MS,
	});
	let output = '';
	let cancelled = false;
	let ready = false;
	const exited = new Promise<boolean>(resolve => observer.once('close', code => {
		resolve(code === 0 && !cancelled && output === 'ready\nexited\n');
	}));
	const close = async (): Promise<void> => {
		cancelled = true;
		if (observer.exitCode === null && observer.signalCode === null) observer.kill();
		await exited;
	};
	try {
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('Darwin exit observer did not attach')), ATTACH_TIMEOUT_MS);
			observer.once('error', reject);
			observer.once('close', () => {
				clearTimeout(timer);
				if (!ready) reject(new Error('Darwin exit observer did not verify the target'));
			});
			onUtf8Data(observer.stdout, text => {
				output += text;
				if (!'ready\nexited\n'.startsWith(output)) {
					cancelled = true;
					observer.kill();
					reject(new Error('invalid Darwin exit observation'));
				} else if (!ready && output.startsWith('ready\n')) {
					ready = true;
					clearTimeout(timer);
					resolve();
				}
			});
		});
	} catch (error) {
		await close();
		throw error;
	}
	return { exited, close };
}

export interface DarwinLaunchJob {
	readonly uid: number;
	readonly label: string;
	readonly descriptor: string;
	readonly program: string;
	readonly args: readonly string[];
	readonly workingDirectory?: string;
	/** When supplied, only a passive registration with this RunAtLoad policy is allowed. */
	readonly runAtLoad?: boolean;
}

export function darwinLaunchLabel(canonicalRoot: string, uid: number): string {
	if (!isAbsolute(canonicalRoot) || !Number.isSafeInteger(uid) || uid <= 0) throw new Error('invalid installation identity');
	const digest = createHash('sha256').update(canonicalRoot).digest('hex').slice(0, 24);
	return `ai.insors.insrc.supervisor.${uid}.${digest}`;
}

export interface VerifiedDarwinLaunchJob {
	readonly target: string;
	readonly pid: number | null;
}

async function readLaunchctl(target: string): Promise<string> {
	const { stdout } = await exec('/bin/launchctl', ['print', target], {
		encoding: 'utf8', timeout: ATTACH_TIMEOUT_MS, maxBuffer: 1024 * 1024,
	});
	return stdout;
}

/** Validate the GUI domain and the registered LaunchAgent, including its pinned argv. */
export async function verifyDarwinLaunchJob(
	job: DarwinLaunchJob,
	read = readLaunchctl,
	currentUid = process.getuid?.(),
): Promise<VerifiedDarwinLaunchJob> {
	requireDarwin();
	if (currentUid === undefined || currentUid !== job.uid || currentUid <= 0) {
		throw new Error('wrong per-user launch domain');
	}
	if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(job.label) || !isAbsolute(job.descriptor) || !isAbsolute(job.program)
		|| job.args[0] !== job.program || job.args.some(arg => /[\r\n\0]/.test(arg))) throw new Error('invalid pinned launch job');

	const domain = `gui/${job.uid}`;
	const target = `${domain}/${job.label}`;
	const info = (await read(domain)).split('\n');
	if (info[0] !== `${domain} = {` || !info.includes('\ttype = login')) throw new Error('launch GUI domain unavailable');

	const lines = (await read(target)).split('\n');
	if (lines[0] !== `${target} = {`) throw new Error('unverified launch job target');
	const field = (name: string): string | undefined => {
		const prefix = `\t${name} = `;
		const matches = lines.filter(line => line.startsWith(prefix));
		if (matches.length > 1) throw new Error('ambiguous launch job field');
		return matches[0]?.slice(prefix.length);
	};
	const start = lines.indexOf('\targuments = {');
	const end = lines.indexOf('\t}', start + 1);
	const args = lines.slice(start + 1, end);
	if (field('type') !== 'LaunchAgent' || field('path') !== job.descriptor || field('program') !== job.program
		|| (job.workingDirectory !== undefined && field('working directory') !== job.workingDirectory)
		|| field('domain')?.split(' ')[0] !== domain
		|| start < 0 || end < 0 || args.length !== job.args.length
		|| args.some((line, index) => line !== `\t\t${job.args[index]}`)) {
		throw new Error('registered job does not match pinned descriptor');
	}
	if (job.runAtLoad !== undefined) {
		const properties = field('properties')?.split(' | ');
		const hasTrigger = lines.some(line => /^\t(?:event triggers|endpoints|sockets|run interval|start calendar interval)\s*=/.test(line));
		if (properties === undefined || properties.some(value => !['inferred program', 'runatload', '(none)'].includes(value))
			|| properties.includes('runatload') !== job.runAtLoad || hasTrigger) {
			throw new Error('registered job restart policy does not match its passive descriptor');
		}
	}
	const pidText = field('pid');
	const state = field('state');
	if (pidText === undefined && state === 'not running') return { target, pid: null };
	if (pidText === undefined && (state === 'spawn scheduled' || state === 'waiting for spawn')) {
		throw Object.assign(new Error('verified launch job is still starting'), { code: 'launch-job-starting' });
	}
	if (pidText === undefined || !/^\d+$/.test(pidText) || state !== 'running') {
		throw Object.assign(new Error('ambiguous launch job state'), { code: 'launch-job-ambiguous-state' });
	}
	return { target, pid: Number(pidArgument(Number(pidText))) };
}

export async function verifyDarwinJobProcess(job: DarwinLaunchJob, peer: DarwinIncarnation): Promise<VerifiedDarwinLaunchJob> {
	const first = await verifyDarwinLaunchJob(job);
	if (first.pid === null || first.pid !== peer.pid || job.uid !== peer.uid
		|| (await realpath(job.program)) !== (await realpath(peer.executable))) throw new Error('launch job process does not match peer');
	const current = await readDarwinIncarnation(peer.pid);
	const last = await verifyDarwinLaunchJob(job);
	if (last.pid !== first.pid || !matchesDarwinPeer(peer, current, peer)) throw new Error('launch job process changed');
	return last;
}
