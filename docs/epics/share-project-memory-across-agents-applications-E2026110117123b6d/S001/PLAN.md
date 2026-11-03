<!-- insrc:artifact PLAN-17123b6d304af2a2-s1 -->

# Plan: E2026110117123b6d:S001

## Summary

**Epic:** `share-project-memory-across-agents-applications`
**LLD run:** `wf-1793546114017-naphyg`
**LLD effective hash:** `18ac1fc6f9d6...`

Build the independent package and public contracts first, then prove the native ownership primitive before composing the embedded runtime. Every task runs focused tests; isolated package consumption and real macOS/Linux ownership evidence complete the foundation. Durable queueing, memory storage, semantic processing and IPC remain with their later stories.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Create the independent package, public types and workspace build | M | — | unit: public-v1-types-and-emitted-boundary; smoke: pure-public-import-without-native-or-daemon | [[c1]] [[c2]] |
| 2 | **`t2`** Qualify the pinned native binding under Node 22 | M | `t1` | integration: node22-fs-ext-abi-and-separate-descriptor-probe | [[c3]] [[c4]] |
| 3 | **`t3`** Validate configuration, canonical roots and layout state | M | `t1`, `t2` | unit: options-fail-before-side-effects; integration: canonical-root-and-readonly-layout-validation | [[c3]] [[c4]] |
| 4 | **`t4`** Implement descriptor-held exclusive ownership and cleanup | M | `t2`, `t3` | integration: exclusive-descriptor-and-owned-bootstrap; integration: native-callback-cleanup-and-inode-faults | [[c3]] [[c4]] |
| 5 | **`t5`** Implement the shared module-local model dispatcher | M | `t1` | unit: one-underlying-call-complete-and-embed; unit: cancel-timeout-rejection-and-bounded-backpressure | [[c5]] [[c4]] |
| 6 | **`t6`** Compose the embedded lifecycle and unavailable-capability facade | M | `t3`, `t4`, `t5` | unit: idempotent-drain-close-and-provider-ownership; smoke: foundation-data-methods-return-not-ready | [[c1]] [[c3]] [[c4]] [[c5]] |
| 7 | **`t7`** Prove real contention, crash release and lifecycle failure safety | M | `t4`, `t6` | integration: same-process-package-copy-thread-process-contention; integration: killed-owner-release-stopped-owner-exclusion-and-aliases | [[c6]] [[c4]] |
| 8 | **`t8`** Prove isolated packed consumption and document the foundation | M | `t6`, `t7` | smoke: packed-isolated-node22-consumer; smoke: packed-native-missing-import-versus-open; unit: tarball-public-dependency-and-asset-allowlist | [[c2]] [[c6]] |
| 9 | **`t9`** Qualify Linux through a focused manual CI path | M | `t7`, `t8` | integration: manual-linux-ext4-node22-native-and-lifecycle; smoke: manual-linux-packed-consumer-and-natural-exit | [[c6]] [[c7]] |
| 10 | **`t10`** Validate S1 as an integrated foundation and prepare the build handoff | S | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8`, `t9` | smoke: combined-s1-acceptance-evidence-and-boundary-check; smoke: preserved-root-package-first-build | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] [[c7]] |

### 1.1 E2026110117123b6d:S001:T001 — Create the independent package, public types and workspace build

Add the approved package manifest/strict NodeNext build, sc1/sc2 public types and pure public entry; wire the minimal npm workspace and preserve root backend build steps. No backend imports, eager native imports or unfinished IPC/executable exports.

**Acceptance checks:**
- Public types compile with .js/import-type/explicit-undefined conventions and match sc1/sc2.
- Root build compiles package before existing backend stages while rootDir/out paths stay unchanged.
- A child import has no selected directory/native/provider/handler side effects; unfinished capabilities never claim success.

### 1.2 E2026110117123b6d:S001:T002 — Qualify the pinned native binding under Node 22

Declare and resolve fs-ext 2.1.1 without broad dependency upgrades; verify actual Node 22 ABI/build/load and a real nonblocking descriptor smoke test on the local supported filesystem before implementing ownership around it.

**Acceptance checks:**
- Record actual executable/version, native ABI/header target, filesystem and resolved dependency provenance.
- Pinned binding loads and excludes a separately opened descriptor; incompatible/missing binding is explicit NOT_READY.
- Failure stops dependent ownership work; Python OS evidence or package engines metadata cannot substitute for Node qualification.

### 1.3 E2026110117123b6d:S001:T003 — Validate configuration, canonical roots and layout state

Implement options/port/limit validation, supported runtime/filesystem checks, canonical directory identity and read-only bootstrap layout validation/recovery planning. Do not create or repair layout metadata before t4 acquires ownership; keep host-owned resources untouched and memory content/queue/Lance absent.

**Acceptance checks:**
- Bad configuration is rejected before mkdir/provider/native calls; filesystem check uses the actual resolved target.
- Aliases resolve consistently; unsafe/unrecognized nonempty roots and malformed layout state are refused.
- Recognized interrupted bootstrap is classified without writing/recovery before ownership; host cross-store containment remains an explicit validated precondition.

### 1.4 E2026110117123b6d:S001:T004 — Implement descriptor-held exclusive ownership and cleanup

Implement the private guard using separate safe descriptors, exclusive/nonblocking flock, close-on-exec and inode/path checks. Retain the persistent lock inode; handle native callback/cleanup ordering without descriptor reuse hazards. Only after acquisition and identity rechecks, create or repair recognized versioned bootstrap metadata using the qualified safe write sequence; no memory content is persisted.

**Acceptance checks:**
- Only one cooperating instance owns a canonical root; contenders close only their own resources.
- No PID/mtime/lease timeout or unlink-and-recreate path grants ownership.
- Startup failure, unsafe inode replacement, symlink/hardlink lock paths and late native callbacks produce typed failure without leaked or premature ownership.
- Bootstrap metadata writes/repairs happen only under the acquired guard; every acquisition/initialization failure cleans its own fd safely.

### 1.5 E2026110117123b6d:S001:T005 — Implement the shared module-local model dispatcher

Serialize complete/embed calls across module consumers, with bounded pending work, queued cancellation, active abort/timeout handling and continued lane ownership until underlying settlement.

**Acceptance checks:**
- Maximum underlying model concurrency remains one across completion/embedding consumers, including rejection and timeout.
- Queued cancellation invokes no provider; overload is explicit and bounded.
- A timed-out wrapper or ignored abort cannot start another provider request early; later requests resume only after actual settlement.
- Record and test the concrete finite private pending-model-call bound, distinct from s2 durable queue byte limits; no extra public option is added.

### 1.6 E2026110117123b6d:S001:T006 — Compose the embedded lifecycle and unavailable-capability facade

Integrate validation, guard and dispatcher in MemoryFactory.open and the private lifecycle coordinator; implement stable ready/drain/close behavior and the S1 NOT_READY data facade.

**Acceptance checks:**
- Open returns only a safely owned initialized foundation; failures unwind acquired resources.
- Concurrent drain/close is idempotent, admission stays closed and ownership is retained until safe quiescence.
- Provider/logger/policy objects remain usable and unclosed; data methods return NOT_READY without fake receipts/empty reads or backend startup.

### 1.7 E2026110117123b6d:S001:T007 — Prove real contention, crash release and lifecycle failure safety

Add controlled child/worker/package-copy fixtures and real binding integration tests for contention, aliasing, distinct roots, killed/stopped owners and initialization/cleanup faults.

**Acceptance checks:**
- Same-process, duplicate-package, worker-thread and cross-process contention have exactly one winner.
- A forced-dead owner can be replaced without deleting the lock; a stopped live owner is never stolen.
- Distinct roots remain independent; close/drain/failure races preserve supplied resources and avoid leaked/reused descriptors.

### 1.8 E2026110117123b6d:S001:T008 — Prove isolated packed consumption and document the foundation

Implement allowlisted packaging and an isolated external TS/ESM consumer test that installs the tarball normally under Node 22; document explicit open, supported prerequisites and S1 limitations.

**Acceptance checks:**
- Packed consumer has no workspace symlink, NODE_PATH/backend files/config; public typecheck and open/drain/close succeed with actual declared dependencies.
- Import remains pure when native dependency loading is unavailable; explicit open fails honestly.
- Tarball contains required declarations/runtime assets/license and excludes sources/tests/backend/native binaries for a different ABI; no publish occurs.

### 1.9 E2026110117123b6d:S001:T009 — Qualify Linux through a focused manual CI path

Add a separate proposed .github/workflows/project-memory.yml for manual-only Node 22/ext4 S1 qualification, following existing CI's resource policy. Leave .github/workflows/ci.yml unchanged and isolate concurrency from unrelated backend runs; run only required package ownership and packed-consumer checks.

**Acceptance checks:**
- New workflow is workflow_dispatch only, with an isolated concurrency group and explicit timeout; existing CI triggers/default jobs remain unchanged.
- Actual Linux runtime, filesystem, native binding, real contention/crash and packed-consumer evidence is recorded; unsupported/skipped fixtures do not count as qualified.
- Existing default manual backend job semantics are preserved; unavailable runner or failed native qualification remains visible and prevents claiming complete advertised-platform coverage.

### 1.10 E2026110117123b6d:S001:T010 — Validate S1 as an integrated foundation and prepare the build handoff

Run the completed package's focused contract/unit/native/consumer checks and preserved root build once; record acceptance coverage, scope boundaries, runtime/filesystem evidence and any unresolved qualification for independent code review.

**Acceptance checks:**
- ac1/ac2 proving tests have linked actual results, including package independence and safe ownership lifecycle.
- Source dependency closure contains no backend/runtime coupling and no s2-s9 semantic/storage/IPC implementation.
- No full repository sweep is run per task or hidden behind native qualification; the broader feature sweep retains the user's agreed sequencing. Code review and completion approval remain subsequent workflow gates.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Public API typecheck under strict NodeNext/exactOptionalPropertyTypes including explicit undefined optional fields and no SDK imports. | `t1`, `t8` |
| No backend src/config/daemon/db or workspace-root runtime files in emitted import/declaration closure or tarball. | `t1`, `t8`, `t10` |
| Import in a clean child process changes no selected temp-root files, listener counts or active native/provider state; negative test verifies an eager addon/daemon import would be caught. | `t1`, `t8` |
| S1 unsupported methods consistently reject NOT_READY without policy/model calls, accepted receipts or successful empty reads. | `t6`, `t10` |
| Option shape/range failures occur before I/O; required ports and supplied-resource ownership are checked. | `t3`, `t6` |
| Concurrent close/drain and startup failure unwind once; injected logger failures cannot break cleanup. | `t4`, `t6`, `t7` |
| Controllable complete+embed calls across several simulated consumers never exceed one underlying call, including queued cancellation, rejection, timeout and a provider ignoring abort. | `t5` |
| An aborted wrapper does not admit the next provider call until the first underlying promise settles; close/drain do not report safe quiescence early. | `t5`, `t6` |
| Bounded dispatcher overload returns explicit BACKPRESSURE rather than growing without limit; monotonic drain deadline is tested with controlled timing. | `t5`, `t6` |
| Two real instances in one process, two separately loaded package copies, two worker threads and two processes compete for the same root; exactly one succeeds. | `t7`, `t9` |
| Canonical path aliases contend; distinct nonoverlapping directories can coexist; symlink/hardlink lockfile or replaced inode is refused. | `t3`, `t4`, `t7`, `t9` |
| Force-kill an owning child and reacquire the persistent lock without deleting it; stop/resume a live owner and verify no timeout-based takeover. | `t7`, `t9` |
| Failed initialization/native callback ordering cannot close a reused fd or leak an owner; concurrent reopen stays excluded until safe close. | `t4`, `t6`, `t7` |
| Bootstrap interruption before/after marker write recovers recognized incomplete layout only under ownership; arbitrary/index-like nonempty directories are refused. | `t3`, `t4`, `t7` |
| Runtime/filesystem gate refuses unsupported configurations and reports unavailable native binding honestly. | `t2`, `t3`, `t8`, `t9` |
| Build package independently; npm pack; install tarball and its declared runtime deps in an isolated directory outside repository resolution; import/typecheck/open/drain/close using public entry. | `t8`, `t9` |
| Run packed import with native package deliberately unavailable: import stays pure; explicit open fails NOT_READY. | `t8` |
| The isolated consumer has no backend source, NODE_PATH override, workspace node_modules or inherited backend config; supplied host provider remains usable after close. | `t6`, `t8` |
| Root build runs package first and retains backend tsc/model checks/copy-assets and existing output paths. No npm publish or full sweep is triggered by packaging. | `t1`, `t8`, `t10` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/LLD.md#3-data-model-changes` — "Package manifest and build boundary; Build and packed consumption."
- **[[c3]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/LLD.md#3-data-model-changes` — "MemoryOptions and v1 types; Directory identity and exclusive ownership; Platform and ownership qualification."
- **[[c4]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/LLD.md#6-error-paths`
- **[[c5]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/LLD.md#3-data-model-changes` — "Module-local model dispatcher; Lifecycle and private composition."
- **[[c6]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/LLD.md#7-test-strategy`
- **[[c7]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/LLD.md#7-test-strategy` — "Dedicated local APFS/macOS and ext4/Linux CI roots, Node 22 >=22.22.1, native build toolchain."
