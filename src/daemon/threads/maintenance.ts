/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Idle maintenance on the main thread (Epic 86197ac6, Story s2): graph
 * compaction when the daemon is idle and enough space is reclaimable, and on
 * request (daemon.compact).
 *
 * Idle: no non-admin request arrived or ran for idleMs, and both indexing
 * lanes are idle. Admin requests (status polls) and the subscription streams
 * do not count. Worth it: the reclaimable space meets both thresholds.
 *
 * A run takes 'daemon.maintenance' exclusively (activity 'compaction', with
 * the reason), waiting at most the pause limit for running requests to
 * finish; from the moment it asks, new requests are refused. Once granted it
 * asks every worker to close its graph handle, compacts with a pre-rename
 * check that every worker acknowledged (and none started since), and
 * releases. Each decision is logged. It never starts unless the store is
 * healthy.
 */

import { MessageChannel } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { worthCompacting } from '../../db/graph/store.js';
import type { CompactResult, Reclaimable } from '../../db/graph/store.js';
import { LockTimeoutError, getLockManager } from '../../shared/locks/lock-manager.js';
import { COMPACTION_ACTIVITY, MAINTENANCE_LOCK } from '../../shared/locks/maintenance-lock.js';
import { getLogger } from '../../shared/logger.js';
import type { DaemonStatus } from '../../shared/types.js';
import { UNHELD_METHODS } from './maintenance-entry.js';
import type { MethodClass } from './channel.js';
import { pushToWorker } from './channel.js';
import { GRAPH_CLOSE_OP } from './worker-entry.js';

const log = getLogger('maintenance');

export interface MaintenanceConfig {
	readonly idleMs: number;
	readonly minReclaimablePct: number;
	readonly minReclaimableMb: number;
	readonly pauseLimitMs: number;
}

export const DEFAULT_MAINTENANCE_CONFIG: MaintenanceConfig = { idleMs: 1_800_000, minReclaimablePct: 25, minReclaimableMb: 256, pauseLimitMs: 600_000 };

/** How long a worker is given to close its graph handle. */
export const GRAPH_CLOSE_ACK_MS = 30_000;

/** The workers whose graph handles maintenance closes. */
export interface MaintenanceWorkers {
	/** The ready workers' channels. */
	readonly live: () => readonly { readonly threadId: number; readonly port: MessagePort }[];
	/** Workers created and not exited, ready or not. */
	readonly created: () => number;
}

export interface MaintenanceDeps {
	readonly config: MaintenanceConfig;
	readonly now?: (() => number) | undefined;
	/** Both indexing lanes idle (the status board). */
	readonly lanesIdle: () => boolean;
	/** The graph store's health is ok. */
	readonly healthy: () => boolean;
	readonly reclaimable: () => Reclaimable | undefined;
	readonly workers: MaintenanceWorkers;
	readonly compact: (opts: { readonly beforeRename: () => Promise<boolean> }) => Promise<CompactResult>;
	/** How long a worker is given to acknowledge graph.close (default GRAPH_CLOSE_ACK_MS). */
	readonly ackMs?: number | undefined;
	/** Tests only: runs once the lock is granted, before the workers are asked to close. */
	readonly onGranted?: (() => Promise<void>) | undefined;
	/** How often a maintenance waiting for the lock re-checks store health (default HEALTH_POLL_MS). */
	readonly healthPollMs?: number | undefined;
}

/** A maintenance waiting for the lock re-checks store health this often. */
export const HEALTH_POLL_MS = 250;

export class MaintenanceNotRunError extends Error {
	override readonly name = 'MaintenanceNotRunError';
}

export type TickOutcome = 'not-idle' | 'unhealthy' | 'below-threshold' | 'running' | 'compacted' | 'abandoned' | 'failed';

export class MaintenanceController {
	private readonly now: () => number;
	private lastActivity: number;
	private inFlight = 0;
	private running: Promise<CompactResult> | undefined;
	private pending: AbortController | undefined;
	private timer: NodeJS.Timeout | undefined;
	private stopped = false;

	constructor(private readonly deps: MaintenanceDeps) {
		this.now = deps.now ?? Date.now;
		this.lastActivity = this.now();
	}

	/**
	 * A request arrived (the router reports every one). Returns the call to
	 * make when it ends; admin requests and subscription streams are not activity.
	 */
	requestArrived(method: string, cls: MethodClass | undefined): () => void {
		if (cls === 'admin' || UNHELD_METHODS.has(method)) return () => {};
		this.inFlight++;
		this.lastActivity = this.now();
		let ended = false;
		return () => {
			if (ended) return;
			ended = true;
			this.inFlight--;
			this.lastActivity = this.now();
		};
	}

	/** How long the daemon has been idle (0 while a non-admin request runs or a lane is busy). */
	idleForMs(): number {
		if (this.inFlight > 0 || !this.deps.lanesIdle()) return 0;
		return this.now() - this.lastActivity;
	}

	/** Check now whether to run idle maintenance, and run it if so. */
	async tick(): Promise<TickOutcome> {
		if (this.stopped) return 'not-idle';
		if (this.running !== undefined) return 'running';
		const idleMs = this.idleForMs();
		if (idleMs < this.deps.config.idleMs) return 'not-idle';
		if (!this.deps.healthy()) {
			log.warn({ idleMs }, 'maintenance: idle, but the graph store is not healthy; not compacting');
			return 'unhealthy';
		}
		const r = this.deps.reclaimable();
		const decision = { idleMs, fileBytes: r?.fileBytes, reclaimableBytes: r?.reclaimableBytes, reclaimablePct: r?.reclaimablePct, minPct: this.deps.config.minReclaimablePct, minMb: this.deps.config.minReclaimableMb };
		if (r === undefined || !worthCompacting(r, this.deps.config.minReclaimablePct, this.deps.config.minReclaimableMb)) {
			log.info(decision, 'maintenance: idle, below the reclaimable thresholds; not compacting');
			// Measured again after the next idle period.
			this.lastActivity = this.now();
			return 'below-threshold';
		}
		log.info(decision, 'maintenance: idle and worth it; compacting');
		const reason = `${Math.round(idleMs / 60_000)} min idle, ${r.reclaimablePct.toFixed(1)}% / ${Math.round(r.reclaimableBytes / 1024 / 1024)} MB reclaimable`;
		try {
			await this.run(reason);
			return 'compacted';
		} catch (err) {
			this.lastActivity = this.now();
			return err instanceof MaintenanceNotRunError ? 'abandoned' : 'failed';
		}
	}

	/** Run maintenance now (daemon.compact): compact whatever the idle state and thresholds. */
	runNow(): Promise<CompactResult> {
		return this.run('requested by daemon.compact');
	}

	/** While maintenance holds the lock: what daemon.status reports. From the lock table, so any thread reads the same. */
	status(): DaemonStatus['maintenance'] {
		const holder = getLockManager().query().held.find(l => l.name === MAINTENANCE_LOCK && l.mode === 'exclusive' && l.metadata !== undefined);
		if (holder === undefined || holder.metadata === undefined) return undefined;
		return { state: 'compacting', since: new Date(holder.since).toISOString(), activity: holder.metadata.activity, reason: holder.metadata.reason };
	}

	/** Check for idle maintenance every `everyMs`. */
	start(everyMs: number = Math.min(60_000, Math.max(250, this.deps.config.idleMs / 2))): void {
		this.timer = setInterval(() => { void this.tick(); }, everyMs);
		this.timer.unref();
	}

	/**
	 * Shutdown: no further maintenance; one still waiting for the lock gives up.
	 * Resolves once a compaction under way has finished.
	 */
	async stop(): Promise<void> {
		this.stopped = true;
		if (this.timer !== undefined) clearInterval(this.timer);
		this.pending?.abort(new MaintenanceNotRunError('the daemon is shutting down'));
		await this.running?.then(() => {}, () => {});
	}

	private run(reason: string): Promise<CompactResult> {
		if (this.running !== undefined) return this.running;
		if (this.stopped) return Promise.reject(new MaintenanceNotRunError('the daemon is shutting down'));
		if (!this.deps.healthy()) return Promise.reject(new MaintenanceNotRunError('maintenance: the graph store is not healthy'));
		this.running = this.compactUnderLock(reason).finally(() => { this.running = undefined; });
		return this.running;
	}

	private async compactUnderLock(reason: string): Promise<CompactResult> {
		const asked = this.now();
		const pending = new AbortController();
		this.pending = pending;
		const { pauseLimitMs } = this.deps.config;
		// The store losing its locks is terminal: a maintenance still waiting stops waiting and
		// takes the same path as every other store user (it never closes or compacts).
		const health = setInterval(() => {
			if (!this.deps.healthy()) pending.abort(new MaintenanceNotRunError('maintenance: the graph store is not healthy'));
		}, this.deps.healthPollMs ?? HEALTH_POLL_MS);
		health.unref();
		const stopIfUnhealthy = (step: string): void => {
			if (this.deps.healthy()) return;
			log.warn({ reason, step }, 'maintenance: the graph store is not healthy; stopped before it changed anything');
			throw new MaintenanceNotRunError('maintenance: the graph store is not healthy');
		};
		try {
			return await getLockManager().request(MAINTENANCE_LOCK, {
				mode: 'exclusive', timeoutMs: pauseLimitMs, signal: pending.signal,
				metadata: { activity: COMPACTION_ACTIVITY, reason },
			}, async () => {
				this.pending = undefined;
				clearInterval(health);
				stopIfUnhealthy('lock granted');
				log.info({ pauseAckMs: this.now() - asked, reason }, 'maintenance: every request has finished; closing the graph handles');
				await this.deps.onGranted?.();
				stopIfUnhealthy('before closing the graph handles');
				const closed = await this.closeWorkerHandles();
				stopIfUnhealthy('before compacting');
				const result = await this.deps.compact({
					// Every worker closed its handle and none was started since: the environment is really closed.
					beforeRename: async () => closed.allClosed && this.deps.workers.created() === closed.workers,
				});
				log.info({ ...result, reason }, 'maintenance: compaction done');
				return result;
			});
		} catch (err) {
			if (err instanceof LockTimeoutError) {
				log.warn({ pauseLimitMs, reason, holders: err.holders }, 'maintenance: a request ran past the pause limit; abandoned, nothing closed');
				throw new MaintenanceNotRunError(`daemon.compact: the daemon did not become idle within ${pauseLimitMs} ms; try again later`);
			}
			if (err instanceof MaintenanceNotRunError) throw err;
			if (pending.signal.aborted && pending.signal.reason instanceof MaintenanceNotRunError && !this.stopped) {
				log.warn({ reason }, 'maintenance: the graph store is not healthy; stopped waiting for the lock');
				throw pending.signal.reason;
			}
			if (pending.signal.aborted) {
				log.info({ reason }, 'maintenance: abandoned before it started (the daemon is shutting down)');
				throw new MaintenanceNotRunError('maintenance: abandoned, the daemon is shutting down');
			}
			log.error({ err: err instanceof Error ? err.message : String(err), reason }, 'maintenance: compaction failed');
			throw err;
		} finally {
			clearInterval(health);
			if (this.pending === pending) this.pending = undefined;
		}
	}

	/** Ask every ready worker to close its graph handle; wait for each answer (bounded). */
	private async closeWorkerHandles(): Promise<{ readonly allClosed: boolean; readonly workers: number }> {
		const workers = this.deps.workers.live();
		const created = this.deps.workers.created();
		let allClosed = created === workers.length;
		for (const w of workers) {
			const { port1, port2 } = new MessageChannel();
			const closed = new Promise<boolean>(resolve => {
				const timer = setTimeout(() => resolve(false), this.deps.ackMs ?? GRAPH_CLOSE_ACK_MS);
				port1.once('message', m => { clearTimeout(timer); resolve(m === 'closed'); });
			});
			pushToWorker(w.port, GRAPH_CLOSE_OP, port2, [port2]);
			const ok = await closed;
			port1.close();
			if (!ok) {
				allClosed = false;
				log.warn({ threadId: w.threadId }, 'maintenance: a worker did not acknowledge graph.close');
			}
		}
		return { allClosed, workers: created };
	}
}
