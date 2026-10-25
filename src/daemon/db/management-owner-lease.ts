/** O_EXCL owner lease. Only a verified dead/reused PID can be reclaimed; no process is signalled. */
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, unlink, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { readProtected, writeProtected, syncDirectory } from './management-files.js';
import type { ProtectedBytes } from './management-files.js';
import { ManagedStoreError } from './managed-store.js';
export interface ProcessObservation {
	readonly alive: (pid: number) => boolean;
	readonly identity: (pid: number) => string | undefined;
	readonly currentPid: () => number;
}
export const processObservation: ProcessObservation = {
	alive(pid) {
		try {
			process.kill(pid, 0);
			return true;
		}
		catch (error) {
			return (error as NodeJS.ErrnoException).code !== 'ESRCH';
		}
	},
	identity(pid) {
		try {
			const start = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' } }).trim();
			return start ? createHash('sha256').update(String(pid) + '\0' + start).digest('hex') : undefined;
		}
		catch {
			return undefined;
		}
	},
	currentPid: () => process.pid,
};
interface LeaseRecord {
	version: 1;
	root: string;
	pid: number;
	processIdentity: string;
	nonce: string;
}
function record(bytes: Buffer): LeaseRecord {
	try {
		const value = JSON.parse(bytes.toString('utf8')) as LeaseRecord;
		if (value.version !== 1 || typeof value.root !== 'string' || !Number.isSafeInteger(value.pid) || value.pid <= 0 || !/^[a-f0-9]{64}$/.test(value.processIdentity) || !/^[a-f0-9-]{36}$/.test(value.nonce) || Object.keys(value).sort().join(',') !== 'nonce,pid,processIdentity,root,version')
			throw new Error();
		return value;
	}
	catch {
		throw new ManagedStoreError('recovery-required');
	}
}
export class ManagementOwnerLease {
	#closed = false;
	private constructor(readonly path: string, readonly root: string, readonly owner: LeaseRecord, readonly expected: ProtectedBytes, readonly processes: ProcessObservation) {
	}
	static async acquire(path: string, root: string, processes: ProcessObservation = processObservation): Promise<ManagementOwnerLease> {
		const pid = processes.currentPid(), identity = processes.identity(pid);
		if (!identity || !processes.alive(pid))
			throw new ManagedStoreError('recovery-required');
		const owner: LeaseRecord = { version: 1, root, pid, processIdentity: identity, nonce: randomUUID() }, guard = path + '.reclaim';
		const exists = await lstat(guard).then(() => true).catch((error: NodeJS.ErrnoException) => {
			if (error.code === 'ENOENT')
				return false;
			throw new ManagedStoreError('recovery-required');
		});
		if (exists)
			throw new ManagedStoreError('recovery-required');
		const create = async () => new ManagementOwnerLease(path, root, owner, await writeProtected(path, JSON.stringify(owner), true), processes);
		if (!await lstat(path).then(() => true).catch((error: NodeJS.ErrnoException) => {
			if (error.code === 'ENOENT')
				return false;
			throw new ManagedStoreError('recovery-required');
		}))
			return create();
		// A crash while reclaiming leaves this sentinel; it is never automatically reclaimed.
		// That conservative failure avoids two stale reclaimers unlinking a newly acquired lease.
		const claim = await open(guard, 'wx', 0o600).catch(() => {
			throw new ManagedStoreError('recovery-required');
		});
		try {
			await claim.writeFile(JSON.stringify(owner));
			await claim.sync();
			await claim.chmod(0o400);
			await claim.sync();
			await syncDirectory(dirname(path));
			const previous = await readProtected(path), old = record(previous.bytes);
			if (old.root !== root)
				throw new ManagedStoreError('recovery-required');
			if (processes.alive(old.pid)) {
				const actual = processes.identity(old.pid);
				if (!actual || actual === old.processIdentity)
					throw new ManagedStoreError('recovery-required');
			}
			const current = await readProtected(path);
			if (current.inode !== previous.inode || current.device !== previous.device || current.digest !== previous.digest)
				throw new ManagedStoreError('recovery-required');
			await unlink(path);
			await syncDirectory(dirname(path));
			return await create();
		}
		finally {
			await claim.close();
			await unlink(guard).catch(() => {
			});
			await syncDirectory(dirname(path));
		}
	}
	async current(): Promise<boolean> {
		if (this.#closed || this.processes.currentPid() !== this.owner.pid || !this.processes.alive(this.owner.pid))
			return false;
		try {
			const actual = await readProtected(this.path);
			return actual.inode === this.expected.inode && actual.device === this.expected.device && actual.digest === this.expected.digest;
		}
		catch {
			return false;
		}
	}
	async close(): Promise<void> {
		if (this.#closed)
			return;
		if (!await this.current())
			throw new ManagedStoreError('recovery-required');
		this.#closed = true;
		await unlink(this.path);
		await syncDirectory(dirname(this.path));
	}
}
