/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ProcessIdentity } from '../shared/daemon-process.js';
import { sameRunFile } from '../shared/daemon-run-files.js';
import type { RunFileIdentity } from '../shared/daemon-run-files.js';
import { SupervisorLifecycleError } from '../shared/daemon-supervisor-protocol.js';

type FileKind = 'directory' | 'pid' | 'socket';
interface OwnedFile {
	readonly identity: RunFileIdentity;
	readonly kind: FileKind;
	readonly uid: number;
}

async function observe(path: string): Promise<OwnedFile | undefined> {
	try {
		const file = await lstat(path, { bigint: true });
		const kind = file.isDirectory() ? 'directory' : file.isSocket() ? 'socket' : file.isFile() ? 'pid' : undefined;
		if (kind === undefined) throw ownership('unexpected run-file type');
		return {
			kind, uid: Number(file.uid), identity: {
				dev: String(file.dev), ino: String(file.ino), ctimeNs: String(file.ctimeNs),
				mtimeNs: String(file.mtimeNs), size: String(file.size),
			},
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw error;
	}
}

function ownership(message: string): SupervisorLifecycleError {
	return new SupervisorLifecycleError('ownership-conflict', message);
}

function matches(expected: OwnedFile, current: OwnedFile | undefined): boolean {
	return current !== undefined && current.uid === expected.uid && current.kind === expected.kind
		&& sameRunFile(expected.identity, current.identity);
}

interface Guard {
	assertOwned(): Promise<void>;
	release(): Promise<void>;
}

/** Use the same on-disk guard and owner format as unmanaged startup, without synchronous process probes. */
async function acquire(path: string, owner: ProcessIdentity, uid: number): Promise<Guard> {
	try { await mkdir(path, { mode: 0o700 }); }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw ownership('run-file guard already exists; preserve its owner');
		throw error;
	}
	const directory = await observe(path);
	if (directory?.kind !== 'directory' || directory.uid !== uid) throw ownership('run-file guard directory changed');
	const recordPath = join(path, 'owner.json');
	const bytes = JSON.stringify({ owner, nonce: randomUUID() });
	await writeFile(recordPath, bytes, { mode: 0o600, flag: 'wx' });
	const record = await observe(recordPath);
	if (record?.kind !== 'pid' || record.uid !== uid) throw ownership('run-file guard owner changed');
	const assertOwned = async (): Promise<void> => {
		const current = await observe(path);
		if (current?.kind !== 'directory' || current.uid !== uid || current.identity.ino !== directory.identity.ino
			|| current.identity.dev !== directory.identity.dev || !matches(record, await observe(recordPath))
			|| await readFile(recordPath, 'utf8') !== bytes) throw ownership('run-file guard ownership changed');
	};
	return { assertOwned, async release() { await assertOwned(); await unlink(recordPath); await rmdir(path); } };
}

export interface SupervisedRunFilePaths {
	readonly guardPath: string;
	readonly pidFile: string;
	readonly socketFile: string;
}

interface Publication {
	readonly pid?: OwnedFile | undefined;
	readonly socket?: OwnedFile | undefined;
}

interface GenerationGuard {
	readonly id: string;
	guard: Guard | undefined;
	acquiring: Promise<Guard> | undefined;
	releasing: Promise<void> | undefined;
	publication: Publication | undefined;
	token: string | undefined;
	granted: boolean;
	fenced: boolean;
}

/** Guard ownership belongs to the supervisor until verified startup or exact reap. */
export class SupervisorRunFiles {
	private active: GenerationGuard | undefined;

	constructor(private readonly paths: SupervisedRunFilePaths, private readonly owner: ProcessIdentity, private readonly uid: number) {}

	async prepare(generation: string): Promise<void> {
		if (this.active !== undefined) throw ownership('previous run-file generation is not reconciled');
		await mkdir(dirname(this.paths.guardPath), { recursive: true });
		const guard = await acquire(this.paths.guardPath, this.owner, this.uid);
		try {
			const before = await this.snapshot();
			if (before.pid !== undefined || before.socket !== undefined) {
				throw ownership('previous run-file publication has not been reconciled');
			}
		} catch (error) { await guard.release(); throw error; }
		this.active = { id: generation, guard, acquiring: undefined, releasing: undefined,
			publication: undefined, token: undefined, granted: false, fenced: false };
	}

	private current(generation: string): GenerationGuard {
		if (this.active?.id !== generation) throw ownership('run-file generation does not match');
		return this.active;
	}

	private async snapshot(): Promise<Publication> {
		const pid = await observe(this.paths.pidFile);
		const socket = await observe(this.paths.socketFile);
		if (pid !== undefined && (pid.kind !== 'pid' || pid.uid !== this.uid)) throw ownership('unverified PID file');
		if (socket !== undefined && (socket.kind !== 'socket' || socket.uid !== this.uid)) throw ownership('unverified socket file');
		return { pid, socket };
	}

	private async obtain(active: GenerationGuard): Promise<Guard> {
		if (active.releasing !== undefined) await active.releasing;
		if (active.guard !== undefined) return active.guard;
		active.acquiring ??= acquire(this.paths.guardPath, this.owner, this.uid);
		try {
			active.guard = await active.acquiring;
			return active.guard;
		} finally { active.acquiring = undefined; }
	}

	token(generation: string): string | null {
		return this.current(generation).token ?? null;
	}

	async grant(generation: string): Promise<string> {
		const active = this.current(generation);
		if (active.fenced) throw ownership('run-file grant is fenced');
		const guard = await this.obtain(active);
		await guard.assertOwned();
		if (active.fenced) throw ownership('run-file grant is fenced');
		if (active.publication !== undefined) await this.verifyPublication(active.publication, await this.snapshot());
		if (active.fenced) throw ownership('run-file grant is fenced');
		active.granted = true;
		active.token ??= randomUUID();
		return active.token;
	}

	releaseGrant(generation: string, token: string): void {
		const active = this.current(generation);
		if (active.fenced || active.token !== token) throw ownership('run-file grant is stale');
		active.token = undefined;
	}

	fence(generation: string): void {
		const active = this.current(generation);
		active.fenced = true;
		active.token = undefined;
	}

	async ready(generation: string, pid: number): Promise<void> {
		const active = this.current(generation);
		if (!active.granted || active.token !== undefined || active.guard === undefined || active.fenced) {
			throw ownership('startup run-file grant was not returned');
		}
		await active.guard.assertOwned();
		const published = await this.snapshot();
		if (published.pid === undefined || published.socket === undefined) throw ownership('incomplete run-file publication');
		await this.verifyPid(published.pid, pid);
		if (active.fenced) throw ownership('startup generation is fenced');
		// Reap waits for an in-flight release before taking the shutdown guard again.
		active.publication = published;
	}

	async finishReady(generation: string): Promise<void> {
		const active = this.current(generation);
		const guard = active.guard;
		if (active.fenced || active.publication === undefined || guard === undefined) throw ownership('startup generation is fenced');
		active.releasing = (async () => {
			await guard.release();
			active.guard = undefined;
		})();
		try { await active.releasing; } finally { active.releasing = undefined; }
	}

	private async verifyPid(file: OwnedFile, pid: number | undefined): Promise<void> {
		if (pid === undefined || Number(file.identity.size) > 32
			|| (await readFile(this.paths.pidFile, 'utf8')).trim() !== String(pid)
			|| !matches(file, await observe(this.paths.pidFile))) throw ownership('PID file does not name the owned child');
	}

	private async verifyPublication(expected: Publication, current: Publication): Promise<void> {
		if ((current.pid !== undefined && (expected.pid === undefined || !matches(expected.pid, current.pid)))
			|| (current.socket !== undefined && (expected.socket === undefined || !matches(expected.socket, current.socket)))) {
			throw ownership('foreign replacement run file was preserved');
		}
	}

	/** The supervisor calls this only after exact reap or a verified failure to create a child. */
	async reconcile(generation: string, pid: number | undefined): Promise<void> {
		const active = this.current(generation);
		this.fence(generation);
		const guard = await this.obtain(active);
		await guard.assertOwned();
		const current = await this.snapshot();
		if (active.publication !== undefined) {
			await this.verifyPublication(active.publication, current);
		} else {
			// Absence under the guard was proved before spawn. Only an admitted child could publish.
			if ((!active.granted || pid === undefined) && (current.pid !== undefined || current.socket !== undefined)) {
				throw ownership('unproven startup publication was preserved');
			}
			if (current.pid !== undefined) await this.verifyPid(current.pid, pid);
		}
		for (const [path, file] of [[this.paths.pidFile, current.pid], [this.paths.socketFile, current.socket]] as const) {
			if (file === undefined) continue;
			await guard.assertOwned();
			if (!matches(file, await observe(path))) throw ownership('run file changed before reconciliation');
			await unlink(path);
		}
		await guard.release();
		this.active = undefined;
	}
}
