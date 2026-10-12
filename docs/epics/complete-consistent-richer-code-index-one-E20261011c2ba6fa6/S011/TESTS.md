<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s11 -->

# Tests: c2ba6fa62a148ed1 s11

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-12T11:26:57.256Z on commit `9f1697eb`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: review stream module: ReviewStreamError from src/shared/review-stream.ts is the same class daemon-stream.ts exports, and the routing tests pass unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review stream module: ReviewStreamError from src/shared/review-stream.ts is the same class daemon-stream.ts exports, and the routing tests pass unchanged | `src/shared/__tests__/review-stream.test.ts` |
| pass | T11 a daemon review that fails (timeout) is an error: nothing stamped, no controller loop offered | `src/mcp/review-step/__tests__/review-step-routing.test.ts` |
| pass | T11 against an older daemon (a plain unknown-method line, socket kept open) the tool fails at once with the update message | `src/mcp/review-step/__tests__/review-step-routing.test.ts` |
| pass | T17 a diff the daemon cannot read comes back as a failed daemon review naming the cause; nothing is stamped | `src/mcp/code-review-step/__tests__/routing.test.ts` |
| pass | T11 the tool waits 30 minutes: with a daemon that never answers it fails when that limit fires | `src/mcp/code-review-step/__tests__/routing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/code-review-step/__tests__/routing.test.ts` | 0 | 21 | 0.7 s |  |
| `src/mcp/review-step/__tests__/review-step-routing.test.ts` | 0 | 20 | 0.5 s |  |
| `src/shared/__tests__/review-stream.test.ts` | 0 | 1 | 0.4 s |  |
