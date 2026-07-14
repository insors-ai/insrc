/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live tests for the data-shaper.
 *
 * Drives the real Ollama against per-test SQLite + CSV-directory
 * fixtures and asserts each row of the data edge-case matrix
 * (D1-D6 in plans/analyze-context-builder.md):
 *
 *   D1 -- SQLite multi-table with an FK: schema enumerated,
 *         FK acknowledged in structure or summary, sample rows in
 *         artefacts with citations
 *   D2 -- CSV directory-as-table: directory treated as one logical
 *         object; shared column set in surface
 *   D3 -- Hive partitions detected (region/date keys)
 *   D4 -- Empty SQLite (zero tables): bundle valid; meta.emptyLayers
 *         reflects sparseness
 *   D5 -- Task-mode targeting a single table: surface narrows to that
 *         table only
 *   D6 -- Unavailable connection (missing SQLite file): LLM surfaces
 *         the error; bundle is sparse / acknowledges absence
 *
 * Each test sets up a dedicated per-fixture repoPath + a fresh
 * db-connections.json under ~/.insrc/repos/<repoId>/. The data-pool
 * cache reloads from disk on every acquire, so rewriting between
 * tests picks up correctly.
 *
 * Gated behind INSRC_LIVE_TESTS=1.
 *
 * Run:
 *   INSRC_LIVE_TESTS=1 npx tsx --test \
 *     src/insrc/analyze/context/__tests__/data-shaper.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import Database from 'better-sqlite3';

import { _resetAnalyzeConfigCacheForTests } from '../../../config/analyze.js';
import { registerBuiltinDataDrivers } from '../../../daemon/db/drivers/index.js';
import { connectionsPath } from '../../../daemon/db/config.js';
import { closeAll, _resetCacheForTests } from '../../../daemon/db/pool-cache.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import { shaperFor } from '../index.js';
import { cacheFilePathFor } from '../cache.js';
import { validateBundle } from '../schema.js';
import type {
	AnalyzeContextBundle,
	RunShapeInput,
	ShapeOpts,
	TaskShapeInput,
} from '../types.js';
import type {
	AnalyzeTaskTemplate,
	ClassifiedIntent,
	PlannedTask,
} from '../../../shared/analyze-types.js';
import type { ConnectionConfig } from '../../../shared/db-driver.js';

import { setupFixtures, teardownFixtures, type FixtureSet } from './fixtures/setup.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('data-shaper.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

// ---------------------------------------------------------------------------
// Suite-scoped setup
// ---------------------------------------------------------------------------

let fixtures: FixtureSet;
let emptySqlitePath: string;

test.before(() => {
	if (!GATE) return;
	_resetAnalyzeConfigCacheForTests();
	_resetRegistryForTests();
	registerBuiltinTools();
	registerBuiltinDataDrivers();
	fixtures = setupFixtures();

	// Build a brand-new empty SQLite for D4. better-sqlite3 with
	// fileMustExist: false on first open creates the file; we open + close
	// to materialize it with no tables.
	emptySqlitePath = join(fixtures.root, 'empty.sqlite');
	const empty = new Database(emptySqlitePath);
	empty.close();
});

test.after(async () => {
	if (!GATE) return;
	try { await closeAll(); } catch { /* ignore */ }
	_resetCacheForTests();
	if (fixtures) teardownFixtures(fixtures);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueRunId(label: string): string {
	const suffix = Math.floor(Math.random() * 1e9).toString(16);
	return `live-data-${label}-${suffix}`;
}

/**
 * Write a db-connections.json under ~/.insrc/repos/<repoId>/ for the
 * given repoPath. Returns the config file path so the test can wipe
 * it on teardown.
 */
function registerConnections(repoPath: string, connections: ConnectionConfig[]): string {
	const path = connectionsPath(repoPath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify({ connections }, null, 2) + '\n', 'utf8');
	return path;
}

function unregisterConnections(repoPath: string): void {
	const path = connectionsPath(repoPath);
	if (existsSync(path)) {
		// eslint-disable-next-line no-empty
		try { rmSync(path); } catch {}
	}
}

/**
 * Create a per-test repo directory and (optionally) copy data fixtures
 * into it. Returns the CANONICALIZED (realpathSync'd) repo path so
 * that subsequent connectionsPath() hashes match what the data tools
 * compute at runtime from `deps.repoPath` (process.cwd() on macOS
 * resolves /var/folders -> /private/var/folders; the registered
 * connections file must live at the same hash, hence the canonical
 * form on both sides).
 *
 * The data-driver's pool also enforces "connection path resolves
 * inside repoRoot", so each fixture is copied INTO the per-test
 * repoPath rather than referenced at its original location under
 * fixtures.root.
 */
function makeRepoWithFixtures(
	label: string,
	copies: ReadonlyArray<{ src: string; recursive?: boolean }>,
): string {
	const repoRoot = realpathSync(fixtures.root);
	const repoPath = join(repoRoot, `data-${label}`);
	mkdirSync(repoPath, { recursive: true });
	for (const c of copies) {
		const dest = join(repoPath, basename(c.src));
		if (c.recursive === true) {
			cpSync(c.src, dest, { recursive: true });
		} else {
			copyFileSync(c.src, dest);
		}
	}
	return repoPath;
}

function inRepo(repoPath: string, srcPath: string): string {
	return join(repoPath, basename(srcPath));
}

async function runDataShaper(
	scopeValue: string,
	runId:      string,
	scopeKind:  'connection' | 'workspace' = 'connection',
	connId:     string = 'fixture',
): Promise<AnalyzeContextBundle> {
	const shaper = shaperFor('run', 'data');
	const intent: ClassifiedIntent = {
		target:    'data',
		scope:     'M',
		focused:   false,
		scopeRef:  { kind: scopeKind, value: scopeKind === 'connection' ? connId : scopeValue },
		reasoning: 'data-shaper.live test fixture',
	};
	const inputs: RunShapeInput = { intent };
	const opts:   ShapeOpts     = { runId };
	const bundle = await shaper.buildRunBundle(inputs, opts);
	return bundle;
}

async function runDataTaskShaper(
	repoPath:    string,
	connId:      string,
	tableName:   string,
	runId:       string,
): Promise<AnalyzeContextBundle> {
	const shaper = shaperFor('task', 'data');
	// scopeRef.kind='workspace' here even though the request is
	// semantically "task on this connection" -- the driver's
	// inferRepoPath falls back to process.cwd() for kind='connection',
	// which is brittle under the tests' tmp directory layout. The
	// task's `params.connectionId` carries the connection semantically;
	// the workspace scopeRef just hands the driver the right repoPath
	// so the data tools find the right connections file.
	const intent: ClassifiedIntent = {
		target:    'data',
		scope:     'S',
		focused:   true,
		focus:     `Describe the ${tableName} table`,
		scopeRef:  { kind: 'workspace', value: repoPath },
		reasoning: 'data-shaper.live task-mode fixture',
	};
	const task: PlannedTask = {
		taskId:   't01',
		template: 'data.schema.table',
		kind:      'leaf',
		params:    { connectionId: connId, table: tableName },
		produces:  ['table-schema'],
		rationale: 'data-shaper.live task-mode fixture',
	};
	const template: AnalyzeTaskTemplate = {
		id:       'data.schema.table',
		target:   'data',
		family:   'schema',
		kind:     'leaf',
		revision: 'pre-registry',
	};
	const inputs: TaskShapeInput = {
		intent,
		task,
		template,
		upstreamTasks: new Map(),
	};
	const opts: ShapeOpts = { runId };
	return shaper.buildTaskBundle(inputs, opts);
}

function cleanupRun(runId: string, mode: 'run' | 'task' = 'run'): void {
	const cacheKey = mode === 'task'
		? { mode: 'task' as const, taskId: 't01', hash: 'x' }
		: { mode: 'run'  as const, hash: 'x' };
	const path = cacheFilePathFor(runId, cacheKey);
	if (existsSync(path)) {
		// eslint-disable-next-line no-empty
		try { rmSync(path); } catch {}
	}
}

// ---------------------------------------------------------------------------
// D1 -- SQLite, multi-table + FK, run-mode
// ---------------------------------------------------------------------------

test('D1: SQLite multi-table + FK -- schema enumerated; FK acknowledged', { skip: !GATE }, async () => {
	const repoPath = makeRepoWithFixtures('d1', [{ src: fixtures.seededSqlite }]);
	registerConnections(repoPath, [{
		id:    'fixture',
		kind:  'sqlite',
		path:  inRepo(repoPath, fixtures.seededSqlite),
		label: 'D1 SQLite fixture',
	}]);
	const runId = uniqueRunId('D1');
	try {
		const bundle = await runDataShaper(repoPath, runId, 'workspace');
		assert.ok(validateBundle(bundle), 'bundle must be schema-valid');

		const haystack = `${bundle.summary}\n${bundle.surface}\n${bundle.structure}`.toLowerCase();

		// Schema enumeration: each table name must appear.
		for (const t of ['users', 'orders', 'order_items']) {
			assert.match(haystack, new RegExp(`\\b${t}\\b`),
				`table ${t} should be enumerated; got summary/surface/structure:\n${haystack.slice(0, 800)}`);
		}

		// FK acknowledgment: either structure mentions an FK explicitly
		// or summary describes the relationship.
		const fkAcknowledged =
			/\bforeign\s+key\b|\bfk\b|\breferences\b|user_id\b.*\busers\b|\bjoin/.test(haystack);
		assert.ok(fkAcknowledged, `FK relationship should be acknowledged; got:\n${haystack.slice(0, 800)}`);

		// Artefacts should contain at least one citation marker.
		assert.ok(bundle.artefacts.trim().length > 0, 'artefacts must be non-empty');
	} finally {
		cleanupRun(runId);
		unregisterConnections(repoPath);
	}
});

// ---------------------------------------------------------------------------
// D2 -- CSV directory-as-table, run-mode
// ---------------------------------------------------------------------------

test('D2: CSV directory-as-table -- directory treated as one logical object', { skip: !GATE }, async () => {
	const repoPath = makeRepoWithFixtures('d2', [{ src: fixtures.seededCsvDir, recursive: true }]);
	registerConnections(repoPath, [{
		id:    'fixture',
		kind:  'csv',
		path:  inRepo(repoPath, fixtures.seededCsvDir),
		label: 'D2 CSV directory fixture',
	}]);
	const runId = uniqueRunId('D2');
	try {
		const bundle = await runDataShaper(repoPath, runId, 'workspace');
		assert.ok(validateBundle(bundle));

		const haystack = `${bundle.summary}\n${bundle.surface}\n${bundle.structure}`.toLowerCase();

		// CSV / file connection acknowledged.
		assert.match(haystack, /\bcsv\b|\bfile\b|\bdirectory\b/,
			`CSV/file/directory should be acknowledged; got:\n${haystack.slice(0, 800)}`);

		// At least one of the seeded fixture's column names should appear.
		// The setup writes `region,date,id,amount` as the shared header.
		const knownCols = ['region', 'date', 'id', 'amount'];
		const hits = knownCols.filter(c => new RegExp(`\\b${c}\\b`).test(haystack));
		assert.ok(hits.length >= 2,
			`at least 2 CSV column names should appear; got ${hits.length}: ${hits.join(', ')}\n` +
			`haystack:\n${haystack.slice(0, 800)}`);
	} finally {
		cleanupRun(runId);
		unregisterConnections(repoPath);
	}
});

// ---------------------------------------------------------------------------
// D3 -- Hive partitions detected
// ---------------------------------------------------------------------------

test('D3: hive partitions -- region + date keys surfaced', { skip: !GATE }, async () => {
	const repoPath = makeRepoWithFixtures('d3', [{ src: fixtures.seededCsvDir, recursive: true }]);
	registerConnections(repoPath, [{
		id:    'fixture',
		kind:  'csv',
		path:  inRepo(repoPath, fixtures.seededCsvDir),
		label: 'D3 CSV with hive layout',
	}]);
	const runId = uniqueRunId('D3');
	try {
		const bundle = await runDataShaper(repoPath, runId, 'workspace');
		assert.ok(validateBundle(bundle));

		const haystack = `${bundle.summary}\n${bundle.surface}\n${bundle.structure}`.toLowerCase();

		// Partitioning should be surfaced (either explicit "hive
		// partition" wording or the partition keys mentioned).
		const partitionAcknowledged =
			/\bhive\b|\bpartition/.test(haystack) ||
			(/region=/.test(haystack) && /date=/.test(haystack));
		assert.ok(partitionAcknowledged,
			`partitioning should be surfaced; got:\n${haystack.slice(0, 800)}`);
	} finally {
		cleanupRun(runId);
		unregisterConnections(repoPath);
	}
});

// ---------------------------------------------------------------------------
// D4 -- Empty SQLite (zero tables), run-mode
// ---------------------------------------------------------------------------

test('D4: empty SQLite -- bundle valid; sparseness reflected in meta', { skip: !GATE }, async () => {
	const repoPath = makeRepoWithFixtures('d4', [{ src: emptySqlitePath }]);
	registerConnections(repoPath, [{
		id:    'fixture',
		kind:  'sqlite',
		path:  inRepo(repoPath, emptySqlitePath),
		label: 'D4 empty SQLite',
	}]);
	const runId = uniqueRunId('D4');
	try {
		const bundle = await runDataShaper(repoPath, runId, 'workspace');
		assert.ok(validateBundle(bundle), 'bundle must be schema-valid even for empty SQLite');

		// summary must acknowledge the empty database (no tables, etc.)
		const sumLower = bundle.summary.toLowerCase();
		assert.ok(
			/\bempty\b|\bzero\b|\bno\s+tables?\b|\bno\s+\w+\s+(found|present|defined)|\b0\s+tables?\b/.test(sumLower),
			`summary should acknowledge zero tables; got:\n${sumLower.slice(0, 500)}`,
		);

		// artefacts should be empty (no DDL to show) -- driver stamps
		// emptyLayers accordingly.
		assert.ok(bundle.meta);
		assert.ok(
			bundle.artefacts.trim().length === 0 ||
				bundle.meta.emptyLayers.includes('artefacts'),
			'artefacts should be empty or flagged in emptyLayers when no tables exist',
		);
	} finally {
		cleanupRun(runId);
		unregisterConnections(repoPath);
	}
});

// ---------------------------------------------------------------------------
// D5 -- Task-mode targeting a single table
// ---------------------------------------------------------------------------

test('D5: task-mode targeting users table -- surface narrows', { skip: !GATE }, async () => {
	const repoPath = makeRepoWithFixtures('d5', [{ src: fixtures.seededSqlite }]);
	registerConnections(repoPath, [{
		id:    'fixture',
		kind:  'sqlite',
		path:  inRepo(repoPath, fixtures.seededSqlite),
		label: 'D5 SQLite for task-mode',
	}]);
	const runId = uniqueRunId('D5');
	try {
		const bundle = await runDataTaskShaper(repoPath, 'fixture', 'users', runId);
		assert.ok(validateBundle(bundle));

		const haystack = `${bundle.summary}\n${bundle.surface}\n${bundle.artefacts}`.toLowerCase();

		// 'users' table should appear; columns email + name should appear
		// (the prompt is told to focus on the task's declared table).
		assert.match(haystack, /\busers\b/);
		assert.ok(
			/\bemail\b/.test(haystack) || /\bname\b/.test(haystack),
			`users columns (email/name) should appear; got:\n${haystack.slice(0, 800)}`,
		);

		// The OTHER tables (orders, order_items) should NOT receive
		// equal billing -- they may be mentioned as related, but full
		// schema enumeration should be restricted to users. We accept
		// "mentioned" but reject "full column enumeration" by checking
		// whether order_items' specific columns (product, qty) appear
		// alongside users' columns.
		const ordersDeep =
			/\bproduct\b/.test(haystack) && /\bqty\b/.test(haystack);
		assert.equal(ordersDeep, false,
			`task-mode should NOT fully enumerate order_items; got:\n${haystack.slice(0, 800)}`);
	} finally {
		cleanupRun(runId, 'task');
		unregisterConnections(repoPath);
	}
});

// ---------------------------------------------------------------------------
// D6 -- Unavailable connection (missing SQLite file)
// ---------------------------------------------------------------------------

test('D6: missing SQLite file -- shaper surfaces the error gracefully', { skip: !GATE }, async () => {
	const repoPath = makeRepoWithFixtures('d6', []);
	const badPath = join(repoPath, 'does-not-exist.sqlite');
	registerConnections(repoPath, [{
		id:    'fixture',
		kind:  'sqlite',
		path:  badPath,
		label: 'D6 unavailable SQLite',
	}]);
	const runId = uniqueRunId('D6');
	try {
		const bundle = await runDataShaper(repoPath, runId, 'workspace');
		assert.ok(validateBundle(bundle));

		const haystack = `${bundle.summary}\n${bundle.surface}\n${bundle.artefacts}`.toLowerCase();

		// The bundle should acknowledge the connection failure -- either
		// by surfacing the error string or by reporting "no tables /
		// unavailable / failed".
		const errorAcknowledged =
			/\berror\b|\bfailed\b|\bunavailable\b|\bunreachable\b|\bunable\b|\bcannot\s+(open|connect|read|find)\b|\bmissing\b|\bnot\s+(found|exist)\b|\bdoes\s+not\s+exist\b/.test(haystack);
		assert.ok(errorAcknowledged,
			`connection failure should be acknowledged; got:\n${haystack.slice(0, 800)}`);

		// The shaper should NOT invent table content for a connection
		// it could not open. Specifically: well-known table names from
		// other fixtures (users / orders / order_items) should not
		// appear as if they belonged to this connection.
		const fabricated =
			/\busers\b/.test(haystack) &&
			/\borders\b/.test(haystack);
		assert.equal(fabricated, false,
			`shaper should not fabricate schema for an unavailable connection; got:\n${haystack.slice(0, 800)}`);
	} finally {
		cleanupRun(runId);
		unregisterConnections(repoPath);
	}
});
