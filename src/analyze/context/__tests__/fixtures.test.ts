/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the shared shaper-fixture builder.
 *
 * Asserts every fixture lands on disk with the expected shape:
 *   - tiny-multi-lang-repo has the 3 source files (TS + Py + Go) +
 *     README; LOC count is in the documented ballpark.
 *   - seeded.sqlite is openable, has the 3 declared tables, has the
 *     FK constraint, and is seeded with the documented row counts.
 *   - seeded-csv-dir has the 5 consistent CSVs + 1 divergent, all
 *     under the hive-partitioned tree.
 *   - seeded-manifests has the documented k8s + tf + GHA structure.
 *   - empty-repo + unindexed-repo are present with .git markers.
 *   - teardownFixtures removes everything.
 *
 * Pure file-system + SQLite test. No LLM, no Ollama, no indexer.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/context/__tests__/fixtures.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
	setupFixtures,
	teardownFixtures,
	type FixtureSet,
} from './fixtures/setup.js';

/**
 * Run a SQL string against the seeded SQLite via the sqlite3 CLI.
 * Returns stdout split by line. Same indirection the fixture builder
 * uses -- avoids the better-sqlite3 native ABI pin.
 */
function sqliteQuery(dbPath: string, sql: string): string[] {
	const out = execFileSync('sqlite3', [dbPath, sql], { encoding: 'utf8' });
	return out.split('\n').filter(s => s.length > 0);
}

// ---------------------------------------------------------------------------
// Build once for the suite; tear down after.
// ---------------------------------------------------------------------------

let fixtures: FixtureSet;

test.before(() => {
	fixtures = setupFixtures();
});

test.after(() => {
	teardownFixtures(fixtures);
});

// ---------------------------------------------------------------------------
// tiny-multi-lang-repo
// ---------------------------------------------------------------------------

test('tiny-multi-lang-repo has index.ts, compute.py, user.go, README.md', () => {
	const dir = fixtures.tinyMultiLangRepo;
	for (const file of ['index.ts', 'compute.py', 'user.go', 'README.md']) {
		assert.ok(existsSync(join(dir, file)), `missing ${file}`);
	}
});

test('tiny-multi-lang-repo total LOC is in the documented ballpark', () => {
	const files = ['index.ts', 'compute.py', 'user.go'];
	let total = 0;
	for (const f of files) {
		const body = readFileSync(join(fixtures.tinyMultiLangRepo, f), 'utf8');
		total += body.split('\n').length;
	}
	// Anchor it loosely -- design says "~80" so 40-120 lines is the
	// ballpark; tightening past this just generates churn whenever
	// someone reformats the fixtures.
	assert.ok(total >= 40 && total <= 120, `LOC out of expected range: ${total}`);
});

test('tiny-multi-lang-repo TS exports the documented surface', () => {
	const ts = readFileSync(join(fixtures.tinyMultiLangRepo, 'index.ts'), 'utf8');
	assert.match(ts, /export function formatName/);
	assert.match(ts, /export function greetCommand/);
	assert.match(ts, /export function registerUsersRoute/);
});

test('tiny-multi-lang-repo Python module has helper + 2 public functions', () => {
	const py = readFileSync(join(fixtures.tinyMultiLangRepo, 'compute.py'), 'utf8');
	assert.match(py, /def _normalize/);
	assert.match(py, /def normalize_email/);
	assert.match(py, /def normalize_name/);
});

test('tiny-multi-lang-repo Go exports the documented type + methods', () => {
	const go = readFileSync(join(fixtures.tinyMultiLangRepo, 'user.go'), 'utf8');
	assert.match(go, /type User struct/);
	assert.match(go, /func \(u \*User\) DisplayName\(\) string/);
	assert.match(go, /func \(u \*User\) IsActive\(\) bool/);
});

// ---------------------------------------------------------------------------
// seeded.sqlite
// ---------------------------------------------------------------------------

test('seeded.sqlite is openable + has the 3 documented tables', () => {
	const names = sqliteQuery(
		fixtures.seededSqlite,
		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
	);
	assert.deepEqual(names.sort(), ['order_items', 'orders', 'users']);
});

test('seeded.sqlite has the documented FK from orders.user_id to users.id', () => {
	// PRAGMA foreign_key_list returns: id|seq|table|from|to|on_update|on_delete|match
	const rows = sqliteQuery(fixtures.seededSqlite, 'PRAGMA foreign_key_list(orders);');
	assert.equal(rows.length, 1);
	const parts = rows[0]!.split('|');
	assert.equal(parts[2], 'users');
	assert.equal(parts[3], 'user_id');
	assert.equal(parts[4], 'id');
});

test('seeded.sqlite has FK on order_items.order_id to orders.id', () => {
	const rows = sqliteQuery(fixtures.seededSqlite, 'PRAGMA foreign_key_list(order_items);');
	assert.equal(rows.length, 1);
	const parts = rows[0]!.split('|');
	assert.equal(parts[2], 'orders');
	assert.equal(parts[3], 'order_id');
	assert.equal(parts[4], 'id');
});

test('seeded.sqlite row counts: users=3, orders=3, order_items=4', () => {
	const u = Number(sqliteQuery(fixtures.seededSqlite, 'SELECT COUNT(*) FROM users;')[0]);
	const o = Number(sqliteQuery(fixtures.seededSqlite, 'SELECT COUNT(*) FROM orders;')[0]);
	const i = Number(sqliteQuery(fixtures.seededSqlite, 'SELECT COUNT(*) FROM order_items;')[0]);
	assert.equal(u, 3);
	assert.equal(o, 3);
	assert.equal(i, 4);
});

// ---------------------------------------------------------------------------
// seeded-csv-dir
// ---------------------------------------------------------------------------

test('seeded-csv-dir: 5 consistent CSVs + 1 divergent under hive partitions', () => {
	const dir = fixtures.seededCsvDir;

	const consistent: Array<[string, string]> = [
		['region=us', 'date=2026-06-01'],
		['region=us', 'date=2026-06-02'],
		['region=eu', 'date=2026-06-01'],
		['region=eu', 'date=2026-06-02'],
		['region=eu', 'date=2026-06-03'],
	];
	for (const [r, d] of consistent) {
		const p = join(dir, r, d, 'orders.csv');
		assert.ok(existsSync(p), `missing ${p}`);
		const header = readFileSync(p, 'utf8').split('\n')[0];
		assert.equal(header, 'order_id,product,qty,total');
	}

	const divergent = join(dir, 'region=us', 'date=2026-06-03', 'orders.csv');
	assert.ok(existsSync(divergent));
	const divergentHeader = readFileSync(divergent, 'utf8').split('\n')[0];
	assert.equal(divergentHeader, 'order_id,product,qty,note');
});

// ---------------------------------------------------------------------------
// seeded-manifests
// ---------------------------------------------------------------------------

test('seeded-manifests/k8s: 3 Deployments + 2 Services + 1 ConfigMap', () => {
	const k8s = join(fixtures.seededManifests, 'k8s');
	for (const svc of ['api', 'worker', 'web']) {
		const p = join(k8s, `${svc}-deployment.yaml`);
		assert.ok(existsSync(p));
		assert.match(readFileSync(p, 'utf8'), /kind: Deployment/);
	}
	for (const svc of ['api', 'web']) {
		const p = join(k8s, `${svc}-service.yaml`);
		assert.ok(existsSync(p));
		assert.match(readFileSync(p, 'utf8'), /kind: Service/);
	}
	assert.match(readFileSync(join(k8s, 'config.yaml'), 'utf8'), /kind: ConfigMap/);
});

test('seeded-manifests/tf: main.tf + variables.tf with aws resources', () => {
	const tf = join(fixtures.seededManifests, 'tf');
	const main = readFileSync(join(tf, 'main.tf'), 'utf8');
	assert.match(main, /resource "aws_s3_bucket"/);
	assert.match(main, /resource "aws_iam_role"/);
	assert.match(main, /provider "aws"/);

	const vars = readFileSync(join(tf, 'variables.tf'), 'utf8');
	assert.match(vars, /variable "region"/);
	assert.match(vars, /variable "bucket_name"/);
});

test('seeded-manifests/.github/workflows: one CI workflow', () => {
	const gha = join(fixtures.seededManifests, '.github', 'workflows', 'ci.yml');
	assert.ok(existsSync(gha));
	const body = readFileSync(gha, 'utf8');
	assert.match(body, /^name: CI/m);
	assert.match(body, /actions\/checkout@v4/);
});

// ---------------------------------------------------------------------------
// empty-repo + unindexed-repo
// ---------------------------------------------------------------------------

test('empty-repo: has .git marker + README, no source', () => {
	assert.ok(existsSync(join(fixtures.emptyRepo, '.git')));
	assert.ok(existsSync(join(fixtures.emptyRepo, 'README.md')));
	assert.ok(!existsSync(join(fixtures.emptyRepo, 'main.ts')));
});

test('unindexed-repo: has .git marker + README + a TS source file', () => {
	assert.ok(existsSync(join(fixtures.unindexedRepo, '.git')));
	assert.ok(existsSync(join(fixtures.unindexedRepo, 'README.md')));
	assert.ok(existsSync(join(fixtures.unindexedRepo, 'main.ts')));
	assert.match(
		readFileSync(join(fixtures.unindexedRepo, 'main.ts'), 'utf8'),
		/export function unindexedFunction/,
	);
});

// ---------------------------------------------------------------------------
// Teardown removes the entire tree
// ---------------------------------------------------------------------------

test('teardownFixtures removes the entire root tree (smoke)', () => {
	const set = setupFixtures();
	assert.ok(existsSync(set.root));
	const childPath = set.tinyMultiLangRepo;
	assert.ok(existsSync(childPath));
	teardownFixtures(set);
	assert.equal(existsSync(set.root), false);
});

// ---------------------------------------------------------------------------
// Idempotency: re-running setupFixturesAt on a still-populated root
// ---------------------------------------------------------------------------

test('setupFixturesAt is idempotent on a populated root', async () => {
	const { setupFixturesAt } = await import('./fixtures/setup.js');
	const set = setupFixtures();
	try {
		// Snapshot some content.
		const sqlitePathBefore = set.seededSqlite;
		const sqliteBytesBefore = statSync(sqlitePathBefore).size;

		// Re-run the builder on the same root.
		const set2 = setupFixturesAt(set.root);
		assert.equal(set2.root, set.root);
		assert.equal(set2.seededSqlite, sqlitePathBefore);

		// SQLite file is reachable + has the same size (idempotent
		// drop+recreate landed the same content).
		const sqliteBytesAfter = statSync(sqlitePathBefore).size;
		assert.equal(sqliteBytesAfter, sqliteBytesBefore);
	} finally {
		teardownFixtures(set);
	}
});
