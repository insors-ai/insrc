<!-- insrc:artifact TESTS-2ec4d97980969dd5-S001 -->

# Tests: 2ec4d97980969dd5 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 1 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## S001

Run at 2026-10-31T13:01:46.992Z on commit `3f62d9dfa`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**live: src/daemon/threads/__tests__/router-session.test.ts (whole-file typecheck)**

Reported by the builder, not run by the gate: **pass**. Evidence: Verified directly via a temporary including tsconfig (tsconfig extends the real one, includes only this file, exclude cleared) run with npx tsc -p --noEmit: 0 errors (was 6 TS2345 errors before the fix).

**unit: src/daemon/threads/__tests__/router-session.test.ts (full file run)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: one session's three requests reach its worker in arrival order; a stream ends at its done/error frame | `src/daemon/threads/__tests__/router-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/router-session.test.ts` | 0 | 21 | 1.2 s |  |
