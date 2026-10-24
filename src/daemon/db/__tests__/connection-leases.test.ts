import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DriverPool } from '../pool.js';
import { createConnectionResolver } from '../pool-cache.js';
import { connectionsPath } from '../config.js';
import { PATHS } from '../../../shared/paths.js';
import type { Driver } from '../../../shared/db-driver.js';
import type { ConnectionResolver, SafeConnection } from '../../../shared/connection-management.js';
import '../drivers/index.js';
function deferred<T = void>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((a, b) => {
		resolve = a;
		reject = b;
	});
	return { promise, resolve, reject };
}
async function fixture(extra: Record<string, unknown> = {}) {
	const root = await mkdtemp(join(tmpdir(), 'cm-leases-'));
	const original = PATHS.insrc;
	Object.defineProperty(PATHS, 'insrc', { value: join(root, 'insrc'), configurable: true });
	const path = connectionsPath(root);
	await mkdir(dirname(path), { recursive: true });
	const file = { connections: [{ id: 'fixture', kind: 'postgres', url: 'postgres://u:secret-canary@host/db', family: 'rdbms' }] };
	await writeFile(path, JSON.stringify(file));
	let builds = 0, closes = 0;
	const raw = { id: 'fixture', kind: 'postgres', family: 'rdbms', config: { password: 'private-canary' }, describe: async () => ({ columns: [] }), listTables: async () => ({ tables: [], total: 0 }), close: async () => {
			closes++;
		}, ...extra } as unknown as Driver;
	const pool = new DriverPool(root, { idleCloseMs: 15, factory: () => async () => {
			builds++;
			return raw;
		} });
	await pool.reload();
	return { root, path, file, pool, raw, get builds() {
			return builds;
		}, get closes() {
			return closes;
		}, cleanup: async () => {
			await pool.closeAll();
			Object.defineProperty(PATHS, 'insrc', { value: original, configurable: true });
			await rm(root, { recursive: true, force: true });
		} };
}
test('CM-S1-M: nested full-use callbacks block mutations and idle close; retained driver views are revoked', async () => {
	const f = await fixture();
	const pending = deferred();
	let captured: Driver | undefined;
	try {
		const work = f.pool.withConnection('fixture', async (driver) => {
			captured = driver;
			assert.equal((driver as unknown as Record<string, unknown>)['config'], undefined);
			assert.equal(Object.getPrototypeOf(driver), null);
			await f.pool.withConnection('fixture', async (nested) => {
				assert.equal(f.pool.leaseState('fixture').active, 2);
				await nested.describe!('x');
			});
			await pending.promise;
			return 7;
		});
		await delay(40);
		assert.equal(f.pool.leaseState('fixture').active, 1);
		assert.equal(f.closes, 0);
		const revision = f.pool.leaseState('fixture').revision;
		assert.throws(() => f.pool.beginMutation('fixture', 'update', revision), { code: 'busy' });
		assert.throws(() => f.pool.beginMutation('fixture', 'remove', revision), { code: 'busy' });
		pending.resolve();
		assert.equal(await work, 7);
		assert.equal(f.pool.leaseState('fixture').active, 0);
		assert.throws(() => captured!.describe!('x'), { code: 'conflict' });
		await delay(40);
		assert.equal(f.closes, 1);
		const release = f.pool.beginMutation('fixture', 'update', revision);
		await assert.rejects(f.pool.lease('fixture'), { code: 'busy' });
		release();
		release();
		const lease = await f.pool.lease('fixture');
		await lease.release();
		await lease.release();
		assert.equal(f.pool.leaseState('fixture').active, 0);
	}
	finally {
		pending.resolve();
		await f.cleanup();
	}
});
test('CM-S1-M: callback timeout and abandoned async work retain one lease until actual settle or rejection', async () => {
	for (const reject of [false, true]) {
		const late = deferred<unknown>();
		const f = await fixture({ sample: () => late.promise });
		let returned = false;
		try {
			const work = f.pool.withConnection('fixture', async (driver) => {
				void driver.sample!('x', { limit: 1 });
				returned = true;
			});
			await delay(25);
			assert.equal(returned, true);
			assert.equal(f.pool.leaseState('fixture').active, 1);
			assert.equal(f.closes, 0);
			if (reject)
				late.reject(new Error('late'));
			else
				late.resolve({ rows: [] });
			await work;
			assert.equal(f.pool.leaseState('fixture').active, 0);
		}
		finally {
			late.resolve({ rows: [] });
			await f.cleanup();
		}
	}
});
test('CM-S1-M: asynchronous iterator lifetime survives cancellation of a waiter and releases exactly once on late settle', async () => {
	const late = deferred();
	let iteratorCloses = 0;
	const f = await fixture({ scan: async function* () {
			try {
				yield 1;
				await late.promise;
				yield 2;
			}
			finally {
				iteratorCloses++;
			}
		} });
	try {
		const rows: number[] = [];
		const work = f.pool.withConnection('fixture', async (driver) => {
			for await (const row of (driver as unknown as {
				scan(): AsyncIterable<number>;
			}).scan())
				rows.push(row);
		});
		assert.equal(await Promise.race([work.then(() => false), delay(20, true)]), true);
		assert.equal(f.pool.leaseState('fixture').active, 1);
		assert.equal(f.closes, 0);
		const revision = f.pool.leaseState('fixture').revision;
		assert.throws(() => f.pool.beginMutation('fixture', 'update', revision), { code: 'busy' });
		late.resolve();
		await work;
		assert.deepEqual(rows, [1, 2]);
		assert.equal(iteratorCloses, 1);
		assert.equal(f.pool.leaseState('fixture').active, 0);
	}
	finally {
		late.resolve();
		await f.cleanup();
	}
});
test('CM-S1-M: callback errors and shutdown wait for active use; reload never closes a leased revision', async () => {
	const f = await fixture();
	const pending = deferred();
	try {
		await assert.rejects(f.pool.withConnection('fixture', async () => {
			throw new Error('callback');
		}), /callback/);
		assert.equal(f.pool.leaseState('fixture').active, 0);
		const lease = await f.pool.lease('fixture');
		const revision = lease.revision;
		await writeFile(f.path, JSON.stringify({ connections: [{ ...f.file.connections[0], url: 'postgres://u:secret-canary@new/db' }] }));
		await assert.rejects(f.pool.reload(), { code: 'busy' });
		assert.equal(f.pool.leaseState('fixture').revision, revision);
		await lease.release();
		await f.pool.reload();
		assert.notEqual(f.pool.leaseState('fixture').revision, revision);
		const work = f.pool.withConnection('fixture', async () => pending.promise);
		await delay(5);
		let closed = false;
		const closing = f.pool.closeAll().then(() => {
			closed = true;
		});
		await delay(25);
		assert.equal(closed, false);
		await assert.rejects(f.pool.lease('fixture'), { code: 'busy' });
		pending.resolve();
		await work;
		await closing;
		assert.equal(closed, true);
	}
	finally {
		pending.resolve();
		await f.cleanup();
	}
});
test('CM-S1-B: duplicate missing stale and busy mutation barriers reject before factory credential or writer effects', async () => {
	const f = await fixture();
	try {
		const revision = f.pool.leaseState('fixture').revision;
		assert.throws(() => f.pool.beginMutation('fixture', 'create'), { code: 'duplicate-id' });
		assert.throws(() => f.pool.beginMutation('missing', 'update', 'stale'), { code: 'not-found' });
		assert.throws(() => f.pool.beginMutation('fixture', 'update', 'stale'), { code: 'conflict' });
		const lease = await f.pool.lease('fixture');
		assert.throws(() => f.pool.beginMutation('fixture', 'remove', revision), { code: 'busy' });
		assert.equal(f.builds, 0);
		await lease.release();
		const release = f.pool.beginMutation('new', 'create');
		assert.throws(() => f.pool.beginMutation('new', 'create'), { code: 'busy' });
		release();
		assert.equal(f.builds, 0);
	}
	finally {
		await f.cleanup();
	}
});
test('CM-S1-M: safe resolver keeps own-directory lookup and permits an injected session overlay without implementing session storage', async () => {
	const f = await fixture();
	const roots: string[] = [];
	const context = { lookupRoot: f.root, daemonEpoch: 'fixture' };
	try {
		const saved = createConnectionResolver({ poolSource: async (root) => {
				roots.push(root);
				return f.pool;
			} });
		const list = await saved.list(context);
		assert.equal(list.length, 1);
		assert.ok(!JSON.stringify(list).includes('secret-canary'));
		assert.equal(list[0]!.key.repoRoot, f.root);
		const temporary: SafeConnection = { ...list[0]!, key: { repoRoot: f.root, scope: 'temporary', id: 'temporary' } };
		let used = false;
		const session: ConnectionResolver = { list: async () => [temporary], lease: async () => ({ key: temporary.key, revision: 'temporary', release: async () => {
				} }), withConnection: async (_context, _id, use) => {
				used = true;
				return f.pool.withConnection('fixture', use);
			} };
		const combined = createConnectionResolver({ poolSource: async (root) => {
				roots.push(root);
				return f.pool;
			}, sessionOverlay: async () => session });
		assert.equal((await combined.list({ ...context, sessionHandle: 'opaque' })).length, 2);
		await combined.withConnection({ ...context, sessionHandle: 'opaque' }, 'temporary', async (driver) => driver.describe!('x'));
		assert.equal(used, true);
		assert.ok(roots.every(root => root === f.root));
		await assert.rejects(saved.list({ ...context, sessionHandle: 'invalid' }), { code: 'session-expired' });
	}
	finally {
		await f.cleanup();
	}
});
test('CM-S1-M: a lease arriving during idle close waits for close and rebuild before driver use', async () => {
	const closing = deferred();
	const started = deferred();
	let calls = 0;
	const f = await fixture({ close: async () => {
			started.resolve();
			await closing.promise;
		}, describe: async () => {
			calls++;
			return { columns: [] };
		} });
	try {
		await f.pool.withConnection('fixture', async (driver) => driver.describe!('x'));
		await started.promise;
		let finished = false;
		const work = f.pool.withConnection('fixture', async (driver) => {
			await driver.describe!('x');
			finished = true;
		});
		await delay(20);
		assert.equal(finished, false);
		assert.equal(calls, 1);
		assert.equal(f.pool.leaseState('fixture').active, 1);
		closing.resolve();
		await work;
		assert.equal(f.builds, 2);
		assert.equal(calls, 2);
	}
	finally {
		closing.resolve();
		await f.cleanup();
	}
});
test('CM-S1-M: late iterator creation is closed before release and nested raw driver results cannot escape', async () => {
	const late = deferred();
	let closed = 0;
	const iterator = { next: async () => ({ done: true, value: undefined }), return: async () => {
			closed++;
			return { done: true, value: undefined };
		}, [Symbol.asyncIterator]() {
			return this;
		} };
	const f = await fixture({ scan: async () => {
			await late.promise;
			return iterator;
		} });
	try {
		const work = f.pool.withConnection('fixture', async (driver) => {
			void (driver as unknown as {
				scan(): Promise<unknown>;
			}).scan();
		});
		await delay(10);
		assert.equal(f.pool.leaseState('fixture').active, 1);
		late.resolve();
		await work;
		assert.equal(closed, 1);
		assert.equal(f.pool.leaseState('fixture').active, 0);
		const raw = f.raw as unknown as Record<string, unknown>;
		raw['sample'] = async () => ({ nested: { driver: f.raw } });
		await assert.rejects(f.pool.withConnection('fixture', async (driver) => driver.sample!('x', { limit: 1 })), { code: 'conflict' });
		assert.equal(f.pool.leaseState('fixture').active, 0);
	}
	finally {
		late.resolve();
		await f.cleanup();
	}
});
test('CM-S1-M: accessor inherited and collection-held raw drivers reject before callback results escape', async () => {
	const f = await fixture();
	try {
		for (const result of [{ get driver() {
					return f.raw;
				} }, Object.create({ driver: f.raw }), new Map([['driver', f.raw]]), new Set([f.raw])]) {
			(f.raw as unknown as Record<string, unknown>)['sample'] = async () => result;
			await assert.rejects(f.pool.withConnection('fixture', async (driver) => driver.sample!('x', { limit: 1 })), { code: 'conflict' });
			assert.equal(f.pool.leaseState('fixture').active, 0);
		}
	}
	finally {
		await f.cleanup();
	}
});
test('CM-S1-M: early iterator return and abort while a read is pending release only after underlying cancellation completes', async () => {
	const late = deferred();
	let finalized = 0;
	const controller = new AbortController();
	const f = await fixture({ scan: async function* () {
			try {
				yield 1;
				await late.promise;
				yield 2;
			}
			finally {
				finalized++;
			}
		} });
	try {
		await f.pool.withConnection('fixture', async (driver) => {
			for await (const _row of (driver as unknown as {
				scan(): AsyncIterable<number>;
			}).scan())
				break;
		});
		assert.equal(finalized, 1);
		assert.equal(f.pool.leaseState('fixture').active, 0);
		const started = deferred();
		const work = f.pool.withConnection('fixture', async (driver) => {
			const iterator = (driver as unknown as {
				scan(): AsyncIterable<number>;
			}).scan()[Symbol.asyncIterator]();
			await iterator.next();
			void iterator.next();
			started.resolve();
			await new Promise<void>((_resolve, reject) => controller.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
		});
		await started.promise;
		controller.abort();
		await delay(20);
		assert.equal(f.pool.leaseState('fixture').active, 1);
		assert.equal(finalized, 1);
		assert.throws(() => f.pool.beginMutation('fixture', 'remove', f.pool.leaseState('fixture').revision), { code: 'busy' });
		late.resolve();
		await assert.rejects(work, /cancelled/);
		assert.equal(finalized, 2);
		assert.equal(f.pool.leaseState('fixture').active, 0);
	}
	finally {
		late.resolve();
		await f.cleanup();
	}
});
test('CM-S1-M: executable function-held references reject while date binary and database JSON values retain wire semantics', async () => {
	const f = await fixture();
	try {
		for (const result of [Object.assign(() => {
			}, { driver: f.raw }), { rows: [{ value: Object.assign(() => {
						}, { driver: f.raw }) }] }, { rows: [{ value: () => f.raw }] }]) {
			(f.raw as unknown as Record<string, unknown>)['sample'] = async () => result;
			await assert.rejects(f.pool.withConnection('fixture', async (driver) => driver.sample!('x', { limit: 1 })), { code: 'conflict' });
		}
		const { ObjectId } = await import('bson');
		const id = new ObjectId('000000000000000000000001');
		const date = new Date('2020-01-02T00:00:00.000Z');
		const bytes = Buffer.from([1, 2, 3]);
		(f.raw as unknown as Record<string, unknown>)['sample'] = async () => ({ rows: [{ id, date, bytes }] });
		const result = await f.pool.withConnection('fixture', async (driver) => driver.sample!('x', { limit: 1 }));
		assert.equal(JSON.stringify(result), JSON.stringify({ rows: [{ id, date, bytes }] }));
		const row = result.rows[0] as Record<string, unknown>;
		assert.ok(row['date'] instanceof Date);
		assert.ok(Buffer.isBuffer(row['bytes']));
		assert.equal(row['id'], id.toHexString());
	}
	finally {
		await f.cleanup();
	}
});
test('CM-S1-M: sync throws promise rejections iterator failures metadata getters and factory failures cannot carry source objects out', async () => {
	const f = await fixture();
	const check = (error: unknown) => {
		assert.ok(error instanceof Error);
		assert.notEqual(error, f.raw);
		assert.equal((error as Record<string, unknown>)['driver'], undefined);
		assert.equal((error as Error & {
			cause?: unknown;
		}).cause, undefined);
		return true;
	};
	try {
		const source = Object.assign(new Error('backend failure'), { driver: f.raw, cause: f.raw });
		for (const fail of [() => {
				throw f.raw;
			}, () => Promise.reject(f.raw), () => {
				throw source;
			}, () => Promise.reject(source)]) {
			(f.raw as unknown as Record<string, unknown>)['sample'] = fail;
			await assert.rejects(f.pool.withConnection('fixture', async (driver) => driver.sample!('x', { limit: 1 })), check);
			assert.equal(f.pool.leaseState('fixture').active, 0);
		}
		for (const asynchronous of [false, true]) {
			(f.raw as unknown as Record<string, unknown>)['scan'] = () => ({ [Symbol.asyncIterator]() {
					return this;
				}, next() {
					if (asynchronous)
						return Promise.reject(source);
					throw source;
				}, return: async () => ({ done: true, value: undefined }) });
			await assert.rejects(f.pool.withConnection('fixture', async (driver) => {
				for await (const _value of (driver as unknown as {
					scan(): AsyncIterable<unknown>;
				}).scan()) {
				}
				;
			}), check);
			assert.equal(f.pool.leaseState('fixture').active, 0);
		}
		Object.defineProperty(f.raw, 'kind', { get() {
				throw f.raw;
			}, configurable: true });
		const captured = await f.pool.withConnection('fixture', async (driver) => {
			try {
				return driver.kind;
			}
			catch (error) {
				check(error);
				return error;
			}
		});
		check(captured);
		Object.defineProperty(f.raw, 'kind', { value: 'postgres', configurable: true });
		const other = new DriverPool(f.root, { factory: () => async () => {
				throw f.raw;
			} });
		try {
			await other.reload();
			await assert.rejects(other.withConnection('fixture', async () => undefined), check);
		}
		finally {
			await other.closeAll();
		}
	}
	finally {
		await f.cleanup();
	}
});
