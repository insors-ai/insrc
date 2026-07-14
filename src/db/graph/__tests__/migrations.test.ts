/**
 * Phase 7.2 tests for the forward-migration runner.
 *
 * Production registry is empty (v1 is the first schema version). The
 * tests exercise the runner directly with synthetic migration chains
 * to verify the dispatcher, version-advance contract, idempotence,
 * and path-not-found surfacing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	closeGraphStore,
	getGraphStore,
	setGraphStorePath,
	type GraphStore,
} from '../store.js';
import {
	MIGRATIONS,
	MigrationPathError,
	runMigrations,
	type Migration,
} from '../migrations.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-migrations-7.2-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

async function readVersion(store: GraphStore): Promise<number | undefined> {
	const v = store.meta.get('schema_version');
	return typeof v === 'number' ? v : undefined;
}

// ---------------------------------------------------------------------------
// Production registry shape
// ---------------------------------------------------------------------------

test('production MIGRATIONS registry has the v1->v2 entry', () => {
	const v1to2 = MIGRATIONS.find(m => m.from === 1 && m.to === 2);
	assert.ok(v1to2, 'expected a 1->2 migration registered');
	assert.match(v1to2.description, /entity_string_by_u64|name_index/);
});

test('production MIGRATIONS registry has the v2->v3 entry', () => {
	const v2to3 = MIGRATIONS.find(m => m.from === 2 && m.to === 3);
	assert.ok(v2to3, 'expected a 2->3 migration registered');
	assert.match(v2to3.description, /repo-registry|strict contract|shared-modules/i);
});

// ---------------------------------------------------------------------------
// Runner: no-op paths
// ---------------------------------------------------------------------------

test('runMigrations is a no-op when stored == target', async () => {
	const store = await getGraphStore();
	const applied = await runMigrations(store, 1, 1, []);
	assert.equal(applied, 0);
});

test('runMigrations with empty registry but stored < target throws', async () => {
	const store = await getGraphStore();
	await assert.rejects(
		() => runMigrations(store, 1, 2, []),
		MigrationPathError,
	);
});

test('runMigrations rejects when stored > target', async () => {
	const store = await getGraphStore();
	await assert.rejects(
		() => runMigrations(store, 5, 3, []),
		MigrationPathError,
	);
});

// ---------------------------------------------------------------------------
// Runner: single + multi-step paths
// ---------------------------------------------------------------------------

test('runMigrations applies a single 1->2 step and advances meta.schema_version', async () => {
	const store = await getGraphStore();
	let ran = 0;
	const reg: Migration[] = [{
		from: 1, to: 2, description: 'demo 1->2',
		run: () => { ran++; },
	}];
	const applied = await runMigrations(store, 1, 2, reg);
	assert.equal(applied, 1);
	assert.equal(ran, 1);
	assert.equal(await readVersion(store), 2);
});

test('runMigrations chains 1 -> 2 -> 3 in two steps', async () => {
	const store = await getGraphStore();
	const order: string[] = [];
	const reg: Migration[] = [
		{ from: 1, to: 2, description: 'a', run: () => { order.push('a'); } },
		{ from: 2, to: 3, description: 'b', run: () => { order.push('b'); } },
	];
	const applied = await runMigrations(store, 1, 3, reg);
	assert.equal(applied, 2);
	assert.deepEqual(order, ['a', 'b']);
	assert.equal(await readVersion(store), 3);
});

test('runMigrations prefers the longest jump that does not overshoot', async () => {
	const store = await getGraphStore();
	const order: string[] = [];
	// Chain has both a 1->3 fast path and the 1->2 + 2->3 chain. The
	// runner should take the fast path when target is 3.
	const reg: Migration[] = [
		{ from: 1, to: 2, description: 'slow-a', run: () => { order.push('slow-a'); } },
		{ from: 2, to: 3, description: 'slow-b', run: () => { order.push('slow-b'); } },
		{ from: 1, to: 3, description: 'fast',   run: () => { order.push('fast');   } },
	];
	await runMigrations(store, 1, 3, reg);
	assert.deepEqual(order, ['fast']);
	assert.equal(await readVersion(store), 3);
});

test('runMigrations does not overshoot the target', async () => {
	const store = await getGraphStore();
	const order: string[] = [];
	// Registry has both 1->2 and 1->5, target is 2 -- runner should
	// pick 1->2 (longest jump that doesn't overshoot).
	const reg: Migration[] = [
		{ from: 1, to: 2, description: 'short', run: () => { order.push('short'); } },
		{ from: 1, to: 5, description: 'overshoot', run: () => { order.push('overshoot'); } },
	];
	await runMigrations(store, 1, 2, reg);
	assert.deepEqual(order, ['short']);
	assert.equal(await readVersion(store), 2);
});

// ---------------------------------------------------------------------------
// Runner: per-step durability
// ---------------------------------------------------------------------------

test('runMigrations leaves intermediate version on disk after a per-step crash', async () => {
	const store = await getGraphStore();
	let ranA = 0;
	const reg: Migration[] = [
		{ from: 1, to: 2, description: 'a',          run: () => { ranA++; } },
		{ from: 2, to: 3, description: 'b (throws)', run: () => { throw new Error('boom'); } },
	];

	await assert.rejects(
		() => runMigrations(store, 1, 3, reg),
		/boom/,
	);
	// Step 'a' committed (version is now 2); step 'b' aborted.
	assert.equal(ranA, 1);
	assert.equal(await readVersion(store), 2);

	// Re-run with target 3 from the new starting point should resume
	// at 2 -> 3 only. Replace the throwing step with a working one.
	const fixedReg: Migration[] = [
		{ from: 2, to: 3, description: 'b-fixed', run: () => { /* no-op */ } },
	];
	const stored = (await readVersion(store))!;
	const applied = await runMigrations(store, stored, 3, fixedReg);
	assert.equal(applied, 1);
	assert.equal(await readVersion(store), 3);
});

// ---------------------------------------------------------------------------
// Runner: path-not-found
// ---------------------------------------------------------------------------

test('runMigrations throws MigrationPathError when chain is incomplete', async () => {
	const store = await getGraphStore();
	// Registry has 1->2 and 3->4 but no 2->3 bridge.
	const reg: Migration[] = [
		{ from: 1, to: 2, description: 'a', run: () => { /* */ } },
		{ from: 3, to: 4, description: 'c', run: () => { /* */ } },
	];
	await assert.rejects(
		() => runMigrations(store, 1, 4, reg),
		(err: unknown) => {
			assert.ok(err instanceof MigrationPathError);
			assert.match(err.message, /schema_version=2/);
			return true;
		},
	);
	// Step 'a' committed before the chain dead-end; version is 2.
	assert.equal(await readVersion(store), 2);
});

// ---------------------------------------------------------------------------
// Idempotence
// ---------------------------------------------------------------------------

test('runMigrations re-run from already-current version is a no-op', async () => {
	const store = await getGraphStore();
	let ran = 0;
	const reg: Migration[] = [{
		from: 1, to: 2, description: 'demo',
		run: () => { ran++; },
	}];
	await runMigrations(store, 1, 2, reg);
	assert.equal(ran, 1);

	// Stored version is now 2; re-running with stored=2 target=2
	// shouldn't trigger anything.
	const applied = await runMigrations(store, 2, 2, reg);
	assert.equal(applied, 0);
	assert.equal(ran, 1);
});
