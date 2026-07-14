# Plan: Graph Storage Re-split -- Custom LMDB Layer + LanceDB Restore

**Design doc.** Execution-side phasing lives in
[plans/storage-migration-lmdb-lance.md](storage-migration-lmdb-lance.md).

Reverse the prior DuckDB consolidation experiment. End state:
**three substrates**, each doing what it's built for, instead of one substrate
fighting three workloads.

- **LMDB** -- code knowledge graph + repo metadata + plans + conversations +
  todos + config-store, via a thin custom Node/TypeScript layer purpose-built
  for our access pattern (point lookup + 1-hop neighbor + full transitive
  closure).
- **LanceDB** -- entity embeddings + vector search. Same library we used pre-
  consolidation; it was healthy.
- **DuckDB** -- *demoted* to the in-memory query-engine pool only (data-driver
  CSV / Parquet / JSONL attaches via `db_file_*` tools). The file-backed
  storage pool is removed.

## Why

### The DuckDB consolidation failed in production

- **148 GiB bloat.** `~/.insrc/duckdb.db` grew to 148 GiB on a single dev
  machine indexing `hadoop` (12.8k files). DuckDB has no online compaction --
  the only way to reclaim space is `EXPORT DATABASE` → `IMPORT DATABASE` into
  a fresh file, which needs another 148 GiB free to run.
- **Fatal checkpoint OOM at 2 GiB pool.** Even with `preserve_insertion_order
  = false` and periodic `CHECKPOINT` (every 100 files in
  `indexer/index.ts`), the storage pool wedged with `Failed to create
  checkpoint: Out of Memory Error: could not allocate block of size 256.0
  KiB (1.9 GiB/1.9 GiB used)`. Once invalidated, the database returned
  fatal errors on every subsequent RPC -- *not recoverable* without
  restarting the daemon. The user reports having seen this failure mode
  multiple times.
- **HNSW persistence is `experimental_persistence`.** The flag we set at
  init (`SET GLOBAL hnsw_enable_experimental_persistence = true`) is
  flagged experimental in DuckDB's own docs. Every checkpoint has to
  rewrite the in-memory HNSW search graph against the columnar pages.
  Combined with 2560-dim qwen3-embedding vectors (~10 KiB raw per vector
  + ~1.5-2x HNSW overhead), the working set blows past any reasonable
  pool cap.
- **Columnar storage is the wrong shape for graph workload.** Graph
  queries are point lookups + small writes + frequent joins (OLTP-ish).
  DuckDB is optimized for analytical scans (OLAP). Every checkpoint has
  to merge small inserts into row-group blocks AND rewrite vector index
  state -- compounding pressure on the same buffer pool.
- **No native graph storage.** The "graph" in DuckDB was just `entity` +
  `relation` tables with recursive CTEs for traversal. There's no
  variable-length path operator, no CSR / adjacency-list layout, no
  graph-aware optimizer. Multi-hop queries (transitive `DEPENDS_ON`,
  k-hop neighborhood, dead-code reachability) become N self-joins in a
  columnar engine that wasn't designed for that pattern.

### Embedded graph DB market is hostile

The natural escape hatch -- "just use a real embedded graph DB" -- doesn't
exist in any acceptable form:

| Option | Status | Blocker |
|---|---|---|
| **Kuzu** | Archived 2025-10-10 (per existing plan) | No upstream fixes; same buffer-pool incidents we tried to escape |
| **Cozo** | Last release 2023-12-11 (~2.5 years stale); pre-1.0 | Same "experimental" risk class as DuckDB-HNSW |
| **Memgraph** | Server architecture; BSL 1.1 license as of 2026-01-01 | Not embeddable; license forbids distributing it in our product |
| **Neo4j** | Server architecture; GPL/commercial dual-license | Same |
| **GraphLite / Grafeo / IndraDB / SQLiteGraph / CQLite** | All young, single-author or small-team | Same trap we just escaped |
| **pglite + Apache AGE** | pglite single-threaded; AGE-on-pglite isn't a packaged option | Two integrations at once, both us as early adopters |

The pattern: graph DBs commercialize toward server architecture and
source-available licensing; the embedded permissively-licensed open-source
space is mostly hobby projects.

### Why custom-on-LMDB is the right answer

1. **Our schema is small and fixed.** ~10 entity kinds (function, class,
   module, repo, …) + ~20 relation kinds (CALLS, IMPORTS, EXTENDS,
   IMPLEMENTS, REFERENCES, DEPENDS_ON, …). No flexible schema, no user-
   defined types. A purpose-built layer is a smaller problem than a
   general-purpose graph DB.
2. **Workload is narrow.** Point lookup by ID, 1-hop neighbor lookup,
   bulk write on re-index, full transitive closure for dead-code analysis.
   No streaming graph analytics, no distributed query, no multi-tenant.
3. **LMDB is the most boring possible substrate.** Memory-mapped, ACID,
   single-writer multi-reader (matches our daemon model exactly), used by
   OpenLDAP / Bitcoin Core / Monero / Postfix / Memgraph (yes, ironically)
   in production for ~15 years. No buffer pool to tune (OS handles paging),
   no checkpoints, no compaction. The failure modes that bit DuckDB and
   Kuzu structurally cannot happen with LMDB.
4. **Performance ceiling is much higher than SQLite.** mmap + cursor
   range-scan over packed `(from_id, kind, to_id)` keys runs at memory
   speed once warm. A 10M-edge BFS finishes in ~100ms-1s in
   well-written Node code; SQLite recursive CTEs over the same data
   would take seconds-to-minutes. Matters for the planned dead-code
   analyzer (transitive closure from entry points).
5. **Total custom code is bounded.** ~1000-1500 LOC for the storage +
   traversal layer. The algorithms (BFS, DFS, transitive closure, SCC
   for cycle detection) are textbook. The bug surface is something we
   can review end-to-end.

## Related plans

- [plans/storage-migration-lmdb-lance.md](storage-migration-lmdb-lance.md) --
  execution plan for this design (phased work, gates, sequencing). This
  doc is the *what* / *why*; the migration plan is the *how* / *when*.
- [plans/data-driver-duckdb-files.md](data-driver-duckdb-files.md) --
  unaffected. The in-memory DuckDB query-engine pool stays as-is; this
  plan only removes the *file-backed storage pool* (`duckdb-storage-pool.ts`).
- [plans/data-driver.md](data-driver.md) -- unaffected. Data-driver tool
  surface (`db_*` tools) doesn't change.
- [plans/cross-file-references.md](cross-file-references.md) -- the
  cross-file resolver was rewritten in Phase A.8 to issue DuckDB SQL.
  This plan rewrites it again to use the LMDB graph API.
- [plans/analyzers/data-analyzer-skills.md](analyzers/data-analyzer-skills.md)
  -- unaffected at the skill level. Skills hit the data-driver pool, not
  the storage pool. End-to-end smoke runs are *gated* on this plan
  landing.

## Status

Pre-implementation. The on-disk DuckDB store has been wiped (`~/.insrc/`
cleaned up by user 2026-05-05). No production data to migrate -- this is a
greenfield rebuild on a fresh substrate.

| Phase | Slice | State | Notes |
|---|---|---|---|
| 0.1 | Pick LMDB binding + version | pending | `lmdb-js` (Kris Zyp). Pin a version; verify it builds on macOS arm64 + linux x64 + linux arm64 |
| 0.2 | Vendor decision: msgpack codec | pending | Use `msgpackr` (default in `lmdb-js`); typed decoder for entity values |
| 1.1 | LMDB env + sub-DB schema scaffolding | pending | `db/graph/store.ts` -- env open, sub-DB handles, txn helpers, key codecs |
| 1.2 | ID allocator | pending | u64 sequential entity ID, u32 sequential repo ID, atomic counter in `meta` sub-DB |
| 1.3 | Entity CRUD | pending | `db/graph/entities.ts` -- get/put/delete by id; name-index lookups |
| 1.4 | Edge CRUD | pending | `db/graph/edges.ts` -- out_edges, in_edges, addEdge, removeEdge; cursor-based range scans |
| 1.5 | Re-index transaction helper | pending | `db/graph/bulk.ts` -- "replace all entities/edges originating from file F" pattern; tombstone unseen + insert new in one LMDB txn |
| 2.1 | Traversal primitives | pending | `db/graph/traversal.ts` -- BFS, DFS, transitiveClosure, SCC; reachability cache (invalidated per-file) |
| 2.2 | Search / 1-hop neighbor API parity with current | pending | `findCallers / findCallees / findDefinedIn / findImports / resolveClosure` re-implemented on LMDB; same surface as current `db/search.ts` |
| 3.1 | LanceDB restore | pending | Re-add `@lancedb/lancedb` dep; restore `db/entities.ts` Lance write path; restore `db/search.ts` vector-search path; restore `~/.insrc/lance/` directory |
| 3.2 | Conversations / config-store / todos restore | pending | Decision per table: stay on LMDB (no vectors) or restore to Lance (if vectors used). Per Phase B audit: conversations + config-store *do* use vector search; todos do not |
| 3.3 | DuckDB storage-pool removal | pending | Delete `db/duckdb-storage-pool.ts`, `db/duckdb-graph-schema.ts`, `db/duckdb-graph-client.ts`. Daemon shutdown handler drops the storage-pool close. In-memory query pool (`duckdb-pool.ts`) stays |
| 4.1 | Indexer integration | pending | `indexer/index.ts` -- replace `withStorageConnection` calls with LMDB graph-API calls. Periodic CHECKPOINT calls go away (LMDB doesn't have them) |
| 4.2 | cross-file-resolver rewrite | pending | `indexer/cross-file-resolver.ts` Pass 1 + Pass 2 -- DuckDB SQL → LMDB graph API. Unresolved-relation table moves to LMDB |
| 4.3 | plan-store rewrite | pending | `agent/tasks/plan-store.ts` -- ~25 SQL queries → LMDB calls |
| 4.4 | LLM-facing graph tool | pending | `graph_sql` tool (DuckDB SQL) → `graph_query` (LMDB API). Decide: expose narrow find/closure API, or expose a Datalog-ish query DSL |
| 5.1 | Dead-code analyzer skill | pending | `data.code.dead-code` skill on top of `transitiveClosure(roots, [CALLS, IMPORTS, EXTENDS, IMPLEMENTS, REFERENCES])` -- the headline new feature this plan unblocks |
| 5.2 | Hot backup CLI | pending | `insrc daemon backup <path>` -- copy LMDB file under a snapshot read txn |
| 5.3 | Schema-version field + migration scaffold | pending | `meta.schema_version` u32; pre-flight check at env open; one-way migration runner |
| 6.1 | Benchmark suite | pending | Synthetic graphs at 100k / 1M / 10M edges; measure point-lookup, 1-hop, transitive-closure latency. Regression gate for v1 |
| 6.2 | CLAUDE.md + design-doc updates | pending | Re-document the storage stack; archive the DuckDB-storage post-mortem |

## Goals

1. **No more "experimental" DB tech in the storage stack.** Every persistent
   substrate is a battle-tested project: LMDB (~15y), LanceDB (actively
   maintained, healthy in our previous use), DuckDB (in-memory only -- no
   experimental persistence flags).
2. **No more "buffer pool too small" incidents.** LMDB has no buffer pool;
   the OS page cache handles working-set residency. The class of failure
   that bit Kuzu and DuckDB structurally cannot recur.
3. **Dead-code analysis becomes feasible.** Transitive closure over the
   full graph runs in seconds, not minutes. Unblocks the 5.1 dead-code
   skill and other reachability-style analyses.
4. **Operational simplicity.** No CHECKPOINT, no VACUUM, no preserve-
   insertion-order tuning. Backup is `cp` under a snapshot. Crash recovery
   is "restart the daemon."
5. **Storage and traversal stay decoupled.** Storage is LMDB; traversal is
   JS code we own. If we ever want to swap storage (e.g. SQLite for a
   smaller dependency footprint, or a real graph DB if one matures),
   only `db/graph/store.ts` changes; `db/graph/traversal.ts` is portable.

## Non-goals

- **Cypher / GQL query language.** Our internal callers use a typed JS API
  (find / closure / traversal). If we ever expose graph queries to end
  users we revisit; we don't today.
- **Cluster / replication / HA.** Single-process daemon. LMDB is single-
  writer-multi-reader; that's the limit and it's fine.
- **Schema evolution beyond a forward-only migration runner.** No
  back-compat, no downgrade, no online schema change. We pin
  `schema_version` at env open and refuse to run on an unknown version.
- **Cross-process concurrent writers.** The daemon owns the LMDB env. The
  CLI / agent never opens it directly (already the rule for the current
  storage; doesn't change).
- **Graph-DB-style transactions across multiple files.** Re-indexing one
  file is one LMDB txn. Multi-file re-index is sequential single-file
  txns. (LMDB is single-writer; serializing is correct *and* removes a
  whole class of concurrency bugs.)

## Schema design

### Sub-DB layout

LMDB exposes "sub-databases" (named keyspaces) within a single env. The
storage layer uses twenty sub-DBs (9 graph + 2 plans + 3 conversations
+ 4 todos + 2 config), grouped by subsystem:

**Graph (code knowledge graph):**

| Sub-DB | Key | Value | Purpose |
|---|---|---|---|
| `meta` | utf8 string | varies | Schema version, ID counters, build metadata |
| `repo` | u32 repo_id (BE) | msgpack(Repo) | Registered repo records |
| `entity` | u64 entity_id (BE) | msgpack(Entity) | Entity bodies (full schema below) |
| `entity_id_by_string` | utf8 string (32-char SHA hex) | u64 entity_id | "What's the u64 for this caller-supplied string ID?" -- preserves the existing string-SHA caller surface (`Entity.id: string` from the daemon's domain type) while the storage layer uses u64 internally for edge-key compactness |
| `name_index` | (u32 repo, u8 kind, utf8 fqn) | u64 entity_id | "What's the ID of this entity by name?" -- used by re-index lookup |
| `out_edge` | (u64 from, u8 kind, u64 to) | msgpack(EdgeProps) or empty | Outgoing edges; range-scan by `(from, kind)` gives all neighbors |
| `in_edge` | (u64 to, u8 kind, u64 from) | empty | Incoming edges; mirror of `out_edge` for in-degree queries |
| `unresolved` | utf8 string id (32-char SHA hex) | msgpack(UnresolvedRelation) | Cross-file resolver queue: edges whose target couldn't be bound at parse time. Pass 2 of the resolver promotes these into `out_edge` / `in_edge`. Keyed by the existing string SHA id (matches the caller surface; row count is bounded so the u64 compactness argument doesn't apply) |
| `unresolved_by_file` | (u32 repo, utf8 from_file) | dupsort utf8 unresolved_id | Secondary index for "all unresolved-from this file" -- used on re-index to wipe stale unresolved rows |

**Plans (artifact framework):**

| Sub-DB | Key | Value | Purpose |
|---|---|---|---|
| `plan` | utf8 plan_id | msgpack(Plan) | Plan headers (title, status, repo_path, timestamps) |
| `plan_step` | (utf8 plan_id, u32 idx BE) | msgpack(PlanStep) | Per-step records; range-scan by `plan_id` returns steps in idx order |

**Plan-graph edges are NOT in the unified `out_edge` / `in_edge` sub-DBs.**
Those sub-DBs are keyed by u64 entity IDs; plans and plan steps use utf8
string IDs and don't participate in entity-graph traversal. Instead:
- CONTAINS (plan → step) is implicit in the `plan_step` composite key
  `(plan_id, idx)` -- a prefix scan returns all steps for a plan.
- STEP_DEPENDS_ON is stored as a `dependsOn: string[]` field on the
  PlanStepRow itself.

If we ever need cross-graph traversal mixing plan steps with code
entities, the right answer is a typed adapter -- not collapsing the
two ID spaces into one.

**Conversations:**

| Sub-DB | Key | Value | Purpose |
|---|---|---|---|
| `conversation_session` | utf8 session_id | msgpack(SessionRow) | Session metadata (repo, summary, seen_entities, status, tier, created_at, last_activity_at, expires_at). Embedding lives in LanceDB keyed by session_id |
| `conversation_turn` | (utf8 session_id, u32 idx BE) | msgpack(TurnRow) | Per-turn records; range-scan by session_id returns in idx order. Embedding lives in LanceDB keyed by turn_id |
| `conversation_turn_by_repo` | (utf8 repo, utf8 turn_id) | empty | dupsort secondary index for `getAllTurnsForRepo` and per-repo searches |

**Todos:**

| Sub-DB | Key | Value | Purpose |
|---|---|---|---|
| `todo_list` | utf8 list_id | msgpack(TodoList) | Top-level lists |
| `todo_list_by_session` | (utf8 session_id, utf8 list_id) | empty | dupsort index for `listForSession` |
| `todo_item` | (utf8 list_id, utf8 order_key, utf8 item_id) | msgpack(TodoItem) | Per-item; range-scan by list_id returns in order_key order |
| `todo_comment` | (utf8 item_id, utf8 comment_id) | msgpack(TodoComment) | Per-comment; range-scan by item_id returns all comments |

**Config-store:**

| Sub-DB | Key | Value | Purpose |
|---|---|---|---|
| `config_entry` | utf8 entry_id | msgpack(ConfigEntry) | Entry body. Embedding lives in LanceDB keyed by entry_id |
| `config_by_scope` | (utf8 scope, utf8 namespace, utf8 category, utf8 entry_id) | empty | dupsort index for `find(scope, namespace, category)` |

**Notes on conventions:**

- Big-endian u64 / u32 in keys ensures LMDB's lexicographic ordering matches
  numeric ordering -- critical for sequential ID inserts to land at the right
  edge of the B+ tree.
- The `out_edge` and `in_edge` sub-DBs duplicate the edge data. The cost is
  ~2x edge keyspace; the benefit is symmetric O(degree) range-scan in either
  direction without a secondary index lookup. Worth it -- in-edge queries
  (who calls this function? who imports this module?) are common.
- Several sub-DBs use LMDB's **dupsort** flag (multiple values per key) as
  cheap secondary indexes. Avoids materializing separate index entries.
- Where current DuckDB IDs are strings (plan_id, session_id, turn_id, list_id,
  item_id, config entry_id), the LMDB layer keeps them as utf8 strings rather
  than allocating new u64 IDs. Reasons: (a) these are not graph nodes (no
  edge participation), (b) they're created/displayed by the application
  layer, (c) keeping the existing IDs avoids an external-ID-to-internal-ID
  translation table. **Only graph-participating IDs (entity, repo) get the
  u64/u32 sequential treatment** -- because those are the ones in millions
  of edge keys where the size matters.

### Entity schema

Mirrors the current DuckDB `entity` table column-for-column (verified
against `src/insrc/db/entities.ts`):

```ts
interface Entity {
  // Identity (also encoded in name_index key)
  repoId: number;           // u32 (was VARCHAR repo in DuckDB)
  kind: EntityKind;
  name: string;             // fully-qualified

  // Provenance
  filePath: string;         // repo-relative (was `file` in DuckDB)
  startLine: number;
  endLine: number;
  language: Language;
  rootPath: string;         // repo root, for closure resolution

  // Body / signature
  body: string;             // entity source text (function body, class body, ...)
  signature: string;        // for functions / classes (empty string for others)
  summary: string;          // LLM-generated; populated lazily (empty string until then)

  // Flags
  isExported: boolean;
  isAsync: boolean;
  isAbstract: boolean;
  artifact: boolean;        // true for synthetic artifact entities (call-graph nodes, ER-source rows, ...)

  // Bookkeeping
  contentHash: string;      // hex(SHA256(body)) -- used to short-circuit re-indexing
                            //   when the entity body hasn't changed (was `hash` in DuckDB)
  embeddingModel: string;   // which embedding model produced the LanceDB row (empty until embedded)
  indexedAt: number;        // unix ms (was VARCHAR ISO8601 in DuckDB)
}

type EntityKind =
  | 'function' | 'class' | 'method' | 'interface'
  | 'module'   | 'type'  | 'enum'   | 'variable'
  | 'repo'     | 'file';

type Language = 'typescript' | 'python' | 'go' | 'java' | 'scala' | 'unknown';
```

**Sentinel-default convention.** The current DuckDB schema uses empty
string / 0 / false defaults rather than NULL. The msgpack codec preserves
this: missing fields decode to their type's zero value (empty string,
0, false). Callers continue to distinguish "absent" from "present-but-
empty" using the same sentinel logic.

**Embedding column lives in LanceDB**, not in the entity row. The
`embeddingModel` field in the entity row records which model populated
the Lance row keyed by `entity_id` -- non-empty means "Lance has an
embedding for this entity"; empty means "not yet embedded."

**Module-stub semantics.** The current code splits the upsert path:
module entities use `ON CONFLICT DO NOTHING` (ensure-exists), all other
kinds use `DO UPDATE` (last-write-wins). The LMDB equivalent: `putEntity`
takes a `mode: 'upsert' | 'ensure'` flag; `ensure` is a no-op if the
entity already exists. The bulk indexer routes module entities through
`ensure`, all others through `upsert`.

### Relation kinds

Verified against `src/insrc/db/relations.ts`. Twelve kinds total at v1
(eleven code-graph + one plan-graph):

```ts
type RelationKind =
  // Code structure
  | 'CONTAINS'          // module → function, class → method
  | 'DEFINES'           // file → function/class (entity-scoped containment)
  | 'INHERITS'          // class → class, interface → interface
  | 'IMPLEMENTS'        // class → interface
  // Call graph
  | 'CALLS'             // function → function
  // Imports + dependencies
  | 'IMPORTS'           // module → module
  | 'EXPORTS'           // module → entity (re-export)
  | 'DEPENDS_ON'        // repo → repo (via package manifest)
  | 'REFERENCES'        // function/class → type/variable (general use)
  // Data lineage
  | 'READS'             // function → table/column
  | 'WRITES'            // function → table/column
  // Plan graph (lives in same edge tables for traversal-API uniformity)
  | 'STEP_DEPENDS_ON';  // plan_step → plan_step
```

Encoded as a u8 in keys. Adding a kind requires a `schema_version` bump
but is otherwise additive (existing keys don't move). The u8 enum
positions are fixed at v1 -- never reorder, never reuse a removed slot.

### Edge properties

Most edges have no payload (empty value). A few do:

- `CALLS` edge value: `{ siteCount: u32 }` -- how many call sites in the source span
- `READS` / `WRITES` edge value: `{ columns: string[] }` -- which columns are touched
- `IMPORTS` edge value (when present): `{ rawTo: string }` -- preserves the raw module specifier (e.g. `'./foo'`, `'@scope/pkg/sub'`) for IDE-side display before resolution
- All other edges: empty value

Payload is msgpack when present; empty `Buffer.alloc(0)` otherwise.
`lmdb-js` handles empty values cleanly. Edge-property schema per kind
lives in `db/graph/edges.ts` as typed encoder/decoder pairs.

### Key encoding

All composite keys are concatenations of fixed-width binary fields:

```
out_edge key:               [u64 from BE][u8 kind][u64 to BE]    // 17 bytes
in_edge  key:               [u64 to   BE][u8 kind][u64 from BE]  // 17 bytes
name_index:                 [u32 repo BE][u8 kind][utf8 name]    // variable
entity:                     [u64 id BE]                           // 8 bytes
repo:                       [u32 id BE]                           // 4 bytes
unresolved:                 [u64 id BE]                           // 8 bytes
unresolved_by_file:         [u32 repo BE][utf8 from_file]         // variable (dupsort: u64)
plan_step:                  [utf8 plan_id][\0][u32 idx BE]        // variable
conversation_turn:          [utf8 session_id][\0][u32 idx BE]     // variable
conversation_turn_by_repo:  [utf8 repo][\0][utf8 turn_id]         // variable
todo_list_by_session:       [utf8 session_id][\0][utf8 list_id]   // variable
todo_item:                  [utf8 list_id][\0][utf8 order_key][\0][utf8 item_id] // variable
todo_comment:               [utf8 item_id][\0][utf8 comment_id]   // variable
config_entry:               [utf8 entry_id]                        // variable
config_by_scope:            [utf8 scope][\0][utf8 namespace][\0][utf8 category][\0][utf8 entry_id]
meta:                       [utf8 string]                          // variable
```

`\0` is the null-byte separator between variable-length string segments
in composite keys. UTF-8 strings cannot contain `\0`, so this is an
unambiguous delimiter and preserves prefix-scan semantics: a range scan
on `[utf8 list_id][\0]` returns exactly the items belonging to that
list.

Helper: `db/graph/keys.ts` exports `encodeOutEdgeKey(from, kind, to)`,
`decodeOutEdgeKey(buf)`, etc. All key encoding goes through these helpers
-- no ad-hoc concatenation in callers.

### Cascade rules

Current DuckDB code requires callers to coordinate cascade deletes
manually (e.g. `removeRepo(path)` in repos.ts only deletes the repo row;
the indexer separately calls `deleteEntitiesForRepo` and
`deleteUnresolvedForRepo`). The LMDB store layer **enforces cascades
internally** to remove this footgun. The rules:

| Operation | Cascade |
|---|---|
| `deleteRepo(repoId)` | All entities in repo → all out/in edges with either endpoint in repo → all unresolved with that repo → all name-index entries → all conversation sessions for repo → all turns for those sessions |
| `deleteEntity(entityId)` | All out/in edges touching entity → name-index entry → LanceDB row keyed by entity_id |
| `deleteEntitiesForFile(repoId, filePath)` | Per-entity cascade above for each entity in the file → unresolved entries from that file |
| `deleteSession(sessionId)` | All turns for session → LanceDB rows keyed by session_id and the turn_ids |
| `deletePlan(planId)` | All plan_step rows → STEP_DEPENDS_ON edges between them |
| `deleteList(listId)` | All items in list → all comments under those items |
| `deleteItem(itemId)` | All comments on item |
| `deleteScope(scope)` | All config_entry rows in scope → LanceDB rows keyed by entry_id |

Tested in `db/graph/__tests__/cascade.test.ts` -- one test per row.

## API surface

### Storage primitives (`db/graph/store.ts`)

```ts
interface GraphStore {
  // Lifecycle
  close(): void;
  backup(targetPath: string): Promise<void>;

  // ID allocation
  allocateEntityId(): bigint;
  allocateRepoId(): number;

  // Repo
  getRepo(id: number): Repo | undefined;
  putRepo(repo: Repo): void;
  listRepos(): Repo[];
  deleteRepo(id: number): void;        // cascades to entities + edges

  // Entity
  getEntity(id: bigint): Entity | undefined;
  putEntity(id: bigint, entity: Entity): void;
  deleteEntity(id: bigint): void;       // cascades to edges + name-index
  lookupEntityId(repoId: number, kind: EntityKind, name: string): bigint | undefined;
  listEntitiesInRepo(repoId: number, kind?: EntityKind): IterableIterator<bigint>;

  // Edges
  addEdge(from: bigint, kind: RelationKind, to: bigint, props?: EdgeProps): void;
  removeEdge(from: bigint, kind: RelationKind, to: bigint): void;
  outEdges(from: bigint, kind?: RelationKind): IterableIterator<EdgeRow>;
  inEdges(to: bigint, kind?: RelationKind): IterableIterator<EdgeRow>;

  // Unresolved relations (cross-file resolver queue)
  addUnresolved(unresolved: UnresolvedRelation): bigint;     // returns unresolved_id
  getUnresolvedForRepo(repoId: number): IterableIterator<UnresolvedRelation>;
  getUnresolvedForFile(repoId: number, filePath: string): IterableIterator<UnresolvedRelation>;
  markUnresolvedAttempted(id: bigint, meta: Record<string, unknown>): void;
  markUnresolvedResolved(id: bigint): void;                  // deletes the row
  deleteUnresolvedForFile(repoId: number, filePath: string): void;

  // Bulk write (re-index)
  reindexFile(repoId: number, filePath: string, parsedEntities: ParsedEntity[]): void;

  // Test injection (mirrors current `setStorageDuckDBPath`)
  // Production code never calls this; test setup overrides the env path
  // to a tmpdir or `:memory:`-equivalent (LMDB has no in-memory mode --
  // tests use a tmpdir env that's deleted in teardown).
}

export function setGraphStorePath(path: string): void;       // test-only override
export function closeGraphStore(): Promise<void>;            // shutdown handler hook
```

Single-writer constraint: `addEdge` / `putEntity` / `reindexFile` all
acquire the LMDB write txn. Concurrent writers serialize at the LMDB level
-- callers don't manage txns directly.

### Traversal layer (`db/graph/traversal.ts`)

```ts
interface GraphTraversal {
  // 1-hop convenience (replaces current db/search.ts)
  findCallers(id: bigint): bigint[];
  findCallees(id: bigint): bigint[];
  findDefinedIn(id: bigint): bigint | undefined;   // CONTAINS in-edge
  findImports(moduleId: bigint): bigint[];

  // Multi-hop
  bfs(roots: bigint[], opts?: TraversalOpts): IterableIterator<bigint>;
  dfs(roots: bigint[], opts?: TraversalOpts): IterableIterator<bigint>;
  transitiveClosure(roots: bigint[], opts?: TraversalOpts): Set<bigint>;
  scc(rootSet: Set<bigint>, opts?: TraversalOpts): bigint[][];

  // Reachability for dead-code (= entities NOT in closure of roots)
  unreachable(
    roots: bigint[],
    candidateKinds: EntityKind[],
    opts?: TraversalOpts,
  ): IterableIterator<bigint>;
}

interface TraversalOpts {
  kindFilter?: RelationKind[];     // default: all relation kinds
  direction?: 'out' | 'in';        // default: 'out'
  maxDepth?: number;               // default: unbounded
  visitor?: (id: bigint, depth: number) => boolean;  // return false to prune
}
```

All traversal returns `IterableIterator<bigint>` where possible -- callers
stream and short-circuit. Materializes to a `Set` only when the caller
actually needs it (transitive closure, dead-code).

### Re-index transaction model

The re-index loop for a single file:

```ts
function reindexFile(repoId: number, filePath: string, parsed: ParsedEntity[]): void {
  txn(() => {
    // 1. Snapshot existing entities for this file (by repo + filePath)
    const existing = listEntitiesInFile(repoId, filePath);
    const seen = new Set<bigint>();

    // 2. Upsert each parsed entity
    for (const e of parsed) {
      let id = lookupEntityId(repoId, e.kind, e.name);
      if (id === undefined) {
        id = allocateEntityId();
        // name-index entry inserted alongside entity put
      }
      // Skip body-write if contentHash hasn't changed
      const prev = id !== undefined ? getEntity(id) : undefined;
      if (prev?.contentHash !== e.contentHash) {
        putEntity(id, e);
      }
      seen.add(id);
    }

    // 3. Tombstone unseen (= deleted from file)
    for (const id of existing) {
      if (!seen.has(id)) {
        deleteEntity(id);   // cascades to edges + name-index
      }
    }
  });
}
```

Edge writes happen in a separate pass (`indexer/cross-file-resolver.ts`)
because edges need both endpoints to exist -- can't resolve until all
files in the changeset are indexed.

LMDB write txns are serial (single-writer). On a re-index storm (e.g.
git-checkout switching branches), files are re-indexed one at a time. This
is fine -- the parser is the bottleneck, not the storage.

## Vector layer (LanceDB restore)

Per the audit performed prior to this plan (verified against the current
`src/insrc/db/` codebase):

- **Vector search USED:** entities, conversations (sessions + turns), config-store
- **Vector search NOT USED:** todos (always written `ZERO_VEC`)
- **FTS / BM25:** zero callers anywhere

So the restore is:

1. Re-add `@lancedb/lancedb` dep
2. Restore `~/.insrc/lance/` directory init
3. Restore `db/entities.ts` Lance write path (entity body + embedding)
4. Restore `db/search.ts` Lance vector-search path (`searchSimilar`,
   `searchEntities`)
5. Restore `db/conversations.ts` and `db/config-store.ts` Lance paths
6. **Don't** restore the FTS/BM25 helper -- not needed
7. **Don't** restore Lance for todos -- they live in LMDB now

Vector dim is unchanged (qwen3-embedding = 2560). HNSW index params
unchanged from the previous Lance config.

### LanceDB tables (4 total)

| Table | Key column | Vector column | Other columns | Index |
|---|---|---|---|---|
| `entity_vec` | entity_id (u64 → string) | embedding FLOAT[2560] | repo (for filter), kind (for filter) | HNSW cosine |
| `session_vec` | session_id (utf8) | embedding FLOAT[2560] | repo (for filter), status | HNSW cosine |
| `turn_vec` | turn_id (utf8) | embedding FLOAT[2560] | repo (for filter), session_id, type, tier | HNSW cosine |
| `config_vec` | entry_id (utf8) | embedding FLOAT[2560] | scope, namespace, category | HNSW cosine |

Filter columns are duplicated from LMDB so Lance can scope ANN searches
without a join. They're write-time-only -- no source-of-truth concerns
(LMDB is canonical for the structured fields).

### Hydration on read

Vector search returns IDs + scores; the caller hydrates the structured
entity / session / turn / config row from LMDB. Pattern:

```ts
async function searchEntities(query: number[], closure: number[], limit: number) {
  const hits = await lance.entity_vec.search(query)
    .where(`repo IN (${closure.join(',')})`)
    .limit(limit)
    .toArray();
  return hits.map(h => ({ ...graph.getEntity(h.entity_id), score: h._distance }));
}
```

### Brute-force fallback removal

Current code falls back to a brute-force cosine scan when DuckDB's `vss`
extension is unavailable (`db/search.ts` has the `try-catch` around HNSW).
With LanceDB, ANN is built into the engine and the fallback path goes
away. If LanceDB itself fails to load, we surface a hard error rather
than degrade silently -- vector search is core to context-assembly and
silent degradation produced confusing-but-not-erroring answers in the
past.

### Conversation compaction (`db/compaction.ts`)

The 5-stage tiered-compression pipeline (directives → time-based tier
ladder → semantic clustering via cosine on embeddings → archive →
size-cap) keeps working post-restore. It already calls into
`conversations.ts` for turn writes (no direct SQL); the Lance restore
brings back the cosine-on-embedding side. No structural change to the
pipeline -- only the storage backing.

The `DbClients` shape becomes: `{ graph: GraphStore; lance: lancedb.Connection }`.

## Non-graph subsystems on LMDB

The graph layer is the headline -- but four other persistent subsystems
move to LMDB alongside it. Each gets its own thin TypeScript module that
sits on top of the same LMDB env (sub-DBs above) and presents the
**same surface** as today's DuckDB-backed module to keep callers
unchanged:

| Module | Sub-DBs | Replaces | Notes |
|---|---|---|---|
| `db/repos.ts` | `repo` | DuckDB `repo` table | Surface unchanged: `addRepo / removeRepo / listRepos / updateRepoStatus` |
| `db/conversations.ts` | `conversation_session`, `conversation_turn`, `conversation_turn_by_repo` + Lance `session_vec` / `turn_vec` | DuckDB `conversation_session` + `conversation_turn` + HNSW indexes | Surface unchanged: `addSession / addTurn / addCompactedTurns / updateSession / deleteSession / getTurnsForSession / searchTurnsByRepo / pruneConversations`. Search hydrates ID → row from LMDB |
| `db/todos.ts` | `todo_list`, `todo_list_by_session`, `todo_item`, `todo_comment` | DuckDB `todo_list` + `todo_item` + `todo_comment` | Surface unchanged: `insertList / insertItem / insertComment / update* / delete* / getList / listForSession`. **No Lance** -- vectors were never used here |
| `agent/tasks/plan-store.ts` | `plan`, `plan_step` + uses graph `out_edge` / `in_edge` for `STEP_DEPENDS_ON` | DuckDB `plan` + `plan_step` + `relation` (for STEP_DEPENDS_ON) | Surface unchanged: `savePlan / loadPlan / updatePlanStatus / updateStep / deletePlan / getPendingSteps / getBlockingSteps` |
| `config/store.ts` | `config_entry`, `config_by_scope` + Lance `config_vec` | DuckDB `config_entry` + HNSW index | Surface unchanged: `put / delete / deleteScope / get / find / search`. Search hydrates ID → row from LMDB |

Keeping the public surface unchanged means the *caller* layer
(`indexer/`, `daemon/`, `agent/`, RPC handlers, tools) doesn't change
during this migration -- only the storage backing. That bounds the
blast radius of the change.

## Durability, recovery, and operational handling

LMDB's operational model is intentionally minimal -- no checkpoints, no
WAL replay, no compaction daemon. But "minimal" doesn't mean "zero
operational concerns"; just a different (smaller) set than DuckDB's. This
section enumerates each one and pins the default.

### Crash recovery (no work for us)

LMDB has no WAL. Commit writes data pages directly using copy-on-write,
then atomically toggles between two meta pages at the file head. On
crash, env-open picks the meta page with the higher *valid* transaction
ID (each carries a checksum); pages from the in-flight crashed
transaction are unreachable from that root and become free pages on
next write. **Recovery is O(1) at env-open time -- no scan, no replay,
no rebuild step.** This is the failure mode that bit Kuzu and DuckDB
("checkpoint OOM, database invalidated, restart required") and
structurally cannot recur.

### Sync / durability mode

`lmdb-js` env-open exposes the `MDB_NOSYNC` / `MDB_NOMETASYNC` /
`MDB_MAPASYNC` flags. **Default: all flags OFF (full durability).**
Each commit calls `fsync()` on the data file and the meta page; survives
power loss. The performance trade is real (each commit waits for
`fsync`) but acceptable for our write rate (re-indexing batches at file
boundaries, not per-entity). We never enable any of these flags.

### `mapsize` and file growth

The env's `mapsize` is the maximum file size, set at env open and
**not growable mid-process** (raising it requires re-opening). Default:
**1 TiB**. The file is sparse on disk -- LMDB only allocates pages it
actually writes; `mapsize` just bounds the virtual address range. On
64-bit systems the VM range is essentially free. 1 TiB gives us
indefinite headroom for any plausible monorepo over the daemon's
lifetime.

### Reader-slot management

The one real LMDB gotcha. Each open read transaction holds a reader slot
in the lock file (`graph.lmdb-lock`) and pins a snapshot. While a
reader is alive, free pages from concurrent writes can't be reclaimed
-- file size grows. Worse, when a process dies without closing its
reader (kill -9, segfault), the slot is *not* auto-cleaned and looks
indistinguishable from a live reader to subsequent writes.

Defaults:
- **Read txns are short-lived.** All read code goes through a
  `withReadTxn(fn)` helper that opens, runs, closes. No reader handle
  ever escapes the helper. Linted via a typed API that doesn't expose
  the raw reader.
- **Daemon startup runs `mdb_reader_check()`.** Sweeps stale slots from
  killed processes. Logged; non-fatal if it finds anything (informational
  only).
- **Periodic re-check.** A daemon-side timer (every 5 minutes) re-runs
  `mdb_reader_check()` defensively. Cheap (just a lock-file scan).

### Offline compaction

LMDB reuses free pages but never returns them to the OS. After a large
delete burst (e.g. `deleteRepo` on a 100k-entity repo, or a long-running
reader that finally closed) the file size is pinned at the high-water
mark even though the live data is much smaller.

Mitigation: `mdb_env_copy2(env, target, MDB_CP_COMPACT)` writes a new
file with no fragmentation -- effectively the LMDB equivalent of
`pg_dump | pg_restore`. Daemon ships `insrc daemon compact` (Phase 7.4)
which:
1. Acquires a write lock (queues behind any in-flight write txn)
2. Calls `mdb_env_copy2` to a sibling temp file
3. Atomically renames temp → original
4. Re-opens the env

Not scheduled by default. Manual operation; surfacing the file-size
delta in `insrc daemon status` lets the user decide when to run it.
Most installs will never need to.

### Disk-full handling

When `mapsize` is exhausted (won't happen at 1 TiB without genuinely
filling it) or the underlying disk is full, write returns
`MDB_MAP_FULL` / `ENOSPC`. **Default: log + surface to caller; do not
attempt to grow `mapsize` mid-process.** The daemon's write callers
already handle `Promise.reject` cleanly (the indexer pauses; RPC
handlers return error to caller). User has to free disk space and
restart the daemon to recover.

### Env-open failures

Defined error paths at env-open:
- **Lock-file conflict** (another process has the env open): hard-fail
  with "another insrc daemon is running on this env path" message
- **Corrupted meta pages** (both checksums invalid): hard-fail with
  "graph store corrupted; restore from backup" -- never auto-rebuild
- **`mapsize` smaller than existing file**: hard-fail with explicit
  message; user can re-open with larger `mapsize` via env override
- **Schema-version mismatch**: see next section

Backups (Phase 7.1) are the recovery path for irrecoverable corruption.
Without a backup, the user re-indexes from source code (acceptable --
the graph is derived data).

### Schema-version pre-flight

`meta.schema_version` is a u32 written at env initialization. Pre-flight
check at env-open:

| Stored version | Daemon expected version | Behavior |
|---|---|---|
| same | same | proceed normally |
| stored < expected | newer daemon | run forward migration (Phase 7.2 ships the runner; v1 has no migrations because v1 is the first version) |
| stored > expected | older daemon | hard-fail: "graph store written by a newer daemon; upgrade or downgrade" -- never silently downgrade |
| missing (empty env) | any | first boot; initialize schema, set version |

Forward migrations are one-way only (per non-goals). Each migration is a
function that runs in a single LMDB write txn and bumps
`schema_version`. The runner is sequential and idempotent up to the
recorded version.

### Page-level integrity

LMDB checksums the *meta pages* but not the *data pages*. If a disk
corrupts a data page (bit-rot, drive failure, filesystem bug), LMDB
reads garbage without complaint. **Mitigation strategy: rely on the
filesystem.** ZFS / btrfs (Linux) and APFS (macOS) all checksum at the
filesystem layer. We don't add a second layer of checksumming on top --
not worth the per-read cost for a developer-tool workload that has
backups as the recovery path.

Documented in the operations playbook (Phase 7.5).

## DuckDB demotion

Keep `db/duckdb-pool.ts` (in-memory query engine). Used by:
- `db_file_*` data-driver tools (CSV / Parquet / JSONL attaches)
- All Track-A file-side analyzer skills (`data.profile.numeric.file`, etc.)

Delete:
- `db/duckdb-storage-pool.ts`
- `db/duckdb-graph-schema.ts`
- `db/duckdb-graph-client.ts`
- `~/.insrc/duckdb.db` boot-time creation (already wiped)
- The `vss` extension load (no vectors in DuckDB)
- The `arrow` extension load *if no remaining caller needs it* -- audit
  during 3.3

## Migration plan

There is **no data to migrate**. The DuckDB store has been wiped; users
will re-index their repos against the new substrate on first daemon boot
post-deploy.

Daemon boot sequence post-deploy:

```
1. Open LMDB env at ~/.insrc/graph.lmdb (created on first boot)
2. Apply schema: meta.schema_version = 1, ID counters initialized
3. Open LanceDB at ~/.insrc/lance/ (re-created on first boot)
4. If ~/.insrc/duckdb.db exists, log "leftover DuckDB store; safe to delete"
   (don't auto-delete; user already cleaned up)
5. Begin normal startup
```

For users who had repos registered against the DuckDB build:
- `~/.insrc/config.json` has the repo registry
- On first boot, log "repo X needs re-indexing" for each registered repo
- User runs `insrc repo reindex <path>` (or it auto-runs in the background
  -- decide in 4.1)

## Scale validation strategy

**Lesson from the DuckDB experience:** the substrate looked fine on
small repos and during early integration. The failure mode (148 GiB
file, fatal checkpoint OOM at 2 GiB pool, 2560-dim HNSW pressure) only
showed up at realistic monorepo scale, *after* the migration was in
production. The remediation cost was massive (full re-design, full
re-implementation, no recoverable state). We don't repeat that.

**Two levels of validation, gated at different points in the plan:**

### Level 1 -- pre-migration derisking spike (Phase 0.4, *blocking*)

Before any of Phases 1.x-2.x ship, build a minimal LMDB + Lance
test-rig in `scripts/storage-spike/` that exercises both substrates
against worst-case workloads. Note: a synthetic 24-hour sustained-
write test was originally listed but dropped per user direction --
"the problem is not the time, but the size; hence the full hadoop
test." The size axis is what validates the substrate; the Hadoop
realistic-load test below covers it. **No daemon code changed; no caller
rewired.** The spike is a throw-away that answers one question: "do
LMDB and Lance scale to our worst case before we commit?"

| Test | Workload | Expected outcome |
|---|---|---|
| LMDB write throughput | Bulk-load 10M synthetic edges (CSR-style) into LMDB env in one txn; measure ms/M edges + final file size | < 10 GiB; < 5 minutes total |
| LMDB random read | 100k random `outEdges(id, kind)` cursor scans across a 10M-edge env | p99 < 1 ms warm; p99 < 10 ms cold |
| LMDB transitive closure | BFS from 100 random roots through DEPENDS_ON-equivalent edges to depth ∞ | < 5 seconds for any single closure on the 10M-edge env |
| Lance write throughput | Bulk-insert 1M qwen3-embedding-0.6B vectors (1024-dim) | < 30 minutes; < 10 GiB on disk |
| Lance ANN throughput | 10k ANN queries against the 1M-vector index | p99 < 50 ms warm |
| Lance index rebuild | Force HNSW index rebuild on 1M-vector table | Completes; no OOM at 4 GiB RSS budget |
| **Hadoop-class realistic load** | Index actual hadoop YARN repo (~12.8k files) into LMDB + Lance via the spike's minimal write path | Completes without OOM, RSS stable, file sizes within projected bounds (~150 MiB LMDB graph, ~700 MiB Lance) |

**The gate:** any test failing or producing results 2x worse than
projected halts the migration. We then either tune the substrate
(adjust `mapsize`, change Lance HNSW params, switch to a different
embedding dim, etc.) or pick a different substrate before any caller
code is rewritten. **This is the spike's whole point** -- find the
substrate's failure modes before we depend on them, while the cost of
backing out is hours rather than weeks.

### Level 2 -- continuous regression gate (Phase 7.3, post-migration)

Once the substrate is committed, the spike is replaced by a permanent
benchmark suite that runs in CI on every storage-layer change:

- Same workloads as the spike but parameterised across scales:
  100k / 1M / 10M edges; 100k / 1M / 10M vectors
- Tracks regressions in both latency (p50, p99) and resource ceilings
  (peak RSS, file size, page-fault rate)
- Fails the build if any metric regresses > 30% from baseline
- Baselines refreshed quarterly with explicit reviewer sign-off

This is the safety net for *future* work on the substrate. The Level 1
spike is the safety net for *adopting* the substrate at all.

### What we explicitly look for at each scale

| Scale | Watch for |
|---|---|
| 100k edges / 100k vectors | Smoke functional correctness; RSS in MB |
| 1M edges / 1M vectors | First scale where insert latency could degrade; RSS in low GB |
| 10M edges / 10M vectors | First scale where ANN query latency matters; RSS approaches realistic monorepo ceiling |
| Hadoop-realistic | The actual workload that broke DuckDB. If LMDB+Lance survives this, the substrate is validated for real use |

The realistic load is the most important. Synthetic benchmarks miss
shapes specific to real code graphs (high-degree hub nodes for shared
modules; long tails of single-call functions; embedding clustering by
repo). The Hadoop test is the closest stand-in we have for the
historical failure case.

### Test-rig pseudocode for the spike

```ts
// scripts/storage-spike/lmdb-edge-throughput.ts
import { open } from 'lmdb';

const env = open({ path: '/tmp/lmdb-spike', mapSize: 100 * 1024 ** 3 });
const out = env.openDB({ name: 'out_edge', encoding: 'binary' });

const t0 = Date.now();
await env.transactionAsync(() => {
  for (let i = 0; i < 10_000_000; i++) {
    const key = encodeOutEdgeKey(BigInt(i % 1_000_000), 1, BigInt((i + 1) % 1_000_000));
    out.put(key, Buffer.alloc(0));
  }
});
console.log('10M edges in', Date.now() - t0, 'ms; file size:', statSync('/tmp/lmdb-spike/data.mdb').size);
```

Each spike test is similarly minimal -- ~50 lines per test. The
goal isn't to write production code; it's to put real numbers on the
substrate's behavior at our scale.

## Sized work

Total estimate: **~5 weeks of focused work** for a production-ready v1
that lands the dead-code skill (assumes Phase 0.4 spike passes; if it
fails, additional time required to remediate or pivot).

| Track | Work | Estimate |
|---|---|---|
| **Foundation** (1.x + 2.x) | LMDB env, schema, entity/edge CRUD, traversal layer, search-API parity | 2 weeks |
| **Vector restore** (3.x) | LanceDB re-add, entities/conversations/config-store rewire, DuckDB storage-pool removal | 1 week |
| **Indexer integration** (4.x) | indexer/index.ts, cross-file-resolver, plan-store, LLM graph tool | 1 week |
| **Dead-code skill + polish** (5.x + 6.x) | Dead-code analyzer, backup CLI, schema-version, benchmarks, doc updates | 1 week |

Phasing favors *correctness* of the foundation before any new feature
work. The dead-code skill (5.1) is the headline new capability this plan
unblocks but it's last -- everything before it is required for the
daemon to come back up at all.

## Risk register

| Risk | Mitigation |
|---|---|
| `lmdb-js` is essentially single-maintainer (Kris Zyp) | He's also the author of `msgpackr` and `cbor-x`, works on this stuff full-time at HarperDB which uses it in production. The C library underneath is rock-solid even if the Node binding stalled. Worst case: pin a version, the on-disk format is stable across LMDB versions for ~15 years |
| LMDB max DB size set at env open | Set generously (e.g. 1 TiB). Sparse on disk -- doesn't actually allocate. macOS / Linux handle the VM range trivially on 64-bit |
| LMDB single-writer serializes re-indexing | Already the case (parser is the bottleneck). For large monorepo first-index, pre-parse N files in worker_threads, then drain into single LMDB write loop |
| Custom code = our bugs forever | Bounded: ~1500 LOC. Comprehensive test suite (6.1 benchmark gate). The algorithms are textbook; the schema is simple. Compare to debugging Kuzu segfaults or DuckDB checkpoint OOMs in C++ we don't own |
| Migration friction (users re-index everything) | Acceptable: users already had to wipe their store. Communicate via release notes |
| Performance regression vs DuckDB-graph | Unlikely (LMDB cursor scans are mmap-fast vs DuckDB B-tree walks), but 6.1 benchmark suite catches it |
| LMDB max key size (511 bytes by default; configurable to 1024 in `lmdb-js`) | Our keys are bounded: out_edge / in_edge = 17 bytes, name_index ≤ ~256 bytes (long FQNs). Set MDB_MAXKEYSIZE = 1024 at env open to be safe |
| Stale reader slots from killed daemon processes | `mdb_reader_check()` at daemon startup + periodic re-check. See "Reader-slot management" |
| Page-level corruption (LMDB checksums meta only, not data) | Rely on filesystem checksums (ZFS / btrfs / APFS); backup as recovery path. Documented in operations playbook (Phase 7.5) |
| Substrate doesn't scale at production load (the failure mode that bit DuckDB) | **Phase 0.4 derisking spike is a hard gate before any caller code is rewired.** See "Scale validation strategy" |

## Open questions

| Question | Default | Needs decision before |
|---|---|---|
| Should the LLM-facing graph tool expose a query DSL or a narrow find/closure API? | Narrow API (matches today's caller pattern; easier to validate; no SQL injection class) | Phase 4.4 |
| Auto-reindex registered repos on first post-migration boot, or wait for user command? | Wait (avoid surprise CPU on daemon start) | Phase 4.1 |
| Single LMDB env, or one env per repo? | Single env (simpler; cross-repo queries trivial; LMDB scales to TiB) | Phase 1.1 |
| Embedding column on entity, or separate Lance table keyed by entity_id? | Separate Lance table (current design pre-consolidation; entity row stays compact) | Phase 3.1 |
| Edge props for CALLS (siteCount) -- store on the edge, or aggregate later? | Store on edge (cheap; useful for ranking call sites) | Phase 1.4 |
| Should we keep `~/.insrc/duckdb.db` boot-time delete logic? | Log-and-leave (user already cleaned up; auto-delete adds destructive code path with no upside) | Phase 3.3 |

## Out-of-scope follow-ups

- **Streaming graph updates to the IDE.** Today the IDE re-fetches; could
  push deltas. Out of scope for v1.
- **Cross-repo dead-code.** Today the closure is per-repo. Cross-repo
  reachability would need a federated entry-point set. Plausible v2.
- **Persistent reachability cache.** The reachability set is recomputed
  per query. Caching it (and invalidating per-file) is a 2-3 day project
  worth doing once the basic capability ships and we measure actual
  query frequency.
- **GQL / Cypher-ish query DSL.** If we ever expose graph queries to end
  users (vs internal callers + LLM via narrow tools), we revisit. Not
  today.
