<!-- insrc:artifact TESTS-01ac1e4b6a6c9c2f-s1 -->

# Tests: 01ac1e4b6a6c9c2f s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-15T05:40:15.193Z on commit `553c5d35f`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: scratch-store.test.ts: updateScratch happy path writes full text and replaces content; id validation refusal (outside-root, symlink, non-.md) → ScratchRefused; missing file → ScratchNotFound; write failure leaves destination unchanged and unlinks temp; temp path occupied by a symlink or existing file → exclusive create fails (EEXIST/ELOOP) and nothing is written outside the root**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-store.test.ts: updateScratch happy path writes full text and replaces content; id validation refusal (outside-root, symlink, non-.md) → ScratchRefused; missing file → ScratchNotFound; write failure leaves destination unchanged and unlinks temp; temp path occupied by a symlink or existing file → exclusive create fails (EEXIST/ELOOP) and nothing is written outside the root | `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` |

**unit: scratch-store.test.ts: updateScratch bumps mtime so listScratches reflects the save**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-store.test.ts: updateScratch bumps mtime so listScratches reflects the save | `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` | 0 | 14 | 1 s |  |
