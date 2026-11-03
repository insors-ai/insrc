<!-- insrc:artifact TESTS-9b04adb36cac716d-s1 -->

# Tests: 9b04adb36cac716d s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 27 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

## t1

Run at 2026-11-03T12:43:57.530Z on commit `78c166c89`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Strict phase/schema boundaries reject malformed identities, unknown fields/enums, noninitial S1 attempts and payload/size limit violations.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | strict design requests reject malformed identities, unknown fields, phases and noninitial attempts | `src/workflow/review/design-review/__tests__/contracts.test.ts` |
| pass | result payload has its own one-MiB boundary inside the larger request envelope | `src/workflow/review/design-review/__tests__/contracts.test.ts` |

**unit: Common daemon/controller assignment and result schema preserves typed workflow context and bounded progress cursor options.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | common review schemas preserve workflow context and bounded observation without accepting copied content | `src/workflow/review/design-review/__tests__/contracts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/contracts.test.ts` | 0 | 3 | 0.5 s |  |

## t2

Run at 2026-11-03T09:30:31.396Z on commit `8159cc9a5`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Table-driven Epic DEF/HLD/LLD, standalone feature/small LLD, sized ISSUE LLD and no-LLD small/trivial context requirements.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | workflow matrix resolves Epic designs, standalone LLD and ISSUE LLD without future artifacts | `src/workflow/review/design-review/__tests__/subject.test.ts` |

**unit: Missing required Epic HLD cannot become standalone; ISSUE root plus standalone flag/corrects link remains issue; missing optional references do not fail.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | workflow requirements do not downgrade broken Epics or turn correction links into ancestors | `src/workflow/review/design-review/__tests__/subject.test.ts` |

**unit: Canonical identity/paired marker, path containment, unknown party and missing/contradictory provenance are rejected before provider work.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | subject identity, containment and party are validated and only subject changes invalidate | `src/workflow/review/design-review/__tests__/subject.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/subject.test.ts` | 0 | 3 | 0.8 s |  |

## t3

Run at 2026-11-03T09:39:07.584Z on commit `64e2811ad`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: DEF/HLD/LLD prompts contain policy/paths/trailing schema without artifact-body canary or copied baseline.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | artifact-specific prompts contain live paths and trailing schema, never copied artifact content | `src/workflow/review/design-review/__tests__/policy-results.test.ts` |

**unit: Coverage plan rejects omitted/unknown units, final-only coverage, cycles, duplicate ids and bad final consistency.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chunk plans reject missing units, final-only coverage, duplicate ids, cycles and bad final checks | `src/workflow/review/design-review/__tests__/policy-results.test.ts` |

**unit: Required verification gaps cannot pass; HIGH/MED and incomplete precedence, LOW/advice separation and deterministic counts preserve findings.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | required gaps cannot pass and consolidation preserves HIGH/MED, incomplete and advice semantics | `src/workflow/review/design-review/__tests__/policy-results.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/policy-results.test.ts` | 0 | 3 | 0.6 s |  |

## t4

Run at 2026-11-03T09:48:46.054Z on commit `9cad5bba4`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Atomic save faults preserve previous checkpoint and do not acknowledge incomplete durable results.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | atomic checkpoint failure preserves the last accepted snapshot and cleans its own temporary file | `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` |

**unit: No-follow bounded loads refuse corrupt/foreign/oversize state without deletion.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bounded no-follow checkpoint loading retains corrupt foreign and oversized state | `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` |
| pass | accepted feedback cannot be rewritten and oversized stored results cannot bypass paging limits | `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` |

**unit: Metadata polling and one-result cursor pages never expose baseline/history or trigger provider/activity renewal.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | progress pages expose one result without baseline and polling does not renew activity | `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` | 0 | 4 | 0.8 s |  |

## t5

Run at 2026-11-03T10:06:57.257Z on commit `56d00443b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Delayed fake provider proves durable short acknowledgement, exact duplicate-start idempotence and serial planning/chunk dispatch.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native acknowledgement is durable and duplicate start does not dispatch another review | `src/workflow/review/design-review/__tests__/coordinator.test.ts` |

**integration: Early HIGH/MED/incomplete results continue remaining chunks; failed save prevents advancement and boundary mutation rejects stale candidate.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | findings and verification gaps continue chunks, while failed durability and mutation stop advancement | `src/workflow/review/design-review/__tests__/coordinator.test.ts` |

**integration: Submitter disconnect leaves native work active; activity options enforce no fixed deadline/internal retry/code-task grants.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native execution has request-independent activity options and model-free observations | `src/workflow/review/design-review/__tests__/coordinator.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/coordinator.test.ts` | 0 | 3 | 0.8 s |  |

## t6

Run at 2026-11-03T12:45:53.307Z on commit `78c166c89`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Actual trusted owner connection/execution/sequence gates controller plan/activity/result, with idempotent exact replay and conflicting replay refusal.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | trusted controller authority, execution sequence and durable exact replay are enforced | `src/workflow/review/design-review/__tests__/controller.test.ts` |
| pass | observed controller subject changes invalidate every exchange boundary and cannot be restored into acceptance | `src/workflow/review/design-review/__tests__/controller.test.ts` |
| pass | failed controller activity persistence fences a concurrently submitted valid plan | `src/workflow/review/design-review/__tests__/controller.test.ts` |

**integration: Reviewing-controller disconnect retains completed chunks as interrupted with no automatic reassignment/recovery.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | controller disconnect preserves accepted chunks and never reassigns interrupted work | `src/workflow/review/design-review/__tests__/controller.test.ts` |

**unit: Equivalent native/controller feedback shares policy/schema and produces identical status/counts.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | controller results use the common schema and produce deterministic complete counts | `src/workflow/review/design-review/__tests__/controller.test.ts` |
| pass | native acknowledgement is durable and duplicate start does not dispatch another review | `src/workflow/review/design-review/__tests__/coordinator.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/controller.test.ts` | 0 | 5 | 0.8 s |  |
| `src/workflow/review/design-review/__tests__/coordinator.test.ts` | 0 | 8 | 2 s |  |

## t7

Run at 2026-11-03T10:15:03.170Z on commit `2760fc272`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Normal stdio MCP/Unix IPC start and progress reach one main owner; second observer cannot acquire reviewer authority or duplicate execution.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | normal stdio MCP and Unix IPC preserve native background work and controller connection authority | `src/mcp/__tests__/design-review.test.ts` |

**integration: Schema discovery and steering expose current phases, bounded polling and wait-for-completion guidance.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | design schema discovery and steering expose bounded current phases and completion discipline | `src/mcp/__tests__/design-review.test.ts` |
| pass | repo-call-audit.test.ts: every method of the handler registry and every step phase has an audit entry marked modifying, read-only or daemon-store | `src/daemon/__tests__/repo-call-audit.test.ts` |

**unit: Retired review/stream/resolve routes remain unavailable and current code-review registration/routing stays intact.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | retired review operations throw the exact exception before parsing, providers or IO | `src/workflow/__tests__/review-unavailable.test.ts` |
| pass | Normal controller/daemon routes preserve coverage/status/diagnostic policy, after-only scope and schema/guide parity | `src/mcp/__tests__/task-review.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/repo-call-audit.test.ts` | 0 | 1 | 0.6 s |  |
| `src/mcp/__tests__/design-review.test.ts` | 0 | 2 | 4.1 s |  |
| `src/mcp/__tests__/task-review.test.ts` | 0 | 3 | 2.2 s |  |
| `src/workflow/__tests__/review-unavailable.test.ts` | 0 | 2 | 1.2 s |  |

## t8

Run at 2026-11-03T11:20:17.601Z on commit `cf5c7fcf0`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: Production build and compiled MCP/daemon fake-CLI smoke complete planning, chunks, incremental feedback and report retrieval.**

Reported by the builder, not run by the gate: **pass**. Evidence: Final npm run build: /tmp/dr-s1-t8-release-build.log (exit 0). Compiled stdio MCP -> Unix IPC -> main owner -> CliProvider synthetic binary: /tmp/dr-s1-t8-release-smoke.log and /tmp/insrc-design-smoke-odE0W2/evidence.json, planning/content/final serial, incremental saved feedback and passed report. Final compiled stored-progress latency and no baseline leakage: /tmp/dr-s1-t8-progress-latency.json. Fake CLI explicitly synthetic; no hosted claim.

**smoke: Focused existing task-review schema/routing/owner regressions pass without hosted reruns or unrelated full sweep.**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/dr-s1-t8-final-regressions.tap: 57 tests passed, 0 failed. /tmp/dr-s1-t8-focused-regressions.tap: 62 passed, 0 failed (earlier broader focused set, includes current code-review contracts/controller/activity/scope). /tmp/dr-s1-t8-activity-regressions.tap: 12 passed, including native actual inactivity clock/late output, exact reordered replay and concurrent controller activity-save failure. /tmp/dr-s1-t8-route-regressions.tap: 20 passed including method-class/registry/audit. No unrelated full sweep or extra hosted code-review round.

**live: One meaningful independent design review via normal insrc_review_step records model, acknowledgement/chunk timing, scope, actual feedback and limits separately from fake fixtures.**

Reported by the builder, not run by the gate: **pass**. Evidence: Execution completed with substantive limits as expressly permitted by this task; NOT design sign-off. Normal compiled stdio insrc_review_step, review-id design-live-1793702088378/attempt1, native configured claude-sonnet-5, 25ms ack, 9/9 chunks, 2020500ms elapsed. /tmp/insrc-design-smoke-6dIL8Q/evidence.json; /tmp/design-review-s1-live-timing.json; /tmp/design-review-s1-live-review-findings.json; immutable checkpoint .insrc/tmp/design-review/design-live-1793702088378.json. Actual linked DEF/HLD/SPEC/LLD and source inspected; 7 usable MED/3 LOW documentation findings; placeholder test-coverage f1 is unusable, and final consistency explicitly reported missing test-coverage inspection. Annotated refs caused conservative missing-declaration limits; companion not browser-rendered. Verdict INCOMPLETE prevents approval. Failed first run design-live-1793701031878 retained; latest diagnostic/policy fixes are deterministic-tested, not falsely claimed hosted-verified. Gate should assess these limits, not infer a clean review from execution completion.
