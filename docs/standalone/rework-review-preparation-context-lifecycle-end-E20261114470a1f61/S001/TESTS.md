<!-- insrc:artifact TESTS-470a1f61b26b12c6-s1 -->

# Tests: 470a1f61b26b12c6 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 254 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-14T12:28:35.100Z on commit `cb266010b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Proposed retained-fixture baseline: real managed Git, exact171-file/four-attempt scope and operation/write counters; deterministic provider not called before ready.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | retained four-attempt workload preserves exact selected scope and historical feedback | `src/daemon/threads/__tests__/review-preparation-baseline.test.ts` |
| pass | retained workload managed Git baseline records durable native writes without invoking a provider | `src/daemon/threads/__tests__/review-preparation-baseline.test.ts` |
| pass | production preparation blocks deterministic provider calls until qualified readiness | `src/daemon/threads/__tests__/review-preparation-baseline.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-preparation-baseline.test.ts` | 0 | 3 | 3.4 s |  |

## t2

Run at 2026-11-14T12:33:40.040Z on commit `7529e47f5`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Proposed exact contracts: supported historical/version3 checkpoint decode, RuntimeV1 bound, manifest/history/cleanup binding identity and forged capabilities.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | compact runtime rejects foreign ownership impossible completion and oversized encoding | `src/shared/__tests__/review-preparation.test.ts` |
| pass | source history and cleanup contracts bind exact identities without conferring authority | `src/shared/__tests__/review-preparation.test.ts` |
| pass | code checkpoint codec reads historical history and exact version three without embedded guards | `src/workflow/review/__tests__/preparation-checkpoint.test.ts` |
| pass | design checkpoint codec preserves historical qualified and admission records on version three decode | `src/workflow/review/__tests__/preparation-checkpoint.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/review-preparation.test.ts` | 0 | 2 | 0.5 s |  |
| `src/workflow/review/__tests__/preparation-checkpoint.test.ts` | 0 | 2 | 0.8 s |  |

## t3

Run at 2026-11-14T12:52:56.590Z on commit `1308febb4`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Compact adapter/native-host integration: open-before-spawn, disposal-before-close, uncertain writes, injected initialization interruption, actual proof replacement and zero full-history native/progress updates; production wiring qualified in t12/t13.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | compact runtime native host persists intents before spawn and leaves history untouched | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | uncertain compact open save prevents spawn and retains the exact fence | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | runtime initialization and missing proof never recreate an empty guard | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | interrupted initialization retains inactive proof and external replacement fences the writer | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | runtime closure requires exact host disposal and cannot be supplied by a progress update | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | phase progress flush waits for an already running durable update | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-runtime-store.test.ts` | 0 | 6 | 1.3 s |  |

## t4

Run at 2026-11-14T13:12:38.377Z on commit `9ff600b0a`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Proposed source-session tests: batching/framing/hash equivalence, per-packet budgets, above-memory disk retention, aggregate reservation exhaustion and zero duplicate queries.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | source session batches verified Git objects and shares immutable queries without bypassing logical budgets | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | source session retains evidence above memory capacity and never refetches evicted data | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | shared project reservations refuse body fetch before capacity exhaustion and transfer batches atomically | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | staged corruption and source errors fence the session instead of implicitly retrying Git | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | a source failure is recorded once and requires a fresh preparation session | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | preparation configuration is discoverable bounded and rejects malformed values | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | replaced staging directory is retained with its capacity until exact ownership is restored | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | two source sessions share project capacity without overlapping identities or duplicate fetches | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | historical and current packet qualification share sources while preserving exact projection | `src/workflow/review/__tests__/source-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/__tests__/source-session.test.ts` | 0 | 9 | 2 s |  |

## t5

Run at 2026-11-14T13:43:10.144Z on commit `644066acb`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Proposed context acquisition tests: private worker receipts/borrows, ready ordering, warm cross-worker handoff, tamper/restart invalidation and eviction restrictions.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | qualified context becomes ready atomically and survives warm phase handoff without source reconstruction | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | cold daemon receipts and tampered prepared objects cannot authorize reuse | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | design context uses complete validator output and refreshes latest target authority | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | partial context writes never emit a ready receipt and retain bounded recovery evidence | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | real reclaimed execution worker hands complete context to a distinct publication worker | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | matching context acquisitions coalesce qualification and refresh authority before every borrow | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | an immutable manifest replacement revokes an active borrow and fresh generations preserve source identity | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | central context serialization preserves binary text undefined and tag-shaped artifact data | `src/daemon/threads/__tests__/review-context-registry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-context-registry.test.ts` | 0 | 8 | 2.3 s |  |

## t6

Run at 2026-11-14T14:33:39.081Z on commit `b6de1a1d0`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Proposed history binding tests: successive task/chunk feedback and new evidence, old-history tamper, checkpoint/runtime crash reconciliation and no source/model rerun.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | successive code feedback resolves only new evidence and publication advances history without rebuilding source | `src/workflow/review/__tests__/history-binding.test.ts` |
| pass | accepted feedback or pinned attribution edits fence descendants without another source call | `src/workflow/review/__tests__/history-binding.test.ts` |
| pass | lost checkpoint acknowledgment reconciles a durable result and lagging runtime without repeating model or source work | `src/workflow/review/__tests__/history-binding.test.ts` |
| pass | accepted task origins cannot be removed or rewritten by a successor | `src/workflow/review/__tests__/history-binding.test.ts` |
| pass | new feedback cannot reuse an absent or current-attempt origin | `src/workflow/review/__tests__/history-binding.test.ts` |
| pass | design plan and dependency-ordered chunk results get successor bindings without changing source generation | `src/workflow/review/__tests__/history-binding.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/__tests__/history-binding.test.ts` | 0 | 8 | 2.2 s |  |

## t7

Run at 2026-11-14T15:00:11.529Z on commit `83fc08f81`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Extend route-admission/projection-lineage/final-scope tests: all workflow story/task routes, merge/rename/delete witnesses, aliases and exact selected after blocks.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/route-admission.test.ts: admission builds the route from the Story's stored artifacts and refuses a packet that does not match it | `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` |
| pass | shared preparation retains route-qualified views for pinned recovery without native refetch | `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` |
| pass | shared preparation preserves task selection and canonical story aliases across every route | `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` |
| pass | shared code preparation preserves merge and selected rename lineage with every after span | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` |
| pass | a side-branch deletion merged back with the file kept still interrupts lineage | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` |
| pass | a side-branch deletion and recreation merged back still interrupts lineage | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` |
| pass | final history: source-verified shifted renamed per-task scope roundtrips offline and idempotently | `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` |
| pass | shared preparation executes task through coordinator and fresh durable worker admission | `src/workflow/review/__tests__/code-preparation-execution.test.ts` |
| pass | shared preparation executes story through coordinator and fresh durable worker admission | `src/workflow/review/__tests__/code-preparation-execution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` | 0 | 6 | 4.8 s |  |
| `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` | 0 | 9 | 3.5 s |  |
| `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` | 0 | 5 | 1.7 s |  |
| `src/workflow/review/__tests__/code-preparation-execution.test.ts` | 0 | 6 | 1.5 s |  |

## t8

Run at 2026-11-14T15:11:10.787Z on commit `87313d03d`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Extend design subject-monitor/recovery tests: latest DEF/HLD/LLD routes, impact/chunk reuse, target invalidation/user restart and unrelated edit stability.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | shared design preparation executes planning and chunks through coordinator and fresh worker admission | `src/workflow/review/__tests__/design-preparation-execution.test.ts` |
| pass | shared design target mutation invalidates execution and waits for explicit restart approval | `src/workflow/review/__tests__/design-preparation-execution.test.ts` |
| pass | shared design context retains the submitted document locator and rejects foreign attempt reuse | `src/workflow/review/__tests__/design-preparation-execution.test.ts` |
| pass | workflow matrix resolves Epic designs, standalone LLD and ISSUE LLD without future artifacts | `src/workflow/review/design-review/__tests__/subject.test.ts` |
| pass | native and controller correction reviews preserve Epic standalone and ISSUE workflow requirements | `src/workflow/review/design-review/__tests__/subject.test.ts` |
| pass | shared design preparation invalidates required ancestry and ignores unrelated files | `src/workflow/review/design-review/__tests__/subject.test.ts` |
| pass | native impact persists one plan-selection pair and dispatches only selected chunks before mutation invalidation | `src/workflow/review/design-review/__tests__/impact-execution.test.ts` |
| pass | controller impact uses the same schema and validator with fenced exchange and durable exact replay | `src/workflow/review/design-review/__tests__/impact-execution.test.ts` |
| pass | explicit native recovery preserves accepted prefixes and durable replay reserves only unfinished work | `src/workflow/review/design-review/__tests__/recovery.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/__tests__/design-preparation-execution.test.ts` | 0 | 5 | 1.5 s |  |
| `src/workflow/review/design-review/__tests__/impact-execution.test.ts` | 0 | 3 | 1.2 s |  |
| `src/workflow/review/design-review/__tests__/recovery.test.ts` | 0 | 5 | 1.2 s |  |
| `src/workflow/review/design-review/__tests__/subject.test.ts` | 0 | 5 | 2.6 s |  |

## t9

Run at 2026-11-14T16:18:40.145Z on commit `098fd1cad`. Tests check: **passed**. 19 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Extend worker isolation/progress/recovery and MCP wire fixtures: cancel exact review during preparation/tool/model/publication races, owner rejection, resource fence and nullable genuine counters.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | targeted main cancellation rejects another session and retires only its exact admitted worker | `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` |
| pass | cancellation preserves accepted history and permits confirmed native closure after stopping admission | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | durable cancellation allows exact closure and reports a resource fence until disposal is confirmed | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | cancellation during publication bookkeeping preserves committed feedback and publication proof without accepting a late runtime boundary | `src/workflow/review/__tests__/history-binding.test.ts` |
| pass | preparation progress counts verified completed queries and cache hits without activity from polling | `src/workflow/review/__tests__/preparation-progress.test.ts` |
| pass | failed source work does not advance completed preparation counters | `src/workflow/review/__tests__/preparation-progress.test.ts` |
| pass | both registered MCP review schemas expose main-owned cancellation with pointed bounded input | `src/mcp/__tests__/review-cancellation-wire.test.ts` |
| pass | preparation DTO preserves nullable totals and separate cancellation states | `vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts` |
| pass | cancellation while spawn authorization is pending prevents the model CLI from launching | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | cancellation aborts an in-flight model CLI without replaying it or changing accepted history | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | cancellation rejects a model candidate released after the private phase was fenced | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |

**integration: Private preparation bridge tests: exact worker/review ownership, aggregate project capacity, split/combine allocation retention, context/runtime receipts, worker reclamation and cleanup-only release.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | private preparation ports share aggregate capacity and reject foreign allocations and forged input | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | private bridge binds context and accepted history to current input and retains capacity until cleanup | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | private preparation requests are revoked when the exact worker loses ownership | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | private preparation client validates and reads qualified context from a real worker and retains proof until actual reclamation | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | private progress preserves unknown totals and cannot advance committed result counts | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | cleanup cannot pass while a private phase attachment is awaiting ownership validation | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | one private phase cannot mutate another phase allocation for the same review | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | cancellation rejects a model candidate released after the private phase was fenced | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-preparation-host.test.ts` | 0 | 8 | 2 s |  |
| `src/daemon/threads/__tests__/review-runtime-store.test.ts` | 0 | 10 | 1.8 s |  |
| `src/mcp/__tests__/review-cancellation-wire.test.ts` | 0 | 1 | 1.1 s |  |
| `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` | 0 | 3 | 13.7 s |  |
| `src/workflow/review/__tests__/history-binding.test.ts` | 0 | 9 | 2.4 s |  |
| `src/workflow/review/__tests__/preparation-progress.test.ts` | 0 | 2 | 1 s |  |
| `vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts` | 0 | 2 | 0.5 s |  |

## t10

Run at 2026-11-14T16:49:02.939Z on commit `ae63fe27d`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Extend both-family publication/approval tests: complete new CR capabilities, warm zero reconstruction, publication-only retry zero model calls and current-author/BUILD freshness.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | prepared code publication preserves complete input and closed proof across failed render, warm retry and temp deletion | `src/workflow/review/__tests__/prepared-publication.test.ts` |
| pass | prepared design publication emits capability three and retries one permanent full history without models or temporary context | `src/workflow/review/__tests__/prepared-publication.test.ts` |
| pass | permanent preparation proof refuses unknown capability | `src/workflow/review/__tests__/prepared-publication.test.ts` |
| pass | prepared code publication preserves an earlier qualified failure without promoting its retained scope headers to signoff | `src/workflow/review/__tests__/prepared-publication.test.ts` |
| pass | private publication proof seals only acknowledged owned history and keeps cancellation available while publishing | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-preparation-host.test.ts` | 0 | 9 | 2.5 s |  |
| `src/workflow/review/__tests__/prepared-publication.test.ts` | 0 | 4 | 1.5 s |  |

## t11

Run at 2026-11-14T18:32:38.272Z on commit `6526976d3`. Tests check: **passed**. 20 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Extend both-family cleanup tests: fault every claim/rename/unlink/fsync boundary; cleanup retry after runtime/checkpoint removal, approval/file mismatch and arbitrary missing-runtime refusal.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | prepared code cleanup preserves permanent evidence and deletes exact private claims without Git or model calls | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup resumes every claim rename unlink and fsync boundary using only permanent proof | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup refuses arbitrary missing runtime, changed approval and active context ownership | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup retains public replacements and fences changed private evidence | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup rechecks approval at deletion and rejects edited claim paths or digests | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup resumes after actual worker termination with runtime removed and checkpoint retained | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup never treats pre-existing unrelated context files or self-declared generations as owned | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup promotes a verified temporary claim after actual worker death before rename | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup recovers hard-killed claim writes without losing fragments or rebuilding sources | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup finishes final-claim crash recovery while retaining all public replacements | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup preserves permanent evidence and deletes exact private claims without Git or model calls | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup resumes every claim rename unlink and fsync boundary using only permanent proof | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup refuses arbitrary missing runtime, changed approval and active context ownership | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup retains public replacements and fences changed private evidence | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup rechecks approval at deletion and rejects edited claim paths or digests | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup resumes after actual worker termination with runtime removed and checkpoint retained | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup never treats pre-existing unrelated context files or self-declared generations as owned | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup promotes a verified temporary claim after actual worker death before rename | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup recovers hard-killed claim writes without losing fragments or rebuilding sources | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup finishes final-claim crash recovery while retaining all public replacements | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/__tests__/prepared-cleanup.test.ts` | 0 | 294 | 52.3 s |  |

## t12

Run at 2026-11-15T08:15:23.802Z on commit `0c655b018`. Tests check: **passed**. 19 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Proposed migration/cutover tests: inactive v1/v2 byte-preserving upgrade, legacy guards, interrupted migration, unknown capabilities and unsupported old-reader downgrade.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | inactive historical migration preserves both family submissions feedback and closed guard audit without mutating originals | `src/workflow/review/__tests__/preparation-migration.test.ts` |
| pass | inactive migration refuses unresolved and unverifiable legacy guards and mismatched initialization | `src/workflow/review/__tests__/preparation-migration.test.ts` |
| pass | historical design migration derives the current attempt locator without rewriting its original submission | `src/workflow/review/__tests__/preparation-migration.test.ts` |
| pass | explicit next-attempt migration binds its exact input and preserves history without inventing an admission | `src/workflow/review/__tests__/preparation-migration.test.ts` |
| pass | production workers emit format three and historical writers refuse downgrade for both families | `src/daemon/threads/__tests__/review-production-cutover.test.ts` |
| pass | production approval cleanup removes code runtime checkpoint and contexts from permanent proof without launching a reviewer | `src/daemon/threads/__tests__/review-production-cutover.test.ts` |
| pass | production approval cleanup removes design runtime checkpoint and contexts from permanent proof without launching a reviewer | `src/daemon/threads/__tests__/review-production-cutover.test.ts` |
| pass | explicit production publication recovery reuses accepted feedback after worker reclamation | `src/daemon/threads/__tests__/review-production-cutover.test.ts` |
| pass | production next-attempt admission migrates closed historical evidence and retains the exact prior input | `src/daemon/threads/__tests__/review-production-cutover.test.ts` |
| pass | a production re-review preserves the earlier publication without treating it as the new attempt boundary | `src/daemon/threads/__tests__/review-production-cutover.test.ts` |
| pass | an explicit production resubmission recovers the initialize-before-checkpoint crash window without losing runtime proof | `src/daemon/threads/__tests__/review-production-cutover.test.ts` |
| pass | explicit initialization recovery adopts only the exact inactive crash window and never a live owner | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | inactive runtime handoff preserves exact old audit before replacement and waits for actual checkpoint rebind | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | inactive runtime handoff refuses unresolved leases and preserves evidence on failed or stale archive | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | production resource observer reads compact runtime leases without mutating full format-three history | `src/daemon/threads/__tests__/review-runtime-resources.test.ts` |
| pass | broker clearance updates only the inactive compact runtime and requires the exact guard digest | `src/daemon/threads/__tests__/review-runtime-resources.test.ts` |
| pass | permanent preparation proof refuses unknown capability | `src/workflow/review/__tests__/prepared-publication.test.ts` |
| pass | inactive handoff refuses a cancelled same-attempt predecessor after a cold daemon restart | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | inactive version-one migration preserves code and design history and old readers reject format three | `src/workflow/review/__tests__/preparation-migration.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-production-cutover.test.ts` | 0 | 7 | 22.8 s |  |
| `src/daemon/threads/__tests__/review-runtime-resources.test.ts` | 0 | 3 | 1.1 s |  |
| `src/daemon/threads/__tests__/review-runtime-store.test.ts` | 0 | 16 | 2.3 s |  |
| `src/workflow/review/__tests__/preparation-migration.test.ts` | 0 | 5 | 1.2 s |  |
| `src/workflow/review/__tests__/prepared-publication.test.ts` | 0 | 5 | 1.4 s |  |

## t13

Run at 2026-11-15T09:57:51.957Z on commit `ab9e0aea4`. Tests check: **passed**. 137 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Full disposable production two-session matrix through public routes and both families, all crash/tamper/native-loss cases, complete scope equivalence and bounded runtime writes.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | qualified context becomes ready atomically and survives warm phase handoff without source reconstruction | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | cold daemon receipts and tampered prepared objects cannot authorize reuse | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | design context uses complete validator output and refreshes latest target authority | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | partial context writes never emit a ready receipt and retain bounded recovery evidence | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | real reclaimed execution worker hands complete context to a distinct publication worker | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | matching context acquisitions coalesce qualification and refresh authority before every borrow | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | an immutable manifest replacement revokes an active borrow and fresh generations preserve source identity | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | central context serialization preserves binary text undefined and tag-shaped artifact data | `src/daemon/threads/__tests__/review-context-registry.test.ts` |
| pass | cold qualification acknowledges an accepted result prefix at sequence zero without replaying work | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | explicit initialization recovery adopts only the exact inactive crash window and never a live owner | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | initialization recovery retains missing changed and uncertain proof instead of guessing ownership | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | inactive runtime handoff preserves exact old audit before replacement and waits for actual checkpoint rebind | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | inactive runtime handoff refuses unresolved leases and preserves evidence on failed or stale archive | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | compact runtime native host persists intents before spawn and leaves history untouched | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | uncertain compact open save prevents spawn and retains the exact fence | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | runtime initialization and missing proof never recreate an empty guard | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | interrupted initialization retains inactive proof and external replacement fences the writer | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | runtime closure requires exact host disposal and cannot be supplied by a progress update | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | phase progress flush waits for an already running durable update | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | cancellation preserves accepted history and permits confirmed native closure after stopping admission | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | durable cancellation allows exact closure and reports a resource fence until disposal is confirmed | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | cancellation while spawn authorization is pending prevents the model CLI from launching | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | cancellation aborts an in-flight model CLI without replaying it or changing accepted history | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | inactive handoff refuses a cancelled same-attempt predecessor after a cold daemon restart | `src/daemon/threads/__tests__/review-runtime-store.test.ts` |
| pass | private bootstrap activates only the actual bound checkpoint before capacity or native work | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | private bootstrap retains inactive proof and fences an incorrectly bound checkpoint | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | private preparation ports share aggregate capacity and reject foreign allocations and forged input | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | private publication proof seals only acknowledged owned history and keeps cancellation available while publishing | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | private bridge binds context and accepted history to current input and retains capacity until cleanup | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | private preparation requests are revoked when the exact worker loses ownership | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | private preparation client validates and reads qualified context from a real worker and retains proof until actual reclamation | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | private progress preserves unknown totals and cannot advance committed result counts | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | cleanup cannot pass while a private phase attachment is awaiting ownership validation | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | one private phase cannot mutate another phase allocation for the same review | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | cancellation rejects a model candidate released after the private phase was fenced | `src/daemon/threads/__tests__/review-preparation-host.test.ts` |
| pass | canonical code persistence preserves submitted packets and feedback through actual family read-modify-write calls | `src/workflow/review/__tests__/preparation-history-store.test.ts` |
| pass | private inactive handoff forces checkpoint rebind even when semantic input is unchanged | `src/workflow/review/__tests__/preparation-history-store.test.ts` |
| pass | actual code progress producer sends only bounded observations without reading or saving full history | `src/workflow/review/__tests__/preparation-history-store.test.ts` |
| pass | actual design controller activity updates bounded ownership and progress without traversing full history | `src/workflow/review/__tests__/preparation-history-store.test.ts` |
| pass | canonical design persistence routes existing family writers to format three and keeps observer churn out of full history | `src/workflow/review/__tests__/preparation-history-store.test.ts` |
| pass | canonical persistence fences external replacements and refuses embedded native writers or foreign paths | `src/workflow/review/__tests__/preparation-history-store.test.ts` |
| pass | bounded observations cannot advance accepted results or replace a design execution owner | `src/workflow/review/__tests__/preparation-history-store.test.ts` |
| pass | successive code feedback resolves only new evidence and publication advances history without rebuilding source | `src/workflow/review/__tests__/history-binding.test.ts` |
| pass | accepted feedback or pinned attribution edits fence descendants without another source call | `src/workflow/review/__tests__/history-binding.test.ts` |
| pass | lost checkpoint acknowledgment reconciles a durable result and lagging runtime without repeating model or source work | `src/workflow/review/__tests__/history-binding.test.ts` |
| pass | accepted task origins cannot be removed or rewritten by a successor | `src/workflow/review/__tests__/history-binding.test.ts` |
| pass | new feedback cannot reuse an absent or current-attempt origin | `src/workflow/review/__tests__/history-binding.test.ts` |
| pass | design plan and dependency-ordered chunk results get successor bindings without changing source generation | `src/workflow/review/__tests__/history-binding.test.ts` |
| pass | cancellation during publication bookkeeping preserves committed feedback and publication proof without accepting a late runtime boundary | `src/workflow/review/__tests__/history-binding.test.ts` |
| pass | migrated code history passes feedback publication and cleanup with its complete migration proof | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | migrated design history passes feedback publication and cleanup with its complete migration proof | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup preserves permanent evidence and deletes exact private claims without Git or model calls | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup preserves permanent evidence and deletes exact private claims without Git or model calls | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup resumes every claim rename unlink and fsync boundary using only permanent proof | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup resumes every claim rename unlink and fsync boundary using only permanent proof | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup refuses arbitrary missing runtime, changed approval and active context ownership | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup refuses arbitrary missing runtime, changed approval and active context ownership | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup retains public replacements and fences changed private evidence | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup retains public replacements and fences changed private evidence | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup finishes final-claim crash recovery while retaining all public replacements | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup finishes final-claim crash recovery while retaining all public replacements | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup rechecks approval at deletion and rejects edited claim paths or digests | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup rechecks approval at deletion and rejects edited claim paths or digests | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup never treats pre-existing unrelated context files or self-declared generations as owned | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup never treats pre-existing unrelated context files or self-declared generations as owned | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup promotes a verified temporary claim after actual worker death before rename | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup promotes a verified temporary claim after actual worker death before rename | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup recovers hard-killed claim writes without losing fragments or rebuilding sources | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup recovers hard-killed claim writes without losing fragments or rebuilding sources | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared code cleanup resumes after actual worker termination with runtime removed and checkpoint retained | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | prepared design cleanup resumes after actual worker termination with runtime removed and checkpoint retained | `src/workflow/review/__tests__/prepared-cleanup.test.ts` |
| pass | source session batches verified Git objects and shares immutable queries without bypassing logical budgets | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | source session retains evidence above memory capacity and never refetches evicted data | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | shared project reservations refuse body fetch before capacity exhaustion and transfer batches atomically | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | staged corruption and source errors fence the session instead of implicitly retrying Git | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | a source failure is recorded once and requires a fresh preparation session | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | preparation configuration is discoverable bounded and rejects malformed values | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | replaced staging directory is retained with its capacity until exact ownership is restored | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | two source sessions share project capacity without overlapping identities or duplicate fetches | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | historical and current packet qualification share sources while preserving exact projection | `src/workflow/review/__tests__/source-session.test.ts` |
| pass | src/workflow/code-review/task-review/__tests__/route-admission.test.ts: admission builds the route from the Story's stored artifacts and refuses a packet that does not match it | `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` |
| pass | src/workflow/code-review/task-review/__tests__/route-admission.test.ts: a Story with no BUILD record is refused before anything is admitted | `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` |
| pass | src/workflow/code-review/task-review/__tests__/route-admission.test.ts: resume and publication of a stored review read no route | `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` |
| pass | shared preparation retains route-qualified views for pinned recovery without native refetch | `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` |
| pass | shared preparation preserves task selection and canonical story aliases across every route | `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` |
| pass | workflow matrix resolves Epic designs, standalone LLD and ISSUE LLD without future artifacts | `src/workflow/review/design-review/__tests__/subject.test.ts` |
| pass | workflow requirements do not downgrade broken Epics or turn correction links into ancestors | `src/workflow/review/design-review/__tests__/subject.test.ts` |
| pass | subject identity, containment and party are validated and only subject changes invalidate | `src/workflow/review/design-review/__tests__/subject.test.ts` |
| pass | native and controller correction reviews preserve Epic standalone and ISSUE workflow requirements | `src/workflow/review/design-review/__tests__/subject.test.ts` |
| pass | shared design preparation invalidates required ancestry and ignores unrelated files | `src/workflow/review/design-review/__tests__/subject.test.ts` |
| pass | journalled publication and lost-receipt recovery preserve one exact full history without model calls | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | publication capacity stays pending and a raised history allowance retries persistence only | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | publication refuses changed subject before write and additional edits after its exact owned delta | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | native review waits for durable publication and recovers failed receipt persistence without rerunning models | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | publication append and head-replace crashes replay the same complete history entry | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | known permanent-history minimum preserves failure and starts a new attempt after the allowance is raised | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | canonical edits during journal staging or log append are preserved and refuse publication | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | crash-boundary owner-loss and cleanup races retain targeted lifecycle guarantees | `src/daemon/threads/__tests__/review-worker-recovery.test.ts` |
| pass | legacy interrupted code history retains uncertainty on earlier attempts | `src/daemon/threads/__tests__/review-worker-recovery.test.ts` |
| pass | shutdown drains host leases before worker reclamation and replacement | `src/daemon/threads/__tests__/review-worker-recovery.test.ts` |
| pass | disposable daemon crash reconstructs unresolved guards and leaves unrelated reviews usable | `src/daemon/threads/__tests__/review-worker-recovery.test.ts` |
| pass | legacy active missing guards reconstruct only the requested review fence | `src/daemon/threads/__tests__/review-worker-recovery.test.ts` |
| pass | code code design design and mixed reviews use distinct real worker threads | `src/daemon/threads/__tests__/review-worker-isolation.test.ts` |
| pass | blocked admission permits progress daemon status and an unrelated review before release | `src/daemon/threads/__tests__/review-worker-isolation.test.ts` |
| pass | installed production routing bounds never-ready and pre-save-hung boot without fallback | `src/daemon/threads/__tests__/review-worker-isolation.test.ts` |
| pass | production controller exchanges and disconnect reclaim only their own review | `src/daemon/threads/__tests__/review-worker-isolation.test.ts` |
| pass | full daemon entrypoint retains both-family crash fences and failed-attempt recovery through public routes | `src/daemon/threads/__tests__/review-worker-daemon.test.ts` |
| pass | production defaults preserve all code routes story aliases task selection and complete pinned packet views | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production design defaults preserve DEF HLD epic standalone and issue LLD latest targets and ignore unrelated edits | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production defaults preserve merge rename deletion witnesses and exact selected spans against the baseline oracle | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production defaults reject unselected side-branch deletion even when the merge retains selected text | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production defaults reject unselected side-branch replacement even when the merge retains selected text | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production design target edits invalidate and only explicit approved restart captures the latest source | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production code cold publication rejects edited accepted feedback without another model call | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production design cold publication rejects edited accepted feedback without another model call | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production cancellation of an assessing code session leaves the other family owner and feedback untouched | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production cancellation of an assessing design session leaves the other family owner and feedback untouched | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production cancellation during code preparation leaves the other session usable and dispatches no target model | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production cancellation during design preparation leaves the other session usable and dispatches no target model | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production whole-story defaults preserve multi-task dependency order and every submitted test detail | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production code publication-only recovery after reclamation preserves feedback without model dispatch | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production design publication-only recovery after reclamation preserves feedback without model dispatch | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | cold production design publication requalifies original evidence and rejects later author edits without a model | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production code v1 migration survives before-migration worker loss and only explicit resubmission activates | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production code v1 migration survives after-migration worker loss and only explicit resubmission activates | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production code v2 migration survives before-migration worker loss and only explicit resubmission activates | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production code v2 migration survives after-migration worker loss and only explicit resubmission activates | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production design v1 migration survives before-migration worker loss and only explicit resubmission activates | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production design v1 migration survives after-migration worker loss and only explicit resubmission activates | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production design v2 migration survives before-migration worker loss and only explicit resubmission activates | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production design v2 migration survives after-migration worker loss and only explicit resubmission activates | `src/daemon/threads/__tests__/review-production-qualification.test.ts` |
| pass | production defaults reject missing BUILD mismatched document roles and foreign workflow epic issue and story documents | `src/daemon/threads/__tests__/review-production-route-invariants.test.ts` |
| pass | production pinned code scope survives mutable route removal and rejects a changed same-attempt packet | `src/daemon/threads/__tests__/review-production-route-invariants.test.ts` |
| pass | production design defaults reject broken Epic missing seed and orphan issue ancestry before assessment | `src/daemon/threads/__tests__/review-production-route-invariants.test.ts` |
| pass | production design defaults reject invalid identity containment authors and oversized targets | `src/daemon/threads/__tests__/review-production-route-invariants.test.ts` |
| pass | production design required HLD mutation invalidates the review while unrelated edits do not | `src/daemon/threads/__tests__/review-production-route-invariants.test.ts` |
| pass | production design correction attempts preserve Epic standalone issue correction links and seed ancestry | `src/daemon/threads/__tests__/review-production-route-invariants.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-context-registry.test.ts` | 0 | 8 | 2.2 s |  |
| `src/daemon/threads/__tests__/review-preparation-host.test.ts` | 0 | 11 | 2.4 s |  |
| `src/daemon/threads/__tests__/review-production-qualification.test.ts` | 0 | 24 | 141.1 s |  |
| `src/daemon/threads/__tests__/review-production-route-invariants.test.ts` | 0 | 6 | 53.3 s |  |
| `src/daemon/threads/__tests__/review-runtime-store.test.ts` | 0 | 16 | 2.1 s |  |
| `src/daemon/threads/__tests__/review-worker-daemon.test.ts` | 0 | 1 | 65.3 s |  |
| `src/daemon/threads/__tests__/review-worker-isolation.test.ts` | 0 | 6 | 35.9 s |  |
| `src/daemon/threads/__tests__/review-worker-recovery.test.ts` | 0 | 5 | 45.7 s |  |
| `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` | 0 | 5 | 1.9 s |  |
| `src/workflow/review/__tests__/history-binding.test.ts` | 0 | 11 | 2.9 s |  |
| `src/workflow/review/__tests__/preparation-history-store.test.ts` | 0 | 9 | 1.1 s |  |
| `src/workflow/review/__tests__/prepared-cleanup.test.ts` | 0 | 296 | 51.3 s |  |
| `src/workflow/review/__tests__/source-session.test.ts` | 0 | 9 | 1.6 s |  |
| `src/workflow/review/design-review/__tests__/publication.test.ts` | 0 | 7 | 1.3 s |  |
| `src/workflow/review/design-review/__tests__/subject.test.ts` | 0 | 5 | 3.1 s |  |
