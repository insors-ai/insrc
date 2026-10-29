/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Session pool (Epic 86197ac6, Story s3, contract sc6): one worker per client session
 * (validated client label + process id), started on first need and registered as that
 * session's target, plus the one unattributed worker for requests with no identity.
 *
 * An idle sweep releases a worker that has had no request for idleTimeoutMs, or whose
 * client process has exited; never one with a request in flight or a detached workflow run
 * still running. Step state lives in the shared step-state store, so a released session
 * resumes its steps on its next worker.
 */

import { getLogger } from '../../shared/logger.js';
import type { SessionId } from './channel.js';
import type { TargetRegistry } from './registry.js';
import type { StartedWorker } from './workers.js';

const log = getLogger('session-pool');

export interface SessionPoolOptions {
	/** Release a session's worker after this long with no request. */
	readonly idleTimeoutMs: number;
}

export interface SessionWorkerInfo {
	/** The session; absent for the unattributed worker. */
	readonly session?: SessionId | undefined;
	readonly threadId: number;
	readonly createdAt: number;
	readonly lastRequestAt: number;
	/** Requests waiting in the session's FIFO (not the one running). */
	readonly queued: number;
	/** Detached workflow runs this worker owns; a worker with any is never idle-released. */
	readonly activeRuns: number;
}

/** A worker could not be started, or exited before it was ready; the session's waiting requests get its message. */
export class SessionWorkerStartError extends Error {
	constructor(reason: string) {
		super(`session worker could not start: ${reason}`);
		this.name = 'SessionWorkerStartError';
	}
}

export interface SessionPoolDeps {
	readonly options: SessionPoolOptions;
	readonly registry: TargetRegistry;
	/** Start a session worker (startWorker in the daemon); `name` identifies it in logs; `shared` starts the shared-state worker. */
	readonly start: (name: string, opts?: { readonly shared?: true | undefined }) => Promise<StartedWorker>;
	/** The router's attach and detach of a worker's channel. */
	readonly attach: (threadId: number, port: StartedWorker['port']) => void;
	readonly detach: (threadId: number) => void;
	/** Detached runs still running that the thread owns (the status board). */
	readonly activeRuns: (threadId: number) => number;
	/** The worker exited on its own (not released), before its channel is forgotten: the router fails what it was serving. */
	readonly exited?: ((info: SessionWorkerInfo, code: number) => void) | undefined;
	readonly now?: (() => number) | undefined;
	readonly pidAlive?: ((pid: number) => boolean) | undefined;
}

interface Entry {
	readonly key: string;
	readonly session?: SessionId | undefined;
	readonly shared: boolean;
	readonly started: StartedWorker;
	readonly createdAt: number;
	lastRequestAt: number;
	inFlight: number;
	queued: number;
	released: boolean;
}

const UNATTRIBUTED = 'session:unattributed';
const SHARED = 'session:shared';
const keyOf = (session: SessionId | undefined): string => session === undefined ? UNATTRIBUTED : `session:${session.label}:${session.pid}`;

/** Whether a process is alive: signal 0 checks existence only (EPERM means it exists under another user). */
function processAlive(pid: number): boolean {
	try { process.kill(pid, 0); return true; }
	catch (err) { return (err as NodeJS.ErrnoException).code === 'EPERM'; }
}

export class SessionPool {
	private readonly entries = new Map<string, Entry>();
	private readonly starting = new Map<string, Promise<Entry>>();
	private timer: NodeJS.Timeout | undefined;
	private closed = false;
	private readonly now: () => number;
	private readonly pidAlive: (pid: number) => boolean;

	constructor(private readonly deps: SessionPoolDeps) {
		this.now = deps.now ?? Date.now;
		this.pidAlive = deps.pidAlive ?? processAlive;
	}

	get options(): SessionPoolOptions { return this.deps.options; }

	/** The session's worker (the unattributed worker for no session), started and registered if it has none. One start at a time per session. */
	async workerFor(session?: SessionId): Promise<SessionWorkerInfo> {
		return this.info(await this.entryFor(session));
	}

	/**
	 * The shared-state worker (chat, todos, understanding), started on first need and again by
	 * the next request after it exited; it is never idle-released (it hosts the chat processes).
	 */
	async sharedWorker(): Promise<SessionWorkerInfo> {
		return this.info(await this.entryFor(undefined, true));
	}

	/** One entry per live worker, for status and the idle sweep. */
	sessions(): readonly SessionWorkerInfo[] {
		return [...this.entries.values()].map(e => this.info(e));
	}

	/** A request of the session started on its worker (it is busy until the matching ended()). */
	started(session: SessionId | undefined): void {
		const e = this.entries.get(keyOf(session));
		if (e === undefined) return;
		e.inFlight++;
		e.lastRequestAt = this.now();
	}

	/** A request of the session ended (its reply, its stream's last frame, or its cancel). */
	ended(session: SessionId | undefined): void {
		const e = this.entries.get(keyOf(session));
		if (e === undefined) return;
		e.inFlight = Math.max(0, e.inFlight - 1);
		e.lastRequestAt = this.now();
	}

	/** A request sent straight to the worker on `threadId` (an abort to its run's owner) started: busy until endedOn(). */
	startedOn(threadId: number): void {
		const e = this.entryOn(threadId);
		if (e === undefined) return;
		e.inFlight++;
		e.lastRequestAt = this.now();
	}

	endedOn(threadId: number): void {
		const e = this.entryOn(threadId);
		if (e === undefined) return;
		e.inFlight = Math.max(0, e.inFlight - 1);
		e.lastRequestAt = this.now();
	}

	/** How many of the session's requests wait in its FIFO (kept by the router). */
	setQueued(session: SessionId | undefined, queued: number): void {
		const e = this.entries.get(keyOf(session));
		if (e !== undefined) e.queued = queued;
	}

	/** Release idle workers: no request for idleTimeoutMs, or (for a session) its client process gone; never one that is busy or owns a running run. */
	async sweep(): Promise<void> {
		const now = this.now();
		for (const e of [...this.entries.values()]) {
			if (e.shared || e.inFlight > 0 || e.queued > 0 || this.deps.activeRuns(e.started.threadId) > 0) continue;
			const idle = now - e.lastRequestAt >= this.deps.options.idleTimeoutMs;
			const gone = e.session !== undefined && !this.pidAlive(e.session.pid);
			if (!idle && !gone) continue;
			log.info({ session: e.session, threadId: e.started.threadId, reason: gone ? 'client process exited' : 'idle' }, 'session pool: releasing a session worker');
			await this.release(e);
		}
	}

	/** Sweep every `everyMs` (an unref'd timer). */
	startSweeping(everyMs: number = Math.max(1_000, Math.min(60_000, this.deps.options.idleTimeoutMs / 4))): void {
		this.stopSweeping();
		this.timer = setInterval(() => { void this.sweep(); }, everyMs);
		this.timer.unref();
	}

	stopSweeping(): void {
		if (this.timer !== undefined) clearInterval(this.timer);
		this.timer = undefined;
	}

	/**
	 * Release every worker (daemon shutdown). No worker starts after this begins: a start
	 * already under way is waited for and its worker released too.
	 */
	async close(): Promise<void> {
		this.closed = true;
		this.stopSweeping();
		for (const start of [...this.starting.values()]) await start.catch(() => undefined);
		for (const e of [...this.entries.values()]) await this.release(e);
	}

	private info(e: Entry): SessionWorkerInfo {
		return {
			...(e.session !== undefined ? { session: e.session } : {}),
			threadId: e.started.threadId, createdAt: e.createdAt, lastRequestAt: e.lastRequestAt,
			queued: e.queued, activeRuns: this.deps.activeRuns(e.started.threadId),
		};
	}

	private entryOn(threadId: number): Entry | undefined {
		for (const e of this.entries.values()) if (e.started.threadId === threadId) return e;
		return undefined;
	}

	private entryFor(session: SessionId | undefined, shared = false): Promise<Entry> {
		if (this.closed) return Promise.reject(new SessionWorkerStartError('the daemon is shutting down'));
		const key = shared ? SHARED : keyOf(session);
		const live = this.entries.get(key);
		if (live !== undefined) return Promise.resolve(live);
		const pending = this.starting.get(key);
		if (pending !== undefined) return pending;
		const start = this.startEntry(key, session, shared).finally(() => this.starting.delete(key));
		this.starting.set(key, start);
		return start;
	}

	private async startEntry(key: string, session: SessionId | undefined, shared: boolean): Promise<Entry> {
		let started: StartedWorker;
		try {
			started = shared
				? await this.deps.start('shared-state', { shared: true })
				: await this.deps.start(session === undefined ? 'unattributed' : `session ${session.label}:${session.pid}`);
		} catch (err) {
			throw new SessionWorkerStartError(err instanceof Error ? err.message : String(err));
		}
		const now = this.now();
		const entry: Entry = { key, session, shared, started, createdAt: now, lastRequestAt: now, inFlight: 0, queued: 0, released: false };
		this.deps.registry.register(shared
			? { threadId: started.threadId, cls: 'session', shared: true }
			: session === undefined
				? { threadId: started.threadId, cls: 'session', unattributed: true }
				: { threadId: started.threadId, cls: 'session', session });
		this.deps.attach(started.threadId, started.port);
		this.entries.set(key, entry);
		started.worker.once('exit', code => {
			if (entry.released) return;
			log.warn({ session, shared, threadId: started.threadId, code }, 'session pool: a session worker exited');
			// Told first, while the worker's channel is still known, so what it was serving can be failed.
			try { this.deps.exited?.(this.info(entry), code); }
			finally {
				this.forget(entry);
				// Its main-thread services (pushes, hub) stop once its thread is reclaimed, as on a release.
				void started.reclaimed.then(started.disconnect, started.disconnect);
			}
		});
		return entry;
	}

	private forget(e: Entry): void {
		if (this.entries.get(e.key) === e) this.entries.delete(e.key);
		this.deps.registry.unregister(e.started.threadId);
		this.deps.detach(e.started.threadId);
	}

	private async release(e: Entry): Promise<void> {
		e.released = true;
		this.forget(e);
		await e.started.worker.terminate();
		await e.started.reclaimed;
		e.started.disconnect();
	}
}
