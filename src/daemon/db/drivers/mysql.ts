/**
 * MySQL / MariaDB driver (kind: `mysql`, `mariadb`).
 *
 * Uses `mysql2/promise`. Introspection via `information_schema.columns`
 * + KEY_COLUMN_USAGE for PK/FK; sample uses the structured SELECT
 * from rdbms-common with the mysql dialect (`?` placeholders +
 * backtick quoting).
 */

import { createPool } from 'mysql2/promise';
import type { Pool, PoolOptions } from 'mysql2/promise';

import { getLogger } from '../../../shared/logger.js';
import type {
	AggregateRequest,
	AggregateResult,
	AntiJoinRequest,
	AntiJoinResult,
	ColumnDescription,
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
	MYSQL_DIALECT,
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

const log = getLogger('db-mysql');

const POOL_MAX = 3;

function clampListLimit(n: number | undefined): number {
	if (typeof n !== 'number' || !Number.isFinite(n)) return 500;
	return Math.min(Math.max(1, Math.floor(n)), 5000);
}

class MysqlDriver implements RdbmsDriver {
	readonly family = 'rdbms' as const;
	readonly kind: string;

	private readonly pool: Pool;
	private readonly schemaCache = new Map<string, SchemaDescription>();
	private readonly prismaPath: string | undefined;

	constructor(readonly id: string, kind: 'mysql' | 'mariadb', url: string, prismaPath?: string) {
		this.kind = kind;
		this.prismaPath = prismaPath;
		const opts = parseUrlToPoolOptions(url);
		this.pool = createPool({
			...opts,
			connectionLimit: POOL_MAX,
			connectTimeout: SAMPLE_TIMEOUT_MS,
		});
	}

	async describe(target: string): Promise<SchemaDescription> {
		const cached = this.schemaCache.get(target);
		if (cached !== undefined) { return cached; }

		if (this.prismaPath !== undefined) {
			const result = await prismaSchemaDescription(target, this.prismaPath);
			this.schemaCache.set(target, result);
			return result;
		}

		const { schema, table } = splitTarget(target);
		const columns = await this.fetchColumns(schema, table);
		if (columns.length === 0) {
			throw new Error(`data-driver: table '${target}' not found`);
		}
		const pk = await this.fetchPrimaryKey(schema, table);
		const fks = await this.fetchForeignKeys(schema, table);
		for (const col of columns) {
			if (pk.has(col.name)) { (col as { primaryKey?: boolean }).primaryKey = true; }
			const fk = fks.get(col.name);
			if (fk !== undefined) {
				(col as { foreignKey?: { table: string; column: string } }).foreignKey = fk;
			}
		}
		const result: SchemaDescription = { target, columns, source: 'introspect' };
		this.schemaCache.set(target, result);
		return result;
	}

	async sample(target: string, opts: SampleOpts): Promise<SampleResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		const { text, values } = buildSampleSql(target, opts, cols, MYSQL_DIALECT);
		log.debug({ id: this.id, text }, 'sample query');

		const [rows, fields] = await withTimeout(
			this.pool.query(text, values as unknown[]),
			SAMPLE_TIMEOUT_MS,
		) as unknown as [unknown[], { name: string }[]];

		const limit = Math.min(opts.limit, 50);
		return {
			target,
			columns: fields.map(f => f.name),
			rows: rows as readonly Readonly<Record<string, unknown>>[],
			truncated: Array.isArray(rows) && rows.length >= limit,
			metadata: { samplingMethod: 'first' },
		};
	}

	async explain(queryAst: QueryAst): Promise<PlanResult> {
		const schema = await this.describe(queryAst.target);
		const cols = schema.columns.map(c => c.name);
		const opts = queryAst.where !== undefined
			? { limit: 50, where: queryAst.where }
			: { limit: 50 };
		const { text, values } = buildExplainSql(queryAst.target, opts, cols, MYSQL_DIALECT);
		log.debug({ id: this.id, text }, 'explain query');
		const [rows] = await withTimeout(
			this.pool.query(text, values as unknown[]),
			SAMPLE_TIMEOUT_MS,
		) as unknown as [Record<string, unknown>[], unknown];
		return { plan: rows.map(r => JSON.stringify(r)).join('\n') };
	}

	async aggregate(target: string, request: AggregateRequest): Promise<AggregateResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		const compiled = compileAggregate(target, request, cols, MYSQL_DIALECT);
		log.debug({ id: this.id, text: compiled.text }, 'aggregate query');
		const [rows] = await withTimeout(
			this.pool.query(compiled.text, compiled.values as unknown[]),
			SAMPLE_TIMEOUT_MS,
		) as unknown as [Record<string, unknown>[], unknown];
		return { target, values: readAggregateRow(rows[0], compiled.keys) };
	}

	async distinct(target: string, request: DistinctRequest): Promise<DistinctResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		const compiled = compileDistinct(target, request, cols, MYSQL_DIALECT);
		log.debug({ id: this.id }, 'distinct query');
		const [[countRows], [valueRows]] = await Promise.all([
			withTimeout(
				this.pool.query(compiled.distinctCountSql),
				SAMPLE_TIMEOUT_MS,
			) as unknown as Promise<[Record<string, unknown>[], unknown]>,
			withTimeout(
				this.pool.query(compiled.topValuesSql),
				SAMPLE_TIMEOUT_MS,
			) as unknown as Promise<[Record<string, unknown>[], unknown]>,
		]);
		return {
			target,
			column: request.column,
			distinctCount: readDistinctCount(countRows[0]),
			topValues: readDistinctRows(valueRows),
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
			dialect: MYSQL_DIALECT,
			describe: (t) => this.describe(t).then(s => ({ columns: s.columns })),
			runRows: async (sql, values) => {
				const [rows] = await withTimeout(
					this.pool.query(sql, values as unknown[]),
					SAMPLE_TIMEOUT_MS,
				) as unknown as [Record<string, unknown>[], unknown];
				return rows;
			},
		});
	}

	async functionalDependency(target: string, request: FunctionalDependencyRequest): Promise<FunctionalDependencyResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		return executeFunctionalDependency(request, {
			target,
			knownColumns: cols,
			dialect: MYSQL_DIALECT,
			runRows: async (sql, values) => {
				const [rows] = await withTimeout(
					this.pool.query(sql, values as unknown[]),
					SAMPLE_TIMEOUT_MS,
				) as unknown as [Record<string, unknown>[], unknown];
				return rows;
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
		const params: unknown[] = [];
		let where = `WHERE table_schema NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')`;
		if (typeof opts?.schema === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(opts.schema)) {
			params.push(opts.schema);
			where += ` AND table_schema = ?`;
		}
		const sql = `SELECT table_schema, table_name, table_type FROM information_schema.tables ${where} ORDER BY table_schema, table_name LIMIT ${cap + 1}`;
		const [rows] = await withTimeout(
			this.pool.query(sql, params as unknown[]),
			SAMPLE_TIMEOUT_MS,
		) as unknown as [{ TABLE_SCHEMA?: string; table_schema?: string; TABLE_NAME?: string; table_name?: string; TABLE_TYPE?: string; table_type?: string }[], unknown];
		const truncated = rows.length > cap;
		const sliced = truncated ? rows.slice(0, cap) : rows;
		return {
			target: 'mysql',
			tables: sliced.map(r => {
				const schema = String(r.TABLE_SCHEMA ?? r.table_schema ?? '');
				const name = String(r.TABLE_NAME ?? r.table_name ?? '');
				const type = String(r.TABLE_TYPE ?? r.table_type ?? '');
				return {
					name,
					schema,
					kind: type === 'VIEW' ? 'view' : 'table' as 'table' | 'view',
				};
			}),
			truncated,
		};
	}

	async listIndexes(target: string): Promise<IndexListing> {
		quoteTarget(target, MYSQL_DIALECT);
		// Default to current schema; allow `schema.table` form.
		let schema: string | null = null;
		let table = target;
		const dot = target.indexOf('.');
		if (dot > 0) { schema = target.slice(0, dot); table = target.slice(dot + 1); }
		const sql = schema !== null
			? `SELECT index_name, non_unique,
			          GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
			   FROM information_schema.statistics
			   WHERE table_schema = ? AND table_name = ?
			   GROUP BY index_name, non_unique
			   ORDER BY index_name`
			: `SELECT index_name, non_unique,
			          GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
			   FROM information_schema.statistics
			   WHERE table_schema = DATABASE() AND table_name = ?
			   GROUP BY index_name, non_unique
			   ORDER BY index_name`;
		const params = schema !== null ? [schema, table] : [table];
		const [rows] = await withTimeout(
			this.pool.query(sql, params),
			SAMPLE_TIMEOUT_MS,
		) as unknown as [{ INDEX_NAME?: string; index_name?: string; NON_UNIQUE?: number; non_unique?: number; cols?: string }[], unknown];
		return {
			target,
			indexes: rows.map(r => {
				const name = String(r.INDEX_NAME ?? r.index_name ?? '');
				const nonUnique = Number(r.NON_UNIQUE ?? r.non_unique ?? 1);
				return {
					name,
					columns: String(r.cols ?? '').split(',').filter(c => c.length > 0),
					unique: nonUnique === 0,
					primaryKey: name === 'PRIMARY',
				};
			}),
		};
	}

	private orchestratorDeps(target: string, cols: readonly string[]): OrchestratorDeps {
		return {
			target,
			knownColumns: cols,
			dialect: MYSQL_DIALECT,
			aggregate: (req) => this.aggregate(target, req),
			runRows: async (sql, values) => {
				const [rows] = await withTimeout(
					this.pool.query(sql, values as unknown[]),
					SAMPLE_TIMEOUT_MS,
				) as unknown as [Record<string, unknown>[], unknown];
				return rows;
			},
		};
	}

	async close(): Promise<void> {
		await this.pool.end();
	}

	// -------------------------------------------------------------------------

	private async fetchColumns(
		schema: string | null,
		table: string,
	): Promise<ColumnDescription[]> {
		const [rows] = await this.pool.query(
			`SELECT column_name AS name, data_type AS type, is_nullable AS nullable
			 FROM information_schema.columns
			 WHERE table_schema = COALESCE(?, DATABASE())
			   AND table_name = ?
			 ORDER BY ordinal_position`,
			[schema, table],
		) as unknown as [{ name: string; type: string; nullable: string }[], unknown];
		return rows.map(r => ({
			name: r.name,
			type: r.type,
			nullable: r.nullable === 'YES',
		}));
	}

	private async fetchPrimaryKey(
		schema: string | null,
		table: string,
	): Promise<Set<string>> {
		const [rows] = await this.pool.query(
			`SELECT column_name AS name
			 FROM information_schema.KEY_COLUMN_USAGE
			 WHERE table_schema = COALESCE(?, DATABASE())
			   AND table_name = ?
			   AND constraint_name = 'PRIMARY'`,
			[schema, table],
		) as unknown as [{ name: string }[], unknown];
		return new Set(rows.map(r => r.name));
	}

	private async fetchForeignKeys(
		schema: string | null,
		table: string,
	): Promise<Map<string, { table: string; column: string }>> {
		const [rows] = await this.pool.query(
			`SELECT column_name AS name,
			        referenced_table_name AS ftable,
			        referenced_column_name AS fcol
			 FROM information_schema.KEY_COLUMN_USAGE
			 WHERE table_schema = COALESCE(?, DATABASE())
			   AND table_name = ?
			   AND referenced_table_name IS NOT NULL`,
			[schema, table],
		) as unknown as [{ name: string; ftable: string; fcol: string }[], unknown];
		const map = new Map<string, { table: string; column: string }>();
		for (const r of rows) {
			map.set(r.name, { table: r.ftable, column: r.fcol });
		}
		return map;
	}
}

// ---------------------------------------------------------------------------

function splitTarget(target: string): { schema: string | null; table: string } {
	quoteTarget(target, MYSQL_DIALECT);
	if (target.includes('.')) {
		const [schema, table] = target.split('.');
		return { schema: schema ?? null, table: table ?? target };
	}
	return { schema: null, table: target };
}

function parseUrlToPoolOptions(url: string): PoolOptions {
	// mysql2 accepts a URL string via `uri` in v3, but older versions
	// expect the parts separately. We split manually for portability.
	const u = new URL(url);
	const opts: PoolOptions = {
		host: u.hostname,
		port: u.port === '' ? 3306 : Number(u.port),
		user: decodeURIComponent(u.username),
	};
	if (u.password !== '') { opts.password = decodeURIComponent(u.password); }
	if (u.pathname !== '' && u.pathname !== '/') {
		opts.database = u.pathname.slice(1);
	}
	return opts;
}

// ---------------------------------------------------------------------------

function makeFactory(kind: 'mysql' | 'mariadb') {
	return async (config: ConnectionConfig) => {
		if (config.url === undefined) {
			throw new Error(`data-driver: ${kind} connection '${config.id}' missing url`);
		}
		const prismaPath = config.schemaSource?.type === 'prisma' ? config.schemaSource.path : undefined;
		return new MysqlDriver(config.id, kind, config.url, prismaPath);
	};
}

registerDriver({ kind: 'mysql',   family: 'rdbms', factory: makeFactory('mysql') });
registerDriver({ kind: 'mariadb', family: 'rdbms', factory: makeFactory('mariadb') });
