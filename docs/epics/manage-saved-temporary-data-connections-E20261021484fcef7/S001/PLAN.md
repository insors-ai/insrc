<!-- insrc:artifact PLAN-484fcef7efaf229e-s1 -->

# Plan: E20261024484fcef7:S001

## Summary

**Epic:** `manage-saved-temporary-data-connections`
**LLD run:** `wf-1792572266932-tig2va`
**LLD effective hash:** `dc1a3f91a768...`

Build the saved-connection foundation so users can create and edit connections without exposing stored credentials or losing track of whether a save succeeded. Add safe retries, conflict checks and protection for connections in use, plus the memory-only file execution foundation needed by later temporary-connection work. Enable writes only after driver coverage, recovery, compatibility and deployment filesystem checks pass; the manager UI and temporary sessions follow in separate stories.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Classify every supported driver's editable and secret fields | M | — | unit: CM-S1-A: per-driver profile matrix covers every listRegisteredKinds entry and preserves unexposed supported config.; integration: CM-S1-L: static TypeScript import/alias/factory/acquire inventory with zero unclassified production sites; each classified use has metadata-only, full-use lease or bounded-private-probe rationale. | [[c2]] |
| 2 | **`t2`** Declare v2 protocol and typed management envelope | M | `t1` | integration: CM-S1-J: legacy success shapes versus v2 structured errors; malformed requests, unknown ticket fields, wrong root/target and no stored-secret return. | [[c1]] [[c2]] |
| 3 | **`t3`** Implement driver profiles and safe draft materialization | M | `t1`, `t2` | unit: CM-S1-A: per-driver profile matrix covers every listRegisteredKinds entry and preserves unexposed supported config.; unit: CM-S1-C: Keep/Replace/Clear, pinned-family preservation, request HMAC/signature/expiry and exact response sanitization.; unit: CM-S1-P: create/edit materialization and safe read followed by cancel/abandon before mutate leave registry bytes, revision/receipt map and every keychain value unchanged; no writer or keychain-write call. This tests the foundation boundary, not S005 UI.; integration: CM-S1-K: run existing own-directory data runtime cases and pinned-family config tests without redirecting roots or normalizing records. | [[c2]] [[c4]] |
| 4 | **`t4`** Implement signed operation tickets and request fingerprints | M | `t2` | unit: CM-S1-C: Keep/Replace/Clear, pinned-family preservation, request HMAC/signature/expiry and exact response sanitization. | [[c2]] [[c3]] |
| 5 | **`t5`** Implement atomic read-only registry commits and writer fences | M | `t2` | integration: CM-S1-E: crash/failure injection before/after preparation sync, keychain stage, temp sync/chmod, rename, parent sync and obsolete-ref cleanup; restart/reconcile to exact committed truth.; integration: CM-S1-F: POSIX same-UID old writeFile recipe attempts overwrite AFTER the new digest check and read-only commit; expect EACCES and preserved management envelope. Also old pre-opened-fd writes only detached inode. Failed proof/privileged process/unsupported filesystem must disable adoption.; smoke: CM-S1-O: start on a managed read-only registry and refuse unsafe downgrade/direct legacy write; older clients can use safe adapter projections through new service. | [[c2]] [[c3]] [[c6]] |
| 6 | **`t6`** Implement immutable credential generations and preparation recovery | M | `t4`, `t5` | integration: CM-S1-E: crash/failure injection before/after preparation sync, keychain stage, temp sync/chmod, rename, parent sync and obsolete-ref cleanup; restart/reconcile to exact committed truth. | [[c2]] [[c3]] |
| 7 | **`t9`** Implement revision-pinned leases and safe resolver | M | `t2` | unit: CM-S1-B: create/update identity/revision/duplicate/busy validation occurs before secret or writer ports.; integration: CM-S1-K: run existing own-directory data runtime cases and pinned-family config tests without redirecting roots or normalizing records.; integration: CM-S1-M: full-use lease spans asynchronous iteration and nested calls; update barrier rejects busy; release-on-error and cancellation; no idle close while leased. Session overlay stub is injectable but no S003 store implemented. | [[c2]] [[c3]] [[c5]] |
| 8 | **`t7`** Implement serialized saved create/update service | M | `t3`, `t4`, `t5`, `t6`, `t9` | unit: CM-S1-B: create/update identity/revision/duplicate/busy validation occurs before secret or writer ports.; integration: CM-S1-D: same-repo concurrent mutations/replays, separate-root independence and deleted-ID revision reuse refusal.; integration: CM-S1-U: through BOTH legacy saveConnectionRpc and v2 mutation dispatch, attempt a save against (1) malformed JSON, (2) invalid registry shape, (3) injected non-ENOENT EACCES/EPERM/EIO read failures. Snapshot exact registry bytes and all fake keychain values first; assert byte/value equality after rejection, zero secret-staging calls, zero writer/rename calls and a non-empty sanitized registry-unreadable error rather than []/success. Include a replacement-password draft to prove extraction cannot occur before the failed read. ENOENT is a separate valid-unmanaged-empty control, never conflated with these failures. | [[c1]] [[c2]] [[c3]] |
| 9 | **`t8`** Implement replay/status and activation-only retry | M | `t7` | integration: CM-S1-D: same-repo concurrent mutations/replays, separate-root independence and deleted-ID revision reuse refusal.; integration: CM-S1-E: crash/failure injection before/after preparation sync, keychain stage, temp sync/chmod, rename, parent sync and obsolete-ref cleanup; restart/reconcile to exact committed truth.; integration: CM-S1-Q: successful commit with failed activation then activation-only retry preserves exact config bytes, revision, receipt and credential generation; writer/keychain-stage call count remains zero during retry.; integration: CM-S1-R: successful commit followed by injected safe-list/refresh failure retries only list; assert no mutation request, new ticket, writer call, credential stage, revision bump or receipt duplication. | [[c2]] [[c3]] [[c4]] |
| 10 | **`t10`** Migrate data runtime and exploration acquisition aliases | M | `t9` | integration: CM-S1-V: measure.ts timeout/cancellation while underlying reachAndList remains pending keeps its one shared lease and update/remove busy; late settle/reject releases once and clears pendingListings. Injected exploration aliases and db async iterators cannot release early or leak a raw driver.; integration: CM-S1-K: run existing own-directory data runtime cases and pinned-family config tests without redirecting roots or normalizing records.; integration: CM-S1-L: static TypeScript import/alias/factory/acquire inventory with zero unclassified production sites; each classified use has metadata-only, full-use lease or bounded-private-probe rationale.; integration: CM-S1-M: full-use lease spans asynchronous iteration and nested calls; update barrier rejects busy; release-on-error and cancellation; no idle close while leased. Session overlay stub is injectable but no S003 store implemented. | [[c3]] [[c5]] |
| 11 | **`t11`** Migrate measurement and late-work lifetimes | M | `t9` | integration: CM-S1-V: measure.ts timeout/cancellation while underlying reachAndList remains pending keeps its one shared lease and update/remove busy; late settle/reject releases once and clears pendingListings. Injected exploration aliases and db async iterators cannot release early or leak a raw driver. | [[c3]] [[c5]] |
| 12 | **`t12`** Migrate ordinary DB tools and schema-drift lifetimes | M | `t9` | integration: CM-S1-V: measure.ts timeout/cancellation while underlying reachAndList remains pending keeps its one shared lease and update/remove busy; late settle/reject releases once and clears pendingListings. Injected exploration aliases and db async iterators cannot release early or leak a raw driver.; integration: CM-S1-L: static TypeScript import/alias/factory/acquire inventory with zero unclassified production sites; each classified use has metadata-only, full-use lease or bounded-private-probe rationale.; integration: CM-S1-M: full-use lease spans asynchronous iteration and nested calls; update barrier rejects busy; release-on-error and cancellation; no idle close while leased. Session overlay stub is injectable but no S003 store implemented. | [[c3]] [[c5]] |
| 13 | **`t13`** Define typed memory row sources and shared converter normalization | M | `t2` | integration: CM-S1-W: saved versus memory-only full typed schema/nullability/value parity for Avro, BSON dates/large numeric normalization and XLSX worksheet target/slug selection; empty/all-null schema, zero-row _empty sheet, incompatible union and unknown-target behavior; target-specific schema cache never crosses sheets. | [[c2]] [[c3]] |
| 14 | **`t14`** Implement bounded BSON and fixed-width memory decoding | M | `t13` | integration: CM-S1-S: instrument decoder admission for oversized BSON headers/documents, Avro expansion blocks, giant fixed-width records and XLSX ZIP/shared-string expansion; abort before retaining an over-budget unit, then prove streams, inflater/parser state, tables and DB are cleaned.; integration: CM-S1-W: saved versus memory-only full typed schema/nullability/value parity for Avro, BSON dates/large numeric normalization and XLSX worksheet target/slug selection; empty/all-null schema, zero-row _empty sheet, incompatible union and unknown-target behavior; target-specific schema cache never crosses sheets. | [[c2]] [[c3]] [[c4]] |
| 15 | **`t15`** Implement bounded Avro memory decoding | M | `t13` | integration: CM-S1-S: instrument decoder admission for oversized BSON headers/documents, Avro expansion blocks, giant fixed-width records and XLSX ZIP/shared-string expansion; abort before retaining an over-budget unit, then prove streams, inflater/parser state, tables and DB are cleaned.; integration: CM-S1-W: saved versus memory-only full typed schema/nullability/value parity for Avro, BSON dates/large numeric normalization and XLSX worksheet target/slug selection; empty/all-null schema, zero-row _empty sheet, incompatible union and unknown-target behavior; target-specific schema cache never crosses sheets. | [[c2]] [[c3]] [[c4]] |
| 16 | **`t16`** Implement XLSX bounded archive and parser admission | M | `t13` | integration: CM-S1-S: instrument decoder admission for oversized BSON headers/documents, Avro expansion blocks, giant fixed-width records and XLSX ZIP/shared-string expansion; abort before retaining an over-budget unit, then prove streams, inflater/parser state, tables and DB are cleaned. | [[c2]] [[c3]] [[c4]] |
| 17 | **`t17`** Implement XLSX typed worksheet streaming | M | `t16` | integration: CM-S1-S: instrument decoder admission for oversized BSON headers/documents, Avro expansion blocks, giant fixed-width records and XLSX ZIP/shared-string expansion; abort before retaining an over-budget unit, then prove streams, inflater/parser state, tables and DB are cleaned.; integration: CM-S1-W: saved versus memory-only full typed schema/nullability/value parity for Avro, BSON dates/large numeric normalization and XLSX worksheet target/slug selection; empty/all-null schema, zero-row _empty sheet, incompatible union and unknown-target behavior; target-specific schema cache never crosses sheets. | [[c2]] [[c3]] [[c4]] |
| 18 | **`t18`** Implement private memory-only DuckDB execution resources | M | `t13`, `t14`, `t15`, `t17` | integration: CM-S1-H: native and converted fixtures exercise private DuckDB memory-only mode; watch allowed filesystem roots/logs and inspect cache/temp directories for zero sidecar/spill/config/path leakage; close/partial failure releases all owned resources.; integration: CM-S1-S: instrument decoder admission for oversized BSON headers/documents, Avro expansion blocks, giant fixed-width records and XLSX ZIP/shared-string expansion; abort before retaining an over-budget unit, then prove streams, inflater/parser state, tables and DB are cleaned.; integration: CM-S1-T: every DuckDBFileDriver query path uses its owned FileExecutionResource, readerPath cannot invoke ensureCached in memory-only mode, close disposes the resource and private initialization never calls INSTALL. Saved-cache callers use full root/revision/source/options identity. | [[c2]] [[c3]] |
| 19 | **`t19`** Thread file execution policy through factory and driver queries | M | `t18`, `t9` | integration: CM-S1-H: native and converted fixtures exercise private DuckDB memory-only mode; watch allowed filesystem roots/logs and inspect cache/temp directories for zero sidecar/spill/config/path leakage; close/partial failure releases all owned resources.; integration: CM-S1-T: every DuckDBFileDriver query path uses its owned FileExecutionResource, readerPath cannot invoke ensureCached in memory-only mode, close disposes the resource and private initialization never calls INSTALL. Saved-cache callers use full root/revision/source/options identity. | [[c2]] [[c3]] |
| 20 | **`t20`** Isolate saved conversion cache identities | M | `t13`, `t19` | integration: CM-S1-I: two roots/owners same ID/file name/size/mtime with different content return correct complete rows; saved cache freshness verifies content/source/options; converted values match saved normalization, not a lossy sample.; integration: CM-S1-T: every DuckDBFileDriver query path uses its owned FileExecutionResource, readerPath cannot invoke ensureCached in memory-only mode, close disposes the resource and private initialization never calls INSTALL. Saved-cache callers use full root/revision/source/options identity. | [[c2]] [[c3]] |
| 21 | **`t21`** Wire v2 management routes and legacy safe projections | M | `t8`, `t10`, `t11`, `t12`, `t19`, `t20` | unit: CM-S1-C: Keep/Replace/Clear, pinned-family preservation, request HMAC/signature/expiry and exact response sanitization.; integration: CM-S1-R: successful commit followed by injected safe-list/refresh failure retries only list; assert no mutation request, new ticket, writer call, credential stage, revision bump or receipt duplication.; integration: CM-S1-U: through BOTH legacy saveConnectionRpc and v2 mutation dispatch, attempt a save against (1) malformed JSON, (2) invalid registry shape, (3) injected non-ENOENT EACCES/EPERM/EIO read failures. Snapshot exact registry bytes and all fake keychain values first; assert byte/value equality after rejection, zero secret-staging calls, zero writer/rename calls and a non-empty sanitized registry-unreadable error rather than []/success. Include a replacement-password draft to prove extraction cannot occur before the failed read. ENOENT is a separate valid-unmanaged-empty control, never conflated with these failures.; integration: CM-S1-J: legacy success shapes versus v2 structured errors; malformed requests, unknown ticket fields, wrong root/target and no stored-secret return. | [[c1]] [[c2]] [[c3]] |
| 22 | **`t22`** Integrate maintenance adoption and fail-closed startup | M | `t6`, `t21` | integration: CM-S1-F: POSIX same-UID old writeFile recipe attempts overwrite AFTER the new digest check and read-only commit; expect EACCES and preserved management envelope. Also old pre-opened-fd writes only detached inode. Failed proof/privileged process/unsupported filesystem must disable adoption.; integration: CM-S1-G: reject post-adoption chmod/rename/envelope drift; no automatic replay of missing receipt after drift; maintenance requires old identified PID gone.; smoke: CM-S1-N: adopt a registered fixture root, create, safe read, label update, activation failure, lost response/restart/status and one same-ticket replay; inspect canonical registry and fake keychain generations.; smoke: CM-S1-O: start on a managed read-only registry and refuse unsafe downgrade/direct legacy write; older clients can use safe adapter projections through new service. | [[c3]] [[c6]] |
| 23 | **`t23`** Complete regression evidence and enablement gates | M | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t9`, `t7`, `t8`, `t10`, `t11`, `t12`, `t13`, `t14`, `t15`, `t16`, `t17`, `t18`, `t19`, `t20`, `t21`, `t22` | integration: CM-S1-L: static TypeScript import/alias/factory/acquire inventory with zero unclassified production sites; each classified use has metadata-only, full-use lease or bounded-private-probe rationale.; smoke: CM-S1-N: adopt a registered fixture root, create, safe read, label update, activation failure, lost response/restart/status and one same-ticket replay; inspect canonical registry and fake keychain generations.; smoke: CM-S1-O: start on a managed read-only registry and refuse unsafe downgrade/direct legacy write; older clients can use safe adapter projections through new service. | [[c1]] [[c4]] [[c5]] [[c6]] |

### 1.1 E20261024484fcef7:S001:T001 — Classify every supported driver's editable and secret fields

Inspect actual driver/config/converter reads and persist a per-kind matrix with public editable fields, credential slots, retained-only fields and rejected legacy shapes, including recursive/partitioning and all supported options. This is a design-input task; do not implement projection/materialization until it has no unclassified fields.

**Acceptance checks:**
- Every runtime listRegisteredKinds entry maps to a source-backed row and fixture; unknown secret-bearing fields fail closed.
- Pinned-family and URL/path dialect compatibility is explicit; matrix is a reviewed build input, not a family-wide secrecy assumption.
- Revalidate current-source import/alias/factory and registered-kind inventory before implementation; changed design assumptions require back-flow, not silent contract changes.

### 1.2 E20261024484fcef7:S001:T002 — Declare v2 protocol and typed management envelope

Create proposed src/shared/connection-management.ts with sc1/sc2/sc3/sc8 declaration types; extend ConnectionsFile with an optional envelope while preserving ConnectionConfig and unknown fields.

**Acceptance checks:**
- Strict types compile with NodeNext and exact optional properties; existing saved documents remain readable.
- Typed converter schema/worksheet identity, operation tickets, safe errors and context/lease declarations match the approved LLD.

### 1.3 E20261024484fcef7:S001:T003 — Implement driver profiles and safe draft materialization

Create proposed src/daemon/db/driver-profiles.ts from the completed matrix; implement safe read projection, server-side patch merge and Keep/Replace/Clear materialization without persistence.

**Acceptance checks:**
- Every supported kind has positive/negative fixtures and no stored secret/ref leaks in safe DTOs.
- Unknown supported fields survive label-only edit; identity/kind/family changes reject; cancellation before mutate changes zero bytes/keys.
- Explicit legacy pinned family remains effective or is safely read-only, never normalized.

### 1.4 E20261024484fcef7:S001:T004 — Implement signed operation tickets and request fingerprints

Add proposed management ticket helpers with persistent signing/HMAC key ownership, canonical target validation, 30-day expiry and full-request keyed fingerprinting.

**Acceptance checks:**
- Malformed/tampered/wrong-target/expired tickets reject without config effects; same operation ID with changed payload is distinguishable.
- Key loss on adopted state is recovery-required, not automatic rotation; no plaintext secrets or unkeyed password hashes in receipts/logs.

### 1.5 E20261024484fcef7:S001:T005 — Implement atomic read-only registry commits and writer fences

Create proposed src/daemon/db/managed-store.ts atomic writer with exclusive temp, sync, read-only new inode, rename/parent sync, retained metadata and internal gate proof.

**Acceptance checks:**
- Legacy same-UID writeFile after the new digest check gets EACCES and cannot strip envelope; old fd affects detached inode only.
- Direct managed saveConnections without gate proof fails; no chmod-to-writable live path.
- Uncertain rename/fsync is recoverable rather than presumed rejected; unsupported/privileged permission semantics disable adoption.

### 1.6 E20261024484fcef7:S001:T006 — Implement immutable credential generations and preparation recovery

Extend src/daemon/db/secrets.ts and proposed managed-store preparation journal with owned staged references, startup commit-truth checks and retryable cleanup.

**Acceptance checks:**
- Preparation metadata is durable before staging, contains no plaintext, and cleanup never deletes a referenced generation.
- Every injected pre/postcommit failure preserves prior effective credentials or reports exact committed/cleanup-pending truth.
- Only owned references are cleaned; missing keys or unresolved recovery block new writes.

### 1.7 E20261024484fcef7:S001:T009 — Implement revision-pinned leases and safe resolver

Extend src/daemon/db/pool.ts and src/daemon/db/pool-cache.ts with metadata snapshots, tracked full-use callback leases, mutation barriers and idle-close safety; supply future overlay ports without S003 storage.

**Acceptance checks:**
- Saved-only lookupRoot semantics remain intact for unregistered/nested directories; management rights are separate.
- New leases reject barriers; active work prevents update/removal; finally release is idempotent and idle close cannot close active use.
- No raw Driver escapes callback lifetime; extension seam does not create session state.

### 1.8 E20261024484fcef7:S001:T007 — Implement serialized saved create/update service

Create proposed src/daemon/db/management.ts gate; combine profile materialization, revisions, leases extension point, credential staging and atomic commit.

**Acceptance checks:**
- Simultaneous create yields exactly one success; stale/deleted update cannot overwrite/recreate; revisions never reused.
- Malformed JSON, invalid shape and non-ENOENT read failures through v2 and legacy paths produce explicit errors with unchanged registry/keychain and zero staging/write calls.
- Legacy upsert intent remains atomic but cannot bypass corruption, busy or secret safety gates.

### 1.9 E20261024484fcef7:S001:T008 — Implement replay/status and activation-only retry

Implement receipt/inflight join, signed expiry-aware status, pending recovery and revision-targeted activation retry through the saved service.

**Acceptance checks:**
- Same ticket/request replay across restart returns one outcome; changed fingerprint rejects; expired pruned operation cannot replay.
- Activation retry makes zero persistence/staging calls and preserves revision/receipt/credential generation.
- Refresh failure requires only safe-list retry; never another create.

### 1.10 E20261024484fcef7:S001:T010 — Migrate data runtime and exploration acquisition aliases

Migrate src/analyze/runtimes/data/_shared.ts, discovery/schema runtimes, and src/analyze/explore/db-connections-list.ts, src/analyze/explore/db-tables-list.ts and src/analyze/explore/db-table-describe.ts to safe snapshots/leases, including injected seams.

**Acceptance checks:**
- Metadata-only versus driver-use classification matches the source inventory; injected acquire aliases cannot bypass the resolver.
- Existing scope-local pool behavior and deterministic outputs pass regression tests.
- Table/schema operations retain leases until complete result consumption and release on error.

### 1.11 E20261024484fcef7:S001:T011 — Migrate measurement and late-work lifetimes

Migrate src/analyze/measure.ts pending listings and measurement helpers to shared leases retained by underlying work rather than bounded waiters.

**Acceptance checks:**
- Timeout/cancel can return while work remains pending without releasing its lease.
- Update/removal remain busy until late success/rejection settles; shared pending work releases exactly once and preserves late-error handling.

### 1.12 E20261024484fcef7:S001:T012 — Migrate ordinary DB tools and schema-drift lifetimes

Replace raw acquisition and access-policy metadata lookups in src/daemon/tools/builtins/db/index.ts and src/daemon/tools/builtins/data/schema-drift.ts with safe resolver snapshots/full-use leases.

**Acceptance checks:**
- Every acquireDriver consumer and async iterator keeps full-use ownership; no stream completion/cancel path leaks or releases early.
- Driver-internal library pools stay within the outer lease rather than being mistaken for management pools.
- Metadata discovery retains safe scoped output and existing authorization semantics.

### 1.13 E20261024484fcef7:S001:T013 — Define typed memory row sources and shared converter normalization

Refactor src/daemon/db/drivers/converters/types.ts and shared conversion helpers to expose target catalog, ordered logical/physical types, nullability, normalization and schema-versioned batches while retaining saved conversion APIs.

**Acceptance checks:**
- Empty/all-null data still creates declared schema; no inference from first emitted row.
- Worksheet identity/slug and target-aware describe/batches are explicit; saved normalization is reusable, not duplicated lossy code.

### 1.14 E20261024484fcef7:S001:T014 — Implement bounded BSON and fixed-width memory decoding

Refactor src/daemon/db/drivers/converters/bson.ts and src/daemon/db/drivers/converters/fixed-width.ts for pre-allocation framing/record limits, cumulative budget and incremental batches.

**Acceptance checks:**
- Oversized BSON length headers fail before payload allocation; no readFile-all; record/depth/field/string limits enforced.
- Fixed-width giant records cannot grow an unbounded line buffer; every rejection closes streams and retained state.
- Saved/memory typed values and row completeness match on valid fixtures.

### 1.15 E20261024484fcef7:S001:T015 — Implement bounded Avro memory decoding

Refactor src/daemon/db/drivers/converters/avro.ts around explicit writer schema and bounded compressed/uncompressed blocks without Parquet destinations in memory mode.

**Acceptance checks:**
- Header/schema/block/expansion admission occurs before collection/materialization; no disk fallback.
- Full typed schema/nullability/normalization parity with saved fixtures, including zero rows, is proven.
- Over-limit block cleanup releases decoder/inflater buffers.

### 1.16 E20261024484fcef7:S001:T016 — Implement XLSX bounded archive and parser admission

Add bounded ZIP/XML admission beneath src/daemon/db/drivers/converters/xlsx.ts, rejecting unsupported expansion/encoding cases before full workbook parsing.

**Acceptance checks:**
- Entry count, declared+actual inflated bytes, retained parser/shared-string state and text/cell units are bounded before retention.
- No new Workbook/readFile-all fallback in memory-only path; compressed expansion and malformed metadata fixtures fail cleanly.

### 1.17 E20261024484fcef7:S001:T017 — Implement XLSX typed worksheet streaming

Use the bounded archive path to implement target catalog, legacy slug matching, shared-string semantics, two-pass typed inference and empty/all-null worksheet handling.

**Acceptance checks:**
- Target-specific sheet selection and schema cache never cross worksheets; no-target union matches legacy behavior.
- Unknown target and divergent schemas fail truthfully; directory-of-XLSX behavior is preserved.
- Full saved/memory typed value parity including empty _empty schema is verified.

### 1.18 E20261024484fcef7:S001:T018 — Implement private memory-only DuckDB execution resources

Create proposed src/daemon/db/file-execution.ts and extend src/daemon/db/duckdb-pool.ts for private bounded instances, typed appends, validated queries and idempotent disposal.

**Acceptance checks:**
- Memory-only init never INSTALLs extensions or creates spill/profile/cache files; unavailable safe readers fail explicitly.
- Typed empty tables, resource budgets and target-specific catalogs work; close/partial failure releases all handles.
- Saved singleton API remains compatible and separate.

### 1.19 E20261024484fcef7:S001:T019 — Thread file execution policy through factory and driver queries

Update src/daemon/db/drivers/duckdb-file.ts factory/constructor and all query/reader/iterator paths to use the owned FileExecutionResource; expose daemon-internal construction context only.

**Acceptance checks:**
- Every native/converted query uses owned resource callbacks; memory mode cannot invoke persistent ensureCached.
- close is no longer a no-op for private resources; target-aware schema cache is scoped correctly.
- Legacy transient factory path consumes S001 safe materialization/policy; S002 worker orchestration is not implemented here.

### 1.20 E20261024484fcef7:S001:T020 — Isolate saved conversion cache identities

Update src/daemon/db/converter-cache.ts and saved file-driver callers with canonical root/ID/revision/source/options/version identities and content freshness.

**Acceptance checks:**
- Destination, inflight key, sidecar and cleanup use the exact full identity; same-ID roots cannot share data.
- Same size/mtime but different contents cannot reuse stale conversion; memory-only routes never touch cache or path logs.
- Existing saved cache can be invalidated/rebuilt without touching source files.

### 1.21 E20261024484fcef7:S001:T021 — Wire v2 management routes and legacy safe projections

Register capabilities, drivers, safe list/read, ticket/mutate/status/activate in src/daemon/index.ts and src/daemon/db-rpc.ts, with trusted server request context and strict runtime schemas.

**Acceptance checks:**
- Unknown/malformed v2 payloads fail safely; legacy method names/success shapes remain through shared service.
- No stored secret/raw option leakage; new-client/old-daemon handshake reports upgrade-required.
- No UI, session store, test-worker orchestration or removal UX is added.
- Registered routes stay disabled and capabilities do not advertise mutations until adoption and all enablement evidence gates pass.

### 1.22 E20261024484fcef7:S001:T022 — Integrate maintenance adoption and fail-closed startup

Connect owner lease, safe existing daemon-stop control, signing keys, protected snapshots and generation-ref migration to per-root adoption/startup recovery.

**Acceptance checks:**
- Known old PID must be exited and actual target-filesystem fence proof must succeed before adoption advertises mutations.
- Root-privileged/unsupported filesystem, unprofiled secret fields, drift, missing key or incomplete recovery keeps feature disabled.
- No real registry/keychain is migrated by tests or build validation; downgrade remains stopped and explicit.

### 1.23 E20261024484fcef7:S001:T023 — Complete regression evidence and enablement gates

Run required build and focused suites, complete static import/alias/factory classification, failure/restart matrix and shared file fixture checks; record actual evidence and limitations.

**Acceptance checks:**
- All S001 criteria and sc1/sc2/sc3/sc8 tests pass with zero unclassified production acquisition/factory sites.
- Cancel equality, unreadable registry, concurrency, late leases, activation-only retry, refresh-only retry and signed-ticket pruning are explicitly evidenced.
- Feature remains disabled for any failed target-fence/profile/inventory gate; no claim of completion for sibling stories.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| CM-S1-A: per-driver profile matrix covers every listRegisteredKinds entry and preserves unexposed supported config. | `t1`, `t3` |
| CM-S1-B: create/update identity/revision/duplicate/busy validation occurs before secret or writer ports. | `t7`, `t9` |
| CM-S1-C: Keep/Replace/Clear, pinned-family preservation, request HMAC/signature/expiry and exact response sanitization. | `t3`, `t4`, `t21` |
| CM-S1-P: create/edit materialization and safe read followed by cancel/abandon before mutate leave registry bytes, revision/receipt map and every keychain value unchanged; no writer or keychain-write call. This tests the foundation boundary, not S005 UI. | `t3` |
| CM-S1-D: same-repo concurrent mutations/replays, separate-root independence and deleted-ID revision reuse refusal. | `t7`, `t8` |
| CM-S1-E: crash/failure injection before/after preparation sync, keychain stage, temp sync/chmod, rename, parent sync and obsolete-ref cleanup; restart/reconcile to exact committed truth. | `t5`, `t6`, `t8` |
| CM-S1-F: POSIX same-UID old writeFile recipe attempts overwrite AFTER the new digest check and read-only commit; expect EACCES and preserved management envelope. Also old pre-opened-fd writes only detached inode. Failed proof/privileged process/unsupported filesystem must disable adoption. | `t5`, `t22` |
| CM-S1-G: reject post-adoption chmod/rename/envelope drift; no automatic replay of missing receipt after drift; maintenance requires old identified PID gone. | `t22` |
| CM-S1-H: native and converted fixtures exercise private DuckDB memory-only mode; watch allowed filesystem roots/logs and inspect cache/temp directories for zero sidecar/spill/config/path leakage; close/partial failure releases all owned resources. | `t18`, `t19` |
| CM-S1-I: two roots/owners same ID/file name/size/mtime with different content return correct complete rows; saved cache freshness verifies content/source/options; converted values match saved normalization, not a lossy sample. | `t20` |
| CM-S1-Q: successful commit with failed activation then activation-only retry preserves exact config bytes, revision, receipt and credential generation; writer/keychain-stage call count remains zero during retry. | `t8` |
| CM-S1-R: successful commit followed by injected safe-list/refresh failure retries only list; assert no mutation request, new ticket, writer call, credential stage, revision bump or receipt duplication. | `t8`, `t21` |
| CM-S1-S: instrument decoder admission for oversized BSON headers/documents, Avro expansion blocks, giant fixed-width records and XLSX ZIP/shared-string expansion; abort before retaining an over-budget unit, then prove streams, inflater/parser state, tables and DB are cleaned. | `t14`, `t15`, `t16`, `t17`, `t18` |
| CM-S1-T: every DuckDBFileDriver query path uses its owned FileExecutionResource, readerPath cannot invoke ensureCached in memory-only mode, close disposes the resource and private initialization never calls INSTALL. Saved-cache callers use full root/revision/source/options identity. | `t18`, `t19`, `t20` |
| CM-S1-U: through BOTH legacy saveConnectionRpc and v2 mutation dispatch, attempt a save against (1) malformed JSON, (2) invalid registry shape, (3) injected non-ENOENT EACCES/EPERM/EIO read failures. Snapshot exact registry bytes and all fake keychain values first; assert byte/value equality after rejection, zero secret-staging calls, zero writer/rename calls and a non-empty sanitized registry-unreadable error rather than []/success. Include a replacement-password draft to prove extraction cannot occur before the failed read. ENOENT is a separate valid-unmanaged-empty control, never conflated with these failures. | `t7`, `t21` |
| CM-S1-V: measure.ts timeout/cancellation while underlying reachAndList remains pending keeps its one shared lease and update/remove busy; late settle/reject releases once and clears pendingListings. Injected exploration aliases and db async iterators cannot release early or leak a raw driver. | `t10`, `t11`, `t12` |
| CM-S1-W: saved versus memory-only full typed schema/nullability/value parity for Avro, BSON dates/large numeric normalization and XLSX worksheet target/slug selection; empty/all-null schema, zero-row _empty sheet, incompatible union and unknown-target behavior; target-specific schema cache never crosses sheets. | `t13`, `t14`, `t15`, `t17` |
| CM-S1-J: legacy success shapes versus v2 structured errors; malformed requests, unknown ticket fields, wrong root/target and no stored-secret return. | `t2`, `t21` |
| CM-S1-K: run existing own-directory data runtime cases and pinned-family config tests without redirecting roots or normalizing records. | `t3`, `t9`, `t10` |
| CM-S1-L: static TypeScript import/alias/factory/acquire inventory with zero unclassified production sites; each classified use has metadata-only, full-use lease or bounded-private-probe rationale. | `t1`, `t10`, `t12`, `t23` |
| CM-S1-M: full-use lease spans asynchronous iteration and nested calls; update barrier rejects busy; release-on-error and cancellation; no idle close while leased. Session overlay stub is injectable but no S003 store implemented. | `t9`, `t10`, `t12` |
| CM-S1-N: adopt a registered fixture root, create, safe read, label update, activation failure, lost response/restart/status and one same-ticket replay; inspect canonical registry and fake keychain generations. | `t22`, `t23` |
| CM-S1-O: start on a managed read-only registry and refuse unsafe downgrade/direct legacy write; older clients can use safe adapter projections through new service. | `t5`, `t22`, `t23` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails and sc1/sc2/sc3/sc8 boundaries`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges and driver/file execution contracts`
- **[[c3]]** `prior-artifact` `LLD s1 errorPaths and recovery invariants`
- **[[c4]]** `prior-artifact` `LLD s1 testStrategy CM-S1-A through CM-S1-W`
- **[[c5]]** `analyze-bundle` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/s001-context.json`
- **[[c6]]** `prior-artifact` `LLD s1 migration and deployment writer-fence gates`
