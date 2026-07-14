/**
 * Phase 3.1 tests for the LanceDB connection singleton.
 *
 * Verifies:
 *   - First `getLanceConn()` call creates the directory + opens
 *   - Subsequent calls return the same instance
 *   - Concurrent first-callers share the init promise
 *   - close + reopen works (path persists across process boundary)
 *   - setLanceConnPath() routes to a tmpdir for test isolation
 *   - openOrCreateTable creates a table on first call, reuses on second
 *   - openOrCreateTable rejects an empty seed
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	closeLanceConn,
	getLanceConn,
	openOrCreateTable,
	setLanceConnPath,
} from '../conn.js';

let dir: string;

test.beforeEach(async () => {
	await closeLanceConn();
	dir = mkdtempSync(join(tmpdir(), 'insrc-lance-conn-3.1-'));
	setLanceConnPath(join(dir, 'lance'));
});
test.afterEach(async () => {
	await closeLanceConn();
	rmSync(dir, { recursive: true, force: true });
});

test('getLanceConn creates the directory + opens a connection', async () => {
	const path = join(dir, 'lance');
	assert.equal(existsSync(path), false);
	const conn = await getLanceConn();
	assert.ok(conn);
	assert.equal(existsSync(path), true);
});

test('subsequent getLanceConn calls return the same instance', async () => {
	const a = await getLanceConn();
	const b = await getLanceConn();
	assert.equal(a, b);
});

test('concurrent first-callers share the init promise', async () => {
	const [a, b, c] = await Promise.all([getLanceConn(), getLanceConn(), getLanceConn()]);
	assert.equal(a, b);
	assert.equal(b, c);
});

test('close + reopen works (data persists)', async () => {
	const conn1 = await getLanceConn();
	await conn1.createTable('t', [{ id: 'r1', n: 1 }]);
	await closeLanceConn();

	const conn2 = await getLanceConn();
	const tables = await conn2.tableNames();
	assert.ok(tables.includes('t'));
	const t = await conn2.openTable('t');
	const rows = await t.query().toArray();
	assert.equal(rows.length, 1);
	assert.equal(rows[0]?.id, 'r1');
});

test('setLanceConnPath isolates between tests (different tmpdirs)', async () => {
	const conn = await getLanceConn();
	await conn.createTable('test_table', [{ id: 'x' }]);
	const tables = await conn.tableNames();
	assert.ok(tables.includes('test_table'));

	// Re-route to a different path
	await closeLanceConn();
	const dir2 = mkdtempSync(join(tmpdir(), 'insrc-lance-iso-'));
	setLanceConnPath(join(dir2, 'lance'));
	const conn2 = await getLanceConn();
	const tables2 = await conn2.tableNames();
	assert.equal(tables2.includes('test_table'), false,
		'second connection should not see the first env\'s tables');
	rmSync(dir2, { recursive: true, force: true });
});

test('openOrCreateTable creates the table on first call', async () => {
	const conn = await getLanceConn();
	const t = await openOrCreateTable(conn, 'my_table', () => [
		{ id: 'seed', val: 1.5 },
	]);
	assert.equal(await t.countRows(), 1);
});

test('openOrCreateTable opens an existing table without re-seeding', async () => {
	const conn = await getLanceConn();
	await openOrCreateTable(conn, 'my_table', () => [{ id: 'r1', n: 1 }]);
	// Second call should NOT add the seed row again
	const t = await openOrCreateTable(conn, 'my_table', () => [{ id: 'r2', n: 2 }]);
	assert.equal(await t.countRows(), 1);
});

test('openOrCreateTable rejects empty seed when creating', async () => {
	const conn = await getLanceConn();
	await assert.rejects(
		openOrCreateTable(conn, 'empty', () => []),
		/cannot create.*empty seed/,
	);
});
