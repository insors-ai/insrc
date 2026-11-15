/**
 * A live Redis listing is a sample, reported as sampled and incomplete
 * (LLD-b9d5c5c40df5a574-s4, task t14).
 *
 * Gated: INSRC_LIVE_TESTS=1 and INSRC_TEST_REDIS_URL (for example
 * redis://localhost:6344). Seeds its own keys under a unique prefix and removes
 * them again; it never flushes the database.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env['INSRC_TEST_REDIS_URL'];
const LIVE = process.env['INSRC_LIVE_TESTS'] === '1' && URL !== undefined && URL.length > 0;

test('a live Redis listing is reported as sampled and incomplete', { skip: LIVE ? false : 'INSRC_LIVE_TESTS=1 and INSRC_TEST_REDIS_URL are not both set' }, async () => {
	const { Redis } = await import('ioredis');
	const { RedisDriver } = await import('../drivers/redis.js');
	const prefix = `insrc-live-${process.pid}-${Date.now()}`;
	const seed = new Redis(URL!);
	const driver = new RedisDriver('live', 'redis', URL!, { id: 'live', kind: 'redis', url: URL! });
	try {
		// Enough keys that the sample (at most 5,000 of the store's keys) cannot hold them all.
		const pipeline = seed.pipeline();
		for (let i = 0; i < 6_000; i++) pipeline.set(`${prefix}-${i % 50}:k${i}`, '1');
		await pipeline.exec();

		const listing = await driver.listNamespaces({ complete: true });
		assert.equal(listing.supported, true);
		assert.equal(listing.sampled, true, 'the listing says it is a sample');
		assert.equal(listing.truncated, true, 'and that the sample was cut');
		assert.ok(listing.namespaces.length > 0);
	} finally {
		const keys = await seed.keys(`${prefix}-*`);
		if (keys.length > 0) await seed.del(...keys);
		await seed.quit();
		await driver.close();
	}
});
