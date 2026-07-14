/**
 * MSSQL driver (kind: `mssql`).
 *
 * Uses `tedious` + `tarn` for pooling. Introspection via `sys.columns`
 * + `sys.types` + `sys.indexes`; sample emits `SELECT TOP N` via the
 * MSSQL dialect in rdbms-common.
 *
 * SQL auth via URL (`mssql://user:pass@host/db`). Integrated / Azure
 * AD auth would need explicit config on `options` and is deferred
 * past phase 1.
 */

import { Connection, TYPES } from 'tedious';
import type { ConnectionConfiguration, Request as MssqlRequest } from 'tedious';
import { Pool } from 'tarn';

interface ColumnValue {
	readonly metadata: { readonly colName: string };
	readonly value: unknown;
}

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
	MSSQL_DIALECT,
	SAMPLE_TIMEOUT_MS,
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

const log = getLogger('db-mssql');

function clampMssqlListLimit(n: number | undefined): number {
	if (typeof n !== 'number' || !Number.isFinite(n)) return 500;
	return Math.min(Math.max(1, Math.floor(n)), 5000);
}

interface MssqlParams {
	readonly host: string;
	readonly port: number;
	readonly user: string;
	readonly password: string;
	readonly database: string;
}

function parseUrl(url: string): MssqlParams {
	const u = new URL(url);
	return {
		host: u.hostname,
		port: u.port === '' ? 1433 : Number(u.port),
		user: decodeURIComponent(u.username),
		password: decodeURIComponent(u.password),
		database: u.pathname === '' || u.pathname === '/' ? '' : u.pathname.slice(1),
	};
}

function buildConnectionConfig(p: MssqlParams): ConnectionConfiguration {
	return {
		server: p.host,
		authentication: {
			type: 'default',
			options: { userName: p.user, password: p.password },
		},
		options: {
			port: p.port,
			database: p.database,
			encrypt: true,
			trustServerCertificate: true,
			connectTimeout: SAMPLE_TIMEOUT_MS,
		},
	};
}

class MssqlDriver implements RdbmsDriver {
	readonly family = 'rdbms' as const;
	readonly kind = 'mssql';

	private readonly pool: Pool<Connection>;
	private readonly schemaCache = new Map<string, SchemaDescription>();
	private readonly prismaPath: string | undefined;

	constructor(readonly id: string, url: string, prismaPath?: string) {
		this.prismaPath = prismaPath;
		const cfg = buildConnectionConfig(parseUrl(url));
		this.pool = new Pool<Connection>({
			create: () => new Promise((resolveConn, rejectConn) => {
				const conn = new Connection(cfg);
				conn.on('connect', (err) => {
					if (err !== undefined && err !== null) { rejectConn(err); return; }
					resolveConn(conn);
				});
				conn.connect();
			}),
			destroy: (conn) => {
				conn.close();
				return Promise.resolve();
			},
			validate: (conn) => !conn.closed,
			min: 0,
			max: 3,
			idleTimeoutMillis: 30_000,
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
		if (columns.length === 0) { throw new Error(`data-driver: table '${target}' not found`); }

		const pk = await this.fetchPrimaryKey(schema, table);
		for (const col of columns) {
			if (pk.has(col.name)) { (col as { primaryKey?: boolean }).primaryKey = true; }
		}

		const result: SchemaDescription = { target, columns, source: 'introspect' };
		this.schemaCache.set(target, result);
		return result;
	}

	async sample(target: string, opts: SampleOpts): Promise<SampleResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		const { text, values } = buildSampleSql(target, opts, cols, MSSQL_DIALECT);
		log.debug({ id: this.id, text }, 'sample query');
		const rows = await withTimeout(
			this.run(text, values),
			SAMPLE_TIMEOUT_MS,
		);
		const limit = Math.min(opts.limit, 50);
		return {
			target,
			columns: cols,
			rows: rows as readonly Readonly<Record<string, unknown>>[],
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
		const { text, values } = buildSampleSql(queryAst.target, opts, cols, MSSQL_DIALECT);
		log.debug({ id: this.id, text }, 'explain query');
		// MSSQL EXPLAIN equivalent: SHOWPLAN_TEXT ON makes the next
		// SELECT return the plan as text rows instead of executing.
		// Run as a session-scoped pair so the SELECT doesn't pollute
		// downstream calls.
		await this.run('SET SHOWPLAN_TEXT ON', []);
		try {
			const rows = await withTimeout(this.run(text, values), SAMPLE_TIMEOUT_MS);
			return { plan: rows.map(r => String(r['StmtText'] ?? '')).join('\n') };
		} finally {
			await this.run('SET SHOWPLAN_TEXT OFF', []).catch(() => { /* best-effort */ });
		}
	}

	async aggregate(target: string, request: AggregateRequest): Promise<AggregateResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		const compiled = compileAggregate(target, request, cols, MSSQL_DIALECT);
		log.debug({ id: this.id, text: compiled.text }, 'aggregate query');
		const rows = await withTimeout(
			this.run(compiled.text, compiled.values as unknown[]),
			SAMPLE_TIMEOUT_MS,
		);
		return { target, values: readAggregateRow(rows[0], compiled.keys) };
	}

	async distinct(target: string, request: DistinctRequest): Promise<DistinctResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		const compiled = compileDistinct(target, request, cols, MSSQL_DIALECT);
		log.debug({ id: this.id }, 'distinct query');
		const [countRows, valueRows] = await Promise.all([
			withTimeout(this.run(compiled.distinctCountSql, []), SAMPLE_TIMEOUT_MS),
			withTimeout(this.run(compiled.topValuesSql,    []), SAMPLE_TIMEOUT_MS),
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
			dialect: MSSQL_DIALECT,
			describe: (t) => this.describe(t).then(s => ({ columns: s.columns })),
			runRows: async (sql, values) =>
				await withTimeout(this.run(sql, values as unknown[]), SAMPLE_TIMEOUT_MS),
		});
	}

	async functionalDependency(target: string, request: FunctionalDependencyRequest): Promise<FunctionalDependencyResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		return executeFunctionalDependency(request, {
			target,
			knownColumns: cols,
			dialect: MSSQL_DIALECT,
			runRows: async (sql, values) =>
				await withTimeout(this.run(sql, values as unknown[]), SAMPLE_TIMEOUT_MS),
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
		const cap = clampMssqlListLimit(opts?.limit);
		// MSSQL: union sys.tables + sys.views, exclude sys schemas.
		// schema filter is bound; the LIMIT-equivalent is TOP at SELECT.
		const params: unknown[] = [];
		let schemaWhere = `s.name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')`;
		if (typeof opts?.schema === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(opts.schema)) {
			params.push(opts.schema);
			schemaWhere += ` AND s.name = @p1`;
		}
		const sql = `
			SELECT TOP ${cap + 1} schema_name, name, kind
			FROM (
				SELECT s.name AS schema_name, t.name AS name, 'table' AS kind
				FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
				UNION ALL
				SELECT s.name AS schema_name, v.name AS name, 'view' AS kind
				FROM sys.views v JOIN sys.schemas s ON s.schema_id = v.schema_id
			) AS u
			WHERE ${schemaWhere.replace(/s\.name/g, 'u.schema_name')}
			ORDER BY u.schema_name, u.name
		`;
		const rows = await withTimeout(this.run(sql, params as unknown[]), SAMPLE_TIMEOUT_MS);
		const truncated = rows.length > cap;
		const sliced = truncated ? rows.slice(0, cap) : rows;
		return {
			target: 'mssql',
			tables: sliced.map(r => ({
				name: String(r['name'] ?? ''),
				schema: String(r['schema_name'] ?? ''),
				kind: r['kind'] === 'view' ? 'view' : 'table',
			})),
			truncated,
		};
	}

	async listIndexes(target: string): Promise<IndexListing> {
		quoteTarget(target, MSSQL_DIALECT);
		let schema: string | null = null;
		let table = target;
		const dot = target.indexOf('.');
		if (dot > 0) { schema = target.slice(0, dot); table = target.slice(dot + 1); }
		const sql = `
			SELECT i.name AS index_name,
			       i.is_unique,
			       i.is_primary_key,
			       c.name AS column_name,
			       ic.key_ordinal
			FROM sys.indexes i
			JOIN sys.tables tb ON tb.object_id = i.object_id
			JOIN sys.schemas s ON s.schema_id = tb.schema_id
			JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
			JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
			WHERE tb.name = @p1
			  AND s.name = COALESCE(@p2, SCHEMA_NAME())
			  AND i.name IS NOT NULL
			ORDER BY i.name, ic.key_ordinal
		`;
		const rows = await withTimeout(this.run(sql, [table, schema] as unknown[]), SAMPLE_TIMEOUT_MS);
		const byIndex = new Map<string, { unique: boolean; pk: boolean; cols: { ord: number; name: string }[] }>();
		for (const r of rows) {
			const name = String(r['index_name'] ?? '');
			const unique = r['is_unique'] === true || r['is_unique'] === 1;
			const pk = r['is_primary_key'] === true || r['is_primary_key'] === 1;
			let entry = byIndex.get(name);
			if (entry === undefined) {
				entry = { unique, pk, cols: [] };
				byIndex.set(name, entry);
			}
			entry.cols.push({ ord: Number(r['key_ordinal'] ?? 0), name: String(r['column_name'] ?? '') });
		}
		const indexes: { name: string; columns: string[]; unique: boolean; primaryKey: boolean }[] = [];
		for (const [name, entry] of byIndex) {
			entry.cols.sort((a, b) => a.ord - b.ord);
			indexes.push({ name, columns: entry.cols.map(c => c.name), unique: entry.unique, primaryKey: entry.pk });
		}
		return { target, indexes };
	}

	private orchestratorDeps(target: string, cols: readonly string[]): OrchestratorDeps {
		return {
			target,
			knownColumns: cols,
			dialect: MSSQL_DIALECT,
			aggregate: (req) => this.aggregate(target, req),
			runRows: async (sql, values) =>
				await withTimeout(this.run(sql, values as unknown[]), SAMPLE_TIMEOUT_MS),
		};
	}

	async close(): Promise<void> {
		await this.pool.destroy();
	}

	// -------------------------------------------------------------------------

	private async fetchColumns(
		schema: string | null,
		table: string,
	): Promise<ColumnDescription[]> {
		const sql = `
			SELECT c.name AS col_name,
			       t.name AS col_type,
			       c.is_nullable AS is_nullable
			FROM sys.columns c
			JOIN sys.tables tb ON tb.object_id = c.object_id
			JOIN sys.schemas sc ON sc.schema_id = tb.schema_id
			JOIN sys.types  t ON t.user_type_id = c.user_type_id
			WHERE tb.name = @p1 AND sc.name = COALESCE(@p2, SCHEMA_NAME())
			ORDER BY c.column_id
		`;
		const rows = await this.run(sql, [table, schema]);
		return rows.map((r) => ({
			name: r['col_name'] as string,
			type: r['col_type'] as string,
			nullable: r['is_nullable'] === true || r['is_nullable'] === 1,
		}));
	}

	private async fetchPrimaryKey(
		schema: string | null,
		table: string,
	): Promise<Set<string>> {
		const sql = `
			SELECT c.name AS col_name
			FROM sys.indexes i
			JOIN sys.tables tb ON tb.object_id = i.object_id
			JOIN sys.schemas sc ON sc.schema_id = tb.schema_id
			JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
			JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
			WHERE i.is_primary_key = 1
			  AND tb.name = @p1 AND sc.name = COALESCE(@p2, SCHEMA_NAME())
		`;
		const rows = await this.run(sql, [table, schema]);
		return new Set(rows.map(r => r['col_name'] as string));
	}

	private async run(
		sql: string,
		params: readonly unknown[],
	): Promise<Record<string, unknown>[]> {
		const conn = await this.pool.acquire().promise;
		try {
			const { Request } = await import('tedious');
			return await new Promise<Record<string, unknown>[]>((resolveRows, rejectRows) => {
				const out: Record<string, unknown>[] = [];
				const req: MssqlRequest = new Request(sql, (err) => {
					if (err !== undefined && err !== null) { rejectRows(err); return; }
					resolveRows(out);
				});
				for (let i = 0; i < params.length; i++) {
					req.addParameter(`p${i + 1}`, bestType(params[i]), params[i] as never);
				}
				req.on('row', (columns: ColumnValue[]) => {
					const row: Record<string, unknown> = {};
					for (const c of columns) { row[c.metadata.colName] = c.value; }
					out.push(row);
				});
				conn.execSql(req);
			});
		} finally {
			this.pool.release(conn);
		}
	}
}

// ---------------------------------------------------------------------------

function bestType(value: unknown): (typeof TYPES)[keyof typeof TYPES] {
	if (value === null || value === undefined) { return TYPES.NVarChar; }
	if (typeof value === 'number') {
		return Number.isInteger(value) ? TYPES.Int : TYPES.Float;
	}
	if (typeof value === 'boolean') { return TYPES.Bit; }
	return TYPES.NVarChar;
}

function splitTarget(target: string): { schema: string | null; table: string } {
	quoteTarget(target, MSSQL_DIALECT);
	if (target.includes('.')) {
		const [schema, table] = target.split('.');
		return { schema: schema ?? null, table: table ?? target };
	}
	return { schema: null, table: target };
}

registerDriver({
	kind: 'mssql',
	family: 'rdbms',
	factory: async (config: ConnectionConfig) => {
		if (config.url === undefined) {
			throw new Error(`data-driver: mssql connection '${config.id}' missing url`);
		}
		const prismaPath = config.schemaSource?.type === 'prisma' ? config.schemaSource.path : undefined;
		return new MssqlDriver(config.id, config.url, prismaPath);
	},
});
