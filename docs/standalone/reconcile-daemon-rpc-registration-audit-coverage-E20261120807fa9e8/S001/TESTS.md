<!-- insrc:artifact TESTS-807fa9e8fb678f4b-s1 -->

# Tests: 807fa9e8fb678f4b s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 23 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-20T11:54:49.989Z on commit `eca759b6d`. Tests check: **passed**. 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/__tests__/repo-call-audit.test.ts — exact constructed RPC/stream and callable phase coverage; valid evidence and repo rules; missing/stale negative controls.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-call-audit.test.ts: every method of the handler registry and every step phase has an audit entry marked modifying, read-only or daemon-store | `src/daemon/__tests__/repo-call-audit.test.ts` |
| pass | audit coverage detects missing and stale registrations independently | `src/daemon/__tests__/repo-call-audit.test.ts` |

**unit: src/daemon/__tests__/repo-call-table.test.ts — exact disjoint table partition and unknown-name control.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-call-table.test.ts: every registered RPC method and step phase is a table row or on the reviewed read-only list, and every row names a registered method | `src/daemon/__tests__/repo-call-table.test.ts` |

**unit: src/daemon/threads/__tests__/method-class.test.ts — exact classes/transport, duplicates and drift, explicit retired ownership, worker-safe imports.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | retired review router precedence rejects through actual local handlers before any worker lookup | `src/daemon/threads/__tests__/method-class.test.ts` |
| pass | coverage: the method set equals the keys of the constructed rpcHandlers and streamHandlers after all merges, failing on a missing or a stale entry | `src/daemon/threads/__tests__/method-class.test.ts` |

**unit: src/daemon/__tests__/handler-runtime.test.ts — retain reviewed upstream snapshot additions and full runtime construction coverage.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets plus the methods added since | `src/daemon/__tests__/handler-runtime.test.ts` |
| pass | tools.call preserves malformed request errors before repository authority checks | `src/daemon/__tests__/handler-runtime.test.ts` |

**integration: src/daemon/tools/__tests__/call-handler.test.ts and src/daemon/tools/__tests__/executor.test.ts — preserve earlier unknown/schema/cancellation/approval-denial results without registry lookup; enforce final admission, canonical registered success, no execution/hooks on refusal, and cancellation during authority lookup.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | final authority preserves unknown schema cancellation and denial results without registry lookup | `src/daemon/tools/__tests__/executor.test.ts` |
| pass | final authority refusal runs neither capability nor success hooks and admitted execution uses canonical repo | `src/daemon/tools/__tests__/executor.test.ts` |
| pass | cancellation during final authority lookup prevents capability and hooks for either lookup outcome | `src/daemon/tools/__tests__/executor.test.ts` |
| pass | tools.call preserves unknown tool done results without looking up an invalid repository | `src/daemon/tools/__tests__/call-handler.test.ts` |
| pass | tools.call authority refuses unregistered execution and admits canonical registered success without wire bypass | `src/daemon/tools/__tests__/call-handler.test.ts` |

**integration: src/daemon/tools/__tests__/executor-approval.test.ts and src/daemon/tools/__tests__/executor-abort.test.ts — existing approval and abort contracts remain unchanged after adding tools.call final authority admission.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | executor-approval.test.ts: a declined call returns a denied failure with reason declined and execute is never called | `src/daemon/tools/__tests__/executor-approval.test.ts` |
| pass | executor-abort.test.ts: an already-aborted signal returns denied cancelled, asks nobody and never starts the tool | `src/daemon/tools/__tests__/executor-abort.test.ts` |

**integration: src/daemon/__tests__/review-retirement-endpoints.test.ts and src/daemon/threads/__tests__/review-retirement-runtime.test.ts — retired review no-work responses and local ownership remain intact.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | all preserved review operations and MCP phases return exact rewrite errors without review state | `src/daemon/__tests__/review-retirement-endpoints.test.ts` |
| pass | daemon startup shutdown and dispatch allocate no review runtime or hooks | `src/daemon/threads/__tests__/review-retirement-runtime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/handler-runtime.test.ts` | 0 | 11 | 1.7 s |  |
| `src/daemon/__tests__/repo-call-audit.test.ts` | 0 | 2 | 1.2 s |  |
| `src/daemon/__tests__/repo-call-table.test.ts` | 0 | 1 | 1 s |  |
| `src/daemon/__tests__/review-retirement-endpoints.test.ts` | 0 | 2 | 0.9 s |  |
| `src/daemon/threads/__tests__/method-class.test.ts` | 0 | 9 | 1.2 s |  |
| `src/daemon/threads/__tests__/review-retirement-runtime.test.ts` | 0 | 2 | 0.4 s |  |
| `src/daemon/tools/__tests__/call-handler.test.ts` | 0 | 10 | 0.3 s |  |
| `src/daemon/tools/__tests__/executor-abort.test.ts` | 0 | 6 | 0.3 s |  |
| `src/daemon/tools/__tests__/executor-approval.test.ts` | 0 | 7 | 0.3 s |  |
| `src/daemon/tools/__tests__/executor.test.ts` | 0 | 3 | 0.3 s |  |

## t2

Run at 2026-11-20T12:00:06.110Z on commit `993c4a3d5`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/__tests__/repo-gate-dispatch.test.ts — exact modifying dispatch coverage, no-write refusal and positive registered feedback append.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-gate-dispatch.test.ts: each method in the table called with no repo is refused and leaves the file system unchanged | `src/daemon/__tests__/repo-gate-dispatch.test.ts` |
| pass | repo-gate-dispatch.test.ts: artifact.feedback.append through the gated handler tables stores the entry when the call names the repo and a relative artifactPath, and refuses it without the repo | `src/daemon/__tests__/repo-gate-dispatch.test.ts` |

**integration: src/daemon/__tests__/handler-runtime.test.ts — isolated qualificationState reaches existing unqualified error.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | qualificationState dispatch reaches the existing unqualified diagnostic in an isolated home | `src/daemon/__tests__/handler-runtime.test.ts` |

**unit: src/daemon/threads/__tests__/method-class.test.ts — qualification ordinary session target, excluding admin/shared/FIFO ownership.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | qualificationState is unary ordinary session work without admin shared or FIFO routing | `src/daemon/threads/__tests__/method-class.test.ts` |

**integration: src/daemon/__tests__/repo-call-gate.test.ts and src/daemon/__tests__/step-repo-gate.test.ts — canonical repo/path/token refusal and continuation controls.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-call-gate.test.ts: a missing, empty, relative, non-directory and unregistered repo are each refused with their code and nothing is touched | `src/daemon/__tests__/repo-call-gate.test.ts` |
| pass | step-repo-gate.test.ts: a modifying step phase with no repo and no token is refused, and a later phase cannot be redirected to another repository by a different repo | `src/daemon/__tests__/step-repo-gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/handler-runtime.test.ts` | 0 | 12 | 1.4 s |  |
| `src/daemon/__tests__/repo-call-gate.test.ts` | 0 | 3 | 0.2 s |  |
| `src/daemon/__tests__/repo-gate-dispatch.test.ts` | 0 | 2 | 0.9 s |  |
| `src/daemon/__tests__/step-repo-gate.test.ts` | 0 | 1 | 1.2 s |  |
| `src/daemon/threads/__tests__/method-class.test.ts` | 0 | 10 | 1.1 s |  |

## t3

Run at 2026-11-20T12:10:58.702Z on commit `ab1ff29f6`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: src/daemon/__tests__/daemon-doc-repo-table.test.ts — exact modifying method/parameter and refusal documentation parity.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | daemon-doc-repo-table.test.ts: docs/daemon.md lists the methods of the table and the refusal codes | `src/daemon/__tests__/daemon-doc-repo-table.test.ts` |

**smoke: Node22 coordinator --concurrency=1 runs all seven baseline files, plus step-repo-gate and directly affected retired-review/router regressions as needed; retain whole-file results and confirmed child cleanup under docs/plans.**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/rpc-audit-evidence-2026-11-20/final/results.json and cleanup.json: run f8705ca8-1a3b-4f96-811d-1a889944437a, 74/74 tests across 16 complete files, zero skips/cancellations, confirmedClosed true. TAP and detailed checkpoints are retained alongside these records.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/daemon-doc-repo-table.test.ts` | 0 | 1 | 0.3 s |  |
