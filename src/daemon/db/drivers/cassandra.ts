/**
 * Cassandra driver (kind: `cassandra`).
 *
 * Wide-column store; lives in the KV family per the data-driver
 * plan with a keyed-access surface:
 *   scan         -> SELECT <pk-cols> FROM ks.table LIMIT ? (no ALLOW FILTERING)
 *   get          -> SELECT * FROM ks.table WHERE pk-cols
 *   sampleShape  -> SELECT * FROM ks.table LIMIT N + merge via inferShape.
 *
 * Config adds `keyspace` (default keyspace) + `contactPoints`
 * (string[]) + `localDataCenter` on `options`.
 */

import { Client } from 'cassandra-driver';
import type { ClientOptions } from 'cassandra-driver';

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
	SCAN_TIMEOUT_MS,
	assertNamespaceAllowed,
	clampSampleShapeLimit,
	clampScanLimit,
} from './kv-common.js';
import { inferShape } from './shape-common.js';

const log = getLogger('db-cassandra');

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface Target {
	readonly keyspace: string;
	readonly table: string;
}

function parseTarget(raw: string, defaultKs: string | undefined): Target {
	const dot = raw.indexOf('.');
	let ks: string | undefined;
	let table: string;
	if (dot > 0) {
		ks = raw.slice(0, dot);
		table = raw.slice(dot + 1);
	} else {
		ks = defaultKs;
		table = raw;
	}
	if (ks === undefined) {
		throw new Error(
			`data-driver: cassandra target '${raw}' needs a keyspace ` +
			`(either in the target as 'ks.table' or via config.options.keyspace)`,
		);
	}
	if (!IDENT_RE.test(ks) || !IDENT_RE.test(table)) {
		throw new Error(`data-driver: cassandra identifier invalid: '${raw}'`);
	}
	return { keyspace: ks, table };
}

class CassandraDriver implements KvDriver {
	readonly family = 'kv' as const;
	readonly kind = 'cassandra';

	private readonly client: Client;
	private readonly defaultKs: string | undefined;
	/** Memoized primary-key column lists per `ks.table`. */
	private readonly pkCache = new Map<string, readonly string[]>();

	constructor(
		readonly id: string,
		clientOpts: ClientOptions,
		private readonly config: ConnectionConfig,
	) {
		this.client = new Client(clientOpts);
		const ksOpt = (config.options ?? {})['keyspace'];
		this.defaultKs = typeof ksOpt === 'string' ? ksOpt : undefined;
	}

	async scan(opts: ScanOpts): Promise<KeyList> {
		assertNamespaceAllowed(this.config, opts);
		const limit = clampScanLimit(opts.limit);
		const target = parseTarget(requireTargetFromOpts(opts), this.defaultKs);
		const pkCols = await this.primaryKey(target);
		const select = pkCols.map(quoteIdent).join(', ');

		const res = await this.client.execute(
			`SELECT ${select} FROM ${quoteIdent(target.keyspace)}.${quoteIdent(target.table)} LIMIT ${limit + 1}`,
			[],
			{ readTimeout: SCAN_TIMEOUT_MS },
		);
		const keys = res.rows.slice(0, limit).map(r => {
			const k: Record<string, unknown> = { keyspace: target.keyspace, table: target.table };
			for (const c of pkCols) { k[c] = r[c]; }
			return k;
		});
		return { keys, truncated: res.rows.length > limit };
	}

	async get(key: string | Readonly<Record<string, unknown>>): Promise<KvValue> {
		if (typeof key === 'string' || !('keyspace' in key) || !('table' in key)) {
			throw new Error(
				`data-driver: cassandra keys must include keyspace + table + PK cols; ` +
				`got ${JSON.stringify(key)}`,
			);
		}
		const target: Target = {
			keyspace: String(key['keyspace']),
			table: String(key['table']),
		};
		if (!IDENT_RE.test(target.keyspace) || !IDENT_RE.test(target.table)) {
			throw new Error(`data-driver: cassandra key has invalid keyspace/table`);
		}
		const pkCols = await this.primaryKey(target);
		const whereFragments = pkCols.map((c, i) => `${quoteIdent(c)} = ?`);
		const values = pkCols.map(c => (key as Record<string, unknown>)[c]);

		const res = await this.client.execute(
			`SELECT * FROM ${quoteIdent(target.keyspace)}.${quoteIdent(target.table)}
			 WHERE ${whereFragments.join(' AND ')} LIMIT 1`,
			values,
			{ prepare: true, readTimeout: SCAN_TIMEOUT_MS },
		);
		const row = res.rows[0];
		if (row === undefined) { return { key, value: null, type: 'null' }; }
		return { key, value: row as Readonly<Record<string, unknown>>, type: 'object' };
	}

	async sampleShape(opts: ScanOpts): Promise<ShapeReport> {
		assertNamespaceAllowed(this.config, opts);
		const limit = clampSampleShapeLimit(opts.limit);
		const target = parseTarget(requireTargetFromOpts(opts), this.defaultKs);

		const res = await this.client.execute(
			`SELECT * FROM ${quoteIdent(target.keyspace)}.${quoteIdent(target.table)} LIMIT ${limit}`,
			[],
			{ readTimeout: SCAN_TIMEOUT_MS },
		);
		return inferShape(res.rows);
	}

	async close(): Promise<void> {
		await this.client.shutdown().catch((err: Error) => {
			log.warn({ id: this.id, err: err.message }, 'cassandra shutdown failed');
		});
	}

	async listNamespaces(opts?: { readonly limit?: number }): Promise<KvNamespaceList> {
		const limit = Math.min(Math.max(1, Math.floor(opts?.limit ?? 200)), 1000);
		const res = await this.client.execute(
			`SELECT keyspace_name, table_name FROM system_schema.tables`,
			[], { readTimeout: SCAN_TIMEOUT_MS },
		);
		const out: KvNamespace[] = [];
		let truncated = false;
		for (const r of res.rows) {
			const ks = String(r['keyspace_name']);
			if (ks === 'system' || ks === 'system_schema' || ks === 'system_auth' || ks === 'system_traces' || ks === 'system_distributed') continue;
			if (out.length >= limit) { truncated = true; break; }
			out.push({ name: `${ks}.${String(r['table_name'])}`, kind: 'table' });
		}
		return { namespaces: out, truncated, supported: true };
	}

	async describeNamespace(name: string, opts?: { readonly sampleSize?: number }): Promise<KvNamespaceDescription> {
		const sample = Math.min(Math.max(1, Math.floor(opts?.sampleSize ?? 50)), 200);
		const target = parseTarget(name, this.defaultKs);
		const colRes = await this.client.execute(
			`SELECT column_name, kind, type FROM system_schema.columns WHERE keyspace_name = ? AND table_name = ?`,
			[target.keyspace, target.table],
			{ prepare: true, readTimeout: SCAN_TIMEOUT_MS },
		);
		if (colRes.rows.length === 0) {
			return {
				name, kind: 'table',
				approxCount: null,
				sampleKeys: [], fields: [],
				supported: false,
			};
		}
		const fields = colRes.rows.map(r => ({
			path: String(r['column_name']),
			types: [String(r['type'])],
			nullable: r['kind'] !== 'partition_key' && r['kind'] !== 'clustering',
			frequency: 1,
		}));
		const sampleRes = await this.client.execute(
			`SELECT * FROM ${quoteIdent(target.keyspace)}.${quoteIdent(target.table)} LIMIT ${sample}`,
			[], { readTimeout: SCAN_TIMEOUT_MS },
		);
		const pkCols = await this.primaryKey(target);
		const sampleKeys = sampleRes.rows.slice(0, 10).map(r => {
			const k: Record<string, unknown> = { keyspace: target.keyspace, table: target.table };
			for (const c of pkCols) k[c] = r[c];
			return JSON.stringify(k);
		});
		return {
			name, kind: 'table',
			approxCount: null,  // Cassandra doesn't expose cheap row counts
			sampleKeys,
			fields,
			supported: true,
		};
	}

	// -------------------------------------------------------------------------

	private async primaryKey(target: Target): Promise<readonly string[]> {
		const key = `${target.keyspace}.${target.table}`;
		const cached = this.pkCache.get(key);
		if (cached !== undefined) { return cached; }

		const res = await this.client.execute(
			`SELECT column_name, kind
			 FROM system_schema.columns
			 WHERE keyspace_name = ? AND table_name = ?`,
			[target.keyspace, target.table],
			{ prepare: true, readTimeout: SCAN_TIMEOUT_MS },
		);
		const cols = res.rows
			.filter(r => r['kind'] === 'partition_key' || r['kind'] === 'clustering')
			.map(r => r['column_name'] as string);
		if (cols.length === 0) {
			throw new Error(`data-driver: cassandra table '${key}' not found or has no primary key`);
		}
		this.pkCache.set(key, cols);
		return cols;
	}
}

function quoteIdent(id: string): string {
	if (!IDENT_RE.test(id)) {
		throw new Error(`data-driver: invalid cassandra identifier '${id}'`);
	}
	return `"${id}"`;
}

function requireTargetFromOpts(opts: ScanOpts): string {
	const raw = opts.prefix ?? opts.pattern;
	if (raw === undefined) {
		throw new Error('data-driver: cassandra requires prefix="<keyspace>.<table>" (or bare "<table>" with config.options.keyspace)');
	}
	return raw;
}

// ---------------------------------------------------------------------------

registerDriver({
	kind: 'cassandra',
	family: 'kv',
	factory: async (config: ConnectionConfig) => {
		const opts = (config.options ?? {}) as Record<string, unknown>;
		const contactPoints = Array.isArray(opts['contactPoints'])
			? opts['contactPoints'].filter((x): x is string => typeof x === 'string')
			: undefined;
		if (contactPoints === undefined || contactPoints.length === 0) {
			throw new Error(
				`data-driver: cassandra connection '${config.id}' needs ` +
				`options.contactPoints: string[]`,
			);
		}
		const localDataCenter = typeof opts['localDataCenter'] === 'string'
			? opts['localDataCenter']
			: 'datacenter1';
		const clientOpts: ClientOptions = {
			contactPoints,
			localDataCenter,
			socketOptions: { connectTimeout: SCAN_TIMEOUT_MS, readTimeout: SCAN_TIMEOUT_MS },
		};
		if (typeof opts['keyspace'] === 'string') {
			clientOpts.keyspace = opts['keyspace'];
		}
		return new CassandraDriver(config.id, clientOpts, config);
	},
});
