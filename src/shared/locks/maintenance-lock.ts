/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon maintenance lock (Epic 86197ac6, Story s2): the named lock
 * 'daemon.maintenance' that maintenance (graph compaction) takes exclusively,
 * and every other store user takes shared:
 *
 *   - a top-level request, with no wait: refused with the holder's activity,
 *     reason and start time while maintenance holds or awaits the lock;
 *   - a background write (timers, indexing jobs), with a bounded wait: it runs
 *     after maintenance instead of failing;
 *   - a subscription refresh, with no wait: skipped during maintenance.
 *
 * Work already under a hold in this async context does not ask again (a
 * nested in-daemon call). While maintenance compacts, getGraphStore on any
 * thread but the compactor's rejects with MaintenanceInProgressError.
 *
 * Only with daemon threads (enableMaintenanceLock on every daemon thread);
 * otherwise every helper just runs its work, as before.
 */

import { threadId } from 'node:worker_threads';

import { getLockManager } from './lock-manager.js';
import type { LockInfo, LockMetadata } from './lock-manager.js';

export const MAINTENANCE_LOCK = 'daemon.maintenance';
/** The activity maintenance names in its metadata while it compacts the graph store. */
export const COMPACTION_ACTIVITY = 'compaction';
/** How long a background write waits for maintenance before it fails. */
export const BACKGROUND_WAIT_MS = 60 * 60_000;

let enabled = false;

/** Turn the maintenance lock on for this thread (with daemon threads). */
export function enableMaintenanceLock(): void {
	enabled = true;
}

export function maintenanceLockEnabled(): boolean {
	return enabled;
}

/** Whether this async context already holds the maintenance lock (a nested call). */
export function holdsMaintenanceLock(): boolean {
	return enabled && getLockManager().holds(MAINTENANCE_LOCK);
}

/** What a refused request is answered with. */
export function busyMessage(blockedBy: readonly LockInfo[]): string {
	const holder = blockedBy.find(l => l.mode === 'exclusive') ?? blockedBy[0];
	const meta: LockMetadata = holder?.metadata ?? { activity: 'maintenance', reason: 'unknown' };
	const since = holder !== undefined ? new Date(holder.since).toISOString() : 'now';
	return `daemon busy: ${meta.activity} since ${since} (${meta.reason}); retry later`;
}

export type HoldOutcome<T> = { readonly ran: true; readonly value: T } | { readonly ran: false; readonly busy: string };

/** A top-level request: run under a shared hold taken with no wait, or report why not. */
export async function withRequestHold<T>(run: () => Promise<T>): Promise<HoldOutcome<T>> {
	if (!enabled || holdsMaintenanceLock()) return { ran: true, value: await run() };
	return getLockManager().request(MAINTENANCE_LOCK, { mode: 'shared', ifAvailable: true }, async (lock, blockedBy) =>
		lock === null ? { ran: false, busy: busyMessage(blockedBy) } as const : { ran: true, value: await run() } as const);
}

/** A background write (a timer, an indexing job): waits for maintenance (bounded), then runs under a shared hold. */
export async function withBackgroundHold<T>(run: () => Promise<T>, timeoutMs: number = BACKGROUND_WAIT_MS): Promise<T> {
	if (!enabled || holdsMaintenanceLock()) return run();
	return getLockManager().request(MAINTENANCE_LOCK, { mode: 'shared', timeoutMs }, () => run());
}

/** A subscription's refresh: runs under a shared hold taken with no wait; skipped (undefined) during maintenance. */
export async function withRefreshHold<T>(run: () => Promise<T>): Promise<T | undefined> {
	if (!enabled || holdsMaintenanceLock()) return run();
	return getLockManager().request(MAINTENANCE_LOCK, { mode: 'shared', ifAvailable: true }, lock => lock === null ? undefined : run());
}

export class MaintenanceInProgressError extends Error {
	override readonly name = 'MaintenanceInProgressError';
	constructor(readonly holder: LockInfo) {
		super(`the graph store is being compacted by daemon maintenance (since ${new Date(holder.since).toISOString()}); retry later`);
	}
}

/** Throw MaintenanceInProgressError when maintenance on another thread holds the lock to compact the graph store. */
export function assertNotCompactingElsewhere(): void {
	if (!enabled) return;
	const compactor = getLockManager().query().held.find(l =>
		l.name === MAINTENANCE_LOCK && l.mode === 'exclusive' && l.metadata?.activity === COMPACTION_ACTIVITY);
	if (compactor !== undefined && compactor.threadId !== threadId) throw new MaintenanceInProgressError(compactor);
}
