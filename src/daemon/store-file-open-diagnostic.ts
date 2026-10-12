/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Who opens the graph store's own files inside the daemon? (Epic c2ba6fa6,
 * Story s4.) Opening and closing a second descriptor on the store's lock file
 * drops the daemon's lock on it, and the code in the daemon that has done so
 * is not identified. So that the next occurrence names it, the functions of
 * Node's fs and fs/promises that open a file by path are wrapped at start-up:
 * an open of the live store's data or lock file logs its call stack at warn,
 * once per distinct stack, and then proceeds unchanged.
 *
 * Best effort: a route into the file system that goes around these functions
 * (native code, a child process) is not seen. The store library opens its
 * files natively, so it is never reported.
 */

import { createRequire, syncBuiltinESMExports } from 'node:module';
import { lstatSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isLiveStoreFile } from '../db/graph/store.js';
import { getLogger } from '../shared/logger.js';

const require = createRequire(import.meta.url);
// The CommonJS objects: their properties are what the built-in ES modules export.
const fsCjs = require('node:fs') as Record<string, unknown> & { promises: Record<string, unknown> };

const FS_FUNCTIONS = ['open', 'openSync', 'readFile', 'readFileSync', 'copyFile', 'copyFileSync', 'cp', 'cpSync', 'createReadStream'] as const;
const PROMISE_FUNCTIONS = ['open', 'readFile', 'copyFile', 'cp'] as const;

export interface StoreFileOpenReport {
	readonly fn: string;
	readonly path: string;
	readonly stack: string;
}

export interface DiagnosticOpts {
	/** Where a report goes. Default: a warn line on the daemon's log. */
	readonly report?: (r: StoreFileOpenReport) => void;
}

const originals: Array<{ target: Record<string, unknown>; name: string; fn: unknown }> = [];
let reentrant = false;
let insideSyncCall = 0;

function pathOf(arg: unknown): string | undefined {
	if (typeof arg === 'string') return arg;
	if (Buffer.isBuffer(arg)) return arg.toString();
	if (arg instanceof URL && arg.protocol === 'file:') return fileURLToPath(arg);
	return undefined;
}

/** Cheap first: only a path named like the store, or a link, is resolved. */
function mayBeStoreFile(path: string): boolean {
	if (basename(path).startsWith('graph.lmdb')) return true;
	try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
}

/** Install the wraps. Returns a function that removes them. Idempotent. */
export function installStoreFileOpenDiagnostic(opts: DiagnosticOpts = {}): () => void {
	if (originals.length > 0) return uninstallStoreFileOpenDiagnostic;
	const log = getLogger('store-file-open');
	const report = opts.report ?? (r => {
		log.warn({ fn: r.fn, path: r.path, stack: r.stack }, "a file of the graph store was opened inside the daemon; this can drop the daemon's lock on the store");
	});
	const seen = new Set<string>();

	const check = (fn: string, arg: unknown): void => {
		if (reentrant) return;
		const path = pathOf(arg);
		if (path === undefined || !mayBeStoreFile(path)) return;
		reentrant = true;
		try {
			if (!isLiveStoreFile(path)) return;
			// The caller's frames: drop this module's own two.
			const stack = (new Error().stack ?? '').split('\n').slice(3).join('\n');
			if (seen.has(stack)) return;
			seen.add(stack);
			report({ fn, path, stack });
		} catch { /* never break an open */ } finally {
			reentrant = false;
		}
	};

	const wrap = (target: Record<string, unknown>, name: string, label: string): void => {
		const original = target[name];
		if (typeof original !== 'function') return;
		originals.push({ target, name, fn: original });
		const sync = name.endsWith('Sync');
		const wrapped = function (this: unknown, ...args: unknown[]): unknown {
			if (insideSyncCall === 0) {
				check(label, args[0]);
				if (/copyFile|\bcp/.test(label)) check(label, args[1]);
			}
			if (!sync) return (original as (...a: unknown[]) => unknown).apply(this, args);
			// Node's own readFileSync calls openSync: report the outer call only.
			insideSyncCall++;
			try { return (original as (...a: unknown[]) => unknown).apply(this, args); } finally { insideSyncCall--; }
		};
		Object.defineProperty(wrapped, 'name', { value: name });
		target[name] = wrapped;
	};

	for (const name of FS_FUNCTIONS) wrap(fsCjs, name, `fs.${name}`);
	for (const name of PROMISE_FUNCTIONS) wrap(fsCjs.promises, name, `fs.promises.${name}`);
	// Code that imported the functions by name sees the wraps too.
	syncBuiltinESMExports();
	return uninstallStoreFileOpenDiagnostic;
}

export function uninstallStoreFileOpenDiagnostic(): void {
	for (const o of originals.splice(0)) o.target[o.name] = o.fn;
	syncBuiltinESMExports();
}
