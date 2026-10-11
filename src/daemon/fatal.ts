/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's top-level crash handler, moved out of the entry point so it
 * can be registered, and tested, in a process that is not a whole daemon
 * (Epic c2ba6fa6, Story s4).
 *
 * Node 20+ kills the process by default on an unhandled rejection /
 * uncaught exception. The daemon's pino-roll transport runs in a
 * worker thread (async) so any pending log line is lost on
 * process.exit -- previously a daemon crash left agent.*.log silent
 * past the last successful flush, with no trace of WHY we died.
 *
 * We log THREE places, each as resilient as we can manage given the
 * imminent exit:
 *
 *   1. stderr (sync fd write) -- captured by the IDE's spawn redirect
 *      to /tmp/.insrc/daemon.stderr.log (electron-main side).
 *   2. /tmp/.insrc/daemon.crash.log (sync appendFileSync) -- always
 *      lands even when stderr isn't redirected (manual launches /
 *      tests / detached invocations).
 *   3. pino fatal -- best-effort. A short timer before the exit
 *      gives the worker-thread transport a chance to drain.
 *
 * All three log the kind (uncaughtException | unhandledRejection)
 * + the error message + stack, prefixed with an ISO timestamp so
 * post-mortem readers can correlate against agent.*.log lines.
 *
 * The exit itself respects the store's health: with the store's locks lost
 * the process ends by SIGKILL, never by process.exit (see shutdown.ts).
 */

import { appendFileSync, mkdirSync } from 'node:fs';

import { PATHS } from '../shared/paths.js';
import { exitRespectingStoreHealth, realEndDeps } from './shutdown.js';
import type { EndDeps } from './shutdown.js';

export interface FatalDeps {
	readonly logFatal: (o: object, m: string) => void;
	/** Directory of `daemon.crash.log`. */
	readonly crashLogDir?: string;
	readonly end?: EndDeps;
}

export function reportFatal(kind: 'uncaughtException' | 'unhandledRejection', reason: unknown, deps: FatalDeps): void {
	const err = reason instanceof Error ? reason : new Error(String(reason));
	const traceText = `[insrc-daemon][${new Date().toISOString()}][${kind}] ${err.message}\n${err.stack ?? '(no stack)'}\n`;
	try { process.stderr.write(traceText); } catch { /* stderr closed */ }
	try {
		const dir = deps.crashLogDir ?? PATHS.logDir;
		mkdirSync(dir, { recursive: true });
		appendFileSync(`${dir}/daemon.crash.log`, traceText);
	} catch { /* fs unavailable */ }
	try { deps.logFatal({ kind, err: err.message, stack: err.stack }, 'daemon fatal'); } catch { /* logger broken */ }
	// Hard exit on next tick so async writes have a chance to flush.
	// Using setTimeout(0) instead of setImmediate so pino's worker has
	// at least one event-loop turn -- empirically reliable on Node 20.
	setTimeout(() => { exitRespectingStoreHealth(1, `a fatal error (${kind})`, deps.end ?? realEndDeps); }, 50).unref();
}
