<!-- insrc:artifact PLAN-be438ed37a36f5fc-S001 -->

# Plan: E20260920be438ed3:S001

**Epic:** `add-new-repo-stats-daemon-ipc`
**LLD run:** `wf-1789919341873-xbemgn`
**LLD effective hash:** `be438ed37a36...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the RepoStats type to src/shared/types.ts | S | — | unit: tsc typecheck: RepoStats is exported from src/shared/types.ts with the LLD field shape (compiled implicitly by the build + the aggregator/source-scan tests importing it) | [[c3]] |
| 2 | **`t2`** Add IndexQueue.depthForRepo read accessor (src/daemon/queue.ts) | S | — | unit: IndexQueue.depthForRepo: a full/reembed/doc-summarise-repo job with repoPath===R counts toward R; a file/config-file job whose filePath is under R+sep counts toward R; unit: IndexQueue.depthForRepo: a job for another repo (or a global config-full) does NOT count toward R; returns 0 for a repo with no queued jobs; get depth() unchanged and the private jobs array not exposed | [[c4]] |
| 3 | **`t3`** Create src/daemon/repo-stats.ts (pure buildRepoStats + thin collectRepoStats) | M | `t1`, `t2` | unit: buildRepoStats: fileCount = distinct file paths per repo; filesByLanguage = distinct (file,language) pairs (a mixed-language file counts once in fileCount but in each language bucket); unit: buildRepoStats: entityCount = total rows for the repo; entityCountByKind groups by EntityKind; unit: buildRepoStats: relationCount = count of relationSourceRepos per repo (source-repo attribution); a source-repo not in registeredRepos and a dangling source are ignored; unit: buildRepoStats: registry fields copied verbatim from the RegisteredRepo row; a registered repo with zero entities yields a zero-count RepoStats (present, not omitted); unit: buildRepoStats: sizeBytes = the injected sizeOf value for the repo's distinct file set; pendingJobs = the injected pendingFor(repoPath); unit: buildRepoStats: an entity row whose repo is not a registered repo is ignored (never invents a repo); an empty entities/relations input yields all-zero RepoStats per registered repo; integration: collectRepoStats over a tmpdir store: seeded entities across two repos + out-edges (incl. a cross-repo edge) yield the expected per-repo fileCount/filesByLanguage/entityCount/entityCountByKind/relationCount; integration: collectRepoStats: sizeBytes reflects the summed on-disk bytes of the seeded files; a seeded entity whose file was NOT written to disk contributes 0 without throwing; integration: collectRepoStats: a cross-repo edge is counted under its source repo only | [[c1]] [[c2]] [[c4]] |
| 4 | **`t4`** Register the inline repo.stats handler in src/daemon/index.ts | S | `t3` | unit: source-scan: src/daemon/index.ts registers a 'repo.stats' handler that delegates to collectRepoStats/buildRepoStats and returns a single RepoStats for params.repoPath else the RepoStats[] array; unit: source-scan: the handler returns { error } (not throw) when repoPath is not in listRepos(), and is READ-ONLY (no writeFileSync/setConfigAtPath/store put/enqueue in the handler body); src/shared/types.ts declares the RepoStats interface | [[c5]] |
| 5 | **`t5`** Tests + local gate (tsc + test sweep) | M | `t3`, `t4` | smoke: npm run build (tsc) is clean and npx tsx --test 'src/**/__tests__/*.test.ts' passes (the full repo-stats unit + integration + source-scan suites green) | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |

### E20260920be438ed3:S001:T001 — Add the RepoStats type to src/shared/types.ts

Add the additive RepoStats interface (repoPath, status: RepoStatus, lastIndexed?, addedAt, errorMsg?, fileCount, filesByLanguage: Record<string,number>, entityCount, entityCountByKind: Record<string,number>, relationCount, sizeBytes, pendingJobs) reusing the existing RepoStatus/EntityKind/Language unions. No existing type changes.

**Acceptance checks:**
- src/shared/types.ts exports an interface RepoStats with exactly the LLD fields; status is typed RepoStatus; the byLanguage/byKind maps are Record<string,number>
- tsc passes; no existing type in types.ts is modified

### E20260920be438ed3:S001:T002 — Add IndexQueue.depthForRepo read accessor (src/daemon/queue.ts)

Add a read-only depthForRepo(repoPath): number method to IndexQueue that counts currently-queued IndexJobs attributable to repoPath — jobs whose repoPath===repoPath (full/reembed/doc-summarise-repo) or whose filePath is under repoPath+sep (file/config-file). The private queue array is NOT exposed and the existing get depth() is unchanged.

**Acceptance checks:**
- depthForRepo counts full/reembed/doc-summarise-repo jobs by repoPath and file/config-file jobs by filePath-under-repo; unrelated/global jobs are not counted; returns 0 for a repo with no jobs
- the private IndexJob[] stays private (no new getter exposing it) and get depth() is byte-unchanged

### E20260920be438ed3:S001:T003 — Create src/daemon/repo-stats.ts (pure buildRepoStats + thin collectRepoStats)

New module: pure buildRepoStats(entities, relationSourceRepos, registeredRepos, sizeOf, pendingFor) that groups entity rows per repo (fileCount = distinct files; filesByLanguage = distinct (file,language) pairs; entityCount; entityCountByKind), counts relationSourceRepos per repo, and fills registry + sizeOf + pendingFor — ignoring rows for unregistered repos, emitting one RepoStats per registered repo. Plus the thin collectRepoStats(store, registeredRepos, queue) that does one store.entity.getRange() scan (building the u64→repo map) + one store.outEdge.getRange() scan (resolving each source u64→repo, skipping danglers) + best-effort fs.statSync sizing (missing file → 0) + queue.depthForRepo, then delegates to buildRepoStats. The two symbols share the file + accumulator shape; the acceptanceChecks keep the pure-vs-I/O concerns separated.

**Acceptance checks:**
- buildRepoStats is PURE (no store/fs/queue access; sizeOf/pendingFor injected), deterministic, and emits one RepoStats per registeredRepos entry with correct counts/breakdowns; a mixed-language file counts once in fileCount but in each language bucket; a cross-repo edge is attributed to its SOURCE repo; unregistered-repo rows and dangling edges are ignored
- collectRepoStats reuses store.entity.getRange()+decodeEntityRow + store.outEdge.getRange() + listRepos-provided rows + queue.depthForRepo, sizes via fs.statSync with best-effort 0 on a missing file, and is read-only (no store/queue mutation)

### E20260920be438ed3:S001:T004 — Register the inline repo.stats handler in src/daemon/index.ts

Add a 'repo.stats' handler to the daemon handler map (next to repo.list/daemon.status): read getGraphStore()+listRepos(db)+the queue, call collectRepoStats, and return the single RepoStats for params.repoPath (or `{ error: 'repo.stats: <path> is not a registered repo' }` when unregistered) or the full RepoStats[] when repoPath is omitted. Additive; no existing handler changes; read-only.

**Acceptance checks:**
- 'repo.stats' is registered in the index.ts handler map and delegates to collectRepoStats/buildRepoStats; with repoPath it returns one RepoStats (or {error} when unregistered, not thrown); omitted returns RepoStats[] (=== [] when zero repos)
- the handler mutates nothing (no writeFileSync/setConfigAtPath/store put/enqueue) and does not alter repo.list/daemon.status

### E20260920be438ed3:S001:T005 — Tests + local gate (tsc + test sweep)

Add unit(buildRepoStats) over in-memory rows + stub sizeOf/pendingFor; unit(IndexQueue.depthForRepo) over an enqueue()-seeded queue; integration(collectRepoStats) over a real tmpdir store (setGraphStorePath/closeGraphStore) with seeded entities/edges + real temp files; and a source-scan of index.ts asserting the repo.stats handler shape + read-only. Run npm run build (tsc) + npx tsx --test 'src/**/__tests__/*.test.ts' locally (no GitHub CI).

**Acceptance checks:**
- unit + integration + source-scan tests cover the LLD test strategy (counts/breakdowns, size best-effort, per-repo queue depth, registry fields, zero-count/orphan/dangling/cross-repo edge, {error} for unregistered, read-only)
- tsc clean and the full test sweep passes locally

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| fileCount = distinct file paths per repo; filesByLanguage = distinct (file,language) pairs (a mixed-language file counts once in fileCount but in each language bucket) | `t3` |
| entityCount = total rows for the repo; entityCountByKind groups by EntityKind | `t3` |
| relationCount = count of relationSourceRepos entries per repo (source-repo attribution); a source-repo not in registeredRepos and a dangling source are ignored | `t3` |
| registry fields (status/lastIndexed?/addedAt/errorMsg?) copied verbatim from the RegisteredRepo row; a registered repo with zero entities yields a zero-count RepoStats (present, not omitted) | `t3` |
| sizeBytes = the value returned by the injected sizeOf for that repo's distinct file set; pendingJobs = the injected pendingFor(repoPath) | `t3` |
| an entity row whose repo is not a registered repo is ignored (never invents a repo); an empty entities/relations input yields all-zero RepoStats per registered repo | `t3` |
| a full/reembed/doc-summarise-repo job with repoPath===R counts toward R; a file/config-file job whose filePath is under R+sep counts toward R | `t2` |
| a job for another repo (or a global config-full) does NOT count toward R | `t2` |
| depthForRepo returns 0 for a repo with no queued jobs; the existing global get depth() is unchanged and the private jobs array is not exposed | `t2` |
| seed entities across two repos (with real file paths on disk) + out-edges (incl. a cross-repo edge) via the store put APIs, then assert collectRepoStats yields the expected per-repo fileCount/filesByLanguage/entityCount/entityCountByKind/relationCount | `t3` |
| sizeBytes reflects the summed on-disk bytes of the seeded files; a seeded entity whose file was NOT written to disk contributes 0 to sizeBytes without throwing | `t3` |
| a cross-repo edge is counted under its source repo only | `t3` |
| src/daemon/index.ts registers a 'repo.stats' handler that delegates to collectRepoStats/buildRepoStats and returns a single RepoStats for params.repoPath else the RepoStats[] array | `t4` |
| the handler returns `{ error }` (not throw) when repoPath is not in listRepos(), and is READ-ONLY (no writeFileSync/setConfigAtPath/store put/enqueue in the handler body) | `t4` |
| src/shared/types.ts declares the RepoStats interface | `t4`, `t1` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 invariant/grounding: entities scanned via store.entity.getRange()+decodeEntityRow yielding repo/file/kind/language — the source of file/entity counts + language/kind breakdown (buildRepoStats grouping).`
- **[[c2]]** `prior-artifact` `LLD S001 invariant/grounding: relations are outEdge/inEdge edges attributed to the SOURCE entity's repo (dependency-closure scoping) — the source of relationCount.`
- **[[c3]]** `prior-artifact` `LLD S001 contract: RepoStats type + the registry read (listRepos → RegisteredRepo status/lastIndexed/addedAt/errorMsg) consumed unchanged.`
- **[[c4]]** `prior-artifact` `LLD S001 contract: IndexQueue.depthForRepo new read-only accessor over the repoPath/filePath-tagged IndexJobs (private jobs array stays hidden, get depth() unchanged) — the source of pendingJobs.`
- **[[c5]]** `prior-artifact` `LLD S001 contract: the inline read-only repo.stats handler in src/daemon/index.ts's handler map delegating to collectRepoStats/buildRepoStats (single-vs-array by params.repoPath; {error} for unregistered).`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-20T16:06:51.514Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | manual | RepoStatus, EntityKind, and Language are existing types in src/shared/types.ts that RepoStats reuses. | type RepoStatus, type EntityKind, type Language all resolve in src/shared/types.ts; interface RepoStats has 0 src hits — correct, it is the new type t1 adds. | None. |
| t2 | citation | LOW | manual | IndexQueue has a private jobs array and a global get depth(); t2 adds depthForRepo without exposing the array. | class IndexQueue + private readonly queue + get depth() resolve in src/daemon/queue.ts; depthForRepo has 0 src hits — correct, it is the new accessor t2 adds. | None. |
| t2 | closed-union | LOW | manual | IndexJob variants carry repoPath (full/reembed/doc-summarise-repo) or filePath (file/config-file) for per-repo depth attribution. | All five IndexJob variants (full/reembed/doc-summarise-repo with repoPath, file/config-file with filePath) resolve in src. | None; per-repo depth attribution is well-founded. |
| t3 | citation | LOW | manual | collectRepoStats reuses store.entity.getRange()+decodeEntityRow, store.outEdge.getRange(), and listRepos — all existing. | decodeEntityRow, entity/outEdge sub-DBs, and listRepos all resolve in src — the reads collectRepoStats reuses. | None. |
| t4 | citation | LOW | manual | The daemon handler map in src/daemon/index.ts holds inline handlers (repo.list, daemon.status) where the new repo.stats handler is registered; repo.stats does not exist yet. | 'repo.list'/'daemon.status' handlers + getGraphStore + listRepos(db) resolve in src/daemon/index.ts; 'repo.stats' has 0 src hits — correct, it is the new handler t4 adds. | None. |
| t5 | citation | LOW | manual | The graph-store test idiom setGraphStorePath/closeGraphStore over a tmpdir exists (the integration test extends it). | setGraphStorePath + closeGraphStore resolve in src/db/graph/store.ts — the tmpdir test idiom the integration test extends. | None. |
| tasks | ordering | LOW | manual | Task order is a valid topological order: t3 depends on t1+t2, t4 on t3, t5 on t3+t4; acyclic. | Task dependency graph t3<-t1,t2; t4<-t3; t5<-t3,t4 is acyclic and order 1..5 is a valid topological order. | None. |
| tasks | closed-union | LOW | manual | The five tasks collectively cover the whole LLD handoff (c1 entities, c2 relations, c3 type+registry, c4 queue accessor, c5 handler) with every derivedFrom citation referenced. | derivedFrom union {c1,c2,c3,c4,c5} covers the full LLD handoff; every citation is referenced by ≥1 task. | None; coverage complete. |
