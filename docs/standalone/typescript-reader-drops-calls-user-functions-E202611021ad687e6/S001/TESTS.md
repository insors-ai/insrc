<!-- insrc:artifact TESTS-1ad687e69c9218de-S001 -->

# Tests: 1ad687e69c9218de S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-03T08:20:30.043Z on commit `a0d1fe628`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: S001 t1: bare calls to user functions named like built-ins are kept; bare global functions are not**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: bare calls to user functions named like built-ins are kept; bare global functions are not | `src/indexer/parser/__tests__/typescript-builtin-named-calls.test.ts` |

**unit: S001 t1: calls on this, super and import bindings are kept whatever the name; a local shadowing an import is not**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: calls on this, super and import bindings are kept whatever the name; a local shadowing an import is not | `src/indexer/parser/__tests__/typescript-builtin-named-calls.test.ts` |

**unit: S001 t1: built-in-named member calls on untyped locals and built-in objects record no row, and import bindings do not leak to the next file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: built-in-named member calls on untyped locals and built-in objects record no row, and import bindings do not leak to the next file | `src/indexer/parser/__tests__/typescript-builtin-named-calls.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/parser/__tests__/typescript-builtin-named-calls.test.ts` | 0 | 3 | 0.7 s |  |
