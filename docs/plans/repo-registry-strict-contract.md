# Plan: Repo Registry Strict Contract

Eliminates the loose `Repo` registry contract that allowed phantom rows to
accumulate from any caller of `upsertEntities` / `reindexFile`. Replaces
the interim four-layer guardrail (commits `ad2fb453b8a` / `81dcb360b07` /
`d09f6236449`) with a schema-enforced single-allocator design and
namespace-keyed reserved rows for shared external modules.

## Why (one paragraph)

The 2026-05-07 phantom-`repo=""` incident exposed an architectural
weakness: the LMDB `repo` sub-DB was never the source of truth for
repo membership. `db/entities.ts` lazily allocated rows via
`ensureRepo()` whenever it saw a new `entity.repo` string, so any
upstream caller (parsers, manifest indexer, file-watcher inference)
could silently corrupt the registry by passing an unexpected value.
Two callers exploited this by accident: `indexManifest` used
`repo: ''` as an intentional sentinel for shared modules, and
`repoForFile()` walked the filesystem looking for `package.json` /
`.git` markers and treated any matching subdirectory as a repo root.
The four interim guardrails (Layer 1 IPC validation, Layer 2 entities-
write filter, Layer 3 synthetic `<external-modules>` redirect, Layer
4 registered-set prefix match) make the system correct today but
preserve the loose contract -- they catch bad inputs after the fact
rather than making bad inputs structurally unrepresentable. This plan
ships the structural fix the original `ensureRepo` comment promised
("Phase 5.x will tighten this so callers must register repos via
`addRepo` before indexing").

## Goals

1. **`addRepo()` is the only writer to the `repo` sub-DB.** Storage
   layer becomes a pure consumer of pre-allocated `repoId`s; never
   creates rows.
2. **`Entity.repoId: u32` replaces `Entity.repo: string`** through
   the parser → indexer → storage pipeline. The string repo path
   stops crossing API boundaries; the integer id is the only handle.
3. **Shared external modules get namespace-keyed reserved registry
   rows** instead of the L3 synthetic-path redirect. JVM modules
   (Java + Scala + future Kotlin / Groovy) share one row; npm
   (TypeScript + JavaScript) shares another; Python, Go, etc. each
   get their own. Same module name in two namespaces produces two
   entity rows, no false matches.
4. **`repoForFile()` becomes a registry lookup.** No filesystem
   walking, no marker hunting. Returns `null` for files outside any
   registered repo; the caller short-circuits.
5. **Interim guardrails (L1, L2, L3, L4) removed once the structural
   fix lands.** L1 (IPC `repo.add` validation) stays as defense-in-
   depth at the IPC boundary -- rejecting malformed external input
   is always valuable -- but L2 / L3 / L4 dissolve into the new
   design.

## Non-goals

- **Multi-workspace federation.** Cross-repo entity / relation
  resolution (e.g. workspace A imports a class from workspace B)
  stays out of scope. The cross-file resolver remains per-workspace;
  imports unresolved at the workspace boundary become module
  entities pointing at the appropriate shared-modules row.
- **Distributed `repo` allocation.** Single-daemon assumption holds;
  the meta counter for `next_repo_id` doesn't need coordination.
- **Per-repo encryption / access control.** Out of scope. The
  registry's strictness is about correctness, not authorization.

## Status

Implemented and shipped on `release/1.96`. Phases 1-6 landed in
commits `1e7e0085f7f` (1+2 substrate + migration), `7b4511cbecc`
(3 storage strict), `575f5bdf532` (4 parser refactor),
`107c0a6fca0` (5 contract + namespace tests), and the Phase 6
cleanup commit. The four interim guardrails are gone (L2/L3 in
Phase 3.2, L4 stays as architectural code with refreshed
documentation, L1 stays as defense-in-depth at the IPC boundary
per design).

| Phase | Slice | State | Notes |
|---|---|---|---|
| 1.1 | Schema substrate -- `RepoKind` discriminator + reserved-id range | done | Bump `SCHEMA_VERSION` from 2 to 3. Add `kind: RepoKind` field to `RepoRow` codec (see "Schema changes" below). Reserve the top of u32 ID space (e.g. `0xFFFFFFFE` and below) for shared-modules rows; document the allocation policy in `db/graph/ids.ts`. The monotonically-allocated workspace IDs use the bottom (counter starts at 1); they meet in the middle if we ever need 4B repos, which won't happen |
| 1.2 | `SHARED_MODULES_NAMESPACE_BY_LANG` mapping + reserved-id constants | done | Static map in `shared/types.ts` (or a new `shared/repo-namespaces.ts`). Initial namespaces: `'jvm'`, `'npm'`, `'python'`, `'go'`. Each gets a stable reserved repoId. Plan-level decision: are reserved IDs exposed in code as named constants (`SHARED_MODULES_REPO_ID_JVM = 0xFFFFFFFE`) or looked up by `findRepoIdByKind('shared-modules:jvm')` per pass? Constants are simpler; lookup is more refactor-safe. **Default: constants** (the IDs never change once assigned; the migration locks them to the assigned values forever) |
| 1.3 | First-boot migration scaffolding (`db/graph/migrations.ts`) | done | New module that runs in `getGraphStore()` between env-open and ready-handoff, gated by stored `meta.schema_version` < `SCHEMA_VERSION`. Forward-only; no rollback. Single migration runner that knows about migrations 2 → 3 (this plan). Each migration takes a write txn and either succeeds + bumps the version or throws (refuse to start). Migration logging mirrors the existing `LmdbStoreSchemaVersionMismatch` channel |
| 2.1 | Migration: provision reserved rows + rewire module entities | done | Inside the 2 → 3 migration: (a) for each `SharedModulesNamespace`, write a `RepoRow { id: <reserved>, kind: 'shared-modules', namespace, path: '', name: '<auto>', status: 'ready', addedAt: now }`; (b) scan all `entity` rows where `repoId` matches an empty-path workspace row OR matches the L3 synthetic `<external-modules>` row; for each, re-derive namespace from the entity's `language` field, rewrite `repoId` to the matching reserved row; (c) delete the now-orphaned empty-path / `<external-modules>` rows. Pure read-write inside the txn; idempotent (re-running on already-migrated data is a no-op since the namespace rows already exist and entities point at them) |
| 2.2 | Migration: drop phantom workspace rows + their entities | done | Same migration: walk every `kind: 'workspace'` row; if path is empty / non-absolute / in `BANNED_REPO_ROOTS` / not a directory at boot time → delete the row + cascade-delete all its entities + relations + plans + sessions + turns. Log per-deletion `{ repoId, path, entityCount }` so the operator sees what was purged. The 2026-05-07 incident left ~14k orphan entities under `repo=""`; this is the cleanup pass |
| 3.1 | `lookupRepoId` exported from `db/repos.ts` | done | New `lookupRepoId(path: string): number \| undefined` -- thin wrapper over the existing in-txn `repoIdByPathInTxn`. Used by everything that needs to translate path → id at API boundaries. Throws on empty path (defense in depth, since callers shouldn't be passing empty in any post-Phase-5 flow) |
| 3.2 | `db/entities.ts` becomes a pure writer (no `ensureRepo` allocation) | done | Replace the `ensureRepo` helper inside `upsertEntities` and `reindexFile` with a strict lookup. If the `repoId` doesn't resolve, throw `UnregisteredRepoError` with the offending value. Caller (indexer) is responsible for ensuring `addRepo()` ran first. **L2 guardrail removed** in this slice -- the lookup-or-throw is strictly stronger than the filtering it replaces. **L3 EXTERNAL_MODULES_REPO_PATH constant + redirect removed** -- module entities now point at the namespace-keyed reserved rows directly |
| 3.3 | `Entity.repoId` replaces `Entity.repo` in the type | done | `shared/types.ts` -- drop the `repo: string` field, add `repoId: number`. This is the type-system-level enforcement: the storage layer takes a `repoId`, parsers must produce one. **One-shot grep + replace** across the codebase; mostly mechanical. Some call sites still need the path string for logging / display -- those receive the `Repo` object instead and read `.path` from it. The storage codec `EntityRow.repoId` is unchanged (already u32) |
| 4.1 | Indexer passes `Repo` handle to parsers | done | `indexer/index.ts` -- `indexFile()` looks up the `Repo` once at the start of the call (via `lookupRepoId(repoPath)`), passes both the `repoPath` (for logging / hashing the entity ID) and the `repoId` to the parser. Parser signature changes from `parse(filePath, source, repoPath: string)` to `parse(filePath, source, repo: Repo)` (or `parse(filePath, source, repoPath: string, repoId: number)` -- bikeshed) |
| 4.2 | Parsers emit `Entity { repoId }` + use namespace-keyed module repoIds | done | All five parsers (typescript / python / go / java / scala). Mechanical change to `repoId: <repoId>` instead of `repo: <path>`. For module entities (`kind: 'module'`), look up the namespace in `SHARED_MODULES_NAMESPACE_BY_LANG[language]` and use the matching reserved repoId from `SHARED_MODULES_REPO_ID_<NS>`. The `makeEntityId(...)` hash input changes from `'' / '' / 'module' / name` to `<namespace> / '' / 'module' / name` so cross-namespace name collisions don't produce same-IDs |
| 4.3 | `repoForFile()` becomes a Map lookup | done | Already shipped in d09f6236449 as L4 (longest-prefix match against `IndexerService.registeredRepos`). The strict-contract version doesn't change behaviour; only the comment about *why* it's correct. **L4 documentation cleanup** rather than a code change |
| 5.1 | Tests: schema migration | done | New `db/graph/__tests__/migrations.test.ts` -- per-migration tests that seed a v2 store with synthetic phantom rows (`repo=""`, banned-root paths, the L3 `<external-modules>` row + module entities pointing at it), run `getGraphStore()`, assert v3 state (reserved rows present, module entities rewired to correct namespace, phantoms deleted with their entities). At least one round-trip test (close + reopen post-migration to confirm idempotence) |
| 5.2 | Tests: schema contract enforcement | done | New negative-path tests in `entities-lmdb.test.ts`: `upsertEntities([{ repoId: <unregistered> }])` throws `UnregisteredRepoError`; the storage layer never writes a `repo` row outside `addRepo()`. Verifies at the type-system + runtime level |
| 5.3 | Tests: shared-modules namespace correctness | done | Cross-language test: parse a Java file importing `org.apache.foo.Bar` and a Python file importing `foo.bar`. Assert the resulting module entity IDs are distinct (different namespaces) and the `name_index` has separate entries |
| 6.1 | Remove L1 / L2 / L3 / L4 interim guardrails | partial -- L1 stays, others go | L1 (IPC `repo.add` shape + filesystem validation) stays as defense-in-depth at the IPC boundary -- it's the right place to reject malformed external input before any DB write. **L2 removed in 3.2.** **L3 (`EXTERNAL_MODULES_REPO_PATH` constant + redirect) removed in 3.2.** **L4 stays in code but becomes redundant trivia** -- the longest-prefix match is the right algorithm; the comment about "why this replaced the marker walk" stays for posterity |
| 6.2 | Update CLAUDE.md "Architectural rules" | pending | Codify the new contract in the "Key architectural rules" section: *"`Repo` registry membership is established exclusively via `repo.add` IPC. Storage-layer writes never auto-allocate."* |
| 6.3 | Decommission `Phase 5.x will tighten this` comments | pending | Grep + remove the four-or-five places where comments promised this work; replace with pointers to this plan if context still useful |

## Schema changes (forward-only)

### Bumped: `SCHEMA_VERSION` 2 → 3

### `RepoRow` codec gains `kind` discriminator

Current shape (codec `repoRow.encode` / `.decode`):
```
id: u32, path: string, name: string, addedAt: ms, lastIndexed: ms,
status: enum, errorMsg: string
```

New shape:
```
id: u32, kind: RepoKind, namespace?: SharedModulesNamespace,
path: string, name: string, addedAt: ms, lastIndexed: ms,
status: enum, errorMsg: string
```

Where:
```ts
type RepoKind = 'workspace' | 'shared-modules';
type SharedModulesNamespace = 'jvm' | 'npm' | 'python' | 'go';
```

`namespace` is required when `kind === 'shared-modules'`, absent
otherwise. `path` is required + non-empty for `'workspace'`, empty
for `'shared-modules'`.

### Reserved repoId allocation

Workspace repos get monotonically-allocated IDs starting at 1
(unchanged from today). Shared-modules rows get reserved IDs at
the top of u32 space:

```ts
export const SHARED_MODULES_REPO_ID = {
  jvm:    0xFFFFFFFE,
  npm:    0xFFFFFFFD,
  python: 0xFFFFFFFC,
  go:     0xFFFFFFFB,
} as const;
```

Adding a new namespace appends to this list with the next-lower
reserved ID (`0xFFFFFFFA`, etc.). The reserved range is documented
as "never allocated by `allocateRepoIdInTxn`"; the allocator's
upper bound caps at `0xFFFFFFF0` (16-row safety margin) so a
workspace allocation can never accidentally collide.

### Per-language → namespace mapping

```ts
// shared/repo-namespaces.ts
export const SHARED_MODULES_NAMESPACE_BY_LANG: Record<Language, SharedModulesNamespace> = {
  java:       'jvm',
  scala:      'jvm',
  kotlin:     'jvm',     // future
  groovy:     'jvm',     // future
  typescript: 'npm',
  javascript: 'npm',     // future
  python:     'python',
  go:         'go',
  rust:       'rust',    // future, will require adding to SHARED_MODULES_REPO_ID
};
```

Adding a new ecosystem is a 3-line change: add to `SharedModulesNamespace`,
add to `SHARED_MODULES_REPO_ID`, add to `SHARED_MODULES_NAMESPACE_BY_LANG`.

## Migration semantics (2 → 3)

The migration runs once per LMDB env on first boot after deploy:

1. **Provision reserved rows.** For each `(namespace, reservedId)` in
   `SHARED_MODULES_REPO_ID`, write a `RepoRow` with `kind:
   'shared-modules', namespace, path: '', name: '<namespace>', status:
   'ready', addedAt: now`. Idempotent on re-run (rows checked by ID
   first; only written if missing).

2. **Rewire module entities.** Scan every `entity` row where
   `kind === 'module'`. For each, derive `namespace =
   SHARED_MODULES_NAMESPACE_BY_LANG[entity.language]`. If the entity's
   current `repoId` doesn't already match the reserved row for that
   namespace, rewrite `repoId` to the reserved value and bump
   `indexedAt`. The entity's stable string ID re-derives via
   `makeEntityId(namespace, '', 'module', name)` (different from the
   pre-3 hash if the language was previously empty in the hash input)
   -- this is a one-time ID change that needs a corresponding update
   to `entity_id_by_string` and any name_index entries.

3. **Drop phantom workspace rows.** Walk every `kind: 'workspace'`
   row. For each:
   - If `validateRepoPathShape(path)` throws → row is invalid; cascade-
     delete (entities + relations + plans + sessions + turns + the row
     itself).
   - If `validateRepoPath(path)` throws (path doesn't exist on disk) →
     log per-row, leave entities in place but mark row `status: 'error'`
     with `errorMsg` set. Operator can decide whether to remove via the
     IDE's "Remove repository" UI.

4. **Bump `meta.schema_version` to 3.**

The migration is a single LMDB write txn so partial failure leaves
the store in the v2 state (operator sees the schema-mismatch error
on next boot and can investigate).

## Per-phase notes

### Phase 1 -- substrate

The schema substrate phase is decoupled from any indexer / parser
changes. It can land in isolation: the codec gains the new field,
the migration scaffold runs but no migrations are registered yet,
the reserved-ID constants exist in code but aren't yet referenced.
Tests at this phase are codec round-trips for the new shape.

### Phase 2 -- migration

Phase 2 ships the migration logic itself. After this phase, fresh
installs and existing installs both have v3 schema with provisioned
reserved rows. **Module entities still carry the old empty-string
`repo` field** because Phase 3 hasn't refactored the entity type
yet -- the migration's job is data layout only, not API surface.
The L3 redirect in `entities.ts` keeps working alongside the new
reserved rows because `repoIdByPathInTxn(path: '')` and
`repoIdByPathInTxn(path: '<external-modules>')` both still resolve
(the migration leaves the L3 synthetic row in place and just adds
the namespace-keyed rows alongside).

### Phase 3 -- storage layer becomes pure

Phase 3 is where L2 + L3 actually go away. With the migration done,
all entity `repoId`s point at valid registry rows. The storage
layer can drop `ensureRepo` and demand pre-allocation. The
`Entity.repo: string` → `Entity.repoId: number` type-system change
is the fence-post that makes the contract structurally enforced.

### Phase 4 -- parser refactor

The biggest mechanical change: every parser changes its signature
and its emission. This phase is testable in isolation by running
a fresh-DB index of the Hadoop test workload and confirming entity
counts + edge counts match the pre-refactor numbers exactly.

### Phase 5 -- tests

Three test categories: migration tests (v2 fixtures → v3 expected),
schema-contract tests (negative paths), shared-modules namespace
tests (cross-language module ID isolation).

### Phase 6 -- cleanup

Final pass: remove L2 / L3, decommission stale comments, update
CLAUDE.md.

## Open questions

1. **Should `kind: 'shared-modules'` rows be `status: 'ready'` from
   creation?** They're not "indexed" in the workspace sense -- they're
   passive containers. `'ready'` matches the reality that there's no
   pending index work. Alternative: a new status `'reserved'`. The
   indexer recovery loop already needs to skip these (they have no
   filesystem path); using `'ready'` plus the kind-filter is the
   simplest. **Default: `'ready'`**.

2. **What about `kind: 'shared-modules'` rows showing in the IDE's
   "Registered Repos" UI?** They shouldn't -- they're an
   implementation detail. The IDE-side `repo.list` IPC handler
   filters by `kind === 'workspace'` before returning. Same applies
   to `repo.remove` (rejects attempts to remove a shared-modules
   row).

3. **Migration behaviour when the user is mid-stream.** The migration
   runs in a single write txn that holds the whole LMDB env exclusive
   for its duration. On a 14k-orphan-entity workload this is sub-
   second; not a real concern. Larger registries would need a
   chunked / checkpointed migration, which is forward-portable but
   not needed today.

4. **Do we keep `EXTERNAL_MODULES_REPO_PATH` from L3 around as a
   migration sentinel?** During the v2 → v3 migration we need a way
   to identify the entities that the L3 redirect created. After the
   migration the constant is dead. **Decision: keep the constant in
   the migration source for one release, delete in the release after
   v3 is universally deployed.**

## Lessons baked in (from the 2026-05-07 incident)

1. **Registries should be the contract, not an emergent side-effect.**
   The original DuckDB-era design treated `repo` as a string column
   on entities -- the registry was implicit. The LMDB migration
   preserved that semantic ("matches the prior DuckDB behaviour")
   without acknowledging that the registry was *now* used as the
   source of truth for several other systems (UI, indexer recovery,
   watcher). Carry-over semantics need an audit when the
   surrounding system changes.

2. **TODO comments aren't enforcement.** The original `ensureRepo`
   comment said *"Phase 5.x will tighten this"* and stayed there
   for months. A comment promising future tightening doesn't catch
   bad inputs in the meantime.

3. **Forensic logging is cheap; ship it eagerly.** The L2 guardrail's
   `stackHint` (5 frames of caller stack on a rejection) is what
   pinned down `indexManifest` and `repoForFile` as the upstream
   sources after the IPC-side L1 logged zero rejections. Even when
   the structural fix lands, defensive logs at boundaries are
   worth keeping for the next time someone introduces a new
   upstream caller.

4. **Schema contracts are the strongest defense.** `Entity.repoId:
   u32 (FK to repo.id)` makes "pass an empty string" structurally
   unrepresentable. Validators + filters + redirects all eventually
   leak; types don't.
