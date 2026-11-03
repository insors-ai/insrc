<!-- insrc:artifact TESTS-1ad687e69c9218de-S001 -->

# Tests: 1ad687e69c9218de S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 7 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

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

## t2

Run at 2026-11-03T08:32:54.582Z on commit `f4d469ba3`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: S001 t2: calls on typed, new-initialised and constructor-assigned fields are kept whatever the name**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t2: calls on typed, new-initialised and constructor-assigned fields are kept whatever the name | `src/indexer/parser/__tests__/typescript-builtin-named-calls.test.ts` |

**unit: S001 t2: calls on typed parameters and new-initialised locals are kept; built-in, array, union and untyped receivers are not**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t2: calls on typed parameters and new-initialised locals are kept; built-in, array, union and untyped receivers are not | `src/indexer/parser/__tests__/typescript-builtin-named-calls.test.ts` |

**unit: S001 t2: field proofs do not leak across classes or files, and JavaScript follows the same rules**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t2: field proofs do not leak across classes or files, and JavaScript follows the same rules | `src/indexer/parser/__tests__/typescript-builtin-named-calls.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/parser/__tests__/typescript-builtin-named-calls.test.ts` | 0 | 6 | 0.8 s |  |

## t3

Run at 2026-11-03T08:53:08.139Z on commit `260c75e0e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: S001 t3: the restored calls resolve to the user definitions and items.find() links to no user find**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t3: the restored calls resolve to the user definitions and items.find() links to no user find | `src/indexer/__tests__/builtin-named-calls-resolution.test.ts` |

**smoke: S001 t3: the installed daemon shows callers of a built-in-named function after index and repo.reindex**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/typescript-reader-drops-calls-user-functions-E202611021ad687e6/S001/smoke-t3.md

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/builtin-named-calls-resolution.test.ts` | 0 | 1 | 0.8 s |  |
