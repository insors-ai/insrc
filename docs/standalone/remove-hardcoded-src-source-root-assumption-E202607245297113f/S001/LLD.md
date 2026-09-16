<!-- insrc:artifact LLD-5297113fc7930e59-S001 -->

# LLD: S001

**Epic:** `remove-hardcoded-src-source-root-assumption`
**HLD base run:** `wf-1784886763349-q6w16f`
**HLD effective hash:** `5297113fc793...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `resolveSourceRoots`

```typescript
function resolveSourceRoots(repoPath: string, opts?: SourceRootsOpts): Promise<SourceRootsResult>
```

**Parameters:**
- `repoPath: string` — Absolute path of the registered repo whose real top-level code roots must be derived from the indexed LMDB graph (replaces the hardcoded join(repoPath, 'src') assumption).
- `opts: SourceRootsOpts` _(optional)_ — Optional enumeration knobs / injected graph-access dependency (e.g. the listEntitiesForRepo reader, dependency-injected for unit tests). Defaults resolve against the daemon graph.

**Returns:** `Promise<SourceRootsResult>` — The repo's real code roots, each carrying a fileCount for densest-first grep ordering and a coherent global MATCH_CAP, plus fallbackUsed=true when the graph yielded no paths and the repo root was substituted.

**Errors:**
- `no-throw / degraded-signal` when Graph yields zero indexed paths (unindexed / degraded repo) — the helper does NOT throw; it returns a single repo-root entry with fallbackUsed=true so the caller can log the degraded run instead of silently BLOCKing.

**Preconditions:**
- repoPath is a repo registered with the daemon (graph access flows through the daemon; the helper never opens LMDB directly).
- The injected graph reader is listEntitiesForRepo(db, repo): Promise<Entity[]> (src/db/entities.ts:747), confirmed in review as the real indexed-graph reader; the build step locks its exact Entity field shape via symbol.locate.

**Postconditions:**
- Result.roots is always non-empty — the repo-root fallback guarantees at least one root so probe grep/walk always has a target.
- Roots derived from real indexed file paths only; no literal 'src' segment is assumed anywhere.
- fallbackUsed reflects provenance: false when roots came from the graph, true when the repo root was substituted.

### `runGrep`

```typescript
async function runGrep(pattern: string, repoPath: string): Promise<GrepResult>
```

**Parameters:**
- `pattern: string` — The review probe search pattern, unchanged by this Story.
- `repoPath: string` — Repo root the probe runs against; the reshape derives real roots from it via resolveSourceRoots instead of appending a fixed 'src' segment.

**Returns:** `Promise<GrepResult>` — The per-pattern grep result (runGrep returns GrepResult, NOT ReviewVerdict — ReviewVerdict is a `'pass'|'warn'|'block'` union produced downstream by computeReviewVerdict). The fix only removes false BLOCKs caused by zero grep hits on non-src/ repos; the ReviewVerdict emit shape is unchanged.

**Preconditions:**
- Exact runGrep / runGrepSearch signatures to be confirmed via symbol.locate in the build step (not extracted in s1).

**Postconditions:**
- The literal join(repoPath, 'src') grep root at probe.ts:44 and walk at probe.ts:93 are replaced by iteration over resolveSourceRoots(repoPath).roots.
- Each returned match is re-prefixed with its OWNING derived root (per-root), not a fixed 'src/' string (fixes probe.ts:47).
- A single global MATCH_CAP is enforced across all roots (densest-root-first via fileCount), not MATCH_CAP-per-root inflation.
- The ReviewVerdict contract is unchanged — the reshape is confined to the probe's input/root-derivation logic.

### `listEntitiesForRepo`

```typescript
function listEntitiesForRepo(db: DbClient, repo: string): Promise<Entity[]>
```

**Parameters:**
- `db: DbClient` — Daemon DB handle from getDb(); listEntitiesForRepo internally reads the indexed LMDB graph via getGraphStore() (looks up repoId, scans the entity range), so graph access stays daemon-owned and never opens LMDB directly.
- `repo: string` — Absolute repo path used to resolve the repoId and scope the indexed-entity scan.

**Returns:** `Promise<Entity[]>` — Every indexed entity for the repo. resolveSourceRoots filters `kind==='file'` and projects each file entity's repo-relative `filePath` to its top-level segment to derive real code roots. This is the SAME graph reader concept-resolve.ts:548 and module-profile.ts:121 already use.

**Preconditions:**
- src/db/entities.ts:747 — a verified real GRAPH reader (reads the indexed LMDB graph, NOT the filesystem). It REPLACES the originally-cited `listFilesForConnection` (src/daemon/db/list-files.ts), which the review confirmed is a filesystem walker (readdir/stat) built for data-driver connection paths (csv/parquet) — it does not read the index. Entity carries `kind` (EntityKind incl. 'file'), `file` (absolute), and `filePath` (repo-relative).

**Postconditions:**
- No change to this API — it is consumed read-only, not modified.

## Data model changes

### `SourceRootsResult` — new

New internal-only return type for the source-root discovery helper. Shape: { roots: SourceRoot[]; fallbackUsed: boolean }. fallbackUsed makes the graph-empty/degraded run OBSERVABLE (the Story's core failure mode: a silent false BLOCK) rather than silent. Internal — does not touch the ReviewVerdict emit contract.

```
interface SourceRootsResult { roots: SourceRoot[]; fallbackUsed: boolean }
```

**Call sites:**
- `src/workflow/review/probe.ts:44`
- `src/workflow/review/probe.ts:93`

### `SourceRoot` — new

New internal record for one derived code root: { path: string; fileCount: number }. path replaces the hardcoded join(repoPath, 'src'); fileCount lets probe.ts grep densest roots first and enforce a coherent GLOBAL MATCH_CAP across roots (fixing the implicit N*MATCH_CAP inflation).

```
interface SourceRoot { path: string; fileCount: number }
```

**Call sites:**
- `src/workflow/review/probe.ts:44`

### `ReviewVerdict` — invariant-change

Shape UNCHANGED. The restored invariant: a BLOCK verdict must reflect a real absence of matches, not an artifact of grepping a non-existent src/ subtree. After the fix, repos with code outside src/ (e.g. AFM under mind/) produce real grep hits and no false BLOCK.

**Call sites:**
- `src/workflow/review/probe.ts`
- `src/workflow/review/types.ts`

## Error paths

### Error cases

- **The indexed-graph reader (listEntitiesForRepo / getGraphStore) throws or rejects while resolveSourceRoots is deriving roots — daemon graph connection dropped, LMDB read error, or the repo is not yet registered so the lookup errors.** (recoverable)
  - Detection: resolveSourceRoots awaits the graph reader inside a try/catch; the rejected promise (or thrown enumeration error) is caught at the derivation boundary, distinguishing a real read failure from a legitimately empty result set.
  - Response: Swallow the failure into the degraded path: return a single { path: repoPath, fileCount: 0 } root with fallbackUsed=true and log the caught error at warn level so the degraded provenance is observable; never rethrow into runGrep.
  - User impact: The probe still runs against the repo root instead of aborting the review, so no false BLOCK from a transient graph error; the review is broader/less precise but produces a real verdict, and the degraded run is visible in the logs.
- **A root derived from the indexed graph no longer exists on disk (graph stale relative to the filesystem — directory renamed/deleted since indexing) when runGrep greps or walks that root.** (recoverable)
  - Detection: runGrepSearch / walk for that specific root surfaces an ENOENT (directory-missing) error, caught per-root inside the root-iteration loop rather than at the whole-probe boundary.
  - Response: Skip only the missing root and continue iterating the remaining derived roots, logging the stale path at debug/warn; the global MATCH_CAP and densest-first ordering are computed over the roots that did resolve.
  - User impact: One stale root contributes no evidence but the probe still greps every live root, so a single indexing-vs-FS drift cannot manufacture a false BLOCK for the whole repo.
- **runGrepSearch fails for a non-ENOENT reason on one derived root (subprocess spawn failure, ripgrep non-zero exit, permission-denied on a subtree).** (recoverable)
  - Detection: The per-root runGrepSearch promise rejects with a non-ENOENT error; caught inside the per-root loop and inspected so it is not misread as 'zero matches'.
  - Response: Log the failing root + error and continue with the other roots; do not treat the failure as an authoritative zero-hit result that would drive a BLOCK verdict.
  - User impact: A tooling failure on one root degrades coverage rather than emitting a false BLOCK; the probe verdict reflects only roots that were actually searched.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A repo whose code lives entirely outside src/ (the core bug: AFM under mind/) — graph enumeration returns paths rooted at mind/. | resolveSourceRoots returns roots=[{ path: <repoPath>/mind, fileCount: N }], fallbackUsed=false; runGrep greps mind/, gets real hits, re-prefixes each match with mind/, and emits a truthful non-BLOCK verdict. |
| The indexed graph yields zero file paths (freshly-added / not-yet-indexed / degraded repo) — a valid registered repo with an empty path set. | resolveSourceRoots returns a single root { path: repoPath, fileCount: 0 } with fallbackUsed=true; runGrep greps the repo root so it always has a target and does not silently BLOCK. |
| A repo with multiple distinct top-level code roots (e.g. both src/ and mind/ hold indexed files). | resolveSourceRoots returns one SourceRoot per real top-level root; runGrep iterates all of them, orders densest-first by fileCount, and enforces a SINGLE global MATCH_CAP across the combined result set (not MATCH_CAP per root). |
| All indexed files sit directly at the repo root with no distinguishing top-level code subdirectory. | resolveSourceRoots collapses to a single root at repoPath (fileCount = total), fallbackUsed=false; grep/walk target the repo root without assuming any literal 'src' segment. |
| Combined grep hits across all derived roots exceed MATCH_CAP. | Exactly MATCH_CAP matches are returned globally, taken densest-root-first via fileCount ordering; the cap is not inflated to N*MATCH_CAP by the multi-root iteration. |
| A repo that legitimately does still keep its code under src/ (the previously-hardcoded layout). | resolveSourceRoots derives roots=[{ path: <repoPath>/src, ... }] from the graph and behaves identically to the old hardcoded path — no regression for src/-layout repos; matches are re-prefixed with src/ because that is the owning root, not because it is hardcoded. |

### Invariants to preserve

- The ReviewVerdict emit-side shape is unchanged: the reshape is confined to root derivation and grep input, and the probe still produces the same ReviewVerdict structure the review layer consumes. [[c2]]
- runGrep's caller contract is preserved — it still takes the review pattern + repoPath and returns Promise<GrepResult>; the source-root derivation is internal and invisible to callers. [[c3]]
- Every returned match must carry a path prefix identifying its owning root (the old fixed 'src/' re-prefix at probe.ts:47 becomes a per-root prefix), so downstream filename/existence logic that relied on prefixed match paths keeps working. [[c3]]
- Graph file-path access flows only through the indexed-graph reader listEntitiesForRepo (src/db/entities.ts, which wraps getGraphStore()); resolveSourceRoots must never open LMDB directly and must never fall back to a raw filesystem walk (that is what the mis-identified listFilesForConnection would have done). [[c1]]
- A single global MATCH_CAP governs the grep result set (the distinctive cap constant pinned at probe.ts:44); multi-root iteration must not multiply it into an N*MATCH_CAP inflation. [[c4]]
- Existing review-probe test coverage under src/workflow/review/__tests__/review.test.ts must continue to pass; the src/-layout fixtures (review.test.ts:30/249) still exercise a valid derived-root path and must not regress. [[c5]]

## Test strategy

**Test framework:** `node:test (tsx --test, *.test.ts under __tests__)`

### Test levels

- **unit** — Prove resolveSourceRoots derives real code roots from the injected graph file-path reader, applies the repo-root fallback when the graph is empty, orders densest-first, and stays within a single global MATCH_CAP — all in isolation with a stubbed enumeration surface so no daemon/LMDB is needed.
  - Subjects: `resolveSourceRoots (src/workflow/review/source-roots.ts new helper)`, `SourceRootsResult / SourceRoot shape`, `fallbackUsed provenance flag`
  - Fixtures: `Injected listEntitiesForRepo stub returning canned Entity[] (kind==='file' entities with filePath) for: (a) mind/-only layout, (b) src/-only layout, (c) multi-root src/+mind/, (d) files-at-repo-root layout, (e) zero-entity empty set`, `A rejecting/throwing graph-reader stub to exercise the degraded try/catch path`, `SourceRootsOpts with the listEntitiesForRepo reader dependency-injected so no live daemon graph is opened`
- **integration** — Prove runGrep, wired to resolveSourceRoots, greps the real derived roots of a temp repo, re-prefixes each match with its OWNING root, emits an unchanged ReviewVerdict shape with no false BLOCK for non-src/ layouts, and preserves the existing src/-layout coverage — extending src/workflow/review/__tests__/review.test.ts.
  - Subjects: `runGrep (src/workflow/review/probe.ts) end-to-end`, `ReviewVerdict emit contract (unchanged)`, `per-root match re-prefix + walk() over derived roots`
  - Fixtures: `Temp repo written with code under mind/ (non-src layout, the core AFM bug)`, `Temp repo with legacy code under src/ (regression guard, mirrors review.test.ts:30/249 fixtures)`, `Temp repo with both src/ and mind/ populated (multi-root)`, `Temp repo whose graph yields zero paths (fallback-to-repo-root)`, `A stale-root fixture: a graph-reported root that is deleted from disk before the probe runs (ENOENT per-root skip)`, `A large-hit fixture exceeding MATCH_CAP across combined roots to assert the global cap`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `runGrep on a repo with code only under mind/ returns real grep hits and a non-BLOCK ReviewVerdict (no false BLOCK)`, `resolveSourceRoots returns roots=[{path: <repo>/mind}] with fallbackUsed=false from a mind/-only graph` |
| `ac2` | `resolveSourceRoots on an empty graph path-set returns a single {path: repoPath, fileCount: 0} root with fallbackUsed=true`, `runGrep on a not-yet-indexed repo greps the repo root and does not silently BLOCK` |
| `ac3` | `resolveSourceRoots on a src/+mind/ multi-root graph returns one SourceRoot per real top-level root ordered densest-first by fileCount`, `runGrep iterates all derived roots and re-prefixes each match with its OWNING root (mind/ match keeps mind/ prefix, src/ match keeps src/ prefix)` |
| `ac4` | `combined grep hits exceeding MATCH_CAP return exactly MATCH_CAP matches globally, taken densest-root-first (no N*MATCH_CAP inflation)` |
| `ac5` | `resolveSourceRoots on a legacy src/-only graph derives roots=[{path: <repo>/src}] and runGrep behaves identically to the old hardcoded path (no regression)`, `existing review.test.ts src/-layout probe fixtures continue to pass unchanged` |
| `ac6` | `resolveSourceRoots collapses to a single root at repoPath (fileCount=total, fallbackUsed=false) when all indexed files sit directly at the repo root` |
| `ac7` | `resolveSourceRoots catches a rejecting graph reader, returns {path: repoPath, fileCount: 0} with fallbackUsed=true, logs at warn, and never rethrows into runGrep`, `runGrep with a stale (deleted-on-disk) derived root skips only that root on ENOENT and still greps the remaining live roots` |
| `ac8` | `runGrep emits the same ReviewVerdict structure the review layer consumes (emit-side shape unchanged) across mind/, src/, and multi-root fixtures`, `resolveSourceRoots reads file paths only through the injected listEntitiesForRepo surface and never opens LMDB directly nor walks the filesystem (verified via the injected-reader stub being the sole path source)` |

## Migration

**State before:** Per s1 analyze bundles (symbol.locate + usage.example + search.text on src/workflow/review/probe.ts, entityId 880517bb2b2445724ba5803349938972), the review probe's grep driver `runGrep` nails the source root to a literal `src/` subtree in three places: probe.ts:44 calls `runGrepSearch({ pattern, root: join(repoPath, 'src'), limit: MATCH_CAP })`, probe.ts:47 re-prefixes every returned match with a fixed `src/` string, and probe.ts:93 walks `join(repoPath, 'src')` for filename-existence checks. No source-root resolver exists anywhere in the module (search.text found only these two probe.ts sites plus `src/` test fixtures at review.test.ts:30/32/246/249). Consequence: any repo whose code lives outside `src/` (e.g. AFM under `mind/`) yields zero grep hits, so `ReviewVerdict` (src/workflow/review/types.ts, entityId 3cbfdef9e13f3e5880216a6dade3ec95) emits a false BLOCK. The LMDB graph (`GraphStore`, src/db/graph/store.ts, entityId 34a29a1878eab61f6ed65c796b2b5da5) already holds every indexed file path, enumerable via `listEntitiesForRepo(db, repo): Promise<Entity[]>` (src/db/entities.ts:747, filter kind==='file') — the same graph reader concept-resolve.ts:548 and module-profile.ts:121 use — but the probe does not read from it. (Review correction: the s1 grounding mis-named this surface as `listFilesForConnection` in src/daemon/db/list-files.ts, which is actually a filesystem walker for data-driver connections, NOT a graph reader.)

**State after:** A new internal source-root discovery helper `resolveSourceRoots(repoPath, opts?)` derives a repo's real top-level code roots from the indexed LMDB graph (read-only, via `listEntitiesForRepo(db, repo)` filtered to kind==='file', bucketing each file entity's repo-relative filePath by top-level segment), returning `SourceRootsResult { roots: SourceRoot[]; fallbackUsed: boolean }` where each `SourceRoot { path; fileCount }` orders grep densest-root-first. When the graph yields zero indexed paths the helper does not throw — it returns a single repo-root entry with `fallbackUsed=true`, making the degraded run observable instead of a silent false BLOCK. `runGrep` (signature unchanged) iterates the derived roots for both the grep search and the filename-existence walk, re-prefixes each match with its OWNING root rather than a fixed `src/`, and enforces a single global `MATCH_CAP` across all roots (no per-root inflation). `ReviewVerdict`'s shape is unchanged; its invariant is restored — a BLOCK now reflects a genuine absence of matches, so non-`src/` repos produce real grep hits and no false BLOCK.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Re-run symbol.locate in the build step to lock the exact shapes: runGrep (confirmed Promise<GrepResult> at probe.ts:42) / runGrepSearch, and the graph reader listEntitiesForRepo(db, repo): Promise<Entity[]> (src/db/entities.ts:747) plus the Entity field names used (kind, filePath). Confirmation-only, no code change yet. — ↩ rollbackable
2. Add the two new internal-only types — SourceRoot { path: string; fileCount: number } and SourceRootsResult { roots: SourceRoot[]; fallbackUsed: boolean } — in the review module. Purely additive; touches no existing type or the ReviewVerdict emit contract. — ↩ rollbackable
3. Add the resolveSourceRoots(repoPath, opts?) helper that reads the indexed file entities read-only via listEntitiesForRepo(db, repo) (filter kind==='file'), groups their repo-relative filePaths by top-level segment into real code roots with a fileCount each, and returns them densest-first. Implement the graph-empty branch to substitute the repo root and set fallbackUsed=true (never throw). Additive new function, no existing caller affected until step 4. — ↩ rollbackable
4. Rewire runGrep in src/workflow/review/probe.ts: replace the literal join(repoPath, 'src') grep root at line 44 and walk at line 93 with iteration over resolveSourceRoots(repoPath).roots; replace the fixed 'src/' match re-prefix at line 47 with each match's owning derived root; enforce a single global MATCH_CAP across all roots (densest-first via fileCount) instead of MATCH_CAP-per-root. runGrep's signature and the ReviewVerdict shape are unchanged. Revert by restoring the three original hardcoded 'src' sites. — ↩ rollbackable
5. Extend src/workflow/review/__tests__/review.test.ts: add a non-src/ layout fixture (e.g. code under mind/) asserting real grep hits and no false BLOCK, plus a repo-root-fallback case asserting fallbackUsed=true when the graph yields no roots. Keep the existing src/ fixtures (lines 30/32/246/249) so the src/-layout path stays covered. Test-only, independently revertible. — ↩ rollbackable

**Backward compat:** No public API is affected — surfaceLevel is internal. runGrep keeps its exact signature `runGrep(pattern, repoPath): Promise<GrepResult>` and the downstream ReviewVerdict emit shape is unchanged (invariant-change only: a BLOCK now reflects a real absence of matches). listEntitiesForRepo is consumed read-only, not modified. SourceRoot and SourceRootsResult are new internal-only types with no external consumers. The only observable behaviour change is intentional and corrective: non-`src/` repos that previously received a false BLOCK now receive a grounded verdict. No downstream caller contract, IPC method, or MCP payload shape changes, so no compatibility shim or deprecation window is required.

## Alternatives considered

### a1: Root-segment resolver (string[] roots, FS grep preserved)

A new resolveSourceRoots(repoPath) helper returns a deduped string[] of real top-level code roots from the graph; probe.ts iterates them, keeping the existing runGrepSearch/walk filesystem contract.

Add one narrow helper `resolveSourceRoots(repoPath: string): Promise<string[]>` in a new module under src/workflow/review/ (or a small db-adjacent file). It reads the indexed file entities via `listEntitiesForRepo(db, repo)` (filter kind==='file'), projects each file entity's repo-relative filePath to its first path segment, dedupes, and returns the distinct top-level directories (e.g. `['src']`, `['mind']`, or `['src','packages']`). When the graph yields nothing it returns `['']` meaning the repo root, preserving a single well-defined fallback value rather than a separate flag. probe.ts changes only its two source-root sites: it awaits `resolveSourceRoots(repoPath)` once, then loops the roots calling `runGrepSearch({ pattern, root: join(repoPath, r), limit: MATCH_CAP })` and `walk(join(repoPath, r))` per root, re-prefixing each returned match with its owning `r` instead of the literal `'src'`. runGrepSearch and walk signatures are untouched — this is purely a caller-side reshape plus one new return type (`string[]`).

**Rejected because:** Smallest surface — one helper returning a primitive string[] with no new domain type, reusing the already-exported listEntitiesForRepo graph reader and preserving runGrepSearch/walk verbatim. But it loses on the two dimensions that matter most for this Story: the string[] carries no provenance, so probe.ts cannot distinguish a graph-derived root from the ['']=repo-root fallback and cannot log a degraded run — leaving the silent-false-BLOCK failure mode unaddressed. It also inflates the effective match budget to N*MATCH_CAP unless separately re-capped. Solid and cheap, but a2 buys observability and a coherent cap for the same S cost.

### a2: Typed SourceRoots result with provenance + fallback flag — **CHOSEN**

resolveSourceRoots returns a typed SourceRootsResult { roots: SourceRoot[]; fallbackUsed } where each SourceRoot carries its segment and indexed file count, giving probe.ts explicit provenance for capping and logging.

Introduce a small domain type owned by the review layer: `SourceRoot { path: string; fileCount: number }` and `SourceRootsResult { roots: SourceRoot[]; fallbackUsed: boolean }`. `resolveSourceRoots(repoPath): Promise<SourceRootsResult>` reads indexed file entities via `listEntitiesForRepo(db, repo)` (filter kind==='file'), buckets their repo-relative filePaths by first path segment, and returns one `SourceRoot` per distinct top-level directory annotated with how many indexed files sit under it; when the graph set is empty it returns `{ roots: [{ path: repoPath, fileCount: 0 }], fallbackUsed: true }`. probe.ts consumes the typed result: it can order roots by `fileCount` (grep the densest code roots first), enforce a global MATCH_CAP across roots, and emit a diagnostic when `fallbackUsed` is true so a repo-root-fallback run is observable rather than silent. Match re-prefixing uses `root.segment`. The `ReviewVerdict` emit shape (src/workflow/review/types.ts) is unchanged; only the internal evidence-gathering contract gains the new types.

### a3: Graph file-set driven — grep the indexed paths, drop FS root-walk entirely

Instead of discovering roots then walking the filesystem, the helper returns the repo's indexed file path set and probe.ts greps/existence-checks against that set directly, removing every source-root assumption rather than generalising it.

Reframe the contract around the indexed file set rather than root directories. A helper `resolveIndexedFiles(repoPath): Promise<string[]>` (or reuse `listRepoFiles` from src/indexer/index.ts if its shape fits) returns repo-relative paths of every indexed source file from the graph. probe.ts stops assuming any root structure: for the grep it derives the minimal set of top-level roots actually present in the returned paths on the fly and greps those (or, where runGrepSearch supports it, scopes to the returned paths); for the line-93 filename-existence check it replaces `walk(join(repoPath,'src'))` with a membership test against the indexed path set — no filesystem walk at all. Match re-prefixing becomes a no-op because matches already carry their real repo-relative path. Fallback when the graph yields nothing: grep the repo root directly (single filesystem pass) so a not-yet-indexed repo still produces evidence. This makes the graph the single source of truth for 'what is code here' and eliminates the FS-walk root assumption class entirely.

**Rejected because:** Most architecturally aligned (graph as single source of truth, O(1) membership existence check, no src/-prefix rewrite), but the highest-risk and highest-cost (M) option. It introduces a real semantic shift: probe.ts stops seeing on-disk-but-unindexed or post-index-changed files, so grep coverage becomes coupled to index freshness — a behavioural regression risk not justified by empty acceptance criteria. It also depends on runGrepSearch accepting a path set (otherwise it re-introduces a1's root-derivation) and on unconfirmed listRepoFiles vs listFilesForConnection shapes flagged LOW-confidence in back-flow. Ranked last on cost and settled-ness despite the cleanest end-state.

## Open questions

- s8 ts1 (ambiguous): s6 acceptanceMapping references criterion IDs ac1–ac8 that the Story never defined — its acceptanceCriteria array is empty. The acN are reasonable derivations from the Story's userValue and each has proving tests, but s2/s3 explicitly note 'no acceptance criteria were supplied', making the ac1–ac8 labeling internally inconsistent. Confirm/formalize these acceptance criteria in the build step.
- s8 cd3 (partial): resolveSourceRoots's single errors entry uses the label 'no-throw / degraded-signal' — a behaviour label rather than a concrete error/exception type. The concrete thrown errors (rejection, ENOENT) are typed in s5 errorCases; lock the degraded-path documentation as a proper contract note in build.
- s8 cd1/sbdry4 note: SourceRootsOpts is referenced in the resolveSourceRoots signature but not formalized as a dataModel entity (only described in the param purpose). Lock its shape via symbol.locate in the build step.
- RESOLVED in review (c5): the enumeration surface is listEntitiesForRepo(db, repo): Promise<Entity[]> (src/db/entities.ts:747, filter kind==='file') — a real indexed-graph reader — NOT listFilesForConnection (src/daemon/db/list-files.ts), which is a filesystem walker for data-driver connections. Build step locks the exact Entity field names (kind, filePath) via symbol.locate; no filesystem fallback for root derivation.

## Citations

- **[[c1]]** `step-output` `s1.analyzeBundles[0] symbol.locate — runGrep (entityId 880517bb2b2445724ba5803349938972) at src/workflow/review/probe.ts:44/93; graph enumeration surface listFilesForConnection/ListFilesResult/ListedFile/ListFilesOpts in src/daemon/db/list-files.ts; GraphStore in src/db/graph/store.ts` — "it invokes `runGrepSearch({ pattern, root: join(repoPath, 'src'), limit: MATCH_CAP })` at probe.ts:44 and walks `join(repoPath, 'src')` at probe.ts:93 — both nailing the source root to a literal `src/"
- **[[c2]]** `step-output` `s1.analyzeBundles[1] data-model.trace — ReviewVerdict at src/workflow/review/types.ts (entityId 3cbfdef9e13f3e5880216a6dade3ec95)` — "the probe layer produces `ReviewVerdict` (src/workflow/review/types.ts, entityId 3cbfdef9e13f3e5880216a6dade3ec95) — the shape whose false BLOCK is the observed symptom when zero grep hits are returne"
- **[[c3]]** `step-output` `s1.analyzeBundles[2] usage.example — runGrep re-prefixing matches with src/ at src/workflow/review/probe.ts:44/47/93` — "at probe.ts:44 it calls `runGrepSearch({ pattern, root: join(repoPath, 'src'), limit: MATCH_CAP })`, and the same literal drives the `src/`-prefix re-write applied to returned matches; at probe.ts:93 "
- **[[c4]]** `step-output` `s1.analyzeBundles[3] search.text — hardcoded 'src' + MATCH_CAP at src/workflow/review/probe.ts:44/93` — "Grep root: probe.ts:44 — `const data = await runGrepSearch({ pattern, root: join(repoPath, 'src'), limit: MATCH_CAP });`. Filename-existence walk: probe.ts:93 — `walk(join(repoPath, 'src'));`. The dis"
- **[[c5]]** `step-output` `s1.analyzeBundles[4] test.locate — src/workflow/review/__tests__/review.test.ts src/ fixtures at lines 30/32/246/249` — "review.test.ts:30 does `mkdirSync(join(repo, 'src'), { recursive: true });` and review.test.ts:249 does `writeFileSync(join(repo, 'src', 'big.ts'), body + '\n');` ... The test strategy for this Story "
- **[[c6]]** `step-output` `s3.winnerRationale — winnerId a2` — "a2 wins because at identical S cost to a1 it uniquely addresses the Story's core failure mode — a silent false BLOCK on a graph-empty run — via the explicit fallbackUsed provenance flag, while its per"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-07-24T11:00:09.169Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contract/listEntitiesForRepo | citation | LOW | manual | listEntitiesForRepo(db, repo): Promise<Entity[]> is defined at src/db/entities.ts:747 and is a real indexed-graph reader (it calls getGraphStore() and scans the entity range), NOT a filesystem walker. | entities.ts:747 read verbatim: `export async function listEntitiesForRepo(_db: DbClient, repo: string): Promise<Entity[]>`. Its body uses `getGraphStore()` and `lookupRepoIdInTxn(store, repo)` (entities.ts:749) — a real indexed-LMDB-graph reader, not a filesystem walker. Confirmed. | none — verified sound |
| contract/listEntitiesForRepo | citation | LOW | manual | listEntitiesForRepo is the SAME graph reader the analyze explore layer already uses to enumerate a repo's indexed files, at concept-resolve.ts:548 and module-profile.ts:121. | listEntitiesForRepo(db, ctx.repoPath) is used at concept-resolve.ts:548 and module-profile.ts:121 (plus convention-detect:93, import-graph:83, manifests-locate:81, symbol-locate:108, test-locate:97) — the established graph-file enumeration reader for the analyze layer. Confirmed. | none — verified sound |
| contract/runGrep | semantic | LOW | manual | runGrep in src/workflow/review/probe.ts returns Promise<GrepResult> (NOT Promise<ReviewVerdict>). | probe.ts:42 read verbatim: `async function runGrep(pattern: string, repoPath: string): Promise<GrepResult>`. The c4 defect from review v1 is corrected. Confirmed. | none — verified sound |
| data-model/Entity | semantic | LOW | manual | The Entity type produced by the graph read carries a kind field (EntityKind including 'file') and a repo-relative filePath, so resolveSourceRoots can filter kind==='file' and bucket by filePath's top segment. | entities.ts:87 `filePath: toRepoRelative(e.file, repoRoot)` and entities.ts:85 `kind: e.kind` — the Entity mapper populates both kind and a repo-relative filePath, so resolveSourceRoots can filter kind==='file' and bucket by filePath top segment. Confirmed. | none — verified sound |
| migration/before | citation | LOW | manual | The three hardcoded 'src' sites the reshape targets are real: probe.ts:44 grep root join(repoPath,'src'), probe.ts:47 fixed 'src/' re-prefix, probe.ts:93 walk(join(repoPath,'src')). | probe.ts:44 `root: join(repoPath, 'src'), limit: MATCH_CAP`, probe.ts:93 `walk(join(repoPath, 'src'))`, probe.ts:47 `data.hits.map(h => `src/${h.path}...`)`. All three hardcode sites confirmed as the reshape targets. | none — verified sound |
| invariant/MATCH_CAP | semantic | LOW | manual | MATCH_CAP is a cap constant defined in src/workflow/review/probe.ts governing the grep result set. | probe.ts:26 `const MATCH_CAP = 50;`. Confirmed as the cap constant. | none — verified sound |
| invariant/tests | citation | LOW | manual | The existing src/-layout review-probe fixtures at review.test.ts:30/32/246/249 exist and must keep passing. | review.test.ts:249 `writeFileSync(join(repo, 'src', 'big.ts'), body + '\\n');` — the src/-layout regression fixture exists. Confirmed. | none — verified sound |
