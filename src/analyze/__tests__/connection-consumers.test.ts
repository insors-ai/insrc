import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises, { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { environment, deferred } from '../../daemon/db/__tests__/fixtures/saved-management-fixture.js';
import { DriverPool } from '../../daemon/db/pool.js';
import type { Driver } from '../../shared/db-driver.js';
import { _setDataPoolSourceForTest } from '../runtimes/data/_shared.js';
import { _setTaskScopeDepsForTest } from '../runtimes/shared/task-scope.js';
import { dataDiscoveryConnectionsRuntime, dataDiscoveryObjectsRuntime, dataSchemaTableRuntime } from '../runtimes/data/index.js';
import { runDbConnectionsList } from '../explore/db-connections-list.js';
import { runDbTablesList } from '../explore/db-tables-list.js';
import { runDbTableDescribe } from '../explore/db-table-describe.js';
import { setGraphStorePath, closeGraphStore } from '../../db/graph/store.js';
const scopeDeps = { listRepos: async () => [], findEntitiesByFile: async () => [], listEntitiesForRepo: async () => [], loadConnections: async () => ({ file: { connections: [] }, resolved: [], warnings: [] }) };
function args(root: string, template: string) {
	return { runId: 'fixture', intent: { target: 'data', scope: 'S', focused: false, reasoning: 'fixture', scopeRef: { kind: 'repo', value: root } }, task: { taskId: 't1', template, kind: 'leaf', params: { connectionId: 'fixture', table: 'table' }, produces: [], rationale: 'fixture' }, upstreamOutputs: new Map() } as never;
}
function exploration(type: string) {
	return { type, id: 'e1', purpose: 'fixture', params: { connectionId: 'fixture', target: 'table' } } as never;
}
function context(root: string) {
	return { runId: 'fixture', repoPath: root, closureRepos: [root], readDep: () => undefined } as never;
}
test('CM-S1-V: injected runtime and exploration aliases use safe metadata and retain actual revision leases through success and rejection', async () => {
	const env = await environment();
	setGraphStorePath(join(env.directory, 'graph.lmdb'));
	const f = await env.rootFixture('root', { id: 'fixture', kind: 'postgres', url: 'postgres://u:metadata-secret-canary@host/db' });
	const roots: string[] = [];
	const borrowed: Driver[] = [];
	let bypasses = 0;
	const source = async (root: string) => {
		roots.push(root);
		await f.pool.reload();
		return { safeList: () => f.pool.safeList(), withConnection: <T>(id: string, use: (driver: Driver) => Promise<T>) => f.pool.withConnection(id, async (driver) => {
				borrowed.push(driver);
				return use(driver);
			}), acquire: () => {
				bypasses++;
				throw new Error('raw acquisition bypass');
			}, list: () => {
				bypasses++;
				throw new Error('raw metadata bypass');
			} } as unknown as DriverPool;
	};
	_setDataPoolSourceForTest(source);
	_setTaskScopeDepsForTest(scopeDeps as never);
	try {
		const metadata = await dataDiscoveryConnectionsRuntime.execute(args(f.root, 'data.discovery.connections'));
		assert.ok(!JSON.stringify([...metadata.outputs]).includes('secret-canary'));
		const listed = await runDbConnectionsList(exploration('db.connections.list'), context(f.root), source);
		assert.ok(!JSON.stringify(listed).includes('secret-canary'));
		assert.equal(bypasses, 0);
		assert.equal(borrowed.length, 0);
		const raw = await f.pool.acquire('fixture') as unknown as Record<string, unknown>;
		const operations = [() => dataDiscoveryObjectsRuntime.execute(args(f.root, 'data.discovery.objects')), () => dataSchemaTableRuntime.execute(args(f.root, 'data.schema.table')), () => runDbTablesList(exploration('db.tables.list'), context(f.root), source), () => runDbTableDescribe(exploration('db.table.describe'), context(f.root), source)];
		for (const fail of [false, true])
			for (const operation of operations) {
				const started = deferred();
				const late = deferred();
				raw['listTables'] = async () => {
					started.resolve();
					await late.promise;
					if (fail)
						throw new Error('late-source');
					return { tables: [{ name: 'table', kind: 'table' }], truncated: false };
				};
				raw['describe'] = async () => {
					started.resolve();
					await late.promise;
					if (fail)
						throw new Error('late-source');
					return { columns: [{ name: 'id', type: 'INTEGER' }], source: 'introspect' };
				};
				const revision = f.pool.leaseState('fixture').revision;
				const request = await f.request('fixture', 'update', revision);
				const work = operation();
				try {
					await started.promise;
					await delay(5);
					assert.equal(f.pool.leaseState('fixture').active, 1);
					const result = await f.service.mutate(f.context, request);
					assert.equal(result.status, 'rejected');
					if (result.status === 'rejected')
						assert.equal(result.code, 'busy');
					assert.equal(f.counts.stages, 0);
					assert.equal(f.counts.writes, 0);
				}
				finally {
					late.resolve();
				}
				if (fail)
					await assert.rejects(work, /late-source/);
				else
					await work;
				assert.equal(f.pool.leaseState('fixture').active, 0);
				assert.throws(() => borrowed.at(-1)!.describe!('table'), { code: 'conflict' });
			}
		assert.equal(bypasses, 0);
		assert.ok(roots.every(root => root === f.root));
	}
	finally {
		_setDataPoolSourceForTest(undefined);
		_setTaskScopeDepsForTest(undefined);
		await closeGraphStore();
		await env.cleanup();
	}
});
test('CM-S1-M: file enumeration resolves its own directory and retains a lease throughout asynchronous filesystem walking', async () => {
	const env = await environment();
	setGraphStorePath(join(env.directory, 'graph.lmdb'));
	const f = await env.rootFixture('root', { id: 'fixture', kind: 'csv', path: 'data', recursive: true });
	const data = join(f.root, 'data');
	await mkdir(data);
	await writeFile(join(data, 'a.csv'), 'a\n1\n');
	let closes = 0;
	const pool = new DriverPool(f.root, { idleCloseMs: 10, factory: () => async (config) => ({ id: config.id, kind: config.kind, family: 'file', close: async () => {
				closes++;
			} } as Driver) });
	await pool.reload();
	const source = async () => pool;
	_setDataPoolSourceForTest(source);
	_setTaskScopeDepsForTest(scopeDeps as never);
	const started = deferred();
	const late = deferred();
	const original = fsPromises.readdir;
	const read = mock.method(fsPromises, 'readdir', async (...params: Parameters<typeof original>) => {
		if (params[0] === data) {
			started.resolve();
			await late.promise;
		}
		return original(...params);
	});
	syncBuiltinESMExports();
	try {
		const work = dataDiscoveryObjectsRuntime.execute(args(f.root, 'data.discovery.objects'));
		await started.promise;
		await delay(25);
		assert.equal(pool.leaseState('fixture').active, 1);
		assert.equal(closes, 0);
		assert.throws(() => pool.beginMutation('fixture', 'update', pool.leaseState('fixture').revision), { code: 'busy' });
		late.resolve();
		const result = await work;
		assert.equal((result.outputs.get('objects') as {
			path: string;
		}[])[0]!.path, 'a.csv');
		assert.equal(pool.leaseState('fixture').active, 0);
	}
	finally {
		late.resolve();
		read.mock.restore();
		syncBuiltinESMExports();
		_setDataPoolSourceForTest(undefined);
		_setTaskScopeDepsForTest(undefined);
		await pool.closeAll();
		await closeGraphStore();
		await env.cleanup();
	}
});
