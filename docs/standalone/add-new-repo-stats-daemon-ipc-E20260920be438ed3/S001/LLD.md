<!-- insrc:artifact LLD-be438ed37a36f5fc-S001 -->

# LLD: E20260920be438ed3:S001

**Epic:** `add-new-repo-stats-daemon-ipc`
**HLD base run:** `wf-1789919341873-xbemgn`
**HLD effective hash:** `be438ed37a36...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal-shared

### `repo.stats`

```typescript
'repo.stats': (params?: { repoPath?: string }) => Promise<RepoStats | RepoStats[] | { error: string }>
```

**Parameters:**
- `repoPath: string | undefined` _(optional)_ — The registered repo root (absolute path) to report stats for. When omitted, stats for EVERY registered repo are returned as an array.

**Returns:** `RepoStats | RepoStats[] | { error: string }` — With repoPath: the single RepoStats for that registered repo, or `{ error }` when repoPath is not a registered repo. Without repoPath: RepoStats[] (one per registered workspace repo, in listRepos order; a registered repo with zero indexed entities yields a zero-count RepoStats, never omitted). The daemon server frames the returned value as `result` (a returned `{error}` reads as ok=false via the client transport). [c3][c5]

**Errors:**
- `returned {error}` when repoPath is provided but is not a registered workspace repo (listRepos has no matching path) — returned as `{ error: 'repo.stats: <path> is not a registered repo' }`, not thrown. [c3]
- `none (best-effort)` when a source file that vanished since indexing contributes 0 to sizeBytes rather than throwing; the handler never throws for a readable store. [c5]

**Preconditions:**
- The graph store is open (getGraphStore()) and the repo registry is readable (listRepos). [c1][c3]

**Postconditions:**
- The response reflects the graph + registry + queue at call time (a live snapshot, not cached); read-only — no store/registry/queue mutation. [c5]

### `RepoStats`

```typescript
interface RepoStats { repoPath: string; status: RepoStatus; lastIndexed?: string; addedAt: string; errorMsg?: string; fileCount: number; filesByLanguage: Record<string, number>; entityCount: number; entityCountByKind: Record<string, number>; relationCount: number; sizeBytes: number; pendingJobs: number }
```

**Returns:** `RepoStats` — NEW type in src/shared/types.ts — the combined per-repo statistics object. registry fields (status via the existing RepoStatus union, lastIndexed?, addedAt, errorMsg?) copied verbatim from the listRepos() row; fileCount = distinct indexed source files; filesByLanguage = distinct-file count keyed by Language; entityCount = total entities; entityCountByKind = counts keyed by EntityKind; relationCount = edges attributed to this repo (by source entity); sizeBytes = summed on-disk bytes of the distinct source files (best-effort); pendingJobs = queued index jobs for this repo. [c1][c2][c3]

**Postconditions:**
- Serializes cleanly over JSON-RPC (all fields are scalars or Record<string,number>); mirrored into the JetBrains plugin's DTOs only in the LATER follow-up story, not here.

### `buildRepoStats`

```typescript
function buildRepoStats(input: { entities: Iterable<{ repo: string; file: string; kind: EntityKind; language: Language }>; relationSourceRepos: Iterable<string>; registeredRepos: RegisteredRepo[]; sizeOf: (repoPath: string, files: ReadonlySet<string>) => number; pendingFor: (repoPath: string) => number }): RepoStats[]
```

**Parameters:**
- `entities: Iterable<{ repo; file; kind; language }>` — The decoded entity rows (from one store.entity.getRange() scan) — grouped by repo to derive fileCount/filesByLanguage/entityCount/entityCountByKind.
- `relationSourceRepos: Iterable<string>` — One entry per relation = the repo of that edge's SOURCE entity (resolved by the caller from the u64→repo map). Counted per repo to derive relationCount.
- `registeredRepos: RegisteredRepo[]` — The listRepos() rows — supply status/lastIndexed/addedAt/errorMsg and define which repos get a (possibly zero-count) RepoStats.
- `sizeOf: (repoPath, files) => number` — Injected best-effort on-disk sizing over a repo's distinct files (fs.statSync in prod; a fake in tests) — keeps buildRepoStats pure/testable.
- `pendingFor: (repoPath) => number` — Injected per-repo queue depth (IndexQueue.depthForRepo in prod; a fake in tests).

**Returns:** `RepoStats[]` — One RepoStats per registeredRepos entry (in that order). PURE: no store, fs, or queue access of its own — all I/O is injected via sizeOf/pendingFor. Entities whose repo is not a registered repo are ignored (never invent a repo). [c1][c5]

**Errors:**
- `none` when total function over the inputs; an empty entities/relations iterable yields zero-count RepoStats for each registered repo.

**Preconditions:**
- registeredRepos paths are the authoritative repo set; entities/relationSourceRepos are already decoded/resolved by the caller. [c1][c2]

**Postconditions:**
- Deterministic given identical inputs; the counting/grouping is fully unit-testable off-socket. [c5]

### `collectRepoStats`

```typescript
function collectRepoStats(store: GraphStore, registeredRepos: RegisteredRepo[], queue: IndexQueue): RepoStats[]
```

**Parameters:**
- `store: GraphStore` — The open graph store — scanned once via store.entity.getRange() (build per-entity {repo,file,kind,language} + a u64→repo map) and once via store.outEdge.getRange() (resolve each edge's source u64 → repo).
- `registeredRepos: RegisteredRepo[]` — listRepos() rows passed through to buildRepoStats.
- `queue: IndexQueue` — The daemon's index queue — wraps queue.depthForRepo as the pendingFor injection.

**Returns:** `RepoStats[]` — The thin store/fs/queue-reading caller that does the two getRange scans + fs sizing + queue read, then delegates all counting/grouping to the pure buildRepoStats. Lives in the new src/daemon/repo-stats.ts. The inline repo.stats handler calls this and filters to repoPath when given. [c1][c2][c4]

**Errors:**
- `propagates` when a genuine store read error propagates (the handler is best-effort only for missing SOURCE files, not for a corrupt store). [c1]

**Preconditions:**
- store is open.

**Postconditions:**
- Read-only over the store/registry/queue. [c5]

### `IndexQueue.depthForRepo`

```typescript
depthForRepo(repoPath: string): number
```

**Parameters:**
- `repoPath: string` — The repo root to count pending jobs for.

**Returns:** `number` — NEW read-only accessor on IndexQueue (src/daemon/queue.ts): the count of currently-queued IndexJobs attributable to repoPath — jobs whose repoPath === repoPath (full/reembed/doc-summarise-repo) or whose filePath is under repoPath+sep (file/config-file). Does NOT expose the private jobs array; the existing `get depth()` (global) is unchanged. [c4]

**Postconditions:**
- Pure read over the in-memory queue; O(queue length). [c4]

## Data model changes

### `RepoStats` — new

New interface in src/shared/types.ts (the mirrored IPC payload). Fields: repoPath, status (existing RepoStatus union), lastIndexed?, addedAt, errorMsg?, fileCount, filesByLanguage: Record<string,number>, entityCount, entityCountByKind: Record<string,number>, relationCount, sizeBytes, pendingJobs. No persisted-schema change — a wire/return type only. [c3]

**Call sites:**
- `src/shared/types.ts`
- `src/daemon/repo-stats.ts`
- `src/daemon/index.ts`

### `buildRepoStats + collectRepoStats (new module)` — new

New file src/daemon/repo-stats.ts: the PURE buildRepoStats aggregator + the thin store/fs/queue-reading collectRepoStats caller. buildRepoStats groups decoded entity rows by repo (fileCount/filesByLanguage via a per-repo Set<file> tagged by language; entityCount/entityCountByKind), counts relationSourceRepos per repo, and fills registry fields from registeredRepos + sizeOf + pendingFor. collectRepoStats does the two store.entity/outEdge getRange scans (building the u64→repo map to resolve edge sources) + fs sizing + queue read. [c1][c2]

**Call sites:**
- `src/db/graph/store.ts`
- `src/db/graph/codec.ts`
- `src/db/repos.ts`
- `src/daemon/queue.ts`

### `IndexQueue.depthForRepo` — field-add

Add a read-only method depthForRepo(repoPath) to IndexQueue (src/daemon/queue.ts) counting queued jobs attributable to the repo (repoPath match or filePath-under-repo). The private `queue: IndexJob[]` and the existing `get depth()` are unchanged; the array is NOT exposed. [c4]

**Call sites:**
- `src/daemon/queue.ts`
- `src/shared/types.ts`

### `repo.stats handler` — new

New inline handler in the src/daemon/index.ts handler map (next to repo.list :535 / daemon.status :895): resolve getGraphStore() + listRepos(db) + the queue, call collectRepoStats, then return the single RepoStats for params.repoPath (or `{error}` when unregistered) or the full RepoStats[] when omitted. No new DB. [c5]

**Call sites:**
- `src/daemon/index.ts`

## Error paths

### Error cases

- **repo.stats is called with a repoPath that is not a registered workspace repo.** (recoverable)
  - Detection: collectRepoStats/the handler finds no listRepos() row whose path === params.repoPath (the same registered-set check isProjectRegistered uses).
  - Response: Return `{ error: 'repo.stats: <path> is not a registered repo' }` (the daemon-wide returned-{error} convention) — NOT thrown, so the client transport reads it as ok=false.
  - User impact: A clear 'not a registered repo' error instead of empty/fabricated stats; the caller can correct the path or repo.add first.
- **A source file that was indexed has since been deleted/moved on disk when sizeBytes is computed.** (recoverable)
  - Detection: fs.statSync(file) inside the injected sizeOf throws ENOENT (or EACCES).
  - Response: Catch per-file and contribute 0 for that file; sizeBytes is a best-effort sum. The scan never throws for a missing source file.
  - User impact: sizeBytes is slightly under-counted for a repo with stale-deleted files rather than the whole call failing; counts (which come from the graph, not the fs) are unaffected.
- **The graph store cannot be read (env locked by a writer, corrupted, or getGraphStore() fails).** (recoverable)
  - Detection: getGraphStore() or store.entity/outEdge.getRange() throws (LmdbStoreError / lock conflict).
  - Response: The error propagates out of the handler (best-effort applies ONLY to missing source files, never to a broken store); the daemon server frames it as a top-level error → the client sees ok=false with the store message.
  - User impact: The caller gets an honest store-unavailable error rather than a silently-empty stats set; retry after the store recovers.
- **An out-edge whose SOURCE entity U64 is not present in the entity scan's u64→repo map (a dangling/unresolved edge).** (recoverable)
  - Detection: The u64→repo map lookup for the edge's source returns undefined during the outEdge pass.
  - Response: Skip that edge (attribute it to no repo) rather than throwing or inventing a repo; relationCount counts only edges whose source resolves to a known entity/repo.
  - User impact: relationCount reflects only well-formed edges; a rare dangling edge is silently not counted rather than crashing the call.

### Edge cases

| Input | Expected |
| :--- | :--- |
| repoPath omitted and there are zero registered repos. | Returns an empty array `[]` (never null/error) — a valid 'no repos registered' response. |
| A registered repo that has never been indexed (status 'pending', no entities/edges yet). | A zero-count RepoStats {fileCount:0, filesByLanguage:{}, entityCount:0, entityCountByKind:{}, relationCount:0, sizeBytes:0, pendingJobs: <its queued depth>} carrying its registry status/addedAt — the repo is present, not omitted. |
| The entity sub-DB contains rows whose repo is NOT a currently-registered repo (stale rows left after repo.remove before a sweep). | Those rows are ignored — buildRepoStats only emits RepoStats for registeredRepos entries and never invents a repo from an orphan entity row. |
| A single source file has entities tagged with more than one language (mixed-language file), or the same file path appears under multiple entities. | fileCount counts the distinct file path ONCE; filesByLanguage counts the file under each language it appears with (distinct (file,language) pairs), so the byLanguage buckets can sum to ≥ fileCount — documented behaviour, not a bug. |
| A cross-repo DEPENDS_ON edge (source entity in repo A, target in repo B). | The relation is attributed to repo A (the SOURCE entity's repo) — the defined attribution convention; it is counted once, under A only. |
| repoPath is provided but non-normalized (trailing slash / different casing) vs the registry's stored absolute path. | Matched against listRepos() paths exactly (same semantics as isProjectRegistered); a non-matching spelling yields the not-registered `{error}`, not a silent empty result. |

### Invariants to preserve

- repo.stats is READ-ONLY: it never mutates the graph store, the repo registry, or the index queue — exactly like the existing daemon.status handler which only reads listRepos()+queue.depth. No indexing is triggered. [[c5]]
- No new DB and no graph SCHEMA change: the counts come from scanning the EXISTING entity + outEdge sub-DBs (store.entity.getRange() / store.outEdge.getRange() + decodeEntityRow), the same iteration idiom traversal.ts/migrations.ts already use; SCHEMA_VERSION is untouched. [[c1]]
- Repo attribution follows the graph's own tagging: an entity belongs to entity.repo and a relation belongs to its SOURCE entity's repo (edges are within-repo for CALLS/DEFINES; cross-repo edges follow DEPENDS_ON) — dependency-closure scoping (Rule 3) is respected, not re-implemented. [[c2]]
- The registry read is the SAME listRepos(db) daemon.status/isProjectRegistered use; status/lastIndexed/addedAt/errorMsg are copied verbatim from the RegisteredRepo row — no registry shape or semantics change. [[c3]]
- IndexQueue encapsulation holds: only a new read-only depthForRepo(repoPath) accessor is added; the private `queue: IndexJob[]` array is never exposed and the existing global `get depth()` is unchanged. [[c4]]
- buildRepoStats stays PURE: it performs no store/fs/queue I/O of its own — all side-effecting reads (fs sizing, queue depth) are injected via sizeOf/pendingFor — so the counting/grouping is deterministic and unit-testable off-socket, mirroring buildSettingsCatalog. [[c5]]

## Test strategy

**Test framework:** `node:test via tsx (npx tsx --test 'src/**/__tests__/*.test.ts'), matching the existing src/db/graph/__tests__ (real tmpdir store via setGraphStorePath/closeGraphStore) and the src/daemon source-scan idiom (config-catalog-contract). No new framework.`

### Test levels

- **unit** — Prove the PURE buildRepoStats aggregator: per-repo grouping, all counts/breakdowns, and every edge case, over seeded in-memory rows with injected sizeOf/pendingFor (no store, no fs, no socket).
  - Subjects: `fileCount = distinct file paths per repo; filesByLanguage = distinct (file,language) pairs (a mixed-language file counts once in fileCount but in each language bucket)`, `entityCount = total rows for the repo; entityCountByKind groups by EntityKind`, `relationCount = count of relationSourceRepos entries per repo (source-repo attribution); a source-repo not in registeredRepos and a dangling source are ignored`, `registry fields (status/lastIndexed?/addedAt/errorMsg?) copied verbatim from the RegisteredRepo row; a registered repo with zero entities yields a zero-count RepoStats (present, not omitted)`, `sizeBytes = the value returned by the injected sizeOf for that repo's distinct file set; pendingJobs = the injected pendingFor(repoPath)`, `an entity row whose repo is not a registered repo is ignored (never invents a repo); an empty entities/relations input yields all-zero RepoStats per registered repo`
  - Fixtures: `in-memory arrays of {repo,file,kind,language} rows + relationSourceRepos strings across 2 registered repos + a repo with no rows`, `fake RegisteredRepo[] rows (status/lastIndexed/addedAt/errorMsg) + a stub sizeOf returning a known number + a stub pendingFor`
- **unit** — Prove the new IndexQueue.depthForRepo read accessor attributes each IndexJob variant to the right repo and preserves encapsulation.
  - Subjects: `a full/reembed/doc-summarise-repo job with repoPath===R counts toward R; a file/config-file job whose filePath is under R+sep counts toward R`, `a job for another repo (or a global config-full) does NOT count toward R`, `depthForRepo returns 0 for a repo with no queued jobs; the existing global get depth() is unchanged and the private jobs array is not exposed`
  - Fixtures: `an IndexQueue seeded via enqueue() with a mix of IndexJob variants across two repos`
- **integration** — Prove collectRepoStats over a REAL tmpdir graph store: the two getRange scans + u64→repo edge attribution + best-effort fs sizing produce correct RepoStats end to end.
  - Subjects: `seed entities across two repos (with real file paths on disk) + out-edges (incl. a cross-repo edge) via the store put APIs, then assert collectRepoStats yields the expected per-repo fileCount/filesByLanguage/entityCount/entityCountByKind/relationCount`, `sizeBytes reflects the summed on-disk bytes of the seeded files; a seeded entity whose file was NOT written to disk contributes 0 to sizeBytes without throwing`, `a cross-repo edge is counted under its source repo only`
  - Fixtures: `setGraphStorePath(tmpdir) + closeGraphStore in setup/teardown (the src/db/graph/__tests__ idiom); a few real temp source files to size; a fake/seeded IndexQueue`
- **unit** — Source-scan guard for the inline repo.stats handler (the daemon handler map is not unit-bootable) — the config-catalog-contract idiom.
  - Subjects: `src/daemon/index.ts registers a 'repo.stats' handler that delegates to collectRepoStats/buildRepoStats and returns a single RepoStats for params.repoPath else the RepoStats[] array`, `the handler returns `{ error }` (not throw) when repoPath is not in listRepos(), and is READ-ONLY (no writeFileSync/setConfigAtPath/store put/enqueue in the handler body)`, `src/shared/types.ts declares the RepoStats interface`
  - Fixtures: `read of src/daemon/index.ts + src/daemon/repo-stats.ts + src/shared/types.ts source`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `source-scan: repo.stats handler returns a single RepoStats for params.repoPath and RepoStats[] when omitted`, `integration: collectRepoStats returns one RepoStats per registered repo in one call` |
| `ac2` | `unit(buildRepoStats): fileCount distinct + filesByLanguage distinct (file,language) + entityCountByKind grouping`, `integration: per-repo fileCount/filesByLanguage/entityCountByKind over the seeded store` |
| `ac3` | `unit(buildRepoStats): entityCount total + relationCount by source-repo attribution (orphan/dangling ignored)`, `integration: relationCount incl. a cross-repo edge counted under its source repo only` |
| `ac4` | `unit(buildRepoStats): sizeBytes = injected sizeOf result`, `integration: sizeBytes = summed on-disk bytes; a missing seeded file contributes 0 without throwing` |
| `ac5` | `unit(IndexQueue.depthForRepo): per-variant repo attribution + filePath-under-repo + zero`, `unit(buildRepoStats): pendingJobs = injected pendingFor(repoPath)` |
| `ac6` | `unit(buildRepoStats): registry fields copied verbatim; zero-count RepoStats for a never-indexed registered repo (present, not omitted)`, `unit(buildRepoStats): an entity row for an unregistered repo is ignored; omitted-param with zero repos returns []` |
| `ac7` | `source-scan: repo.stats returns {error} (not throw) for an unregistered repoPath and is read-only (no store/registry/queue mutation)`, `unit(buildRepoStats): pure — no store/fs/queue access, deterministic over inputs` |

## Migration

**State before:** The daemon exposes NO per-repo index-statistics IPC. Per-repo data available today is only the registry metadata via repo.list (src/daemon/index.ts:535 → listRepos(db), src/db/repos.ts:213: status/lastIndexed/addedAt/errorMsg) and daemon-wide totals via daemon.status (index.ts:895: GLOBAL queue.depth at :900 and whole-shared-env lmdbFileSizeMb at :909). Per-repo file/entity/relation counts, per-repo size, and per-repo queue depth do not exist. The counting substrate DOES exist: entities are scannable via store.entity.getRange()+decodeEntityRow (src/db/graph/store.ts:204, codec.ts:174) with row.repo/file/kind/language (src/shared/types.ts:577), edges via store.outEdge.getRange(), and the IndexQueue (src/daemon/queue.ts:15) holds repoPath/filePath-tagged IndexJobs but only exposes a global `get depth()` (:22).

**State after:** A new read-only `repo.stats` IPC handler is registered inline in src/daemon/index.ts's handler map. It resolves getGraphStore()+listRepos(db)+the queue and delegates to a new module src/daemon/repo-stats.ts (pure buildRepoStats + thin collectRepoStats) that does one entity scan + one outEdge scan to produce a RepoStats per registered repo. IndexQueue gains a read-only depthForRepo(repoPath) accessor. A new RepoStats interface is added to src/shared/types.ts. With a repoPath the handler returns that repo's RepoStats (or {error} when unregistered); omitted, it returns RepoStats[] for all registered repos. No new DB, no graph schema change, no persisted-format change — pure additive read surface.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the RepoStats interface to src/shared/types.ts (additive type export; references the existing RepoStatus/EntityKind/Language unions). No existing type changes. — ↩ rollbackable
2. Add the read-only depthForRepo(repoPath) method to IndexQueue in src/daemon/queue.ts (additive; the private jobs array and existing get depth() are untouched). — ↩ rollbackable
3. Create src/daemon/repo-stats.ts with the pure buildRepoStats aggregator and the thin collectRepoStats(store, registeredRepos, queue) caller (two getRange scans + best-effort fs sizing + queue read). — ↩ rollbackable
4. Register the inline `repo.stats` handler in the src/daemon/index.ts handler map (delegates to collectRepoStats; single-vs-array by params.repoPath; {error} for an unregistered repoPath). Additive — no existing handler changes. — ↩ rollbackable
5. Add tests: unit(buildRepoStats), unit(IndexQueue.depthForRepo), integration(collectRepoStats over a tmpdir store), and the index.ts source-scan guard. Run npx tsx --test 'src/**/__tests__/*.test.ts'. — ↩ rollbackable

**Backward compat:** Fully backward compatible — purely additive. No existing IPC method, type, or on-disk format changes: repo.list/daemon.status/IndexQueue.depth keep their exact shapes; the only additions are a new IPC method (repo.stats), a new type (RepoStats), a new module (repo-stats.ts), and a new read-only queue accessor (depthForRepo). An older client that never calls repo.stats is unaffected; a newer client that calls it against an older daemon gets the standard 'unknown method' error. The JetBrains plugin is NOT touched this story (its DTO mirror is a later follow-up).

## Alternatives considered

### a1: Single whole-graph pass → per-repo map; source-file bytes for size; new depthForRepo — **CHOSEN**

buildRepoStats scans the entity sub-DB once (building a per-repo accumulator + a U64→repo map), scans outEdge once attributing each relation to its source entity's repo, sizes each repo by summing its distinct source files' on-disk bytes, and reads per-repo pending depth via a new IndexQueue.depthForRepo(repoPath).

Add a pure `buildRepoStats(...)` aggregator plus its thin store-reading caller. The reader does ONE store.entity.getRange() pass grouping into Map<repo, accumulator> + a u64→repo side map, then ONE store.outEdge.getRange() pass counting each edge against its SOURCE entity's repo. Per-repo SIZE = sum of fs.statSync(file).size over the repo's distinct source files (best-effort 0 on a missing file). Registry fields from the listRepos() row; per-repo queued depth via a new read-only IndexQueue.depthForRepo. The inline repo.stats handler returns RepoStats (repoPath given) or RepoStats[] (omitted).

### a2: Per-repo filtered scan (repoPath-scoped), loop for all-repos

buildRepoStats(store, repoPath) scans entities/edges but accumulates only rows whose repo === repoPath; the handler loops it per registered repo when repoPath is omitted.

Same RepoStats shape and same registry/queue/size sources as a1, but the aggregator is scoped to ONE repo (skip rows where row.repo !== repoPath). For the all-repos call the handler iterates listRepos() and invokes the scoped aggregator once per repo.

**Rejected because:** Correct and simplest per-call, but the all-repos path is materially less efficient (per-repo re-scan) than a1's single grouped pass (c-all-repos-efficient only partial); only preferable if the all-repos call never happens.

### a3: Graph-only (no filesystem): indexed-byte size + public-edges relation count

Size is the sum of the repo's indexed entity-row byte lengths (no fs.statSync), and relation count is summed via the public outNeighbors() edges API per repo entity rather than a raw outEdge scan.

Same RepoStats shape and single-pass entity grouping as a1, but SIZE = sum of the repo's entity-row byte lengths (no fs access) and RELATION COUNT = sum of outNeighbors(store, u64).length over the repo's entities (the public edges API) instead of a raw outEdge scan.

**Rejected because:** Its no-fs determinism is a genuine plus, but it trades the intuitive on-disk 'repo size' for indexed bytes (c-size-intuitive partial) and pays per-entity edge-call overhead for the relation count — both worse fits than a1 for the stated SIZE/relation fields.

## Open questions

- [object Object]

## Citations

- **[[c1]]** `analyze-bundle` `s1 grounding: entities are enumerated via store.entity.getRange()+decodeEntityRow (src/db/graph/store.ts:204, codec.ts:174); Entity carries repo/file/kind/language (src/shared/types.ts:577); no per-repo entity index exists, so a single grouped full scan is the reuse path.`
- **[[c2]]** `analyze-bundle` `s1 grounding: relations are edges in outEdge/inEdge (store.ts:204); a relation attributes to its SOURCE entity's repo; edges.ts outNeighbors/inNeighbors + traversal.ts closure; Rule-3 dependency-closure scoping.`
- **[[c3]]** `analyze-bundle` `s1 grounding: listRepos(db) (src/db/repos.ts:213) → RegisteredRepo{status,lastIndexed?,addedAt,errorMsg?}; the same read daemon.status (index.ts:899) and isProjectRegistered use; consumed unchanged.`
- **[[c4]]** `analyze-bundle` `s1 grounding: IndexQueue (src/daemon/queue.ts:15) FIFO of IndexJob with a private jobs array + only a global get depth() (:22); IndexJob variants carry repoPath/filePath (src/shared/types.ts:697) → a new read-only depthForRepo accessor is required.`
- **[[c5]]** `analyze-bundle` `s1 grounding: daemon IPC handlers are inline in src/daemon/index.ts's handler map (repo.list :535, daemon.status :895) delegating to helpers; DaemonStatus's lmdbFileSizeMb is the WHOLE env; the new handler must be inline + delegate to a PURE buildRepoStats (like buildSettingsCatalog), read-only.`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-20T16:00:18.463Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | The graph store exposes an `entity` sub-DB scannable via getRange() and decodeEntityRow decodes each row (the entity-enumeration substrate buildRepoStats reuses). | entity:AnyDb + export const decodeEntityRow + store.entity.getRange( all resolve in src (13 src hits for the scan idiom). | None; the entity-enumeration substrate exists as cited. |
| cl2 | semantic | LOW | manual | An Entity carries repo (repo root abs path), file (abs file path), kind: EntityKind, and language: Language — the fields buildRepoStats groups by. | interface Entity + file:string + kind:EntityKind + language:Language resolve in src (the Entity interface at types.ts:577); repo:string's pattern was crowded out of the truncated top-50 but the Entity interface carries repo per the grounding read. | None; Entity carries repo/file/kind/language. |
| cl3 | citation | LOW | manual | Relations are stored as outEdge/inEdge sub-DBs on the GraphStore; collectRepoStats scans store.outEdge.getRange() to attribute relations. | outEdge:AnyDb and inEdge:AnyDb both resolve in src/db/graph/store.ts. | None; the edge sub-DBs exist as cited. |
| cl4 | citation | LOW | manual | listRepos(db) returns RegisteredRepo[] with status/lastIndexed/addedAt/errorMsg, and daemon.status already consumes it — buildRepoStats reuses the same registry read unchanged. | export async function listRepos, `repos: await listRepos(db)`, interface RegisteredRepo, status:RepoStatus all resolve in src. | None; the registry read is reused unchanged. |
| cl5 | citation | LOW | manual | IndexQueue holds a private jobs array and exposes only a global `get depth()`; a new read-only depthForRepo(repoPath) accessor is added (the private array stays hidden, get depth() unchanged). | class IndexQueue, private readonly queue: IndexJob[], get depth(): number all resolve in src/daemon/queue.ts. | None; only a new depthForRepo accessor is added, encapsulation preserved. |
| cl6 | closed-union | LOW | manual | IndexJob variants carry the repo via repoPath (full/reembed/doc-summarise-repo) or filePath (file/config-file), enabling per-repo depth attribution. | All four IndexJob variants (full/file/reembed/doc-summarise-repo with repoPath/filePath) resolve in src/shared/types.ts. | None; per-repo attribution is well-founded. |
| cl7 | citation | LOW | manual | Daemon IPC handlers are inline in the src/daemon/index.ts handler map; repo.list is registered at :535 and daemon.status at :895 — the new repo.stats handler sits alongside them. | 'repo.list': async (:535) and 'daemon.status': async (:895) resolve in src/daemon/index.ts; 'repo.stats' has NO src hit — correct, it is the new handler this story adds. | None; the new handler sits alongside the existing inline handlers. |
| cl8 | citation | LOW | manual | daemon.status computes lmdbFileSizeMb over the WHOLE shared LMDB env (statSync(PATHS.lmdb)) and surfaces only a GLOBAL queue.depth — so per-repo size/queue are genuinely new. | queueDepth: queue.depth, lmdbFileSizeMb, statSync(PATHS.lmdb) all resolve in src/daemon/index.ts — confirming per-repo size/queue are genuinely new. | None. |
| cl9 | semantic | LOW | manual | RepoStatus is an existing type/union (RepoStats.status reuses it); RegisteredRepo.status is typed RepoStatus. | type RepoStatus (2 src) + status: RepoStatus confirm RepoStatus is an existing type RepoStats.status reuses. | None. |
| cl10 | citation | LOW | manual | The graph-store test idiom uses setGraphStorePath + closeGraphStore over a tmpdir (the integration test for collectRepoStats extends it). | setGraphStorePath + closeGraphStore resolve in src/db/graph/store.ts — the tmpdir test idiom the integration test extends. | None. |
