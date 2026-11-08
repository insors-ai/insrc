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
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rpc, sockOf, startDaemon } from '../../mcp/__tests__/helpers/mcp-e2e.js';
import { connectionsPath } from '../db/config.js';
import { managementStateDirectory } from '../db/managed-store.js';
import { PATHS } from '../../shared/paths.js';

const PRELOAD = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-keytar.ts');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-on-demand-')));
const HOME = join(base, 'home'), KEYTAR = join(base, 'keytar'), REPO = join(base, 'repo'), SECOND = join(base, 'second'), PLAIN = join(base, 'plain');
const LOG = join(KEYTAR, 'calls.log'), REFUSE = join(KEYTAR, 'refuse');
const start = () => startDaemon(HOME, { preload: PRELOAD, env: { INSRC_TEST_KEYTAR_DIR: KEYTAR } });
const calls = (): string[] => existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(l => l.length > 0) : [];
const clearCalls = (): void => { writeFileSync(LOG, ''); };
// The daemon's HOME, not this process's: connectionsPath is rooted at the HOME of whoever calls it.
const daemonPath = (path: string): string => join(HOME, '.insrc', relative(PATHS.insrc, path));
const ownerLease = (repoRoot: string): string => daemonPath(join(managementStateDirectory(connectionsPath(repoRoot)), 'owner.json'));
const list = (repoRoot: string) => rpc(sockOf(HOME), 'db.connections.v2.list', { repoRoot });

before(async () => {
	for (const dir of [HOME, KEYTAR, REPO, SECOND, PLAIN]) mkdirSync(dir, { recursive: true });
	const daemon = await start();
	await rpc(daemon.sock, 'repo.add', { path: REPO });
	await rpc(daemon.sock, 'repo.add', { path: SECOND });
	await rpc(daemon.sock, 'repo.add', { path: PLAIN });
	// The first management request sets the repository up, leaving a managed root for the restarts below.
	await rpc(daemon.sock, 'db.connections.v2.capabilities', { repoRoot: REPO });
	await rpc(daemon.sock, 'db.connections.v2.capabilities', { repoRoot: SECOND });
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
		assert.ok(Array.isArray(await list(REPO)));
		const first = calls().length;
		assert.ok(first > 1, 'the first request opened the repository');
		assert.ok(Array.isArray(await list(REPO)));
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
		assert.equal(existsSync(dirname(daemonPath(connectionsPath(PLAIN)))), false, 'no state was created');
	} finally { await daemon.stop(); }
});

test('on-demand: a refused first-time set-up leaves nothing on disk', async () => {
	const fresh = join(base, 'fresh');
	mkdirSync(fresh);
	const daemon = await start();
	try {
		await rpc(daemon.sock, 'repo.add', { path: fresh });
		const registered = readdirSync(fresh);
		writeFileSync(REFUSE, '');
		const answer = await rpc(daemon.sock, 'db.connections.v2.capabilities', { repoRoot: fresh }).catch((error: Error) => error) as { code?: string; message?: string };
		assert.match(`${answer.code ?? ''} ${answer.message ?? ''}`, /secret-unavailable/, 'the refusal is what stopped the set-up');
		assert.equal(existsSync(dirname(daemonPath(connectionsPath(fresh)))), false, 'the repository state directory was not created');
		assert.deepEqual(readdirSync(fresh), registered);
	} finally { rmSync(REFUSE, { force: true }); await daemon.stop(); }
});

test('on-demand: shutdown closes every root opened on demand', async () => {
	const daemon = await start();
	assert.equal(existsSync(ownerLease(REPO)), false, 'a start opens nothing');
	await list(REPO);
	await list(SECOND);
	assert.ok(existsSync(ownerLease(REPO)) && existsSync(ownerLease(SECOND)), 'both repositories are held open');
	await daemon.stop();
	// A root's close releases its owner lease, and a process that merely exits leaves the file behind.
	assert.equal(existsSync(ownerLease(REPO)), false);
	assert.equal(existsSync(ownerLease(SECOND)), false);
});
