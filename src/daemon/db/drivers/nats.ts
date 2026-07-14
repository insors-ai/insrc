/**
 * NATS JetStream KV driver (kind: `nats`).
 *
 * KV bucket from JetStream; not pub/sub. Config carries
 * `options.servers: string[]` + `options.bucket: string`.
 * Scan uses `kv.keys(filter)` (NATS subject-wildcard syntax `*`/`>`);
 * sample_shape decodes UTF-8 + JSON when possible.
 */

import { connect } from '@nats-io/transport-node';
import type { NatsConnection } from '@nats-io/nats-core';
import { Kvm } from '@nats-io/kv';
import type { KV } from '@nats-io/kv';

import { getLogger } from '../../../shared/logger.js';
import type {
	ConnectionConfig,
	KeyList,
	KvDriver,
	KvNamespaceDescription,
	KvNamespaceList,
	KvValue,
	ScanOpts,
	ShapeReport,
} from '../../../shared/db-driver.js';
import { registerDriver } from '../registry.js';
import {
	SCAN_TIMEOUT_MS,
	assertNamespaceAllowed,
	clampSampleShapeLimit,
	clampScanLimit,
} from './kv-common.js';
import { inferShape } from './shape-common.js';

const log = getLogger('db-nats');

class NatsKvDriver implements KvDriver {
	readonly family = 'kv' as const;
	readonly kind = 'nats';

	private ncPromise: Promise<NatsConnection> | null = null;
	private kvPromise: Promise<KV> | null = null;

	constructor(
		readonly id: string,
		private readonly servers: readonly string[],
		private readonly bucket: string,
		private readonly config: ConnectionConfig,
	) { }

	async scan(opts: ScanOpts): Promise<KeyList> {
		assertNamespaceAllowed(this.config, opts);
		const limit = clampScanLimit(opts.limit);
		const filter = opts.pattern ?? (opts.prefix === undefined ? '>' : `${opts.prefix}>`);
		const kv = await this.kv();

		const keys: string[] = [];
		const iter = await kv.keys(filter);
		for await (const k of iter) {
			keys.push(k);
			if (keys.length >= limit) { break; }
		}
		return { keys, truncated: keys.length >= limit };
	}

	async get(key: string | Readonly<Record<string, unknown>>): Promise<KvValue> {
		if (typeof key !== 'string') {
			throw new Error(`data-driver: nats keys are plain strings; got ${typeof key}`);
		}
		const kv = await this.kv();
		const entry = await kv.get(key);
		if (entry === null) { return { key, value: null, type: 'null' }; }
		return classifyBinary(key, entry.value);
	}

	async sampleShape(opts: ScanOpts): Promise<ShapeReport> {
		assertNamespaceAllowed(this.config, opts);
		const limit = clampSampleShapeLimit(opts.limit);
		const filter = opts.pattern ?? (opts.prefix === undefined ? '>' : `${opts.prefix}>`);
		const kv = await this.kv();

		const values: unknown[] = [];
		const iter = await kv.keys(filter);
		const picked: string[] = [];
		for await (const k of iter) {
			picked.push(k);
			if (picked.length >= limit) { break; }
		}
		for (const k of picked) {
			const entry = await kv.get(k);
			if (entry === null) { continue; }
			values.push(decodeMaybeJson(entry.value));
		}
		return inferShape(values);
	}

	async close(): Promise<void> {
		if (this.ncPromise !== null) {
			try { await (await this.ncPromise).close(); }
			catch (err) { log.warn({ id: this.id, err: (err as Error).message }, 'nats close failed'); }
		}
	}

	async listNamespaces(opts?: { readonly limit?: number }): Promise<KvNamespaceList> {
		// NATS KV has multiple buckets per server. The connection config
		// pins a single bucket, so for now we report just that bucket --
		// listing all buckets across the JetStream cluster would need an
		// explicit JSM call (jsm.streams.list filtered by KV_*) and is
		// gated on whether the user actually wants cross-bucket listing.
		const limit = Math.min(Math.max(1, Math.floor(opts?.limit ?? 200)), 1000);
		void limit;
		return {
			namespaces: [{ name: this.bucket, kind: 'bucket' }],
			truncated: false,
			supported: true,
		};
	}

	async describeNamespace(name: string, opts?: { readonly sampleSize?: number }): Promise<KvNamespaceDescription> {
		if (name !== this.bucket) {
			return { name, kind: 'bucket', approxCount: null, sampleKeys: [], fields: [], supported: false };
		}
		const limit = Math.min(Math.max(1, Math.floor(opts?.sampleSize ?? 50)), 200);
		const kv = await this.kv();
		const keys: string[] = [];
		const iter = await kv.keys('>');
		for await (const k of iter) {
			keys.push(k);
			if (keys.length >= limit) break;
		}
		const values: unknown[] = [];
		for (const k of keys) {
			const entry = await kv.get(k);
			if (entry === null) continue;
			values.push(decodeMaybeJson(entry.value));
		}
		const shape = inferShape(values);
		return {
			name, kind: 'bucket',
			approxCount: keys.length,
			sampleKeys: keys.slice(0, 10),
			fields: shape.fields,
			supported: true,
		};
	}

	// -------------------------------------------------------------------------

	private nc(): Promise<NatsConnection> {
		let p = this.ncPromise;
		if (p === null) {
			p = connect({
				servers: [...this.servers],
				timeout: SCAN_TIMEOUT_MS,
			});
			this.ncPromise = p;
		}
		return p;
	}

	private async kv(): Promise<KV> {
		if (this.kvPromise === null) {
			this.kvPromise = (async () => {
				const nc = await this.nc();
				const kvm = new Kvm(nc);
				return kvm.open(this.bucket);
			})();
		}
		return this.kvPromise;
	}
}

// ---------------------------------------------------------------------------

function decodeMaybeJson(bytes: Uint8Array): unknown {
	let text: string;
	try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
	catch { return { type: 'binary', bytes: bytes.byteLength }; }
	try { return JSON.parse(text); }
	catch { return text; }
}

function classifyBinary(key: string, bytes: Uint8Array): KvValue {
	let text: string;
	try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
	catch { return { key, value: bytes, type: 'binary' }; }
	try {
		const parsed = JSON.parse(text);
		if (parsed === null) { return { key, value: null, type: 'null' }; }
		if (Array.isArray(parsed)) { return { key, value: parsed, type: 'array' }; }
		switch (typeof parsed) {
			case 'object':  return { key, value: parsed, type: 'object' };
			case 'number':  return { key, value: parsed, type: 'number' };
			case 'boolean': return { key, value: parsed, type: 'boolean' };
			case 'string':  return { key, value: parsed, type: 'string' };
		}
	} catch { /* not JSON -- fall through to string */ }
	return { key, value: text, type: 'string' };
}

// ---------------------------------------------------------------------------

registerDriver({
	kind: 'nats',
	family: 'kv',
	factory: async (config: ConnectionConfig) => {
		const opts = (config.options ?? {}) as Record<string, unknown>;
		const servers = Array.isArray(opts['servers'])
			? opts['servers'].filter((x): x is string => typeof x === 'string')
			: undefined;
		if (servers === undefined || servers.length === 0) {
			throw new Error(
				`data-driver: nats connection '${config.id}' needs options.servers: string[]`,
			);
		}
		const bucket = typeof opts['bucket'] === 'string' ? opts['bucket'] : undefined;
		if (bucket === undefined) {
			throw new Error(
				`data-driver: nats connection '${config.id}' needs options.bucket: string`,
			);
		}
		return new NatsKvDriver(config.id, servers, bucket, config);
	},
});
