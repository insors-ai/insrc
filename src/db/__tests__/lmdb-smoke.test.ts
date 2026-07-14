/**
 * Smoke test for the `lmdb` (lmdb-js) dependency. Phase 0.1 of the
 * storage migration: pin the version, verify the native binding loads
 * on this platform, verify the basic API contract works end-to-end.
 *
 * Not a full GraphStore test -- that's Phase 1.1+. This test only
 * answers: "does the dep work at all?"
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { open } from 'lmdb';

let tmpDir: string;

test.beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), 'insrc-lmdb-smoke-'));
});
test.afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

test('lmdb native binding loads', () => {
	const env = open({ path: join(tmpDir, 'env'), mapSize: 64 * 1024 * 1024 });
	assert.ok(env);
	env.close();
});

test('put and get round-trip with default msgpack codec', async () => {
	const env = open<string, string>({
		path: join(tmpDir, 'env'),
		mapSize: 64 * 1024 * 1024,
	});
	await env.put('hello', 'world');
	assert.equal(env.get('hello'), 'world');
	env.close();
});

test('binary keys (Buffer) round-trip', async () => {
	const env = open({
		path: join(tmpDir, 'env'),
		mapSize: 64 * 1024 * 1024,
		keyEncoding: 'binary',
		encoding: 'binary',
	});
	const key = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
	const value = Buffer.from([0xff, 0xfe, 0xfd]);
	await env.put(key, value);
	const got = env.get(key);
	assert.ok(Buffer.isBuffer(got));
	assert.deepEqual(Array.from(got as Buffer), [0xff, 0xfe, 0xfd]);
	env.close();
});

test('cursor range scan returns sorted keys', async () => {
	const env = open<string, string>({
		path: join(tmpDir, 'env'),
		mapSize: 64 * 1024 * 1024,
	});
	await env.put('b', '2');
	await env.put('a', '1');
	await env.put('c', '3');
	const keys: string[] = [];
	for (const { key } of env.getRange()) {
		keys.push(key as string);
	}
	assert.deepEqual(keys, ['a', 'b', 'c']);
	env.close();
});

test('sub-databases (named) are independent keyspaces', async () => {
	const env = open({
		path: join(tmpDir, 'env'),
		mapSize: 64 * 1024 * 1024,
		maxDbs: 4,
	});
	const dbA = env.openDB<string, string>({ name: 'a' });
	const dbB = env.openDB<string, string>({ name: 'b' });
	await dbA.put('shared-key', 'from-a');
	await dbB.put('shared-key', 'from-b');
	assert.equal(dbA.get('shared-key'), 'from-a');
	assert.equal(dbB.get('shared-key'), 'from-b');
	env.close();
});

test('msgpack codec preserves nested objects', async () => {
	interface Row { id: number; name: string; tags: string[] }
	const env = open<Row, string>({
		path: join(tmpDir, 'env'),
		mapSize: 64 * 1024 * 1024,
	});
	const row: Row = { id: 42, name: 'alpha', tags: ['x', 'y', 'z'] };
	await env.put('r', row);
	assert.deepEqual(env.get('r'), row);
	env.close();
});

test('write transaction is atomic (all-or-nothing)', async () => {
	const env = open<string, string>({
		path: join(tmpDir, 'env'),
		mapSize: 64 * 1024 * 1024,
	});
	await env.transaction(() => {
		env.put('k1', 'v1');
		env.put('k2', 'v2');
		env.put('k3', 'v3');
	});
	assert.equal(env.get('k1'), 'v1');
	assert.equal(env.get('k2'), 'v2');
	assert.equal(env.get('k3'), 'v3');
	env.close();
});

test('reopened env retains data (file-backed persistence)', async () => {
	const path = join(tmpDir, 'env');
	{
		const env = open<string, string>({ path, mapSize: 64 * 1024 * 1024 });
		await env.put('persist', 'yes');
		env.close();
	}
	{
		const env = open<string, string>({ path, mapSize: 64 * 1024 * 1024 });
		assert.equal(env.get('persist'), 'yes');
		env.close();
	}
});
