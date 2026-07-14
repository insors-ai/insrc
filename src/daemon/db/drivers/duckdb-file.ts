/**
 * DuckDB-backed FileDriver -- one implementation for every file kind
 * DuckDB reads natively (csv / tsv / jsonl / ndjson / json / parquet
 * / arrow / feather). Replaces the bespoke per-format drivers per
 * plans/data-driver-duckdb-files.md Phase 1.
 *
 * Why a single driver:
 *   - One SQL surface. describe / sample / sampleShape / aggregate
 *     all flow through DuckDB SQL: `read_csv_auto`, `read_json_auto`,
 *     `read_parquet`, etc. No per-format aggregation code paths.
 *   - Streaming + projection pushdown. CSV / JSONL stream
 *     memory-bounded; Parquet projects only referenced columns.
 *   - DuckDB's analytical surface (percentiles, regr_*, kurtosis,
 *     mad, mode, entropy, window functions, approximate aggregates)
 *     becomes available to Family-5 skills for free.
 *
 * Path safety:
 *   - The driver pool resolves connection.path to absolute + verifies
 *     existence before this factory runs, so config.path arrives
 *     trusted (Phase 0.3).
 *   - File paths flow into DuckDB via `?` parameters, never string-
 *     interpolated. Reader options (delimiter, header, ...) are
 *     resolved from connection config and stitched into the reader-
 *     function call as literals, but only after passing the option-
 *     value validators below.
 *
 * No-go:
 *   - No `httpfs` / S3 / Azure path support (extension stays disabled
 *     in the pool init, Phase 0.4).
 *   - No raw SQL accepted from callers. Only structured WhereClause /
 *     AggregateRequest objects compile to SQL via the existing
 *     rdbms-common helpers.
 */

import { existsSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

import { getLogger } from '../../../shared/logger.js';
import type {
	AggregateRequest,
	AggregateResult,
	ColumnDescription,
	ConnectionConfig,
	CorrelationMatrixRequest,
	CorrelationMatrixResult,
	DistinctRequest,
	DistinctResult,
	FileDriver,
	HistogramRequest,
	HistogramResult,
	OutlierRequest,
	OutlierResult,
	SampleOpts,
	SampleResult,
	ScanOpts,
	SchemaDescription,
	ShapeReport,
	TemporalTrendRequest,
	TemporalTrendResult,
} from '../../../shared/db-driver.js';
import { registerDriver } from '../registry.js';
import { withConnection } from '../duckdb-pool.js';
import { clampFileLimit } from './file-common.js';
import {
	POSTGRES_DIALECT,
	compileAggregateExprs,
	compileDistinct,
	compileWhere,
	executeCorrelationMatrix,
	executeHistogram,
	executeOutliers,
	executeTemporalTrend,
	readAggregateRow,
	readDistinctCount,
	readDistinctRows,
} from './rdbms-common.js';
import type { OrchestratorDeps } from './rdbms-common.js';
import { inferShape } from './shape-common.js';
import { cacheDirFor, destForSource, ensureCached } from '../converter-cache.js';
import { avroConverter } from './converters/avro.js';
import { bsonConverter } from './converters/bson.js';
import { fixedWidthConverter } from './converters/fixed-width.js';
import { xlsxConverter } from './converters/xlsx.js';
import { parquetGlobFor, walkSourceTree } from './converters/shared.js';
import type { FileConverter } from './converters/types.js';

const log = getLogger('db-duckdb-file');

/**
 * DuckDB's Node binding returns BIGINT / HUGEINT columns as JS `bigint`.
 * BigInt is opaque to `JSON.stringify` (which throws) and not safely
 * representable when the value crosses IPC. Normalize at the driver
 * boundary: safe-integer bigints become `number`; everything else
 * becomes a string. Other typed values pass through. Recurses into
 * nested objects + arrays so list/struct columns are covered.
 */
function normalizeBigInts<T>(value: T): T {
	if (typeof value === 'bigint') {
		const b = value as bigint;
		return (b >= Number.MIN_SAFE_INTEGER && b <= Number.MAX_SAFE_INTEGER
			? Number(b)
			: b.toString()) as unknown as T;
	}
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) {
		return value.map(v => normalizeBigInts(v)) as unknown as T;
	}
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		out[k] = normalizeBigInts(v);
	}
	return out as T;
}

// ---------------------------------------------------------------------------
// File kinds + reader-expression mapping
// ---------------------------------------------------------------------------

/** Kinds the DuckDB driver handles natively. avro / bson / fixed-width
 *  / xlsx are converted to Parquet via Phase 2 converters and then
 *  routed through the same DuckDB query path as native parquet. */
export type DuckDBFileKind =
	| 'csv' | 'tsv'
	| 'jsonl' | 'ndjson'
	| 'json'
	| 'parquet'
	| 'arrow' | 'feather'
	| 'avro' | 'bson' | 'fixed-width' | 'xlsx';

const NATIVE_KINDS: readonly DuckDBFileKind[] = [
	'csv', 'tsv', 'jsonl', 'ndjson', 'json', 'parquet', 'arrow', 'feather',
];

const CONVERTED_KINDS: readonly DuckDBFileKind[] = ['avro', 'bson', 'fixed-width', 'xlsx'];

const CONVERTERS: Record<'avro' | 'bson' | 'fixed-width' | 'xlsx', FileConverter> = {
	'avro':        avroConverter,
	'bson':        bsonConverter,
	'fixed-width': fixedWidthConverter,
	'xlsx':        xlsxConverter,
};

function isConvertedKind(kind: DuckDBFileKind): kind is 'avro' | 'bson' | 'fixed-width' | 'xlsx' {
	return CONVERTED_KINDS.includes(kind);
}

/**
 * Per-kind reader-function syntax. The `?` is a literal placeholder
 * for the path parameter; the rest is dialect-fixed. Caller is
 * responsible for stitching in already-validated reader options.
 *
 * `extraSql` lets the caller append already-validated options like
 * `, hive_partitioning=true` (per Phase 4.3) for directory-as-table
 * connections. The CSV `optionsSql` and Phase-4 directory options
 * compose by concatenation.
 *
 * Converted kinds (avro / bson / fixed-width / xlsx) always emit
 * `read_parquet(?)` -- the source is staged into the cache as Parquet
 * before the SQL runs, so DuckDB only sees Parquet at query time.
 */
function readerExpression(kind: DuckDBFileKind, optionsSql: string, extraSql = ''): string {
	if (isConvertedKind(kind)) return `read_parquet(?${extraSql})`;
	switch (kind) {
		case 'csv':
			// `read_csv_auto` auto-detects types from a row sample, then
			// streams the rest. `sample_size=10000` matches plan §1.2 --
			// large enough to catch heterogeneous columns, small enough
			// to keep schema inference snappy on multi-GB files.
			return `read_csv_auto(?, sample_size=10000${optionsSql}${extraSql})`;
		case 'tsv':
			// TSV is just CSV with a tab delimiter; the connection's
			// options carry user overrides (header, quote).
			return `read_csv_auto(?, delim='\\t', sample_size=10000${optionsSql}${extraSql})`;
		case 'jsonl':
		case 'ndjson':
			// `read_json_auto` with `format='newline_delimited'` reads
			// one JSON value per line.
			return `read_json_auto(?, format='newline_delimited'${extraSql})`;
		case 'json':
			// Single-doc / array-of-docs; DuckDB auto-detects the shape.
			return `read_json_auto(?${extraSql})`;
		case 'parquet':
			return `read_parquet(?${extraSql})`;
		case 'arrow':
		case 'feather':
			// `arrow` extension provides `read_arrow`. Best-effort: when
			// the extension is unavailable (offline / 404), the engine
			// surfaces a clean "function does not exist" error which the
			// tool layer renders as success: false.
			return `read_arrow(?${extraSql})`;
		default: {
			const exhaustive: never = kind;
			throw new Error(`data-driver: unknown file kind '${String(exhaustive)}'`);
		}
	}
}

// ---------------------------------------------------------------------------
// Directory glob assembly (Phase 4.4 of plans/data-driver-duckdb-files.md)
// ---------------------------------------------------------------------------

/** File-extension glob pattern per kind, used when path is a directory. */
function globExtensionFor(kind: DuckDBFileKind): string {
	switch (kind) {
		case 'csv':         return '*.csv';
		case 'tsv':         return '*.tsv';
		case 'jsonl':       return '*.jsonl';
		case 'ndjson':      return '*.ndjson';
		case 'json':        return '*.json';
		case 'parquet':     return '*.parquet';
		case 'arrow':       return '*.arrow';
		case 'feather':     return '*.feather';
		case 'avro':        return '*.avro';
		case 'bson':        return '*.bson';
		case 'xlsx':        return '*.xlsx';
		case 'fixed-width': return '*';
	}
}

/**
 * Source-tree walk pattern for directory connections of converted
 * kinds (Phase 4.5 of plans/data-driver-duckdb-files.md). Defaults to
 * the kind's natural extension; the connection's `options.glob`
 * (string basename glob) overrides it. Fixed-width sources have no
 * canonical extension, so the default is "all files".
 */
function sourceWalkPattern(
	kind: 'avro' | 'bson' | 'fixed-width' | 'xlsx',
	options: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
	const userGlob = options?.['glob'];
	if (typeof userGlob === 'string' && userGlob.length > 0) return userGlob;
	switch (kind) {
		case 'avro': return '*.avro';
		case 'bson': return '*.bson';
		case 'xlsx': return '*.xlsx';
		case 'fixed-width': return undefined;
	}
}

/**
 * Resolve the path argument to feed into `read_xxx(?)`. For a
 * single-file connection: just the absolute path. For a directory
 * connection: a glob string DuckDB's readers accept directly
 * (`/path/*.csv` or `/path/**\/*.csv` when recursive). DuckDB walks
 * the tree itself; the driver doesn't pre-enumerate files.
 */
function resolveReaderPath(
	kind: DuckDBFileKind,
	rootPath: string,
	isDirectory: boolean,
	recursive: boolean,
): string {
	if (!isDirectory) return rootPath;
	const ext = globExtensionFor(kind);
	const middle = recursive ? `**${sep}${ext}` : ext;
	return join(rootPath, middle);
}

// ---------------------------------------------------------------------------
// Reader-option assembly (CSV / TSV)
// ---------------------------------------------------------------------------

interface ResolvedCsvOptions {
	readonly delimiter: string | undefined;
	readonly header: boolean | undefined;
	readonly quote: string | undefined | false;
}

/**
 * Pull CSV/TSV options off the connection config + validate. Anything
 * outside the allowed shape is rejected here so the SQL we splice
 * stays trustworthy. Strings are checked against a strict allow-list
 * (single character, no SQL meta) -- DuckDB's options are
 * positional / named-arg syntax that doesn't take parameter binds.
 */
function resolveCsvOptions(config: ConnectionConfig): ResolvedCsvOptions {
	const o = (config.options ?? {}) as Record<string, unknown>;
	let delimiter: string | undefined;
	if (typeof o['delimiter'] === 'string') {
		const d = o['delimiter'];
		if (d.length === 0 || d.length > 2) {
			throw new Error(`data-driver: csv delimiter must be 1-2 chars, got '${d}'`);
		}
		// Block quote / backslash to keep the SQL splice trivial; one
		// or two visible ASCII characters covers every real-world case.
		if (/['"\\]/.test(d)) {
			throw new Error(`data-driver: csv delimiter '${d}' contains an unsupported character`);
		}
		delimiter = d;
	}
	let header: boolean | undefined;
	if (typeof o['header'] === 'boolean') header = o['header'];
	let quote: string | undefined | false;
	if (typeof o['quote'] === 'string') {
		const q = o['quote'];
		if (q.length !== 1 || /[\\]/.test(q)) {
			throw new Error(`data-driver: csv quote must be a single non-backslash char`);
		}
		quote = q;
	} else if (o['quote'] === false) {
		quote = false;
	}
	return { delimiter, header, quote };
}

/** Build the comma-prefixed `, opt=val` suffix to splice after the
 *  path parameter in `read_csv_auto(?, ...)`. Only emits options the
 *  user explicitly set; DuckDB's defaults handle the rest. */
function csvOptionsSql(opts: ResolvedCsvOptions): string {
	const parts: string[] = [];
	if (opts.delimiter !== undefined) parts.push(`delim='${opts.delimiter}'`);
	if (opts.header !== undefined) parts.push(`header=${opts.header}`);
	if (opts.quote === false) {
		parts.push(`quote=''`);
	} else if (opts.quote !== undefined) {
		parts.push(`quote='${opts.quote}'`);
	}
	return parts.length === 0 ? '' : `, ${parts.join(', ')}`;
}

// ---------------------------------------------------------------------------
// Driver class
// ---------------------------------------------------------------------------

class DuckDBFileDriver implements FileDriver {
	readonly family = 'file' as const;
	readonly kind: DuckDBFileKind;

	private schemaCache: SchemaDescription | null = null;

	constructor(
		readonly id: string,
		kind: DuckDBFileKind,
		private readonly path: string,
		private readonly csvOpts: ResolvedCsvOptions,
		private readonly isDirectory: boolean,
		private readonly recursive: boolean,
		private readonly hivePartitioning: boolean,
		private readonly connectionOptions: Readonly<Record<string, unknown>> | undefined,
	) {
		this.kind = kind;
	}

	// ---------------------------------------------------------------------------
	// FileDriver methods
	// ---------------------------------------------------------------------------

	async describe(target?: string): Promise<SchemaDescription> {
		// Per-target schema cache only valid when no target is passed --
		// xlsx-with-sheet target uses a distinct underlying parquet so
		// its describe cannot reuse the unioned-glob cache.
		if (target === undefined && this.schemaCache !== null) return this.schemaCache;

		const readPath = await this.readerPath(target);
		const expr = this.readerExpr();
		const sql = `DESCRIBE SELECT * FROM ${expr}`;
		log.debug({ id: this.id, sql }, 'describe');

		const rows = await withConnection(async (conn) => {
			const reader = await conn.runAndReadAll(sql, [readPath]);
			return reader.getRowObjects();
		});
		if (rows.length === 0) {
			throw new Error(`data-driver: ${this.kind} '${readPath}' has no columns`);
		}

		const columns: ColumnDescription[] = rows.map(r => ({
			name: String(r['column_name']),
			type: String(r['column_type']),
			// DuckDB DESCRIBE's `null` column is `'YES'` / `'NO'`;
			// older versions surface a boolean.
			nullable: r['null'] === 'YES' || r['null'] === true,
		}));
		const schema: SchemaDescription = {
			target: target ?? this.path,
			columns,
			source: this.kind === 'parquet' || this.kind === 'arrow' || this.kind === 'feather'
				? 'header'
				: 'inferred',
		};
		if (target === undefined) this.schemaCache = schema;
		return schema;
	}

	async sample(target: string | undefined, opts: SampleOpts): Promise<SampleResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		const limit = clampFileLimit(opts.limit);
		const readPath = await this.readerPath(target);
		const expr = this.readerExpr();

		// WHERE compiled via the same compileWhere helper RDBMS drivers
		// use -- structured clauses, parametrised values, column names
		// validated against the schema. The path parameter is bound at
		// position 1; subsequent `?`s are the WHERE values.
		const where = compileWhere(opts.where ?? [], cols, POSTGRES_DIALECT, 2);
		const whereText = where.text === '' ? '' : ` ${where.text}`;
		const sql = `SELECT * FROM ${expr}${whereText} LIMIT ${limit}`;
		log.debug({ id: this.id, sql }, 'sample');

		const params = [readPath, ...where.values];
		const rows = await withConnection(async (conn) => {
			const reader = await conn.runAndReadAll(sql, params as never[]);
			return normalizeBigInts(reader.getRowObjects());
		});

		return {
			target: target ?? this.path,
			columns: cols,
			rows,
			truncated: rows.length >= limit,
			metadata: { samplingMethod: 'first' },
		};
	}

	async sampleShape(opts: ScanOpts): Promise<ShapeReport> {
		// Nested-shape inference doesn't have a clean DuckDB native --
		// `JSON_STRUCTURE` aggregates can describe one row's shape but
		// merging across rows is what shape-common.ts already does.
		// So: pull a sample via DuckDB (fast streaming), run the
		// existing inferShape over the materialised rows.
		const limit = Math.min(Math.max(1, opts.limit), 1000);
		const readPath = await this.readerPath();
		const expr = this.readerExpr();
		const sql = `SELECT * FROM ${expr} LIMIT ${limit}`;
		const rows = await withConnection(async (conn) => {
			const reader = await conn.runAndReadAll(sql, [readPath]);
			return normalizeBigInts(reader.getRowObjects()) as readonly unknown[];
		});
		return inferShape(rows);
	}

	async aggregate(target: string | undefined, request: AggregateRequest): Promise<AggregateResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		// Reader-path placeholder is `$1`; aggregate-introduced values
		// (count_where predicates) start at $2; WHERE values follow.
		// Using `$N` everywhere instead of mixing `?` + `$N` keeps DuckDB's
		// parameter resolution unambiguous when the SELECT list contains
		// `$N` references (count_where) before the FROM clause.
		const aggExprs = compileAggregateExprs(request, cols, POSTGRES_DIALECT, 2);
		const readPath = await this.readerPath(target);
		const expr = this.readerExprWithPathParam('$1');
		const whereStart = 2 + aggExprs.values.length;
		const where = compileWhere(request.where ?? [], cols, POSTGRES_DIALECT, whereStart);
		const whereClause = where.text === '' ? '' : ` ${where.text}`;
		const sql = `SELECT ${aggExprs.exprs.join(', ')} FROM ${expr}${whereClause}`;
		log.debug({ id: this.id, sql }, 'aggregate');

		const params = [readPath, ...aggExprs.values, ...where.values];
		const row = await withConnection(async (conn) => {
			const reader = await conn.runAndReadAll(sql, params as never[]);
			const first = reader.getRowObjects()[0] as Readonly<Record<string, unknown>> | undefined;
			return first === undefined ? undefined : normalizeBigInts(first);
		});
		return { target: target ?? this.path, values: readAggregateRow(row, aggExprs.keys) };
	}

	async distinct(target: string | undefined, request: DistinctRequest): Promise<DistinctResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		const readPath = await this.readerPath(target);
		// FROM clause is the reader-function expression; pass it as
		// `asTableExpr` so compileDistinct doesn't quote-target the
		// connection path (which isn't a SQL identifier).
		const compiled = compileDistinct(
			target ?? this.path,
			request,
			cols,
			POSTGRES_DIALECT,
			{ asTableExpr: this.readerExpr() },
		);
		log.debug({ id: this.id }, 'distinct');

		const [countRow, valueRows] = await withConnection(async (conn) => {
			const cReader = await conn.runAndReadAll(compiled.distinctCountSql, [readPath]);
			const vReader = await conn.runAndReadAll(compiled.topValuesSql,    [readPath]);
			const cRaw = cReader.getRowObjects()[0] as Readonly<Record<string, unknown>> | undefined;
			const vRaw = vReader.getRowObjects() as readonly Readonly<Record<string, unknown>>[];
			return [
				cRaw === undefined ? undefined : normalizeBigInts(cRaw),
				normalizeBigInts(vRaw),
			] as const;
		});
		return {
			target: target ?? this.path,
			column: request.column,
			distinctCount: readDistinctCount(countRow),
			topValues: readDistinctRows(valueRows),
		};
	}

	async histogram(target: string | undefined, request: HistogramRequest): Promise<HistogramResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		return executeHistogram(request, await this.orchestratorDeps(target, cols));
	}

	async correlationMatrix(target: string | undefined, request: CorrelationMatrixRequest): Promise<CorrelationMatrixResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		return executeCorrelationMatrix(request, await this.orchestratorDeps(target, cols));
	}

	async outliers(target: string | undefined, request: OutlierRequest): Promise<OutlierResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		return executeOutliers(request, await this.orchestratorDeps(target, cols));
	}

	async temporalTrend(target: string | undefined, request: TemporalTrendRequest): Promise<TemporalTrendResult> {
		const schema = await this.describe(target);
		const cols = schema.columns.map(c => c.name);
		return executeTemporalTrend({ ...await this.orchestratorDeps(target, cols), request });
	}

	private async orchestratorDeps(target: string | undefined, cols: readonly string[]): Promise<OrchestratorDeps> {
		const readPath = await this.readerPath(target);
		const fromExpr = this.readerExprWithPathParam('$1');
		return {
			target: target ?? this.path,
			knownColumns: cols,
			dialect: POSTGRES_DIALECT,
			asTableExpr: fromExpr,
			paramStartIndex: 2,
			aggregate: (req) => this.aggregate(target, req),
			runRows: async (sql, values) => {
				const params = [readPath, ...values];
				return await withConnection(async (conn) => {
					const reader = await conn.runAndReadAll(sql, params as never[]);
					return normalizeBigInts(
						reader.getRowObjects() as readonly Readonly<Record<string, unknown>>[],
					);
				});
			},
		};
	}

	async close(): Promise<void> {
		// The DuckDB instance is daemon-wide and outlives every driver;
		// per-driver close is a no-op.
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	/** SQL `read_xxx(?, ...)` expression. The `?` binds to the
	 *  caller-provided path / glob from `readerPath()`. */
	private readerExpr(): string {
		const optsSql = (this.kind === 'csv' || this.kind === 'tsv')
			? csvOptionsSql(this.csvOpts)
			: '';
		const extra = this.hivePartitioning ? `, hive_partitioning=true` : '';
		return readerExpression(this.kind, optsSql, extra);
	}

	/** Same as readerExpr but with the path placeholder substituted in
	 *  place of the implicit `?` -- used when the SQL also references
	 *  explicit `$N` placeholders so DuckDB's parameter numbering stays
	 *  unambiguous. */
	private readerExprWithPathParam(placeholder: string): string {
		return this.readerExpr().replace('?', placeholder);
	}

	/**
	 * Resolve the path / glob bound to the reader function's first
	 * parameter. For native kinds this is sync and trivial. For
	 * converted kinds it stages the source through the converter
	 * cache (Phase 2 + 3) -- so the SQL always reads cached Parquet,
	 * never the original.
	 *
	 * `target` is honored for xlsx (Phase 2.5): each sheet becomes a
	 * separate Parquet, and `target` selects which one. For every
	 * other kind `target` is ignored (the connection is already a
	 * single logical table).
	 */
	private async readerPath(target?: string): Promise<string> {
		if (!isConvertedKind(this.kind)) {
			return resolveReaderPath(this.kind, this.path, this.isDirectory, this.recursive);
		}
		return this.ensureConvertedAndGlob(this.kind, target);
	}

	/**
	 * Stage a converted-kind connection's source(s) into the cache,
	 * return the DuckDB-readable Parquet path / glob.
	 *
	 * Single file: cache the file, return its `.parquet` path. xlsx is
	 * the special case -- the converter writes a directory of per-sheet
	 * Parquets. Without `target`: glob all sheets (callers querying a
	 * homogeneous workbook see one logical table). With `target`: read
	 * only the matching sheet.
	 *
	 * Directory: walk per `recursive` + `options.glob`, cache each
	 * match, return a glob over the cache root mirroring the source
	 * tree. `target` is not yet plumbed for directory-of-xlsx --
	 * uncommon enough to defer.
	 */
	private async ensureConvertedAndGlob(
		kind: 'avro' | 'bson' | 'fixed-width' | 'xlsx',
		target?: string,
	): Promise<string> {
		const converter = CONVERTERS[kind];
		const opts = this.connectionOptions;

		if (!this.isDirectory) {
			const sourceRoot = dirname(this.path);
			const dest = destForSource(this.id, sourceRoot, this.path);
			await ensureCached(this.id, this.path, dest, kind, async (s, d) => {
				const r = await converter.convertFile(s, d, opts);
				return { rowCount: r.rowCount, durationMs: r.durationMs };
			});
			if (kind === 'xlsx') {
				// Per-sheet parquets live inside the dest directory.
				// Target -> specific sheet; else glob everything (DuckDB
				// unions schemas, errors clearly if they diverge).
				if (target !== undefined && target.length > 0) {
					return join(dest, `${slugifySheetName(target)}.parquet`);
				}
				return join(dest, '*.parquet');
			}
			return dest;
		}

		const pattern = sourceWalkPattern(kind, opts);
		const sources = await walkSourceTree(this.path, {
			recursive: this.recursive,
			...(pattern !== undefined ? { pattern } : {}),
		});
		for (const src of sources) {
			const dest = destForSource(this.id, this.path, src);
			await ensureCached(this.id, src, dest, kind, async (s, d) => {
				const r = await converter.convertFile(s, d, opts);
				return { rowCount: r.rowCount, durationMs: r.durationMs };
			});
		}
		const cacheDir = cacheDirFor(this.id);
		// xlsx mirrors source tree but each `.xlsx` becomes a directory
		// of per-sheet `.parquet`s -- always one extra depth than the
		// source layout, so always use `**`.
		if (kind === 'xlsx') return join(cacheDir, '**', '*.parquet');
		return parquetGlobFor(cacheDir, this.recursive);
	}
}

/** Mirror the xlsx converter's sheet-name slug rule so callers can
 *  resolve a target back to its on-disk Parquet. Kept in lock-step
 *  with `converters/xlsx.ts`'s `slugify`. */
function slugifySheetName(name: string): string {
	return name.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'sheet';
}

// ---------------------------------------------------------------------------
// Factory + registration
// ---------------------------------------------------------------------------

function makeFactory(kind: DuckDBFileKind) {
	return async (config: ConnectionConfig) => {
		if (config.path === undefined) {
			throw new Error(`data-driver: ${kind} connection '${config.id}' missing path`);
		}
		if (!existsSync(config.path)) {
			throw new Error(`data-driver: ${kind} '${config.path}' does not exist`);
		}
		// Phase 4.1 -- a connection's path may be a single file or a
		// directory. Stat tells us which; downstream logic switches
		// between absolute path and DuckDB-glob accordingly.
		const stat = statSync(config.path);
		const isDirectory = stat.isDirectory();
		const recursive = config.recursive === true && isDirectory;
		const hivePartitioning = config.partitioning === 'hive' && isDirectory;

		const csvOpts = (kind === 'csv' || kind === 'tsv')
			? resolveCsvOptions(config)
			: { delimiter: undefined, header: undefined, quote: undefined };
		return new DuckDBFileDriver(
			config.id, kind, config.path, csvOpts,
			isDirectory, recursive, hivePartitioning,
			config.options,
		);
	};
}

/** Register the DuckDB-backed driver for every file kind it handles
 *  -- native (csv / tsv / jsonl / ndjson / json / parquet / arrow /
 *  feather) plus converted (avro / bson / fixed-width / xlsx via the
 *  Phase 2 converter pipeline). Idempotent: re-importing this module
 *  is harmless (the registry warns + replaces). Bespoke per-format
 *  drivers imported earlier in the boot sequence are overridden when
 *  this module's import lands -- intentional, since we're
 *  consolidating onto one SQL surface. */
export function registerDuckDBFileDriver(): void {
	for (const kind of NATIVE_KINDS) {
		registerDriver({ kind, family: 'file', factory: makeFactory(kind) });
	}
	for (const kind of CONVERTED_KINDS) {
		registerDriver({ kind, family: 'file', factory: makeFactory(kind) });
	}
}

// Self-register on import (matches the convention every other driver
// module follows). The driver pool's lazy DuckDB init means no DuckDB
// work happens until the first describe / sample / etc. call -- the
// import is cheap.
registerDuckDBFileDriver();
