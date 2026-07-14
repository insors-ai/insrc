/**
 * Smoke tests for the per-workspace data-analyzer DuckDB pool.
 * Covers lazy init, status snapshot (not_initialized + initialized
 * + pool_open), reset (closes pool + deletes files + lazy-recreate),
 * and registry isolation across two workspaces.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	analyzerDbPath,
	analyzerStatus,
	closeAllAnalyzerPools,
	closeAnalyzerPool,
	deleteAnalyzerDb,
	getAnalyzerPool,
	withAnalyzerConnection,
} from '../duckdb-analyzer-pool.js';

let workspace: string;

test.beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), 'insrc-analyzer-pool-test-'));
});

test.afterEach(async () => {
	await closeAllAnalyzerPools();
	rmSync(workspace, { recursive: true, force: true });
});

test('status of a workspace with no analyzer DB reports not_initialized', async () => {
	const status = await analyzerStatus(workspace);
	assert.equal(status.state, 'not_initialized');
	assert.equal(status.fileSize, 0);
	assert.equal(status.walSize, 0);
	assert.equal(status.dbPath, analyzerDbPath(workspace));
	assert.equal(status.tableRowCounts, undefined);
	// File should NOT exist -- status is read-only and never lazy-inits.
	assert.equal(existsSync(analyzerDbPath(workspace)), false);
});

test('first getAnalyzerPool creates the .insrc dir + .db file + applies schema', async () => {
	const inst = await getAnalyzerPool(workspace);
	assert.notEqual(inst, null);
	assert.equal(existsSync(analyzerDbPath(workspace)), true);

	const status = await analyzerStatus(workspace);
	assert.equal(status.state, 'pool_open');
	assert.equal(status.schemaVersion, 1);
	assert.deepEqual(status.tableRowCounts, {}, 'no analyzer-owned tables yet -- only the meta-table, which is filtered');
	assert.ok(status.fileSize > 0);
});

test('concurrent first-callers for one workspace collapse onto a single init', async () => {
	const [a, b, c] = await Promise.all([
		getAnalyzerPool(workspace),
		getAnalyzerPool(workspace),
		getAnalyzerPool(workspace),
	]);
	assert.strictEqual(a, b);
	assert.strictEqual(b, c);
});

test('two different workspaces get independent pools + DB files', async () => {
	const ws2 = mkdtempSync(join(tmpdir(), 'insrc-analyzer-pool-test-b-'));
	try {
		const inst1 = await getAnalyzerPool(workspace);
		const inst2 = await getAnalyzerPool(ws2);
		assert.notStrictEqual(inst1, inst2);
		assert.notEqual(analyzerDbPath(workspace), analyzerDbPath(ws2));
		assert.equal(existsSync(analyzerDbPath(workspace)), true);
		assert.equal(existsSync(analyzerDbPath(ws2)), true);
	} finally {
		await closeAnalyzerPool(ws2);
		rmSync(ws2, { recursive: true, force: true });
	}
});

test('withAnalyzerConnection runs inside the workspace pool', async () => {
	const result = await withAnalyzerConnection(workspace, async conn => {
		const r = await conn.runAndReadAll('SELECT 42::INTEGER AS x');
		return Number(r.getRows()[0]?.[0]);
	});
	assert.equal(result, 42);
});

test('reset closes the pool, deletes the file, and the next call lazy-recreates', async () => {
	await getAnalyzerPool(workspace);  // ensure created
	const dbPath = analyzerDbPath(workspace);
	assert.equal(existsSync(dbPath), true);

	const result = await deleteAnalyzerDb(workspace);
	assert.equal(result.poolWasOpen, true);
	assert.equal(result.dbDeleted, true);
	assert.ok(result.bytesFreed > 0);
	assert.equal(existsSync(dbPath), false);

	// Next access lazy-recreates a fresh DB.
	await getAnalyzerPool(workspace);
	assert.equal(existsSync(dbPath), true);
	const status = await analyzerStatus(workspace);
	assert.equal(status.state, 'pool_open');
	assert.equal(status.schemaVersion, 1);
});

test('reset on a workspace with no DB is a no-op (does not crash)', async () => {
	const result = await deleteAnalyzerDb(workspace);
	assert.equal(result.poolWasOpen, false);
	assert.equal(result.dbDeleted, false);
	assert.equal(result.walDeleted, false);
	assert.equal(result.bytesFreed, 0);
});

test('status with file present but no live pool reports `initialized` + reads schema', async () => {
	// Create + close so the file exists on disk but no pool is open.
	await getAnalyzerPool(workspace);
	await closeAnalyzerPool(workspace);

	const status = await analyzerStatus(workspace);
	assert.equal(status.state, 'initialized');
	assert.equal(status.schemaVersion, 1);
	assert.ok(status.fileSize > 0);
});
