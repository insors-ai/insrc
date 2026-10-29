/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The worker supervisor (Epic 86197ac6, Story s2): starts the daemon's workers
 * and replaces one that exits. s2 registers the admin, code-indexing and
 * document-summary workers; s4 registers the session workers with the same
 * supervisor.
 *
 * When a worker exits (other than at shutdown): its target is unregistered,
 * its in-flight requests are failed with "the daemon's <class> thread stopped
 * while serving <method>; retry", its named locks and store-guard permits are
 * reclaimed, and then a replacement starts. Requests for its class wait for
 * the replacement (the router holds them, at most 30 s). Past maxRestarts
 * restarts within windowMs the supervisor logs fatal and shuts the daemon down.
 */

import type { Worker } from 'node:worker_threads';

import { getLogger } from '../../shared/logger.js';
import type { FrameEnvelope, MethodClass, ReplyEnvelope } from './channel.js';
import type { ThreadServices } from './main-services.js';
import type { Router } from './router.js';
import { startClassWorker, startWorker } from './workers.js';
import type { StartedWorker, WorkerExtra } from './workers.js';

const log = getLogger('supervisor');

export const DEFAULT_MAX_RESTARTS = 5;
export const DEFAULT_RESTART_WINDOW_MS = 60_000;

/** A supervised worker: how to start it, and what to do around its replacement. */
export interface WorkerSpec {
	/** Unique among the supervisor's workers; names the thread in logs and errors when it serves no class. */
	readonly name: string;
	readonly script: string;
	/** The request class it is the target for; omitted for a worker that serves no requests. */
	readonly cls?: MethodClass | undefined;
	/** Extra workerData for each start (each start gets ports of its own). */
	readonly extra?: (() => WorkerExtra | undefined) | undefined;
	/** After each start, once the worker is ready. */
	readonly started?: ((worker: StartedWorker) => void) | undefined;
	/** After a worker of this spec exited and was reclaimed, before its replacement starts. */
	readonly exited?: ((threadId: number) => void) | undefined;
}

export interface SupervisorOptions {
	readonly services: ThreadServices;
	readonly router: Router;
	/** The daemon's shutdown, run when the restart limit is passed. */
	readonly shutdown: (reason: string) => void;
	readonly maxRestarts?: number | undefined;
	readonly windowMs?: number | undefined;
	readonly now?: (() => number) | undefined;
}

export class Supervisor {
	private readonly live = new Map<string, StartedWorker>();
	/** Every worker created and not yet exited, ready or not: shutdown terminates them. */
	private readonly created = new Set<Worker>();
	private readonly restarts: number[] = [];
	private stopping = false;

	constructor(private readonly opts: SupervisorOptions) {}

	/** Start a worker of `spec`, supervised from now on; resolves once it is ready. */
	async start(spec: WorkerSpec): Promise<StartedWorker> {
		const { services, router } = this.opts;
		const track = (worker: Worker): void => {
			this.created.add(worker);
			worker.once('exit', () => this.created.delete(worker));
		};
		const extra = spec.extra?.();
		const started = spec.cls !== undefined
			? await startClassWorker(services, router, spec.cls, spec.script, extra, track)
			: await startWorker(services, spec.name, spec.script, extra, track);
		this.live.set(spec.name, started);
		// An uncaught exception in the worker: logged here (unlistened, it would throw on this thread); its exit follows.
		started.worker.on('error', err => log.error({ worker: spec.name, threadId: started.threadId, err: err.message }, 'supervisor: a worker failed'));
		started.worker.once('exit', code => { void this.exited(spec, started, code); });
		spec.started?.(started);
		return started;
	}

	/**
	 * Start a worker of `spec`; if its first start fails (it exits or errors before it
	 * is ready), replace it as after any exit: rate-limited, and past the limit the
	 * daemon shuts down. Resolves once a worker of `spec` is ready, or the replacing ends.
	 */
	async startOrReplace(spec: WorkerSpec): Promise<void> {
		try {
			await this.start(spec);
		} catch (err) {
			if (this.stopping) return;
			log.error({ worker: spec.name, err: err instanceof Error ? err.message : String(err) }, 'supervisor: a worker did not start; replacing it');
			await this.replace(spec);
		}
	}

	/** Every ready worker now. */
	liveWorkers(): StartedWorker[] {
		return [...this.live.values()];
	}

	/**
	 * A worker started outside start() (the session pool's, s4): supervised for errors and
	 * shutdown (terminateAll ends it); its exit and replacement stay its starter's.
	 */
	track(worker: Worker, name: string): void {
		this.created.add(worker);
		worker.once('exit', () => this.created.delete(worker));
		worker.on('error', err => log.error({ worker: name, threadId: worker.threadId, err: err.message }, 'supervisor: a worker failed'));
	}

	/**
	 * Count one restart of `name` against the limit (maxRestarts within windowMs, shared by every
	 * worker). Past it the daemon shuts down and the answer is false: the restart must not happen.
	 */
	allowRestart(name: string): boolean {
		const now = (this.opts.now ?? Date.now)();
		const windowMs = this.opts.windowMs ?? DEFAULT_RESTART_WINDOW_MS;
		while (this.restarts.length > 0 && now - this.restarts[0]! >= windowMs) this.restarts.shift();
		if (this.restarts.length >= (this.opts.maxRestarts ?? DEFAULT_MAX_RESTARTS)) {
			log.fatal({ worker: name, restarts: this.restarts.length, windowMs }, 'supervisor: workers keep exiting; shutting the daemon down');
			this.stopping = true;
			this.opts.shutdown(`the ${name} worker exceeded the restart limit`);
			return false;
		}
		this.restarts.push(now);
		return true;
	}

	/** Workers created and not yet exited, ready or not. */
	createdCount(): number {
		return this.created.size;
	}

	/** The ready worker of `name`, if there is one now. */
	current(name: string): StartedWorker | undefined {
		return this.live.get(name);
	}

	/** Shutdown: no worker is replaced from now on. */
	stop(): void {
		this.stopping = true;
	}

	/** Shutdown, after the workers' own stops: terminate every worker still running and wait for them to exit. */
	async terminateAll(): Promise<void> {
		this.stopping = true;
		const exits = [...this.created].map(worker => new Promise<void>(resolve => {
			worker.once('exit', () => resolve());
			void worker.terminate();
		}));
		for (const exit of exits) await exit;
	}

	private async exited(spec: WorkerSpec, worker: StartedWorker, code: number): Promise<void> {
		const { services, router } = this.opts;
		if (this.live.get(spec.name) === worker) this.live.delete(spec.name);
		services.registry.unregister(worker.threadId);
		const thread = spec.cls ?? spec.name;
		for (const r of router.detach(worker.threadId)) {
			const error = `the daemon's ${thread} thread stopped while serving ${r.method}; retry`;
			try {
				r.deliver(r.stream
					? { kind: 'frame', requestId: r.requestId, frame: { id: 0, stream: 'error', data: { error, recoverable: true } } } satisfies FrameEnvelope
					: { kind: 'reply', requestId: r.requestId, error } satisfies ReplyEnvelope);
			} finally { r.ack(); }
		}
		const reclaimed = await worker.reclaimed;
		worker.disconnect();
		if (this.stopping) return;
		log.error({ worker: spec.name, threadId: worker.threadId, code, locks: reclaimed.locks.length, stores: reclaimed.stores }, 'supervisor: a worker exited; replacing it');
		spec.exited?.(worker.threadId);
		await this.replace(spec);
	}

	private async replace(spec: WorkerSpec): Promise<void> {
		if (!this.allowRestart(spec.name)) return;
		try {
			const started = await this.start(spec);
			log.info({ worker: spec.name, threadId: started.threadId }, 'supervisor: replacement worker ready');
		} catch (err) {
			log.error({ worker: spec.name, err: err instanceof Error ? err.message : String(err) }, 'supervisor: a replacement worker did not start');
			if (!this.stopping) await this.replace(spec);
		}
	}
}
