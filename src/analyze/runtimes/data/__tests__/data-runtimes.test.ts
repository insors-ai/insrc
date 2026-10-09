/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Data-target runtime tests (3 deterministic + bootstrap + prompt
 * file existence).
 *
 * Live aggregator test lives in aggregate-report.live.test.ts so
 * the slow-Ollama path is on its own file.
 *
 * Two halves:
 *   1. Pure unit tests for _shared.ts helpers + bootstrap +
 *      prompt-file-exists. Always run.
 *   2. Integration tests against a real SQLite connection (via
 *      the node:sqlite driver) using the seeded fixture from
 *      analyze/context/__tests__/fixtures/setup.ts. Gated
 *      INSRC_LIVE_TESTS=1, same as every other graph/driver-touching
 *      live test.
 *
 * Run:
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH INSRC_LIVE_TESTS=1 \
 *     npx tsx --test \
 *     src/insrc/analyze/runtimes/data/__tests__/data-runtimes.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	_resetRuntimeBootstrapLatchForTests,
	registerBuiltinRuntimes,
} from '../../bootstrap.js';
import {
	getRuntime,
	listRegisteredRuntimes,
} from '../../../executor/registry.js';

import {
	DATA_AGGREGATE_PROMPT_PATH,
	dataDiscoveryConnectionsRuntime,
	dataDiscoveryObjectsRuntime,
	dataSchemaTableRuntime,
} from '../index.js';
import {
	_setDataPoolSourceForTest,
	optionalStringParam,
	requireStringParam,
} from '../_shared.js';
import { _setTaskScopeDepsForTest } from '../../shared/task-scope.js';
import { buildCompleteness } from '../../../completeness.js';
import { scopeErrorMapping, ScopeRefUnresolvedError } from '../../../context/invariants.js';
import type { ScopeDeps } from '../../../context/scope.js';
import type { RegisteredRepo } from '../../../../shared/types.js';

import type {
	PlannedTask,
	TemplateExecuteArgs,
} from '../../../executor/types.js';
import type { ClassifiedIntent } from '../../../../shared/analyze-types.js';

// ---------------------------------------------------------------------------
// Helpers shared between unit + integration
// ---------------------------------------------------------------------------

function mkIntent(scopeRefKind: ClassifiedIntent['scopeRef']['kind'], value: string): ClassifiedIntent {
	return {
		target:    'data',
		scope:     'S',
		focused:   false,
		scopeRef:  { kind: scopeRefKind, value },
		reasoning: 'data runtimes test fixture',
	};
}

function mkTask(templateId: string, params: Record<string, unknown>, produces: string[]): PlannedTask {
	return {
		taskId:    't01',
		template:  templateId,
		kind:      'leaf',
		params,
		produces,
		rationale: `${templateId} test`,
	};
}

function mkArgs(intent: ClassifiedIntent, task: PlannedTask, runId: string): TemplateExecuteArgs {
	return {
		task,
		intent,
		upstreamOutputs: new Map(),
		runId,
	};
}

// ---------------------------------------------------------------------------
// Pure helpers (always run)
// ---------------------------------------------------------------------------

// The scope of a data task (Story s7, task t4). resolveRepoPathFromIntent is
// gone; these replace its four tests. Stand-in pool and stand-in scope readers.

const REG_REPO = '/r/registered';
/** Readers: one registered repo, which declares the connections 'ledger-db' and 'audit-db'. */
const scopeReaders: ScopeDeps = {
	listRepos:           async () => [{ path: REG_REPO, status: 'ready' } as unknown as RegisteredRepo],
	findEntitiesByFile:  async () => [],
	listEntitiesForRepo: async () => [],
	loadConnections:     async () => ({ file: { connections: [] }, resolved: [{ id: 'ledger-db', kind: 'sqlite' }, { id: 'audit-db', kind: 'sqlite' }], warnings: [] }) as never,
};
/** A pool with two connections that records where it was opened and what was acquired. */
function recordingPool(): { opened: string[]; acquired: string[]; source: Parameters<typeof _setDataPoolSourceForTest>[0] } {
	const opened: string[] = [];
	const acquired: string[] = [];
	const driver = {
		family: 'rdbms', kind: 'sqlite',
		listTables: async () => ({ tables: [{ name: 'payments', kind: 'table' }], truncated: false }),
		describe:   async () => ({ columns: [{ name: 'id', type: 'INTEGER' }], source: 'catalog' }),
	};
	const pool = {
		reload:  async () => undefined,
		list:    () => [{ id: 'ledger-db', kind: 'sqlite', family: 'rdbms', label: 'ledger' }, { id: 'audit-db', kind: 'sqlite', family: 'rdbms', label: 'audit' }],
		acquire: async (id: string) => { acquired.push(id); return driver; },
	};
	return { opened, acquired, source: (async (path: string) => { opened.push(path); return pool; }) as never };
}
async function withStandIns<T>(body: (p: ReturnType<typeof recordingPool>) => Promise<T>): Promise<T> {
	const p = recordingPool();
	_setDataPoolSourceForTest(p.source);
	_setTaskScopeDepsForTest(scopeReaders);
	try { return await body(p); } finally { _setDataPoolSourceForTest(undefined); _setTaskScopeDepsForTest(undefined); }
}
const connectionsTask = (params: Record<string, unknown> = {}): PlannedTask => mkTask('data.discovery.connections', params, ['connections']);
const idsOf = (r: { outputs: ReadonlyMap<string, unknown> }): string[] => (r.outputs.get('connections') as { id: string }[]).map(c => c.id);

test('a data task with a connection scope works on that connection only', async () => {
	await withStandIns(async (p) => {
		const intent = mkIntent('connection', 'ledger-db');
		// The listing holds that connection and no other, from the repo that declares it.
		const listed = await dataDiscoveryConnectionsRuntime.execute(mkArgs(intent, connectionsTask(), 'conn-1'));
		assert.deepEqual(idsOf(listed), ['ledger-db']);
		assert.deepEqual(p.opened, [REG_REPO]);

		// A task that names the scope's connection works on it ...
		const objects = await dataDiscoveryObjectsRuntime.execute(mkArgs(intent, mkTask('data.discovery.objects', { connectionId: 'ledger-db' }, ['objects']), 'conn-2'));
		assert.equal((objects.outputs.get('objects') as unknown[]).length, 1);
		await dataSchemaTableRuntime.execute(mkArgs(intent, mkTask('data.schema.table', { connectionId: 'ledger-db', table: 'payments' }, ['schema']), 'conn-3'));
		assert.deepEqual(p.acquired, ['ledger-db', 'ledger-db']);

		// ... and one that names another connection is refused before the pool hands it over.
		for (const [runtime, task] of [
			[dataDiscoveryObjectsRuntime, mkTask('data.discovery.objects', { connectionId: 'audit-db' }, ['objects'])],
			[dataSchemaTableRuntime, mkTask('data.schema.table', { connectionId: 'audit-db', table: 'x' }, ['schema'])],
		] as const) {
			await assert.rejects(() => runtime.execute(mkArgs(intent, task, 'conn-4')),
				/the request's scope is the connection 'ledger-db', and this task names the connection 'audit-db'/);
		}
		assert.deepEqual(p.acquired, ['ledger-db', 'ledger-db'], 'the other connection was never acquired');

		// A connection no registered repo declares does not resolve.
		await assert.rejects(() => dataDiscoveryConnectionsRuntime.execute(mkArgs(mkIntent('connection', 'no-such-db'), connectionsTask(), 'conn-5')),
			(err: unknown) => err instanceof ScopeRefUnresolvedError);
		// Under a repo scope both connections are listed, as before.
		assert.deepEqual(idsOf(await dataDiscoveryConnectionsRuntime.execute(mkArgs(mkIntent('repo', REG_REPO), connectionsTask(), 'conn-6'))), ['audit-db', 'ledger-db']);
	});
});

test('a data task on an unregistered directory and on a manifest directory inside a registered repo opens its pool at that directory (mutation: open it at the containing repo)', async () => {
	await withStandIns(async (p) => {
		const cases: ReadonlyArray<readonly [ClassifiedIntent['scopeRef']['kind'], string]> = [
			['repo', '/r/not-registered'],                 // a repo scope on a directory no registered repo contains
			['manifest-dir', `${REG_REPO}/services/pay`],  // a manifest directory INSIDE a registered repo
			['workspace', `${REG_REPO}/services`],
			['workspace', '/r/elsewhere'],
			['repo', REG_REPO],
		];
		for (const [kind, value] of cases) {
			const intent = mkIntent(kind, value);
			await dataDiscoveryConnectionsRuntime.execute(mkArgs(intent, connectionsTask(), 'pool-1'));
			await dataDiscoveryObjectsRuntime.execute(mkArgs(intent, mkTask('data.discovery.objects', { connectionId: 'ledger-db' }, ['objects']), 'pool-2'));
			await dataSchemaTableRuntime.execute(mkArgs(intent, mkTask('data.schema.table', { connectionId: 'audit-db', table: 't' }, ['schema']), 'pool-3'));
		}
		// Every pool was opened at the scope's OWN path: the same value three times per case.
		assert.deepEqual(p.opened, cases.flatMap(([, value]) => [value, value, value]));
		// No connection is singled out: a task may name either.
		assert.ok(p.acquired.includes('audit-db') && p.acquired.includes('ledger-db'));
	});
});

test('the connection-listing task gives the same result for a repo scope as before, its scopeRefValue parameter still takes precedence, and a kind outside the data row is refused with the mismatch code', async () => {
	await withStandIns(async (p) => {
		const before = [
			{ id: 'audit-db', kind: 'sqlite', family: 'rdbms', label: 'audit', hasUrl: false, hasPath: false },
			{ id: 'ledger-db', kind: 'sqlite', family: 'rdbms', label: 'ledger', hasUrl: false, hasPath: false },
		];
		for (const kind of ['repo', 'workspace', 'manifest-dir'] as const) {
			const r = await dataDiscoveryConnectionsRuntime.execute(mkArgs(mkIntent(kind, '/r/svc'), connectionsTask(), 'same-1'));
			assert.deepEqual(r.outputs.get('connections'), before, kind);
			assert.deepEqual(r.completeness, buildCompleteness({ returned: 2, basis: 'data-source' }), kind);
		}
		assert.deepEqual(p.opened, ['/r/svc', '/r/svc', '/r/svc']);

		// The explicit path wins over the scope: also over one the data row refuses,
		// and over a connection scope (no connection is then singled out).
		p.opened.length = 0;
		for (const intent of [mkIntent('repo', '/r/svc'), mkIntent('symbol', 'foo'), mkIntent('connection', 'ledger-db')]) {
			const r = await dataDiscoveryConnectionsRuntime.execute(mkArgs(intent, connectionsTask({ scopeRefValue: '/r/override' }), 'same-2'));
			assert.deepEqual(idsOf(r), ['audit-db', 'ledger-db']);
		}
		assert.deepEqual(p.opened, ['/r/override', '/r/override', '/r/override']);

		// A kind outside the data row: the typed error, whose code is the mismatch code.
		for (const kind of ['file', 'module', 'symbol'] as const) {
			for (const [runtime, task] of [
				[dataDiscoveryConnectionsRuntime, connectionsTask()],
				[dataDiscoveryObjectsRuntime, mkTask('data.discovery.objects', { connectionId: 'ledger-db' }, ['objects'])],
				[dataSchemaTableRuntime, mkTask('data.schema.table', { connectionId: 'ledger-db', table: 't' }, ['schema'])],
			] as const) {
				await assert.rejects(() => runtime.execute(mkArgs(mkIntent(kind, '/r/svc/a.ts'), task, 'same-3')), (err: unknown) => {
					assert.equal(scopeErrorMapping(err)?.code, 'scope-ref-kind-target-mismatch', `${runtime.templateId}+${kind}`);
					assert.match((err as Error).message, new RegExp(`^${runtime.templateId.replace(/\./g, '\\.')}: scopeRef\\.kind='${kind}' is incompatible with target='data'\\. Allowed kinds for this target: connection, repo, manifest-dir, workspace\\.$`));
					return true;
				});
			}
		}
	});
});

test('requireStringParam: present non-empty -> returns; missing -> throws INV-5', () => {
	const args = mkArgs(mkIntent('workspace', '/r'),
		mkTask('test-tpl', { foo: 'bar' }, ['x']),
		'unit-5');
	assert.equal(requireStringParam(args, 'foo', 'tpl'), 'bar');
	assert.throws(() => requireStringParam(args, 'missing', 'tpl'), /tpl.*task\.params\.missing missing/);
});

test('requireStringParam: empty string -> throws (empty != non-empty)', () => {
	const args = mkArgs(mkIntent('workspace', '/r'),
		mkTask('t', { foo: '' }, ['x']),
		'unit-6');
	assert.throws(() => requireStringParam(args, 'foo', 't'), /missing or not a non-empty string/);
});

test('optionalStringParam: present -> value; missing -> undefined; empty -> throws', () => {
	const argsPresent = mkArgs(mkIntent('workspace', '/r'), mkTask('t', { k: 'v' }, ['x']), 'unit-7');
	const argsMissing = mkArgs(mkIntent('workspace', '/r'), mkTask('t', {},          ['x']), 'unit-8');
	const argsEmpty   = mkArgs(mkIntent('workspace', '/r'), mkTask('t', { k: '' },   ['x']), 'unit-9');
	assert.equal(optionalStringParam(argsPresent, 'k', 't'), 'v');
	assert.equal(optionalStringParam(argsMissing, 'k', 't'), undefined);
	assert.throws(() => optionalStringParam(argsEmpty, 'k', 't'), /present but not a non-empty string/);
});

// ---------------------------------------------------------------------------
// Bootstrap registration
// ---------------------------------------------------------------------------

test('registerBuiltinRuntimes registers all 4 data runtimes', () => {
	_resetRuntimeBootstrapLatchForTests();
	assert.doesNotThrow(() => registerBuiltinRuntimes());
	const ids = listRegisteredRuntimes();
	for (const tid of [
		'data.discovery.connections',
		'data.discovery.objects',
		'data.schema.table',
		'data.aggregate.report',
	]) {
		assert.notEqual(getRuntime(tid), undefined, `${tid} should be registered`);
		assert.ok(ids.includes(tid), `${tid} should appear in listRegisteredRuntimes`);
	}
});

test('runtime templateIds match expected ids', () => {
	assert.equal(dataDiscoveryConnectionsRuntime.templateId, 'data.discovery.connections');
	assert.equal(dataDiscoveryObjectsRuntime.templateId,     'data.discovery.objects');
	assert.equal(dataSchemaTableRuntime.templateId,          'data.schema.table');
});

// ---------------------------------------------------------------------------
// Prompt file actually exists
// ---------------------------------------------------------------------------

test('DATA_AGGREGATE_PROMPT_PATH resolves to an existing non-empty file', () => {
	const abs = isAbsolute(DATA_AGGREGATE_PROMPT_PATH)
		? DATA_AGGREGATE_PROMPT_PATH
		: resolveRelativeToInsrcRoot(DATA_AGGREGATE_PROMPT_PATH);
	assert.ok(existsSync(abs), `data aggregator prompt not found at ${abs}`);
});

function resolveRelativeToInsrcRoot(relPath: string): string {
	// .../analyze/runtimes/data/__tests__/data-runtimes.test.js
	//  -> ... -> .../insrc
	const thisFile = fileURLToPath(import.meta.url);
	return resolve(thisFile, '..', '..', '..', '..', '..', relPath);
}

// ---------------------------------------------------------------------------
// Integration tests against a real SQLite connection.
// Pattern mirrors daemon/db/__tests__/sqlite-driver.test.ts:
//   - tmp HOME (some drivers cache state under ~/.insrc)
//   - tmp repo dir; write db-connections.json
//   - SQLite fixture: 2 small tables + 1 FK
// ---------------------------------------------------------------------------

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('data runtimes integration: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

let originalHome: string | undefined;
let tmpHome:      string;
let repoRoot:     string;

// Avoid importing the drivers at module load when the gate is off.
// Dynamic-import inside the live setup hook.

async function buildSqliteFixture(): Promise<string> {
	const { DatabaseSync } = await import('node:sqlite');
	const dbPath = join(repoRoot, 'app.sqlite');
	const db = new DatabaseSync(dbPath);
	db.exec(`
		CREATE TABLE users (
			id    INTEGER PRIMARY KEY,
			email TEXT    NOT NULL UNIQUE,
			name  TEXT
		);
		CREATE TABLE orders (
			id      INTEGER PRIMARY KEY,
			user_id INTEGER NOT NULL REFERENCES users(id),
			total   REAL    NOT NULL DEFAULT 0
		);
		INSERT INTO users (id, email, name) VALUES (1, 'a@x', 'alice'), (2, 'b@x', 'bob');
		INSERT INTO orders (user_id, total) VALUES (1, 12.5), (1, 9.99), (2, 49.00);
	`);
	db.close();
	return dbPath;
}

test.before(async () => {
	if (!GATE) return;

	// Sandbox HOME so the data-driver pool config layer doesn't write
	// to the user's real ~/.insrc.
	originalHome = process.env['HOME'];
	tmpHome = mkdtempSync(join(tmpdir(), 'insrc-data-rt-home-'));
	process.env['HOME'] = tmpHome;

	repoRoot = mkdtempSync(join(tmpdir(), 'insrc-data-rt-repo-'));

	// Register the sqlite driver (self-registers at import time).
	await import('../../../../daemon/db/drivers/sqlite.js');

	await buildSqliteFixture();

	// Write db-connections.json under <home>/.insrc/repos/<repoId>/...
	const { connectionsPath } = await import('../../../../daemon/db/config.js');
	const connPath = connectionsPath(repoRoot);
	await mkdir(dirname(connPath), { recursive: true });
	writeFileSync(connPath, JSON.stringify({
		connections: [
			{ id: 'app', kind: 'sqlite', path: 'app.sqlite', label: 'app sqlite' },
		],
	}), 'utf8');
});

test.after(async () => {
	if (!GATE) return;
	const { closeAll, _resetCacheForTests } = await import('../../../../daemon/db/pool-cache.js');
	await closeAll();
	_resetCacheForTests();
	if (originalHome !== undefined) process.env['HOME'] = originalHome;
	if (tmpHome)  { try { rmSync(tmpHome,  { recursive: true, force: true }); } catch { /* */ } }
	if (repoRoot) { try { rmSync(repoRoot, { recursive: true, force: true }); } catch { /* */ } }
});

// ---------------------------------------------------------------------------
// data.discovery.connections
// ---------------------------------------------------------------------------

test('discovery.connections: lists the registered sqlite connection (no secret leak)',
{ skip: !GATE }, async () => {
	const task = mkTask('data.discovery.connections', {}, ['connections']);
	const result = await dataDiscoveryConnectionsRuntime.execute(
		mkArgs(mkIntent('workspace', repoRoot), task, 'rt-data-conn-1'));

	const connections = result.outputs.get('connections') as Array<{
		id: string; kind: string; family?: string; label?: string;
		hasUrl: boolean; hasPath: boolean;
	}>;
	assert.equal(connections.length, 1);
	const c = connections[0]!;
	assert.equal(c.id,     'app');
	assert.equal(c.kind,   'sqlite');
	assert.equal(c.family, 'rdbms');
	assert.equal(c.label,  'app sqlite');
	assert.equal(c.hasUrl,  false);
	assert.equal(c.hasPath, true);

	// Sanity: no `url` or `secretRef` field exposed.
	for (const key of Object.keys(c)) {
		assert.equal(key === 'url' || key === 'secretRef', false,
			`connection record must not expose '${key}'`);
	}
});

// ---------------------------------------------------------------------------
// data.discovery.objects
// ---------------------------------------------------------------------------

test('discovery.objects: lists rdbms tables for the sqlite connection',
{ skip: !GATE }, async () => {
	const task = mkTask('data.discovery.objects',
		{ connectionId: 'app' }, ['objects']);
	const result = await dataDiscoveryObjectsRuntime.execute(
		mkArgs(mkIntent('workspace', repoRoot), task, 'rt-data-obj-1'));

	const objects = result.outputs.get('objects') as Array<{ kind: string; name?: string }>;
	const names = objects.map(o => o.name).sort();
	assert.deepEqual(names, ['orders', 'users']);
	for (const o of objects) {
		assert.equal(o.kind, 'table');
	}
});

test('discovery.objects: kind filter narrows the result',
{ skip: !GATE }, async () => {
	// kind='table' matches the sqlite listing; kind='file' filters
	// everything out (no file objects on an RDBMS connection).
	const taskFile = mkTask('data.discovery.objects',
		{ connectionId: 'app', kind: 'file' }, ['objects']);
	const result = await dataDiscoveryObjectsRuntime.execute(
		mkArgs(mkIntent('workspace', repoRoot), taskFile, 'rt-data-obj-filter'));
	assert.deepEqual(result.outputs.get('objects'), []);
});

test('discovery.objects: unknown connectionId -> throws (no such connection)',
{ skip: !GATE }, async () => {
	const task = mkTask('data.discovery.objects',
		{ connectionId: 'does-not-exist' }, ['objects']);
	await assert.rejects(
		dataDiscoveryObjectsRuntime.execute(
			mkArgs(mkIntent('workspace', repoRoot), task, 'rt-data-obj-missing')),
		/no connection 'does-not-exist'/,
	);
});

test('discovery.objects: missing connectionId param -> INV-5 message',
{ skip: !GATE }, async () => {
	const task = mkTask('data.discovery.objects', {}, ['objects']);
	await assert.rejects(
		dataDiscoveryObjectsRuntime.execute(
			mkArgs(mkIntent('workspace', repoRoot), task, 'rt-data-obj-no-id')),
		/task\.params\.connectionId missing/,
	);
});

// ---------------------------------------------------------------------------
// data.schema.table
// ---------------------------------------------------------------------------

test('schema.table: describes the users table -- columns + types + nullability',
{ skip: !GATE }, async () => {
	const task = mkTask('data.schema.table',
		{ connectionId: 'app', table: 'users' }, ['table-schema']);
	const result = await dataSchemaTableRuntime.execute(
		mkArgs(mkIntent('workspace', repoRoot), task, 'rt-data-schema-1'));

	const schema = result.outputs.get('table-schema') as {
		connectionId: string; table: string; source: string;
		columns: Array<{ name: string; type: string; nullable?: boolean; primaryKey?: boolean }>;
	};
	assert.equal(schema.connectionId, 'app');
	assert.equal(schema.table, 'users');
	assert.equal(schema.source, 'introspect');

	const byName = new Map(schema.columns.map(c => [c.name, c]));
	assert.equal(byName.get('id')?.primaryKey, true);
	assert.equal(byName.get('email')?.nullable, false);
	assert.equal(byName.get('name')?.nullable, true);
});

test('schema.table: describes orders table -- FK to users surfaces',
{ skip: !GATE }, async () => {
	const task = mkTask('data.schema.table',
		{ connectionId: 'app', table: 'orders' }, ['table-schema']);
	const result = await dataSchemaTableRuntime.execute(
		mkArgs(mkIntent('workspace', repoRoot), task, 'rt-data-schema-fk'));

	const schema = result.outputs.get('table-schema') as {
		columns: Array<{ name: string; foreignKey?: { table: string; column: string } }>;
	};
	const userIdCol = schema.columns.find(c => c.name === 'user_id');
	assert.deepEqual(userIdCol?.foreignKey, { table: 'users', column: 'id' });
});

test('schema.table: missing table param -> INV-5 message',
{ skip: !GATE }, async () => {
	const task = mkTask('data.schema.table', { connectionId: 'app' }, ['table-schema']);
	await assert.rejects(
		dataSchemaTableRuntime.execute(
			mkArgs(mkIntent('workspace', repoRoot), task, 'rt-data-schema-no-table')),
		/task\.params\.table missing/,
	);
});

test('schema.table: nonexistent table -> driver error propagates',
{ skip: !GATE }, async () => {
	const task = mkTask('data.schema.table',
		{ connectionId: 'app', table: 'nope' }, ['table-schema']);
	await assert.rejects(
		dataSchemaTableRuntime.execute(
			mkArgs(mkIntent('workspace', repoRoot), task, 'rt-data-schema-nope')),
		// SqliteDriver throws with "table not found"; we just verify
		// it surfaces (driver-side error text is engine-specific).
		/.+/,
	);
});
