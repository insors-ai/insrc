/**
 * Tests for daemon/db/drivers/kv-common.ts -- namespace whitelist
 * enforcement + clamp helpers. Shape-inference tests live in
 * `shape-common.test.ts` (see phase 7 prep -- inferShape was lifted).
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import type { ConnectionConfig } from '../../../shared/db-driver.js';
import { EtcdDriver } from '../drivers/etcd.js';
import { RedisDriver } from '../drivers/redis.js';
import {
	assertNamespaceAllowed,
	clampSampleShapeLimit,
	clampScanLimit,
} from '../drivers/kv-common.js';

const BASE_CONFIG: ConnectionConfig = {
	id: 'test',
	kind: 'redis',
	family: 'kv',
	url: 'redis://localhost:6379',
};

function cfg(allow?: readonly string[]): ConnectionConfig {
	if (allow === undefined) { return BASE_CONFIG; }
	return { ...BASE_CONFIG, namespace: { allow } };
}

// ---------------------------------------------------------------------------
// assertNamespaceAllowed
// ---------------------------------------------------------------------------

describe('assertNamespaceAllowed', () => {
	it('is a no-op when no whitelist is configured', () => {
		assert.doesNotThrow(() => assertNamespaceAllowed(cfg(), { pattern: 'anything:*', limit: 10 }));
	});

	it('accepts a prefix inside the whitelist', () => {
		assert.doesNotThrow(() => assertNamespaceAllowed(
			cfg(['cache:*', 'session:*']),
			{ prefix: 'cache:user:42', limit: 10 },
		));
	});

	it('accepts a pattern whose literal stem starts with an allowed prefix', () => {
		assert.doesNotThrow(() => assertNamespaceAllowed(
			cfg(['cache:', 'session:']),
			{ pattern: 'cache:user:*', limit: 10 },
		));
	});

	it('rejects a pattern outside the whitelist', () => {
		assert.throws(
			() => assertNamespaceAllowed(
				cfg(['cache:*']),
				{ pattern: 'auth:tokens:*', limit: 10 },
			),
			/outside the namespace whitelist/,
		);
	});

	it('rejects a prefix outside the whitelist', () => {
		assert.throws(
			() => assertNamespaceAllowed(
				cfg(['cache:']),
				{ prefix: 'session:', limit: 10 },
			),
			/outside the namespace whitelist/,
		);
	});

	it('requires a pattern or prefix when a whitelist is configured', () => {
		assert.throws(
			() => assertNamespaceAllowed(cfg(['cache:*']), { limit: 10 }),
			/pattern or prefix is required/,
		);
	});
});

// ---------------------------------------------------------------------------
// clamp helpers
// ---------------------------------------------------------------------------

describe('clamp helpers', () => {
	it('clamps scan limit to [1, 500]', () => {
		assert.equal(clampScanLimit(10_000), 500);
		assert.equal(clampScanLimit(-5), 1);
		assert.equal(clampScanLimit(0), 1);
		assert.equal(clampScanLimit(42), 42);
	});

	it('clamps sample-shape limit to [1, 50]', () => {
		assert.equal(clampSampleShapeLimit(10_000), 50);
		assert.equal(clampSampleShapeLimit(-5), 1);
	});
});


// ---------------------------------------------------------------------------
// The listing of a store that has no namespaces
// ---------------------------------------------------------------------------

describe('a store that derives its namespaces from its keys', () => {
	it('a Redis or etcd listing is a sample reported incomplete and no key scan is made', async () => {
		// The store holds 100,000 keys. The listing must not read them all, in either mode.
		const total = 100_000;

		// etcd: the read is bounded to one key past the sample (5,000), so 5,001 keys are fetched, not 100,000.
		const etcdAsked: number[] = [];
		const etcdKeys = Array.from({ length: total }, (_, i) => `/svc${i % 300}/k${i}`);
		const etcd = Object.assign(Object.create(EtcdDriver.prototype) as EtcdDriver, {
			client: { getAll: () => ({ prefix: () => ({ limit: (n: number) => { etcdAsked.push(n); return { keys: async () => etcdKeys.slice(0, n) }; } }) }) },
		});
		for (const opts of [undefined, { complete: true }] as const) {
			const listing = await etcd.listNamespaces(opts);
			assert.equal(listing.sampled, true, 'etcd: reported as a sample');
			assert.equal(listing.truncated, true, 'etcd: the sample was cut, so it is incomplete');
		}
		assert.deepEqual(etcdAsked, [5_001, 5_001], 'etcd: the complete mode reads no more keys than the default');

		// Redis: SCAN stops at the sample pool, however many keys the store holds.
		let scans = 0;
		const redis = new RedisDriver('kv-fixture', 'redis', 'redis://127.0.0.1:1', { id: 'kv-fixture', kind: 'redis', url: 'redis://127.0.0.1:1' });
		(redis as unknown as { client: { disconnect(): void } }).client.disconnect();
		Object.assign(redis, {
			client: {
				status: 'ready',
				scan: async (cursor: string) => {
					scans += 1;
					const from = Number(cursor);
					const batch = Array.from({ length: 500 }, (_, i) => `svc${(from + i) % 300}:k${from + i}`);
					return [from + 500 >= total ? '0' : String(from + 500), batch];
				},
			},
		});
		const callsFor = async (opts?: { complete?: boolean }): Promise<number> => {
			scans = 0;
			const listing = await redis.listNamespaces(opts);
			assert.equal(listing.sampled, true, 'redis: reported as a sample');
			assert.equal(listing.truncated, true, 'redis: the sample was cut, so it is incomplete');
			return scans;
		};
		const byDefault = await callsFor();
		const complete = await callsFor({ complete: true });
		assert.ok(byDefault <= 10, `redis: ${byDefault} SCAN calls for a store of ${total / 500} batches`);
		assert.equal(complete, byDefault, 'redis: the complete mode scans no more keys than the default');
	});
});
