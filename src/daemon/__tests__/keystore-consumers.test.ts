/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-fefa97b991537da7 — everything that needs a secret reads it through the vault. Real daemons with
 * keytar replaced below the keystore (fixtures/fake-keytar.ts), and a fake Keychain below the vault for
 * the tools that run in this process.
 *
 * Run: npx tsx --test --test-force-exit src/daemon/__tests__/keystore-consumers.test.ts
 */

import { test, after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rpc, startDaemon } from '../../mcp/__tests__/helpers/mcp-e2e.js';
import { setKeychainBackendForTest } from '../../shared/keystore.js';
import type { KeychainBackend } from '../../shared/keystore.js';
import { notifySlackTool } from '../tools/builtins/notify/index.js';
import { webSearchTool } from '../tools/builtins/web/index.js';
import { getToolSettings, replaceToolSettings } from '../tools/config.js';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-keytar.ts');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-consumers-')));
const HOME = join(base, 'home'), KEYTAR = join(base, 'keytar'), LOG = join(KEYTAR, 'calls.log');
const VAULT_READ = 'get insrc-vault secrets';
const calls = (): string[] => existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(l => l.length > 0) : [];
const start = () => startDaemon(HOME, { preload: FIXTURE, env: { INSRC_TEST_KEYTAR_DIR: KEYTAR } });
const originalSettings = getToolSettings();
const originalBraveKey = process.env['BRAVE_API_KEY'];

before(() => {
	mkdirSync(HOME, { recursive: true });
	mkdirSync(KEYTAR, { recursive: true });
	writeFileSync(join(KEYTAR, 'store.json'), JSON.stringify({ 'insrc-vault/secrets': JSON.stringify({ version: 1, secrets: { first: 'value-one', second: 'value-two' }, retired: [] }) }));
});
after(() => { rmSync(base, { recursive: true, force: true }); });
afterEach(() => {
	setKeychainBackendForTest(undefined);
	replaceToolSettings(originalSettings);
	if (originalBraveKey === undefined) delete process.env['BRAVE_API_KEY']; else process.env['BRAVE_API_KEY'] = originalBraveKey;
});

function vaultOf(secrets: Record<string, string>): KeychainBackend & { vaultReads: number; legacy: string[] } {
	const backend = {
		vaultReads: 0,
		legacy: [] as string[],
		getPassword(service: string, account: string) {
			if (service === 'insrc') { backend.legacy.push(account); return Promise.resolve(null); }
			backend.vaultReads++;
			return Promise.resolve(JSON.stringify({ version: 1, secrets, retired: [] }));
		},
		setPassword() { return Promise.resolve(); },
		deletePassword() { return Promise.resolve(false); },
	};
	return backend;
}

test('consumers: notify, web and keys handlers read through the vault', async () => {
	// Notify: the webhook it posts to is the value held in the vault.
	const received: string[] = [];
	const server = createServer((request, response) => { received.push(request.url ?? ''); request.resume(); response.end('ok'); });
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	try {
		const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook-from-vault`;
		const backend = vaultOf({ 'slack-hook': url });
		setKeychainBackendForTest(backend);
		const settings = getToolSettings();
		replaceToolSettings({ ...settings, web: { ...settings.web, braveApiKeySource: 'keychain' }, notify: { ...settings.notify, slack: { ...settings.notify.slack, defaultWebhookRef: 'slack-hook' } } });
		await notifySlackTool.execute({ text: 'hello' });
		assert.deepEqual(received, ['/hook-from-vault']);
		// Web: its key is looked up through the same vault, and not found there falls to the legacy item.
		// Without this variable a missing key stops the tool before it reaches the real search service.
		delete process.env['BRAVE_API_KEY'];
		const search = await webSearchTool.execute({ query: 'x' });
		assert.equal(search.success, false);
		assert.deepEqual(backend.legacy, ['brave']);
		assert.equal(backend.vaultReads, 1, 'both tools shared the one load');
	} finally { server.close(); }

	// The keys handlers, on a real daemon: names and values come from the one vault read.
	const daemon = await start();
	try {
		writeFileSync(LOG, '');
		assert.deepEqual(await rpc(daemon.sock, 'keys.list'), [{ name: 'first', masked: 'va****' }, { name: 'second', masked: 'va****' }]);
		assert.deepEqual(await rpc(daemon.sock, 'keys.get', { name: 'first' }), { name: 'first', masked: 'va****', exists: true });
		assert.deepEqual(calls(), [VAULT_READ]);
	} finally { await daemon.stop(); }
});

test('ipc: keys.get reports exists:true for an empty saved secret', async () => {
	const daemon = await start();
	try {
		await rpc(daemon.sock, 'keys.set', { name: 'blank', value: '' });
		assert.deepEqual(await rpc(daemon.sock, 'keys.get', { name: 'blank' }), { name: 'blank', masked: '****', exists: true });
		assert.deepEqual(await rpc(daemon.sock, 'keys.get', { name: 'nothing-here' }), { name: 'nothing-here', exists: false });
	} finally { await daemon.stop(); }
});

test('ipc: keys.set with a non-string value is refused and other secrets stay readable after a restart', async () => {
	let daemon = await start();
	try {
		await assert.rejects(rpc(daemon.sock, 'keys.set', { name: 'first', value: { not: 'a string' } }), /A secret value must be a string/);
		assert.deepEqual(await rpc(daemon.sock, 'keys.get', { name: 'first' }), { name: 'first', masked: 'va****', exists: true });
		await daemon.stop();
		daemon = await start();
		assert.deepEqual(await rpc(daemon.sock, 'keys.get', { name: 'first' }), { name: 'first', masked: 'va****', exists: true });
		assert.deepEqual(await rpc(daemon.sock, 'keys.get', { name: 'second' }), { name: 'second', masked: 'va****', exists: true });
	} finally { await daemon.stop(); }
});
