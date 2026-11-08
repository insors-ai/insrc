/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-fefa97b991537da7 — one Keychain item holds every secret. A counting fake replaces the Keychain
 * below the vault, so no test reaches the real one.
 *
 * Run: npx tsx --test --test-force-exit src/shared/__tests__/keystore-vault.test.ts
 */

import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { deleteKey, getKey, KeystoreInputError, KeystoreUnavailableError, listKeys, setKey, setKeychainBackendForTest } from '../keystore.js';
import type { KeychainBackend } from '../keystore.js';

const ITEM = 'insrc-vault/secrets';

class FakeKeychain implements KeychainBackend {
	readonly store = new Map<string, string>();
	/** Reads of the vault item. */
	reads = 0;
	readonly legacyReads: string[] = [];
	writes = 0;
	finds = 0;
	readonly deleted: string[] = [];
	refuseRead = false;
	refuseWrite = false;
	holdRead: Promise<void> | undefined;
	holdLegacy: Promise<void> | undefined;
	readonly refuseLegacy = new Set<string>();

	constructor(item?: string) { if (item !== undefined) this.store.set(ITEM, item); }

	async getPassword(service: string, account: string): Promise<string | null> {
		const value = this.store.get(`${service}/${account}`) ?? null;
		if (service === 'insrc') {
			this.legacyReads.push(account);
			await this.holdLegacy;
			if (this.refuseLegacy.has(account)) throw new Error('The user denied access.');
			return value;
		}
		this.reads++;
		await this.holdRead;
		if (this.refuseRead) throw new Error('The user denied access.');
		return value;
	}

	async setPassword(service: string, account: string, value: string): Promise<void> {
		this.writes++;
		await new Promise(resolve => setImmediate(resolve));
		if (this.refuseWrite) throw new Error('The user denied access.');
		this.store.set(`${service}/${account}`, value);
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
		this.deleted.push(`${service}/${account}`);
		return this.store.delete(`${service}/${account}`);
	}

	findCredentials(): Promise<never[]> { this.finds++; return Promise.resolve([]); }

	get payload(): { version: number; secrets: Record<string, string>; retired: string[] } {
		return JSON.parse(this.store.get(ITEM)!) as { version: number; secrets: Record<string, string>; retired: string[] };
	}
}

/** Installs the fake as a new run: nothing is held in memory for it. */
function run(keychain: FakeKeychain): FakeKeychain { setKeychainBackendForTest(keychain); return keychain; }
const item = (secrets: Record<string, string>, retired: string[] = []): string => JSON.stringify({ version: 1, secrets, retired });

afterEach(() => { setKeychainBackendForTest(undefined); mock.timers.reset(); });

test('vault: concurrent reads perform one Keychain read', async () => {
	const keychain = run(new FakeKeychain(item({ a: '1', b: '2' })));
	let release = (): void => {};
	keychain.holdRead = new Promise(resolve => { release = resolve; });
	const reads = [getKey('a'), getKey('b'), getKey('missing'), listKeys()];
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(keychain.reads, 1, 'every caller waits on the one load');
	release();
	assert.deepEqual(await Promise.all(reads), ['1', '2', null, ['a', 'b']]);
	assert.equal(await getKey('a'), '1');
	assert.equal(keychain.reads, 1, 'later reads come from memory');
});

test('vault: a refused load fails at once for five minutes and then retries', async () => {
	mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
	const keychain = run(new FakeKeychain(item({ a: '1' })));
	keychain.refuseRead = true;
	await assert.rejects(getKey('a'), (error: Error) => error instanceof KeystoreUnavailableError && (error.cause as Error).message === 'The user denied access.');
	assert.equal(keychain.reads, 1);
	await assert.rejects(getKey('a'), KeystoreUnavailableError);
	await assert.rejects(setKey('a', '2'), KeystoreUnavailableError);
	mock.timers.tick(5 * 60_000 - 1);
	await assert.rejects(getKey('a'), KeystoreUnavailableError);
	assert.equal(keychain.reads, 1, 'no dialog during the five minutes');
	keychain.refuseRead = false;
	mock.timers.tick(1);
	assert.equal(await getKey('a'), '1');
	assert.equal(keychain.reads, 2);
});

const DAMAGED: readonly [string, string][] = [
	['not JSON', 'sk-secret{'],
	['an array', '[]'],
	['null', 'null'],
	['a bad version', JSON.stringify({ version: 2, secrets: {}, retired: [] })],
	['a string version', JSON.stringify({ version: '1', secrets: {}, retired: [] })],
	['missing secrets', JSON.stringify({ version: 1, retired: [] })],
	['secrets as an array', JSON.stringify({ version: 1, secrets: [], retired: [] })],
	['a non-string value', JSON.stringify({ version: 1, secrets: { a: 1 }, retired: [] })],
	['a missing retired list', JSON.stringify({ version: 1, secrets: {} })],
	['a retired list that is not an array', JSON.stringify({ version: 1, secrets: {}, retired: 'a' })],
	['a non-string retired name', JSON.stringify({ version: 1, secrets: {}, retired: [1] })],
	['a duplicate retired name', JSON.stringify({ version: 1, secrets: {}, retired: ['a', 'a'] })],
	['a name both held and retired', JSON.stringify({ version: 1, secrets: { a: '1' }, retired: ['a'] })],
];

test('vault: a payload with a bad version, missing secrets, a non-string value or a bad retired list fails closed and is never rewritten', async () => {
	for (const [label, stored] of DAMAGED) {
		const keychain = run(new FakeKeychain(stored));
		await assert.rejects(getKey('a'), KeystoreUnavailableError, label);
		await assert.rejects(setKey('b', '2'), KeystoreUnavailableError, label);
		await assert.rejects(deleteKey('b'), KeystoreUnavailableError, label);
		assert.equal(keychain.writes, 0, label);
		assert.equal(keychain.store.get(ITEM), stored, label);
	}
});

test('vault: a syntax error does not carry the stored item in its cause', async () => {
	run(new FakeKeychain('sk-secret{'));
	await assert.rejects(getKey('a'), (error: Error) => !String((error.cause as Error).message).includes('sk-secret'));
});

test('vault: a malformed name or value leaves memory and the stored item unchanged', async () => {
	const stored = item({ a: '1' });
	const keychain = run(new FakeKeychain(stored));
	for (const name of ['', undefined, null, 7, {}, ['a']] as unknown as string[]) {
		await assert.rejects(getKey(name), KeystoreInputError);
		await assert.rejects(setKey(name, 'v'), KeystoreInputError);
		await assert.rejects(deleteKey(name), KeystoreInputError);
	}
	for (const value of [undefined, null, 7, {}] as unknown as string[]) await assert.rejects(setKey('a', value), KeystoreInputError);
	assert.equal(keychain.reads, 0, 'refused before the vault is touched');
	assert.equal(keychain.writes, 0);
	assert.equal(keychain.store.get(ITEM), stored);
	assert.equal(await getKey('a'), '1');
});

test('vault: a name such as __proto__ is stored and read as an ordinary key', async () => {
	const keychain = run(new FakeKeychain());
	assert.equal(await getKey('constructor'), null);
	assert.equal(await getKey('__proto__'), null);
	await setKey('__proto__', 'p');
	await setKey('constructor', 'c');
	assert.equal(await getKey('__proto__'), 'p');
	assert.equal(({} as Record<string, unknown>)['p'], undefined);
	run(keychain);
	assert.equal(await getKey('__proto__'), 'p', 'it survives the stored form');
	assert.equal(await getKey('constructor'), 'c');
	assert.deepEqual((await listKeys()).sort(), ['__proto__', 'constructor']);
});

test('vault: a failed write leaves memory unchanged', async () => {
	const stored = item({ a: '1' });
	const keychain = run(new FakeKeychain(stored));
	keychain.refuseWrite = true;
	await assert.rejects(setKey('a', '2'), KeystoreUnavailableError);
	await assert.rejects(setKey('b', '3'), KeystoreUnavailableError);
	await assert.rejects(deleteKey('a'), KeystoreUnavailableError);
	assert.equal(await getKey('a'), '1');
	assert.equal(await getKey('b'), null);
	assert.equal(keychain.store.get(ITEM), stored);
	keychain.refuseWrite = false;
	await setKey('b', '3');
	assert.deepEqual(keychain.payload.secrets, { a: '1', b: '3' }, 'the queue survives a failure');
});

test('vault: concurrent saves lose no update', async () => {
	const keychain = run(new FakeKeychain());
	const names = Array.from({ length: 12 }, (_, i) => `name-${i}`);
	await Promise.all(names.map(name => setKey(name, `value-${name}`)));
	assert.equal(keychain.writes, names.length);
	assert.deepEqual(Object.keys(keychain.payload.secrets).sort(), [...names].sort());
	run(keychain);
	for (const name of names) assert.equal(await getKey(name), `value-${name}`);
});

test('vault: a deleted name is recorded as retired', async () => {
	const keychain = run(new FakeKeychain(item({ a: '1', b: '2' })));
	await deleteKey('a');
	assert.deepEqual(keychain.payload, { version: 1, secrets: { b: '2' }, retired: ['a'] });
	assert.equal(await getKey('a'), null);
	assert.deepEqual(keychain.deleted, ['insrc/a'], 'the legacy item is removed too, and never the vault item');
});

test('vault: a retired name saved again is readable', async () => {
	const keychain = run(new FakeKeychain(item({}, ['a'])));
	await setKey('a', '');
	assert.equal(await getKey('a'), '', 'an empty string is a value');
	assert.deepEqual(keychain.payload, { version: 1, secrets: { a: '' }, retired: [] });
	run(keychain);
	assert.equal(await getKey('a'), '');
});

test('keystore: listKeys never calls findCredentials', async () => {
	const keychain = run(new FakeKeychain(item({ a: '1', b: '2' }, ['c'])));
	assert.deepEqual((await listKeys()).sort(), ['a', 'b']);
	assert.equal(keychain.finds, 0);
});

function legacy(secrets: Record<string, string>, vaultItem?: string): FakeKeychain {
	const keychain = new FakeKeychain(vaultItem);
	for (const [name, value] of Object.entries(secrets)) keychain.store.set(`insrc/${name}`, value);
	return keychain;
}

function held(): { readonly gate: Promise<void>; release(): void } {
	let release = (): void => {};
	const gate = new Promise<void>(resolve => { release = resolve; });
	return { gate, release };
}

async function until(condition: () => boolean): Promise<void> {
	while (!condition()) await new Promise(resolve => setImmediate(resolve));
}

test('migration: a legacy secret is copied once and read from the vault afterwards', async () => {
	const keychain = run(legacy({ a: 'old' }));
	assert.equal(await getKey('a'), 'old');
	assert.equal(await getKey('a'), 'old');
	assert.deepEqual(keychain.legacyReads, ['a']);
	assert.equal(keychain.writes, 1);
	assert.deepEqual(keychain.payload, { version: 1, secrets: { a: 'old' }, retired: [] });
	run(keychain);
	assert.equal(await getKey('a'), 'old');
	assert.deepEqual(keychain.legacyReads, ['a'], 'the next run never reads the legacy item');
	assert.equal(keychain.store.get('insrc/a'), 'old', 'migration deletes nothing');
});

test('migration: concurrent misses of one name share one legacy read and one copy', async () => {
	const keychain = run(legacy({ a: 'old' }));
	const { gate, release } = held();
	keychain.holdLegacy = gate;
	const reads = [getKey('a'), getKey('a'), getKey('a'), getKey('a')];
	await until(() => keychain.legacyReads.length > 0);
	await new Promise(resolve => setImmediate(resolve));
	release();
	assert.deepEqual(await Promise.all(reads), ['old', 'old', 'old', 'old']);
	assert.deepEqual(keychain.legacyReads, ['a']);
	assert.equal(keychain.writes, 1);
});

test('migration: a save during a legacy read wins and the copy is discarded', async () => {
	const keychain = run(legacy({ a: 'old' }));
	const { gate, release } = held();
	keychain.holdLegacy = gate;
	const read = getKey('a');
	await until(() => keychain.legacyReads.length > 0);
	await setKey('a', 'new');
	release();
	assert.equal(await read, 'new');
	assert.equal(await getKey('a'), 'new');
	assert.equal(keychain.writes, 1, 'the copy wrote nothing');
	assert.deepEqual(keychain.payload.secrets, { a: 'new' });
});

test('migration: a delete during a legacy read wins and the copy is discarded', async () => {
	const keychain = run(legacy({ a: 'old' }));
	const { gate, release } = held();
	keychain.holdLegacy = gate;
	const read = getKey('a');
	await until(() => keychain.legacyReads.length > 0);
	await deleteKey('a');
	release();
	assert.equal(await read, null);
	assert.equal(await getKey('a'), null);
	assert.equal(keychain.writes, 1, 'the copy wrote nothing');
	assert.deepEqual(keychain.payload, { version: 1, secrets: {}, retired: ['a'] });
});

test('migration: a failed copy serves later reads from memory, keeps the legacy item and reads it again on the next run', async () => {
	const keychain = run(legacy({ a: 'old' }));
	keychain.refuseWrite = true;
	assert.equal(await getKey('a'), 'old');
	assert.equal(await getKey('a'), 'old');
	assert.deepEqual(keychain.legacyReads, ['a'], 'served from memory');
	assert.equal(keychain.writes, 1, 'the copy is not retried in this run');
	assert.equal(keychain.store.get('insrc/a'), 'old');
	assert.equal(keychain.store.has(ITEM), false);
	keychain.refuseWrite = false;
	run(keychain);
	assert.equal(await getKey('a'), 'old');
	assert.deepEqual(keychain.legacyReads, ['a', 'a']);
	assert.deepEqual(keychain.payload.secrets, { a: 'old' });
});

test('migration: an absent name causes no write and no second lookup in the run', async () => {
	const keychain = run(new FakeKeychain());
	assert.equal(await getKey('a'), null);
	assert.equal(await getKey('a'), null);
	assert.deepEqual(keychain.legacyReads, ['a']);
	assert.equal(keychain.writes, 0);
	assert.equal(keychain.store.has(ITEM), false);
	await setKey('a', 'set');
	assert.equal(await getKey('a'), 'set', 'a save clears what the run remembered');
});

test('migration: a refused legacy read fails at once for five minutes for that name only and then retries', async () => {
	mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
	const keychain = run(legacy({ a: 'old', b: 'other' }));
	keychain.refuseLegacy.add('a');
	await assert.rejects(getKey('a'), (error: Error) => error instanceof KeystoreUnavailableError && (error.cause as Error).message === 'The user denied access.');
	await assert.rejects(getKey('a'), KeystoreUnavailableError);
	assert.equal(await getKey('b'), 'other', 'other names are unaffected');
	mock.timers.tick(5 * 60_000 - 1);
	await assert.rejects(getKey('a'), KeystoreUnavailableError);
	assert.deepEqual(keychain.legacyReads, ['a', 'b'], 'no dialog during the five minutes');
	keychain.refuseLegacy.clear();
	mock.timers.tick(1);
	assert.equal(await getKey('a'), 'old');
	assert.deepEqual(keychain.legacyReads, ['a', 'b', 'a']);
});

test('vault: a retired name does not fall back to its legacy item', async () => {
	const keychain = run(legacy({ a: 'old' }, item({}, ['a'])));
	assert.equal(await getKey('a'), null);
	assert.deepEqual(keychain.legacyReads, []);
	assert.equal(keychain.writes, 0);
});
