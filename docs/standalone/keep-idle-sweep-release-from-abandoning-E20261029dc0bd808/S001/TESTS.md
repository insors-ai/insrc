<!-- insrc:artifact TESTS-dc0bd8089ce15fcd-S001 -->

# Tests: dc0bd8089ce15fcd S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## S001

Run at 2026-10-31T13:16:01.626Z on commit `387ca945e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: maintenance.ts MaintenanceController.compactUnderLock's beforeRename callback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the pre-rename check no longer abandons the compaction when a worker the idle sweep released has already acknowledged graph.close, even though the supervisor has not yet seen its exit (ISSUE-dc0bd808) | `src/daemon/threads/__tests__/maintenance.test.ts` |
| pass | the pre-rename check is by worker identity: a worker that exited and was replaced between the close acknowledgements and the rename fails it, though the count is unchanged | `src/daemon/threads/__tests__/maintenance.test.ts` |
| pass | the pre-rename check returns false when a worker has not acknowledged 'graph.close': no rename, no lock-file removal, the original store reopens and serves | `src/daemon/threads/__tests__/maintenance.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/maintenance.test.ts` | 0 | 17 | 5.1 s |  |
