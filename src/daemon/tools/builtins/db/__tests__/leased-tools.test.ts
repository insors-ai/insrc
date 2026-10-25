import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises, { writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { environment, deferred } from '../../../../db/__tests__/fixtures/saved-management-fixture.js';
import { _setPoolForTests, _resetCacheForTests } from '../../../../db/pool-cache.js';
import { registerDbTools } from '../index.js';
import { getTool } from '../../../registry.js';
import { dataSchemaDriftTool } from '../../data/schema-drift.js';
import type { ToolDeps } from '../../../types.js';
import type { Driver } from '../../../../../shared/db-driver.js';
import type { AccessPolicy } from '../../../../../shared/access.js';
registerDbTools();
const deps = (root: string, signal?: AbortSignal): ToolDeps => ({ sessionId: 'fixture', repoPath: root, requestId: 1, send: () => {
	}, ...(signal ? { signal } : {}) });
test('CM-S1-V: ordinary DB tool async iteration retains full-use ownership through completion cancellation failure and nested library cleanup', async () => {
	for (const ending of ['success', 'failure', 'cancel'] as const) {
		const env = await environment();
		const f = await env.rootFixture('root', { id: 'fixture', kind: 'postgres', url: 'postgres://host/db' });
		_setPoolForTests(f.root, f.pool);
		const started = deferred();
		const proceed = deferred();
		const cleanupStarted = deferred();
		const cleanup = deferred();
		const abort = new AbortController();
		let finalized = 0, libraryAcquired = 0, libraryReleased = 0, leases = 0, releases = 0;
		async function* rows() {
			try {
				yield { n: 1 };
				started.resolve();
				await proceed.promise;
				if (ending === 'failure')
					throw new Error('source failure');
				if (abort.signal.aborted)
					throw new Error('cancelled source');
				yield { n: 2 };
			}
			finally {
				cleanupStarted.resolve();
				await cleanup.promise;
				finalized++;
			}
		}
		const library = { acquire: async () => {
				libraryAcquired++;
				return { release: async () => {
						libraryReleased++;
					} };
			} };
		f.hooks.factory = async () => ({ id: 'fixture', kind: 'postgres', family: 'rdbms', close: async () => {
			}, sample: async () => {
				const lease = await library.acquire();
				try {
					const data: Record<string, unknown>[] = [];
					for await (const row of rows())
						data.push(row);
					return { target: 'table', columns: ['n'], rows: data, truncated: false };
				}
				finally {
					await lease.release();
				}
			} } as unknown as Driver);
		const originalLease = f.pool.lease.bind(f.pool);
		const spy = mock.method(f.pool, 'lease', async (id) => {
			leases++;
			const lease = await originalLease(id);
			return { ...lease, release: async () => {
					releases++;
					await lease.release();
				} };
		});
		let work: Promise<unknown> | undefined;
		try {
			const revision = f.pool.leaseState('fixture').revision;
			const request = await f.request('fixture', 'update', revision);
			f.reset();
			work = getTool('db_sql_sample')!.execute({ connectionId: 'fixture', target: 'table', limit: 10 }, deps(f.root, abort.signal));
			await started.promise;
			const held = leases;
			assert.ok(held > 0);
			assert.equal(f.pool.leaseState('fixture').active, held);
			assert.equal(releases, 0);
			assert.equal(libraryAcquired, 1);
			assert.equal(libraryReleased, 0);
			assert.equal(await Promise.race([work.then(() => false), delay(5, true)]), true);
			if (ending === 'cancel')
				abort.abort();
			assert.equal(releases, 0);
			assert.throws(() => f.pool.beginMutation('fixture', 'remove', revision), { code: 'busy' });
			const rejected = await f.service.mutate(f.context, request);
			assert.equal(rejected.status, 'rejected');
			if (rejected.status === 'rejected')
				assert.equal(rejected.code, 'busy');
			assert.equal(f.counts.writes, 0);
			assert.equal(f.counts.stages, 0);
			proceed.resolve();
			await cleanupStarted.promise;
			assert.equal(f.pool.leaseState('fixture').active, held);
			assert.equal(releases, 0);
			assert.equal(libraryReleased, 0);
			cleanup.resolve();
			const result = await work as {
				success: boolean;
				error?: string;
				data?: {
					rows: unknown[];
				};
			};
			assert.equal(result.success, ending === 'success');
			if (ending === 'success')
				assert.equal(result.data!.rows.length, 2);
			else
				assert.match(result.error!, /source/);
			assert.equal(finalized, 1);
			assert.equal(libraryReleased, 1);
			assert.equal(releases, held);
			assert.equal(f.pool.leaseState('fixture').active, 0);
		}
		finally {
			proceed.resolve();
			cleanup.resolve();
			if (work)
				await work;
			spy.mock.restore();
			_resetCacheForTests();
			await env.cleanup();
		}
	}
});
test('CM-S1-M: schema drift retains its revision lease through both live schema and asynchronous Prisma comparison', async () => {
	const env = await environment();
	const f = await env.rootFixture('root', { id: 'fixture', kind: 'postgres', url: 'postgres://host/db', schemaSource: { type: 'prisma', path: 'schema.prisma' } });
	_setPoolForTests(f.root, f.pool);
	const schema = join(f.root, 'schema.prisma');
	await writeFile(schema, 'model User {\n id Int @id\n @@map("users")\n}\n');
	f.hooks.factory = async () => ({ id: 'fixture', kind: 'postgres', family: 'rdbms', close: async () => {
		}, describe: async () => ({ target: 'users', columns: [{ name: 'id', type: 'integer', primaryKey: true, nullable: false }], source: 'introspect' }) } as unknown as Driver);
	const started = deferred();
	const proceed = deferred();
	const original = fsPromises.readFile;
	const read = mock.method(fsPromises, 'readFile', async (...args: Parameters<typeof original>) => {
		if (args[0] === schema) {
			started.resolve();
			await proceed.promise;
		}
		return original(...args);
	});
	syncBuiltinESMExports();
	let work: Promise<unknown> | undefined;
	try {
		const revision = f.pool.leaseState('fixture').revision;
		work = dataSchemaDriftTool.execute({ connectionId: 'fixture', target: 'users' }, deps(f.root));
		await started.promise;
		assert.ok(f.pool.leaseState('fixture').active > 0);
		assert.throws(() => f.pool.beginMutation('fixture', 'update', revision), { code: 'busy' });
		proceed.resolve();
		const result = await work as {
			success: boolean;
			data: {
				confidence: string;
				drift: unknown[];
			};
		};
		assert.equal(result.success, true);
		assert.equal(result.data.confidence, 'medium');
		assert.deepEqual(result.data.drift, []);
		assert.equal(f.pool.leaseState('fixture').active, 0);
	}
	finally {
		proceed.resolve();
		if (work)
			await work;
		read.mock.restore();
		syncBuiltinESMExports();
		_resetCacheForTests();
		await env.cleanup();
	}
});
test('CM-S1-M: metadata discovery and access policies remain scoped and never acquire a driver before admission', async () => {
	const env = await environment();
	const f = await env.rootFixture('root', { id: 'fixture', kind: 'csv', path: 'export.csv', label: 'Exports' });
	_setPoolForTests(f.root, f.pool);
	let builds = 0;
	f.hooks.factory = async () => {
		builds++;
		throw new Error('metadata must not build');
	};
	try {
		const file = getTool('db_file_describe')!;
		const access = file.access as unknown as AccessPolicy;
		assert.equal(access.kind, 'fs-path');
		assert.equal(await access.extractKey({ connectionId: 'fixture' }, { repoPath: f.root }), resolve(f.root, 'export.csv'));
		assert.equal((getTool('db_sql_describe')!.access as unknown as AccessPolicy).kind, 'connection');
		const listing = await getTool('db_list_connections')!.execute({}, deps(f.root));
		assert.equal(listing.success, true);
		assert.deepEqual(listing.data, [{ id: 'fixture', kind: 'csv', family: 'file', label: 'Exports', path: 'export.csv' }]);
		const mismatch = await getTool('db_sql_describe')!.execute({ connectionId: 'fixture', target: 'x' }, deps(f.root));
		assert.equal(mismatch.success, false);
		assert.match(mismatch.output, /FAMILY_MISMATCH/);
		const unknown = await file.execute({ connectionId: 'absent' }, deps(f.root));
		assert.equal(unknown.success, false);
		assert.match(unknown.output, /UNKNOWN_CONNECTION/);
		assert.equal(builds, 0);
		assert.equal(f.pool.leaseState('fixture').active, 0);
	}
	finally {
		_resetCacheForTests();
		await env.cleanup();
	}
});
test('CM-S1-M: metadata-only file listing keeps its pin until the filesystem result finishes without building a driver', async () => {
	const env = await environment();
	const f = await env.rootFixture('root', { id: 'fixture', kind: 'csv', path: 'export.csv' });
	_setPoolForTests(f.root, f.pool);
	const path = join(f.root, 'export.csv');
	await writeFile(path, 'n\n1\n');
	let builds = 0;
	f.hooks.factory = async () => {
		builds++;
		throw new Error('filesystem metadata must not build a driver');
	};
	const started = deferred();
	const proceed = deferred();
	const original = fsPromises.stat;
	const stat = mock.method(fsPromises, 'stat', async (...args: Parameters<typeof original>) => {
		if (args[0] === path) {
			started.resolve();
			await proceed.promise;
		}
		return original(...args);
	});
	syncBuiltinESMExports();
	let work: Promise<unknown> | undefined;
	try {
		work = getTool('db_file_list_files')!.execute({ connectionId: 'fixture' }, deps(f.root));
		await started.promise;
		assert.ok(f.pool.leaseState('fixture').active > 0);
		assert.equal(builds, 0);
		assert.throws(() => f.pool.beginMutation('fixture', 'remove', f.pool.leaseState('fixture').revision), { code: 'busy' });
		proceed.resolve();
		const result = await work as {
			success: boolean;
			data: {
				files: unknown[];
			};
		};
		assert.equal(result.success, true);
		assert.equal(result.data.files.length, 1);
		assert.equal(f.pool.leaseState('fixture').active, 0);
		assert.equal(builds, 0);
	}
	finally {
		proceed.resolve();
		if (work)
			await work;
		stat.mock.restore();
		syncBuiltinESMExports();
		_resetCacheForTests();
		await env.cleanup();
	}
});

test('CM-S1-V: actual MSSQL sample timeout retains underlying library work through late success or failure', async () => {
 await import('../../../../db/drivers/mssql.js');
 const { getFactory } = await import('../../../../db/registry.js');
 const factory = getFactory('mssql')!;
 const originalTimer = globalThis.setTimeout;
 for (const ending of ['success', 'failure'] as const) {
  const env = await environment();
  const f = await env.rootFixture('root', { id: 'fixture', kind: 'mssql', url: 'mssql://user:password@localhost/db' });
  _setPoolForTests(f.root, f.pool);
  const started = deferred(), proceed = deferred(), timedOut = deferred();
  let libraryReleased = 0;
  const actual = await factory({ id: 'fixture', kind: 'mssql', url: 'mssql://user:password@localhost/db' });
  Object.assign(actual, {
   describe: async () => ({ target: 'table', columns: [{ name: 'n', type: 'integer', nullable: false }], source: 'introspect' }),
   run: async () => { started.resolve(); try { await proceed.promise; if (ending === 'failure') throw new Error('late library failure'); return [{ n: 1 }]; } finally { libraryReleased++; } },
  });
  f.hooks.factory = async () => actual;
  const timer = mock.method(globalThis, 'setTimeout', ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
   if (ms === 5000) return originalTimer(() => { fn(...args); timedOut.resolve(); }, 1);
   return originalTimer(fn, ms, ...args);
  }) as typeof setTimeout);
  let work: Promise<unknown> | undefined;
  try {
   const revision = f.pool.leaseState('fixture').revision;
   work = getTool('db_sql_sample')!.execute({ connectionId: 'fixture', target: 'table', limit: 10 }, deps(f.root));
   await started.promise; await timedOut.promise;
   await delay(5);
   assert.ok(f.pool.leaseState('fixture').active > 0);
   assert.equal(libraryReleased, 0);
   assert.throws(() => f.pool.beginMutation('fixture', 'remove', revision), { code: 'busy' });
   assert.throws(() => f.pool.beginMutation('fixture', 'update', revision), { code: 'busy' });
   assert.equal(await Promise.race([work.then(() => false), delay(5, true)]), true);
   proceed.resolve();
   const result = await work as { success: boolean; error?: string };
   assert.equal(result.success, false); assert.match(result.error!, /timed out/);
   assert.equal(libraryReleased, 1); assert.equal(f.pool.leaseState('fixture').active, 0);
  } finally {
   proceed.resolve(); if (work) await work;
   timer.mock.restore(); _resetCacheForTests(); await env.cleanup();
  }
 }
});

test('CM-S1-V: parallel driver calls settle every library request before propagating a sibling failure', async () => {
 const { allDriverWork } = await import('../../../../db/driver-work.js');
 const pending = deferred(); let settled = false;
 const work = allDriverWork([Promise.reject(new Error('first failed')), pending.promise.then(() => 'second')]).finally(() => { settled = true; });
 await delay(5); assert.equal(settled, false);
 pending.resolve(); await assert.rejects(work, /first failed/); assert.equal(settled, true);
});
