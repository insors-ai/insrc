/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { appendFileSync, chmodSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PATHS } from '../shared/paths.js';
import { readProcessIdentity } from '../shared/daemon-process.js';
import type { ProcessIdentityReader } from '../shared/daemon-process.js';
import { acquireRunFileGuard, removeOwnedRunFile, runFileIdentity, sameRunFile } from '../shared/daemon-run-files.js';
import type { RunFileGuard, RunFileIdentity } from '../shared/daemon-run-files.js';

export class RunFileOwnershipError extends Error {
	constructor(message: string, cause?: unknown) { super(`run-file ownership conflict: ${message}`, { cause }); this.name = 'RunFileOwnershipError'; }
}
const conflict = (error: unknown): RunFileOwnershipError => error instanceof RunFileOwnershipError ? error : new RunFileOwnershipError(error instanceof Error ? error.message : String(error), error);
export interface RunFilePaths {
	readonly pidFile?: string | undefined;
	readonly socketFile: string;
	readonly guardPath: string;
}
export interface RunFileLease {
	readonly guard: RunFileGuard;
	release(): void;
}

/** Process-local publication evidence plus one cross-process guard shared by all managed writers. */
export class DaemonRunFileOwnership {
	private readonly paths: RunFilePaths;
	private guard: RunFileGuard | undefined;
	private depth = 0;
	private pidIdentity: RunFileIdentity | undefined;
	private socketIdentity: RunFileIdentity | undefined;
	private listenerMayUnlink = false;
	constructor(paths: RunFilePaths) { this.paths = Object.freeze({ ...paths }); }
	get hasSocketPublication(): boolean { return this.listenerMayUnlink; }
	markListenerClosed(): void { this.listenerMayUnlink = false; }

	lease(): RunFileLease {
		try {
			if (!this.guard) { mkdirSync(dirname(this.paths.guardPath), { recursive: true }); this.guard = acquireRunFileGuard(this.paths.guardPath); }
			const guard = this.guard; guard.assertOwned(); this.depth++;
			let released = false;
			return { guard, release: () => {
				if (released) return; released = true;
				try { guard.assertOwned(); if (--this.depth === 0) { guard.release(); this.guard = undefined; } }
				catch (error) { throw conflict(error); }
			} };
		} catch (error) { throw conflict(error); }
	}

	private within<T>(action: (guard: RunFileGuard) => T): T {
		const lease = this.lease();
		try { return action(lease.guard); } catch (error) { throw conflict(error); } finally { lease.release(); }
	}
	private verify(path: string, expected: RunFileIdentity | undefined): void {
		const current = runFileIdentity(path);
		if (current !== undefined && (expected === undefined || !sameRunFile(current, expected))) throw new RunFileOwnershipError(`replacement at ${path}; it was preserved`);
	}
	private verifyFiles(): void {
		if (this.paths.pidFile) this.verify(this.paths.pidFile, this.pidIdentity);
		this.verify(this.paths.socketFile, this.socketIdentity);
	}
	assertCurrentOwnership(): void { this.within(() => this.verifyFiles()); }
	assertSocketVacant(): void {
		this.within(() => {
			if (this.paths.pidFile) this.verify(this.paths.pidFile, this.pidIdentity);
			if (runFileIdentity(this.paths.socketFile) !== undefined) throw new RunFileOwnershipError(`socket already exists at ${this.paths.socketFile}`);
		});
	}
	claimSocket(): void {
		this.within(() => {
			if (!lstatSync(this.paths.socketFile).isSocket()) throw new RunFileOwnershipError(`published endpoint is not a socket at ${this.paths.socketFile}`);
			chmodSync(this.paths.socketFile, 0o600);
			this.socketIdentity = runFileIdentity(this.paths.socketFile);
			if (!this.socketIdentity) throw new RunFileOwnershipError('published socket disappeared');
			this.listenerMayUnlink = true;
		});
	}
	assertSocketOwned(): void { this.within(() => this.verifyFiles()); }
	removeSocket(): void {
		this.within(guard => { this.verifyFiles(); removeOwnedRunFile(this.paths.socketFile, this.socketIdentity, guard); this.socketIdentity = undefined; });
	}
	writePid(): void {
		this.within(() => {
			const path = this.paths.pidFile;
			if (!path) throw new RunFileOwnershipError('this endpoint has no PID-file contract');
			this.verifyFiles();
			if (runFileIdentity(path) === undefined) writeFileSync(path, String(process.pid), { flag: 'wx', mode: 0o600 });
			else if (readFileSync(path, 'utf8').trim() !== String(process.pid)) throw new RunFileOwnershipError(`PID file no longer names this process at ${path}`);
			this.pidIdentity = runFileIdentity(path);
		});
	}
	clearRunFiles(): void {
		this.within(guard => {
			// Check the complete pair before removing either member.
			this.verifyFiles();
			if (this.paths.pidFile) removeOwnedRunFile(this.paths.pidFile, this.pidIdentity, guard);
			removeOwnedRunFile(this.paths.socketFile, this.socketIdentity, guard);
			this.pidIdentity = undefined; this.socketIdentity = undefined;
		});
	}

	/** A live or unverifiable PID is never stale. Guarded positive absence permits legacy run-file cleanup. */
	isAlreadyRunning(read: ProcessIdentityReader = readProcessIdentity): boolean {
		return this.within(guard => {
			const path = this.paths.pidFile;
			if (!path) throw new RunFileOwnershipError('this endpoint has no PID-file contract');
			const pidFile = runFileIdentity(path), socket = runFileIdentity(this.paths.socketFile);
			if (!pidFile) {
				if (socket) throw new RunFileOwnershipError(`socket has no verifiable PID owner at ${this.paths.socketFile}`);
				return false;
			}
			const text = readFileSync(path, 'utf8').trim(), after = runFileIdentity(path);
			if (!after || !sameRunFile(pidFile, after) || !/^[1-9]\d*$/.test(text)) throw new RunFileOwnershipError(`unreadable or changing PID owner at ${path}`);
			const pid = Number(text);
			if (!Number.isSafeInteger(pid) || pid > 0x7fff_ffff) throw new RunFileOwnershipError(`invalid PID owner at ${path}`);
			if (read(pid) !== undefined) return true;
			removeOwnedRunFile(path, pidFile, guard);
			removeOwnedRunFile(this.paths.socketFile, socket, guard);
			return false;
		});
	}
}

export const daemonRunFiles = new DaemonRunFileOwnership({ pidFile: PATHS.pidFile, socketFile: PATHS.sockFile, guardPath: PATHS.daemonRunGuard });

/** Ownership loss must not enter exit hooks that could unlink a replacement socket. */
export function endForRunFileConflict(error: unknown, deps: { readonly logPath?: string | undefined; readonly killSelf?: (() => void) | undefined } = {}): void {
	const line = JSON.stringify({ time: new Date().toISOString(), level: 'fatal', module: 'daemon-run-files', error: error instanceof Error ? error.message : String(error), action: 'self-SIGKILL without cleanup of foreign run files' }) + '\n';
	try { const path = deps.logPath ?? PATHS.daemonLog; mkdirSync(dirname(path), { recursive: true }); appendFileSync(path, line); } catch { /* diagnostic unavailable */ }
	try { process.stderr.write(line); } catch { /* stderr unavailable */ }
	(deps.killSelf ?? (() => { process.kill(process.pid, 'SIGKILL'); }))();
}

/** Shared startup-failure cleanup, including a listener opened before readiness. */
export async function cleanupFailedPublication(server: { disconnectClients(): void; close(): Promise<void> } | undefined, publication: RunFileLease | undefined): Promise<void> {
 server?.disconnectClients();
 await server?.close();
 if (publication) daemonRunFiles.clearRunFiles();
 publication?.release();
}
