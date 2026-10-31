<!-- insrc:artifact TESTS-e6ddcdcb3d9cf330-s2 -->

# Tests: e6ddcdcb3d9cf330 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 17 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-31T19:49:45.900Z on commit `b383f6103`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: recovery admission: saved pins, latest-only resume, contiguous attempts and immutable prior sections**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | recovery admission: saved pins, latest-only resume, contiguous attempts and immutable prior sections | `src/workflow/code-review/task-review/__tests__/admission.test.ts` |

**unit: attempt schema compatibility: optional origins and old checkpoint/CR meaning**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attempt schema compatibility: optional origins and old checkpoint/CR meaning | `src/workflow/code-review/task-review/__tests__/admission.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/admission.test.ts` | 0 | 2 | 1.6 s |  |

## t2

Run at 2026-10-31T19:58:37.601Z on commit `8704eaecf`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: interrupted recovery: only absent tasks rerun and terminal failed/incomplete tasks are skipped**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | interrupted recovery: only absent tasks rerun and terminal failed/incomplete tasks are skipped | `src/workflow/code-review/task-review/__tests__/recovery.test.ts` |
| pass | controller recovery preserves every terminal outcome and selects missing task IDs | `src/workflow/code-review/task-review/__tests__/recovery.test.ts` |

**integration: controller recovery: new trusted connection, old-owner refusal, disconnect retention and daemon lifetime distinction**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | controller recovery: new trusted connection, old-owner refusal, disconnect retention and daemon lifetime distinction | `src/workflow/code-review/task-review/__tests__/recovery.test.ts` |

**integration: publication recovery: saved feedback projects once with zero provider calls and conflict-free replay**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | publication recovery: saved feedback projects once with zero provider calls and conflict-free replay | `src/workflow/code-review/task-review/__tests__/recovery.test.ts` |

**integration: retrigger metadata: resume and sequential attempts return the pinned attempt/status and preserved task IDs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | retrigger metadata: resume and sequential attempts return the pinned attempt/status and preserved task IDs | `src/workflow/code-review/task-review/__tests__/recovery.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/recovery.test.ts` | 0 | 5 | 3.2 s |  |

## t3

Run at 2026-10-31T20:10:57.638Z on commit `92e535dd8`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: reuse decisions: source task/attempt/party validation, acyclic ancestry and unchanged result/evidence strength**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reuse decisions: source task/attempt/party validation, acyclic ancestry and unchanged result/evidence strength | `src/workflow/code-review/task-review/__tests__/history.test.ts` |

**integration: sequential re-review: full history in attribution, fresh pins and reasoned reassess/reuse across both actual reviewer adapters**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sequential re-review: full history in attribution, fresh pins and reasoned reassess/reuse across both actual reviewer adapters | `src/workflow/code-review/task-review/__tests__/history.test.ts` |
| pass | all-reuse attempts and invalid attribution preserve route parity without extra task calls | `src/workflow/code-review/task-review/__tests__/history.test.ts` |

**integration: history prompts: actual fresh-task reviewers can consult relevant prior feedback and complete attempt history**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | history prompts: actual fresh-task reviewers can consult relevant prior feedback and complete attempt history | `src/workflow/code-review/task-review/__tests__/history.test.ts` |

**integration: CR provenance: exact retained outcomes, origin labels, latest aggregation and replay conflict handling**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CR provenance: exact retained outcomes, origin labels, latest aggregation and replay conflict handling | `src/workflow/code-review/task-review/__tests__/history.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/history.test.ts` | 0 | 5 | 4.2 s |  |

## t4

Run at 2026-10-31T20:22:31.980Z on commit `2850809c9`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: recovery end-to-end: real IPC/Git, both adapters, interruption boundaries and correct attempt metadata**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | recovery end-to-end: real IPC/Git, both adapters, interruption boundaries and correct attempt metadata | `src/workflow/code-review/task-review/__tests__/compatibility.test.ts` |
| pass | unavailable pinned source rejects recovery without mutation or provider use and releases reservation | `src/workflow/code-review/task-review/__tests__/compatibility.test.ts` |
| pass | committed test-record evidence receives exact native read grants without widening design defaults | `src/workflow/code-review/task-review/__tests__/compatibility.test.ts` |

**unit: old checkpoint and CR compatibility: absent origin fields mean containing-attempt assessment**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | old checkpoint and CR compatibility: absent origin fields mean containing-attempt assessment | `src/workflow/code-review/task-review/__tests__/compatibility.test.ts` |

**integration: migration compatibility: preserve origin-bearing history and reject unsupported downgrade readers**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | migration compatibility: preserve origin-bearing history and reject unsupported downgrade readers | `src/workflow/code-review/task-review/__tests__/compatibility.test.ts` |

**smoke: S2 deployability: production build, shared controller/daemon policy and version-aware CR/approval regression subset**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/review-s2-t4-build.log: npm run build completed successfully (Node22.22.1); /tmp/review-s2-t4-regressions.log:123 passed,0 failed/skipped. Explicit task-review tests plus cli-review-session, code-review-rpc, workflow-review-rpc, code-review gate, MCP review-rule-text and artifact-write-inventory suites. Existing accepted S1 native evidence /tmp/review-t2-isolated-live-evidence.json and /tmp/review-t3-live-publication-evidence.json retained, not rerun or relabelled as new S2 live proof.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/compatibility.test.ts` | 0 | 5 | 2.3 s |  |
