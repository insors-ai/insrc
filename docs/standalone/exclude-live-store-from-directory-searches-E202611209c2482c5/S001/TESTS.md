<!-- insrc:artifact TESTS-9c2482c594fd8df5-s1 -->

# Tests: 9c2482c594fd8df5 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-20T08:04:51.316Z on commit `d955c581b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Protected direct roots refuse before backend or content access**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Protected direct roots refuse before backend or content access | `src/daemon/tools/builtins/search/__tests__/grep-live-store.test.ts` |

**integration: Store ancestor and directory aliases use guarded Node in bounded and complete modes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Store ancestor and directory aliases use guarded Node in bounded and complete modes | `src/daemon/tools/builtins/search/__tests__/grep-live-store.test.ts` |

**integration: Allowed roots retain real ripgrep without ambient configuration or symlink following**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Allowed roots retain real ripgrep without ambient configuration or symlink following | `src/daemon/tools/builtins/search/__tests__/grep-live-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/search/__tests__/grep-live-store.test.ts` | 0 | 3 | 0.4 s |  |

## t2

Run at 2026-11-20T08:08:21.507Z on commit `0db0d3c87`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: Grep result shapes and Node/ripgrep omission rules remain truthful**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Grep result shapes and Node/ripgrep omission rules remain truthful | `src/daemon/tools/builtins/search/__tests__/grep-compatibility.test.ts` |

**integration: Complete-mode failure preserves allowed partial hits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Complete-mode failure preserves allowed partial hits | `src/daemon/tools/builtins/search/__tests__/grep-compatibility.test.ts` |

**smoke: Recorded focused validation reports actual coverage, baseline timing failures and closed actors**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/live-store-search-fix-2026-11-20.md and live-store-search-evidence-2026-11-20/{baseline,final}-results.json with retained TAP hashes: baseline15pass/2fail (store leak and fake-rg300ms startup), final29pass/1fail (stale executeTool missing deps), no cancelled/skipped, coverage complete, cleanup confirmed. Final compiled safety smoke passed; no actual daemon store touched. t1 validation initially rejected simultaneous data/lock relocation; correction and expanded test passed. Current callers, cardinality/ownership, backend semantic change and path-race/hardlink limitations documented; no visual necessary or rendering claim. Qualification not refreshed.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/search/__tests__/grep-compatibility.test.ts` | 0 | 3 | 1.2 s |  |
