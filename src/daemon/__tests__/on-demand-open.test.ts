/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-fefa97b991537da7 — saved connections open on first use, not at daemon start. Real daemons with
 * keytar replaced below the keystore (fixtures/fake-keytar.ts), so no test reaches the real Keychain.
 *
 * Run: npx tsx --test --test-force-exit src/daemon/__tests__/on-demand-open.test.ts
 */

import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rpc, sockOf, startDaemon } from '../../mcp/__tests__/helpers/mcp-e2e.js';
import { closeDefaultManagedRoots, ensureDefaultManagedRoot } from '../db/management-defaults.js';
import { connectionsPath } from '../db/config.js';
import { savedManagementFor } from '../db/management.js';

const PRELOAD = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-keytar.ts');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-on-demand-')));
const HOME = join(base, 'home'), KEYTAR = join(base, 'keytar'), REPO = join(base, 'repo'), PLAIN = join(base, 'plain');
const LOG = join(KEYTAR, 'calls.log'), REFUSE = join(KEYTAR, 'refuse');
const start = () => startDaemon(HOME, { preload: PRELOAD, env: { INSRC_TEST_KEYTAR_DIR: KEYTAR } });
const calls = (): string[] => existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(l => l.length > 0) : [];
const clearCalls = (): void => { writeFileSync(LOG, ''); };
const list = (repoRoot: string) => rpc(sockOf(HOME), 'db.connections.v2.list', { repoRoot });

before(async () => {
	for (const dir of [HOME, KEYTAR, REPO, PLAIN]) mkdirSync(dir, { recursive: true });
	const daemon = await start();
	await rpc(daemon.sock, 'repo.add', { path: REPO });
	await rpc(daemon.sock, 'repo.add', { path: PLAIN });
	// The first management request sets the repository up, leaving a managed root for the restarts below.
	await rpc(daemon.sock, 'db.connections.v2.capabilities', { repoRoot: REPO });
	assert.ok(calls().length > 0, 'set-up reached the keystore, so a later zero is meaningful');
	await daemon.stop();
});
after(() => { rmSync(base, { recursive: true, force: true }); });

test('boot: a daemon start reads nothing from the Keychain and opens its socket', async () => {
	clearCalls();
	const daemon = await start();
	try {
		assert.ok(existsSync(daemon.sock));
		await rpc(daemon.sock, 'daemon.status');
		assert.deepEqual(calls(), []);
	} finally { await daemon.stop(); }
});

test('on-demand: the first management request opens the repository and a later one does not reopen it', async () => {
	const daemon = await start();
	try {
		clearCalls();
		await list(REPO);
		const first = calls().length;
		assert.ok(first > 0, 'the first request opened the repository');
		await list(REPO);
		assert.ok(calls().length - first <= 1, 'the second request found it open: at most its availability check');
	} finally { await daemon.stop(); }
});

test('on-demand: a refused Keychain read reports secret-unavailable and the next request retries', async () => {
	const daemon = await start();
	try {
		writeFileSync(REFUSE, '');
		assert.equal((await list(REPO) as { code?: string }).code, 'secret-unavailable');
		rmSync(REFUSE);
		assert.ok(Array.isArray(await list(REPO)), 'the next request opened the repository');
	} finally { rmSync(REFUSE, { force: true }); await daemon.stop(); }
});

test('on-demand: a plain listing of an unmanaged repository touches nothing', async () => {
	const daemon = await start();
	try {
		clearCalls();
		await list(PLAIN);
		assert.deepEqual(calls(), []);
		assert.equal(existsSync(dirname(connectionsPath(PLAIN))), false, 'no state was created');
	} finally { await daemon.stop(); }
});

const denying = { getKey: async () => { throw new Error('denied'); }, setKey: async () => {}, deleteKey: async () => {} };

test('on-demand: a refused first-time set-up leaves nothing on disk', async () => {
	const root = join(base, 'fresh');
	mkdirSync(root);
	await assert.rejects(ensureDefaultManagedRoot(root, { isRegistered: async c => c === root, keystore: denying }));
	assert.deepEqual(readdirSync(root), []);
	assert.equal(savedManagementFor(root), undefined);
});

// Last: closing the default roots is final for this process.
test('on-demand: shutdown closes every root opened on demand', async () => {
	const root = join(base, 'opened');
	mkdirSync(root);
	const values = new Map<string, string>();
	const keystore = { getKey: async (k: string) => values.get(k) ?? null, setKey: async (k: string, v: string) => { values.set(k, v); }, deleteKey: async (k: string) => { values.delete(k); } };
	await ensureDefaultManagedRoot(root, { isRegistered: async c => c === root, keystore });
	assert.ok(savedManagementFor(root));
	await closeDefaultManagedRoots();
	assert.equal(savedManagementFor(root), undefined);
});
