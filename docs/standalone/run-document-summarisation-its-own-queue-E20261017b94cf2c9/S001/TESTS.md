<!-- insrc:artifact TESTS-b94cf2c9058fd82a-S001 -->

# Tests: b94cf2c9058fd82a S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-17T13:31:05.601Z on commit `36a2bcaf`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/__tests__/queue-lanes.test.ts: while a summary job is running and has not finished, an index job enqueued after it runs to completion; the two lanes run at the same time and each runs its jobs one at a time in order; summary kinds go to the summary lane and every other kind to the index lane; a single-document job is placed ahead of a queued sweep and takeDocSummaryEdit removes and returns it; depth, isProcessing and depthForRepo span both lanes (depthForRepo counts a queued sweep but not a single-document job), codeIndexWorkFor reads the index lane only, laneStatus reports each lane; stop ends both lanes and start resolves**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an index job enqueued while a summary job is running completes before that summary job finishes | `src/daemon/__tests__/queue-lanes.test.ts` |
| pass | each lane runs its jobs one at a time in order, at the same time as the other lane, and every kind goes to its lane | `src/daemon/__tests__/queue-lanes.test.ts` |
| pass | a single-document job goes ahead of a queued sweep, after earlier single-document jobs, and takeDocSummaryEdit removes and returns it | `src/daemon/__tests__/queue-lanes.test.ts` |
| pass | depth, isProcessing and depthForRepo span both lanes, codeIndexWorkFor reads the index lane only, and laneStatus reports each lane | `src/daemon/__tests__/queue-lanes.test.ts` |
| pass | stop ends both lanes after their current jobs, and start resolves only then | `src/daemon/__tests__/queue-lanes.test.ts` |

**unit: src/daemon/__tests__/queue-code-index-work.test.ts: the existing test asserts the order of the index lane's in-flight jobs only, independently of summary-lane interleaving, and stops once both lanes are empty**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | codeIndexWorkFor counts full, reconcile and file jobs for the repository (in flight and pending) and ignores other repositories, a prefix-sharing repository, config, reembed and document-summary jobs; the in-flight job clears after a throwing processor | `src/daemon/__tests__/queue-code-index-work.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/queue-code-index-work.test.ts` | 0 | 2 | 0.7 s |  |
| `src/daemon/__tests__/queue-lanes.test.ts` | 0 | 5 | 0.6 s |  |
