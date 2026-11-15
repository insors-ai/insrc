<!-- insrc:artifact TESTS-470a1f61b26b12c6-s1 -->

# Tests: 470a1f61b26b12c6 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 98 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
