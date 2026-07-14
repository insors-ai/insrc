/**
 * RedisDriver integration test.
 *
 *   INSRC_DB_TESTS=1
 *   INSRC_TEST_REDIS_URL=redis://localhost:6344
 */

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';

import { configFor, skipUnless } from './integration-helpers.js';

const cfg = configFor('INSRC_TEST_REDIS_URL');
skipUnless(cfg, 'RedisDriver integration');

if (cfg.enabled) {
	const { Redis } = await import('ioredis');
	await import('../drivers/redis.js');
	const { acquirePool } = await import('../pool-cache.js');
	const { connectionsPath } = await import('../config.js');
	const { mkdtempSync, rmSync } = await import('node:fs');
	const { mkdir, writeFile } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const repoRoot = mkdtempSync(join(tmpdir(), 'insrc-redis-int-'));
	const URL = cfg.url!;

	before(async () => {
		const seed = new Redis(URL);
		await seed.flushdb();
		await seed.set('user:42', JSON.stringify({ name: 'alice', age: 30 }));
		await seed.set('user:43', JSON.stringify({ name: 'bob',   age: 28 }));
		await seed.set('cache:foo', 'bar');
		await seed.quit();

		const path = connectionsPath(repoRoot);
		await mkdir(join(path, '..'), { recursive: true });
		await writeFile(path, JSON.stringify({
			connections: [{ id: 'live', kind: 'redis', url: URL }],
		}), 'utf8');
	});

	after(() => {
		try { rmSync(repoRoot, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	describe('RedisDriver (integration)', () => {
		it('scan with prefix returns matching keys', async () => {
			const pool = await acquirePool(repoRoot);
			const driver = await pool.acquire('live');
			const result = await (driver as { scan: (o: unknown) => Promise<unknown> }).scan({
				prefix: 'user:', limit: 100,
			});
			const keys = (result as { keys: string[] }).keys;
			assert.deepEqual(keys.sort(), ['user:42', 'user:43']);
		});

		it('get auto-decodes JSON values', async () => {
			const pool = await acquirePool(repoRoot);
			const driver = await pool.acquire('live');
			const result = await (driver as { get: (k: string) => Promise<unknown> }).get('user:42');
			assert.equal((result as { type: string }).type, 'object');
			assert.equal(((result as { value: { name: string } }).value).name, 'alice');
		});

		it('get returns plain strings as strings', async () => {
			const pool = await acquirePool(repoRoot);
			const driver = await pool.acquire('live');
			const result = await (driver as { get: (k: string) => Promise<unknown> }).get('cache:foo');
			assert.equal((result as { type: string }).type, 'string');
			assert.equal((result as { value: string }).value, 'bar');
		});

		it('sampleShape merges fields across JSON values', async () => {
			const pool = await acquirePool(repoRoot);
			const driver = await pool.acquire('live');
			const result = await (driver as { sampleShape: (o: unknown) => Promise<unknown> }).sampleShape({
				prefix: 'user:', limit: 50,
			});
			const fields = (result as { fields: { path: string }[] }).fields;
			const paths = fields.map(f => f.path).sort();
			assert.ok(paths.includes('name'));
			assert.ok(paths.includes('age'));
		});
	});
}
