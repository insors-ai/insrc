<!-- insrc:artifact TESTS-e4af63128c7cbec2-s1 -->

# Tests: e4af63128c7cbec2 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-09T07:52:13.312Z on commit `1191a5352`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts: unverified admission and resource guards preserve pinned code history and refuse approval**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unverified admission and resource guards preserve pinned code history and refuse approval | `src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` |

**unit: src/shared/__tests__/review-resources.test.ts: bounded exact review lease and clearance receipt contracts reject invalid input**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bounded exact review lease and clearance receipt contracts reject invalid input | `src/shared/__tests__/review-resources.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/review-resources.test.ts` | 0 | 1 | 0.6 s |  |
| `src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` | 0 | 1 | 1 s |  |

## t2

Run at 2026-11-09T08:05:19.987Z on commit `81edc5d07`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts: historical design attempts and unverified admission retain separate semantics**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | historical design attempts and unverified admission retain separate semantics | `src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` |

**unit: src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts: serialized resource and progress updates cannot lose open intents**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | serialized resource and progress updates cannot lose open intents | `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` | 0 | 1 | 0.8 s |  |
| `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` | 0 | 5 | 0.8 s |  |

## t3

Run at 2026-11-09T09:08:06.224Z on commit `35c9f815f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/code-review/task-review/__tests__/admission-history.test.ts: failed admission survives successful next attempt publication and post-cleanup reads**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | failed admission survives successful next attempt publication and post-cleanup reads | `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` |

**integration: src/workflow/review/design-review/__tests__/admission-history.test.ts: technical admission diagnostics remain non-review evidence across publication**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | technical admission diagnostics remain non-review evidence across publication | `src/workflow/review/design-review/__tests__/admission-history.test.ts` |

**unit: src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts: guard-only updates preserve report identity while reviewed-input or result mutations do not**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | guard-only updates preserve report identity while reviewed-input or result mutations do not | `src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` | 0 | 1 | 1.2 s |  |
| `src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts` | 0 | 1 | 1 s |  |
| `src/workflow/review/design-review/__tests__/admission-history.test.ts` | 0 | 1 | 0.9 s |  |

## t4

Run at 2026-11-09T10:00:23.617Z on commit `9f8c8c660`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/threads/__tests__/review-processes.test.ts: host leases precede spawn and enforce owner-bound replay and disposal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | host leases precede spawn and enforce owner-bound replay and disposal | `src/daemon/threads/__tests__/review-processes.test.ts` |

**integration: src/daemon/threads/__tests__/review-processes.test.ts: worker loss and unknown child cleanup fence only the owning review**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | worker loss and unknown child cleanup fence only the owning review | `src/daemon/threads/__tests__/review-processes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-processes.test.ts` | 0 | 2 | 1 s |  |

## t5

Run at 2026-11-09T10:11:53.272Z on commit `bb08cd12c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/agent/providers/__tests__/review-worker-process.test.ts: fake native review CLI streams and cancellation use host-owned leases**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fake native review CLI streams and cancellation use host-owned leases | `src/agent/providers/__tests__/review-worker-process.test.ts` |

**unit: src/agent/providers/__tests__/review-worker-process.test.ts: review binary lookup cannot spawn synchronously on the worker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review binary lookup cannot spawn synchronously on the worker | `src/agent/providers/__tests__/review-worker-process.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/review-worker-process.test.ts` | 0 | 2 | 1.8 s |  |
