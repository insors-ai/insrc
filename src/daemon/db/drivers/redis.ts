/**
 * Redis driver (kind: `redis`).
 *
 * Covers redis / valkey / keydb (wire-compatible). Uses `ioredis`
 * since it handles reconnect + pipelining + cluster transparently.
 *
 * scan: non-blocking SCAN MATCH iterator, capped at 500 keys.
 * get:  GET + TYPE; returns typed value (string/number via numeric
 *       detection / object via JSON decode / binary via bytes).
 * sampleShape: sample N values, merge observed JSON field shapes.
 */

import { Redis } from 'ioredis';

import { getLogger } from '../../../shared/logger.js';
import type {
	ConnectionConfig,
	KvDriver,
	KeyList,
	KvNamespace,
	KvNamespaceDescription,
	KvNamespaceList,
	KvValue,
	ScanOpts,
	ShapeReport,
} from '../../../shared/db-driver.js';
import { registerDriver } from '../registry.js';
import {
	SAMPLE_SHAPE_LIMIT,
	SCAN_TIMEOUT_MS,
	assertNamespaceAllowed,
	clampSampleShapeLimit,
	clampScanLimit,
} from './kv-common.js';
import { inferShape } from './shape-common.js';

const log = getLogger('db-redis');

class RedisDriver implements KvDriver {
	readonly family = 'kv' as const;
	readonly kind: string;

	private readonly client: Redis;

	constructor(
		readonly id: string,
		kind: 'redis' | 'valkey' | 'keydb',
		url: string,
		private readonly config: ConnectionConfig,
	) {
		this.kind = kind;
		this.client = new Redis(url, {
			lazyConnect: true,
			maxRetriesPerRequest: 1,
			enableOfflineQueue: false,
			connectTimeout: SCAN_TIMEOUT_MS,
		});
		this.client.on('error', (err: Error) => {
			log.warn({ id, err: err.message }, 'redis client error');
		});
	}

	async scan(opts: ScanOpts): Promise<KeyList> {
		assertNamespaceAllowed(this.config, opts);
		const limit = clampScanLimit(opts.limit);
		const pattern = opts.pattern ?? (opts.prefix === undefined ? '*' : `${opts.prefix}*`);

		const keys: string[] = [];
		let cursor = '0';
		do {
			const [next, batch] = await this.client.scan(
				cursor, 'MATCH', pattern, 'COUNT', Math.min(limit * 2, 500),
			);
			cursor = next;
			for (const k of batch) {
				keys.push(k);
				if (keys.length >= limit) { break; }
			}
		} while (cursor !== '0' && keys.length < limit);

		return { keys, truncated: keys.length >= limit && cursor !== '0' };
	}

	async get(key: string | Readonly<Record<string, unknown>>): Promise<KvValue> {
		if (typeof key !== 'string') {
			throw new Error(`data-driver: redis keys are plain strings, got ${typeof key}`);
		}
		const type = await this.client.type(key);
		if (type === 'none') {
			return { key, value: null, type: 'null' };
		}
		// Phase 1 scope: only `string` values. Other types (list / set /
		// hash / zset / stream) land as they come up.
		if (type !== 'string') {
			return { key, value: `<redis ${type}>`, type: 'string' };
		}
		const raw = await this.client.get(key);
		return classifyValue(key, raw);
	}

	async sampleShape(opts: ScanOpts): Promise<ShapeReport> {
		assertNamespaceAllowed(this.config, opts);
		const limit = clampSampleShapeLimit(opts.limit);
		const pattern = opts.pattern ?? (opts.prefix === undefined ? '*' : `${opts.prefix}*`);

		const keys: string[] = [];
		let cursor = '0';
		do {
			const [next, batch] = await this.client.scan(
				cursor, 'MATCH', pattern, 'COUNT', Math.min(limit * 2, SAMPLE_SHAPE_LIMIT * 4),
			);
			cursor = next;
			for (const k of batch) {
				keys.push(k);
				if (keys.length >= limit) { break; }
			}
		} while (cursor !== '0' && keys.length < limit);

		const values: unknown[] = [];
		for (const k of keys) {
			const raw = await this.client.get(k);
			if (raw === null) { continue; }
			try { values.push(JSON.parse(raw)); }
			catch { values.push(raw); }
		}
		return inferShape(values);
	}

	async close(): Promise<void> {
		await this.client.quit();
	}

	async listNamespaces(opts?: { readonly limit?: number }): Promise<KvNamespaceList> {
		// Redis has no native namespace concept; we derive one by
		// SCANning a small sample of keys and grouping by the first
		// `:` separator (a near-universal Redis convention).
		const limit = Math.min(Math.max(1, Math.floor(opts?.limit ?? 200)), 1000);
		const samplePool = Math.min(limit * 50, 5000);
		const prefixes = new Map<string, number>();
		let cursor = '0';
		let scanned = 0;
		do {
			const [next, batch] = await this.client.scan(cursor, 'MATCH', '*', 'COUNT', 500);
			cursor = next;
			for (const k of batch) {
				scanned++;
				const sep = k.indexOf(':');
				const ns = sep > 0 ? k.slice(0, sep) : k;
				prefixes.set(ns, (prefixes.get(ns) ?? 0) + 1);
				if (scanned >= samplePool) break;
			}
		} while (cursor !== '0' && scanned < samplePool);

		const sorted = [...prefixes.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.slice(0, limit);
		const namespaces: KvNamespace[] = sorted.map(([name, approxCount]) => ({
			name, kind: 'prefix', approxCount,
		}));
		return { namespaces, truncated: scanned >= samplePool && cursor !== '0', supported: true };
	}

	async describeNamespace(name: string, opts?: { readonly sampleSize?: number }): Promise<KvNamespaceDescription> {
		const limit = Math.min(Math.max(1, Math.floor(opts?.sampleSize ?? 50)), 200);
		const pattern = `${name}:*`;
		const keys: string[] = [];
		let cursor = '0';
		do {
			const [next, batch] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', Math.min(limit * 2, 500));
			cursor = next;
			for (const k of batch) {
				keys.push(k);
				if (keys.length >= limit) break;
			}
		} while (cursor !== '0' && keys.length < limit);
		const values: unknown[] = [];
		for (const k of keys) {
			const raw = await this.client.get(k);
			if (raw === null) continue;
			try { values.push(JSON.parse(raw)); } catch { values.push(raw); }
		}
		const shape = inferShape(values);
		return {
			name, kind: 'prefix',
			approxCount: keys.length,
			sampleKeys: keys.slice(0, 10),
			fields: shape.fields,
			supported: true,
		};
	}
}

// ---------------------------------------------------------------------------
// Value classification
// ---------------------------------------------------------------------------

function classifyValue(key: string, raw: string | null): KvValue {
	if (raw === null) { return { key, value: null, type: 'null' }; }
	// JSON-encoded values are extremely common in real-world Redis
	// caches; auto-decode so the LLM sees structure not strings.
	try {
		const parsed = JSON.parse(raw);
		if (parsed === null) { return { key, value: null, type: 'null' }; }
		if (Array.isArray(parsed)) { return { key, value: parsed, type: 'array' }; }
		if (typeof parsed === 'object') { return { key, value: parsed, type: 'object' }; }
		if (typeof parsed === 'boolean') { return { key, value: parsed, type: 'boolean' }; }
		if (typeof parsed === 'number') { return { key, value: parsed, type: 'number' }; }
	} catch { /* not JSON -- fall through to string */ }
	return { key, value: raw, type: 'string' };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

function makeFactory(kind: 'redis' | 'valkey' | 'keydb') {
	return async (config: ConnectionConfig) => {
		if (config.url === undefined) {
			throw new Error(`data-driver: ${kind} connection '${config.id}' missing url`);
		}
		return new RedisDriver(config.id, kind, config.url, config);
	};
}

registerDriver({ kind: 'redis',  family: 'kv', factory: makeFactory('redis') });
registerDriver({ kind: 'valkey', family: 'kv', factory: makeFactory('valkey') });
registerDriver({ kind: 'keydb',  family: 'kv', factory: makeFactory('keydb') });
