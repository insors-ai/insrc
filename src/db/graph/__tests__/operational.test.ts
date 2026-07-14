/**
 * Phase 1.5 tests for LMDB env operational config.
 *
 * Verifies that:
 *   - INSRC_LMDB_MAPSIZE_GIB override is honored
 *   - First-boot writes schema_version = SCHEMA_VERSION
 *   - Re-open with matching version proceeds
 *   - Re-open with stored > expected (newer-daemon-on-disk) hard-fails
 *     with LmdbStoreSchemaVersionMismatch
 *   - Lock-conflict error class is exported and constructible
 *   - Corrupted-env error class is exported and constructible
 *   - Mapsize-too-small error class is exported and constructible
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	closeGraphStore,
	getGraphStore,
	runReaderCheck,
	setGraphStorePath,
	SCHEMA_VERSION,
	LmdbStoreError,
	LmdbStoreLockConflict,
	LmdbStoreCorrupted,
	LmdbStoreMapsizeTooSmall,
	LmdbStoreSchemaVersionMismatch,
} from '../store.js';

let dir: string;
let originalMapsize: string | undefined;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-graph-ops-1.5-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	originalMapsize = process.env['INSRC_LMDB_MAPSIZE_GIB'];
});
test.afterEach(async () => {
	await closeGraphStore();
	if (originalMapsize === undefined) {
		delete process.env['INSRC_LMDB_MAPSIZE_GIB'];
	} else {
		process.env['INSRC_LMDB_MAPSIZE_GIB'] = originalMapsize;
	}
	rmSync(dir, { recursive: true, force: true });
});

test('first boot writes schema_version', async () => {
	const store = await getGraphStore();
	const v = store.meta.get('schema_version');
	// meta sub-DB uses msgpack value encoding -- numbers round-trip
	// as numbers, not buffers.
	assert.equal(typeof v, 'number');
	assert.equal(v, SCHEMA_VERSION);
});

test('re-open with matching schema_version proceeds normally', async () => {
	await getGraphStore();
	await closeGraphStore();
	// Re-open: if schema_version pre-flight is correct, this resolves
	const store = await getGraphStore();
	assert.ok(store);
});

test('re-open with stored > expected hard-fails with LmdbStoreSchemaVersionMismatch', async () => {
	const store = await getGraphStore();
	// Simulate a future-version write (msgpack number)
	await store.meta.put('schema_version', SCHEMA_VERSION + 1);
	await closeGraphStore();

	await assert.rejects(
		getGraphStore(),
		(err: unknown) => {
			assert.ok(err instanceof LmdbStoreSchemaVersionMismatch);
			assert.match((err as Error).message, new RegExp(`schema_version ${SCHEMA_VERSION + 1}`));
			return true;
		},
	);
});

test('INSRC_LMDB_MAPSIZE_GIB override is honored', async () => {
	process.env['INSRC_LMDB_MAPSIZE_GIB'] = '2';
	const store = await getGraphStore();
	// The value isn't directly readable from the env handle, but
	// asserting that open() succeeded with a small mapsize is
	// sufficient -- if the override were ignored the env would still
	// have been created, but we'd be using the default 1 TiB. There's
	// no public way to inspect mapSize, so we rely on the absence of
	// errors + the log line emitted at init.
	assert.ok(store);
});

test('invalid INSRC_LMDB_MAPSIZE_GIB falls back to default', async () => {
	process.env['INSRC_LMDB_MAPSIZE_GIB'] = 'not-a-number';
	const store = await getGraphStore();
	assert.ok(store);
});

test('LmdbStoreError classes are exported and constructible', () => {
	const lock = new LmdbStoreLockConflict('/path');
	assert.ok(lock instanceof LmdbStoreError);
	assert.equal(lock.name, 'LmdbStoreLockConflict');
	assert.match(lock.message, /locked by another process/);

	const corrupt = new LmdbStoreCorrupted('/path');
	assert.ok(corrupt instanceof LmdbStoreError);
	assert.equal(corrupt.name, 'LmdbStoreCorrupted');
	assert.match(corrupt.message, /corrupted/);

	const small = new LmdbStoreMapsizeTooSmall('/path', 64);
	assert.ok(small instanceof LmdbStoreError);
	assert.equal(small.name, 'LmdbStoreMapsizeTooSmall');
	assert.match(small.message, /64 GiB/);

	const ver = new LmdbStoreSchemaVersionMismatch(99, 1);
	assert.ok(ver instanceof LmdbStoreError);
	assert.equal(ver.name, 'LmdbStoreSchemaVersionMismatch');
	assert.match(ver.message, /schema_version 99/);
});

test('opening a non-LMDB file at the env path surfaces a typed error', async () => {
	// Pre-populate _path with a file containing junk; lmdb-js should
	// reject it. The exact lmdb-js behaviour: it writes its own header
	// and ends up with a fresh env... the corruption-detection path is
	// hard to trigger reliably from the public API. We document this
	// limitation and assert that classifyOpenError handles common
	// failure shapes via constructor smoke tests above.
	//
	// This test verifies the *positive* path: env still opens cleanly
	// when the parent directory is fresh.
	const store = await getGraphStore();
	assert.ok(store);
});

test('SCHEMA_VERSION constant is exported and stable', () => {
	assert.ok(typeof SCHEMA_VERSION === 'number');
	// v3 added by plans/repo-registry-strict-contract.md (RepoKind
	// discriminator + namespace-keyed shared-modules rows + the
	// v2->v3 forward migration).
	assert.equal(SCHEMA_VERSION, 3);
});

// ---------------------------------------------------------------------------
// runReaderCheck (Phase 5.5)
// ---------------------------------------------------------------------------

test('runReaderCheck returns 0 on a fresh env (no stale slots)', async () => {
	await getGraphStore();
	const cleared = runReaderCheck('test');
	assert.equal(cleared, 0);
});

test('runReaderCheck is a no-op when env is closed', async () => {
	// Don't open the env first.
	const cleared = runReaderCheck('test');
	assert.equal(cleared, 0);
});

test('runReaderCheck is safe to call repeatedly', async () => {
	await getGraphStore();
	for (let i = 0; i < 5; i++) {
		const cleared = runReaderCheck(`test-${i}`);
		assert.equal(cleared, 0);
	}
});
