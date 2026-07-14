/**
 * MongoDriver integration test.
 *
 *   INSRC_DB_TESTS=1
 *   INSRC_TEST_MONGO_URL=mongodb://insrc:insrc@localhost:27044/insrc_test
 */

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';

import { configFor, skipUnless } from './integration-helpers.js';

const cfg = configFor('INSRC_TEST_MONGO_URL');
skipUnless(cfg, 'MongoDriver integration');

if (cfg.enabled) {
	const { MongoClient } = await import('mongodb');
	await import('../drivers/mongodb.js');
	const { acquirePool } = await import('../pool-cache.js');
	const { connectionsPath } = await import('../config.js');
	const { mkdtempSync, rmSync } = await import('node:fs');
	const { mkdir, writeFile } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const repoRoot = mkdtempSync(join(tmpdir(), 'insrc-mongo-int-'));
	const URL = cfg.url!;
	const DB = 'insrc_test';
	const COLL = 'users';

	before(async () => {
		const seed = new MongoClient(URL);
		await seed.connect();
		const c = seed.db(DB).collection(COLL);
		await c.deleteMany({});
		await c.insertMany([
			{ _id: 'u1', name: 'alice', age: 30, addresses: [{ city: 'NYC' }] },
			{ _id: 'u2', name: 'bob',   age: 28 },
			{ _id: 'u3', name: 'carol', age: 41, role: 'admin' },
		] as never);
		await seed.close();

		const path = connectionsPath(repoRoot);
		await mkdir(join(path, '..'), { recursive: true });
		await writeFile(path, JSON.stringify({
			connections: [{ id: 'live', kind: 'mongodb', url: URL }],
		}), 'utf8');
	});

	after(() => {
		try { rmSync(repoRoot, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	describe('MongoDriver (integration)', () => {
		it('scan returns _id keys', async () => {
			const pool = await acquirePool(repoRoot);
			const driver = await pool.acquire('live');
			const result = await (driver as { scan: (o: unknown) => Promise<unknown> }).scan({
				prefix: `${DB}.${COLL}`, limit: 10,
			});
			const keys = (result as { keys: { _id: string }[] }).keys;
			assert.equal(keys.length, 3);
			assert.ok(keys.every(k => typeof k._id === 'string'));
		});

		it('get returns the full document', async () => {
			const pool = await acquirePool(repoRoot);
			const driver = await pool.acquire('live');
			const result = await (driver as { get: (k: unknown) => Promise<unknown> }).get({
				db: DB, collection: COLL, _id: 'u1',
			});
			assert.equal(((result as { value: { name: string } }).value).name, 'alice');
		});

		it('sampleShape merges fields across docs (incl. nested + sparse)', async () => {
			const pool = await acquirePool(repoRoot);
			const driver = await pool.acquire('live');
			const result = await (driver as { sampleShape: (o: unknown) => Promise<unknown> }).sampleShape({
				prefix: `${DB}.${COLL}`, limit: 10,
			});
			const paths = (result as { fields: { path: string }[] }).fields.map(f => f.path);
			assert.ok(paths.includes('name'));
			assert.ok(paths.includes('age'));
			assert.ok(paths.includes('addresses.[].city'));
			// `role` only on u3 -- frequency < 1
			const role = (result as { fields: { path: string; frequency: number }[] })
				.fields.find(f => f.path === 'role');
			assert.ok(role !== undefined);
			assert.ok(role.frequency < 1);
		});
	});
}
