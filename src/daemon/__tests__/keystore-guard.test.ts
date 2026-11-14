/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-fefa97b991537da7 — the offline maintenance tool and a daemon never use the vault together. Real
 * daemons and the real maintenance binary, with keytar replaced below the keystore (fixtures/fake-keytar.ts).
 *
 * Run: npx tsx --test --test-force-exit src/daemon/__tests__/keystore-guard.test.ts
 */

import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

import { childEnv, REPO_ROOT, rpc, startDaemon } from '../../mcp/__tests__/helpers/mcp-e2e.js';
import { acquireRunFileGuard } from '../../shared/daemon-run-files.js';
import { readProcessIdentity } from '../../shared/daemon-process.js';
import { PATHS } from '../../shared/paths.js';
import { connectionsPath, repoIdOf } from '../db/config.js';
import { writeProtected } from '../db/management-files.js';
import { makeSecretRef } from '../db/secrets.js';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-keytar.ts');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-guard-')));
const HOME = join(base, 'home'), KEYTAR = join(base, 'keytar'), REPO = join(base, 'repo');
const LOG = join(KEYTAR, 'calls.log');
const daemonPath = (path: string): string => join(HOME, '.insrc', relative(PATHS.insrc, path));
const GUARD = daemonPath(PATHS.vaultGuard), SOCKET = daemonPath(PATHS.sockFile);
const VAULT_READ = 'get insrc-vault secrets';
const calls = (): string[] => existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(l => l.length > 0) : [];
const start = () => startDaemon(HOME, { preload: FIXTURE, env: { INSRC_TEST_KEYTAR_DIR: KEYTAR } });

function maintenance(proof: string) {
	return spawnSync(process.execPath, ['--import', 'tsx/esm', '--import', FIXTURE, join(REPO_ROOT, 'src/bin/insrc-connection-maintenance.ts'), REPO, proof], {
		cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000,
		env: { ...childEnv(HOME), INSRC_TEST_KEYTAR_DIR: KEYTAR, INSRC_LOG_LEVEL: 'silent' },
	});
}

before(async () => {
	for (const dir of [HOME, KEYTAR, REPO]) mkdirSync(dir, { recursive: true });
	const daemon = await start();
	await rpc(daemon.sock, 'repo.add', { path: REPO });
	await daemon.stop();
});
after(() => { rmSync(base, { recursive: true, force: true }); });

test('guard: a daemon holding no vault fails requests while maintenance holds the guard and succeeds after release', async () => {
	writeFileSync(LOG, '');
	const guard = acquireRunFileGuard(GUARD);
	const daemon = await start();
	try {
		await assert.rejects(rpc(daemon.sock, 'keys.get', { name: 'a' }), /credential store is unavailable/);
		assert.deepEqual(calls(), [], 'no Keychain access while the guard is held');
		guard.release();
		assert.deepEqual(await rpc(daemon.sock, 'keys.get', { name: 'a' }), { name: 'a', exists: false }, 'no remembered failure');
		assert.ok(calls().includes(VAULT_READ));
	} finally { await daemon.stop(); }
});

test('guard: maintenance refuses and releases the guard when the daemon socket exists after acquiring it', () => {
	writeFileSync(LOG, '');
	writeFileSync(SOCKET, '');
	try {
		const run = maintenance(join(base, 'never-read.json'));
		assert.equal(run.status, 1, run.stderr);
		assert.match(run.stderr, /Connection maintenance failed/);
		assert.equal(existsSync(GUARD), false, 'the guard was released');
		assert.ok(calls().includes('daemon-check guard=true'), `the guard was held during the check: ${calls().join(', ')}`);
		assert.deepEqual(calls().filter(c => c.startsWith('get ') || c.startsWith('set ')), [], 'the vault was not touched');
	} finally { rmSync(SOCKET, { force: true }); }
});

/** The full maintenance-admission fixture: vault store, connections registry, a fresh stop proof. */
async function seedMaintenanceFixture(): Promise<{ proof: string; refs: [string, string][] }> {
	const refs = ['warehouse', 'orders', 'billing'].map(id => [id, makeSecretRef(repoIdOf(REPO), id)] as const);
	writeFileSync(join(KEYTAR, 'store.json'), JSON.stringify({
		'insrc-vault/secrets': JSON.stringify({ version: 1, secrets: Object.fromEntries(refs.map(([id, ref]) => [ref, `secret-${id}`])), retired: [] }),
	}));
	const registry = daemonPath(connectionsPath(REPO));
	mkdirSync(dirname(registry), { recursive: true, mode: 0o700 });
	rmSync(registry, { force: true }); // the tool leaves it write-protected
	writeFileSync(registry, JSON.stringify({ connections: refs.map(([id, ref]) => ({ id, kind: 'postgres', url: `postgres://user:\${secret:${ref}}@host/db`, secretRef: ref })) }), { mode: 0o600 });
	rmSync(join(dirname(registry), 'connection-management'), { recursive: true, force: true });
	const proof = join(base, `stop-${randomUUID()}.json`);
	await writeProtected(proof, JSON.stringify({ source: 'safe-stop-control', pid: 2147483647, processIdentity: 'b'.repeat(64), stoppedAt: new Date().toISOString() }), true);
	return { proof, refs: refs.map(([id, ref]) => [id, ref] as [string, string]) };
}

test('maintenance: the offline tool reads the vault once', async () => {
	writeFileSync(LOG, '');
	const { proof, refs } = await seedMaintenanceFixture();
	const run = maintenance(proof);
	assert.equal(run.status, 0, run.stderr);
	assert.ok(existsSync(join(dirname(daemonPath(connectionsPath(REPO))), 'connection-management')), 'the tool did its work');
	assert.equal(calls().filter(c => c === VAULT_READ).length, 1, calls().join(', '));
	assert.deepEqual(calls().filter(c => refs.some(([, ref]) => c === `get insrc ${ref}`)), [], 'the secrets came from the vault');
	assert.equal(existsSync(GUARD), false);
});

test('vault guard reclaims a genuinely-exited-owner guard through the real readProcessIdentity verdict path', async () => {
	writeFileSync(LOG, '');
	// A real short-lived process, whose recorded identity is then genuinely dead: the offline tool's
	// acquireVaultGuard goes through the shared acquireRunFileGuard with the real, uninjected reader.
	const child = spawn(process.execPath, ['-e', 'process.on("message", () => process.exit(0))'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
	const identity = readProcessIdentity(child.pid);
	assert.ok(identity !== undefined, 'the child identity was captured while it was alive');
	const ended = once(child, 'exit'); child.send('exit'); await ended;
	const record = JSON.stringify({ owner: identity, nonce: 'exited-owner' });
	mkdirSync(dirname(GUARD), { recursive: true });
	mkdirSync(GUARD);
	writeFileSync(join(GUARD, 'owner.json'), record);
	const { proof } = await seedMaintenanceFixture();
	const run = maintenance(proof);
	assert.equal(run.status, 0, run.stderr);
	assert.equal(existsSync(GUARD), false, 'the tool released the reclaimed guard');
	const quarantined = readdirSync(dirname(GUARD)).filter((name) => name.startsWith('vault.guard.quarantine-'));
	assert.equal(quarantined.length, 1);
	assert.equal(readFileSync(join(dirname(GUARD), quarantined[0]!, 'owner.json'), 'utf8'), record);
});
