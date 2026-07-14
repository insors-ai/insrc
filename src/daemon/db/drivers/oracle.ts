/**
 * Oracle driver (kind: `oracle`).
 *
 * Uses `oracledb` in thin mode (default from v6.x) -- no Instant
 * Client install needed for Oracle 12c+. Thick mode would require
 * `oracledb.initOracleClient()` with the path to Instant Client;
 * deferred to a follow-up when someone hits a pre-12c server.
 *
 * Introspection via `ALL_TAB_COLUMNS` + `ALL_CONSTRAINTS` +
 * `ALL_CONS_COLUMNS`. Identifiers are uppercased by Oracle unless
 * quoted; we preserve user-supplied case.
 */

import oracledb from 'oracledb';

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
	ORACLE_DIALECT,
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
} from './rdbms-common.js';
import type { OrchestratorDeps } from './rdbms-common.js';
import type { PlanResult, QueryAst } from '../../../shared/db-driver.js';
import { prismaSchemaDescription } from './rdbms-prisma.js';

const log = getLogger('db-oracle');

function clampOracleListLimit(n: number | undefined): number {
	if (typeof n !== 'number' || !Number.isFinite(n)) return 500;
	return Math.min(Math.max(1, Math.floor(n)), 5000);
}

oracledb.fetchAsString = [oracledb.CLOB];
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

function parseUrl(url: string): oracledb.PoolAttributes {
	const u = new URL(url);
	const database = u.pathname === '' || u.pathname === '/' ? '' : u.pathname.slice(1);
	return {
		user: decodeURIComponent(u.username),
		password: decodeURIComponent(u.password),
		connectString: `${u.hostname}:${u.port === '' ? '1521' : u.port}/${database}`,
		poolMin: 0,
		poolMax: 3,
		poolIncrement: 1,
		queueTimeout: SAMPLE_TIMEOUT_MS,
	};
}

class OracleDriver implements RdbmsDriver {
	readonly family = 'rdbms' as const;
	readonly kind = 'oracle';

	private readonly poolPromise: Promise<oracledb.Pool>;
	private readonly schemaCache = new Map<string, SchemaDescription>();
	private readonly prismaPath: string | undefined;

	constructor(readonly id: string, url: string, prismaPath?: string) {
		this.poolPromise = oracledb.createPool(parseUrl(url));
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

		const { owner, table } = splitTarget(target);
		const columns = await this.fetchColumns(owner, table);
		if (columns.length === 0) {
			throw new Error(`data-driver: table '${target}' not found`);
		}
		const pk = await this.fetchPrimaryKey(owner, table);
		for (const col of columns) {
			if (pk.has(col.name.toUpperCase())) {
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
		const { text, values } = buildSampleSql(target, opts, cols, ORACLE_DIALECT);
		log.debug({ id: this.id, text }, 'sample query');

		const pool = await this.poolPromise;
		const conn = await pool.getConnection();
		try {
			const res = await conn.execute<Record<string, unknown>>(
				text,
				values as unknown[],
				{ outFormat: oracledb.OUT_FORMAT_OBJECT },
			);
			const limit = Math.min(opts.limit, 50);
			const rows = res.rows ?? [];
			return {
				target,
				columns: cols,
				rows,
				truncated: rows.length >= limit,
				metadata: { samplingMethod: 'first' },
			};
		} finally {
			await conn.close();
		}
	}

	async explain(queryAst: QueryAst): Promise<PlanResult> {
		const schema = await this.describe(queryAst.target);
		const cols = schema.columns.map(c => c.name);
		const opts = queryAst.where !== undefined
			? { limit: 50, where: queryAst.where }
			: { limit: 50 };
		const { text, values } = buildSampleSql(queryAst.target, opts, cols, ORACLE_DIALECT);
		log.debug({ id: this.id, text }, 'explain query');
		const pool = await this.poolPromise;
		const conn = await pool.getConnection();
		try {
			// Two-statement flow: EXPLAIN PLAN populates PLAN_TABLE,
			// DBMS_XPLAN.DISPLAY reads it back as text rows.
			await conn.execute(`EXPLAIN PLAN FOR ${text}`, values as unknown[]);
			const res = await conn.execute<Record<string, unknown>>(
				`SELECT plan_table_output FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, NULL, 'BASIC'))`,
				[],
				{ outFormat: oracledb.OUT_FORMAT_OBJECT },
			);
			const lines = (res.rows ?? []).map(r => String(r['PLAN_TABLE_OUTPUT'] ?? ''));
			return { plan: lines.join('\n') };
		} finally {
			await conn.close();
		}
	}

	async aggregate(target: string, request: AggregateRequest): Promise<AggregateResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		const compiled = compileAggregate(target, request, cols, ORACLE_DIALECT);
		log.debug({ id: this.id, text: compiled.text }, 'aggregate query');
		const pool = await this.poolPromise;
		const conn = await pool.getConnection();
		try {
			const res = await conn.execute<Record<string, unknown>>(
				compiled.text,
				compiled.values as unknown[],
				{ outFormat: oracledb.OUT_FORMAT_OBJECT },
			);
			return { target, values: readAggregateRow((res.rows ?? [])[0], compiled.keys) };
		} finally {
			await conn.close();
		}
	}

	async distinct(target: string, request: DistinctRequest): Promise<DistinctResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		const compiled = compileDistinct(target, request, cols, ORACLE_DIALECT);
		log.debug({ id: this.id }, 'distinct query');
		const pool = await this.poolPromise;
		const conn = await pool.getConnection();
		try {
			const [countRes, valuesRes] = await Promise.all([
				conn.execute<Record<string, unknown>>(compiled.distinctCountSql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT }),
				conn.execute<Record<string, unknown>>(compiled.topValuesSql,    [], { outFormat: oracledb.OUT_FORMAT_OBJECT }),
			]);
			return {
				target,
				column: request.column,
				distinctCount: readDistinctCount((countRes.rows ?? [])[0]),
				topValues: readDistinctRows(valuesRes.rows ?? []),
			};
		} finally {
			await conn.close();
		}
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
			dialect: ORACLE_DIALECT,
			describe: (t) => this.describe(t).then(s => ({ columns: s.columns })),
			runRows: async (sql, values) => {
				const pool = await this.poolPromise;
				const conn = await pool.getConnection();
				try {
					const res = await conn.execute<Record<string, unknown>>(
						sql, values as unknown[],
						{ outFormat: oracledb.OUT_FORMAT_OBJECT },
					);
					return res.rows ?? [];
				} finally {
					await conn.close();
				}
			},
		});
	}

	async functionalDependency(target: string, request: FunctionalDependencyRequest): Promise<FunctionalDependencyResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		return executeFunctionalDependency(request, {
			target,
			knownColumns: cols,
			dialect: ORACLE_DIALECT,
			runRows: async (sql, values) => {
				const pool = await this.poolPromise;
				const conn = await pool.getConnection();
				try {
					const res = await conn.execute<Record<string, unknown>>(
						sql, values as unknown[],
						{ outFormat: oracledb.OUT_FORMAT_OBJECT },
					);
					return res.rows ?? [];
				} finally {
					await conn.close();
				}
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
		const cap = clampOracleListLimit(opts?.limit);
		const params: unknown[] = [];
		// Excluded owners: Oracle's standard system schemas. Customer schemas live elsewhere.
		const exclusions = `'SYS','SYSTEM','XDB','OUTLN','MDSYS','CTXSYS','EXFSYS','DBSNMP','APPQOSSYS','GSMADMIN_INTERNAL','LBACSYS','OJVMSYS','ORDDATA','ORDPLUGINS','ORDSYS','SI_INFORMTN_SCHEMA','WMSYS','REMOTE_SCHEDULER_AGENT','OLAPSYS','GSMUSER','ANONYMOUS','APEX_PUBLIC_USER','APEX_INSTANCE_ADMIN_USER','GSMCATUSER','SYSBACKUP','SYSDG','SYSKM','SYSRAC'`;
		let where = `WHERE owner NOT IN (${exclusions})`;
		if (typeof opts?.schema === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(opts.schema)) {
			params.push(opts.schema.toUpperCase());
			where += ` AND owner = :1`;
		}
		const sql = `
			SELECT * FROM (
				SELECT owner, table_name AS name, 'table' AS kind FROM all_tables ${where}
				UNION ALL
				SELECT owner, view_name AS name, 'view' AS kind FROM all_views ${where}
			) ORDER BY owner, name FETCH FIRST ${cap + 1} ROWS ONLY
		`;
		const pool = await this.poolPromise;
		const conn = await pool.getConnection();
		try {
			const res = await conn.execute<Record<string, unknown>>(
				sql, params as unknown[],
				{ outFormat: oracledb.OUT_FORMAT_OBJECT },
			);
			const rows = res.rows ?? [];
			const truncated = rows.length > cap;
			const sliced = truncated ? rows.slice(0, cap) : rows;
			return {
				target: 'oracle',
				tables: sliced.map(r => ({
					name: String(r['NAME'] ?? ''),
					schema: String(r['OWNER'] ?? ''),
					kind: r['KIND'] === 'view' ? 'view' : 'table',
				})),
				truncated,
			};
		} finally {
			await conn.close();
		}
	}

	async listIndexes(target: string): Promise<IndexListing> {
		quoteTarget(target, ORACLE_DIALECT);
		// Oracle is case-sensitive within quoted identifiers but reports
		// uppercase in all_* views by default; match against UPPER(table).
		let owner: string | null = null;
		let table = target;
		const dot = target.indexOf('.');
		if (dot > 0) { owner = target.slice(0, dot).toUpperCase(); table = target.slice(dot + 1); }
		const sql = `
			SELECT i.index_name,
			       i.uniqueness,
			       c.column_name,
			       c.column_position,
			       (CASE WHEN cc.constraint_type = 'P' THEN 'Y' ELSE 'N' END) AS is_pk
			FROM all_ind_columns c
			JOIN all_indexes i
			     ON i.index_name = c.index_name AND i.owner = c.index_owner
			LEFT JOIN all_constraints cc
			     ON cc.index_name = i.index_name AND cc.owner = i.owner
			WHERE c.table_name = UPPER(:1)
			  AND (:2 IS NULL OR c.table_owner = :2)
			ORDER BY i.index_name, c.column_position
		`;
		const pool = await this.poolPromise;
		const conn = await pool.getConnection();
		try {
			const res = await conn.execute<Record<string, unknown>>(
				sql, [table.toUpperCase(), owner] as unknown[],
				{ outFormat: oracledb.OUT_FORMAT_OBJECT },
			);
			const rows = res.rows ?? [];
			const byIndex = new Map<string, { unique: boolean; pk: boolean; cols: { ord: number; name: string }[] }>();
			for (const r of rows) {
				const name = String(r['INDEX_NAME'] ?? '');
				const unique = String(r['UNIQUENESS'] ?? '') === 'UNIQUE';
				const pk = String(r['IS_PK'] ?? 'N') === 'Y';
				let entry = byIndex.get(name);
				if (entry === undefined) {
					entry = { unique, pk, cols: [] };
					byIndex.set(name, entry);
				}
				entry.cols.push({ ord: Number(r['COLUMN_POSITION'] ?? 0), name: String(r['COLUMN_NAME'] ?? '') });
			}
			const indexes: { name: string; columns: string[]; unique: boolean; primaryKey: boolean }[] = [];
			for (const [name, entry] of byIndex) {
				entry.cols.sort((a, b) => a.ord - b.ord);
				indexes.push({ name, columns: entry.cols.map(c => c.name), unique: entry.unique, primaryKey: entry.pk });
			}
			return { target, indexes };
		} finally {
			await conn.close();
		}
	}

	private orchestratorDeps(target: string, cols: readonly string[]): OrchestratorDeps {
		return {
			target,
			knownColumns: cols,
			dialect: ORACLE_DIALECT,
			aggregate: (req) => this.aggregate(target, req),
			runRows: async (sql, values) => {
				const pool = await this.poolPromise;
				const conn = await pool.getConnection();
				try {
					const res = await conn.execute<Record<string, unknown>>(
						sql, values as unknown[],
						{ outFormat: oracledb.OUT_FORMAT_OBJECT },
					);
					return res.rows ?? [];
				} finally {
					await conn.close();
				}
			},
		};
	}

	async close(): Promise<void> {
		const pool = await this.poolPromise;
		await pool.close(5);
	}

	// -------------------------------------------------------------------------

	private async fetchColumns(
		owner: string | null,
		table: string,
	): Promise<ColumnDescription[]> {
		const pool = await this.poolPromise;
		const conn = await pool.getConnection();
		try {
			const res = await conn.execute<Record<string, unknown>>(
				`SELECT column_name, data_type, nullable
				 FROM all_tab_columns
				 WHERE table_name = :1
				   AND owner = COALESCE(:2, USER)
				 ORDER BY column_id`,
				[table.toUpperCase(), owner?.toUpperCase() ?? null],
				{ outFormat: oracledb.OUT_FORMAT_OBJECT },
			);
			return (res.rows ?? []).map((r) => ({
				name: r['COLUMN_NAME'] as string,
				type: r['DATA_TYPE'] as string,
				nullable: r['NULLABLE'] === 'Y',
			}));
		} finally {
			await conn.close();
		}
	}

	private async fetchPrimaryKey(
		owner: string | null,
		table: string,
	): Promise<Set<string>> {
		const pool = await this.poolPromise;
		const conn = await pool.getConnection();
		try {
			const res = await conn.execute<Record<string, unknown>>(
				`SELECT cc.column_name
				 FROM all_constraints c
				 JOIN all_cons_columns cc
				   ON cc.owner = c.owner AND cc.constraint_name = c.constraint_name
				 WHERE c.constraint_type = 'P'
				   AND c.table_name = :1
				   AND c.owner = COALESCE(:2, USER)`,
				[table.toUpperCase(), owner?.toUpperCase() ?? null],
				{ outFormat: oracledb.OUT_FORMAT_OBJECT },
			);
			return new Set((res.rows ?? []).map(r => r['COLUMN_NAME'] as string));
		} finally {
			await conn.close();
		}
	}
}

// ---------------------------------------------------------------------------

function splitTarget(target: string): { owner: string | null; table: string } {
	quoteTarget(target, ORACLE_DIALECT);
	if (target.includes('.')) {
		const [owner, table] = target.split('.');
		return { owner: owner ?? null, table: table ?? target };
	}
	return { owner: null, table: target };
}

registerDriver({
	kind: 'oracle',
	family: 'rdbms',
	factory: async (config: ConnectionConfig) => {
		if (config.url === undefined) {
			throw new Error(`data-driver: oracle connection '${config.id}' missing url`);
		}
		const prismaPath = config.schemaSource?.type === 'prisma' ? config.schemaSource.path : undefined;
		return new OracleDriver(config.id, config.url, prismaPath);
	},
});
