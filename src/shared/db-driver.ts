/**
 * Data-driver family interfaces -- shared between daemon + browser.
 *
 * Three families, three operation shapes. A `kind` (open string) maps
 * to exactly one family; drivers self-register with the daemon on boot.
 *
 * See `plans/data-driver.md` for the full shape rationale.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type DriverFamily = 'rdbms' | 'kv' | 'file';

/**
 * Per-connection config as stored in
 * ~/.insrc/<repoId>/db-connections.json.
 *
 * `kind` is an open string -- unknown kinds reject at load time.
 * `family` is derived from the registered driver for `kind` unless
 * the user pins it explicitly (e.g. forcing MongoDB into the `kv`
 * family even though the driver registers as `kv` by default).
 */
export interface ConnectionConfig {
	readonly id: string;
	readonly kind: string;
	readonly family?: DriverFamily;
	readonly label?: string;
	/** RDBMS + KV: connection URL. May contain `${secret:<ref>}` for
	 *  password-redacted form; the daemon resolves these via keystore
	 *  before building the driver. */
	readonly url?: string;
	/** File kinds: repo-relative path. */
	readonly path?: string;
	/** Keychain reference. Set by the setup UX on save; the daemon
	 *  resolves `url`'s `${secret:<ref>}` token against this ref. */
	readonly secretRef?: string;
	/** RDBMS-only. Optional schema source; defaults to live
	 *  introspection. */
	readonly schemaSource?: {
		readonly type: 'prisma';
		readonly path: string;
	};
	/** KV-only. Restricts `scan` / `sample_shape` to whitelisted
	 *  patterns / prefixes. */
	readonly namespace?: {
		readonly allow: readonly string[];
	};
	/** Per-connection PII masking -- replaces matched fields with
	 *  sha256 hashes in tool results. */
	readonly pii?: readonly string[];
	/** Kind-specific extras (e.g. CSV delimiter, Cassandra
	 *  keyspace + contactPoints, fixed-width column spec). */
	readonly options?: Readonly<Record<string, unknown>>;
	/** File kinds, directory-as-table support
	 *  (plans/data-driver-duckdb-files.md Phase 4.2). When `path`
	 *  points at a directory and `recursive` is true, the driver
	 *  globs the whole subtree; when false (default), only files
	 *  directly under `path` participate. Ignored for single-file
	 *  connections. */
	readonly recursive?: boolean;
	/** File kinds, directory-as-table support
	 *  (plans/data-driver-duckdb-files.md Phase 4.3). When set to
	 *  `'hive'`, the driver passes `hive_partitioning=true` to
	 *  DuckDB readers so `<key>=<value>/` directory components
	 *  surface as columns. Default `'none'`. Ignored for single-file
	 *  connections. */
	readonly partitioning?: 'hive' | 'none';
	/**
	 * Session-scoped ephemeral connection. Set by the data-analyzer
	 * (and future siblings) when registering a one-off local file the
	 * user referenced in their prompt -- so they don't have to go
	 * through the Data Sources pane for every ad-hoc file.
	 *
	 * Ephemeral connections:
	 *   - live in the pool's in-memory entries map only (NOT written
	 *     to db-connections.json),
	 *   - survive `pool.reload()` -- the prune pass skips them so a
	 *     concurrent Data Sources edit doesn't drop the analyzer's
	 *     ephemeral entries mid-run,
	 *   - are visible to `db_list_connections` like any other entry,
	 *   - are auto-approved by the connection-approval gate (the
	 *     user just typed the path; explicit consent).
	 */
	readonly ephemeral?: boolean;
}

export interface ConnectionsFile {
	readonly connections: readonly ConnectionConfig[];
}

// ---------------------------------------------------------------------------
// Shared result shapes (carried back to the tool layer)
// ---------------------------------------------------------------------------

export interface ColumnDescription {
	readonly name: string;
	readonly type: string;
	readonly nullable?: boolean;
	readonly primaryKey?: boolean;
	readonly foreignKey?: { readonly table: string; readonly column: string };
}

export interface SchemaDescription {
	readonly target: string;
	readonly columns: readonly ColumnDescription[];
	/** Where the schema came from: `'introspect'` for live catalog
	 *  queries, `'prisma'` for parsed schema.prisma, `'header'` for
	 *  binary formats (Avro / Arrow / Parquet / xlsx), `'inferred'`
	 *  for text formats sampled to build the schema. */
	readonly source: 'introspect' | 'prisma' | 'header' | 'inferred';
}

/**
 * How a sample was actually produced. Set by the driver; informs the
 * caller about the bias profile of the result independently of what
 * `strategy` was requested. See `plans/data-driver.md` §7.2.
 */
export type SamplingMethod =
	/** Deterministic top-N (today's only behaviour). */
	| 'first'
	/** True uniform random over rows -- e.g. Postgres `ORDER BY random()`,
	 *  reservoir over a streamed file. */
	| 'row-uniform'
	/** Page / block sampled -- biased toward dense pages. ClickHouse
	 *  `SAMPLE 0.0X`, Postgres `TABLESAMPLE BERNOULLI`. */
	| 'page-uniform'
	/** Cassandra K-anchor scattered random. K independent token
	 *  anchors, M token-adjacent rows per anchor. */
	| 'token-multi-anchor'
	/** File random-index seek -- Parquet, Arrow, fixed-width. */
	| 'index-direct'
	/** Engine-native opaque sampler -- MongoDB `$sample`, DynamoDB
	 *  `Scan` + shuffle. */
	| 'engine-native';

export interface SampleResultMetadata {
	/** Always set -- honest signal about how the rows were produced. */
	readonly samplingMethod: SamplingMethod;
	/** Echoed when the caller passed `seed`. */
	readonly seed?: number;
	/** Present when the caller passed `seed`; signals whether the
	 *  underlying engine honoured it. Drivers that can't seed return
	 *  `false` here so tests / reproducibility checks can detect it. */
	readonly seedHonored?: boolean;
	/** Set when the requested strategy was downgraded at driver-init
	 *  time (Cassandra ByteOrderedPartitioner, ClickHouse no-`SAMPLE BY`)
	 *  -- distinct from per-call timeout, which surfaces as an error. */
	readonly fallbackFrom?: SampleStrategy;
	readonly fallbackReason?: string;
	/** Sample returned fewer rows than `limit` (source size, empty
	 *  token range, etc.) -- distinct from `truncated`, which means
	 *  more rows existed than were returned. */
	readonly shortResult?: boolean;

	// Multi-anchor specifics (Cassandra `token-multi-anchor`).
	readonly anchors?: number;
	readonly rowsPerAnchor?: number;

	// File-format extras populated by binary-format drivers.
	readonly fileSize?: number;
	readonly rowCountHint?: number | `>=${number}`;
	readonly schemaSource?: 'header' | 'sample' | 'config';
}

export interface SampleResult {
	readonly target: string;
	readonly columns: readonly string[];
	readonly rows: readonly Readonly<Record<string, unknown>>[];
	readonly rowCountHint?: number | `>=${number}`;
	readonly truncated: boolean;
	readonly metadata: SampleResultMetadata;
}

export interface WhereClause {
	readonly column: string;
	readonly op: '=' | '!=' | 'in' | 'is null' | 'is not null' | '<' | '<=' | '>' | '>=' | 'between' | 'like' | 'not like' | 'regex' | 'not regex';
	/** Literal value (or array for `in` / 2-tuple for `between`).
	 *  Mutually exclusive with `valueColumn`. */
	readonly value?: unknown;
	/** Phase 0.1.x: compare to another column instead of a literal.
	 *  Supported on the comparison ops (`= != < <= > >=`); ignored
	 *  for `in` / `is null` / `is not null` / `between` / `like` / `regex`. */
	readonly valueColumn?: string;
}

export type SampleStrategy = 'first' | 'random' | 'stratified';

export interface SampleOpts {
	readonly limit: number;
	readonly where?: readonly WhereClause[];
	/** Defaults to `'first'` (existing behaviour). `'stratified'`
	 *  requires `stratifyBy` to be set. */
	readonly strategy?: SampleStrategy;
	/** Required when `strategy === 'stratified'`; rejected otherwise. */
	readonly stratifyBy?: string;
	/** Optional. Per-engine honouring varies (see §7.6) -- drivers that
	 *  can't seed echo it back via `metadata.seedHonored = false`. */
	readonly seed?: number;
}

export interface ScanOpts {
	readonly pattern?: string;
	readonly prefix?: string;
	readonly limit: number;
}

export interface KeyList {
	readonly keys: readonly (string | Readonly<Record<string, unknown>>)[];
	readonly truncated: boolean;
}

export interface KvValue {
	readonly key: string | Readonly<Record<string, unknown>>;
	readonly value: unknown;
	readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'binary' | 'null';
}

export interface ShapeReport {
	readonly sampleSize: number;
	readonly fields: readonly {
		readonly path: string;
		readonly types: readonly string[];
		readonly nullable: boolean;
		readonly frequency: number;
	}[];
}

/** Placeholder. Full shape lands in phase 3.2 alongside
 *  `db.sql.explain`. */
export interface QueryAst {
	readonly kind: 'select';
	readonly target: string;
	readonly where?: readonly WhereClause[];
}

/** Placeholder mirror of QueryAst. */
export interface PlanResult {
	readonly plan: string;
}

// ---------------------------------------------------------------------------
// Aggregation (Phase 0.1 of plans/analyzers/data-analyzer-skills.md)
// ---------------------------------------------------------------------------

/**
 * Functions a driver may be asked to compute server-side. The skill /
 * tool layer never invents these client-side -- the LLM produces a
 * structured request, the driver compiles to SQL, the engine returns
 * numbers. This is the "no-hallucinated-numbers" boundary.
 */
export type AggregateFunction =
	| 'count'             // COUNT(*)
	| 'count_non_null'    // COUNT(<col>)
	| 'count_where'       // SUM(CASE WHEN <args.predicate> THEN 1 ELSE 0 END)
	| 'distinct_count'    // COUNT(DISTINCT <col>)
	| 'composite_distinct_count'  // COUNT(DISTINCT (<args.columns>))
	| 'sum'
	| 'avg'
	| 'stddev'            // sample stddev
	| 'variance'          // sample variance
	| 'skewness'          // sample skewness (DuckDB native; others throw)
	| 'kurtosis'          // excess kurtosis (DuckDB native; others throw)
	| 'mad'               // median absolute deviation (DuckDB native; subquery on Postgres/Oracle)
	| 'min'
	| 'max'
	| 'percentile';       // requires args.p in [0, 1]

export interface AggregateSpec {
	/** Column to aggregate. Ignored by `count` (which is COUNT(*)) and
	 *  `count_where` (predicate-only); still required so the result key
	 *  is well-defined. */
	readonly column: string;
	readonly function: AggregateFunction;
	readonly args?: {
		/** Percentile fraction in [0, 1] for `function: 'percentile'`. */
		readonly p?: number;
		/** Predicate clauses for `function: 'count_where'`. Same shape
		 *  as the request-level WHERE; column refs validated against
		 *  the table's known columns. */
		readonly predicate?: readonly WhereClause[];
		/** Column list for `function: 'composite_distinct_count'`. */
		readonly columns?: readonly string[];
	};
}

export interface AggregateRequest {
	readonly aggregations: readonly AggregateSpec[];
	/**
	 * Optional structured WHERE filter (mirrors `SampleOpts.where`).
	 * Compiled via `compileWhere` in the driver layer with the same
	 * column-validation + parameterised-value safety. Lets windowed-
	 * count skills (e.g. `data.drift.volume`) constrain aggregates to
	 * a subset of rows without falling back to client-side filtering.
	 */
	readonly where?: readonly WhereClause[];
}

export interface AggregateResult {
	readonly target: string;
	/**
	 * Flat record keyed `<column>__<function>` (or
	 * `<column>__percentile_<p>` for percentile to disambiguate
	 * multiple percentile asks on the same column). Values are `null`
	 * when the underlying engine returned NULL (e.g. AVG over an
	 * empty table). For temporal `min` / `max` the result may be a
	 * string (ISO-formatted date / datetime) rather than a number.
	 */
	readonly values: Readonly<Record<string, number | string | null>>;
}

/**
 * Top-N distinct value request. Returns the most frequent values for
 * one column plus the column's overall distinct cardinality. Used by
 * `db_sql_distinct` (Phase 0.3 of plans/analyzers/data-analyzer-skills.md)
 * and the `data.source.rdbms.sample-distinct` skill.
 *
 * `topN` is clamped to [1, 1000] in the tool layer; results are
 * ordered by frequency descending, ties broken by lexicographic
 * order on the value (deterministic across re-runs, cache-friendly).
 */
export interface DistinctRequest {
	readonly column: string;
	readonly topN: number;
}

export interface DistinctResult {
	readonly target: string;
	readonly column: string;
	readonly distinctCount: number;
	readonly topValues: readonly { readonly value: unknown; readonly count: number }[];
}

// ---------------------------------------------------------------------------
// Anti-join (Phase 5c.5)
// ---------------------------------------------------------------------------

export interface AntiJoinRequest {
	readonly leftTarget: string;
	readonly leftColumn: string;
	readonly rightTarget: string;
	readonly rightColumn: string;
	/** Up to N orphan-value examples to surface (default 5, max 50). */
	readonly exampleLimit?: number;
}

export interface AntiJoinResult {
	readonly leftTarget: string;
	readonly leftColumn: string;
	readonly rightTarget: string;
	readonly rightColumn: string;
	/** Distinct left-side values that have no matching right-side value
	 *  (NULLs on the left side are excluded -- a NULL FK isn't an
	 *  orphan, it's an unknown). Exact full-table count, not a sample. */
	readonly orphanCount: number;
	/** Up to `exampleLimit` orphan values for diagnosis. */
	readonly examples: readonly unknown[];
}

// ---------------------------------------------------------------------------
// Functional dependency (Phase 5c.3)
// ---------------------------------------------------------------------------

export interface FunctionalDependencyRequest {
	readonly fromColumn: string;
	readonly toColumn: string;
	/** Default 3. */
	readonly topViolations?: number;
	readonly where?: readonly WhereClause[];
}

export interface FunctionalDependencyViolation {
	readonly fromValue: unknown;
	readonly distinctToCount: number;
	readonly toSample: readonly unknown[];
}

export interface FunctionalDependencyResult {
	readonly target: string;
	readonly fromColumn: string;
	readonly toColumn: string;
	readonly totalGroups: number;
	readonly consistentGroups: number;
	readonly informativeGroups: number;
	readonly maxDistinctTo: number;
	readonly avgDistinctTo: number;
	readonly determinationScore: number;
	readonly topViolations: readonly FunctionalDependencyViolation[];
}

// ---------------------------------------------------------------------------
// Catalog enumeration (Phase 1.1 of plans/analyzers/data-analyzer-skills.md)
// ---------------------------------------------------------------------------

export interface TableListing {
	readonly target: string;
	readonly tables: readonly {
		readonly name: string;
		readonly schema?: string;
		readonly kind: 'table' | 'view' | 'unknown';
		readonly approxRowCount?: number;
	}[];
	readonly truncated: boolean;
}

export interface IndexListing {
	readonly target: string;
	readonly indexes: readonly {
		readonly name: string;
		readonly columns: readonly string[];
		readonly unique: boolean;
		readonly primaryKey: boolean;
	}[];
}

// ---------------------------------------------------------------------------
// Histogram (Phase 0.2 of plans/analyzers/data-analyzer-skills.md)
// ---------------------------------------------------------------------------

export type HistogramMode = 'equal-width' | 'equal-frequency';

export interface HistogramRequest {
	readonly column: string;
	readonly buckets: number;
	readonly mode?: HistogramMode;
	readonly where?: readonly WhereClause[];
}

export interface HistogramBucket {
	readonly lower: number;
	readonly upper: number;
	readonly count: number;
}

export interface HistogramResult {
	readonly target: string;
	readonly column: string;
	readonly mode: HistogramMode;
	readonly bounds: { readonly lower: number | null; readonly upper: number | null };
	readonly buckets: readonly HistogramBucket[];
	readonly nonNullCount: number;
	readonly nullCount: number;
}

// ---------------------------------------------------------------------------
// Correlation matrix (Phase 0.4)
// ---------------------------------------------------------------------------

export type CorrelationMethod = 'pearson' | 'spearman';

export interface CorrelationMatrixRequest {
	readonly columns: readonly string[];
	readonly method?: CorrelationMethod;
	readonly where?: readonly WhereClause[];
}

export interface CorrelationMatrixResult {
	readonly target: string;
	readonly columns: readonly string[];
	readonly method: CorrelationMethod;
	/** Rows where every requested column is non-null (the basis for
	 *  pairwise complete-observation correlation; one number for the
	 *  whole matrix rather than per-pair). */
	readonly nonNullCount: number;
	/** N x N symmetric matrix; `null` when correlation is undefined
	 *  (constant column, fewer than 2 non-null rows). Diagonal is 1
	 *  unless the column is constant, in which case it's null. */
	readonly matrix: readonly (readonly (number | null)[])[];
}

// ---------------------------------------------------------------------------
// Outliers (Phase 0.5)
// ---------------------------------------------------------------------------

export type OutlierMethod = 'iqr' | 'zscore';

export interface OutlierRequest {
	readonly column: string;
	readonly method: OutlierMethod;
	/** IQR multiplier (default 1.5) or z-score threshold (default 3). */
	readonly threshold?: number;
	readonly where?: readonly WhereClause[];
	/** Up to 50 example values from the outlier set; default 20. */
	readonly examples?: number;
}

export interface OutlierResult {
	readonly target: string;
	readonly column: string;
	readonly method: OutlierMethod;
	readonly threshold: number;
	readonly nonNullCount: number;
	readonly lowerBound: number | null;
	readonly upperBound: number | null;
	readonly belowCount: number;
	readonly aboveCount: number;
	/** belowCount + aboveCount, computed once per request. */
	readonly outlierCount: number;
	/** Center of the distribution: `median` for IQR, `mean` for zscore. */
	readonly center: number | null;
	/** Spread: `iqr` for IQR, `stddev` for zscore. */
	readonly spread: number | null;
	readonly examples: readonly { readonly value: number; readonly side: 'below' | 'above' }[];
}

// ---------------------------------------------------------------------------
// KV namespaces (Phase 0.7 + 0.8)
// ---------------------------------------------------------------------------

export interface KvNamespace {
	readonly name: string;
	/** Optional shape hint: 'collection' (Mongo), 'table' (Cassandra,
	 *  DynamoDB), 'bucket' (NATS KV), 'prefix' (Redis SCAN-derived). */
	readonly kind?: 'collection' | 'table' | 'bucket' | 'prefix';
	/** Optional row / key count hint when the engine cheaply exposes it. */
	readonly approxCount?: number;
}

export interface KvNamespaceList {
	readonly namespaces: readonly KvNamespace[];
	readonly truncated: boolean;
	readonly supported: boolean;
}

export interface KvNamespaceDescription {
	readonly name: string;
	readonly kind?: 'collection' | 'table' | 'bucket' | 'prefix';
	/** Approximate row / key count (engine-supplied; may be `null` if
	 *  not cheaply available). */
	readonly approxCount: number | null;
	/** Sample keys (for stores with structured keys, this is the
	 *  serialised form). */
	readonly sampleKeys: readonly string[];
	/** Field-level shape inference (when value introspection is
	 *  feasible). Empty array when not applicable (raw KV stores). */
	readonly fields: readonly {
		readonly path: string;
		readonly types: readonly string[];
		readonly nullable: boolean;
		readonly frequency: number;
	}[];
	readonly supported: boolean;
}

// ---------------------------------------------------------------------------
// Temporal trend (Phase 5g.1 substrate)
// ---------------------------------------------------------------------------

export interface TemporalTrendRequest {
	/** Timestamp / temporal column used as the X axis (epoch-converted server-side). */
	readonly timestampColumn: string;
	/** Numeric column used as the Y axis. */
	readonly valueColumn: string;
	readonly where?: readonly WhereClause[];
}

export interface TemporalTrendResult {
	readonly target: string;
	readonly timestampColumn: string;
	readonly valueColumn: string;
	/** Count of rows where both timestamp and value are non-null. */
	readonly n: number;
	/** Slope per second of epoch (NULL if N < 2 or X variance is zero). */
	readonly slope: number | null;
	/** slope * 86400 -- human-readable Y change per day. */
	readonly slopePerDay: number | null;
	readonly intercept: number | null;
	readonly r2: number | null;
	readonly minTimestampEpoch: number | null;
	readonly maxTimestampEpoch: number | null;
}

// ---------------------------------------------------------------------------
// Dickey-Fuller stationarity test (Phase 5g.3 substrate)
// ---------------------------------------------------------------------------

export interface DickeyFullerRequest {
	readonly valueColumn: string;
	readonly timestampColumn: string;
	readonly where?: readonly WhereClause[];
}

export interface DickeyFullerResult {
	readonly target: string;
	readonly valueColumn: string;
	readonly timestampColumn: string;
	/** Count of (y_t, y_lag1) pairs with both sides non-null. */
	readonly n: number;
	/** Slope coefficient β in the regression Δy[t] = α + β·y[t-1] + ε. */
	readonly beta: number | null;
	/** Standard error of β. */
	readonly seBeta: number | null;
	/** t-statistic = β / SE(β). Compare to MacKinnon critical values
	 *  at the asymptotic distribution for large n. */
	readonly tStat: number | null;
	/** Centred-form Sxx (Σ(x - x̄)²). */
	readonly sxx: number | null;
	/** Sum of squared residuals from the lagged regression. */
	readonly ssRes: number | null;
}

// ---------------------------------------------------------------------------
// Temporal gap stats (Phase 5g.4 substrate)
// ---------------------------------------------------------------------------

export interface TemporalGapStatsRequest {
	readonly timestampColumn: string;
	readonly where?: readonly WhereClause[];
	/** Multiplier for "gap" detection vs median delta. Default 2. */
	readonly gapRatio?: number;
	/** How many top gaps to return. Default 10. */
	readonly topGaps?: number;
}

export interface TemporalGapEntry {
	readonly fromEpoch: number;
	readonly toEpoch: number;
	readonly deltaSeconds: number;
	readonly ratio: number;
}

export interface TemporalGapStatsResult {
	readonly target: string;
	readonly timestampColumn: string;
	/** Total non-null timestamps. */
	readonly n: number;
	/** Median consecutive delta in seconds (the inferred cadence). */
	readonly medianDeltaSeconds: number | null;
	/** Fraction of consecutive deltas within ±50% of the median. */
	readonly regularityScore: number | null;
	/** Total count of deltas exceeding gapRatio × median. */
	readonly gapCount: number;
	/** Top-N gaps by ratio descending. */
	readonly topGaps: readonly TemporalGapEntry[];
	readonly minTimestampEpoch: number | null;
	readonly maxTimestampEpoch: number | null;
}

// ---------------------------------------------------------------------------
// Driver interfaces
// ---------------------------------------------------------------------------

export interface BaseDriver {
	readonly id: string;
	readonly kind: string;
	readonly family: DriverFamily;
	close(): Promise<void>;
}

export interface RdbmsDriver extends BaseDriver {
	readonly family: 'rdbms';
	describe(target: string): Promise<SchemaDescription>;
	sample(target: string, opts: SampleOpts): Promise<SampleResult>;
	explain?(queryAst: QueryAst): Promise<PlanResult>;
	/**
	 * Compute server-side aggregations and return a flat numeric
	 * record. Drivers that cannot implement a particular function on
	 * their dialect should throw a clear error -- the tool layer
	 * surfaces it as `success: false` rather than papering over a
	 * missing primitive.
	 */
	aggregate(target: string, request: AggregateRequest): Promise<AggregateResult>;
	/**
	 * Top-N distinct values for one column plus overall distinct
	 * cardinality. Drives `data.source.rdbms.sample-distinct` and
	 * downstream Family-5 categorical-profile skills.
	 */
	distinct(target: string, request: DistinctRequest): Promise<DistinctResult>;
	/** Phase 1.1 -- enumerate tables / views (excluding system schemas).
	 *  Optional `schema` filter narrows to a single schema. */
	listTables?(opts?: { readonly schema?: string; readonly limit?: number }): Promise<TableListing>;
	/** Phase 1.1 -- list indexes on one table. */
	listIndexes?(target: string): Promise<IndexListing>;
	/** Phase 5c.3 -- full-table functional dependency check for one (from, to) pair. */
	functionalDependency?(target: string, request: FunctionalDependencyRequest): Promise<FunctionalDependencyResult>;
	/** Phase 5c.5 -- exact full-table orphan count via server-side
	 *  NOT EXISTS anti-join, plus up to N orphan examples. */
	antiJoin?(request: AntiJoinRequest): Promise<AntiJoinResult>;
	/** Phase 0.2 -- server-side histogram. */
	histogram?(target: string, request: HistogramRequest): Promise<HistogramResult>;
	/** Phase 0.4 -- pairwise correlation matrix over numeric columns. */
	correlationMatrix?(target: string, request: CorrelationMatrixRequest): Promise<CorrelationMatrixResult>;
	/** Phase 0.5 -- IQR / z-score outlier counts + examples. */
	outliers?(target: string, request: OutlierRequest): Promise<OutlierResult>;
	/** Phase 5g.1 -- server-side temporal-trend regression
	 *  (REGR_SLOPE / REGR_INTERCEPT / REGR_R2 with epoch conversion on
	 *  the timestamp column). Optional: drivers without the regression
	 *  primitives or epoch conversion can leave it undefined. */
	temporalTrend?(target: string, request: TemporalTrendRequest): Promise<TemporalTrendResult>;
	/** Phase 5g.3 -- server-side Dickey-Fuller stationarity test.
	 *  Internally uses LAG window function (CTE) + the same SUM-of-
	 *  moments regression as temporalTrend to derive β + SE(β) +
	 *  t-statistic. Drivers without LAG support leave undefined. */
	dickeyFuller?(target: string, request: DickeyFullerRequest): Promise<DickeyFullerResult>;
	/** Phase 5g.4 -- server-side temporal gap statistics: median
	 *  cadence + top-N gaps + regularity score, computed via LAG
	 *  window function over the sorted timestamp column. */
	temporalGapStats?(target: string, request: TemporalGapStatsRequest): Promise<TemporalGapStatsResult>;
}

export interface KvDriver extends BaseDriver {
	readonly family: 'kv';
	scan(opts: ScanOpts): Promise<KeyList>;
	get(key: string | Readonly<Record<string, unknown>>): Promise<KvValue>;
	sampleShape(opts: ScanOpts): Promise<ShapeReport>;
	/** Phase 0.7 -- enumerate top-level namespaces (Mongo collections,
	 *  Cassandra tables, DynamoDB tables, NATS KV buckets, Redis
	 *  scan-derived prefixes). KV stores without a namespace concept
	 *  return `{ namespaces: [], supported: false }`. */
	listNamespaces?(opts?: { readonly limit?: number }): Promise<KvNamespaceList>;
	/** Phase 0.8 -- shape + sample-keys for one namespace. */
	describeNamespace?(name: string, opts?: { readonly sampleSize?: number }): Promise<KvNamespaceDescription>;
}

export interface FileDriver extends BaseDriver {
	readonly family: 'file';
	/** Tabular file kinds (csv, tsv, jsonl, xlsx, avro, arrow, bson,
	 *  parquet, fixed-width). Target is optional for single-target
	 *  files (csv); required for multi-target files (xlsx sheets). */
	describe?(target?: string): Promise<SchemaDescription>;
	sample?(target: string | undefined, opts: SampleOpts): Promise<SampleResult>;
	/** Document file kinds (single-doc json). Also used by tabular
	 *  kinds that want to expose nested-field shape inference. */
	sampleShape?(opts: ScanOpts): Promise<ShapeReport>;
	get?(path: string): Promise<KvValue>;
	/** Optional. Tabular file kinds that route through DuckDB (parquet
	 *  today; the data-driver-duckdb-files plan unifies the rest)
	 *  expose this for Family 5 quality / distribution / dependency
	 *  skills. Other file kinds throw. */
	aggregate?(target: string | undefined, request: AggregateRequest): Promise<AggregateResult>;
	/** Optional. Same shape as the RDBMS `distinct` method; the
	 *  consolidated DuckDB-backed file driver implements it for the
	 *  file family. Other file drivers throw. */
	distinct?(target: string | undefined, request: DistinctRequest): Promise<DistinctResult>;
	/** Phase 0.2 -- server-side histogram (DuckDB-backed file driver). */
	histogram?(target: string | undefined, request: HistogramRequest): Promise<HistogramResult>;
	/** Phase 0.4 -- correlation matrix (DuckDB-backed file driver). */
	correlationMatrix?(target: string | undefined, request: CorrelationMatrixRequest): Promise<CorrelationMatrixResult>;
	/** Phase 0.5 -- outlier counts + examples (DuckDB-backed file driver). */
	outliers?(target: string | undefined, request: OutlierRequest): Promise<OutlierResult>;
	/** Phase 5g.1 -- server-side temporal-trend regression on a file
	 *  connection (DuckDB-backed; same semantics as the RDBMS variant). */
	temporalTrend?(target: string | undefined, request: TemporalTrendRequest): Promise<TemporalTrendResult>;
}

export type Driver = RdbmsDriver | KvDriver | FileDriver;

// ---------------------------------------------------------------------------
// Driver factory + registration (implemented in daemon/db/registry.ts)
// ---------------------------------------------------------------------------

/**
 * Factory builds a live, ready-to-use driver from a config entry.
 * Secrets in `config.url` have already been resolved by the pool
 * layer before the factory is called, so drivers see the raw
 * connection string.
 */
export type DriverFactory = (config: ConnectionConfig) => Promise<Driver>;

export interface DriverRegistration {
	readonly kind: string;
	readonly family: DriverFamily;
	readonly factory: DriverFactory;
}
