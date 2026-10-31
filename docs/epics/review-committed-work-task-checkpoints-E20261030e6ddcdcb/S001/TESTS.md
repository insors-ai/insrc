<!-- insrc:artifact TESTS-e6ddcdcb3d9cf330-s1 -->

# Tests: e6ddcdcb3d9cf330 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 25 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

## t1

Run at 2026-10-31T03:29:15.124Z on commit `71e57f57c`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: selected-change packet: commit pointers, exact ranges, committed documents and excluded same-commit changes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | selected-change packet: commit pointers, exact ranges, committed documents and excluded same-commit changes | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |
| pass | selected-change packet preserves deletion rename and non-textual limits without invented ranges | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**unit: derived tasks: pinned dependencies, S/M/L sizes and complete selected-change attribution**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | derived tasks: pinned dependencies, S/M/L sizes and complete selected-change attribution | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**unit: ordinary results: required evidence, coverage strength, supported severity and nonblocking advice**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ordinary results: required evidence, coverage strength, supported severity and nonblocking advice | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/contracts.test.ts` | 0 | 4 | 1 s |  |

## t2

Run at 2026-10-31T18:29:18.091Z on commit `ae19d2169`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: task review admission: short acknowledgement, initial atomic JSON and same-id exclusion**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | task review admission: short acknowledgement, initial atomic JSON and same-id exclusion | `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` |

**integration: task execution: checkpoint before next task, one size-based deadline, failure continuation and no automatic retry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | task execution: checkpoint before next task, one size-based deadline, failure continuation and no automatic retry | `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` |
| pass | checkpoint write failure stops scheduling and retains the last complete JSON | `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` |
| pass | native provider timeout is incomplete even when it returns just before the host timer | `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` |
| pass | malformed provider result is saved as failed without retrying the task | `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` |
| pass | optimistic native status with limitations retains the assessment as incomplete instead of failed | `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` |

**integration: code-task provider tools: committed reads, permitted target tests and unchanged design-review defaults**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | code-task provider tools: committed reads, permitted target tests and unchanged design-review defaults | `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` |
| pass | code-task command grants reach the native CLI without changing later design sessions | `src/agent/providers/__tests__/cli-review-session.test.ts` |

**live: early installed review: useful evidence-backed task assessment and durable checkpoint with CR publication explicitly pending**

Reported by the builder, not run by the gate: **pass**. Evidence: UNMODIFIED END-TO-END LIVE CANDIDATE RESULT, replacing earlier recovered-feedback evidence. /tmp/review-t2-live-candidate-ipc.mjs deploys the freshly compiled production IpcServer + directDispatch + startTaskReview on a real isolated Unix socket and invokes it through real rpc(). No mocked provider, clock, Git source or result; native installed CLI selected by production critical-review RoleRouter. Candidate source 8233a1bd1. Fresh committed regression fixture /tmp/insrc-task-review-live-ytutif5a, review-id live-total-regression, attempt1. Production coordinator acknowledged in 62ms, continued after client close, independently executed node --test total.test.js and persisted a HIGH finding exactly at selected total.js:2 (addition instead of multiplication; actual13 expected30), status changes_requested, coverage verified, limitations empty, unrelated.txt excluded from findings, CR publication pending. Completed in31seconds. Checkpoint /tmp/insrc-task-review-live-ytutif5a/.insrc/tmp/code-review/live-total-regression.json was NEVER manually edited. Evidence /tmp/review-t2-isolated-live-evidence.json; runlog /tmp/review-t2-isolated-live-run.log. Main daemon installation remains on 8ca7039db; this isolated deployment uses actual updated production modules and installed CLI, not a mock or offline replay. Earlier manual diagnostic repair is NOT being used to satisfy this live test.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-review-session.test.ts` | 0 | 27 | 35.3 s |  |
| `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` | 0 | 10 | 0.6 s |  |

## t3

Run at 2026-10-31T14:41:57.576Z on commit `b32fcb3f6`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: task-based CR: version-2 validation/rendering and version-1 compatibility without fabricated dimensions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | task-based CR: version-2 validation/rendering and version-1 compatibility without fabricated dimensions | `src/workflow/code-review/task-review/__tests__/publication.test.ts` |
| pass | canonical story aliases retain original submitted scope while using one CR identity | `src/workflow/code-review/task-review/__tests__/publication.test.ts` |

**integration: CR publication: idempotent scoped summary and retained checkpoint on publication failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CR publication: idempotent scoped summary and retained checkpoint on publication failure | `src/workflow/code-review/task-review/__tests__/publication.test.ts` |
| pass | concurrent canonical publications preserve both summaries and the latest readable projection | `src/workflow/code-review/task-review/__tests__/publication.test.ts` |
| pass | coordinator marks an attempt terminal only after canonical CR publication is durable | `src/workflow/code-review/task-review/__tests__/publication.test.ts` |

**integration: CR readers: partial task scope, incomplete/failed results and unknown versions cannot satisfy story review**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CR readers: partial task scope, incomplete/failed results and unknown versions cannot satisfy story review | `src/workflow/code-review/task-review/__tests__/publication.test.ts` |
| pass | publication refuses an unknown stored CR version without overwriting future data | `src/workflow/code-review/task-review/__tests__/publication.test.ts` |

**live: early installed review publication: saved actual assessment becomes canonical CR without another model review**

Reported by the builder, not run by the gate: **pass**. Evidence: Actual real CLI assessment from live-total-regression was published through compiled production IpcServer/directDispatch/publishStoredTaskReview and canonical artifact-store queue, on an isolated real Unix socket. /tmp/review-t3-live-publication.mjs and /tmp/review-t3-live-publication-evidence.json show schemaVersion2, reviewer daemon, one summary, original finding HIGH total.js:2 retained, unchanged task feedback and pinned submitted input, crPublication complete, replay adds no revision, native transcript files unchanged (zero model calls), no fabricated legacy dimensions. Canonical CR: /tmp/insrc-task-review-live-ytutif5a/.insrc/artifacts/CR-f17e20261031c0de-s1.json; readable markdown /tmp/insrc-task-review-live-ytutif5a/docs/epics/f17e20261031c0de-E20261031f17e2026/S001/CR.md. Uses untouched fixture checkpoint, not earlier manual diagnostic repairs. Production build pass /tmp/review-t3-final-build.log, focused47-pass regression log /tmp/review-t3-final-tests.log.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/publication.test.ts` | 0 | 7 | 1.8 s |  |

## t4

Run at 2026-10-31T15:45:08.868Z on commit `3cd738412`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: controller parity: actual independent-party routing and equivalent assignment/result/CR semantics**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | controller parity: actual independent-party routing and equivalent assignment/result/CR semantics | `src/workflow/code-review/task-review/__tests__/controller.test.ts` |

**integration: controller submissions: replay idempotency, conflicting/foreign result refusal and missing-checkpoint errors**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | controller submissions: replay idempotency, conflicting/foreign result refusal and missing-checkpoint errors | `src/workflow/code-review/task-review/__tests__/controller.test.ts` |

**integration: review disconnect: stop controller work and retain completed tasks while daemon reviewer outlives submitter**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review disconnect: stop controller work and retain completed tasks while daemon reviewer outlives submitter | `src/workflow/code-review/task-review/__tests__/controller.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/controller.test.ts` | 0 | 4 | 1.4 s |  |

## t5

Run at 2026-10-31T15:52:06.369Z on commit `a55158e2c`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: review evidence policy: body-only logic, missing graph/run evidence and unused test-helper coverage**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review evidence policy: body-only logic, missing graph/run evidence and unused test-helper coverage | `src/workflow/code-review/task-review/__tests__/policy.test.ts` |

**unit: review quality policy: target-language conventions, encapsulation/readability/naming and approved/native framework fallback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review quality policy: target-language conventions, encapsulation/readability/naming and approved/native framework fallback | `src/workflow/code-review/task-review/__tests__/policy.test.ts` |

**integration: review policy parity: common prompt/result classification across supported routes without coding/build-validation changes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review policy parity: common prompt/result classification across supported routes without coding/build-validation changes | `src/workflow/code-review/task-review/__tests__/policy.test.ts` |

**smoke: deployable task review: production build and affected provider/backend/CR regressions with legacy/design routing preserved**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/review-t5-build.log (production build passed); /tmp/review-t5-regressions.log (96 passed, zero failed/skipped). Accepted real native daemon evidence: /tmp/review-t2-isolated-live-evidence.json and /tmp/review-t3-live-publication-evidence.json; untouched live checkpoint /tmp/insrc-task-review-live-ytutif5a/.insrc/tmp/code-review/live-total-regression.json.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/policy.test.ts` | 0 | 3 | 2.5 s |  |
