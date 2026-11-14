<!-- insrc:artifact PLAN-470a1f61b26b12c6-s1 -->

# Plan: STORY-470a1f61b26b12c6-s1

## Summary

**Epic:** `rework-review-preparation-context-lifecycle-end`
**LLD run:** `wf-1794655838217-bnsgsk`
**LLD effective hash:** `f2e6e79848fc...`

Fourteen dependency-ordered tasks implement the approved holistic preparation correction for both review families. Focused validation accompanies each task; full production-route fault, scope and performance qualification follows integration. Existing judges, source scope and human approval remain; the stopped prior review is not resumed and daemon deployment stays after BUILD approval. Foundation adapters are validated before production wiring; t12/t13 explicitly verify the coordinated production cutover.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Retain workload fixture and establish managed baseline | M | approved r1 | — | integration: Proposed retained-fixture baseline: real managed Git, exact171-file/four-attempt scope and operation/write counters; deterministic provider not called before ready. | [[c1]] [[c8]] |
| 2 | **`t2`** Define versioned preparation and operational contracts | M | approved r1 | `t1` | unit: Proposed exact contracts: supported historical/version3 checkpoint decode, RuntimeV1 bound, manifest/history/cleanup binding identity and forged capabilities. | [[c2]] [[c3]] |
| 3 | **`t3`** Implement compact host runtime durability | L | approved r1 | `t2` | integration: Compact adapter/native-host integration: open-before-spawn, disposal-before-close, uncertain writes, injected initialization interruption, actual proof replacement and zero full-history native/progress updates; production wiring qualified in t12/t13. | [[c3]] |
| 4 | **`t4`** Implement reserved disk-backed source sessions | L | approved r1 | `t2` | integration: Proposed source-session tests: batching/framing/hash equivalence, per-packet budgets, above-memory disk retention, aggregate reservation exhaustion and zero duplicate queries. | [[c4]] |
| 5 | **`t5`** Implement stable qualified source contexts and private borrows | L | approved r1 | `t3`, `t4` | integration: Proposed context acquisition tests: private worker receipts/borrows, ready ordering, warm cross-worker handoff, tamper/restart invalidation and eviction restrictions. | [[c2]] [[c4]] |
| 6 | **`t6`** Implement successor history validation and result commits | M | approved r1 | `t5` | integration: Proposed history binding tests: successive task/chunk feedback and new evidence, old-history tamper, checkpoint/runtime crash reconciliation and no source/model rerun. | [[c2]] [[c3]] |
| 7 | **`t7`** Integrate code review preparation across routes | L | approved r1 | `t6` | integration: Extend route-admission/projection-lineage/final-scope tests: all workflow story/task routes, merge/rename/delete witnesses, aliases and exact selected after blocks. | [[c5]] |
| 8 | **`t8`** Integrate design review latest-subject preparation | L | approved r1 | `t6` | integration: Extend design subject-monitor/recovery tests: latest DEF/HLD/LLD routes, impact/chunk reuse, target invalidation/user restart and unrelated edit stability. | [[c5]] |
| 9 | **`t9`** Add exact cancellation and preparation progress surfaces | L | approved r1 | `t7`, `t8` | integration: Extend worker isolation/progress/recovery and MCP wire fixtures: cancel exact review during preparation/tool/model/publication races, owner rejection, resource fence and nullable genuine counters. | [[c6]] |
| 10 | **`t10`** Integrate publication and approval with new proof | L | approved r1 | `t7`, `t8` | integration: Extend both-family publication/approval tests: complete new CR capabilities, warm zero reconstruction, publication-only retry zero model calls and current-author/BUILD freshness. | [[c7]] |
| 11 | **`t11`** Implement resumable cleanup claims for both families | L | approved r1 | `t9`, `t10` | integration: Extend both-family cleanup tests: fault every claim/rename/unlink/fsync boundary; cleanup retry after runtime/checkpoint removal, approval/file mismatch and arbitrary missing-runtime refusal. | [[c7]] |
| 12 | **`t12`** Implement explicit inactive-record migration and coordinated cutover | M | approved r1 | `t11` | integration: Proposed migration/cutover tests: inactive v1/v2 byte-preserving upgrade, legacy guards, interrupted migration, unknown capabilities and unsupported old-reader downgrade. | [[c8]] |
| 13 | **`t13`** Qualify failure, concurrency and scope equivalence | L | approved r1 | `t12` | integration: Full disposable production two-session matrix through public routes and both families, all crash/tamper/native-loss cases, complete scope equivalence and bounded runtime writes. | [[c1]] [[c3]] [[c5]] [[c6]] [[c7]] [[c8]] |
| 14 | **`t14`** Qualify performance, packaging and deployment handoff | L | approved r1 | `t13` | integration: Managed cold x3/warm/history-growth performance gates on supported Node/native package, npm build plus source-free package smoke; no deployed daemon mutation. | [[c1]] [[c8]] |

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

Route admission, packet projection, task/story execution and explicit recovery through shared preparation, preserving all selected spans and pinned history.

**Acceptance checks:**
- Epic/standalone/ISSUE/LLD-only/no-document routes and aliases preserve exact scope; no generic HEAD diff or skipped modules; immutable attempts remain pinned.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.

### 1.8 TASK-470a1f61b26b12c6-s1-t8 — Integrate design review latest-subject preparation

Route subject capture, planning/impact/chunks and explicit recovery through same lifecycle with design-specific latest target/ancestry checks.

**Acceptance checks:**
- DEF/HLD/LLD route matrix passes; relevant target changes invalidate and await human restart; unrelated edits ignored; prompts use paths, not artifact bodies.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.

### 1.9 TASK-470a1f61b26b12c6-s1-t9 — Add exact cancellation and preparation progress surfaces

Extend worker control and both public MCP/daemon surfaces plus supported IPC DTOs for cancellation and bounded genuine preparation counters.

**Acceptance checks:**
- Exact owner-only cancel prevents new work, stops only selected worker, reports honest resource fences; polling creates no activity; both clients agree with enums.
- Cancel/spawn/candidate/publication races preserve exact ownership and already committed results; progress counters reflect genuine completed operations only.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.

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

### 1.13 TASK-470a1f61b26b12c6-s1-t13 — Qualify failure, concurrency and scope equivalence

Run both-family production fixtures covering all route matrices, source equivalence, tampering, write windows, native disposal, cancellation and cleanup/migration crashes.

**Acceptance checks:**
- Two independent review sessions remain isolated; full-history writes/native command=0; all mandatory source/test coverage preserved; no user socket/DB or hosted quota used.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.
- Through actual registered production review routes, prove native resource and progress writes perform zero full-history mutations for both code and design reviews.

### 1.14 TASK-470a1f61b26b12c6-s1-t14 — Qualify performance, packaging and deployment handoff

Measure full managed cold/warm/history-growth workloads, build shipped package and document coordinated restart plus explicitly authorized post-deployment smoke.

**Acceptance checks:**
- Three cold-run median<=120s, warm<=10s, controlled admit/cancel<=2s and progress observation<=2s; report all metrics; failed gates block old qualification; deployment awaits BUILD approval.
- Task completion uses local managed qualification and package checks only. Deployment smoke requires later approved BUILD, user update/restart and explicit permission to retrigger original review.
- Run and record this task's focused validation before advancing; cross-cutting qualification does not replace these checks.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Existing projection/lineage oracle: unchanged code scope identities, after-segments, deletion/rename/merge/replacement witnesses and test/document bytes across baseline and new preparation. | `t7`, `t13` |
| Counting ReviewSources fixture: exact query keys, all prior/current packets in one session, duplicate coalescing, deterministic error attribution and no negative/error poisoning. | `t4` |
| Stable source generation excludes accepted feedback; immutable successor history binding validates new results/origins. Tampering with old feedback revokes descendants; input/source changes invalidate source qualification. | `t5`, `t6` |
| Logical ProjectionBudget read/byte/fragment limits apply independently per packet even when physical reads are reused. | `t4`, `t7` |
| Exact runtime and checkpoint decoders: foreign identity, oversized fields, missing/unknown capabilities, forbidden paths, stale sequences and impossible completion states. | `t2`, `t3` |
| Code story/task and epic/standalone/issue/no-document route matrix; design DEF/HLD/LLD latest-subject matrix. | `t7`, `t8` |
| Full checkpoint input/feedback remains pinned while compact runtime is sole new hot resource authority. | `t3` |
| Client/model-supplied qualification handles, PIDs, native closure claims and approval receipts are rejected. | `t2`, `t5`, `t9` |
| Cancel and preparation progress wire fixtures preserve enum/status meaning, nullable unknown totals and actual counters; no invented task inventory or percentage. | `t9` |
| Supported historical checkpoint/CR readers and explicit new-format capability mismatch refusals before cleanup or execution. | `t2`, `t10`, `t12` |
| ProductionReviews through registered MCP/IPC routes acquires context, runs each family with a deterministic reviewer, preserves full feedback, publishes, approves under fixture authority and cleans only approved inactive targets. | `t13` |
| Real Git batch output, object hash/type/framing, read-only isolation, exact missing-object semantics and byte limits through ReviewNativeHost/ReviewProcessLeases. | `t4`, `t13` |
| Warm handoff to a new authorized publication/cleanup worker reuses a private receipt after terminal execution-worker reclamation; cold daemon restart invalidates all receipts and requalifies through authoritative sources once. | `t5`, `t10`, `t11` |
| Author changes before restart use fresh production scope, not a test-only resolver; latest design target edits invalidate and wait for human-approved restart; unrelated external edits do not loop. | `t7`, `t8`, `t13` |
| Two review sessions retain separate ownership, progress, cancellation and resource fences; cancel one during preparation, assessment and publication-boundary races without affecting the other. | `t9`, `t13` |
| Observe actual runtime/history writer bytes and commit ordering: native open/close writes0 full history records, result commit precedes counted completion, and open intent precedes subprocess spawn. | `t3`, `t6`, `t13` |
| Multiple accepted task/chunk results plus publication bookkeeping preserve source receipt and use zero repeated Git qualification; new evidence is fetched once and bound to exact successor history. | `t6`, `t10` |
| Fault injection at every runtime-initialize/checkpoint-bind/activate, manifest-ready/receipt, native-open/spawn/disposal/close, result-history/runtime-boundary and CR/publication-boundary transition. | `t3`, `t6`, `t13` |
| Worker loss and whole-daemon crash with open tools; no automatic clearance or empty-runtime recreation. Confirmed disposal plus failed close persistence remains fenced. | `t3`, `t9`, `t13` |
| Cold manifest/object tampering, stale validator versions, replaced checkpoint/runtime files, invalid capability metadata and cleanup races retain evidence and reject false approval. | `t5`, `t11`, `t13` |
| Definitive checkpoint replaced/not-replaced/uncertain outcomes recover committed feedback without model rerun; failed/incomplete attempts still require the existing new-attempt rule. | `t3`, `t6`, `t13` |
| Supported v1/v2 historical migration preserves exact submitted aliases, prior results/actions/failures and unresolved legacy guards; interrupted migration and rollback never activate dual writers. | `t12` |
| The actual stopped attempt4 remains untouched by feature qualification and cannot be automatically resumed or cleared. | `t1`, `t12`, `t13` |
| Crash after every cleanup claim/rename/unlink/directory sync, including runtime removal and checkpoint removal: explicit retry completes from exact permanent closed audit/claim without Git or model calls; arbitrary missing runtime remains fenced. | `t11`, `t13` |
| Capture three cold runs of the complete171-file/four-attempt workload: median preparation<=120s with every source, scope, origin, test and history check retained; report each run and host/load metadata. | `t1`, `t14` |
| Warm matching-context lifecycle handoff/phase preparation median<=10s; matching publication/cleanup performs0 source reconstructions while current mutable checks still run. | `t5`, `t10`, `t11`, `t14` |
| Growing valid history at1,4 and maximum supported attempts: physical repeated queries per session0, immutable source work proportional to distinct evidence plus history validation, not repeated packet count. | `t4`, `t14` |
| Full checkpoint writes per native command0; compact runtime encoder<=256KiB and write size does not grow with history/source size. Report native command counts, total bytes written and stage timings separately. | `t3`, `t14` |
| Two concurrent reviews admit/cancel acknowledgement<=2s and preparation observation gap<=2s on the controlled supported-host fixture; cancellation reaches an honest stopped or resource-fenced result without another model call. | `t9`, `t14` |
| No timing assertion is a fixed runtime task deadline. If a release gate fails, report the measured failure; do not skip tests, widen timeouts/limits, shrink scope or claim the microbenchmark substitutes for this evidence. | `t14` |
| Working set above memoryMaxBytes but below reserved disk capacity retains query payloads in staging and yields zero physical duplicates. Insufficient aggregate disk capacity fails before next batch; concurrent sessions cannot over-reserve or evict pinned evidence. | `t4`, `t13`, `t14` |
| Update/restart only after the normal approval/publish sequence and coordination with other active reviews; reconnect MCP and validate advertised formats/cancel schema. | `t14` |
| Small code and design review demonstrate incremental preparation progress, targeted cancellation and explicit recovery with complete CR history. | `t14` |
| Only then explicitly resolve the original retained fence and ask to retrigger the stopped worker-isolation review with an appropriate immutable attempt; do not reuse a canceled execution implicitly. | `t14` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 scope matrix and performance qualification (3.1,3.9; testStrategy)`
- **[[c2]]** `prior-artifact` `LLD s1 source generation/history bindings and private authority (3.2,3.3,3.10)`
- **[[c3]]** `prior-artifact` `LLD s1 runtime durability and cross-store ordering (3.5,3.6)`
- **[[c4]]** `prior-artifact` `LLD s1 verified source session, staging retention and capacity (3.4)`
- **[[c5]]** `prior-artifact` `LLD s1 both-family preparation/route contracts (2.1-2.5,3.1)`
- **[[c6]]** `prior-artifact` `LLD s1 cancellation and preparation progress (2.4,3.7)`
- **[[c7]]** `prior-artifact` `LLD s1 publication, approval and cleanup claim (2.8-2.11,3.8)`
- **[[c8]]** `prior-artifact` `LLD s1 migration, preserved workload and controlled release gates (3.9,7)`
