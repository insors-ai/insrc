/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Parent side of `store-child.ts` (Epic c2ba6fa6, Story s4): spawn a process
 * that holds a graph store, send it commands, read its answers, and end it.
 * Every child is ended by SIGKILL, never asked to exit: a process whose store
 * has lost its locks hangs in the library's exit hook.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { StoreChildCommand, StoreChildReply } from './store-child.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD_ENTRY = join(HERE, 'store-child.ts');
// Mirrors the constant in store-child.ts; importing it would run the child's module.
const REPLY_PREFIX = '@@store-child ';

export interface StoreChild {
	readonly pid: number;
	/** Send one command and wait for its answer; rejects after `timeoutMs`
	 *  (a broken process may block for ever) or when the child dies first. */
	send(cmd: StoreChildCommand, timeoutMs?: number): Promise<StoreChildReply>;
	/** End the child by SIGKILL and wait until it is gone. */
	kill(): Promise<void>;
}

const live = new Set<ChildProcess>();

/** End every child this module started. Call from the test file's `after`. */
export function killAllStoreChildren(): void {
	for (const c of live) { try { c.kill('SIGKILL'); } catch { /* gone */ } }
	live.clear();
}

/** `raw` — open the path with the library directly, not through the store
 *  module, so that the process has never read from the store. */
export async function spawnStoreChild(storePath: string, opts: { raw?: boolean; env?: NodeJS.ProcessEnv } = {}): Promise<StoreChild> {
	const env = opts.env ?? {};
	const child = spawn(process.execPath, ['--import', 'tsx/esm', CHILD_ENTRY, storePath, ...(opts.raw === true ? ['raw'] : [])], {
		stdio: ['pipe', 'pipe', 'inherit'],
		env: { ...process.env, ...env },
	});
	live.add(child);

	const waiting: Array<{ resolve: (r: StoreChildReply) => void; reject: (e: Error) => void }> = [];
	const unclaimed: StoreChildReply[] = [];
	let gone: Error | undefined;

	createInterface({ input: child.stdout! }).on('line', line => {
		if (!line.startsWith(REPLY_PREFIX)) return;   // log output
		const r = JSON.parse(line.slice(REPLY_PREFIX.length)) as StoreChildReply;
		const w = waiting.shift();
		if (w !== undefined) w.resolve(r); else unclaimed.push(r);
	});
	const exited = new Promise<void>(res => child.once('exit', (code, signal) => {
		live.delete(child);
		gone = new Error(`store child exited (code ${code}, signal ${signal})`);
		for (const w of waiting.splice(0)) w.reject(gone);
		res();
	}));

	function next(timeoutMs: number): Promise<StoreChildReply> {
		const ready = unclaimed.shift();
		if (ready !== undefined) return Promise.resolve(ready);
		if (gone !== undefined) return Promise.reject(gone);
		return new Promise<StoreChildReply>((resolve, reject) => {
			const entry = {
				resolve: (r: StoreChildReply) => { clearTimeout(timer); resolve(r); },
				reject:  (e: Error) => { clearTimeout(timer); reject(e); },
			};
			const timer = setTimeout(() => {
				const i = waiting.indexOf(entry);
				if (i >= 0) waiting.splice(i, 1);
				reject(new Error(`store child gave no answer within ${timeoutMs} ms`));
			}, timeoutMs);
			waiting.push(entry);
		});
	}

	const ready = await next(30_000);
	if (!ready.ok) throw new Error(`store child failed to start: ${ready.message}`);

	return {
		pid: child.pid ?? -1,
		send(cmd, timeoutMs = 15_000) {
			child.stdin!.write(`${JSON.stringify(cmd)}\n`);
			return next(timeoutMs);
		},
		async kill() {
			try { child.kill('SIGKILL'); } catch { /* gone */ }
			await exited;
		},
	};
}

/**
 * The sequence that removes a process's locks: process A opens the store and
 * writes; A opens and closes a second descriptor on the lock file (unless
 * `touchLockFile` is false, the control case); process B opens, writes and
 * closes. `raw` — both open the path with the library directly, so A has never
 * read. `env` — extra environment for A (a temporary HOME, for a test that
 * starts the request server in it). Returns A, still running; B is gone.
 */
export async function runLockLossSequence(storePath: string, opts: { touchLockFile?: boolean; raw?: boolean; env?: NodeJS.ProcessEnv } = {}): Promise<StoreChild> {
	const raw = opts.raw === true;
	const must = async (child: StoreChild, cmd: StoreChildCommand): Promise<void> => {
		const r = await child.send(cmd);
		if (!r.ok) throw new Error(`${cmd.op} failed: ${r.message}`);
	};
	const a = await spawnStoreChild(storePath, { raw, ...(opts.env !== undefined ? { env: opts.env } : {}) });
	await must(a, { op: 'open' });
	await must(a, { op: 'put', key: 'a' });
	if (opts.touchLockFile !== false) await must(a, { op: 'touch-lock-file' });

	const b = await spawnStoreChild(storePath, { raw });
	await must(b, { op: 'open' });
	await must(b, { op: 'put', key: 'b' });
	await must(b, { op: 'close' });
	await b.kill();
	return a;
}
