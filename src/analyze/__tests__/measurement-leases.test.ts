import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { environment, deferred } from '../../daemon/db/__tests__/fixtures/saved-management-fixture.js';
import type { Driver } from '../../shared/db-driver.js';
import { measureDataSource } from '../measure.js';
import { _setDataPoolSourceForTest } from '../runtimes/data/_shared.js';
import { setGraphStorePath, closeGraphStore } from '../../db/graph/store.js';
test('CM-S1-V: measure timeouts and cancelled waiters share one full-use lease until late connect/list success or rejection then clear pendingListings', async () => {
	for (const phase of ['connect', 'listing'] as const)
		for (const fail of [false, true]) {
			const env = await environment();
			setGraphStorePath(join(env.directory, 'graph.lmdb'));
			const f = await env.rootFixture('root', { id: 'fixture', kind: 'postgres', url: 'postgres://host/db' });
			const started = deferred();
			const late = deferred();
			const listening = deferred();
			const abort = new AbortController();
			let builds = 0, listings = 0, leases = 0, releases = 0;
			const unhandled: unknown[] = [];
			const onUnhandled = (error: unknown) => unhandled.push(error);
			process.on('unhandledRejection', onUnhandled);
			const raw = { id: 'fixture', kind: 'postgres', family: 'rdbms', close: async () => {
				}, listTables: async (opts: {
					complete?: boolean;
				}) => {
					assert.equal(opts.complete, true);
					listings++;
					if (phase === 'listing') {
						started.resolve();
						await late.promise;
						if (fail)
							throw new Error('late-source');
					}
					return { tables: [{ name: 'one' }, { name: 'two' }, { name: 'three' }], truncated: false };
				} } as unknown as Driver;
			f.hooks.factory = async () => {
				builds++;
				if (phase === 'connect') {
					started.resolve();
					await late.promise;
					if (fail)
						throw new Error('late-source');
				}
				return raw;
			};
			const roots: string[] = [];
			_setDataPoolSourceForTest(async (root) => {
				roots.push(root);
				return f.pool;
			});
			const originalLease = f.pool.lease.bind(f.pool);
			const leaseSpy = mock.method(f.pool, 'lease', async (id: string) => {
				leases++;
				const lease = await originalLease(id);
				return { ...lease, release: async () => {
						releases++;
						await lease.release();
					} };
			});
			const originalListen = abort.signal.addEventListener.bind(abort.signal);
			const signalSpy = mock.method(abort.signal, 'addEventListener', (...args: Parameters<typeof originalListen>) => {
				const result = originalListen(...args);
				if (args[0] === 'abort')
					listening.resolve();
				return result;
			});
			let joined: Promise<unknown> | undefined;
			try {
				const revision = f.pool.leaseState('fixture').revision;
				const request = await f.request('fixture', 'update', revision);
				f.reset();
				const first = measureDataSource({ poolPath: f.root, connectionId: 'fixture' }, 'S', { sourceTimeoutMs: 10 });
				await started.promise;
				const timedOut = await first;
				assert.equal(timedOut.determined, false);
				assert.match(timedOut.note!, /timed out/);
				assert.equal(leases, 1);
				assert.equal(releases, 0);
				assert.equal(f.pool.leaseState('fixture').active, 1);
				const second = measureDataSource({ poolPath: f.root, connectionId: 'fixture' }, 'M', { sourceTimeoutMs: 60000, signal: abort.signal });
				await listening.promise;
				abort.abort();
				const cancelled = await second;
				assert.equal(cancelled.determined, false);
				assert.match(cancelled.note!, /cancelled while/);
				assert.equal(leases, 1);
				assert.equal(releases, 0);
				joined = measureDataSource({ poolPath: f.root, connectionId: 'fixture' }, 'L', { sourceTimeoutMs: 60000 });
				await delay(5);
				assert.equal(leases, 1);
				assert.equal(releases, 0);
				const rejected = await f.service.mutate(f.context, request);
				assert.equal(rejected.status, 'rejected');
				if (rejected.status === 'rejected')
					assert.equal(rejected.code, 'busy');
				assert.throws(() => f.pool.beginMutation('fixture', 'remove', revision), { code: 'busy' });
				assert.equal(f.counts.stages, 0);
				assert.equal(f.counts.writes, 0);
				late.resolve();
				const outcome = await joined as Awaited<ReturnType<typeof measureDataSource>>;
				assert.equal(outcome.determined, !fail);
				assert.equal(outcome.sizeHint, 'L');
				if (fail)
					assert.match(outcome.note!, /late-source/);
				else
					assert.equal(outcome.items, 3);
				assert.equal(leases, 1);
				assert.equal(releases, 1);
				assert.equal(f.pool.leaseState('fixture').active, 0);
				assert.equal(builds, 1);
				assert.equal(listings, phase === 'connect' && fail ? 0 : 1);
				// The completed or rejected pending call is removed: a fresh measure must actually ask again.
				f.hooks.factory = async () => raw;
				(raw as unknown as Record<string, unknown>)['listTables'] = async () => {
					listings++;
					return { tables: [{ name: 'fresh' }], truncated: false };
				};
				const fresh = await measureDataSource({ poolPath: f.root, connectionId: 'fixture' }, undefined, { sourceTimeoutMs: 1000 });
				assert.equal(fresh.determined, true);
				assert.equal(fresh.items, 1);
				assert.equal(leases, 2);
				assert.equal(releases, 2);
				assert.equal(f.pool.leaseState('fixture').active, 0);
				assert.ok(roots.every(root => root === f.root));
				await delay(5);
				assert.deepEqual(unhandled, []);
			}
			finally {
				late.resolve();
				if (joined)
					await joined;
				signalSpy.mock.restore();
				leaseSpy.mock.restore();
				_setDataPoolSourceForTest(undefined);
				await closeGraphStore();
				await env.cleanup();
				process.off('unhandledRejection', onUnhandled);
			}
		}
});
