<!-- insrc:artifact PLAN-470a1f61b26b12c6-s1 -->

# Plan: STORY-470a1f61b26b12c6-s1

## Summary

**Epic:** `rework-review-preparation-context-lifecycle-end`
**LLD run:** `wf-1794817146336-3c95t8`
**LLD effective hash:** `ccb16f2a6299...`

This revision preserves the completed review-lifecycle build and adds a source-light correction before final qualification. The remaining work explicitly reconciles duplicate provenance, replaces durable aggregate source bodies with exact locators and attempt-owned commit-parent workspaces, integrates that model through production code-review lifecycle paths, then re-runs the retained full workload and packaging gates.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Retain workload fixture and establish managed baseline | M | approved r1 | — | integration: Proposed retained-fixture baseline: real managed Git, exact171-file/four-attempt scope and operation/write counters; deterministic provider not called before ready. | [[c1]] [[c8]] |
| 2 | **`t2`** Define versioned preparation and operational contracts | M | approved r1 | `t1` | unit: Proposed exact contracts: supported historical/version3 checkpoint decode, RuntimeV1 bound, manifest/history/cleanup binding identity and forged capabilities. | [[c2]] [[c3]] |
| 3 | **`t3`** Implement compact host runtime durability | L | draft r2 | `t2` | integration: Compact adapter/native-host integration: open-before-spawn, disposal-before-close, uncertain writes, injected initialization interruption, actual proof replacement and zero full-history native/progress updates; production wiring qualified in t12/t13. | [[c3]] |
| 4 | **`t4`** Implement reserved disk-backed source sessions | L | approved r1 | `t2` | integration: Proposed source-session tests: batching/framing/hash equivalence, per-packet budgets, above-memory disk retention, aggregate reservation exhaustion and zero duplicate queries. | [[c4]] |
| 5 | **`t5`** Implement stable qualified source contexts and private borrows | L | approved r1 | `t3`, `t4` | integration: Proposed context acquisition tests: private worker receipts/borrows, ready ordering, warm cross-worker handoff, tamper/restart invalidation and eviction restrictions. | [[c2]] [[c4]] |
| 6 | **`t6`** Implement successor history validation and result commits | M | approved r1 | `t5` | integration: Proposed history binding tests: successive task/chunk feedback and new evidence, old-history tamper, checkpoint/runtime crash reconciliation and no source/model rerun. | [[c2]] [[c3]] |
| 7 | **`t7`** Integrate code review preparation across routes | L | draft r2 | `t6` | integration: Extend route-admission/projection-lineage/final-scope tests: all workflow story/task routes, merge/rename/delete witnesses, aliases and exact selected after blocks. | [[c5]] |
| 8 | **`t8`** Integrate design review latest-subject preparation | L | draft r2 | `t6` | integration: Extend design subject-monitor/recovery tests: latest DEF/HLD/LLD routes, impact/chunk reuse, target invalidation/user restart and unrelated edit stability. | [[c5]] |
| 9 | **`t9`** Add exact cancellation and preparation progress surfaces | L | draft r2 | `t7`, `t8` | integration: Extend worker isolation/progress/recovery and MCP wire fixtures: cancel exact review during preparation/tool/model/publication races, owner rejection, resource fence and nullable genuine counters.; integration: Private preparation bridge tests: exact worker/review ownership, aggregate project capacity, split/combine allocation retention, context/runtime receipts, worker reclamation and cleanup-only release. | [[c6]] |
| 10 | **`t10`** Integrate publication and approval with new proof | L | approved r1 | `t7`, `t8` | integration: Extend both-family publication/approval tests: complete new CR capabilities, warm zero reconstruction, publication-only retry zero model calls and current-author/BUILD freshness. | [[c7]] |
| 11 | **`t11`** Implement resumable cleanup claims for both families | L | approved r1 | `t9`, `t10` | integration: Extend both-family cleanup tests: fault every claim/rename/unlink/fsync boundary; cleanup retry after runtime/checkpoint removal, approval/file mismatch and arbitrary missing-runtime refusal. | [[c7]] |
| 12 | **`t12`** Implement explicit inactive-record migration and coordinated cutover | M | draft r3 | `t11` | integration: Proposed migration/cutover tests: inactive v1/v2 byte-preserving upgrade, legacy guards, interrupted migration, unknown capabilities and unsupported old-reader downgrade. | [[c8]] |
| 13 | **`t13`** Qualify failure, concurrency and scope equivalence | L | draft r3 | `t12` | integration: Full disposable production two-session matrix through public routes and both families, all crash/tamper/native-loss cases, complete scope equivalence and bounded runtime writes. | [[c1]] [[c3]] [[c5]] [[c6]] [[c7]] [[c8]] |
| 14 | **`t15`** Stage typed packet descriptors with bounded memory ownership | L | approved r1 | `t13` | unit: Typed staged descriptor/leaf codec and shared memory accounting: byte/Unicode/null/order round-trip, shard/version/tamper rejection, reserve-before-allocation and exact window release.; integration: Staged view capacity ownership: aggregate disk reservations, partial sealing, borrowed-window cancellation and two-session memory/disk pressure retain complete evidence. | [[c9]] [[c2]] [[c4]] |
| 15 | **`t16`** Bound packet projection and history qualification construction | L | approved r1 | `t15` | unit: Incremental packet/projection/history equivalence: exact selected after spans, all lineage/replacement/merge/deletion witnesses, tests/documents/origins and identity folds match the existing oracle.; integration: Single oversized packet and1/4/max history construct staged views under combined memory bound with zero physical duplicate source queries and no aggregate binary JSON materialization. | [[c9]] [[c1]] [[c5]] |
| 16 | **`t17`** Use bounded views in execution and mandatory coverage assessment | L | approved r1 | `t16` | integration: Bounded execution and mandatory coverage traversal for code/design task/story routes: no skipped modules, prompt/provider transport copies charged, borrow invalidation/cancellation and no premature provider dispatch. | [[c9]] [[c5]] [[c6]] |
| 17 | **`t18`** Use staged views across recovery publication and cleanup | L | approved r1 | `t16`, `t17` | integration: Bounded warm/cold recovery publication and cleanup: full feedback round-trip, zero warm source/model calls, old derived version rejection, history/native/cleanup crash and authority invariants. | [[c9]] [[c2]] [[c7]] [[c8]] |
| 18 | **`t19`** Trace and correct measured admission latency | M | approved r1 | `t18` | integration: Measured admission segment attribution and durable-ack two-session race matrix: controlled admit/cancel<=2s, progress gap<=2s, complete owner/guard/binding checks and no duplicate dispatch. | [[c10]] [[c3]] [[c6]] |
| 19 | **`t20`** Qualify the complete staged-view production cutover | L | approved r1 | `t18`, `t19` | integration: Actual production staged-view cutover matrix for both families and all workflow routes: combined memory high-water, complete scope/history equality, zero duplicate queries/full-history hot writes, cancellation/tamper/crash fences and task-order preservation.; integration: Source-free compiled package code/design daemon/controller smoke plus backend build after bounded-view cutover; retained full T14 workload remains an independent final gate. | [[c9]] [[c10]] [[c1]] [[c7]] [[c8]] |
| 20 | **`t21`** Reconcile duplicate lifecycle provenance | M | — | `t20` | integration: Duplicate ISSUE/LLD lifecycle reconciliation: atomic supersession, replacement provenance, non-routability, retry/readback failure, and unchanged primary PLAN/BUILD/TESTS evidence. | [[c11]] [[c12]] |
| 21 | **`t22`** Define source-light locator, manifest and historical-reader contracts | M | — | `t21` | unit: Source-light locator/manifest codecs: ordered Unicode paths, add/delete/rename/replacement/merge/binary metadata, object and parent identities, version rejection, tamper/cross-attempt detection, and source-body absence. | [[c11]] [[c13]] |
| 22 | **`t23`** Implement commit-parent workspaces and transient selected after blocks | L | — | `t22` | integration: Pinned commit-parent workspace matrix: new/delete/rename/stacked commits, exact transient after ranges, relevant-only parent files, manifest sealing, concurrent attempt isolation, cancellation and owned cleanup. | [[c11]] [[c13]] |
| 23 | **`t24`** Integrate source-light preparation through the production lifecycle | L | — | `t23` | integration: Production source-light lifecycle matrix for CodePreparation, StagedPacketConstruction, StagedPacketSources, workers, routes, checkpoint/recovery/progress/cancel/publication/approval/cleanup, mandatory coverage, and unchanged latest-document design review. | [[c11]] [[c13]] |
| 24 | **`t25`** Migrate readers, remove eager source ownership and qualify cutover readiness | L | — | `t24` | integration: Source-light cutover regressions: historical cold requalification/rejection, no eager fallback, two-session isolation, cancel/restart/tamper/publication/cleanup, production defaults and task-order preservation.; smoke: Backend build and source-free compiled package smoke for code and design review after eager source ownership removal. | [[c11]] [[c12]] [[c13]] |
| 25 | **`t14`** Qualify performance, packaging and deployment handoff | L | draft r2 | `t25` | integration: Retained 171-file/four-attempt cold x3, warm and history 1/4/max source-light qualification with locator/Git/workspace/memory/RSS/write metrics, exact scope and mandatory coverage.; smoke: Approved deployment handoff and explicit post-restart code/design smoke; the stopped review is retriggered only with separate user authorization. | [[c1]] [[c8]] [[c11]] [[c13]] |

### 1.1 TASK-470a1f61b26b12c6-s1-t1 — Retain workload fixture and establish managed baseline

Capture the 171-file/four-attempt descriptor and baseline using disposable registered projects, real managed Git/native paths and deterministic model stubs.

**Acceptance checks:**
- Reproducible fixture preserves exact selected scope, histories and origins; records host/load, source-query and persistence metrics without touching stopped attempt4.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.

### 1.2 TASK-470a1f61b26b12c6-s1-t2 — Define versioned preparation and operational contracts

Add proposed exact checkpoint3, RuntimeV1, source manifest, HistoryBindingV1, cleanup claim and private capability types/decoders in existing shared review areas.

**Acceptance checks:**
- Both family and supported historical readers reject unknown/mismatched required formats; runtime <=256KiB and client-forged authority rejected.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.

### 1.3 TASK-470a1f61b26b12c6-s1-t3 — Implement compact host runtime durability

Implement the sole-main-writer compact runtime persistence adapter and verify it through the real ReviewNativeHost/ReviewProcessLeases boundary. Preserve atomic save outcomes and host closure proof. Do not activate production storage before t7-t12 integration and coordinated cutover.

**Acceptance checks:**
- At the compact adapter/native-host boundary: open intent precedes spawn; closure requires confirmed disposal; uncertain writes retain fences; native/progress updates leave full history unchanged. Production public-route wiring is required in t12/t13, not this foundation task.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.

### 1.4 TASK-470a1f61b26b12c6-s1-t4 — Implement reserved disk-backed source sessions

Extend RegistryReviewSources with exact query coalescing, existing cat-file batching, verified staging/index and per-project capacity reservations.

**Acceptance checks:**
- Zero duplicate physical queries across historical/current consumers, including above-memory workload; logical per-packet budgets unchanged; pinned disk exhaustion fails before batch.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.

### 1.5 TASK-470a1f61b26b12c6-s1-t5 — Implement stable qualified source contexts and private borrows

Add proposed shared preparation acquisition around existing validators, immutable staged-ready manifests and current-epoch host receipts, with bounded main metadata.

**Acceptance checks:**
- Warm authorized handoff reuses verified sources after terminal worker reclamation; tampered files revoke receipt; cold daemon restart never trusts disk alone.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.

### 1.6 TASK-470a1f61b26b12c6-s1-t6 — Implement successor history validation and result commits

Separate stable source generation from immutable validated feedback/history bindings; validate deltas, attribution/origins and newly referenced evidence.

**Acceptance checks:**
- Normal feedback and publication bookkeeping never rebuild unchanged sources; changed earlier history invalidates descendants; committed feedback reconciles runtime without model rerun.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.

### 1.7 TASK-470a1f61b26b12c6-s1-t7 — Integrate code review preparation across routes

Route admission, packet projection, task/story execution and explicit recovery through shared preparation, preserving all selected spans and pinned history. Deliver private adapters consumed by existing coordinator/worker dependency seams and exercise them in focused integration fixtures. Production runtime selection is activated only in the coordinated t12 cutover after host and lifecycle dependencies exist.

**Acceptance checks:**
- Through the shared family adapter, Epic/standalone/ISSUE/LLD-only/no-document routes and aliases preserve exact scope; no generic HEAD diff or skipped modules; immutable attempts remain pinned.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.
- This task gates the complete family adapter and its focused tests, not default production selection. It must expose execution/recovery seams for t9/t12; full production activation is mandatory in t12 and independently qualified in t13. No feature flag, parallel review engine or incomplete production cutover.

### 1.8 TASK-470a1f61b26b12c6-s1-t8 — Integrate design review latest-subject preparation

Route subject capture, planning/impact/chunks and explicit recovery through same lifecycle with design-specific latest target/ancestry checks. Deliver private adapters consumed by existing coordinator/worker dependency seams and exercise them in focused integration fixtures. Production runtime selection is activated only in the coordinated t12 cutover after host and lifecycle dependencies exist.

**Acceptance checks:**
- Through the shared family adapter, DEF/HLD/LLD route matrix passes; relevant target changes invalidate and await human restart; unrelated edits ignored; prompts use paths, not artifact bodies.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.
- This task gates the complete family adapter and its focused tests, not default production selection. It must expose execution/recovery seams for t9/t12; full production activation is mandatory in t12 and independently qualified in t13. No feature flag, parallel review engine or incomplete production cutover.

### 1.9 TASK-470a1f61b26b12c6-s1-t9 — Add exact cancellation and preparation progress surfaces

Extend worker control and both public MCP/daemon surfaces plus supported IPC DTOs for cancellation and bounded genuine preparation counters. Implement the private host-to-worker bridge for the main-owned per-project capacity allocator, runtime store and context registry; retain exact per-review allocation ownership across worker reclamation and release only after proven file cleanup.

**Acceptance checks:**
- Exact owner-only cancel prevents new work, stops only selected worker, reports honest resource fences; polling creates no activity; both clients agree with enums.
- Cancel/spawn/candidate/publication races preserve exact ownership and already committed results; progress counters reflect genuine completed operations only.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.
- Private worker ports bind capacity/runtime/context requests to the exact current review owner and phase; workers cannot instantiate separate project allocators or mint context/runtime authority. Test the bridge before t12 activation.

### 1.10 TASK-470a1f61b26b12c6-s1-t10 — Integrate publication and approval with new proof

Use qualified context/history/runtime proof for both publishers and approval freshness; emit supported new permanent CR capabilities with complete saved history/audit.

**Acceptance checks:**
- Publication retries use zero model calls, warm matching publication has no source reconstruction, permanent history is self-contained and independently validated.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.

### 1.11 TASK-470a1f61b26b12c6-s1-t11 — Implement resumable cleanup claims for both families

Extend existing design private-claim pattern to exact multi-file cleanup; preserve closed audit/permanent proof, sync claim before destructive deletes, delete claim last.

**Acceptance checks:**
- Crash after each deletion resumes cleanup-only without Git/model calls; missing runtime without claim stays fenced; current approval and file identities rechecked; unrelated files retained.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.

### 1.12 TASK-470a1f61b26b12c6-s1-t12 — Implement explicit inactive-record migration and coordinated cutover

Migrate supported old inactive records under exact fences; preserve inputs/results/actions and unresolved guards; wire all production consumers to new execution without flags or legacy dual writers.

**Acceptance checks:**
- Interrupted migration never loses proof; old-only rollback rejected after new formats; no automatic scans/resume, no partial daemon deployment or stopped-attempt restart.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.
- Wire the real production review ownership, both-family checkpoint/native resource, progress, publication, approval and cleanup paths to compact runtime; no test-only adapter or legacy active-writer fallback remains for new execution.
- Activate the t7/t8 shared family preparation adapters and t9 host bridge through every production task/story admission, execution, explicit recovery and publication path; remove old active-writer selections in this same cutover. Test-only adapters do not satisfy this task.

### 1.13 TASK-470a1f61b26b12c6-s1-t13 — Qualify failure, concurrency and scope equivalence

Run both-family production fixtures covering all route matrices, source equivalence, tampering, write windows, native disposal, cancellation and cleanup/migration crashes.

**Acceptance checks:**
- Two independent review sessions remain isolated; full-history writes/native command=0; all mandatory source/test coverage preserved; no user socket/DB or hosted quota used.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.
- Through actual registered production review routes, prove native resource and progress writes perform zero full-history mutations for both code and design reviews.
- Repeat all t7/t8 route, alias, merge/rename/delete witness, exact-selected-span and latest-subject invariants through actual production defaults for both families.

### 1.14 TASK-470a1f61b26b12c6-s1-t15 — Stage typed packet descriptors with bounded memory ownership

Extend the existing prepared-context codec/store with proposed typed packet/task/file descriptor indexes, bounded leaf/window access and explicit release; unify live-memory charging with source staging and host disk reservations. Add derived encoding version checks without changing pinned history or CRs.

**Acceptance checks:**
- Document and implement descriptor lookup, bounded window acquisition/release and cancellation ownership in existing review-context modules; no new DB or eager compatibility path.
- Reserve before allocation for shared binary buffers, UTF-16 strings, metadata/index shards and encoder/decoder scratch; release only after final owner. Staged immutable leaves retain complete content/digests and aggregate disk reservation.
- Round-trip byte arrays, Unicode, null/undefined and ordered descriptor references; reject unknown/old derived encodings and foreign/tampered objects before use. Partial generation never grants readiness; unchanged64MiB memory/256MiBcache/4MiBbatch defaults.
- Run and record this task's focused validation before advancing; no intermediate adapter completion authorizes deployment or resumes the stopped review.

### 1.15 TASK-470a1f61b26b12c6-s1-t16 — Bound packet projection and history qualification construction

Convert existing packet/projection/history preparation to stage each validation window and retain bounded descriptor/lineage indexes instead of whole prepared packets and historical inventories.

**Acceptance checks:**
- Cold/current/historical construction keeps exact selected spans, rename/delete/replacement/merge witnesses, commit provenance, tests/documents and complete feedback/origin validation; logical per-packet projection limits still apply on source-cache hits.
- No JSON.stringify of binary packet payloads for size/digest, aggregate packets/inputs array or full-history clone. Fold ordered descriptor identities with explicit version/domain; release one window before opening next without duplicate physical source acquisition.
- Single-packet and repeated-history content beyond decoded memory budget but within reserved disk completes semantic qualification with combined charged memory<=configured cap; genuine unbounded atomic unit fails before allocation with exact stage/size/bound.
- Run and record this task's focused validation before advancing; no intermediate adapter completion authorizes deployment or resumes the stopped review.

### 1.16 TASK-470a1f61b26b12c6-s1-t17 — Use bounded views in execution and mandatory coverage assessment

Convert code/design assessment adapters, selected-code extraction, prompt assembly and test-coverage readers to bounded task/file windows under current private generation borrows.

**Acceptance checks:**
- Complete submitted review scope and mandatory test-coverage assessment remain identical for task/whole-story routes; no module omitted because of size. Test execution remains optional, scope and coverage do not.
- Final prompt assembly, serialization and provider transport copies are included in memory reservations/high-water instrumentation; do not hide whole-task/whole-packet hydration behind a lazy accessor.
- Borrow/release/cancel rules hold through provider/native consumption; no source/provider use from unqualified or revoked descriptors. Keep existing model capability and CLI provider path; design prompts use current paths, not copied artifacts.
- Run and record this task's focused validation before advancing; no intermediate adapter completion authorizes deployment or resumes the stopped review.

### 1.17 TASK-470a1f61b26b12c6-s1-t18 — Use staged views across recovery publication and cleanup

Convert warm/cold phase handoff, history binding/evidence, publication and approval cleanup to the same bounded descriptor traversal; remove aggregate reader.view inventory loading.

**Acceptance checks:**
- Matching authorized warm handoff/publication/cleanup reconstructs zero sources and invokes zero models; cold restart discards authority and fully qualifies required scope/history once with bounded windows.
- All pinned submitted values, feedback/actions/failures and origin witnesses survive exact publication/permanent round-trip; old derived encoding cannot become authority or trigger unsafe cache deletion.
- Preserve result-before-progress ordering, native open/disposal fences and durable cleanup-only claim; canceled active windows and partial stage/seal/promotion/reopen/cleanup failures retain exact evidence/reservations and allow only explicit safe recovery.
- Run and record this task's focused validation before advancing; no intermediate adapter completion authorizes deployment or resumes the stopped review.

### 1.18 TASK-470a1f61b26b12c6-s1-t19 — Trace and correct measured admission latency

Instrument public admission request, registration, stored guard/scope checks, worker startup, checkpoint/runtime binding, activation and acknowledgement; correct only the measured slow path while preserving durable acknowledgement.

**Acceptance checks:**
- Record cold/warm monotonic segment timings and causal attribution for the observed2831ms baseline; no assumed Git/model bottleneck.
- Source/projection/history qualification stays in dedicated registered background workers; any moved expensive pre-ack derivation retains equivalent current owner/author/route/guard validation and bounded DTOs.
- Acknowledgement follows proven durable input/runtime activation; no provisional success, skipped checks, duplicate dispatch or detached work. Controlled two-review admit/cancel<=2s and progress-gap<=2s with failure/cancel races verified.
- Run and record this task's focused validation before advancing; no intermediate adapter completion authorizes deployment or resumes the stopped review.

### 1.19 TASK-470a1f61b26b12c6-s1-t20 — Qualify the complete staged-view production cutover

Wire the revised writer and every lifecycle consumer together in the actual production defaults, then run focused bounded-view correctness/capacity/crash and source-free package regressions before retained T14 timing qualification.

**Acceptance checks:**
- Both families and all epic/standalone/issue/task/story/document routes use the new store; no eager packet Map or aggregate whole-view reader remains reachable through production preparation/execution/publication/recovery/cleanup.
- Instrumented actual-source managed fixture proves combined memory reservation bound, zero repeated physical queries, unchanged projection/history/permanent results, runtime<=256KiB and zero full-checkpoint writes/native command.
- Two-session memory/disk contention, borrowed-window cancellation, tampered shards/leaves, version rejection and crash windows retain existing native/cleanup authority; full scope cannot be replaced by small synthetic tests.
- npm build and source-free package smoke pass with code/design daemon/controller paths. These regressions do not substitute for T14's full coldx3/warm/history-growth/concurrent performance gates.
- Run and record this task's focused validation before advancing; no intermediate adapter completion authorizes deployment or resumes the stopped review.
- Verify persisted plan/build scheduling follows explicit order/dependencies: next runnable corrective task t15 and final qualification t14 only after t20; preserve exact t1-t13 definitions/test mappings and passed BUILD/TESTS entries.

### 1.20 TASK-470a1f61b26b12c6-s1-t21 — Reconcile duplicate lifecycle provenance

Transition duplicate ISSUE-163e7bc3d6f0ccba and its LLD lineage to explicit superseded lifecycle state, bind replacement provenance to the primary standalone artifact, and preserve both records as historical non-routable evidence.

**Acceptance checks:**
- Both duplicate artifacts read back as superseded with replacement provenance to the primary artifact and cannot be selected for new workflow routing.
- The transition is atomic or safely retryable; any failed readback stops the build before source-light migration proceeds.
- Existing primary PLAN/BUILD/TESTS evidence and completed task records remain unchanged.

### 1.21 TASK-470a1f61b26b12c6-s1-t22 — Define source-light locator, manifest and historical-reader contracts

Introduce versioned exact selected-change locators and attempt baseline-workspace manifests, remove durable aggregate source bodies from new prepared state, and define cold requalification or explicit rejection for historical eager-derived records.

**Acceptance checks:**
- New code-review durable state stores immutable commit/parent/object identities, exact file/range/block locators and sealed workspace metadata, never aggregate source bodies.
- Decoders reject unknown or ambiguous required versions; supported historical records cannot silently become trusted source authority and are either cold-requalified or explicitly rejected.
- Design review latest-document contracts and existing compact runtime/history/publication contracts remain unchanged.

### 1.22 TASK-470a1f61b26b12c6-s1-t23 — Implement commit-parent workspaces and transient selected after blocks

Materialize only relevant before files from each selected change's actual applicable commit parent into an attempt-owned sealed workspace and decode only exact pinned after ranges transiently for reviewer input.

**Acceptance checks:**
- New, deleted, renamed and stacked-commit changes resolve against the actual selected commit parent rather than origin or current HEAD, with exact range and object verification.
- The attempt workspace contains only relevant baseline files at ordinary paths, has a sealed integrity manifest, remains isolated between concurrent attempts, and is removed through owned terminal cleanup.
- Selected after blocks include no unrelated lines and decoded bytes are released after reviewer-input construction rather than retained in checkpoints or prepared packets.

### 1.23 TASK-470a1f61b26b12c6-s1-t24 — Integrate source-light preparation through the production lifecycle

Wire source-light packet preparation, staged construction/source adapters, isolated workers, progress, cancellation, recovery, publication, approval and cleanup through actual code-review production routes while retaining latest-document design review.

**Acceptance checks:**
- Every code-review route uses locators, transient selected blocks and baseline workspace paths without an eager aggregate source-view fallback; design routes continue latest-document capture.
- Checkpoint/resume, progress, cancellation, permanent CR publication and approval cleanup preserve exact scope, history and ownership across crashes and concurrent sessions.
- Complete test details and mandatory coverage assessment reach the reviewer; execution remains optional, and no module is skipped because of size or preparation mode.

### 1.24 TASK-470a1f61b26b12c6-s1-t25 — Migrate readers, remove eager source ownership and qualify cutover readiness

Remove new-path eager source ownership, complete historical-reader behavior, and run focused correctness, isolation, recovery, cleanup and packaging regressions before the retained full qualification task.

**Acceptance checks:**
- No production new-attempt path persists or reconstructs aggregate prepared source bodies; legacy derived views are untrusted migration inputs, not a fallback engine.
- Two-session concurrency, cancellation, restart/recovery, tamper detection, publication and cleanup tests preserve exact scope and resource ownership with zero unintended cross-session access.
- Production defaults, compiled build and source-free package smoke pass; task scheduling leaves t14 as the sole next qualification gate after t25.

### 1.25 TASK-470a1f61b26b12c6-s1-t14 — Qualify performance, packaging and deployment handoff

Measure the full retained managed cold, warm and history-growth workloads on the source-light production path, build the shipped package, and document coordinated restart plus explicitly authorized post-deployment smoke.

**Acceptance checks:**
- Three cold-run median<=120s, warm<=10s, controlled admit/cancel<=2s and progress observation<=2s; report exact selected-locator counts, unique Git reads, workspace bytes, transient charged memory, heap/external/RSS and durable writes; failed gates block qualification.
- Full retained workload proves no aggregate source bodies, skipped review scope or skipped mandatory coverage assessment, and confirms design review remains latest-document based.
- npm build and source-free package smoke pass. Deployment waits for BUILD approval, user update/restart and explicit permission to retrigger the original review.
- Run and record this task's focused validation before advancing; prior focused regressions do not replace this full qualification.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Existing projection/lineage oracle: unchanged code scope identities, after-segments, deletion/rename/merge/replacement witnesses and test/document bytes across baseline and new preparation. | `t2`, `t6`, `t7`, `t8`, `t9`, `t12`, `t22` |
| Counting ReviewSources fixture: exact query keys, all prior/current packets in one session, duplicate coalescing, deterministic error attribution and no negative/error poisoning. | `t2`, `t6`, `t7`, `t8`, `t9`, `t12`, `t22` |
| Stable source generation excludes accepted feedback; immutable successor history binding validates new results/origins. Tampering with old feedback revokes descendants; input/source changes invalidate source qualification. | `t2`, `t6`, `t7`, `t8`, `t9`, `t12`, `t22` |
| Logical ProjectionBudget read/byte/fragment limits apply independently per packet even when physical reads are reused. | `t2`, `t6`, `t7`, `t8`, `t9`, `t12`, `t22` |
| Exact runtime and checkpoint decoders: foreign identity, oversized fields, missing/unknown capabilities, forbidden paths, stale sequences and impossible completion states. | `t2`, `t6`, `t7`, `t8`, `t9`, `t12`, `t22` |
| Code story/task and epic/standalone/issue/no-document route matrix; design DEF/HLD/LLD latest-subject matrix. | `t2`, `t6`, `t7`, `t8`, `t9`, `t12`, `t22` |
| Full checkpoint input/feedback remains pinned while compact runtime is sole new hot resource authority. | `t2`, `t6`, `t7`, `t8`, `t9`, `t12`, `t22` |
| Client/model-supplied qualification handles, PIDs, native closure claims and approval receipts are rejected. | `t2`, `t6`, `t7`, `t8`, `t9`, `t12`, `t22` |
| Cancel and preparation progress wire fixtures preserve enum/status meaning, nullable unknown totals and actual counters; no invented task inventory or percentage. | `t2`, `t6`, `t7`, `t8`, `t9`, `t12`, `t22` |
| Supported historical checkpoint/CR readers and explicit new-format capability mismatch refusals before cleanup or execution. | `t2`, `t6`, `t7`, `t8`, `t9`, `t12`, `t22` |
| ProductionReviews through registered MCP/IPC routes acquires context, runs each family with a deterministic reviewer, preserves full feedback, publishes, approves under fixture authority and cleans only approved inactive targets. | `t13`, `t24` |
| Real Git batch output, object hash/type/framing, read-only isolation, exact missing-object semantics and byte limits through ReviewNativeHost/ReviewProcessLeases. | `t13`, `t24` |
| Warm handoff to a new authorized publication/cleanup worker reuses a private receipt after terminal execution-worker reclamation; cold daemon restart invalidates all receipts and requalifies through authoritative sources once. | `t13`, `t24` |
| Author changes before restart use fresh production scope, not a test-only resolver; latest design target edits invalidate and wait for human-approved restart; unrelated external edits do not loop. | `t13`, `t24` |
| Two review sessions retain separate ownership, progress, cancellation and resource fences; cancel one during preparation, assessment and publication-boundary races without affecting the other. | `t13`, `t24` |
| Observe actual runtime/history writer bytes and commit ordering: native open/close writes0 full history records, result commit precedes counted completion, and open intent precedes subprocess spawn. | `t13`, `t24` |
| Multiple accepted task/chunk results plus publication bookkeeping preserve source receipt and use zero repeated Git qualification; new evidence is fetched once and bound to exact successor history. | `t13`, `t24` |
| Fault injection at every runtime-initialize/checkpoint-bind/activate, manifest-ready/receipt, native-open/spawn/disposal/close, result-history/runtime-boundary and CR/publication-boundary transition. | `t11`, `t12`, `t25` |
| Worker loss and whole-daemon crash with open tools; no automatic clearance or empty-runtime recreation. Confirmed disposal plus failed close persistence remains fenced. | `t11`, `t12`, `t25` |
| Cold manifest/object tampering, stale validator versions, replaced checkpoint/runtime files, invalid capability metadata and cleanup races retain evidence and reject false approval. | `t11`, `t12`, `t25` |
| Definitive checkpoint replaced/not-replaced/uncertain outcomes recover committed feedback without model rerun; failed/incomplete attempts still require the existing new-attempt rule. | `t11`, `t12`, `t25` |
| Supported v1/v2 historical migration preserves exact submitted aliases, prior results/actions/failures and unresolved legacy guards; interrupted migration and rollback never activate dual writers. | `t11`, `t12`, `t25` |
| The actual stopped attempt4 remains untouched by feature qualification and cannot be automatically resumed or cleared. | `t11`, `t12`, `t25` |
| Crash after every cleanup claim/rename/unlink/directory sync, including runtime removal and checkpoint removal: explicit retry completes from exact permanent closed audit/claim without Git or model calls; arbitrary missing runtime remains fenced. | `t11`, `t12`, `t25` |
| Capture three cold runs of the complete171-file/four-attempt workload: median preparation<=120s with every source, scope, origin, test and history check retained; report each run and host/load metadata. | `t11`, `t12`, `t25` |
| Warm matching-context lifecycle handoff/phase preparation median<=10s; matching publication/cleanup performs0 source reconstructions while current mutable checks still run. | `t14`, `t25` |
| Growing valid history at1,4 and maximum supported attempts: physical repeated queries per session0, immutable source work proportional to distinct evidence plus history validation, not repeated packet count. | `t14`, `t25` |
| Full checkpoint writes per native command0; compact runtime encoder<=256KiB and write size does not grow with history/source size. Report native command counts, total bytes written and stage timings separately. | `t14`, `t25` |
| Two concurrent reviews admit/cancel acknowledgement<=2s and preparation observation gap<=2s on the controlled supported-host fixture; cancellation reaches an honest stopped or resource-fenced result without another model call. | `t14`, `t25` |
| No timing assertion is a fixed runtime task deadline. If a release gate fails, report the measured failure; do not skip tests, widen timeouts/limits, shrink scope or claim the microbenchmark substitutes for this evidence. | `t14`, `t25` |
| Working set above memoryMaxBytes but below reserved disk capacity retains query payloads in staging and yields zero physical duplicates. Insufficient aggregate disk capacity fails before next batch; concurrent sessions cannot over-reserve or evict pinned evidence. | `t14`, `t25` |
| Update/restart only after the normal approval/publish sequence and coordination with other active reviews; reconnect MCP and validate advertised formats/cancel schema. | `t14`, `t25` |
| Small code and design review demonstrate incremental preparation progress, targeted cancellation and explicit recovery with complete CR history. | `t14` |
| Only then explicitly resolve the original retained fence and ask to retrigger the stopped worker-isolation review with an appropriate immutable attempt; do not reuse a canceled execution implicitly. | `t14` |
| Single-packet and four-attempt histories larger than the decoded memory budget but within reserved disk qualify with exact scope, provenance, tests, feedback, selected after blocks, and applicable parent workspaces; cold and warm lifecycle consumers never build an aggregate packet body. | `t14` |
| Instrument reserve-before-allocation and ownership high-water across locator validation, Git object verification, parent-file materialization, manifest sealing, transient selected-block decoding, prompt/test traversal, publication, and cleanup. No full-packet JSON stringify or whole-history source clone is reachable in production. | `t23`, `t24`, `t25`, `t14` |
| Versioned locator and BaselineWorkspaceManifest round-trip ordered scope, Unicode paths, add/delete/rename/replacement/merge/binary metadata, selected object ids, applicable parent ids, and integrity fields. Missing, tampered, cross-attempt, or stale manifests fail before reviewer use; old eager derived state triggers cold requalification. | `t23`, `t24`, `t25`, `t14` |
| New files produce an absent parent baseline; deletions expose the parent file and empty after content; renames expose the old parent path and selected new after blocks; stacked unpushed commits resolve against each selected commit's actual parent rather than origin. | `t23`, `t24`, `t25`, `t14` |
| Memory and aggregate disk pressure with two attempts, cancellation during workspace materialization or transient block use, interrupted seal/reopen/cleanup, and restart retain correct ownership, reservations, fences, and cleanup claims without pinned eviction or duplicate Git reads. | `t23`, `t24`, `t25`, `t14` |
| Monotonic admission segment traces distinguish request, guard, route/scope, worker startup, runtime binding, and acknowledgement. Source qualification runs in the isolated review worker after durable admission; independent sessions retain exact authority while controlled admit/cancel acknowledgement remains within the existing bound. | `t23`, `t24`, `t25`, `t14` |
| Re-run the retained 171-file/four-attempt cold x3, warm, and history 1/4/max gates with no hosted models; report locator count, unique Git reads, workspace bytes, transient charged-memory high-water, heap/external/RSS, stage durations, and writer counters. A failed run blocks release and cannot be hidden by higher limits or reduced scope. | `t23`, `t24`, `t25`, `t14` |
| prepareReviewPacket | `t22`, `t23` |
| selectedCode | `t22`, `t23` |
| SelectedChangeLocator | `t22`, `t23` |
| BaselineWorkspaceManifest | `t22`, `t23` |
| artifact lifecycle reconciliation | `t21` |
| CodePreparation | `t24`, `t25` |
| StagedPacketConstruction | `t24`, `t25` |
| StagedPacketSources | `t24`, `t25` |
| checkpoint, recovery, progress, cleanup, and publication | `t24`, `t25` |
| unchanged design-review preparation | `t24`, `t25` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 scope matrix and performance qualification (3.1,3.9; testStrategy)`
- **[[c2]]** `prior-artifact` `LLD s1 source generation/history bindings and private authority (3.2,3.3,3.10)`
- **[[c3]]** `prior-artifact` `LLD s1 runtime durability and cross-store ordering (3.5,3.6)`
- **[[c4]]** `prior-artifact` `LLD s1 verified source session, staging retention and capacity (3.4)`
- **[[c5]]** `prior-artifact` `LLD s1 both-family preparation/route contracts (2.1-2.5,3.1)`
- **[[c6]]** `prior-artifact` `LLD s1 cancellation and preparation progress (2.4,3.7)`
- **[[c7]]** `prior-artifact` `LLD s1 publication, approval and cleanup claim (2.8-2.11,3.8)`
- **[[c8]]** `prior-artifact` `LLD s1 migration, preserved workload and controlled release gates (3.9,7)`
- **[[c9]]** `prior-artifact` `LLD s1 bounded prepared packet views and working-set ownership (revision4,3.11; testStrategy added integration subjects)`
- **[[c10]]** `prior-artifact` `LLD s1 measured admission latency and durable acknowledgement (revision4,3.12;6;7)`
- **[[c11]]** `prior-artifact` `LLD s1 revision 8 source-light preparation, exact locator, commit-parent workspace, lifecycle preservation and qualification handoff`
- **[[c12]]** `analyze-bundle` `.insrc/artifacts/PLAN-470a1f61b26b12c6-s1.json and .insrc/artifacts/BUILD-470a1f61b26b12c6-s1.json completed-task evidence plus duplicate lifecycle reconciliation requirement`
- **[[c13]]** `analyze-bundle` `src/workflow/code-review/task-review/packet.ts:144-262; src/workflow/review/code-preparation.ts:23-124; src/workflow/review/staged-packet-construction.ts:23-97; src/workflow/review/staged-packet-sources.ts:25-149`
