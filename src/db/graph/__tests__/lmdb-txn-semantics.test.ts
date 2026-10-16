/**
 * ISSUE-5437d6e5, S001/t3 -- pin the lmdb-js behaviour the store's write
 * transactions rest on, so an lmdb upgrade that changes it fails here.
 *
 * withWriteTxn, the migration runner and the first-boot write run their
 * callbacks as CHILD transactions because lmdb's plain transaction() batches
 * callers into one shared write transaction and commits a throwing
 * callback's writes. Each case writes a key and throws, with lmdb directly;
 * the store is closed and the keys are read back in a fresh process.
 *
 * Run: npx tsx --test src/db/graph/__tests__/lmdb-txn-semantics.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { open } from 'lmdb';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../store.js';
import { useTemporaryLance } from '../../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

/** Read `keys` from the store at `path` in a new node process; returns which are present. */
function presentInFreshProcess(path: string, keys: readonly string[]): Record<string, boolean> {
	const script = `
		import { open } from 'lmdb';
		const root = open({ path: ${JSON.stringify(path)}, maxDbs: 4 });
		const db = root.openDB({ name: 'x', keyEncoding: 'binary', encoding: 'binary' });
		const out = {};
		for (const k of ${JSON.stringify(keys)}) out[k] = db.get(Buffer.from(k)) !== undefined;
		await root.close();
		process.stdout.write(JSON.stringify(out));
	`;
	// cwd is the repository, so the child resolves the same installed lmdb.
	return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), encoding: 'utf8' })) as Record<string, boolean>;
}

test('lmdb behaviour pin: after a reopen in a fresh process, root.transaction keeps a throwing callback\'s write, root.childTransaction and root.transactionSync discard it', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-lmdb-txn-pin-'));
	const path = join(dir, 'db');
	try {
		const root = open({ path, maxDbs: 4 });
		const db = root.openDB({ name: 'x', keyEncoding: 'binary', encoding: 'binary' });
		const K = (s: string): Buffer => Buffer.from(s);
		const boom = (): never => { throw new Error('boom'); };

		await assert.rejects(root.transaction(() => { void db.put(K('plain'), K('v')); boom(); }), /boom/);
		await assert.rejects(root.childTransaction(() => { void db.put(K('child'), K('v')); boom(); }), /boom/);
		assert.throws(() => root.transactionSync(() => { void db.put(K('sync'), K('v')); boom(); }), /boom/);
		await root.close();

		assert.deepEqual(presentInFreshProcess(path, ['plain', 'child', 'sync']), {
			plain: true,    // lmdb commits a throwing callback's writes in a plain transaction: the defect the store avoids
			child: false,   // a child transaction is aborted on a throw: what withWriteTxn and the migration runner use
			sync:  false,   // transactionSync is aborted on a throw: what withWriteTxnSync uses
		});
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('the store opens without writemap mode, so child transactions are available', async () => {
	await closeGraphStore();
	const dir = mkdtempSync(join(tmpdir(), 'insrc-lmdb-txn-open-'));
	try {
		setGraphStorePath(join(dir, 'graph.lmdb'));
		const store = await getGraphStore();
		// lmdb throws "Child transactions are not supported in writemap mode" here if the open options change.
		await store.root.childTransaction(() => { void store.meta.put('child-available', 'yes'); });
		assert.equal(store.meta.get('child-available'), 'yes');
		assert.equal(await withWriteTxn(s => { void s.meta.put('wrapper', 'ok'); return 'ok'; }), 'ok');
	} finally {
		await closeGraphStore();
		rmSync(dir, { recursive: true, force: true });
	}
});
