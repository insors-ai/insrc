# Analyze framework — Data vertical

## Target definition

A **data target**: a database connection, a file dataset (CSV / Parquet / JSON-Lines / Avro / BSON), a directory of files, a single table / view / collection, or a federated set of any of the above.

The data vertical sits on top of the surviving infrastructure:

- **`daemon/db/`** — the per-format converter cache + driver registry + DuckDB pool. Already handles BSON / Avro / fixed-width / XLSX → Parquet conversion, query routing, and source-file invalidation. **Not deleted in the cleanup** — the data vertical's primary engine.
- **`daemon/tools/builtins/db/`** + **`daemon/tools/builtins/data/`** — db queries (`db_query`, `db_schema`, `db_sample`) and data ops (`data.lineage`, schema drift). **All preserved.**
- **`daemon/db-rpc.ts`** — `db.listConnections`, `db.listDriverKinds`, `db.saveConnection`, `db.testConnection`. **All live.**
- **IDE `dbDrivers/` pane** — surfaces the connection registry. **Kept.**

## What's in scope

| Aspect | Tasks |
|---|---|
| **Schemas** | Tables / collections / file-shapes; columns / fields / nested types; primary keys, foreign keys, indexes. |
| **Distributions** | Cardinality, null rates, distinct counts, top-K, value ranges. Sampled per row-count thresholds. |
| **Relationships** | FK-declared + inferred (column-name match + value-overlap) cross-table / cross-source linkages. |
| **PII / sensitivity surface** | Column-name pattern matching + value-pattern detection (emails, phone, SSN, credit cards) + LLM-classification of free-text columns. Findings cite redacted sample values (see PII redaction section below); the context-builder itself does not redact, because the IDE is not expected to have production data access. |
| **Format conventions** | Encoding (UTF-8 / latin-1), datetime serialization, decimal precision, enum encoding, null sentinels. |
| **Lineage** | Source → destination flow within the dataset (when materialization metadata is available), and cross-connection lineage from documented joins / fk chains. |
| **Constraints** | NOT NULLs, UNIQUEs, CHECKs, indexes; their actual enforcement vs declared. |
| **Volume + growth** | Row counts; if multiple snapshots available, growth rate. |

## What's out of scope (Phase 1)

- Data quality scoring / grading
- Cleansing / remediation suggestions
- Performance / query-plan analysis
- ETL pipeline analysis (that's an **infra** target on the orchestrator's manifests, not a data target on the dataset)
- Live cross-system data reconciliation
- Privacy-policy / compliance verdicts (the PII *surface* is in scope; "is this GDPR-compliant" is not)

## Discovery strategy

The data shaper's run-level pass:

1. **Resolve scope target.** From `scopeRef.kind`:
   - `connection`     → one registered connection
   - `connection-set` → multiple connections (federated analysis)
   - `dataset-file`   → a single file / directory under a file connection
   - `table`          → one table / view / collection inside a connection
   - `dataset-glob`   → glob over file-connection sources
2. **Probe the driver.** Driver-kind specific:
   - **RDBMS** → `INFORMATION_SCHEMA` + `pg_*` / `sys.*` / sqlite `pragma` queries for table/column/index/FK listings
   - **File (CSV/Parquet/JSONL/...)** → DuckDB attach + `DESCRIBE`. Converter cache transparently handles bson/avro/xlsx/etc.
   - **Document store (MongoDB)** → sampled `aggregate` to infer schema (Mongo's no-schema reality means schema is sampled, not declared)
   - **KV (Redis / etcd / ...)** → key-pattern scan; structure is opaque so schema discovery is shallower
3. **Build the source map.** For each table / collection / file: row count (exact for ≤ 10M, estimate for more), size on disk, partition keys if any.
4. **Detect families.** Group similar shapes — same column set, same naming pattern, same partitioning convention. The family is what later structural-summary tasks pivot on.

## Template invariants (lifted from the legacy data-analyzer)

Three load-bearing rules every data template must honour. The framework's per-target template registration validates these at load time and the executor enforces them at run time.

### 1. Family preconditions

Every template declares which driver families it supports. The executor refuses to dispatch a template against an incompatible connection — no LLM call burned, hard-fail with a clear reason.

```ts
preconditions: [
  { kind: 'required-tools',     tools: ['db_sql_describe'],
    reason: 'introspection' },
  { kind: 'connection-family',  families: ['postgres', 'mysql', 'sqlite',
                                            'mssql', 'oracle', 'duckdb-file'],
    reason: 'SQL describe path' },
  { kind: 'min-sample-size',    estimator: 'percentile', band: 'medium',
    reason: 'distribution.heavy-tail-check needs n >= 200' }
]
```

The Plan Builder receives the precondition set in the catalog summary so it can avoid emitting tasks that would fail preconditions on the resolved connection. Validator invariant: a template emitted in a plan whose preconditions don't hold against the resolved connection → `INV-PRECONDITION: <template> requires <kind>, scope's connection doesn't satisfy`.

### 2. Always re-query live

Cached schema fingerprints, the connection registry, and any prior describe / sample results from the same run are **pointers / filters only**. Every template that emits a finding must call the appropriate live tool — `db_sql_describe`, `db_sql_sample`, `db_kv_describe_namespace`, `db_file_describe`, `db_file_aggregate` — against the actual connection before emitting a citation. The validator checks every emitted citation against the template's recorded tool-call trace; a citation without a corresponding live tool call in the trace → `INV-LIVE-QUERY: citation has no backing live call`.

This rule covers the most common drift mode of the legacy analyzer: the LLM seeing a stale schema and emitting findings against columns that no longer exist.

### 3. No-fabrication path on cross-target dependencies

A data template may declare cross-target template dependencies:

```ts
crossTargetDependencies: [
  { target: 'code', template: 'code.orm.resolve-model',
    failure: 'hard-fail',                          // 'hard-fail' | 'low-confidence'
    reason: 'drift.prisma-vs-live needs code-side ORM resolution' }
]
```

When a data template depends on a code template (typical case: ORM-aware drift detection, lineage walks that need code-side fielding), the framework checks the code-side template is registered in the catalog. If absent and `failure: 'hard-fail'`, the task hard-fails with `cross-target-unavailable`; the LLM never gets to invent. If `failure: 'low-confidence'`, the task runs but every output gets auto-downgraded to `confidence: 'low'` with a `crossTargetMissing: ['code.orm.resolve-model']` note.

The legacy data-analyzer's "hallucinated-class incident" was exactly this failure mode: a data-side task ran without a code-side ORM resolver, the LLM fabricated a class definition, and downstream drift detection ran against the fabrication. The hard-fail path makes that structurally impossible.

## Task template catalog

Templates live under `src/insrc/analyze/templates/data/`. Naming convention: `data.<family>.<action>`.

### Discovery family

| Template | Input | Output |
|---|---|---|
| `data.discovery.connections` | `{ scopeRef }` | `{ connections: Array<{ id, kind, label, driverKind, citations[] }> }` |
| `data.discovery.objects` | `{ connectionId, kind? }` | `{ objects: Array<{ name, kind, rowCount?, sizeBytes?, citations[] }> }` — for file connections this enumerates via `db_file_list_files` and groups identical-schema files into one "object" |
| `data.discovery.partitioning` | `{ connectionId }` | `{ partitioning: { scheme: 'hive' \| 'none', keys?, sample?, citations[] } }` — file-connection only; reads the connection profile + scans for hive-style directories |
| `data.discovery.schema-divergence` | `{ connectionId, kind: 'file' }` | `{ schemaGroups: Array<{ pathGlob, columns, fileCount, sampleFiles, citations[] }> }` — runs DuckDB schema-union over a globbed file connection; one group per shape signature |
| `data.discovery.families` | `{ scopeRef, objects }` | `{ families: Array<{ id, label, members[], pattern }> }` |

### Schema family

| Template | Input | Output |
|---|---|---|
| `data.schema.table` | `{ connectionId, table, depth }` | `{ columns: Array<{ name, type, nullable, isPK, defaultValue?, citations[] }>, indexes, fks, citations[] }` |
| `data.schema.file-shape` | `{ connectionId, path | glob, sampleRows, columns? }` | `{ shape: { type, fields }, encoding, fileCount, citations[] }` — `path` may be a glob; `columns?` enables projection pushdown on Parquet (required when `projectionRequired: 'parquet'`) |
| `data.schema.xlsx-sheets` | `{ connectionId, path }` | `{ sheets: Array<{ name, columns, rowCount, citations[] }> }` — per-sheet shape for xlsx workbooks |
| `data.schema.document` | `{ connectionId, collection, sampleSize }` | `{ shape: NestedShape, fieldStats: Array<{ path, presenceRate, types, citations[] }> }` |
| `data.schema.summary` | `{ scopeRef, families }` | `{ summary: Array<{ family, dominantColumns, divergentMembers, citations[] }> }` |

### Distribution family

| Template | Input | Output |
|---|---|---|
| `data.distribution.column-stats` | `{ connectionId, table, columns? }` | `{ stats: Array<{ column, cardinality, nullRate, topK, min?, max?, citations[] }> }` |
| `data.distribution.histograms` | `{ connectionId, table, columns }` | `{ histograms: Array<{ column, bins, citations[] }> }` |
| `data.distribution.outliers` | `{ connectionId, table, column }` | `{ outliers: Array<{ value, count, sample, citations[] }> }` |

### Relationship family

| Template | Input | Output |
|---|---|---|
| `data.relationship.fk-declared` | `{ scopeRef }` | `{ fks: Array<{ from, to, declared, citations[] }> }` |
| `data.relationship.fk-inferred` | `{ scopeRef, threshold }` | `{ candidates: Array<{ from, to, overlap, confidence, citations[] }> }` |
| `data.relationship.join-graph` | `{ scopeRef, includeInferred }` | `{ nodes, edges, citations[] }` |

### PII / sensitivity family

| Template | Input | Output |
|---|---|---|
| `data.pii.column-name-scan` | `{ scopeRef, patterns }` | `{ matches: Array<{ object, column, pattern, citations[] }> }` |
| `data.pii.value-pattern-scan` | `{ scopeRef, sampleSize }` | `{ matches: Array<{ object, column, kind, sampleRedacted, citations[] }> }` — `kind: 'email' \| 'phone' \| 'ssn' \| 'cc' \| 'address' \| 'date-of-birth'` |
| `data.pii.llm-classify-text-columns` | `{ scopeRef, columns, sampleSize }` | `{ classifications: Array<{ object, column, classification, confidence, citations[] }> }` — LLM call per column on a redacted sample; `classification: 'pii' \| 'sensitive-non-pii' \| 'free-text' \| 'identifier' \| 'public'` |
| `data.pii.surface` | `{ scopeRef }` + every upstream PII output | `{ surface: { columns: ..., byKind: ..., perObjectSummary: ... }, citations[] }` — aggregated PII view |

### Format conventions family

| Template | Input | Output |
|---|---|---|
| `data.format.encoding` | `{ scopeRef }` | `{ findings: Array<{ object, observed, citations[] }> }` |
| `data.format.datetime` | `{ scopeRef }` | `{ findings: Array<{ object, column, format, sample, citations[] }> }` |
| `data.format.enum-encoding` | `{ scopeRef }` | `{ findings: Array<{ object, column, values, kind, citations[] }> }` — `kind: 'string-set' \| 'int-set' \| 'bitfield' \| 'free-text'` |
| `data.format.null-sentinels` | `{ scopeRef }` | `{ findings: Array<{ object, column, sentinel, count, citations[] }> }` |

### Lineage family

| Template | Input | Output |
|---|---|---|
| `data.lineage.documented` | `{ scopeRef }` | `{ edges: Array<{ from, to, kind, citations[] }> }` — `kind: 'view' \| 'materialized-view' \| 'foreign-table' \| 'comment-declared'` |
| `data.lineage.via-naming` | `{ scopeRef }` | `{ candidates: Array<{ from, to, hint, citations[] }> }` — pattern-matched (e.g. `users_staging` → `users`) |
| `data.lineage.cross-system` | `{ scopeRef, joins[] }` | `{ chain, citations[] }` |

### Constraint family

| Template | Input | Output |
|---|---|---|
| `data.constraint.declared` | `{ scopeRef }` | `{ constraints: Array<{ object, kind, definition, citations[] }> }` |
| `data.constraint.observed-vs-declared` | `{ scopeRef, sampleSize }` | `{ violations: Array<{ object, constraint, count, citations[] }> }` |

### Volume family

| Template | Input | Output |
|---|---|---|
| `data.volume.row-counts` | `{ scopeRef }` | `{ counts: Array<{ object, exactOrEstimate, value, citations[] }> }` |
| `data.volume.partitioning` | `{ scopeRef }` | `{ partitioning: Array<{ object, scheme, keys, sample, citations[] }> }` |
| `data.volume.growth-rate` | `{ scopeRef, snapshots[] }` | `{ rates: Array<{ object, growthPerDay, source, citations[] }> }` |

### Aggregator (terminal)

| Template | Input | Output |
|---|---|---|
| `data.aggregate.report` | `{ scopeRef, scope, intent }` + every upstream output | `{ sections: Array<{ heading, body, citations[] }> }` |

## Citation primitives

Data citations replace the framework's generic `{ source, entity, doc }` trio with a **per-family discriminated union** (lifted from the legacy data-analyzer design — the prior implementation found that one flat citation shape fits poorly across families that address data differently). The data vertical introduces:

```ts
type DataCitation =
  | RdbmsCitation
  | KvCitation
  | FileCitation
  | DocCitation;        // 'doc' kind survives unchanged from the framework's
                        // base Citation union (vendor docs, RFC references)

interface RdbmsCitation {
  kind:        'rdbms';
  connection:  string;                  // connection id
  schema?:     string;                  // postgres / oracle / mssql
  table:       string;
  column?:     string;
  row?:        Record<string, unknown>; // sample row, redacted, ≤ 1 KB
  confidence:  'high' | 'medium' | 'low';
}

interface KvCitation {
  kind:        'kv';
  connection:  string;
  namespace?:  string;                  // database/collection (Mongo), keyspace
                                        // (Cassandra), bucket (NATS), prefix
                                        // (Redis/etcd)
  keyPattern?: string;                  // e.g. "session:*"
  fieldPath?:  string;                  // dotted path inside a JSON value
  sampleValue?: unknown;                // redacted, ≤ 1 KB
  confidence:  'high' | 'medium' | 'low';
}

interface FileCitation {
  kind:        'file';
  connection:  string;
  path?:       string;                  // logical path within the connection root,
                                        // or a glob (`**/*.parquet`) when the
                                        // claim covers a directory-as-table read
  sheet?:      string;                  // xlsx workbook sheet name; required for
                                        // citations whose backing read used a
                                        // specific sheet
  column?:     string;                  // for tabular files (CSV / Parquet / JSONL)
  jsonPath?:   string;                  // for shape-inferred document files
  rowRange?:   { start: number; end: number };  // byte-row range from the
                                                // converter cache when present
  partition?:  Record<string, string>;  // hive-partition key-value pairs the
                                        // backing read filtered on
  confidence:  'high' | 'medium' | 'low';
}

interface DocCitation {
  kind:  'doc';
  url:   string;
  anchor?: string;
}
```

**Why discriminated, not flat.** Different families address data through different primitives:

| Family | Address shape | Why |
|---|---|---|
| RDBMS | `(schema?, table, column?)` | The SQL world is hierarchical. `column?` is optional because a finding can be table-level. |
| KV    | `(namespace?, keyPattern?, fieldPath?)` | Pattern-based, not hierarchical. Document stores (Mongo, DynamoDB) carry a `namespace` + a sample-derived shape; key-value stores (Redis, etcd) carry a prefix pattern; bucket stores (NATS KV) carry just the bucket. |
| File  | `(path?, column? | jsonPath?, rowRange?)` | Path + position. Tabular files use `column`; document files use `jsonPath`. The converter cache exposes `rowRange` for BSON / Avro / XLSX → Parquet conversions. |

A typical claim:

```jsonc
{
  "claim": "public.users.email is an email column",
  "classification": "email",
  "citations": [
    {
      "kind": "rdbms", "connection": "conn:prod-db",
      "schema": "public", "table": "users", "column": "email",
      "row": { "email": "j***@example.com" },                 // redacted in storage
      "confidence": "high"
    },
    { "kind": "doc", "url": "https://datatracker.ietf.org/doc/html/rfc5322" }
  ]
}
```

### No separate LMDB sub-DB

Earlier I considered registering data entities in a parallel LMDB sub-DB so citations could be looked up the same way code-entity citations are. The legacy data-analyzer's experience overrides that: **citations validate by re-querying the live source** at the time of report rendering, not by lookup into a frozen entity table. The reasons:

1. Schemas drift. A frozen entity table goes stale between runs; a re-query against the live connection is always current.
2. The driver registry already exposes the right primitives — `db_sql_describe`, `db_sql_sample`, `db_kv_describe_namespace`, `db_file_aggregate`, etc. They're already in scope and surviving.
3. Validation cost is bounded — each citation is one cheap describe / sample call. The aggregator batches them per connection so validating a 200-citation report is a handful of round-trips, not a flood.

The framework therefore **drops the data-side entity LMDB sub-DB entirely**. Data citations are validated through the data-driver pool, period.

### Validation pipeline

For each citation in a task output:

1. **Discriminate by `kind`** to pick the validator.
2. **`rdbms`** → call `db_sql_describe(connection, schema?, table)`; assert `column?` (if present) is in the returned column list. Mark `verified: true` on the persisted citation.
3. **`kv`** → call `db_kv_describe_namespace(connection, namespace?)`; assert `keyPattern?` matches at least one key in the namespace (sampled scan, capped at 200 keys). Mark `verified: true`.
4. **`file`** → dispatch on `path` shape:
   - **Concrete file path** → check the converter cache for `(connection, path)`; if the path is present and the file's mtime hasn't changed since the converter cached it, the citation is `verified: true`. For native formats (no conversion) check the file exists + mtime matches a recorded read time. Otherwise call `db_file_describe` and validate from there.
   - **Glob path** (`**/*.parquet`, `2024/*/sales-*.csv`) → call `db_file_list_files(connection, glob)` and assert the glob resolves to at least one file. For `column` citations, run `DESCRIBE SELECT * FROM read_xxx('<glob>')` and assert the column is in the union schema.
   - **xlsx with `sheet`** → resolve to the per-sheet Parquet under the converted directory; validate as a concrete file path. xlsx without `sheet` → invalid; reject the citation as `INV-FILE-SHEET-REQUIRED`.
   - **`partition` present** → validate that the connection has `partitioning: 'hive'` and that the partition keys are present in the resolved file's parent directory structure. Mismatch → `INV-PARTITION-MISMATCH`.
5. **`doc`** → not validated by the framework. `verified: false` always (surfaced distinctly in the report).

A citation that fails validation is **not the same as a citation that's invalid** — the citation just can't be re-verified at report time. The framework records `verified: false` with a `verifyError` field (`'connection-unreachable'` / `'object-not-found'` / `'mtime-changed'` / `'pattern-no-match'`) and the report renders it as "(unverified at report time)". A claim with every citation failing validation is downgraded to `confidence: 'low'` in the aggregate; a claim with at least one verified citation passes.

### Confidence

Every citation carries a `confidence` field. This is **not** a measure of citation accuracy (that's the validator's job) — it's the LLM's stated confidence in the underlying finding given the sample size + data quality + the analysis depth it managed. The framework reads:

- **`high`** — backed by a complete describe / full-table aggregate / verified across all rows.
- **`medium`** — sampled to within a calibrated band (see Sampling-confidence library below).
- **`low`** — couldn't sample enough; or fell back from a higher-confidence path (e.g., Prisma-fast-path failed; or column-classification on text columns the LLM had to guess at).

The aggregator's final report stamps the **minimum confidence across citations supporting a claim** on the claim itself.

### Sampling-confidence library

Re-introduced from the deleted `daemon/db/sampling-confidence.ts`. Lives at `src/insrc/analyze/data/sampling-confidence.ts`. Exports:

```ts
type Estimator = 'mean' | 'percentile' | 'normality' | 'correlation';

function sampleSizeFor(
  estimator: Estimator,
  desiredConfidence: 'high' | 'medium' | 'low',
  populationSize: number | undefined,
): number;     // returns minimum n for the estimator at the chosen band

function confidenceFor(
  estimator: Estimator,
  actualN:   number,
  populationSize: number | undefined,
): 'high' | 'medium' | 'low';   // returns the band the actual sample lands in
```

The library is a pure function set — no driver coupling — so every distribution / cross-column / outlier template reads from it. Templates that ignore it and emit hard-coded confidence values are flagged by the validator with a warning (`WARN-SAMPLING: template did not call confidenceFor; confidence likely under-/over-stated`).

### PII redaction

PII sample citations are always **redacted-in-storage**: the persisted task output carries `row.email = "j***@example.com"`; the un-redacted value never lands on disk. The redaction policy is `models.analyze.data.piiRedactionPolicy` (default `redact-in-storage`). The validator rejects any citation whose `row` / `sampleValue` field appears to carry an un-redacted PII pattern → retry with explicit redaction reminder. Default patterns covered: email, phone, SSN, credit card, dates of birth, names.

## Report shape per scope bucket

### XS — single table / single file / single document

```
## <object name>

### Schema
- columns + types + nullability + keys

### Distribution
- per-column stats

### Format conventions
- encoding / datetime / nulls / enums

### Constraints (declared + observed)
- ...

### PII surface
- ...

### Relationships
- declared FKs touching this object
- inferred candidates (with confidence)

### Volume
- row count + size + partitioning
```

### S — single connection or small dataset

```
## <connection / dataset name>

### Inventory
- objects (table list)

### Schema map
- per-family schema summary

### Cross-object relationships
- FK graph (declared + inferred)

### PII surface
- by-kind summary across the connection

### Format conventions
- per-family conventions

### Volume
- per-object counts

### Per-object detail
- one section per object with full XS shape
```

### M — single DB or one IaC stack's data

```
## <connection name>

### Overview
- 1-2 paragraph summary

### Family map
- per-family one-line summary

### Per-family detail  (only families above the centrality threshold)
#### <family name>
  - representative schemas
  - relationship pattern
  - PII posture
  - volume posture

### Cross-family relationships
- ...

### Connection-level posture
- format conventions
- PII surface
- constraint enforcement
```

### L — data warehouse / multi-connection

```
## <warehouse / dataset name>

### Architecture
- connection map (how the connections relate)

### Family map across connections
- ...

### Per-connection posture
- summary per connection

### Cross-connection relationships
- documented + inferred

### Lineage topology
- where data flows

### PII surface (aggregate)
- by-kind and by-connection

### Posture summary
- volume / formats / constraints across all connections
```

### XL — federated org-wide data

```
## <federated dataset name>

### Top-level partition map
- per-partition child Plans and what they cover

### Cross-partition posture
- shared families across partitions
- cross-partition lineage

### Aggregated PII surface
- by-kind

### Child Plan reports
- <link per child Plan under tasks/<task-path>/>
```

## Worked example: S / focused

User: `insrc analyze --scope conn:prod-db "where is PII in this database?"`

Classifier:
```jsonc
{
  "target": "data",
  "scope": "S",
  "focused": true,
  "focus": "PII surface",
  "scopeRef": { "kind": "connection", "value": "conn:prod-db" }
}
```

Plan Builder:
```jsonc
{
  "goal": "Locate PII columns across prod-db tables",
  "target": "data",
  "scope": "S",
  "tasks": [
    { "taskId": "t01", "template": "data.discovery.objects", "params": { "connectionId": "conn:prod-db" }, "produces": ["objects"] },
    { "taskId": "t02", "template": "data.pii.column-name-scan", "params": { "scopeRef": ..., "patterns": "default" }, "produces": ["nameMatches"], "consumes": ["objects"] },
    { "taskId": "t03", "template": "data.pii.value-pattern-scan", "params": { "scopeRef": ..., "sampleSize": 1000 }, "produces": ["valueMatches"], "consumes": ["objects"] },
    { "taskId": "t04", "template": "data.pii.llm-classify-text-columns", "params": { "scopeRef": ..., "columns": "@t02.candidates", "sampleSize": 50 }, "consumes": ["nameMatches"], "produces": ["classifications"] },
    { "taskId": "t05", "template": "data.pii.surface", "params": { "scopeRef": ... }, "consumes": ["nameMatches", "valueMatches", "classifications"], "produces": ["surface"] },
    { "taskId": "t06", "template": "data.aggregate.report", "params": { "scopeRef": ..., "scope": "S", "intent": {...} }, "consumes": ["surface"], "produces": ["report"] }
  ]
}
```

6 tasks. The LLM classify task is the most expensive (one call per candidate text column, high-tier model). Wall-clock ~3-7 minutes depending on the column count.

## Large-dataset handling via the consolidated file driver

The surviving `DuckDBFileDriver` (designed in the legacy `plans/data-driver-duckdb-files.md`) is the framework's primary tool for handling large file datasets. Every file-family connection — csv / tsv / jsonl / ndjson / json / parquet / arrow / feather (native) and avro / bson / fixed-width / xlsx (converted) — routes through one SQL surface backed by an in-process DuckDB query pool. The data vertical's templates compose against `db_file_aggregate` / `db_file_list_files` / `db_file_describe` / `db_file_sample` uniformly across formats.

This drops three architectural concerns the legacy data-analyzer struggled with:

1. **No format-specific aggregation paths.** Distribution / correlation / outlier / quantile / window-function math runs through one SQL backend. Templates declare `connection-family: ['duckdb-file']` and pick up every file kind for free.
2. **Streaming + projection pushdown.** Multi-GB Parquet files where the query reads three columns out of forty hit only those three columns' page ranges. CSV / JSONL stream with memory bounded by DuckDB's vector size. Templates can analyze datasets much larger than RAM.
3. **Per-source-file caching.** The converter cache at `~/.insrc/cache/file-converted/<conn>/files/<rel>.parquet` is mtime-validated per source file. Changing one file in a 1000-file connection re-converts that one file; the other 999 stay cached across analyze runs.

### What this means for analyze templates

**Schema-discovery templates.** `data.schema.file-shape` for a directory-as-table connection emits one citation per discovered shape group. Schemas that converge across the tree → one `FileCitation` with `path: '<glob>'`. Schemas that diverge → multiple citations, each with the divergent `path` subset, and a `summary` field calling out the divergence. The driver surfaces this via DuckDB's schema-union error path — a divergent set is a structurally typed signal, not an LLM judgment.

**Sampling + distribution templates.** Default sample size for distribution stats (`100k` rows from the config) is **post-projection**: with Parquet column-pruning, sampling 100k rows from a 10-column Parquet pulls ~5-15% of the data the equivalent row-store would. The framework's per-template sample-size advisor (`sampling-confidence.confidenceFor`) is calibrated against post-projection counts.

**Cross-file aggregation templates.** Hive-partitioned connections (`connection.partitioning: 'hive'`) get filter pushdown for free — `WHERE region='us' AND date='2024-01-15'` only reads matching partition directories. Templates that filter on partition keys should detect partitioning from the connection profile and structure their `WHERE` clauses accordingly. The framework provides a `partitionKeysFor(connectionId)` helper that returns the discovered partition columns; templates that ignore it and scan the full tree pay the full cost.

**xlsx-specific.** One workbook → directory of per-sheet Parquets. A citation against an xlsx file must include `sheet`. Templates running against an xlsx connection without an explicit sheet selection get the union of all sheets (DuckDB's `**/*.parquet` glob across the converted directory) and emit one citation per sheet whose schema participated. Mismatched schemas across sheets surface as a structured validator error before the LLM ever sees the data.

### Memory + safety caps

The query pool has a **512 MB memory cap**. Templates that scan unbounded data hit OOM, which the driver surfaces as `connection-memory-cap`. The framework's data-side config gains two new caps to keep templates safe:

```jsonc
"data": {
  "fileScan": {
    "maxScanRowsPerCall":    5000000,    // hard `LIMIT` template templates pass
                                          // to DuckDB before any aggregation
    "maxScanSecondsPerCall": 60,          // wall-clock cap (already configured
                                          // upstream as maxConnectionSeconds)
    "projectionRequired":    "parquet"    // 'always' | 'parquet' | 'never' --
                                          // 'parquet' requires templates to
                                          // declare the columns they read
                                          // when targeting Parquet sources
                                          // (enforces projection pushdown)
  }
}
```

`projectionRequired: 'parquet'` makes the validator reject any Parquet-targeting template whose generated SQL is `SELECT *` — forcing the template prompt to enumerate which columns it actually needs. This is a meaningful accuracy + cost win on wide Parquet schemas (think: 200-column event logs where the LLM only needs `event_type` + `timestamp`).

### Convert-then-query latency

Non-native formats (avro / bson / fixed-width / xlsx) pay a **one-time conversion cost per source file**. For a 1 GB avro file the convert takes 30-90 seconds; subsequent queries are pure Parquet reads. The analyze framework's `data.discovery.objects` template lands first so the conversion is amortized across the whole run; if discovery skips a file, no conversion fires. Templates that touch a non-native file for the first time mid-run get a `cache-miss-convert` event in their tool-call trace so the run's cost surfaces clearly.

### Concurrent runs

DuckDB query pool is shared across concurrent analyze runs (and across non-analyze daemon traffic). The pool's inflight-conversion guard (per-source `Map<string, Promise>`) prevents two simultaneous conversions of the same file. Queries on different files in parallel are bounded by the pool's connection count (default 4). Practical implication: running two analyze workloads against the same big-file connection serializes through DuckDB's query queue but neither blocks indefinitely.

### What the framework does NOT do

- **DuckDB as proxy for non-file drivers.** RDBMS + KV connections continue through their native drivers (`pg`, `mysql`, `mongo`, `cassandra`, ...). The legacy plan explicitly ruled out an "ATTACH-everything-through-DuckDB" architecture for those families; the analyze framework respects that.
- **Materialize big file connections into a persistent DuckDB store.** The query pool is in-memory. Templates that need cross-run materialization (e.g., compute a feature table once, reuse across runs) write to the LMDB graph + Lance vectors (existing analyze cache layer), not to a DuckDB file.
- **External data sources via DuckDB extensions.** `httpfs` / `postgres` / `mysql` / `sqlite` extensions are locked off in the query pool (`autoinstall_known_extensions=false`). A future expansion could enable them for narrow read-only paths; today they're closed.

## Cost-control guards

Data analysis can be more expensive than code (every cardinality query against a big table is real I/O, every LLM classification is a separate call). Guards:

- **Default sampling caps** per template:
  - distribution stats: 100k rows for cardinality, 1M for top-K (with `LIMIT` + `TABLESAMPLE` when available)
  - PII value scan: 1k rows per column, max 100 columns per call
  - LLM-classify-text-columns: 50 rows per column, max 30 columns per task; planner usually emits multiple tasks if the column count is higher
- **Connection load budget** — every task's runtime is bounded by `models.analyze.data.maxConnectionSeconds` (default 60s per task). Overruns → task short-circuits with `connection-overrun` + the row count it managed to scan
- **Read-only enforcement** — every connection used in analyze runs is wrapped in a session-scoped read-only transaction (RDBMS) or read-only credentials (cloud). Configuration mandatory; analyze run aborts at startup if the connection's profile permits writes

## Failure surface

| Failure | Cause | Recovery |
|---|---|---|
| `connection-unreachable` | Driver can't open the connection | Run abort at classification; not retried |
| `permission-denied` | Read-only credentials can't access an object | Per-task: skip the object + record reason; downstream consumers see it as missing |
| `connection-overrun` | Single query exceeds maxConnectionSeconds | Task short-circuits; aggregate notes the partial completeness |
| `redaction-violation` | LLM output emitted un-redacted PII sample | Validator rejects; retry with explicit redaction reminder |
| `schema-drift-mid-run` | DDL changed between discovery and per-table tasks | Per-table fails with `dependency-unavailable`; downstream tasks adapt |

## Configuration

```jsonc
{
  "models": {
    "analyze": {
      "data": {
        "sampleSizes": {
          "distribution":    100000,
          "piiValue":        1000,
          "llmClassify":     50,
          "documentSchema":  1000
        },
        "maxConnectionSeconds":      60,
        "maxColumnsPerLLMClassify":  30,
        "piiRedactionPolicy":        "redact-in-storage",   // 'redact-in-storage' | 'hash' | 'omit'
        "piiPatterns": {                                    // overrideable regex set
          "email":  "default",
          "phone":  "default",
          "ssn":    "default",
          "cc":     "default",
          "custom": {}
        },
        "centralityFamilyTopN":      5,
        "perTemplateModelClass": {
          "data.pii.llm-classify-text-columns": "high",
          "data.aggregate.report":              "high"
        }
      }
    }
  }
}
```

## Lineage from the legacy data-analyzer

The legacy `design/analyzers/data-analyzer.html` + `plans/analyzers/data-analyzer.md` + `plans/analyzers/data-analyzer-skills.md` were deleted in the cleanup but their architectural decisions are heavily lifted here:

| Legacy concept | Survives in this design as |
|---|---|
| `DataCitation` discriminated union (`RdbmsCitation` / `KvCitation` / `FileCitation`) | Same union, extended with `DocCitation`. Drops the framework's flat data-entity-table idea. |
| `confidence: 'high' \| 'medium' \| 'low'` per citation | Same, surfaced on every emitted citation; aggregator stamps min-across-citations on each claim. |
| "Always re-query live" rule (§7.6) | Lifted verbatim as template invariant §2. |
| Per-skill `preconditions: required-tools / connection-family / min-sample-size` | Lifted as the template `preconditions` field, validator-enforced. |
| "No fabrication path" cross-owner rule (skills-plan §3) | Lifted as the `crossTargetDependencies` field with `hard-fail` / `low-confidence` failure modes. |
| Sampling-confidence library (`daemon/db/sampling-confidence.ts`) | Re-introduced under `src/insrc/analyze/data/sampling-confidence.ts`. Same API. |
| Closed read-only tool set | The framework's tool registry already enforces this (`agent/tools/validator.ts`'s closed-set check survived the cleanup). |
| Connection-approval gate | The framework's read-only-enforcement check (`models.analyze.data` mandates a read-only profile; analyze run aborts at startup if the connection's profile permits writes) covers the same surface; per-connection approval gates land if/when needed. |
| Per-task on-disk cache (`~/.insrc/cache/data-analysis/`) | Replaced by the per-Plan cache layout under `~/.insrc/analyze/<run-id>/`; cross-run reuse is via the Context Builder's per-layer content cache. |
| Per-kind tool playbook system prompts | Replaced by per-template `systemPrompt` + `userPromptBuild`, scoped to the template's narrow contract. |
| Plan-size approval gate (>16 tasks) | Subsumed by the Plan Builder's scope-bucket band enforcement (validator INV-12 / INV-13). |

What's intentionally **not** lifted:

- The legacy's two-LLM orchestrator/analyzer split (cloud-side reviewer + local-side executor). The new framework's recursive Plan Builder + planner-template tasks subsume this — review happens in the parent Plan's aggregator, deeper analysis happens by spawning child Plans.
- The legacy's "Phase 0-10" skills phasing. The new framework treats each skill family as a template family (already mirrored in the catalog above).
- The legacy's separate `dataAnalyzer.diffWithPrevious` / `dataAnalyzer.rerun` / drill-down chain. These are user-driven follow-up runs in the new framework — the user runs `insrc analyze --resume <run-id>` or starts a fresh run with a child-Plan reference. Cross-run diff lands in Phase 2 of the analyze framework alongside infra live-introspection.

## See also

- `design/analyze-framework.md` — overall framework
- `design/analyze-context-builder.md` — the `data-shaper`
- `design/analyze-plan-builder.md` — what produces the task list
- `plans/tools.md` — `db_*` + `data_*` tools the framework uses
