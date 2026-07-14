/**
 * DynamoDB driver (kind: `dynamodb`).
 *
 * Key model: each table has a partition key (and optionally a sort
 * key); items are addressed by the composite. Maps onto our KV
 * shape with key objects:
 *
 *   scan({ prefix: '<table>', limit })
 *     -> ScanCommand projecting just the key attrs.
 *   get({ table, ...keyAttrs })
 *     -> GetItemCommand by exact composite key.
 *   sampleShape({ prefix: '<table>', limit })
 *     -> ScanCommand + inferShape over the returned items.
 *
 * Connection config:
 *   options.region: 'us-east-1'        (required)
 *   options.profile: 'insrc-ro'        (optional AWS profile)
 *   options.endpoint: 'http://localhost:8000'  (optional; for local DynamoDB)
 *
 * Credentials resolve through the AWS SDK's default chain: env
 * vars first, then `~/.aws/credentials` keyed by `profile`, then
 * IAM role (when run on EC2 / ECS).
 */

import {
	DynamoDBClient,
	DescribeTableCommand,
	GetItemCommand,
	ListTablesCommand,
	ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { fromIni } from '@aws-sdk/credential-providers';

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
	assertNamespaceAllowed,
	clampSampleShapeLimit,
	clampScanLimit,
} from './kv-common.js';
import { inferShape } from './shape-common.js';

const log = getLogger('db-dynamodb');

const TABLE_NAME_RE = /^[A-Za-z0-9_.-]{3,255}$/;

interface TableMeta {
	readonly partitionKey: string;
	readonly sortKey?: string;
}

class DynamoDriver implements KvDriver {
	readonly family = 'kv' as const;
	readonly kind = 'dynamodb';

	private readonly client: DynamoDBClient;
	private readonly tableMetaCache = new Map<string, TableMeta>();

	constructor(
		readonly id: string,
		region: string,
		profile: string | undefined,
		endpoint: string | undefined,
		private readonly config: ConnectionConfig,
	) {
		this.client = new DynamoDBClient({
			region,
			...(profile !== undefined ? { credentials: fromIni({ profile }) } : {}),
			...(endpoint !== undefined ? { endpoint } : {}),
		});
	}

	async scan(opts: ScanOpts): Promise<KeyList> {
		assertNamespaceAllowed(this.config, opts);
		const limit = clampScanLimit(opts.limit);
		const table = requireTableName(opts);
		const meta = await this.tableMeta(table);

		const projection = meta.sortKey !== undefined
			? `${attrAlias(meta.partitionKey, 0)}, ${attrAlias(meta.sortKey, 1)}`
			: attrAlias(meta.partitionKey, 0);
		const expressionNames: Record<string, string> = { '#k0': meta.partitionKey };
		if (meta.sortKey !== undefined) { expressionNames['#k1'] = meta.sortKey; }

		const res = await this.client.send(new ScanCommand({
			TableName: table,
			Limit: limit + 1,
			ProjectionExpression: projection,
			ExpressionAttributeNames: expressionNames,
		}));

		const items = res.Items ?? [];
		const keys = items.slice(0, limit).map(item => {
			const k: Record<string, unknown> = { table };
			k[meta.partitionKey] = unmarshalAttr(item[meta.partitionKey]);
			if (meta.sortKey !== undefined) {
				k[meta.sortKey] = unmarshalAttr(item[meta.sortKey]);
			}
			return k;
		});
		return { keys, truncated: items.length > limit };
	}

	async get(key: string | Readonly<Record<string, unknown>>): Promise<KvValue> {
		if (typeof key === 'string' || !('table' in key)) {
			throw new Error(
				`data-driver: dynamodb keys must be { table, <pk>, [<sortKey>] }; ` +
				`got ${JSON.stringify(key)}`,
			);
		}
		const table = String((key as Record<string, unknown>)['table']);
		if (!TABLE_NAME_RE.test(table)) {
			throw new Error(`data-driver: dynamodb table '${table}' has invalid characters`);
		}
		const meta = await this.tableMeta(table);
		const keyMap: Record<string, { S?: string; N?: string; B?: Uint8Array }> = {};
		const pkVal = (key as Record<string, unknown>)[meta.partitionKey];
		if (pkVal === undefined) {
			throw new Error(`data-driver: dynamodb key missing partition key '${meta.partitionKey}'`);
		}
		keyMap[meta.partitionKey] = marshalAttr(pkVal);
		if (meta.sortKey !== undefined) {
			const skVal = (key as Record<string, unknown>)[meta.sortKey];
			if (skVal === undefined) {
				throw new Error(`data-driver: dynamodb key missing sort key '${meta.sortKey}'`);
			}
			keyMap[meta.sortKey] = marshalAttr(skVal);
		}

		const res = await this.client.send(new GetItemCommand({
			TableName: table,
			Key: keyMap as never,
		}));
		if (res.Item === undefined) {
			return { key, value: null, type: 'null' };
		}
		return { key, value: unmarshalItem(res.Item), type: 'object' };
	}

	async sampleShape(opts: ScanOpts): Promise<ShapeReport> {
		assertNamespaceAllowed(this.config, opts);
		const limit = clampSampleShapeLimit(opts.limit);
		const table = requireTableName(opts);

		const res = await this.client.send(new ScanCommand({
			TableName: table,
			Limit: limit,
		}));
		const items = (res.Items ?? []).map(it => unmarshalItem(it));
		return inferShape(items);
	}

	async close(): Promise<void> {
		this.client.destroy();
	}

	async listNamespaces(opts?: { readonly limit?: number }): Promise<KvNamespaceList> {
		const limit = Math.min(Math.max(1, Math.floor(opts?.limit ?? 200)), 1000);
		const out: KvNamespace[] = [];
		let lastEvaluated: string | undefined;
		let truncated = false;
		do {
			const cmdInput: { ExclusiveStartTableName?: string; Limit?: number } = { Limit: Math.min(100, limit - out.length) };
			if (lastEvaluated !== undefined) cmdInput.ExclusiveStartTableName = lastEvaluated;
			const res = await this.client.send(new ListTablesCommand(cmdInput));
			for (const name of res.TableNames ?? []) {
				if (out.length >= limit) { truncated = true; break; }
				out.push({ name, kind: 'table' });
			}
			lastEvaluated = res.LastEvaluatedTableName;
			if (lastEvaluated !== undefined && out.length >= limit) truncated = true;
		} while (lastEvaluated !== undefined && out.length < limit);
		return { namespaces: out, truncated, supported: true };
	}

	async describeNamespace(name: string, opts?: { readonly sampleSize?: number }): Promise<KvNamespaceDescription> {
		const sample = Math.min(Math.max(1, Math.floor(opts?.sampleSize ?? 50)), 200);
		if (!TABLE_NAME_RE.test(name)) {
			throw new Error(`data-driver: dynamodb table '${name}' has invalid characters`);
		}
		const desc = await this.client.send(new DescribeTableCommand({ TableName: name }));
		const approxCount = desc.Table?.ItemCount ?? null;
		const meta = await this.tableMeta(name);
		const scanRes = await this.client.send(new ScanCommand({ TableName: name, Limit: sample }));
		const items = (scanRes.Items ?? []).map(unmarshalItem);
		const sampleKeys = items.slice(0, 10).map(it => {
			const k: Record<string, unknown> = { table: name, [meta.partitionKey]: it[meta.partitionKey] };
			if (meta.sortKey !== undefined) k[meta.sortKey] = it[meta.sortKey];
			return JSON.stringify(k);
		});
		const shape = inferShape(items);
		return {
			name, kind: 'table',
			approxCount,
			sampleKeys,
			fields: shape.fields,
			supported: true,
		};
	}

	private async tableMeta(table: string): Promise<TableMeta> {
		if (!TABLE_NAME_RE.test(table)) {
			throw new Error(`data-driver: dynamodb table '${table}' has invalid characters`);
		}
		const cached = this.tableMetaCache.get(table);
		if (cached !== undefined) { return cached; }
		const res = await this.client.send(new DescribeTableCommand({ TableName: table }));
		const ks = res.Table?.KeySchema ?? [];
		const partition = ks.find(k => k.KeyType === 'HASH')?.AttributeName;
		const sort = ks.find(k => k.KeyType === 'RANGE')?.AttributeName;
		if (partition === undefined) {
			throw new Error(`data-driver: dynamodb table '${table}' has no partition key in DescribeTable`);
		}
		const meta: TableMeta = sort !== undefined
			? { partitionKey: partition, sortKey: sort }
			: { partitionKey: partition };
		this.tableMetaCache.set(table, meta);
		log.debug({ id: this.id, table, meta }, 'cached table meta');
		return meta;
	}
}

// ---------------------------------------------------------------------------
// Marshalling helpers (DynamoDB attribute-value flatten)
// ---------------------------------------------------------------------------

function marshalAttr(v: unknown): { S?: string; N?: string; B?: Uint8Array } {
	if (typeof v === 'number') { return { N: String(v) }; }
	if (typeof v === 'string') { return { S: v }; }
	if (v instanceof Uint8Array) { return { B: v }; }
	return { S: String(v) };
}

function unmarshalAttr(v: unknown): unknown {
	if (v === null || v === undefined) { return null; }
	const av = v as Record<string, unknown>;
	if ('S' in av) { return av['S']; }
	if ('N' in av) { return Number(av['N']); }
	if ('BOOL' in av) { return av['BOOL']; }
	if ('NULL' in av) { return null; }
	if ('B' in av) { return av['B']; }
	if ('SS' in av) { return av['SS']; }
	if ('NS' in av) { return (av['NS'] as string[]).map(Number); }
	if ('L' in av) { return (av['L'] as unknown[]).map(unmarshalAttr); }
	if ('M' in av) {
		const out: Record<string, unknown> = {};
		for (const [k, sub] of Object.entries(av['M'] as Record<string, unknown>)) {
			out[k] = unmarshalAttr(sub);
		}
		return out;
	}
	return v;
}

function unmarshalItem(item: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(item)) {
		out[k] = unmarshalAttr(v);
	}
	return out;
}

function attrAlias(_name: string, idx: number): string {
	return `#k${idx}`;
}

function requireTableName(opts: ScanOpts): string {
	const raw = opts.prefix ?? opts.pattern;
	if (raw === undefined || raw === '') {
		throw new Error('data-driver: dynamodb requires prefix="<tableName>"');
	}
	if (!TABLE_NAME_RE.test(raw)) {
		throw new Error(`data-driver: dynamodb table name '${raw}' has invalid characters`);
	}
	return raw;
}

// ---------------------------------------------------------------------------

registerDriver({
	kind: 'dynamodb',
	family: 'kv',
	factory: async (config: ConnectionConfig) => {
		const opts = (config.options ?? {}) as Record<string, unknown>;
		const region = typeof opts['region'] === 'string' ? opts['region'] : undefined;
		if (region === undefined) {
			throw new Error(
				`data-driver: dynamodb connection '${config.id}' needs options.region: string`,
			);
		}
		const profile = typeof opts['profile'] === 'string' ? opts['profile'] : undefined;
		const endpoint = typeof opts['endpoint'] === 'string' ? opts['endpoint'] : undefined;
		return new DynamoDriver(config.id, region, profile, endpoint, config);
	},
});
