/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * How the daemon's process ends (Epic c2ba6fa6, Story s4). Split out of the
 * entry point so that the sequence can be run, and tested, in a process that
 * is not a whole daemon.
 *
 * The rule this file exists for: once the graph store's health is
 * `locks-lost`, the daemon NEVER calls `process.exit`. That call runs the
 * store library's exit hook, and with the locks gone the hook never returns —
 * on the main thread, so no timer can rescue it. Such a process ends by
 * SIGKILL to itself, which runs no exit hook, after it has removed its pid
 * file and socket and written one last line synchronously.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { getStoreHealth } from '../db/graph/store.js';
import type { StoreHealth } from '../db/graph/store.js';
import { PATHS } from '../shared/paths.js';
import { clearPid } from './lifecycle.js';

type LocksLost = Exclude<StoreHealth, { state: 'ok' }>;

/** The process-level acts of ending. Injected so tests can observe them. */
export interface EndDeps {
	/** Remove the pid file and the socket file. */
	readonly clearPid:     () => void;
	/** `process.exit` — only ever called while the store is healthy. */
	readonly exit:         (code: number) => void;
	/** SIGKILL to this process: no exit hook runs. */
	readonly killSelf:     () => void;
	/** The file that receives the last line (the daemon's log). */
	readonly lastLinePath: string;
	readonly storeHealth:  () => StoreHealth;
}

export const realEndDeps: EndDeps = {
	clearPid,
	exit: code => { process.exit(code); },
	killSelf: () => { process.kill(process.pid, 'SIGKILL'); },
	lastLinePath: PATHS.daemonLog,
	storeHealth: getStoreHealth,
};

/** The last line of a daemon whose store has failed. */
export function lastLineFor(reason: string, health: LocksLost, now: Date = new Date()): string {
	return (
		`[insrc-daemon][${now.toISOString()}] ending after ${reason}: the graph store's close was skipped ` +
		`because the store lost its locks (found at ${health.at} during: ${health.operation}); ` +
		`the process ends by SIGKILL to itself so that no exit hook runs\n`
	);
}

/**
 * End a process whose store has failed: remove the pid file and the socket,
 * write the last line synchronously (the log transport runs in a worker and
 * would lose it), and SIGKILL. Does not return in production.
 */
export function endAfterStoreFailure(reason: string, health: LocksLost, deps: EndDeps = realEndDeps): void {
	try { deps.clearPid(); } catch { /* best effort */ }
	try {
		mkdirSync(dirname(deps.lastLinePath), { recursive: true });
		appendFileSync(deps.lastLinePath, lastLineFor(reason, health));
	} catch { /* fs unavailable */ }
	deps.killSelf();
}

/**
 * `process.exit(code)` while the store is healthy; the SIGKILL ending once it
 * has failed. Every exit of the daemon goes through here.
 */
export function exitRespectingStoreHealth(code: number, reason: string, deps: EndDeps = realEndDeps): void {
	const health = deps.storeHealth();
	if (health.state === 'locks-lost') endAfterStoreFailure(reason, health, deps);
	else deps.exit(code);
}

export interface ShutdownParts {
	readonly log: { info(o: object | string, m?: string): void; warn(o: object | string, m?: string): void };
	/** Stop everything that produces work, in order: timers, the queue, the
	 *  chat handlers, the watcher, the request server. Synchronous starts only;
	 *  nothing here is awaited. */
	readonly stopBackgroundWork: () => void;
	/** Settles when the queue's drain loop has returned. */
	readonly queueDone: Promise<unknown>;
	/** Close the stores, in order. Runs after the queue has drained. */
	readonly closeStores: () => Promise<void>;
	readonly end?: EndDeps;
	/** Fires whether or not the queue drained. Must stay below the IDE's
	 *  terminate grace (30 s) so the daemon clears its pid before a SIGKILL. */
	readonly hardExitMs?: number;
}

/** Long enough for the answer to a `daemon.shutdown` request to leave the
 *  socket before the process is killed. */
const REPLY_FLUSH_MS = 50;

/**
 * Build the daemon's shutdown handler. Two timelines race, as before:
 *
 *   1. the queue drains, the stores close, the pid file is cleared, exit(0);
 *   2. the hard-exit backstop fires at `hardExitMs` regardless of the queue.
 *
 * With the store's health `locks-lost` neither is used. A job held in a store
 * call would never finish, so the shutdown does not wait for the queue: it
 * stops the background work, skips the store's close, and ends the process by
 * SIGKILL (see the head of this file). The same ending replaces the exit of
 * either timeline if the store fails while the shutdown is under way.
 */
export function createShutdown(parts: ShutdownParts): (signal: string) => void {
	const end = parts.end ?? realEndDeps;
	const hardExitMs = parts.hardExitMs ?? 20_000;
	let started = false;
	let ended = false;

	return function shutdown(signal: string): void {
		// Re-entrant safety: SIGINT followed by SIGTERM (or vice
		// versa) shouldn't restart the timers / double-emit "bye".
		if (started) {
			parts.log.warn({ signal }, 'shutdown signal received again; already in progress');
			return;
		}
		started = true;
		// Log synchronously at the top so even a SIGKILL race leaves
		// at least the receipt line in agent.*.log. pino's worker-
		// thread transport may not flush this in time, but it's the
		// best-effort bookend matching the daemon-crash handler.
		parts.log.info({ signal }, 'shutdown signal received; draining...');
		parts.stopBackgroundWork();

		const health = end.storeHealth();
		if (health.state === 'locks-lost') {
			parts.log.warn({ signal, operation: health.operation }, 'shutdown: the graph store lost its locks; not waiting for the queue, skipping the store close');
			setTimeout(() => { if (ended) return; ended = true; endAfterStoreFailure(`shutdown (${signal})`, health, end); }, REPLY_FLUSH_MS);
			return;
		}

		// Hard-exit backstop reports incomplete cleanup as failure, whether or not the queue drained.
		// `unref()` so the timer doesn't keep the event loop alive on
		// its own; queue drain finishing first lets us exit early.
		const backstop = setTimeout(() => {
			if (ended) return; ended = true;
			parts.log.warn({ ms: hardExitMs }, 'shutdown: hard-exit backstop fired (queue drain stalled)');
			try { end.clearPid(); } catch { /* nothing */ }
			exitRespectingStoreHealth(1, `shutdown (${signal}), hard-exit backstop`, end);
		}, hardExitMs);
		backstop.unref();

		void parts.queueDone.then(() => false, () => true).then(async queueFailed => {
			if (ended) return;
			// The store may have failed while the queue drained: its close
			// would then never return.
			const now = end.storeHealth();
			if (now.state === 'locks-lost') {
				clearTimeout(backstop);
				ended = true;
				endAfterStoreFailure(`shutdown (${signal})`, now, end);
				return;
			}
			await parts.closeStores();
			if (ended) return; ended = true;
			end.clearPid();
			parts.log.info(queueFailed ? 'shutdown: queue drain failed' : 'bye');
			clearTimeout(backstop);
			exitRespectingStoreHealth(queueFailed ? 1 : 0, `shutdown (${signal})`, end);
		}).catch(() => {
			if (ended) return; ended = true;
			clearTimeout(backstop);
			try { end.clearPid(); } catch { /* best effort */ }
			parts.log.warn('shutdown: cleanup failed; ending with pending resources');
			exitRespectingStoreHealth(1, `shutdown (${signal}), cleanup pending`, end);
		});
	};
}
