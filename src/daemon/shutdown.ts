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
import { armShutdownWatchdog } from './shutdown-watchdog.js';
import type { ShutdownWatchdog, WatchdogOptions } from './shutdown-watchdog.js';
import { clearPid } from './lifecycle.js';
import { daemonRunFiles, endForRunFileConflict, RunFileOwnershipError } from './run-file-ownership.js';

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
	exit: code => {
		try {
			daemonRunFiles.assertCurrentOwnership();
			// A fatal/backstop exit with an open listener must not leave a
			// libuv exit hook capable of unlinking a future owner's socket.
			if (daemonRunFiles.hasSocketPublication) {
				daemonRunFiles.clearRunFiles();
				process.kill(process.pid, 'SIGKILL'); return;
			}
		} catch (error) { endForRunFileConflict(error); return; }
		process.exit(code);
	},
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
	try { deps.clearPid(); } catch (error) {
		if (error instanceof RunFileOwnershipError) endForRunFileConflict(error, { logPath: deps.lastLinePath, killSelf: () => {} });
	}
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
	/** Explicit seam for tests; production always awaits the native-capability handshake. */
	readonly armWatchdog?: ((options: WatchdogOptions) => Promise<ShutdownWatchdog>) | undefined;
}

/** Long enough for the answer to a `daemon.shutdown` request to leave the
 *  socket before the process is killed. */
const REPLY_FLUSH_MS = 50;

/**
 * Build the daemon's shutdown handler. First await an independent watchdog's
 * kernel-capability readiness; no cleanup begins before it succeeds. Then:
 *
 *   1. the queue drains, the stores close, the pid file is cleared, exit(0);
 *   2. the independent watchdog enforces `hardExitMs`, including blocked native
 *      cleanup and exit hooks. An in-process timer is a secondary fallback.
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
		let watchdog: ShutdownWatchdog | undefined;
		const stage = (value: string): void => {
			try {
				mkdirSync(dirname(end.lastLinePath), { recursive: true });
				appendFileSync(end.lastLinePath, JSON.stringify({ time: new Date().toISOString(), module: 'shutdown-stage', signal, stage: value, health: end.storeHealth() }) + '\n');
			} catch { /* final diagnostics are best effort */ }
			watchdog?.stage(value);
		};
		const failClosed = (error: unknown): void => {
			stage(`shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
			try { end.clearPid(); } catch (cleanupError) {
				if (cleanupError instanceof RunFileOwnershipError) endForRunFileConflict(cleanupError, { logPath: end.lastLinePath, killSelf: () => {} });
			}
			end.killSelf();
		};
		stage('watchdog arm');
		const begin = async (): Promise<void> => {
			watchdog = await (parts.armWatchdog ?? armShutdownWatchdog)({ timeoutMs: hardExitMs, logPath: end.lastLinePath, onFailure: failClosed });
			stage('stop background work');
			parts.stopBackgroundWork();
			const health = end.storeHealth();
			if (health.state === 'locks-lost') {
				stage('locks lost: skip queue and store close');
				setTimeout(() => endAfterStoreFailure(`shutdown (${signal})`, health, end), REPLY_FLUSH_MS);
				return;
			}
			const backstop = setTimeout(() => {
				stage('in-process deadline fallback');
				const current = end.storeHealth();
				if (current.state === 'locks-lost') endAfterStoreFailure(`shutdown (${signal}), hard-exit backstop`, current, end);
				else failClosed(new Error('shutdown deadline exceeded'));
			}, hardExitMs);
			backstop.unref();
			stage('queue drain');
			const finish = async (): Promise<void> => {
				const current = end.storeHealth();
				if (current.state === 'locks-lost') {
					clearTimeout(backstop);
					endAfterStoreFailure(`shutdown (${signal})`, current, end); return;
				}
				stage('close stores and request server');
				await parts.closeStores();
				end.clearPid();
				parts.log.info('bye');
				clearTimeout(backstop);
				stage('exit hooks');
				// Do not disarm: a native process.exit hook can itself block.
				exitRespectingStoreHealth(0, `shutdown (${signal})`, end);
			};
			void parts.queueDone.then(finish, finish).catch(failClosed);
		};
		void begin().catch(failClosed);
	};
}
