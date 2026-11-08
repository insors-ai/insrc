/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-fefa97b991537da7 — only the main thread touches the Keychain. Real daemons with keytar replaced
 * below the keystore (fixtures/fake-keytar.ts), where a Keychain call made on a worker throws and is
 * logged. Two client labels are served by two session workers.
 *
 * Run: npx tsx --test --test-force-exit src/daemon/__tests__/keystore-forwarding.test.ts
 */

import { test, after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel } from 'node:worker_threads';

import { startDaemon } from '../../mcp/__tests__/helpers/mcp-e2e.js';
import type { RunningDaemon } from '../../mcp/__tests__/helpers/mcp-e2e.js';
import { forwardKeystoreCalls, getKey, KeystoreInputError, KeystoreUnavailableError, serveKeystoreCall, setKey, setKeychainBackendForTest } from '../../shared/keystore.js';
import type { KeychainBackend } from '../../shared/keystore.js';
import { HubClient, serveHub } from '../threads/channel.js';

const PRELOAD = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-keytar.ts');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-forward-')));
const HOME = join(base, 'home'), KEYTAR = join(base, 'keytar'), LOG = join(KEYTAR, 'calls.log');
const VAULT_READ = 'get insrc-vault secrets';
const calls = (): string[] => existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(l => l.length > 0) : [];
let daemon: RunningDaemon;

/** One request from a named client: the daemon serves each client on its own session worker. */
function ask(client: string, method: string, params: unknown): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const socket = createConnection(daemon.sock);
		let buffer = '';
		socket.on('connect', () => socket.write(JSON.stringify({ id: 1, method, params, client: { label: client, pid: process.pid } }) + '\n'));
		socket.on('data', (data: Buffer) => {
			buffer += data.toString();
			if (!buffer.includes('\n')) return;
			socket.end();
			const reply = JSON.parse(buffer.slice(0, buffer.indexOf('\n'))) as { result?: unknown; error?: string };
			if (reply.error !== undefined) reject(new Error(reply.error)); else resolve(reply.result);
		});
		socket.on('error', reject);
	});
}

async function sessionWorkers(): Promise<number> {
	const status = await ask('status', 'daemon.debug-status', {}) as { threads?: { kind?: string; session?: { label?: string } }[] };
	return new Set((status.threads ?? []).flatMap(t => t.session?.label === 'one' || t.session?.label === 'two' ? [t.session.label] : [])).size;
}

before(async () => {
	mkdirSync(HOME, { recursive: true });
	mkdirSync(KEYTAR, { recursive: true });
	writeFileSync(join(KEYTAR, 'store.json'), JSON.stringify({ 'insrc-vault/secrets': JSON.stringify({ version: 1, secrets: { seeded: 'value-1', other: 'value-2' }, retired: [] }) }));
	daemon = await startDaemon(HOME, { preload: PRELOAD, env: { INSRC_TEST_KEYTAR_DIR: KEYTAR } });
});
after(async () => { await daemon.stop(); rmSync(base, { recursive: true, force: true }); });
afterEach(() => { forwardKeystoreCalls(undefined); setKeychainBackendForTest(undefined); });

test('threads: workers on two threads share one Keychain read', async () => {
	const answers = await Promise.all([ask('one', 'keys.get', { name: 'seeded' }), ask('two', 'keys.get', { name: 'other' })]) as { exists: boolean }[];
	assert.deepEqual(answers.map(a => a.exists), [true, true]);
	assert.equal(await sessionWorkers(), 2, 'the clients were served by two workers');
	await ask('one', 'keys.get', { name: 'other' });
	await ask('two', 'keys.get', { name: 'seeded' });
	assert.deepEqual(calls(), [VAULT_READ]);
});

test('threads: a worker never calls the backend directly', async () => {
	assert.deepEqual(await ask('one', 'keys.get', { name: 'seeded' }), { name: 'seeded', masked: 'va****', exists: true });
	await ask('two', 'keys.set', { name: 'from-worker', value: 'v' });
	assert.deepEqual(calls().filter(c => c.startsWith('WORKER')), []);
});

test('threads: a save on one worker is visible on another', async () => {
	await ask('one', 'keys.set', { name: 'shared', value: 'saved-on-one' });
	assert.deepEqual(await ask('two', 'keys.get', { name: 'shared' }), { name: 'shared', masked: 'sa****', exists: true });
	assert.equal(calls().filter(c => c === VAULT_READ).length, 1, 'still the one read');
});

/** A real hub channel, with the vault this process would own behind it. */
function channel(): { readonly client: HubClient; close(): void } {
	const { port1, port2 } = new MessageChannel();
	serveHub(port1, { keystore: serveKeystoreCall });
	const client = new HubClient(port2);
	forwardKeystoreCalls(call => client.request('keystore', call));
	return { client, close: () => { port1.close(); } };
}

function refusingBackend(): KeychainBackend & { touched: number } {
	const backend = {
		touched: 0,
		getPassword() { backend.touched++; return Promise.resolve(null); },
		setPassword() { backend.touched++; return Promise.resolve(); },
		deletePassword() { backend.touched++; return Promise.resolve(false); },
	};
	return backend;
}

test('threads: a closed hub channel does not fall back to the Keychain', async () => {
	const backend = refusingBackend();
	setKeychainBackendForTest(backend);
	const { close } = channel();
	close();
	await new Promise(resolve => setImmediate(resolve));
	await assert.rejects(getKey('a'), KeystoreUnavailableError);
	await assert.rejects(setKey('a', 'v'), KeystoreUnavailableError);
	assert.equal(backend.touched, 0);
});

test('threads: a malformed request from a worker reports KeystoreInputError', async () => {
	const backend = refusingBackend();
	setKeychainBackendForTest(backend);
	const { close } = channel();
	try {
		await assert.rejects(setKey('a', 7 as unknown as string), (error: Error) => error instanceof KeystoreInputError && error.message === 'A secret value must be a string.');
		await assert.rejects(getKey('' as string), KeystoreInputError);
		assert.equal(backend.touched, 0);
	} finally { close(); }
	// Through a real worker: the refusal reaches the client, and nothing else was disturbed.
	await assert.rejects(ask('one', 'keys.set', { name: 'bad', value: 7 }), /A secret value must be a string/);
	assert.deepEqual(await ask('two', 'keys.get', { name: 'seeded' }), { name: 'seeded', masked: 'va****', exists: true });
});
