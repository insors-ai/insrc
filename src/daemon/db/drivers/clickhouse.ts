/**
 * ClickHouse driver (kind: `clickhouse`).
 *
 * Uses `@clickhouse/client` over HTTP. Introspection via
 * `system.columns` (database + table). Sample uses the structured
 * SELECT from rdbms-common with the ClickHouse dialect (backtick
 * identifiers, typed `{pN:String}` placeholders + `query_params`).
 *
 * No PK / FK in ClickHouse's columnar model -- the engine has
 * sort-key / partition-by metadata in `system.tables` but nothing
 * directly maps onto `primaryKey: true` / `foreignKey`. We mark
 * sort-key columns as `primaryKey: true` for parity with row-store
 * RDBMS describe output.
 */

import { createClient } from '@clickhouse/client';
import type { ClickHouseClient } from '@clickhouse/client';

import { getLogger } from '../../../shared/logger.js';
import type {
	AggregateRequest,
	AggregateResult,
	ColumnDescription,
	ConnectionConfig,
	DistinctRequest,
	DistinctResult,
	PlanResult,
	QueryAst,
	RdbmsDriver,
	SampleOpts,
	SampleResult,
	SchemaDescription,
} from '../../../shared/db-driver.js';
import { registerDriver } from '../registry.js';
import {
	CLICKHOUSE_DIALECT,
	SAMPLE_TIMEOUT_MS,
	buildSampleSql,
	quoteTarget,
	withTimeout,
} from './rdbms-common.js';
import { prismaSchemaDescription } from './rdbms-prisma.js';

const log = getLogger('db-clickhouse');

class ClickHouseDriver implements RdbmsDriver {
	readonly family = 'rdbms' as const;
	readonly kind = 'clickhouse';

	private readonly client: ClickHouseClient;
	private readonly defaultDatabase: string;
	private readonly schemaCache = new Map<string, SchemaDescription>();
	private readonly prismaPath: string | undefined;

	constructor(readonly id: string, url: string, prismaPath?: string) {
		const u = new URL(url);
		this.defaultDatabase = u.pathname === '' || u.pathname === '/' ? 'default' : u.pathname.slice(1);
		this.client = createClient({
			url: `${u.protocol}//${u.host}`,
			...(u.username !== '' ? { username: decodeURIComponent(u.username) } : {}),
			...(u.password !== '' ? { password: decodeURIComponent(u.password) } : {}),
			database: this.defaultDatabase,
			request_timeout: SAMPLE_TIMEOUT_MS,
		});
		this.prismaPath = prismaPath;
	}

	async describe(target: string): Promise<SchemaDescription> {
		const cached = this.schemaCache.get(target);
		if (cached !== undefined) { return cached; }

		if (this.prismaPath !== undefined) {
			const result = await prismaSchemaDescription(target, this.prismaPath);
			this.schemaCache.set(target, result);
			return result;
		}

		const { database, table } = splitTarget(target, this.defaultDatabase);
		const sortKeyCols = await this.fetchSortingKey(database, table);
		const columns = await this.fetchColumns(database, table);
		if (columns.length === 0) {
			throw new Error(`data-driver: clickhouse table '${target}' not found`);
		}
		for (const col of columns) {
			if (sortKeyCols.has(col.name)) {
				(col as { primaryKey?: boolean }).primaryKey = true;
			}
		}
		const result: SchemaDescription = { target, columns, source: 'introspect' };
		this.schemaCache.set(target, result);
		return result;
	}

	async sample(target: string, opts: SampleOpts): Promise<SampleResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		const { text, values } = buildSampleSql(target, opts, cols, CLICKHOUSE_DIALECT);
		log.debug({ id: this.id, text }, 'sample query');

		const rows = await withTimeout(this.runRows(text, values), SAMPLE_TIMEOUT_MS);
		const limit = Math.min(opts.limit, 50);
		return {
			target,
			columns: cols,
			rows,
			truncated: rows.length >= limit,
			metadata: { samplingMethod: 'first' },
		};
	}

	async explain(queryAst: QueryAst): Promise<PlanResult> {
		const schema = await this.describe(queryAst.target);
		const cols = schema.columns.map(c => c.name);
		const opts = queryAst.where !== undefined
			? { limit: 50, where: queryAst.where }
			: { limit: 50 };
		const inner = buildSampleSql(queryAst.target, opts, cols, CLICKHOUSE_DIALECT);
		const text = `EXPLAIN ${inner.text}`;
		const rows = await withTimeout(this.runRows(text, inner.values), SAMPLE_TIMEOUT_MS);
		return { plan: rows.map(r => String(r['explain'] ?? JSON.stringify(r))).join('\n') };
	}

	async aggregate(_target: string, _request: AggregateRequest): Promise<AggregateResult> {
		// ClickHouse uses non-standard aggregate syntax (`quantile(p)(col)`,
		// `stddevSamp`, `varSamp`) so the shared `compileAggregate`
		// helper -- which targets SQL-standard PERCENTILE_CONT /
		// STDDEV_SAMP / VAR_SAMP -- doesn't apply directly. A
		// ClickHouse-aware compileAggregate variant is a follow-up;
		// for now the tool surfaces this cleanly to the caller rather
		// than emitting SQL the engine will reject.
		throw new Error(
			'data-driver: aggregate() not yet implemented for clickhouse driver -- ' +
			'ClickHouse needs a per-dialect aggregate compiler (quantile/stddevSamp/varSamp). ' +
			'Tracked in plans/analyzers/data-analyzer-skills.md Phase 0.1.',
		);
	}

	async distinct(_target: string, _request: DistinctRequest): Promise<DistinctResult> {
		// ClickHouse aggregations follow custom syntax (see aggregate()
		// note above); for distinct specifically the shared
		// compileDistinct's COUNT(DISTINCT ...) + GROUP BY ... ORDER BY
		// COUNT(*) DESC pattern is standard SQL and would in principle
		// work, but the {p:String} placeholder shape this driver uses
		// would need pass-through. Lift in the same follow-up that
		// implements aggregate().
		throw new Error(
			'data-driver: distinct() not yet implemented for clickhouse driver -- ' +
			'pairs with the aggregate() follow-up (Phase 0.1). ' +
			'Tracked in plans/analyzers/data-analyzer-skills.md Phase 0.3.',
		);
	}

	async listTables(): Promise<never> {
		throw new Error('data-driver: listTables() not yet implemented for clickhouse -- queries against system.tables work but the per-engine schema-filter logic differs (Atomic vs Ordinary databases). Tracked alongside the broader clickhouse-dialect follow-up (Phase 0.1).');
	}

	async listIndexes(): Promise<never> {
		throw new Error('data-driver: listIndexes() not yet implemented for clickhouse -- ClickHouse uses ORDER BY / PRIMARY KEY / data-skipping indexes via system.tables.engine_full and system.data_skipping_indices, not the SQL-standard sys.indexes shape. Per-engine follow-up.');
	}

	async antiJoin(): Promise<never> {
		throw new Error('data-driver: antiJoin() not yet implemented for clickhouse -- the NOT EXISTS shape works but the parameter binding model differs (see the broader clickhouse-dialect follow-up).');
	}

	async functionalDependency(): Promise<never> {
		throw new Error('data-driver: functionalDependency() not yet implemented for clickhouse -- the GROUP BY + COUNT(DISTINCT) shape works but the {p:String} parameter style needs the clickhouse-dialect compileWhere binding follow-up. Tracked alongside the broader clickhouse-dialect work (Phase 0.1).');
	}

	async histogram(): Promise<never> {
		throw new Error('data-driver: histogram() not yet implemented for clickhouse -- pairs with aggregate() follow-up (Phase 0.1).');
	}

	async correlationMatrix(): Promise<never> {
		throw new Error('data-driver: correlationMatrix() not yet implemented for clickhouse -- pairs with aggregate() follow-up (Phase 0.1).');
	}

	async outliers(): Promise<never> {
		throw new Error('data-driver: outliers() not yet implemented for clickhouse -- pairs with aggregate() follow-up (Phase 0.1).');
	}

	async temporalTrend(): Promise<never> {
		throw new Error('data-driver: temporalTrend() not yet implemented for clickhouse -- pairs with aggregate() follow-up (Phase 0.1).');
	}

	async dickeyFuller(): Promise<never> {
		throw new Error('data-driver: dickeyFuller() not yet implemented for clickhouse -- needs CTE/LAG translation to ClickHouse window-function syntax.');
	}

	async temporalGapStats(): Promise<never> {
		throw new Error('data-driver: temporalGapStats() not yet implemented for clickhouse -- needs CTE/LAG translation to ClickHouse window-function syntax.');
	}

	async close(): Promise<void> {
		await this.client.close();
	}

	// -------------------------------------------------------------------------

	private async fetchColumns(database: string, table: string): Promise<ColumnDescription[]> {
		const rows = await this.runRows(
			`SELECT name AS col_name, type AS col_type, is_nullable
			 FROM system.columns
			 WHERE database = {p1:String} AND table = {p2:String}
			 ORDER BY position`,
			[database, table],
		);
		return rows.map((r) => ({
			name: String(r['col_name']),
			type: String(r['col_type']),
			// system.columns.is_nullable is 0/1 even for non-Nullable types;
			// the canonical signal is the Nullable() wrapper on the type.
			nullable: /^Nullable\(/.test(String(r['col_type'])) || r['is_nullable'] === 1,
		}));
	}

	private async fetchSortingKey(database: string, table: string): Promise<Set<string>> {
		try {
			const rows = await this.runRows(
				`SELECT sorting_key FROM system.tables
				 WHERE database = {p1:String} AND name = {p2:String}`,
				[database, table],
			);
			const raw = rows[0]?.['sorting_key'];
			if (typeof raw !== 'string' || raw === '') { return new Set(); }
			// Sorting key is a comma-separated identifier list: `a, b, c`.
			return new Set(raw.split(',').map(s => s.trim()).filter(s => s !== ''));
		} catch {
			return new Set();
		}
	}

	private async runRows(
		text: string,
		values: readonly unknown[],
	): Promise<Record<string, unknown>[]> {
		const params: Record<string, string> = {};
		for (let i = 0; i < values.length; i++) {
			const v = values[i];
			params[`p${i + 1}`] = v === null || v === undefined ? '' : String(v);
		}
		const res = await this.client.query({
			query: text,
			query_params: params,
			format: 'JSONEachRow',
		});
		return res.json();
	}
}

// ---------------------------------------------------------------------------

function splitTarget(target: string, defaultDb: string): { database: string; table: string } {
	quoteTarget(target, CLICKHOUSE_DIALECT);
	if (target.includes('.')) {
		const [database, table] = target.split('.');
		return { database: database ?? defaultDb, table: table ?? target };
	}
	return { database: defaultDb, table: target };
}

registerDriver({
	kind: 'clickhouse',
	family: 'rdbms',
	factory: async (config: ConnectionConfig) => {
		if (config.url === undefined) {
			throw new Error(`data-driver: clickhouse connection '${config.id}' missing url`);
		}
		const prismaPath = config.schemaSource?.type === 'prisma'
			? config.schemaSource.path
			: undefined;
		return new ClickHouseDriver(config.id, config.url, prismaPath);
	},
});
