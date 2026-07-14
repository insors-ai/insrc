/**
 * Postgres driver (kind: `postgres`).
 *
 * Uses `pg.Pool` for connection pooling; pool size 3 since the only
 * workloads are analyzer describe/sample calls + the connection
 * tester. Describe consults `information_schema.columns` +
 * `pg_index` + FK constraints for a single table; sample runs a
 * structured SELECT built by `rdbms-common.ts`.
 */

import pgMod from 'pg';

import { getLogger } from '../../../shared/logger.js';
import type {
	AggregateRequest,
	AggregateResult,
	AntiJoinRequest,
	AntiJoinResult,
	ConnectionConfig,
	CorrelationMatrixRequest,
	CorrelationMatrixResult,
	DistinctRequest,
	DistinctResult,
	FunctionalDependencyRequest,
	FunctionalDependencyResult,
	HistogramRequest,
	HistogramResult,
	IndexListing,
	OutlierRequest,
	OutlierResult,
	RdbmsDriver,
	SampleOpts,
	SampleResult,
	SchemaDescription,
	ColumnDescription,
	DickeyFullerRequest,
	DickeyFullerResult,
	TableListing,
	TemporalGapStatsRequest,
	TemporalGapStatsResult,
	TemporalTrendRequest,
	TemporalTrendResult,
} from '../../../shared/db-driver.js';
import { registerDriver } from '../registry.js';
import {
	POSTGRES_DIALECT,
	SAMPLE_LIMIT,
	SAMPLE_TIMEOUT_MS,
	buildExplainSql,
	buildSampleSql,
	compileAggregate,
	compileDistinct,
	executeAntiJoin,
	executeCorrelationMatrix,
	executeDickeyFuller,
	executeFunctionalDependency,
	executeHistogram,
	executeOutliers,
	executeTemporalGapStats,
	executeTemporalTrend,
	quoteTarget,
	readAggregateRow,
	readDistinctCount,
	readDistinctRows,
	withTimeout,
} from './rdbms-common.js';
import type { OrchestratorDeps } from './rdbms-common.js';
import type { PlanResult, QueryAst } from '../../../shared/db-driver.js';
import { prismaSchemaDescription } from './rdbms-prisma.js';

const { Pool } = pgMod;

const log = getLogger('db-pg');

const POOL_MAX = 3;

function clampListLimit(n: number | undefined): number {
	if (typeof n !== 'number' || !Number.isFinite(n)) return 500;
	return Math.min(Math.max(1, Math.floor(n)), 5000);
}
const IDLE_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Driver class
// ---------------------------------------------------------------------------

class PostgresDriver implements RdbmsDriver {
	readonly family = 'rdbms' as const;
	readonly kind = 'postgres';

	private readonly pool: pgMod.Pool;
	/** describe() results are memoized to avoid re-querying
	 *  information_schema on every sample(). Config changes reload
	 *  the pool, so cache lifetime = pool lifetime. */
	private readonly schemaCache = new Map<string, SchemaDescription>();
	private readonly prismaPath: string | undefined;

	constructor(readonly id: string, url: string, prismaPath?: string) {
		this.prismaPath = prismaPath;
		this.pool = new Pool({
			connectionString: url,
			max: POOL_MAX,
			idleTimeoutMillis: IDLE_TIMEOUT_MS,
			connectionTimeoutMillis: SAMPLE_TIMEOUT_MS,
		});
		this.pool.on('error', (err) => {
			log.warn({ id, err: err.message }, 'pool error');
		});
	}

	async describe(target: string): Promise<SchemaDescription> {
		const cached = this.schemaCache.get(target);
		if (cached !== undefined) { return cached; }

		// Prisma fast path: when schemaSource is configured, the parsed
		// schema is the source of truth for describe(). sample() still
		// hits the live DB.
		if (this.prismaPath !== undefined) {
			const result = await prismaSchemaDescription(target, this.prismaPath);
			this.schemaCache.set(target, result);
			return result;
		}

		const { schema, table } = splitTarget(target);
		const columns = await this.fetchColumns(schema, table);
		if (columns.length === 0) {
			throw new Error(
				`data-driver: table '${target}' not found or has no columns`,
			);
		}
		const pk = await this.fetchPrimaryKey(schema, table);
		const fks = await this.fetchForeignKeys(schema, table);

		for (const col of columns) {
			if (pk.has(col.name)) {
				(col as { primaryKey?: boolean }).primaryKey = true;
			}
			const fk = fks.get(col.name);
			if (fk !== undefined) {
				(col as { foreignKey?: { table: string; column: string } }).foreignKey = fk;
			}
		}

		const result: SchemaDescription = {
			target,
			columns,
			source: 'introspect',
		};
		this.schemaCache.set(target, result);
		return result;
	}

	async sample(target: string, opts: SampleOpts): Promise<SampleResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		const { text, values } = buildSampleSql(target, opts, cols, POSTGRES_DIALECT);

		log.debug({ id: this.id, text }, 'sample query');
		const res = await withTimeout(
			this.pool.query(text, values as unknown[]),
			SAMPLE_TIMEOUT_MS,
		);
		return {
			target,
			columns: res.fields.map(f => f.name),
			rows: res.rows as readonly Readonly<Record<string, unknown>>[],
			truncated: res.rowCount === opts.limit && opts.limit < SAMPLE_LIMIT
				? false
				: res.rowCount === Math.min(opts.limit, SAMPLE_LIMIT),
			metadata: { samplingMethod: 'first' },
		};
	}

	async aggregate(target: string, request: AggregateRequest): Promise<AggregateResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		const compiled = compileAggregate(target, request, cols, POSTGRES_DIALECT);
		log.debug({ id: this.id, text: compiled.text }, 'aggregate query');
		const res = await withTimeout(
			this.pool.query(compiled.text, compiled.values as unknown[]),
			SAMPLE_TIMEOUT_MS,
		);
		const row = res.rows[0] as Readonly<Record<string, unknown>> | undefined;
		return { target, values: readAggregateRow(row, compiled.keys) };
	}

	async distinct(target: string, request: DistinctRequest): Promise<DistinctResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		const compiled = compileDistinct(target, request, cols, POSTGRES_DIALECT);
		log.debug({ id: this.id, distinctCountSql: compiled.distinctCountSql, topValuesSql: compiled.topValuesSql }, 'distinct query');
		const [countRes, valuesRes] = await Promise.all([
			withTimeout(this.pool.query(compiled.distinctCountSql), SAMPLE_TIMEOUT_MS),
			withTimeout(this.pool.query(compiled.topValuesSql), SAMPLE_TIMEOUT_MS),
		]);
		return {
			target,
			column: request.column,
			distinctCount: readDistinctCount(countRes.rows[0] as Readonly<Record<string, unknown>> | undefined),
			topValues: readDistinctRows(valuesRes.rows as readonly Readonly<Record<string, unknown>>[]),
		};
	}

	async histogram(target: string, request: HistogramRequest): Promise<HistogramResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		return executeHistogram(request, this.orchestratorDeps(target, cols));
	}

	async correlationMatrix(target: string, request: CorrelationMatrixRequest): Promise<CorrelationMatrixResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		return executeCorrelationMatrix(request, this.orchestratorDeps(target, cols));
	}

	async antiJoin(request: AntiJoinRequest): Promise<AntiJoinResult> {
		return executeAntiJoin(request, {
			dialect: POSTGRES_DIALECT,
			describe: (t) => this.describe(t).then(s => ({ columns: s.columns })),
			runRows: async (sql, values) => {
				const res = await withTimeout(this.pool.query(sql, values as unknown[]), SAMPLE_TIMEOUT_MS);
				return res.rows as readonly Readonly<Record<string, unknown>>[];
			},
		});
	}

	async functionalDependency(target: string, request: FunctionalDependencyRequest): Promise<FunctionalDependencyResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		return executeFunctionalDependency(request, {
			target,
			knownColumns: cols,
			dialect: POSTGRES_DIALECT,
			runRows: async (sql, values) => {
				const res = await withTimeout(this.pool.query(sql, values as unknown[]), SAMPLE_TIMEOUT_MS);
				return res.rows as readonly Readonly<Record<string, unknown>>[];
			},
		});
	}

	async outliers(target: string, request: OutlierRequest): Promise<OutlierResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		return executeOutliers(request, this.orchestratorDeps(target, cols));
	}

	async temporalTrend(target: string, request: TemporalTrendRequest): Promise<TemporalTrendResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		return executeTemporalTrend({ ...this.orchestratorDeps(target, cols), request });
	}

	async dickeyFuller(target: string, request: DickeyFullerRequest): Promise<DickeyFullerResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		return executeDickeyFuller({ ...this.orchestratorDeps(target, cols), request });
	}

	async temporalGapStats(target: string, request: TemporalGapStatsRequest): Promise<TemporalGapStatsResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		return executeTemporalGapStats({ ...this.orchestratorDeps(target, cols), request });
	}

	async listTables(opts?: { schema?: string; limit?: number }): Promise<TableListing> {
		const cap = clampListLimit(opts?.limit);
		const schemaFilter = typeof opts?.schema === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(opts.schema)
			? opts.schema : null;
		const params: unknown[] = [];
		let where = `WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`;
		if (schemaFilter !== null) {
			params.push(schemaFilter);
			where += ` AND table_schema = $1`;
		}
		const sql = `SELECT table_schema, table_name, table_type FROM information_schema.tables ${where} ORDER BY table_schema, table_name LIMIT ${cap + 1}`;
		const res = await withTimeout(this.pool.query(sql, params as unknown[]), SAMPLE_TIMEOUT_MS);
		const rows = res.rows as { table_schema: string; table_name: string; table_type: string }[];
		const truncated = rows.length > cap;
		const sliced = truncated ? rows.slice(0, cap) : rows;
		return {
			target: 'postgres',
			tables: sliced.map(r => ({
				name: r.table_name,
				schema: r.table_schema,
				kind: r.table_type === 'VIEW' ? 'view' : 'table',
			})),
			truncated,
		};
	}

	async listIndexes(target: string): Promise<IndexListing> {
		quoteTarget(target, POSTGRES_DIALECT);
		// Accept either `schema.table` or bare `table` (default schema).
		let schema = 'public';
		let table = target;
		const dot = target.indexOf('.');
		if (dot > 0) { schema = target.slice(0, dot); table = target.slice(dot + 1); }
		const sql = `
			SELECT i.relname AS index_name,
			       ix.indisunique AS is_unique,
			       ix.indisprimary AS is_pk,
			       array_agg(a.attname ORDER BY ord.ord) AS columns
			FROM pg_index ix
			JOIN pg_class i ON i.oid = ix.indexrelid
			JOIN pg_class t ON t.oid = ix.indrelid
			JOIN pg_namespace n ON n.oid = t.relnamespace
			JOIN unnest(ix.indkey) WITH ORDINALITY AS ord(attnum, ord) ON true
			JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ord.attnum
			WHERE t.relname = $1 AND n.nspname = $2
			GROUP BY i.relname, ix.indisunique, ix.indisprimary
			ORDER BY i.relname
		`;
		const res = await withTimeout(this.pool.query(sql, [table, schema]), SAMPLE_TIMEOUT_MS);
		const rows = res.rows as { index_name: string; is_unique: boolean; is_pk: boolean; columns: string[] }[];
		return {
			target,
			indexes: rows.map(r => ({
				name: r.index_name,
				columns: r.columns,
				unique: r.is_unique,
				primaryKey: r.is_pk,
			})),
		};
	}

	private orchestratorDeps(target: string, cols: readonly string[]): OrchestratorDeps {
		return {
			target,
			knownColumns: cols,
			dialect: POSTGRES_DIALECT,
			aggregate: (req) => this.aggregate(target, req),
			runRows: async (sql, values) => {
				const res = await withTimeout(
					this.pool.query(sql, values as unknown[]),
					SAMPLE_TIMEOUT_MS,
				);
				return res.rows as readonly Readonly<Record<string, unknown>>[];
			},
		};
	}

	async explain(queryAst: QueryAst): Promise<PlanResult> {
		const schema = await this.describe(queryAst.target);
		const cols = schema.columns.map(c => c.name);
		const opts = queryAst.where !== undefined
			? { limit: SAMPLE_LIMIT, where: queryAst.where }
			: { limit: SAMPLE_LIMIT };
		const { text, values } = buildExplainSql(queryAst.target, opts, cols, POSTGRES_DIALECT);
		log.debug({ id: this.id, text }, 'explain query');
		const res = await withTimeout(
			this.pool.query(text, values as unknown[]),
			SAMPLE_TIMEOUT_MS,
		);
		return { plan: res.rows.map((r: Record<string, unknown>) => String(r['QUERY PLAN'] ?? '')).join('\n') };
	}

	async close(): Promise<void> {
		await this.pool.end();
	}

	// -------------------------------------------------------------------------
	// Introspection queries
	// -------------------------------------------------------------------------

	private async fetchColumns(
		schema: string | null,
		table: string,
	): Promise<ColumnDescription[]> {
		const sql = `
			SELECT column_name, data_type, is_nullable
			FROM information_schema.columns
			WHERE table_schema = COALESCE($1, current_schema())
			  AND table_name = $2
			ORDER BY ordinal_position
		`;
		const res = await this.pool.query(sql, [schema, table]);
		return res.rows.map((r: { column_name: string; data_type: string; is_nullable: string }) => ({
			name: r.column_name,
			type: r.data_type,
			nullable: r.is_nullable === 'YES',
		}));
	}

	private async fetchPrimaryKey(
		schema: string | null,
		table: string,
	): Promise<Set<string>> {
		const sql = `
			SELECT a.attname AS column_name
			FROM pg_index i
			JOIN pg_class c ON c.oid = i.indrelid
			JOIN pg_namespace n ON n.oid = c.relnamespace
			JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
			WHERE i.indisprimary
			  AND n.nspname = COALESCE($1, current_schema())
			  AND c.relname = $2
		`;
		const res = await this.pool.query(sql, [schema, table]);
		return new Set(res.rows.map((r: { column_name: string }) => r.column_name));
	}

	private async fetchForeignKeys(
		schema: string | null,
		table: string,
	): Promise<Map<string, { table: string; column: string }>> {
		const sql = `
			SELECT
				kcu.column_name,
				ccu.table_name   AS foreign_table,
				ccu.column_name  AS foreign_column
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
			  ON tc.constraint_schema = kcu.constraint_schema
			 AND tc.constraint_name = kcu.constraint_name
			JOIN information_schema.constraint_column_usage ccu
			  ON tc.constraint_schema = ccu.constraint_schema
			 AND tc.constraint_name = ccu.constraint_name
			WHERE tc.constraint_type = 'FOREIGN KEY'
			  AND tc.table_schema = COALESCE($1, current_schema())
			  AND tc.table_name = $2
		`;
		const res = await this.pool.query(sql, [schema, table]);
		const map = new Map<string, { table: string; column: string }>();
		for (const r of res.rows as { column_name: string; foreign_table: string; foreign_column: string }[]) {
			map.set(r.column_name, { table: r.foreign_table, column: r.foreign_column });
		}
		return map;
	}
}

// ---------------------------------------------------------------------------
// Target splitting
// ---------------------------------------------------------------------------

function splitTarget(target: string): { schema: string | null; table: string } {
	// Validate identifier shape via the same rule the quoter uses.
	quoteTarget(target, POSTGRES_DIALECT);
	if (target.includes('.')) {
		const [schema, table] = target.split('.');
		return { schema: schema ?? null, table: table ?? target };
	}
	return { schema: null, table: target };
}

// ---------------------------------------------------------------------------
// Self-registration
// ---------------------------------------------------------------------------

// CockroachDB is wire-compatible with the Postgres protocol -- the
// same `pg` client + driver implementation works against both. We
// expose it as its own `kind` so users / agents see it explicitly
// in db:list_connections + db:list_driver_kinds, but factory +
// behaviour are identical.
function postgresFactory(connKind: 'postgres' | 'cockroachdb') {
	return async (config: ConnectionConfig) => {
		if (config.url === undefined) {
			throw new Error(`data-driver: ${connKind} connection '${config.id}' missing url`);
		}
		const prismaPath = config.schemaSource?.type === 'prisma'
			? config.schemaSource.path
			: undefined;
		return new PostgresDriver(config.id, config.url, prismaPath);
	};
}

registerDriver({ kind: 'postgres',    family: 'rdbms', factory: postgresFactory('postgres') });
registerDriver({ kind: 'cockroachdb', family: 'rdbms', factory: postgresFactory('cockroachdb') });
