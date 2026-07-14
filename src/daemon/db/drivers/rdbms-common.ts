/**
 * Shared helpers for RDBMS drivers (Postgres, MySQL, SQLite, MSSQL,
 * Oracle). Keeps each kind-specific driver focused on its client
 * library + dialect differences; the safety envelope (identifier
 * quoting, parametrised where compilation, DDL/DML denylist, limit
 * + timeout clamping) lives here.
 *
 * The LLM never sees or produces raw SQL. Inputs are structured
 * WhereClause objects + identifier-shaped target strings; we emit
 * the SQL ourselves and never interpolate user values into the
 * statement text.
 */

import type {
	AggregateFunction,
	AggregateRequest,
	AggregateResult,
	AggregateSpec,
	AntiJoinRequest,
	AntiJoinResult,
	CorrelationMatrixRequest,
	CorrelationMatrixResult,
	CorrelationMethod,
	DistinctRequest,
	FunctionalDependencyRequest,
	FunctionalDependencyResult,
	HistogramMode,
	HistogramRequest,
	HistogramResult,
	DickeyFullerRequest,
	DickeyFullerResult,
	OutlierRequest,
	OutlierResult,
	SampleOpts,
	TemporalGapEntry,
	TemporalGapStatsRequest,
	TemporalGapStatsResult,
	TemporalTrendRequest,
	TemporalTrendResult,
	WhereClause,
} from '../../../shared/db-driver.js';

export const SAMPLE_LIMIT = 50;
export const SAMPLE_TIMEOUT_MS = 5_000;

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

/**
 * Hard denylist -- if any compiled SQL we emit contains one of
 * these, something has gone very wrong and we refuse to run. The
 * parametrised query builders below will never produce these; this
 * is belt-and-braces against future refactors.
 */
const DML_DDL_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|CALL|DO|BEGIN|COMMIT|ROLLBACK|MERGE|REPLACE|VACUUM|ATTACH|DETACH)\b/i;

/**
 * Identifier quoting style, swappable per dialect.
 *   postgres / sqlite / mssql: "foo"
 *   mysql / mariadb:           `foo`
 *   oracle:                    "foo" (and case-sensitive)
 */
export interface Dialect {
	readonly quoteIdent: (part: string) => string;
	readonly placeholder: (index: number) => string;
	readonly limitClause: (limit: number) => string;
	/**
	 * Build a regex predicate fragment. `col` is already quoted;
	 * `placeholder` is a parametrised placeholder (e.g. `$1`, `?`,
	 * `:1`). When `negate` is true, builds the "not match" form.
	 *
	 * Dialects that don't support regex (MSSQL native T-SQL has no
	 * portable regex) leave this undefined; `compileWhere` raises a
	 * clear error rather than emitting an invalid query. Phase 5d.3
	 * Gap 1 (plans/analyzers/data-analyzer-skills.md).
	 */
	readonly regexPredicate?: (col: string, placeholder: string, negate: boolean) => string;
	/**
	 * Convert a timestamp / date-time column expression to numeric
	 * epoch-seconds. `col` is already quoted. Used by Phase 5g.1
	 * temporal-trend regression and any other skill that needs to
	 * regress against a temporal axis. Every shipped dialect can
	 * express this; the per-dialect SQL is the only difference.
	 */
	readonly epochExpr: (col: string) => string;
	/**
	 * True if the dialect has native `REGR_SLOPE` / `REGR_INTERCEPT`
	 * / `REGR_R2` aggregate functions (Postgres, DuckDB, Oracle).
	 * False on dialects that need expression-based regression
	 * (MySQL, SQLite, MSSQL). When false, `executeTemporalTrend`
	 * pulls the six SUMs + N + min/max in one query and computes
	 * slope / intercept / r² in JS.
	 */
	readonly supportsNativeRegr: boolean;
}

export const POSTGRES_DIALECT: Dialect = {
	quoteIdent: (p) => `"${p.replace(/"/g, '""')}"`,
	placeholder: (i) => `$${i}`,
	limitClause: (n) => `LIMIT ${n}`,
	regexPredicate: (col, ph, negate) => `${col} ${negate ? '!~' : '~'} ${ph}`,
	epochExpr: (col) => `EXTRACT(EPOCH FROM ${col})`,
	supportsNativeRegr: true,
};

export const MYSQL_DIALECT: Dialect = {
	quoteIdent: (p) => `\`${p.replace(/`/g, '``')}\``,
	placeholder: () => '?',
	limitClause: (n) => `LIMIT ${n}`,
	regexPredicate: (col, ph, negate) => `${col} ${negate ? 'NOT REGEXP' : 'REGEXP'} ${ph}`,
	epochExpr: (col) => `UNIX_TIMESTAMP(${col})`,
	supportsNativeRegr: false,
};

/**
 * SQLite REGEXP is a user-defined function the driver registers at
 * connection open (see `daemon/db/drivers/sqlite.ts`). Without that
 * registration the engine errors with "no such function: REGEXP".
 */
export const SQLITE_DIALECT: Dialect = {
	quoteIdent: (p) => `"${p.replace(/"/g, '""')}"`,
	placeholder: () => '?',
	limitClause: (n) => `LIMIT ${n}`,
	regexPredicate: (col, ph, negate) => `${col} ${negate ? 'NOT REGEXP' : 'REGEXP'} ${ph}`,
	// SQLite stores datetimes as ISO-8601 strings or numeric Julian
	// days; `unixepoch()` (3.38+) converts both to epoch seconds.
	// Older SQLite would need `strftime('%s', col)`; we target a
	// recent enough SQLite that `unixepoch()` is available since
	// every other Phase 0 primitive (MAD, percentile_cont, NTILE)
	// already requires it.
	epochExpr: (col) => `unixepoch(${col})`,
	supportsNativeRegr: false,
};

/**
 * MSSQL has no portable native regex (LIKE_REGEX from SQL/XML is not
 * implemented in T-SQL; `master.dbo.fn_regex_match` requires SQLCLR
 * configuration we don't assume). Leaving regexPredicate undefined
 * surfaces a clear error from compileWhere instead of generating an
 * invalid query.
 */
export const MSSQL_DIALECT: Dialect = {
	quoteIdent: (p) => `[${p.replace(/]/g, ']]')}]`,
	placeholder: (i) => `@p${i}`,
	limitClause: () => '', // uses TOP; see buildSampleSql
	// T-SQL: DATEDIFF is the standard epoch-seconds idiom; uses BIGINT
	// to avoid the INT-second overflow at 2038. DATEDIFF_BIG is the
	// 64-bit variant on SQL Server 2016+.
	epochExpr: (col) => `DATEDIFF_BIG(SECOND, '1970-01-01', ${col})`,
	supportsNativeRegr: false,
};

export const ORACLE_DIALECT: Dialect = {
	quoteIdent: (p) => `"${p.replace(/"/g, '""')}"`,
	placeholder: (i) => `:${i}`,
	limitClause: (n) => `FETCH FIRST ${n} ROWS ONLY`,
	regexPredicate: (col, ph, negate) => `${negate ? 'NOT ' : ''}REGEXP_LIKE(${col}, ${ph})`,
	// Oracle: subtract the epoch DATE and multiply by seconds-per-day.
	epochExpr: (col) => `((${col} - DATE '1970-01-01') * 86400)`,
	supportsNativeRegr: true,
};

/**
 * ClickHouse uses backtick identifier quoting (like MySQL) and a
 * named-typed placeholder syntax `{p1:String}`. The driver passes
 * the typed value via `query_params`. We declare every placeholder
 * as `:String` since ClickHouse implicit-casts to the column type
 * for predicates -- avoids per-value type inference here.
 */
export const CLICKHOUSE_DIALECT: Dialect = {
	quoteIdent: (p) => `\`${p.replace(/`/g, '``')}\``,
	placeholder: (i) => `{p${i}:String}`,
	limitClause: (n) => `LIMIT ${n}`,
	regexPredicate: (col, ph, negate) => `${negate ? 'NOT ' : ''}match(${col}, ${ph})`,
	// ClickHouse: toUnixTimestamp accepts both DateTime and Date.
	epochExpr: (col) => `toUnixTimestamp(${col})`,
	supportsNativeRegr: false,
};

// ---------------------------------------------------------------------------
// Target parsing
// ---------------------------------------------------------------------------

/**
 * Split a `schema.table` (or bare `table`) target + quote each part
 * with the dialect's rules. Rejects anything outside the strict
 * identifier shape.
 */
export function quoteTarget(target: string, dialect: Dialect): string {
	if (!IDENTIFIER_RE.test(target)) {
		throw new Error(`data-driver: invalid table identifier '${target}'`);
	}
	return target.split('.').map(dialect.quoteIdent).join('.');
}

// ---------------------------------------------------------------------------
// Where compilation
// ---------------------------------------------------------------------------

export interface CompiledWhere {
	readonly text: string;
	readonly values: readonly unknown[];
}

/**
 * Compile a list of WhereClause objects into a parametrised SQL
 * fragment. Column names are validated against `knownColumns` to
 * stop typo-via-LLM + defense-in-depth against identifier injection;
 * values are passed through as parameters.
 */
export function compileWhere(
	clauses: readonly WhereClause[],
	knownColumns: readonly string[],
	dialect: Dialect,
	startingIndex = 1,
): CompiledWhere {
	if (clauses.length === 0) { return { text: '', values: [] }; }

	const columnSet = new Set(knownColumns.map(c => c.toLowerCase()));
	const values: unknown[] = [];
	const fragments: string[] = [];
	let paramIndex = startingIndex;

	for (const clause of clauses) {
		if (!columnSet.has(clause.column.toLowerCase())) {
			throw new Error(
				`data-driver: unknown column '${clause.column}' in where clause`,
			);
		}
		const col = dialect.quoteIdent(clause.column);
		switch (clause.op) {
			case '=':
			case '!=':
			case '<':
			case '<=':
			case '>':
			case '>=': {
				if (clause.valueColumn !== undefined) {
					if (!columnSet.has(clause.valueColumn.toLowerCase())) {
						throw new Error(
							`data-driver: unknown valueColumn '${clause.valueColumn}' in where clause`,
						);
					}
					fragments.push(`${col} ${clause.op} ${dialect.quoteIdent(clause.valueColumn)}`);
				} else {
					fragments.push(`${col} ${clause.op} ${dialect.placeholder(paramIndex++)}`);
					values.push(clause.value);
				}
				break;
			}
			case 'is null': {
				fragments.push(`${col} IS NULL`);
				break;
			}
			case 'is not null': {
				fragments.push(`${col} IS NOT NULL`);
				break;
			}
			case 'in': {
				if (!Array.isArray(clause.value) || clause.value.length === 0) {
					throw new Error(
						`data-driver: 'in' op requires a non-empty array value ` +
						`(column '${clause.column}')`,
					);
				}
				const placeholders: string[] = [];
				for (const v of clause.value) {
					placeholders.push(dialect.placeholder(paramIndex++));
					values.push(v);
				}
				fragments.push(`${col} IN (${placeholders.join(', ')})`);
				break;
			}
			case 'between': {
				if (!Array.isArray(clause.value) || clause.value.length !== 2) {
					throw new Error(
						`data-driver: 'between' op requires a 2-tuple value ` +
						`(column '${clause.column}')`,
					);
				}
				const lo = dialect.placeholder(paramIndex++);
				const hi = dialect.placeholder(paramIndex++);
				values.push(clause.value[0], clause.value[1]);
				fragments.push(`${col} BETWEEN ${lo} AND ${hi}`);
				break;
			}
			case 'like':
			case 'not like': {
				if (typeof clause.value !== 'string') {
					throw new Error(
						`data-driver: '${clause.op}' op requires a string value ` +
						`(column '${clause.column}')`,
					);
				}
				const sqlOp = clause.op === 'like' ? 'LIKE' : 'NOT LIKE';
				fragments.push(`${col} ${sqlOp} ${dialect.placeholder(paramIndex++)}`);
				values.push(clause.value);
				break;
			}
			case 'regex':
			case 'not regex': {
				if (typeof clause.value !== 'string') {
					throw new Error(
						`data-driver: '${clause.op}' op requires a string value ` +
						`(column '${clause.column}')`,
					);
				}
				if (dialect.regexPredicate === undefined) {
					throw new Error(
						`data-driver: '${clause.op}' op is not supported on this dialect`,
					);
				}
				fragments.push(
					dialect.regexPredicate(col, dialect.placeholder(paramIndex++), clause.op === 'not regex'),
				);
				values.push(clause.value);
				break;
			}
		}
	}

	return { text: `WHERE ${fragments.join(' AND ')}`, values };
}

// ---------------------------------------------------------------------------
// Sample SQL assembly
// ---------------------------------------------------------------------------

export interface BuiltSampleSql extends CompiledWhere {
	readonly columnList: string;
}

/**
 * Assemble the final `SELECT ... FROM ... [WHERE ...] LIMIT N`
 * statement. Checks the emitted text against the DML/DDL denylist
 * as a last line of defense before handing to the client.
 */
export function buildSampleSql(
	target: string,
	opts: SampleOpts,
	columns: readonly string[],
	dialect: Dialect,
): { readonly text: string; readonly values: readonly unknown[] } {
	const quotedTarget = quoteTarget(target, dialect);
	const limit = Math.min(Math.max(1, opts.limit), SAMPLE_LIMIT);
	const where = compileWhere(opts.where ?? [], columns, dialect);
	const topClause = dialect === MSSQL_DIALECT ? ` TOP ${limit}` : '';
	const tailLimit = dialect === MSSQL_DIALECT ? '' : ' ' + dialect.limitClause(limit);
	const text = `SELECT${topClause} * FROM ${quotedTarget} ${where.text}${tailLimit}`.replace(/\s+/g, ' ').trim();

	if (looksLikeMutation(text)) {
		throw new Error(`data-driver: refused suspicious SQL: ${text}`);
	}
	return { text, values: where.values };
}

export function looksLikeMutation(sql: string): boolean {
	return DML_DDL_KEYWORDS.test(sql);
}

// ---------------------------------------------------------------------------
// Explain SQL assembly
// ---------------------------------------------------------------------------

/**
 * Build an EXPLAIN-shaped query for a SELECT against `target`. Each
 * dialect has its own prefix:
 *   - postgres: EXPLAIN (FORMAT TEXT)
 *   - mysql:    EXPLAIN
 *   - sqlite:   EXPLAIN QUERY PLAN
 *   - mssql:    handled out-of-band (driver runs SET SHOWPLAN_TEXT
 *               ON + the original SELECT)
 *   - oracle:   handled out-of-band (driver runs EXPLAIN PLAN FOR
 *               + DBMS_XPLAN.DISPLAY())
 *
 * For the two out-of-band dialects this helper still produces the
 * inner SELECT; the driver wraps it. Same DML/DDL denylist applies
 * via buildSampleSql.
 */
export function buildExplainSql(
	target: string,
	opts: SampleOpts,
	columns: readonly string[],
	dialect: Dialect,
): { readonly text: string; readonly values: readonly unknown[] } {
	const inner = buildSampleSql(target, opts, columns, dialect);
	if (dialect === POSTGRES_DIALECT) {
		return { text: `EXPLAIN (FORMAT TEXT) ${inner.text}`, values: inner.values };
	}
	if (dialect === MYSQL_DIALECT) {
		return { text: `EXPLAIN ${inner.text}`, values: inner.values };
	}
	if (dialect === SQLITE_DIALECT) {
		return { text: `EXPLAIN QUERY PLAN ${inner.text}`, values: inner.values };
	}
	// MSSQL + Oracle are handled by their drivers.
	return inner;
}

// ---------------------------------------------------------------------------
// Aggregate SQL assembly (Phase 0.1)
// ---------------------------------------------------------------------------

/**
 * Per-dialect rendering of an aggregate function. Returns the SQL
 * expression to splice into the `SELECT` list. Some dialects don't
 * support a given function natively (e.g. SQLite has no PERCENTILE);
 * those throw.
 *
 * The `colSql` argument is the already-quoted column reference; the
 * caller is responsible for passing a value that has been validated
 * against the table's column list.
 */
interface RenderedExpr {
	readonly sql: string;
	readonly values: readonly unknown[];
}

function renderAggExpr(
	fn: AggregateFunction,
	colSql: string,
	dialect: Dialect,
	args: AggregateSpec['args'] | undefined,
	knownColumns: readonly string[],
	paramStartIndex: number,
): RenderedExpr {
	switch (fn) {
		case 'count':
			return { sql: 'COUNT(*)', values: [] };
		case 'count_non_null':
			return { sql: `COUNT(${colSql})`, values: [] };
		case 'distinct_count':
			return { sql: `COUNT(DISTINCT ${colSql})`, values: [] };
		case 'composite_distinct_count': {
			const cols = args?.columns;
			if (!Array.isArray(cols) || cols.length < 2) {
				throw new Error('data-driver: composite_distinct_count requires args.columns with >= 2 entries');
			}
			const known = new Set(knownColumns.map(c => c.toLowerCase()));
			for (const c of cols) {
				if (!known.has(c.toLowerCase())) {
					throw new Error(`data-driver: unknown column '${c}' in composite_distinct_count`);
				}
			}
			const quoted = cols.map(c => dialect.quoteIdent(c));
			// Postgres / Oracle accept COUNT(DISTINCT (a, b)). MSSQL / SQLite /
			// MySQL don't, so we fall back to a CONCAT-with-sentinel form.
			if (dialect === POSTGRES_DIALECT || dialect === ORACLE_DIALECT) {
				return { sql: `COUNT(DISTINCT (${quoted.join(', ')}))`, values: [] };
			}
			const concat = quoted
				.map(q => `COALESCE(CAST(${q} AS VARCHAR), '__NULL__')`)
				.join(" || '\\u0001' || ");
			return { sql: `COUNT(DISTINCT ${concat})`, values: [] };
		}
		case 'count_where': {
			const predicate = args?.predicate;
			if (!Array.isArray(predicate) || predicate.length === 0) {
				throw new Error('data-driver: count_where requires args.predicate (non-empty WhereClause[])');
			}
			const compiled = compileWhere(predicate, knownColumns, dialect, paramStartIndex);
			// compileWhere emits "WHERE <fragments>"; strip the WHERE prefix
			// for use inside CASE WHEN.
			const fragmentsOnly = compiled.text.replace(/^WHERE\s+/, '');
			return {
				sql: `SUM(CASE WHEN ${fragmentsOnly} THEN 1 ELSE 0 END)`,
				values: compiled.values,
			};
		}
		case 'sum':
			return { sql: `SUM(${colSql})`, values: [] };
		case 'avg':
			return { sql: `AVG(${colSql})`, values: [] };
		case 'min':
			return { sql: `MIN(${colSql})`, values: [] };
		case 'max':
			return { sql: `MAX(${colSql})`, values: [] };
		case 'stddev':
			// Sample stddev. Postgres / DuckDB / Oracle / Snowflake / Redshift
			// all accept STDDEV_SAMP; MySQL has it too. SQLite has no
			// stddev built-in -- the engine surfaces "no such function"
			// verbatim. MSSQL uses `STDEV`.
			if (dialect === MSSQL_DIALECT) return { sql: `STDEV(${colSql})`, values: [] };
			return { sql: `STDDEV_SAMP(${colSql})`, values: [] };
		case 'variance':
			if (dialect === MSSQL_DIALECT) return { sql: `VAR(${colSql})`, values: [] };
			return { sql: `VAR_SAMP(${colSql})`, values: [] };
		case 'skewness':
			// DuckDB has skewness() native (sample form). Postgres lacks
			// it without an extension; SQLite / MySQL / MSSQL / Oracle
			// likewise. The engine error surfaces as success: false.
			return { sql: `SKEWNESS(${colSql})`, values: [] };
		case 'kurtosis':
			// DuckDB native (excess form). Same engine-error surfacing
			// as skewness on dialects that lack it.
			return { sql: `KURTOSIS(${colSql})`, values: [] };
		case 'mad':
			// Median absolute deviation. DuckDB has mad() native -- the
			// idiomatic single-pass call. We emit MAD(col) on every
			// dialect; engines without it surface "no such function".
			// (Postgres / Oracle could express it via a percentile-of-
			// abs-deviation subquery, but it requires re-shaping the
			// SELECT to bind the inner median; deferred until a Postgres
			// caller actually asks for MAD.)
			return { sql: `MAD(${colSql})`, values: [] };
		case 'percentile': {
			const p = args?.p;
			if (typeof p !== 'number' || p < 0 || p > 1) {
				throw new Error(
					'data-driver: aggregate function "percentile" requires args.p in [0, 1]',
				);
			}
			return { sql: `PERCENTILE_CONT(${p}) WITHIN GROUP (ORDER BY ${colSql})`, values: [] };
		}
	}
}

/**
 * Build the result-key for one aggregation. Stable + deterministic
 * so callers can reference results by name without seeing the SQL.
 *
 *   count:                   <col>__count
 *   percentile (p=0.5):      <col>__percentile_0_5
 *   ...:                     <col>__<fn>
 */
export function aggregateResultKey(spec: AggregateSpec): string {
	if (spec.function === 'percentile') {
		const p = spec.args?.p;
		if (typeof p !== 'number') {
			throw new Error('data-driver: percentile spec missing args.p');
		}
		const pStr = String(p).replace('.', '_');
		return `${spec.column}__percentile_${pStr}`;
	}
	if (spec.function === 'count_where') {
		// Distinguish multiple count_where calls on the same column by
		// hashing the predicate. Caller can also override by setting
		// distinct `column` values when reused.
		const sig = countWhereSignature(spec.args?.predicate ?? []);
		return `${spec.column}__count_where_${sig}`;
	}
	if (spec.function === 'composite_distinct_count') {
		const cols = spec.args?.columns ?? [];
		return `${spec.column}__composite_distinct_count_${cols.join('_')}`;
	}
	return `${spec.column}__${spec.function}`;
}

function countWhereSignature(predicate: readonly WhereClause[]): string {
	// Stable, short, identifier-shaped signature for use as a result-key
	// suffix. Falls back to a numeric index when the predicate is too
	// weird to serialise.
	const parts: string[] = [];
	for (const c of predicate) {
		const safeOp = c.op.replace(/[^a-z0-9]/gi, '');
		const safeCol = c.column.replace(/[^A-Za-z0-9_]/g, '');
		parts.push(`${safeCol}_${safeOp}`);
	}
	return parts.join('__') || 'p';
}

export interface CompiledAggregate {
	readonly text: string;
	readonly values: readonly unknown[];
	/** Result-key per aggregation in declaration order. The driver
	 *  reads these out of the engine's first row to assemble
	 *  `AggregateResult.values`. Each key is also used as the column
	 *  alias in the emitted SQL, so the engine returns rows already
	 *  keyed how we want. */
	readonly keys: readonly string[];
}

export interface CompiledAggregateExprs {
	/** Exprs ready to splice into a SELECT list, already aliased
	 *  (e.g. `AVG("col") AS "col__avg"`). */
	readonly exprs: readonly string[];
	readonly keys: readonly string[];
	/** Parameter values introduced by aggregations that carry their own
	 *  predicates (currently only `count_where`). The driver must splice
	 *  these into the parameter list BEFORE the request-level WHERE
	 *  values, in declaration order. */
	readonly values: readonly unknown[];
}

/**
 * Build the SELECT-list expressions + result-keys for an aggregate
 * request, without committing to a FROM source. RDBMS drivers
 * compose this with `quoteTarget(target, dialect)`; file drivers
 * (parquet over DuckDB, etc.) compose with `read_parquet('path')`
 * or similar table-function FROM clauses.
 *
 * Validates each spec's column against `knownColumns` (`count` is
 * exempt -- COUNT(*) doesn't reference a column). Rejects duplicate
 * result-keys.
 */
export function compileAggregateExprs(
	request: AggregateRequest,
	knownColumns: readonly string[],
	dialect: Dialect,
	paramStartIndex = 1,
): CompiledAggregateExprs {
	if (request.aggregations.length === 0) {
		throw new Error('data-driver: aggregate request has zero aggregations');
	}

	const columnSet = new Set(knownColumns.map(c => c.toLowerCase()));
	const seenKeys = new Set<string>();
	const exprs: string[] = [];
	const keys: string[] = [];
	const values: unknown[] = [];
	let paramIndex = paramStartIndex;

	for (const spec of request.aggregations) {
		// `count` and `count_where` are predicate-driven; `composite_distinct_count`
		// validates inside renderAggExpr. Column-only aggregates validate here.
		const skipColumnValidation =
			spec.function === 'count' ||
			spec.function === 'count_where' ||
			spec.function === 'composite_distinct_count';
		if (!skipColumnValidation && !columnSet.has(spec.column.toLowerCase())) {
			throw new Error(
				`data-driver: unknown column '${spec.column}' for aggregate '${spec.function}'`,
			);
		}
		const colSql = spec.function === 'count' || spec.function === 'count_where'
			? '*'
			: dialect.quoteIdent(spec.column);
		const rendered = renderAggExpr(spec.function, colSql, dialect, spec.args, knownColumns, paramIndex);
		paramIndex += rendered.values.length;
		values.push(...rendered.values);
		const key = aggregateResultKey(spec);
		if (seenKeys.has(key)) {
			throw new Error(
				`data-driver: duplicate aggregate key '${key}'; pass distinct columns or different percentile args`,
			);
		}
		seenKeys.add(key);
		// Quote the alias so result-keys with `__` survive case-folding
		// dialects (Postgres lowercases unquoted identifiers).
		exprs.push(`${rendered.sql} AS ${dialect.quoteIdent(key)}`);
		keys.push(key);
	}

	return { exprs, keys, values };
}

/**
 * RDBMS-flavoured aggregate compiler: composes the expressions from
 * `compileAggregateExprs` with a `quoteTarget(target)` FROM clause.
 * Use this for any driver whose target is a SQL identifier (table
 * name); use `compileAggregateExprs` directly when the FROM source
 * is a table-function (e.g. `read_parquet('...')`).
 */
export function compileAggregate(
	target: string,
	request: AggregateRequest,
	knownColumns: readonly string[],
	dialect: Dialect,
): CompiledAggregate {
	const aggExprs = compileAggregateExprs(request, knownColumns, dialect, 1);
	const quotedTarget = quoteTarget(target, dialect);
	// WHERE values follow aggregate-introduced parameters (count_where
	// predicates) so the placeholder indices line up.
	const whereStart = 1 + aggExprs.values.length;
	const where = compileWhere(request.where ?? [], knownColumns, dialect, whereStart);
	const whereClause = where.text === '' ? '' : ` ${where.text}`;
	const text = `SELECT ${aggExprs.exprs.join(', ')} FROM ${quotedTarget}${whereClause}`;
	if (looksLikeMutation(text)) {
		throw new Error(`data-driver: refused suspicious SQL: ${text}`);
	}
	return {
		text,
		values: [...aggExprs.values, ...where.values],
		keys: aggExprs.keys,
	};
}

// ---------------------------------------------------------------------------
// Distinct compilation (Phase 0.3 of plans/analyzers/data-analyzer-skills.md)
// ---------------------------------------------------------------------------

/** Hard cap on `topN`. The tool layer also clamps; this is a
 *  belt-and-braces ceiling for a callsite that goes through
 *  `compileDistinct` directly. */
const DISTINCT_TOPN_MAX = 1000;

/**
 * Compile two SQL queries: one for `COUNT(DISTINCT col)` and one for
 * the top-N values ordered by frequency desc, value asc. Returns both
 * fragments; the driver runs them either as a sequence (separate
 * round-trips) or fuses them via UNION ALL where the dialect benefits.
 *
 * Column name is validated against `knownColumns` to defend against
 * identifier injection; the integer LIMIT is interpolated literally
 * (clamped first) since most dialects can't bind LIMIT as a parameter.
 */
export interface CompiledDistinct {
	readonly distinctCountSql: string;
	readonly topValuesSql: string;
	readonly topN: number;
}

export function compileDistinct(
	target: string,
	request: DistinctRequest,
	knownColumns: readonly string[],
	dialect: Dialect,
	{ asTableExpr }: { asTableExpr?: string } = {},
): CompiledDistinct {
	const columnSet = new Set(knownColumns.map(c => c.toLowerCase()));
	if (!columnSet.has(request.column.toLowerCase())) {
		throw new Error(`data-driver: unknown column '${request.column}'`);
	}
	const topN = Math.min(Math.max(1, Math.floor(request.topN)), DISTINCT_TOPN_MAX);
	const fromClause = asTableExpr !== undefined
		? asTableExpr
		: quoteTarget(target, dialect);
	const colSql = dialect.quoteIdent(request.column);

	// MSSQL has TOP N + no LIMIT; everything else uses LIMIT/FETCH FIRST.
	const limitClause = dialect.limitClause(topN);
	const isMssqlLike = limitClause === '';
	const distinctCountSql = `SELECT COUNT(DISTINCT ${colSql}) AS distinct_count FROM ${fromClause}`;
	const topValuesSql = isMssqlLike
		? `SELECT TOP ${topN} ${colSql} AS value, COUNT(*) AS count FROM ${fromClause}`
			+ ` GROUP BY ${colSql} ORDER BY COUNT(*) DESC, ${colSql} ASC`
		: `SELECT ${colSql} AS value, COUNT(*) AS count FROM ${fromClause}`
			+ ` GROUP BY ${colSql} ORDER BY COUNT(*) DESC, ${colSql} ASC ${limitClause}`;

	if (looksLikeMutation(distinctCountSql) || looksLikeMutation(topValuesSql)) {
		throw new Error('data-driver: refused suspicious SQL in compileDistinct');
	}
	return { distinctCountSql, topValuesSql, topN };
}

/**
 * Read the `{ value, count }` rows produced by the topValuesSql.
 * Coerces count via the same path as `readAggregateRow` (some
 * dialects ship counts as bigint or string).
 */
export function readDistinctRows(
	rows: readonly Readonly<Record<string, unknown>>[],
): { readonly value: unknown; readonly count: number }[] {
	const out: { value: unknown; count: number }[] = [];
	for (const r of rows) {
		const raw = r['count'] ?? r['COUNT'] ?? r['Count'];
		let count: number;
		if (typeof raw === 'number') count = Number.isFinite(raw) ? raw : 0;
		else if (typeof raw === 'bigint') count = Number(raw);
		else if (typeof raw === 'string') { const n = Number(raw); count = Number.isFinite(n) ? n : 0; }
		else count = 0;
		out.push({ value: r['value'] ?? r['VALUE'] ?? r['Value'] ?? null, count });
	}
	return out;
}

/** Read the `distinct_count` scalar produced by `distinctCountSql`. */
export function readDistinctCount(
	row: Readonly<Record<string, unknown>> | undefined,
): number {
	const raw = row?.['distinct_count'] ?? row?.['DISTINCT_COUNT'] ?? row?.['Distinct_count'];
	if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
	if (typeof raw === 'bigint') return Number(raw);
	if (typeof raw === 'string') { const n = Number(raw); return Number.isFinite(n) ? n : 0; }
	return 0;
}

/**
 * Pull aggregate values out of the engine's first row and coerce to
 * `number | string | null`. Most clients return numerics as JS
 * `number` or `bigint`; some return strings (Postgres `numeric`,
 * temporal types). We coerce: bigint -> Number; numeric strings
 * (parseable as finite Number) -> Number; non-numeric strings (ISO
 * date / datetime) preserved as string for temporal min / max;
 * Date objects -> ISO string; other -> null.
 *
 * The driver passes the `keys` from `compileAggregate` so the order
 * matches; we use bracket-access on the row rather than positional
 * to handle drivers that return objects vs arrays interchangeably.
 */
export function readAggregateRow(
	row: Readonly<Record<string, unknown>> | undefined,
	keys: readonly string[],
): Record<string, number | string | null> {
	const out: Record<string, number | string | null> = {};
	for (const k of keys) {
		const raw = row?.[k];
		if (raw === null || raw === undefined) {
			out[k] = null;
		} else if (typeof raw === 'number') {
			out[k] = Number.isFinite(raw) ? raw : null;
		} else if (typeof raw === 'bigint') {
			out[k] = Number(raw);
		} else if (typeof raw === 'string') {
			const n = Number(raw);
			if (Number.isFinite(n) && raw.trim() !== '') {
				out[k] = n;
			} else if (looksLikeIsoTemporal(raw)) {
				// ISO-format date / datetime survives as string for
				// temporal min / max aggregates.
				out[k] = raw;
			} else {
				out[k] = null;
			}
		} else if (raw instanceof Date) {
			out[k] = raw.toISOString();
		} else if (typeof raw === 'object') {
			// DuckDB ships HUGEINT / DECIMAL / numeric-aggregate results as
			// objects with a `valueOf()` (e.g. DuckDBDecimalValue). Try
			// coercing via String + Number so they degrade gracefully into
			// the numeric path; otherwise null.
			const asString = String(raw);
			const n = Number(asString);
			out[k] = Number.isFinite(n) ? n : null;
		} else {
			out[k] = null;
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Histogram SQL assembly (Phase 0.2)
// ---------------------------------------------------------------------------

const HISTOGRAM_BUCKETS_MIN = 4;
const HISTOGRAM_BUCKETS_MAX = 200;

export function clampHistogramBuckets(n: number): number {
	if (!Number.isFinite(n)) return 20;
	return Math.min(Math.max(HISTOGRAM_BUCKETS_MIN, Math.floor(n)), HISTOGRAM_BUCKETS_MAX);
}

/**
 * Build the bounds query (min, max, count_non_null, count) used as the
 * first leg of the two-leg histogram protocol. Returns it as a regular
 * `AggregateRequest` so the driver can dispatch through its existing
 * `aggregate(target, request)` path -- one less code path to maintain.
 */
export function histogramBoundsRequest(request: HistogramRequest): AggregateRequest {
	const aggregations: AggregateSpec[] = [
		{ column: request.column, function: 'min' },
		{ column: request.column, function: 'max' },
		{ column: request.column, function: 'count_non_null' },
		{ column: '*',           function: 'count' },
	];
	const out: { aggregations: AggregateSpec[]; where?: readonly WhereClause[] } = { aggregations };
	if (request.where !== undefined && request.where.length > 0) out.where = request.where;
	return out as AggregateRequest;
}

export interface CompiledHistogram {
	readonly text: string;
	readonly values: readonly unknown[];
}

/**
 * Compile the bucket-counts query. The caller has already established
 * `lower` / `upper` bounds (via `histogramBoundsRequest`). The query
 * returns rows of the form `{ bucket_idx: number, lower: number,
 * upper: number, bucket_count: number }`.
 *
 * - `equal-width`: pure arithmetic via FLOOR((col - lower) / width).
 *   Works on every dialect we support.
 * - `equal-frequency`: NTILE(n) OVER (ORDER BY col). Requires window
 *   functions (Postgres / DuckDB / SQLite >=3.25 / MySQL >=8.0 /
 *   MSSQL / Oracle all support it).
 */
export function compileHistogramBuckets(
	target: string,
	request: HistogramRequest,
	lower: number,
	upper: number,
	knownColumns: readonly string[],
	dialect: Dialect,
	{ asTableExpr, paramStartIndex = 1 }: { asTableExpr?: string; paramStartIndex?: number } = {},
): CompiledHistogram {
	const columnSet = new Set(knownColumns.map(c => c.toLowerCase()));
	if (!columnSet.has(request.column.toLowerCase())) {
		throw new Error(`data-driver: unknown column '${request.column}' in histogram`);
	}
	const buckets = clampHistogramBuckets(request.buckets);
	const colSql = dialect.quoteIdent(request.column);
	const fromClause = asTableExpr !== undefined ? asTableExpr : quoteTarget(target, dialect);
	const where = compileWhere(request.where ?? [], knownColumns, dialect, paramStartIndex);
	// The histogram counts only non-null rows; add an explicit IS NOT NULL.
	const guardedWhere = where.text === ''
		? `WHERE ${colSql} IS NOT NULL`
		: `${where.text} AND ${colSql} IS NOT NULL`;

	const mode: HistogramMode = request.mode ?? 'equal-width';
	let text: string;
	if (mode === 'equal-width') {
		// Width is computed on the JS side and interpolated as a literal --
		// it's a derived numeric, not user input.
		const width = upper === lower ? 1 : (upper - lower) / buckets;
		// The CASE clamp ensures the max value (where (col - lower)/width
		// would equal `buckets`) lands in the last bucket rather than
		// spilling into bucket index `buckets`.
		const idxExpr =
			`CASE WHEN ${colSql} >= ${literal(upper, dialect)} THEN ${buckets - 1}` +
			` ELSE CAST(FLOOR((${colSql} - ${literal(lower, dialect)}) / ${literal(width, dialect)}) AS INTEGER) END`;
		text =
			`SELECT ${idxExpr} AS bucket_idx, COUNT(*) AS bucket_count` +
			` FROM ${fromClause} ${guardedWhere}` +
			` GROUP BY ${idxExpr} ORDER BY bucket_idx`;
	} else {
		// equal-frequency. Use NTILE inside a CTE-style subquery so the
		// outer SELECT can group by bucket and read back its lo / hi.
		text =
			`SELECT bucket_idx, MIN(${colSql}) AS bucket_lower, MAX(${colSql}) AS bucket_upper, COUNT(*) AS bucket_count` +
			` FROM (SELECT ${colSql}, NTILE(${buckets}) OVER (ORDER BY ${colSql}) AS bucket_idx` +
			`        FROM ${fromClause} ${guardedWhere}) AS h` +
			` GROUP BY bucket_idx ORDER BY bucket_idx`;
	}
	if (looksLikeMutation(text)) {
		throw new Error('data-driver: refused suspicious SQL in compileHistogramBuckets');
	}
	return { text, values: where.values };
}

/**
 * Build the equal-width buckets array purely from the bounds + the
 * row results of `compileHistogramBuckets`. Works regardless of which
 * dialect produced the rows; the SQL is responsible for delivering
 * `bucket_idx` + `bucket_count` (equal-width) or `bucket_idx` +
 * `bucket_lower` + `bucket_upper` + `bucket_count` (equal-frequency).
 */
export function readHistogramRows(
	rows: readonly Readonly<Record<string, unknown>>[],
	lower: number,
	upper: number,
	bucketCount: number,
	mode: HistogramMode,
): { lower: number; upper: number; count: number }[] {
	if (mode === 'equal-width') {
		const width = upper === lower ? 1 : (upper - lower) / bucketCount;
		const out: { lower: number; upper: number; count: number }[] = [];
		const counts = new Array<number>(bucketCount).fill(0);
		for (const r of rows) {
			const idx = numericFromRaw(r['bucket_idx'] ?? r['BUCKET_IDX'] ?? r['Bucket_idx']);
			const cnt = numericFromRaw(r['bucket_count'] ?? r['BUCKET_COUNT'] ?? r['Bucket_count']);
			if (idx === null || cnt === null) continue;
			const i = Math.max(0, Math.min(bucketCount - 1, Math.floor(idx)));
			counts[i]! += cnt;
		}
		for (let i = 0; i < bucketCount; i++) {
			out.push({
				lower: lower + i * width,
				upper: i === bucketCount - 1 ? upper : lower + (i + 1) * width,
				count: counts[i]!,
			});
		}
		return out;
	}
	// equal-frequency: each row supplies its own bucket_lower / bucket_upper.
	const out: { lower: number; upper: number; count: number }[] = [];
	for (const r of rows) {
		const lo = numericFromRaw(r['bucket_lower'] ?? r['BUCKET_LOWER'] ?? r['Bucket_lower']);
		const hi = numericFromRaw(r['bucket_upper'] ?? r['BUCKET_UPPER'] ?? r['Bucket_upper']);
		const cnt = numericFromRaw(r['bucket_count'] ?? r['BUCKET_COUNT'] ?? r['Bucket_count']);
		if (lo === null || hi === null || cnt === null) continue;
		out.push({ lower: lo, upper: hi, count: cnt });
	}
	return out;
}

function numericFromRaw(raw: unknown): number | null {
	if (raw === null || raw === undefined) return null;
	if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
	if (typeof raw === 'bigint') return Number(raw);
	if (typeof raw === 'string') { const n = Number(raw); return Number.isFinite(n) ? n : null; }
	return null;
}

/**
 * Format a numeric literal for splicing into compiled SQL. We never
 * splice user-supplied values via this path -- only derived numerics
 * from the bounds query (lower / upper / width). NaN / Infinity get
 * stringified as `'NULL'` so the surrounding arithmetic short-circuits
 * cleanly.
 */
function literal(n: number, _dialect: Dialect): string {
	if (!Number.isFinite(n)) return 'NULL';
	// Use enough precision to round-trip a JS double through SQL parsing.
	return Number(n).toPrecision(15);
}

// ---------------------------------------------------------------------------
// Correlation matrix (Phase 0.4)
// ---------------------------------------------------------------------------

/**
 * Compile a single SQL that returns one column per ordered upper-
 * triangular pair plus a row count. Pearson uses native `corr()` on
 * Postgres / DuckDB; computed expression elsewhere. Spearman wraps the
 * Pearson SQL with a CTE that ranks each column via RANK() OVER
 * (ORDER BY col), then correlates the ranks (de facto Spearman).
 *
 * Returns:
 *   text   -- single SQL
 *   values -- WHERE values
 *   keys   -- list of `pair__i_j` aliases in the SELECT list, in
 *             column-pair order (i < j; (j, i) reads the same)
 *   pairs  -- the matching (i, j) index pairs
 *   nKey   -- alias of the row-count column
 */
export interface CompiledCorrelation {
	readonly text: string;
	readonly values: readonly unknown[];
	readonly keys: readonly string[];
	readonly pairs: readonly (readonly [number, number])[];
	readonly nKey: string;
}

export function compileCorrelationMatrix(
	target: string,
	request: CorrelationMatrixRequest,
	knownColumns: readonly string[],
	dialect: Dialect,
	{ asTableExpr, paramStartIndex = 1 }: { asTableExpr?: string; paramStartIndex?: number } = {},
): CompiledCorrelation {
	if (request.columns.length < 2) {
		throw new Error('data-driver: correlation matrix requires >= 2 columns');
	}
	if (request.columns.length > 10) {
		throw new Error('data-driver: correlation matrix capped at 10 columns');
	}
	const columnSet = new Set(knownColumns.map(c => c.toLowerCase()));
	for (const c of request.columns) {
		if (!columnSet.has(c.toLowerCase())) {
			throw new Error(`data-driver: unknown column '${c}' in correlation matrix`);
		}
	}
	const cols = request.columns.map(c => dialect.quoteIdent(c));
	const method: CorrelationMethod = request.method ?? 'pearson';
	const where = compileWhere(request.where ?? [], knownColumns, dialect, paramStartIndex);
	// Restrict to rows where ALL requested columns are non-null
	// (pairwise complete observations).
	const nonNullPredicate = cols.map(c => `${c} IS NOT NULL`).join(' AND ');
	const guardedWhere = where.text === ''
		? `WHERE ${nonNullPredicate}`
		: `${where.text} AND ${nonNullPredicate}`;
	const fromClause = asTableExpr !== undefined ? asTableExpr : quoteTarget(target, dialect);

	// For Spearman, replace each column with its rank in a CTE-style
	// subquery, then correlate the ranks.
	let baseFrom: string;
	let rankedCols: string[];
	if (method === 'spearman') {
		const rankExprs = cols.map((c, i) => `RANK() OVER (ORDER BY ${c}) AS r${i}`);
		baseFrom = `(SELECT ${cols.join(', ')}, ${rankExprs.join(', ')} FROM ${fromClause} ${guardedWhere}) AS rs`;
		rankedCols = cols.map((_, i) => `r${i}`);
	} else {
		baseFrom = `${fromClause} ${guardedWhere}`;
		rankedCols = cols.slice();
	}

	const exprs: string[] = [];
	const keys: string[] = [];
	const pairs: [number, number][] = [];
	for (let i = 0; i < rankedCols.length; i++) {
		for (let j = i + 1; j < rankedCols.length; j++) {
			const xi = rankedCols[i]!;
			const xj = rankedCols[j]!;
			const corrSql = dialect.quoteIdent === POSTGRES_DIALECT.quoteIdent
				? `CORR(${xi}, ${xj})`
				: `CORR(${xi}, ${xj})`;
			// Compute corr via a portable formula when CORR is unavailable;
			// SQLite, MySQL, MSSQL all lack it. We prefer the native fn
			// where present; fall back to the formula otherwise.
			const expr = dialectHasCorr(dialect)
				? corrSql
				: portableCorrExpr(xi, xj);
			const key = `pair__${i}_${j}`;
			exprs.push(`${expr} AS ${dialect.quoteIdent(key)}`);
			keys.push(key);
			pairs.push([i, j]);
		}
	}
	const nKey = 'pair__n';
	exprs.push(`COUNT(*) AS ${dialect.quoteIdent(nKey)}`);

	const text = `SELECT ${exprs.join(', ')} FROM ${baseFrom}`;
	if (looksLikeMutation(text)) {
		throw new Error('data-driver: refused suspicious SQL in compileCorrelationMatrix');
	}
	return { text, values: where.values, keys, pairs, nKey };
}

function dialectHasCorr(dialect: Dialect): boolean {
	// Postgres + Oracle + DuckDB (POSTGRES_DIALECT shape) have native CORR.
	// SQLite, MySQL, MSSQL, ClickHouse don't (or use it differently).
	return dialect === POSTGRES_DIALECT || dialect === ORACLE_DIALECT;
}

function portableCorrExpr(a: string, b: string): string {
	// Standard sample-Pearson formula:
	//   corr = (N*sum(ab) - sum(a)*sum(b)) /
	//          sqrt((N*sum(a^2) - sum(a)^2) * (N*sum(b^2) - sum(b)^2))
	// Computed as a single SELECT expression. NaN / divide-by-zero
	// surfaces as NULL in most dialects (SQLite returns 0; we coerce).
	const N = `CAST(COUNT(*) AS DOUBLE PRECISION)`;
	const sa = `SUM(CAST(${a} AS DOUBLE PRECISION))`;
	const sb = `SUM(CAST(${b} AS DOUBLE PRECISION))`;
	const sab = `SUM(CAST(${a} AS DOUBLE PRECISION) * CAST(${b} AS DOUBLE PRECISION))`;
	const saa = `SUM(CAST(${a} AS DOUBLE PRECISION) * CAST(${a} AS DOUBLE PRECISION))`;
	const sbb = `SUM(CAST(${b} AS DOUBLE PRECISION) * CAST(${b} AS DOUBLE PRECISION))`;
	const num = `(${N} * ${sab} - ${sa} * ${sb})`;
	const den = `SQRT((${N} * ${saa} - ${sa} * ${sa}) * (${N} * ${sbb} - ${sb} * ${sb}))`;
	// `NULLIF` guards against zero-variance columns producing NaN.
	return `(${num}) / NULLIF(${den}, 0)`;
}

export function readCorrelationRow(
	row: Readonly<Record<string, unknown>> | undefined,
	keys: readonly string[],
	pairs: readonly (readonly [number, number])[],
	nKey: string,
	columnCount: number,
): { matrix: (number | null)[][]; nonNullCount: number } {
	const matrix: (number | null)[][] = [];
	for (let i = 0; i < columnCount; i++) {
		const r: (number | null)[] = [];
		for (let j = 0; j < columnCount; j++) {
			r.push(i === j ? 1 : null);
		}
		matrix.push(r);
	}
	for (let k = 0; k < keys.length; k++) {
		const [i, j] = pairs[k]!;
		const raw = row?.[keys[k]!];
		const v = numericFromRaw(raw);
		matrix[i]![j] = v;
		matrix[j]![i] = v;
	}
	const nonNullCount = numericFromRaw(row?.[nKey]) ?? 0;
	return { matrix, nonNullCount };
}

// ---------------------------------------------------------------------------
// Outliers (Phase 0.5) -- compile helpers used by tool-level glue
// ---------------------------------------------------------------------------

export const OUTLIER_THRESHOLD_DEFAULTS = { iqr: 1.5, zscore: 3 } as const;
export const OUTLIER_EXAMPLES_DEFAULT = 20;
export const OUTLIER_EXAMPLES_MAX = 50;

export function clampOutlierExamples(n: number | undefined): number {
	if (typeof n !== 'number' || !Number.isFinite(n)) return OUTLIER_EXAMPLES_DEFAULT;
	return Math.min(Math.max(1, Math.floor(n)), OUTLIER_EXAMPLES_MAX);
}

export function outlierThreshold(request: OutlierRequest): number {
	if (typeof request.threshold === 'number' && Number.isFinite(request.threshold) && request.threshold > 0) {
		return request.threshold;
	}
	return OUTLIER_THRESHOLD_DEFAULTS[request.method];
}

/**
 * Build the bounds-discovery aggregate for an outlier query. IQR
 * needs three percentiles + count; zscore needs avg + stddev + count.
 */
export function outlierBoundsRequest(request: OutlierRequest): AggregateRequest {
	const aggregations: AggregateSpec[] =
		request.method === 'iqr'
			? [
				{ column: request.column, function: 'percentile', args: { p: 0.25 } },
				{ column: request.column, function: 'percentile', args: { p: 0.50 } },
				{ column: request.column, function: 'percentile', args: { p: 0.75 } },
				{ column: request.column, function: 'count_non_null' },
			]
			: [
				{ column: request.column, function: 'avg' },
				{ column: request.column, function: 'stddev' },
				{ column: request.column, function: 'count_non_null' },
			];
	const out: { aggregations: AggregateSpec[]; where?: readonly WhereClause[] } = { aggregations };
	if (request.where !== undefined && request.where.length > 0) out.where = request.where;
	return out as AggregateRequest;
}

/**
 * Compile the outlier-counts query: number of values below `lower`
 * and above `upper`. One round-trip; two scalar results.
 */
export function compileOutlierCounts(
	target: string,
	request: OutlierRequest,
	lower: number,
	upper: number,
	knownColumns: readonly string[],
	dialect: Dialect,
	{ asTableExpr, paramStartIndex = 1 }: { asTableExpr?: string; paramStartIndex?: number } = {},
): CompiledHistogram {
	const columnSet = new Set(knownColumns.map(c => c.toLowerCase()));
	if (!columnSet.has(request.column.toLowerCase())) {
		throw new Error(`data-driver: unknown column '${request.column}' in outliers`);
	}
	const colSql = dialect.quoteIdent(request.column);
	const fromClause = asTableExpr !== undefined ? asTableExpr : quoteTarget(target, dialect);
	const where = compileWhere(request.where ?? [], knownColumns, dialect, paramStartIndex);
	const guardedWhere = where.text === ''
		? `WHERE ${colSql} IS NOT NULL`
		: `${where.text} AND ${colSql} IS NOT NULL`;
	const text =
		`SELECT` +
		`  SUM(CASE WHEN ${colSql} < ${literal(lower, dialect)} THEN 1 ELSE 0 END) AS below_count,` +
		`  SUM(CASE WHEN ${colSql} > ${literal(upper, dialect)} THEN 1 ELSE 0 END) AS above_count` +
		` FROM ${fromClause} ${guardedWhere}`;
	if (looksLikeMutation(text)) {
		throw new Error('data-driver: refused suspicious SQL in compileOutlierCounts');
	}
	return { text, values: where.values };
}

/**
 * Compile the example-collection sample query: up to `examples`
 * outlier values + their side. Uses LIMIT (or TOP for MSSQL); ordered
 * by absolute deviation from the bounds so the most extreme values
 * surface first.
 */
export function compileOutlierExamples(
	target: string,
	request: OutlierRequest,
	lower: number,
	upper: number,
	knownColumns: readonly string[],
	dialect: Dialect,
	{ asTableExpr, paramStartIndex = 1 }: { asTableExpr?: string; paramStartIndex?: number } = {},
): CompiledHistogram {
	const columnSet = new Set(knownColumns.map(c => c.toLowerCase()));
	if (!columnSet.has(request.column.toLowerCase())) {
		throw new Error(`data-driver: unknown column '${request.column}' in outliers`);
	}
	const colSql = dialect.quoteIdent(request.column);
	const fromClause = asTableExpr !== undefined ? asTableExpr : quoteTarget(target, dialect);
	const examples = clampOutlierExamples(request.examples);
	const where = compileWhere(request.where ?? [], knownColumns, dialect, paramStartIndex);
	const outlierPred = `(${colSql} < ${literal(lower, dialect)} OR ${colSql} > ${literal(upper, dialect)})`;
	const guardedWhere = where.text === ''
		? `WHERE ${colSql} IS NOT NULL AND ${outlierPred}`
		: `${where.text} AND ${colSql} IS NOT NULL AND ${outlierPred}`;
	// Order by extremity; pick the values furthest outside the bounds.
	const orderExpr =
		`CASE WHEN ${colSql} < ${literal(lower, dialect)} THEN ${literal(lower, dialect)} - ${colSql}` +
		` ELSE ${colSql} - ${literal(upper, dialect)} END`;
	const topClause = dialect === MSSQL_DIALECT ? ` TOP ${examples}` : '';
	const tailLimit = dialect === MSSQL_DIALECT ? '' : ' ' + dialect.limitClause(examples);
	const text =
		`SELECT${topClause} ${colSql} AS value, ` +
		`  CASE WHEN ${colSql} < ${literal(lower, dialect)} THEN 'below' ELSE 'above' END AS side` +
		` FROM ${fromClause} ${guardedWhere}` +
		` ORDER BY ${orderExpr} DESC${tailLimit}`;
	if (looksLikeMutation(text)) {
		throw new Error('data-driver: refused suspicious SQL in compileOutlierExamples');
	}
	return { text, values: where.values };
}

export function readOutlierCountsRow(row: Readonly<Record<string, unknown>> | undefined): { below: number; above: number } {
	const below = numericFromRaw(row?.['below_count'] ?? row?.['BELOW_COUNT'] ?? row?.['Below_count']) ?? 0;
	const above = numericFromRaw(row?.['above_count'] ?? row?.['ABOVE_COUNT'] ?? row?.['Above_count']) ?? 0;
	return { below, above };
}

export function readOutlierExampleRows(
	rows: readonly Readonly<Record<string, unknown>>[],
): { value: number; side: 'below' | 'above' }[] {
	const out: { value: number; side: 'below' | 'above' }[] = [];
	for (const r of rows) {
		const v = numericFromRaw(r['value'] ?? r['VALUE'] ?? r['Value']);
		const side = String(r['side'] ?? r['SIDE'] ?? r['Side'] ?? '');
		if (v === null) continue;
		if (side !== 'below' && side !== 'above') continue;
		out.push({ value: v, side });
	}
	return out;
}

// ---------------------------------------------------------------------------
// Functional dependency (Phase 5c.3) -- per-(from, to) grouped check
// ---------------------------------------------------------------------------

const FD_VIOLATIONS_DEFAULT = 3;
const FD_VIOLATIONS_MAX = 20;
const FD_TO_SAMPLE_LIMIT = 5;

export function clampFdViolations(n: number | undefined): number {
	if (typeof n !== 'number' || !Number.isFinite(n)) return FD_VIOLATIONS_DEFAULT;
	return Math.min(Math.max(1, Math.floor(n)), FD_VIOLATIONS_MAX);
}

/**
 * Build the stats SQL (1 row, columns total_groups / consistent_groups
 * / informative_groups / max_distinct_to / avg_distinct_to). This SQL
 * shape is portable: GROUP BY + COUNT(DISTINCT) + a SUM(CASE...) wrap.
 */
export function compileFdStats(
	target: string,
	request: FunctionalDependencyRequest,
	knownColumns: readonly string[],
	dialect: Dialect,
	{ paramStartIndex = 1 }: { paramStartIndex?: number } = {},
): { text: string; values: readonly unknown[] } {
	const columnSet = new Set(knownColumns.map(c => c.toLowerCase()));
	if (!columnSet.has(request.fromColumn.toLowerCase())) {
		throw new Error(`data-driver: unknown column '${request.fromColumn}' in functional-dependency`);
	}
	if (!columnSet.has(request.toColumn.toLowerCase())) {
		throw new Error(`data-driver: unknown column '${request.toColumn}' in functional-dependency`);
	}
	const fromSql = dialect.quoteIdent(request.fromColumn);
	const toSql = dialect.quoteIdent(request.toColumn);
	const targetSql = quoteTarget(target, dialect);
	const where = compileWhere(request.where ?? [], knownColumns, dialect, paramStartIndex);
	const fromNotNull = `${fromSql} IS NOT NULL`;
	const innerWhere = where.text === ''
		? `WHERE ${fromNotNull}`
		: `${where.text} AND ${fromNotNull}`;
	const text =
		`SELECT COUNT(*) AS total_groups,` +
		`  SUM(CASE WHEN distinct_to = 1 THEN 1 ELSE 0 END) AS consistent_groups,` +
		`  SUM(CASE WHEN group_size >= 2 THEN 1 ELSE 0 END) AS informative_groups,` +
		`  COALESCE(MAX(distinct_to), 0) AS max_distinct_to,` +
		`  COALESCE(AVG(CAST(distinct_to AS DOUBLE PRECISION)), 0) AS avg_distinct_to` +
		` FROM (SELECT ${fromSql} AS from_v, COUNT(*) AS group_size, COUNT(DISTINCT ${toSql}) AS distinct_to` +
		`        FROM ${targetSql} ${innerWhere}` +
		`        GROUP BY ${fromSql}) AS gd`;
	if (looksLikeMutation(text)) {
		throw new Error('data-driver: refused suspicious SQL in compileFdStats');
	}
	return { text, values: where.values };
}

/**
 * Build the violations SQL: top-N (from_v, distinct_to) where the
 * group has > 1 distinct to-value. Caller fetches per-violation
 * to-samples in a follow-up.
 */
export function compileFdViolations(
	target: string,
	request: FunctionalDependencyRequest,
	limit: number,
	knownColumns: readonly string[],
	dialect: Dialect,
	{ paramStartIndex = 1 }: { paramStartIndex?: number } = {},
): { text: string; values: readonly unknown[] } {
	const fromSql = dialect.quoteIdent(request.fromColumn);
	const toSql = dialect.quoteIdent(request.toColumn);
	const targetSql = quoteTarget(target, dialect);
	const where = compileWhere(request.where ?? [], knownColumns, dialect, paramStartIndex);
	const fromNotNull = `${fromSql} IS NOT NULL`;
	const innerWhere = where.text === ''
		? `WHERE ${fromNotNull}`
		: `${where.text} AND ${fromNotNull}`;
	const topClause = dialect === MSSQL_DIALECT ? ` TOP ${limit}` : '';
	const tailLimit = dialect === MSSQL_DIALECT ? '' : ' ' + dialect.limitClause(limit);
	const text =
		`SELECT${topClause} from_v, distinct_to FROM (` +
		`SELECT ${fromSql} AS from_v, COUNT(DISTINCT ${toSql}) AS distinct_to` +
		` FROM ${targetSql} ${innerWhere}` +
		` GROUP BY ${fromSql} HAVING COUNT(DISTINCT ${toSql}) > 1` +
		`) v ORDER BY distinct_to DESC, from_v ASC${tailLimit}`;
	if (looksLikeMutation(text)) {
		throw new Error('data-driver: refused suspicious SQL in compileFdViolations');
	}
	return { text, values: where.values };
}

/**
 * Build the per-violation to-sample SQL: up to FD_TO_SAMPLE_LIMIT
 * distinct to-values for one specific from-value. Caller binds the
 * from-value at the first parameter slot.
 */
export function compileFdToSample(
	target: string,
	request: FunctionalDependencyRequest,
	knownColumns: readonly string[],
	dialect: Dialect,
	{ paramStartIndex = 1 }: { paramStartIndex?: number } = {},
): { text: string } {
	const fromSql = dialect.quoteIdent(request.fromColumn);
	const toSql = dialect.quoteIdent(request.toColumn);
	const targetSql = quoteTarget(target, dialect);
	void knownColumns;
	const topClause = dialect === MSSQL_DIALECT ? ` TOP ${FD_TO_SAMPLE_LIMIT}` : '';
	const tailLimit = dialect === MSSQL_DIALECT ? '' : ' ' + dialect.limitClause(FD_TO_SAMPLE_LIMIT);
	const text =
		`SELECT${topClause} DISTINCT ${toSql} AS to_v FROM ${targetSql}` +
		` WHERE ${fromSql} = ${dialect.placeholder(paramStartIndex)}${tailLimit}`;
	if (looksLikeMutation(text)) {
		throw new Error('data-driver: refused suspicious SQL in compileFdToSample');
	}
	return { text };
}

export interface FdOrchestratorDeps {
	readonly target: string;
	readonly knownColumns: readonly string[];
	readonly dialect: Dialect;
	readonly runRows: (sql: string, values: readonly unknown[]) => Promise<readonly Readonly<Record<string, unknown>>[]>;
}

export async function executeFunctionalDependency(
	request: FunctionalDependencyRequest,
	deps: FdOrchestratorDeps,
): Promise<FunctionalDependencyResult> {
	const violationsLimit = clampFdViolations(request.topViolations);
	const stats = compileFdStats(deps.target, request, deps.knownColumns, deps.dialect);
	const statsRows = await deps.runRows(stats.text, stats.values);
	const statsRow = statsRows[0] ?? {};
	const totalGroups = numericFromRaw(statsRow['total_groups'] ?? statsRow['TOTAL_GROUPS']) ?? 0;
	const consistentGroups = numericFromRaw(statsRow['consistent_groups'] ?? statsRow['CONSISTENT_GROUPS']) ?? 0;
	const informativeGroups = numericFromRaw(statsRow['informative_groups'] ?? statsRow['INFORMATIVE_GROUPS']) ?? 0;
	const maxDistinctTo = numericFromRaw(statsRow['max_distinct_to'] ?? statsRow['MAX_DISTINCT_TO']) ?? 0;
	const avgDistinctTo = numericFromRaw(statsRow['avg_distinct_to'] ?? statsRow['AVG_DISTINCT_TO']) ?? 0;
	const determinationScore = totalGroups > 0 ? consistentGroups / totalGroups : 0;

	const topViolations: { fromValue: unknown; distinctToCount: number; toSample: unknown[] }[] = [];
	if (totalGroups > consistentGroups) {
		const vSql = compileFdViolations(deps.target, request, violationsLimit, deps.knownColumns, deps.dialect);
		const vRows = await deps.runRows(vSql.text, vSql.values);
		const violations: { fromValue: unknown; distinctToCount: number }[] = [];
		for (const r of vRows) {
			const fromValue = r['from_v'] ?? r['FROM_V'] ?? null;
			const distinctToCount = numericFromRaw(r['distinct_to'] ?? r['DISTINCT_TO']) ?? 0;
			violations.push({ fromValue, distinctToCount });
		}
		const sampleSql = compileFdToSample(deps.target, request, deps.knownColumns, deps.dialect);
		for (const v of violations) {
			const toRows = await deps.runRows(sampleSql.text, [v.fromValue]);
			const toSample = toRows.map(r => r['to_v'] ?? r['TO_V'] ?? null);
			topViolations.push({
				fromValue: v.fromValue,
				distinctToCount: v.distinctToCount,
				toSample,
			});
		}
	}

	return {
		target: deps.target,
		fromColumn: request.fromColumn,
		toColumn: request.toColumn,
		totalGroups, consistentGroups, informativeGroups,
		maxDistinctTo, avgDistinctTo,
		determinationScore,
		topViolations,
	};
}

// ---------------------------------------------------------------------------
// Anti-join (Phase 5c.5) -- exact full-table orphan count via NOT EXISTS
// ---------------------------------------------------------------------------

const ANTI_JOIN_EXAMPLES_DEFAULT = 5;
const ANTI_JOIN_EXAMPLES_MAX = 50;

export function clampAntiJoinExamples(n: number | undefined): number {
	if (typeof n !== 'number' || !Number.isFinite(n)) return ANTI_JOIN_EXAMPLES_DEFAULT;
	return Math.min(Math.max(0, Math.floor(n)), ANTI_JOIN_EXAMPLES_MAX);
}

/**
 * Build the orphan-count SQL: number of distinct left-side values
 * with no match on the right side. NULLs on the left are excluded
 * (a NULL FK isn't an orphan -- it's an unknown).
 *
 * Uses NOT EXISTS rather than NOT IN: NOT EXISTS is universally
 * portable, doesn't materialise the right side as a subquery, and
 * lets the optimizer use the right column's index directly. NULL
 * semantics on the right side don't poison the result the way NOT IN
 * does (NOT IN returns UNKNOWN -> false for every left row when the
 * right side contains a single NULL).
 */
export function compileAntiJoinCount(
	request: AntiJoinRequest,
	leftKnownColumns: readonly string[],
	rightKnownColumns: readonly string[],
	dialect: Dialect,
): { text: string; values: readonly unknown[] } {
	const leftCols = new Set(leftKnownColumns.map(c => c.toLowerCase()));
	const rightCols = new Set(rightKnownColumns.map(c => c.toLowerCase()));
	if (!leftCols.has(request.leftColumn.toLowerCase())) {
		throw new Error(`data-driver: unknown column '${request.leftColumn}' in anti-join (left)`);
	}
	if (!rightCols.has(request.rightColumn.toLowerCase())) {
		throw new Error(`data-driver: unknown column '${request.rightColumn}' in anti-join (right)`);
	}
	const leftSql = quoteTarget(request.leftTarget, dialect);
	const rightSql = quoteTarget(request.rightTarget, dialect);
	const leftCol = dialect.quoteIdent(request.leftColumn);
	const rightCol = dialect.quoteIdent(request.rightColumn);
	const text =
		`SELECT COUNT(*) AS orphan_count FROM (` +
		`SELECT DISTINCT ${leftCol} AS v FROM ${leftSql} WHERE ${leftCol} IS NOT NULL` +
		`) o WHERE NOT EXISTS (SELECT 1 FROM ${rightSql} r WHERE r.${rightCol} = o.v)`;
	if (looksLikeMutation(text)) {
		throw new Error('data-driver: refused suspicious SQL in compileAntiJoinCount');
	}
	return { text, values: [] };
}

/**
 * Build the orphan-examples SQL: up to N distinct left-side values
 * that have no match on the right side. Same NOT EXISTS shape as
 * compileAntiJoinCount but returns the values themselves.
 */
export function compileAntiJoinExamples(
	request: AntiJoinRequest,
	limit: number,
	leftKnownColumns: readonly string[],
	rightKnownColumns: readonly string[],
	dialect: Dialect,
): { text: string; values: readonly unknown[] } {
	void leftKnownColumns; void rightKnownColumns;
	const leftSql = quoteTarget(request.leftTarget, dialect);
	const rightSql = quoteTarget(request.rightTarget, dialect);
	const leftCol = dialect.quoteIdent(request.leftColumn);
	const rightCol = dialect.quoteIdent(request.rightColumn);
	const topClause = dialect === MSSQL_DIALECT ? ` TOP ${limit}` : '';
	const tailLimit = dialect === MSSQL_DIALECT ? '' : ' ' + dialect.limitClause(limit);
	const text =
		`SELECT${topClause} v FROM (` +
		`SELECT DISTINCT ${leftCol} AS v FROM ${leftSql} WHERE ${leftCol} IS NOT NULL` +
		`) o WHERE NOT EXISTS (SELECT 1 FROM ${rightSql} r WHERE r.${rightCol} = o.v)` +
		` ORDER BY v${tailLimit}`;
	if (looksLikeMutation(text)) {
		throw new Error('data-driver: refused suspicious SQL in compileAntiJoinExamples');
	}
	return { text, values: [] };
}

export interface AntiJoinOrchestratorDeps {
	readonly dialect: Dialect;
	readonly describe: (target: string) => Promise<{ readonly columns: readonly { readonly name: string }[] }>;
	readonly runRows: (sql: string, values: readonly unknown[]) => Promise<readonly Readonly<Record<string, unknown>>[]>;
}

export async function executeAntiJoin(
	request: AntiJoinRequest,
	deps: AntiJoinOrchestratorDeps,
): Promise<AntiJoinResult> {
	const examplesLimit = clampAntiJoinExamples(request.exampleLimit);
	const [leftSchema, rightSchema] = await Promise.all([
		deps.describe(request.leftTarget),
		deps.describe(request.rightTarget),
	]);
	const leftCols = leftSchema.columns.map(c => c.name);
	const rightCols = rightSchema.columns.map(c => c.name);
	const countSql = compileAntiJoinCount(request, leftCols, rightCols, deps.dialect);
	const countRows = await deps.runRows(countSql.text, countSql.values);
	const orphanCount = numericFromRaw(countRows[0]?.['orphan_count'] ?? countRows[0]?.['ORPHAN_COUNT']) ?? 0;

	let examples: unknown[] = [];
	if (orphanCount > 0 && examplesLimit > 0) {
		const exSql = compileAntiJoinExamples(request, examplesLimit, leftCols, rightCols, deps.dialect);
		const exRows = await deps.runRows(exSql.text, exSql.values);
		examples = exRows.map(r => r['v'] ?? r['V'] ?? null);
	}

	return {
		leftTarget: request.leftTarget,
		leftColumn: request.leftColumn,
		rightTarget: request.rightTarget,
		rightColumn: request.rightColumn,
		orphanCount,
		examples,
	};
}

// ---------------------------------------------------------------------------
// Driver-side orchestrators: thin wrappers around the compile helpers
// each driver wires through its own row-runner. Keeps every driver's
// histogram() / correlationMatrix() / outliers() impl one line of glue.
// ---------------------------------------------------------------------------

/**
 * Coerce an aggregate value (which may be number / string / null after
 * the type-aware widening for temporal min / max) to `number | null`.
 * Use this from any callsite that needs the value as a JS number --
 * histogram bounds, outlier bounds, etc. Strings that don't parse as
 * finite numbers come back as null.
 */
const ISO_TEMPORAL_RE =
	/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function looksLikeIsoTemporal(s: string): boolean {
	return ISO_TEMPORAL_RE.test(s);
}

export function asNumericValue(v: number | string | null | undefined): number | null {
	if (v === null || v === undefined) return null;
	if (typeof v === 'number') return Number.isFinite(v) ? v : null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function buildOrchestratorOptions(deps: OrchestratorDeps): { asTableExpr?: string; paramStartIndex?: number } {
	const out: { asTableExpr?: string; paramStartIndex?: number } = {};
	if (deps.asTableExpr !== undefined) out.asTableExpr = deps.asTableExpr;
	if (deps.paramStartIndex !== undefined) out.paramStartIndex = deps.paramStartIndex;
	return out;
}

export interface OrchestratorDeps {
	readonly target: string;
	readonly knownColumns: readonly string[];
	readonly dialect: Dialect;
	readonly aggregate: (req: AggregateRequest) => Promise<AggregateResult>;
	readonly runRows: (sql: string, values: readonly unknown[]) => Promise<readonly Readonly<Record<string, unknown>>[]>;
	readonly asTableExpr?: string;
	readonly paramStartIndex?: number;
}

export async function executeHistogram(
	request: HistogramRequest,
	deps: OrchestratorDeps,
): Promise<HistogramResult> {
	const buckets = clampHistogramBuckets(request.buckets);
	const mode: HistogramMode = request.mode ?? 'equal-width';

	const boundsResult = await deps.aggregate(histogramBoundsRequest(request));
	const lower = asNumericValue(boundsResult.values[`${request.column}__min`]);
	const upper = asNumericValue(boundsResult.values[`${request.column}__max`]);
	const nonNullCount = asNumericValue(boundsResult.values[`${request.column}__count_non_null`]) ?? 0;
	const totalCount = asNumericValue(boundsResult.values['*__count']) ?? nonNullCount;
	const nullCount = Math.max(0, totalCount - nonNullCount);

	if (lower === null || upper === null || nonNullCount === 0) {
		return {
			target: deps.target, column: request.column, mode,
			bounds: { lower, upper },
			buckets: [],
			nonNullCount, nullCount,
		};
	}

	const compiled = compileHistogramBuckets(
		deps.target, { ...request, buckets }, lower, upper, deps.knownColumns, deps.dialect,
		buildOrchestratorOptions(deps),
	);
	const rows = await deps.runRows(compiled.text, compiled.values);
	const out = readHistogramRows(rows, lower, upper, buckets, mode);
	return {
		target: deps.target, column: request.column, mode,
		bounds: { lower, upper },
		buckets: out,
		nonNullCount, nullCount,
	};
}

export async function executeCorrelationMatrix(
	request: CorrelationMatrixRequest,
	deps: OrchestratorDeps,
): Promise<CorrelationMatrixResult> {
	const method: CorrelationMethod = request.method ?? 'pearson';
	const compiled = compileCorrelationMatrix(
		deps.target, request, deps.knownColumns, deps.dialect,
		buildOrchestratorOptions(deps),
	);
	const rows = await deps.runRows(compiled.text, compiled.values);
	const row = rows[0];
	const { matrix, nonNullCount } = readCorrelationRow(row, compiled.keys, compiled.pairs, compiled.nKey, request.columns.length);
	return {
		target: deps.target,
		columns: request.columns,
		method,
		nonNullCount,
		matrix,
	};
}

export async function executeOutliers(
	request: OutlierRequest,
	deps: OrchestratorDeps,
): Promise<OutlierResult> {
	const threshold = outlierThreshold(request);
	const boundsResult = await deps.aggregate(outlierBoundsRequest(request));
	const v = boundsResult.values;
	const nonNullCount = asNumericValue(v[`${request.column}__count_non_null`]) ?? 0;

	let center: number | null;
	let spread: number | null;
	let lower: number | null;
	let upper: number | null;
	if (request.method === 'iqr') {
		const q1 = asNumericValue(v[`${request.column}__percentile_0_25`]);
		const q2 = asNumericValue(v[`${request.column}__percentile_0_5`]);
		const q3 = asNumericValue(v[`${request.column}__percentile_0_75`]);
		center = q2;
		spread = q1 !== null && q3 !== null ? q3 - q1 : null;
		if (q1 !== null && q3 !== null && spread !== null) {
			lower = q1 - threshold * spread;
			upper = q3 + threshold * spread;
		} else { lower = null; upper = null; }
	} else {
		const mean = asNumericValue(v[`${request.column}__avg`]);
		const sd = asNumericValue(v[`${request.column}__stddev`]);
		center = mean;
		spread = sd;
		if (mean !== null && sd !== null && sd > 0) {
			lower = mean - threshold * sd;
			upper = mean + threshold * sd;
		} else { lower = null; upper = null; }
	}

	if (lower === null || upper === null || nonNullCount === 0) {
		return {
			target: deps.target, column: request.column, method: request.method, threshold,
			nonNullCount, lowerBound: lower, upperBound: upper,
			belowCount: 0, aboveCount: 0, outlierCount: 0,
			center, spread, examples: [],
		};
	}

	const countsCompiled = compileOutlierCounts(
		deps.target, request, lower, upper, deps.knownColumns, deps.dialect,
		buildOrchestratorOptions(deps),
	);
	const exCompiled = compileOutlierExamples(
		deps.target, request, lower, upper, deps.knownColumns, deps.dialect,
		buildOrchestratorOptions(deps),
	);

	const [countRows, exRows] = await Promise.all([
		deps.runRows(countsCompiled.text, countsCompiled.values),
		deps.runRows(exCompiled.text, exCompiled.values),
	]);
	const counts = readOutlierCountsRow(countRows[0]);
	const examples = readOutlierExampleRows(exRows);

	return {
		target: deps.target, column: request.column, method: request.method, threshold,
		nonNullCount,
		lowerBound: lower, upperBound: upper,
		belowCount: counts.below, aboveCount: counts.above,
		outlierCount: counts.below + counts.above,
		center, spread,
		examples,
	};
}

// ---------------------------------------------------------------------------
// Temporal trend (Phase 5g.1 substrate)
// ---------------------------------------------------------------------------

/**
 * Build the SQL for a temporal-trend regression query. Two paths
 * branch on `dialect.supportsNativeRegr`:
 *
 *   - Native path (Postgres / DuckDB / Oracle): single-row SELECT
 *     using `REGR_SLOPE(y, x)` etc. directly.
 *   - Expression path (MySQL / SQLite / MSSQL / ClickHouse): single-
 *     row SELECT returning N + sum(x) + sum(y) + sum(x*x) + sum(y*y)
 *     + sum(x*y) + min(x) + max(x); the orchestrator computes slope /
 *     intercept / r² from those moments in JS.
 *
 * In both paths X is the timestamp column converted to epoch-seconds
 * via `dialect.epochExpr`.
 */
export interface CompiledTemporalTrend {
	readonly text: string;
	readonly values: readonly unknown[];
	/** True when the SQL emits direct REGR_* aggregates; false when it
	 *  emits the SUM-based moments for JS-side computation. */
	readonly native: boolean;
}

export function compileTemporalTrend(
	target: string,
	request: TemporalTrendRequest,
	knownColumns: readonly string[],
	dialect: Dialect,
	opts?: { asTableExpr?: string; paramStartIndex?: number },
): CompiledTemporalTrend {
	const tsCol = quoteAndValidateColumn(request.timestampColumn, knownColumns, dialect);
	const yCol  = quoteAndValidateColumn(request.valueColumn,    knownColumns, dialect);
	const xExpr = dialect.epochExpr(tsCol);
	const tableExpr = opts?.asTableExpr ?? quoteTarget(target, dialect);
	const startIdx = opts?.paramStartIndex ?? 1;
	const where = compileWhere(request.where ?? [], knownColumns, dialect, startIdx);
	const whereClause = where.text === '' ? '' : ` ${where.text}`;

	const text = dialect.supportsNativeRegr
		? buildNativeRegrSql(yCol, xExpr, tableExpr, whereClause)
		: buildExpressionRegrSql(yCol, xExpr, tableExpr, whereClause);

	if (looksLikeMutation(text)) {
		throw new Error(`data-driver: refused suspicious SQL: ${text}`);
	}
	return { text, values: where.values, native: dialect.supportsNativeRegr };
}

function quoteAndValidateColumn(name: string, known: readonly string[], dialect: Dialect): string {
	if (!known.map(c => c.toLowerCase()).includes(name.toLowerCase())) {
		throw new Error(`data-driver: unknown column '${name}' in temporalTrend request`);
	}
	return dialect.quoteIdent(name);
}

function buildNativeRegrSql(yCol: string, xExpr: string, quotedTarget: string, whereClause: string): string {
	return [
		'SELECT',
		`  REGR_SLOPE(${yCol}, ${xExpr})     AS slope,`,
		`  REGR_INTERCEPT(${yCol}, ${xExpr}) AS intercept,`,
		`  REGR_R2(${yCol}, ${xExpr})        AS r2,`,
		`  REGR_COUNT(${yCol}, ${xExpr})     AS n,`,
		`  MIN(CASE WHEN ${yCol} IS NOT NULL AND ${xExpr} IS NOT NULL THEN ${xExpr} END) AS min_x,`,
		`  MAX(CASE WHEN ${yCol} IS NOT NULL AND ${xExpr} IS NOT NULL THEN ${xExpr} END) AS max_x`,
		`FROM ${quotedTarget}${whereClause}`,
	].join(' ');
}

function buildExpressionRegrSql(yCol: string, xExpr: string, quotedTarget: string, whereClause: string): string {
	// `x*y` (and the other products) are NULL when either side is NULL,
	// so SUM ignores them naturally -- but we wrap the linear sums in
	// a CASE so SUM(x), SUM(y), SUM(x*x), SUM(y*y) are also restricted
	// to the pair-non-null subset (otherwise SUM(x) would include rows
	// where x is non-null but y is null, giving inconsistent moments).
	const pair = `${yCol} IS NOT NULL AND ${xExpr} IS NOT NULL`;
	return [
		'SELECT',
		`  SUM(CASE WHEN ${pair} THEN 1 ELSE 0 END)                  AS n,`,
		`  SUM(CASE WHEN ${pair} THEN ${xExpr}                  END) AS sx,`,
		`  SUM(CASE WHEN ${pair} THEN ${yCol}                   END) AS sy,`,
		`  SUM(CASE WHEN ${pair} THEN ${xExpr} * ${xExpr}       END) AS sxx,`,
		`  SUM(CASE WHEN ${pair} THEN ${yCol} * ${yCol}         END) AS syy,`,
		`  SUM(CASE WHEN ${pair} THEN ${xExpr} * ${yCol}        END) AS sxy,`,
		`  MIN(CASE WHEN ${pair} THEN ${xExpr}                  END) AS min_x,`,
		`  MAX(CASE WHEN ${pair} THEN ${xExpr}                  END) AS max_x`,
		`FROM ${quotedTarget}${whereClause}`,
	].join(' ');
}

/**
 * Build a TemporalTrendResult from one row of the engine's response.
 * Branches on `native`: native rows have slope/intercept/r²/n
 * directly; expression rows have the SUM moments and we compute
 * slope/intercept/r² in JS.
 */
export function readTemporalTrendRow(
	row: Readonly<Record<string, unknown>> | undefined,
	target: string,
	timestampColumn: string,
	valueColumn: string,
	native: boolean,
): TemporalTrendResult {
	if (row === undefined) {
		return {
			target, timestampColumn, valueColumn,
			n: 0, slope: null, slopePerDay: null,
			intercept: null, r2: null,
			minTimestampEpoch: null, maxTimestampEpoch: null,
		};
	}

	const minX = asNumericValue(row['min_x'] as number | string | null | undefined);
	const maxX = asNumericValue(row['max_x'] as number | string | null | undefined);

	if (native) {
		const slope     = asNumericValue(row['slope']     as number | string | null | undefined);
		const intercept = asNumericValue(row['intercept'] as number | string | null | undefined);
		const r2        = asNumericValue(row['r2']        as number | string | null | undefined);
		const n         = Math.max(0, Math.floor(asNumericValue(row['n'] as number | string | null | undefined) ?? 0));
		return {
			target, timestampColumn, valueColumn,
			n,
			slope,
			slopePerDay: slope !== null ? slope * 86400 : null,
			intercept, r2,
			minTimestampEpoch: minX, maxTimestampEpoch: maxX,
		};
	}

	const n   = Math.max(0, Math.floor(asNumericValue(row['n']   as number | string | null | undefined) ?? 0));
	const sx  = asNumericValue(row['sx']  as number | string | null | undefined);
	const sy  = asNumericValue(row['sy']  as number | string | null | undefined);
	const sxx = asNumericValue(row['sxx'] as number | string | null | undefined);
	const syy = asNumericValue(row['syy'] as number | string | null | undefined);
	const sxy = asNumericValue(row['sxy'] as number | string | null | undefined);

	if (n < 2 || sx === null || sy === null || sxx === null || syy === null || sxy === null) {
		return {
			target, timestampColumn, valueColumn,
			n,
			slope: null, slopePerDay: null,
			intercept: null, r2: null,
			minTimestampEpoch: minX, maxTimestampEpoch: maxX,
		};
	}

	// Sxx, Sxy, Syy in centred form for numerical stability.
	const Sxx = sxx - (sx * sx) / n;
	const Syy = syy - (sy * sy) / n;
	const Sxy = sxy - (sx * sy) / n;

	let slope: number | null;
	let intercept: number | null;
	let r2: number | null;
	if (Sxx > 0) {
		slope     = Sxy / Sxx;
		intercept = (sy - slope * sx) / n;
		r2        = Syy > 0 ? (Sxy * Sxy) / (Sxx * Syy) : null;
	} else {
		// Zero variance in X: regression slope is undefined.
		slope = null;
		intercept = null;
		r2 = null;
	}

	return {
		target, timestampColumn, valueColumn,
		n,
		slope,
		slopePerDay: slope !== null ? slope * 86400 : null,
		intercept, r2,
		minTimestampEpoch: minX, maxTimestampEpoch: maxX,
	};
}

export interface TemporalTrendOrchestratorDeps extends OrchestratorDeps {
	readonly request: TemporalTrendRequest;
}

export async function executeTemporalTrend(
	deps: TemporalTrendOrchestratorDeps,
): Promise<TemporalTrendResult> {
	const compiled = compileTemporalTrend(
		deps.target,
		deps.request,
		deps.knownColumns,
		deps.dialect,
		buildOrchestratorOptions(deps),
	);
	const rows = await deps.runRows(compiled.text, compiled.values);
	return readTemporalTrendRow(
		rows[0],
		deps.target,
		deps.request.timestampColumn,
		deps.request.valueColumn,
		compiled.native,
	);
}

// ---------------------------------------------------------------------------
// Dickey-Fuller stationarity test (Phase 5g.3 substrate)
// ---------------------------------------------------------------------------

/**
 * Build the SQL for a Dickey-Fuller test: regress Δy[t] = α + β·y[t-1] + ε
 * via a CTE that materialises (y, y_lag1) pairs through the LAG
 * window function. Returns a single row with n + the six SUM moments
 * needed to derive β + SE(β) + t-statistic in JS.
 *
 * Universally supported on every modern dialect with CTE + LAG
 * (PG / DuckDB / MySQL 8+ / SQLite >=3.25 / MSSQL / Oracle).
 * ClickHouse uses different window-function syntax; left undefined
 * there.
 */
export function compileDickeyFuller(
	target: string,
	request: DickeyFullerRequest,
	knownColumns: readonly string[],
	dialect: Dialect,
	opts?: { asTableExpr?: string; paramStartIndex?: number },
): { readonly text: string; readonly values: readonly unknown[] } {
	const yCol  = quoteAndValidateColumn(request.valueColumn,     knownColumns, dialect);
	const tsCol = quoteAndValidateColumn(request.timestampColumn, knownColumns, dialect);
	const tableExpr = opts?.asTableExpr ?? quoteTarget(target, dialect);
	const startIdx = opts?.paramStartIndex ?? 1;
	const where = compileWhere(request.where ?? [], knownColumns, dialect, startIdx);
	const whereClause = where.text === '' ? '' : ` ${where.text}`;
	const pair = `y_lag1 IS NOT NULL AND y IS NOT NULL`;
	const text = [
		`WITH lagged AS (`,
		`  SELECT ${yCol} AS y, LAG(${yCol}) OVER (ORDER BY ${tsCol}) AS y_lag1`,
		`  FROM ${tableExpr}${whereClause}`,
		`)`,
		'SELECT',
		`  SUM(CASE WHEN ${pair} THEN 1 ELSE 0 END)              AS n,`,
		`  SUM(CASE WHEN ${pair} THEN y_lag1                END) AS sx,`,
		`  SUM(CASE WHEN ${pair} THEN (y - y_lag1)          END) AS sy,`,
		`  SUM(CASE WHEN ${pair} THEN y_lag1 * y_lag1       END) AS sxx,`,
		`  SUM(CASE WHEN ${pair} THEN (y - y_lag1)*(y - y_lag1) END) AS syy,`,
		`  SUM(CASE WHEN ${pair} THEN y_lag1 * (y - y_lag1) END) AS sxy`,
		'FROM lagged',
	].join(' ');
	if (looksLikeMutation(text)) {
		throw new Error(`data-driver: refused suspicious SQL: ${text}`);
	}
	return { text, values: where.values };
}

export function readDickeyFullerRow(
	row: Readonly<Record<string, unknown>> | undefined,
	target: string,
	valueColumn: string,
	timestampColumn: string,
): DickeyFullerResult {
	if (row === undefined) {
		return { target, valueColumn, timestampColumn, n: 0, beta: null, seBeta: null, tStat: null, sxx: null, ssRes: null };
	}
	const n   = Math.max(0, Math.floor(asNumericValue(row['n']   as number | string | null | undefined) ?? 0));
	const sx  = asNumericValue(row['sx']  as number | string | null | undefined);
	const sy  = asNumericValue(row['sy']  as number | string | null | undefined);
	const sxx = asNumericValue(row['sxx'] as number | string | null | undefined);
	const syy = asNumericValue(row['syy'] as number | string | null | undefined);
	const sxy = asNumericValue(row['sxy'] as number | string | null | undefined);
	if (n < 3 || sx === null || sy === null || sxx === null || syy === null || sxy === null) {
		return { target, valueColumn, timestampColumn, n, beta: null, seBeta: null, tStat: null, sxx: null, ssRes: null };
	}
	const Sxx = sxx - (sx * sx) / n;
	const Syy = syy - (sy * sy) / n;
	const Sxy = sxy - (sx * sy) / n;
	if (Sxx <= 0) {
		return { target, valueColumn, timestampColumn, n, beta: null, seBeta: null, tStat: null, sxx: 0, ssRes: null };
	}
	const beta = Sxy / Sxx;
	const ssRes = Math.max(0, Syy - beta * Sxy);
	if (n < 3) {
		return { target, valueColumn, timestampColumn, n, beta, seBeta: null, tStat: null, sxx: Sxx, ssRes };
	}
	const sigma2 = ssRes / (n - 2);
	const seBeta = sigma2 > 0 ? Math.sqrt(sigma2) / Math.sqrt(Sxx) : null;
	const tStat  = seBeta !== null && seBeta > 0 ? beta / seBeta : null;
	return { target, valueColumn, timestampColumn, n, beta, seBeta, tStat, sxx: Sxx, ssRes };
}

export interface DickeyFullerOrchestratorDeps extends OrchestratorDeps {
	readonly request: DickeyFullerRequest;
}

export async function executeDickeyFuller(
	deps: DickeyFullerOrchestratorDeps,
): Promise<DickeyFullerResult> {
	const compiled = compileDickeyFuller(
		deps.target,
		deps.request,
		deps.knownColumns,
		deps.dialect,
		buildOrchestratorOptions(deps),
	);
	const rows = await deps.runRows(compiled.text, compiled.values);
	return readDickeyFullerRow(rows[0], deps.target, deps.request.valueColumn, deps.request.timestampColumn);
}

// ---------------------------------------------------------------------------
// Temporal gap statistics (Phase 5g.4 substrate)
// ---------------------------------------------------------------------------

/**
 * Two-phase protocol for gap stats:
 *
 *   1. compileGapStatsBaseline: returns a CTE-based SELECT that
 *      aggregates the per-row consecutive deltas into n_deltas +
 *      median_delta + min_epoch + max_epoch.
 *
 *   2. compileGapStatsBuckets: with the median known, count regular
 *      deltas (within ±50% of median) and gap deltas (> gapRatio ×
 *      median). Pulls the top-N gap deltas as rows.
 *
 * Median uses PERCENTILE_CONT(0.5) WITHIN GROUP, which is supported
 * on Postgres / DuckDB / Oracle / SQLite >=3.25 / MSSQL 2017+ /
 * MySQL 8+.
 */
export interface CompiledGapStatsBaseline {
	readonly text: string;
	readonly values: readonly unknown[];
}

export function compileGapStatsBaseline(
	target: string,
	request: TemporalGapStatsRequest,
	knownColumns: readonly string[],
	dialect: Dialect,
	opts?: { asTableExpr?: string; paramStartIndex?: number },
): CompiledGapStatsBaseline {
	const tsCol = quoteAndValidateColumn(request.timestampColumn, knownColumns, dialect);
	const tsExpr = dialect.epochExpr(tsCol);
	const tableExpr = opts?.asTableExpr ?? quoteTarget(target, dialect);
	const startIdx = opts?.paramStartIndex ?? 1;
	const where = compileWhere(request.where ?? [], knownColumns, dialect, startIdx);
	// Always exclude null timestamps from the source set (the LAG
	// would otherwise produce noise).
	const whereCombined = where.text === ''
		? `WHERE ${tsCol} IS NOT NULL`
		: `${where.text} AND ${tsCol} IS NOT NULL`;
	// Use SUM(CASE WHEN ...) instead of COUNT(*) FILTER -- the latter
	// is PG/DuckDB-specific. PERCENTILE_CONT(...) WITHIN GROUP is
	// supported on every shipped dialect that already passes the
	// existing `percentile` aggregate function (PG / DuckDB / Oracle /
	// MySQL 8+ / SQLite >=3.25 / MSSQL 2017+).
	const text = [
		`WITH ordered AS (`,
		`  SELECT ${tsExpr} AS ts_epoch,`,
		`         LAG(${tsExpr}) OVER (ORDER BY ${tsCol}) AS prev_epoch`,
		`  FROM ${tableExpr} ${whereCombined}`,
		`)`,
		'SELECT',
		'  SUM(CASE WHEN prev_epoch IS NOT NULL THEN 1 ELSE 0 END) AS n_deltas,',
		'  COUNT(*) AS n_total,',
		'  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (ts_epoch - prev_epoch)) AS median_delta,',
		'  MIN(ts_epoch) AS min_epoch,',
		'  MAX(ts_epoch) AS max_epoch',
		'FROM ordered',
	].join(' ');
	if (looksLikeMutation(text)) {
		throw new Error(`data-driver: refused suspicious SQL: ${text}`);
	}
	return { text, values: where.values };
}

export interface CompiledGapStatsBuckets {
	readonly countsSql: string;
	readonly countsValues: readonly unknown[];
	readonly topGapsSql: string;
	readonly topGapsValues: readonly unknown[];
}

export function compileGapStatsBuckets(
	target: string,
	request: TemporalGapStatsRequest,
	knownColumns: readonly string[],
	dialect: Dialect,
	median: number,
	gapRatio: number,
	topN: number,
	opts?: { asTableExpr?: string; paramStartIndex?: number },
): CompiledGapStatsBuckets {
	const tsCol = quoteAndValidateColumn(request.timestampColumn, knownColumns, dialect);
	const tsExpr = dialect.epochExpr(tsCol);
	const tableExpr = opts?.asTableExpr ?? quoteTarget(target, dialect);
	const startIdx = opts?.paramStartIndex ?? 1;
	const where = compileWhere(request.where ?? [], knownColumns, dialect, startIdx);
	const whereCombined = where.text === ''
		? `WHERE ${tsCol} IS NOT NULL`
		: `${where.text} AND ${tsCol} IS NOT NULL`;
	const lowerRegular = median * 0.5;
	const upperRegular = median * 1.5;
	const gapThreshold = median * gapRatio;
	// Counts query: regular deltas (within ±50% of median) +
	// gap deltas (> gapRatio * median). All literals interpolated
	// since they're caller-controlled numerics validated upstream.
	const countsSql = [
		`WITH ordered AS (`,
		`  SELECT ${tsExpr} AS ts_epoch, LAG(${tsExpr}) OVER (ORDER BY ${tsCol}) AS prev_epoch`,
		`  FROM ${tableExpr} ${whereCombined}`,
		`),`,
		'deltas AS (',
		'  SELECT ts_epoch - prev_epoch AS d FROM ordered WHERE prev_epoch IS NOT NULL',
		')',
		'SELECT',
		`  SUM(CASE WHEN d >= ${lowerRegular} AND d <= ${upperRegular} THEN 1 ELSE 0 END) AS regular_count,`,
		`  SUM(CASE WHEN d >  ${gapThreshold} THEN 1 ELSE 0 END) AS gap_count,`,
		'  COUNT(*) AS total_deltas',
		'FROM deltas',
	].join(' ');
	const topGapsSql = [
		`WITH ordered AS (`,
		`  SELECT ${tsExpr} AS ts_epoch, LAG(${tsExpr}) OVER (ORDER BY ${tsCol}) AS prev_epoch`,
		`  FROM ${tableExpr} ${whereCombined}`,
		`)`,
		'SELECT prev_epoch AS from_epoch, ts_epoch AS to_epoch, (ts_epoch - prev_epoch) AS delta_seconds',
		`FROM ordered`,
		`WHERE prev_epoch IS NOT NULL AND (ts_epoch - prev_epoch) > ${gapThreshold}`,
		`ORDER BY (ts_epoch - prev_epoch) DESC`,
		dialect.limitClause(topN),
	].filter(s => s !== '').join(' ');
	if (looksLikeMutation(countsSql) || looksLikeMutation(topGapsSql)) {
		throw new Error('data-driver: refused suspicious gap-stats SQL');
	}
	return {
		countsSql,
		countsValues: where.values,
		topGapsSql,
		topGapsValues: where.values,
	};
}

export interface TemporalGapStatsOrchestratorDeps extends OrchestratorDeps {
	readonly request: TemporalGapStatsRequest;
}

export async function executeTemporalGapStats(
	deps: TemporalGapStatsOrchestratorDeps,
): Promise<TemporalGapStatsResult> {
	const request = deps.request;
	const gapRatio = typeof request.gapRatio === 'number' && request.gapRatio > 1 ? request.gapRatio : 2;
	const topN = Math.min(Math.max(1, Math.floor(typeof request.topGaps === 'number' ? request.topGaps : 10)), 50);

	// Phase 1: baseline.
	const baseline = compileGapStatsBaseline(
		deps.target, request, deps.knownColumns, deps.dialect, buildOrchestratorOptions(deps),
	);
	const baselineRows = await deps.runRows(baseline.text, baseline.values);
	const b = baselineRows[0];
	const nTotal = Math.max(0, Math.floor(asNumericValue(b?.['n_total']  as number | string | null | undefined) ?? 0));
	const nDeltas = Math.max(0, Math.floor(asNumericValue(b?.['n_deltas'] as number | string | null | undefined) ?? 0));
	const median  = asNumericValue(b?.['median_delta'] as number | string | null | undefined);
	const minEpoch = asNumericValue(b?.['min_epoch']  as number | string | null | undefined);
	const maxEpoch = asNumericValue(b?.['max_epoch']  as number | string | null | undefined);

	if (median === null || median <= 0 || nDeltas === 0) {
		return {
			target: deps.target,
			timestampColumn: request.timestampColumn,
			n: nTotal,
			medianDeltaSeconds: median,
			regularityScore: null,
			gapCount: 0,
			topGaps: [],
			minTimestampEpoch: minEpoch,
			maxTimestampEpoch: maxEpoch,
		};
	}

	// Phase 2: bucket counts + top gaps.
	const buckets = compileGapStatsBuckets(
		deps.target, request, deps.knownColumns, deps.dialect,
		median, gapRatio, topN, buildOrchestratorOptions(deps),
	);
	const [countsRows, topRows] = await Promise.all([
		deps.runRows(buckets.countsSql,  buckets.countsValues),
		deps.runRows(buckets.topGapsSql, buckets.topGapsValues),
	]);
	const c = countsRows[0];
	const regular = asNumericValue(c?.['regular_count'] as number | string | null | undefined) ?? 0;
	const total   = asNumericValue(c?.['total_deltas']  as number | string | null | undefined) ?? 0;
	const gaps    = Math.max(0, Math.floor(asNumericValue(c?.['gap_count'] as number | string | null | undefined) ?? 0));
	const regularityScore = total > 0 ? regular / total : null;

	const topGaps: TemporalGapEntry[] = topRows.map(r => ({
		fromEpoch:    asNumericValue(r['from_epoch']    as number | string | null | undefined) ?? 0,
		toEpoch:      asNumericValue(r['to_epoch']      as number | string | null | undefined) ?? 0,
		deltaSeconds: asNumericValue(r['delta_seconds'] as number | string | null | undefined) ?? 0,
		ratio: ((asNumericValue(r['delta_seconds'] as number | string | null | undefined) ?? 0) / median),
	}));

	return {
		target: deps.target,
		timestampColumn: request.timestampColumn,
		n: nTotal,
		medianDeltaSeconds: median,
		regularityScore,
		gapCount: gaps,
		topGaps,
		minTimestampEpoch: minEpoch,
		maxTimestampEpoch: maxEpoch,
	};
}

// ---------------------------------------------------------------------------
// Wall-clock timeout wrapper
// ---------------------------------------------------------------------------

/**
 * Races `op` against a timeout. On timeout, attempts `onTimeout()`
 * to abort the underlying client call cleanly.
 */
export async function withTimeout<T>(
	op: Promise<T>,
	timeoutMs: number,
	onTimeout?: () => void,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			if (onTimeout !== undefined) {
				try { onTimeout(); } catch { /* best-effort */ }
			}
			reject(new Error(`data-driver: query timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});
	try {
		return await Promise.race([op, timeout]);
	} finally {
		if (timer !== undefined) { clearTimeout(timer); }
	}
}
