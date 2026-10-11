/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A child process that holds a graph store, for the two-process tests of
 * Epic c2ba6fa6, Story s4. It opens the store at the path given as its first
 * argument through the real store module (so the real library), then obeys
 * one JSON command per line on standard input and answers each with one line
 * on standard output, prefixed so that log output can never be mistaken for
 * an answer.
 *
 * With `raw` as its second argument it opens the path with the library
 * directly instead. The store module reads from the store while opening it, and
 * a process that has read before fails differently from one that has not; the
 * raw mode is how a test gets a process that has never read.
 *
 * A process whose store has lost its locks never exits by itself (the
 * library's exit hook hangs), so this process ends ONLY by SIGKILL: from the
 * test, or from itself when its parent is gone or its input closes.
 *
 * Driven by `store-child-driver.ts`; not a test file.
 */

import { closeSync, openSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { open } from 'lmdb';
import type { Database, RootDatabase } from 'lmdb';

import {
	closeGraphStore, getGraphStore, getStoreHealth, setGraphStorePath, setWriteProbeAfterMsForTests,
	startPeriodicReaderCheck, withWriteTxn, withWriteTxnSync,
} from '../../store.js';

export const REPLY_PREFIX = '@@store-child ';

export type StoreChildCommand =
	| { op: 'open' }
	/** Asynchronous single write through the library, awaited. */
	| { op: 'put'; key: string }
	/** Open and close a SECOND descriptor on the store's lock file. */
	| { op: 'touch-lock-file' }
	| { op: 'read'; key: string }
	/** `transactionSync` on the root database. */
	| { op: 'txn-sync'; key: string }
	/** `transaction` on the root database, raced against `waitMs`. */
	| { op: 'txn-async'; key: string; waitMs: number }
	| { op: 'close' }
	/** `withWriteTxn`, with the wait before the probe shortened to `probeAfterMs`. */
	| { op: 'wrapper-async'; key: string; probeAfterMs: number }
	/** `withWriteTxnSync`. */
	| { op: 'wrapper-sync'; key: string }
	/** `getGraphStore()` again. */
	| { op: 'get-store' }
	/** `closeGraphStore()`, reporting whether the library's close was called. */
	| { op: 'wrapper-close' }
	| { op: 'health' }
	/** Start the daemon's request server (on the socket of this process's
	 *  home) with handlers that READ the store: `test.read` as a standard
	 *  handler, `test.stream` as a stream handler. Answers with the socket path. */
	| { op: 'serve' }
	/** Start the daemon's periodic reader check with a shortened interval. */
	| { op: 'reader-check-every'; ms: number };

export type StoreChildReply =
	| { ok: true; value?: unknown; settled?: boolean }
	| { ok: false; code?: number | string; name?: string; elapsedMs?: number; message: string };

const storePath = process.argv[2];
if (storePath === undefined) throw new Error('usage: store-child <store path> [raw]');
const raw = process.argv[3] === 'raw';
setGraphStorePath(storePath);

function die(): never {
	process.kill(process.pid, 'SIGKILL');
	throw new Error('unreachable');
}

// Never outlive the test.
const parent = process.ppid;
setInterval(() => { if (process.ppid !== parent) die(); }, 250);

/** The root database and the one sub-database the commands use. */
interface Handles { root: RootDatabase; meta: Database; }
let store: Handles | undefined;
function opened(): Handles {
	if (store === undefined) throw new Error('store is not open');
	return store;
}

async function run(cmd: StoreChildCommand): Promise<StoreChildReply> {
	switch (cmd.op) {
		case 'open':
			if (raw) {
				const root = open({ path: storePath as string, maxDbs: 8 });
				store = { root, meta: root };
			} else {
				const s = await getGraphStore();
				store = { root: s.root, meta: s.meta };
			}
			return { ok: true };
		case 'put':
			await opened().meta.put(cmd.key, '1');
			return { ok: true };
		case 'touch-lock-file':
			closeSync(openSync(`${storePath}-lock`, 'r'));
			return { ok: true };
		case 'read':
			return { ok: true, value: opened().meta.get(cmd.key) ?? null };
		case 'txn-sync': {
			const s = opened();
			s.root.transactionSync(() => { s.meta.putSync(cmd.key, '1'); });
			return { ok: true };
		}
		case 'txn-async': {
			const s = opened();
			const txn = s.root.transaction(() => { void s.meta.put(cmd.key, '1'); }).then(() => 'settled' as const);
			const outcome = await Promise.race([
				txn,
				new Promise<'pending'>(res => setTimeout(() => res('pending'), cmd.waitMs)),
			]);
			return { ok: true, settled: outcome === 'settled' };
		}
		case 'wrapper-async': {
			setWriteProbeAfterMsForTests(cmd.probeAfterMs);
			const started = Date.now();
			try {
				await withWriteTxn(s => { void s.meta.put(cmd.key, '1'); });
			} catch (e) {
				throw Object.assign(e as Error, { elapsedMs: Date.now() - started });
			}
			return { ok: true };
		}
		case 'wrapper-sync': {
			const s = await getGraphStore();
			withWriteTxnSync(s, () => { s.meta.putSync(cmd.key, '1'); });
			return { ok: true };
		}
		case 'get-store':
			await getGraphStore();
			return { ok: true };
		case 'wrapper-close': {
			const root = opened().root;
			let libraryCloseCalls = 0;
			const real = root.close.bind(root);
			root.close = (() => { libraryCloseCalls++; return real(); }) as typeof root.close;
			await closeGraphStore();
			return { ok: true, value: { libraryCloseCalls } };
		}
		case 'health':
			return { ok: true, value: getStoreHealth() };
		case 'serve': {
			const { IpcServer } = await import('../../../../daemon/server.js');
			const { PATHS } = await import('../../../../shared/paths.js');
			const server = new IpcServer(
				{ 'test.read': async () => opened().meta.get('a') ?? null },
				{ 'test.stream': async (_params, send) => { send({ id: 0, stream: 'done', data: opened().meta.get('a') ?? null }); } },
			);
			await server.listen();
			return { ok: true, value: PATHS.sockFile };
		}
		case 'reader-check-every':
			startPeriodicReaderCheck(cmd.ms);
			return { ok: true };
		case 'close':
			if (raw) await opened().root.close(); else await closeGraphStore();
			store = undefined;
			return { ok: true };
	}
}

function reply(r: StoreChildReply): void {
	process.stdout.write(`${REPLY_PREFIX}${JSON.stringify(r)}\n`);
}

const lines = createInterface({ input: process.stdin });
lines.on('close', die);

// One command at a time, in order.
let chain: Promise<void> = Promise.resolve();
lines.on('line', line => {
	chain = chain.then(async () => {
		try {
			reply(await run(JSON.parse(line) as StoreChildCommand));
		} catch (e) {
			const err = e as { code?: number | string; name?: string; message?: string; elapsedMs?: number };
			reply({
				ok: false,
				...(err.code !== undefined ? { code: err.code } : {}),
				...(err.name !== undefined ? { name: err.name } : {}),
				...(err.elapsedMs !== undefined ? { elapsedMs: err.elapsedMs } : {}),
				message: String(err.message ?? e),
			});
		}
	});
});

reply({ ok: true });   // ready
