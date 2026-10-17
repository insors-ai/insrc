<!-- insrc:artifact TESTS-bd1c6c9005ff6390-S001 -->

# Tests: bd1c6c9005ff6390 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-17T09:45:26.410Z on commit `5746ab7e`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/indexer/parser/__tests__/typescript-module-level-calls.test.ts: calls in a program-level expression statement (including nested describe/test callbacks), a non-function program-level or exported initializer, other program-level statements and export default, in both TypeScript (.ts) and JavaScript (.js) sources, are CALLS from the file entity; calls in function declarations, class methods, exported functions and classes and function-valued declarators keep their caller and are not credited to the file; built-ins are still skipped; a module-level HTTP call is a CALLS_HTTP from the file entity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | program-level statements, non-function and exported initializers and export default are CALLS from the file entity (.ts) | `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts` |
| pass | calls in functions, methods, exported functions and classes and function-valued declarators keep their caller (.ts) | `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts` |
| pass | built-ins are skipped and a module-level HTTP call is a CALLS_HTTP from the file entity (.ts) | `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts` |
| pass | program-level statements, non-function and exported initializers and export default are CALLS from the file entity (.js) | `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts` |
| pass | calls in functions, methods, exported functions and classes and function-valued declarators keep their caller (.js) | `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts` |
| pass | built-ins are skipped and a module-level HTTP call is a CALLS_HTTP from the file entity (.js) | `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts` | 0 | 7 | 0.4 s |  |

## t2

Run at 2026-10-17T09:51:00.367Z on commit `553b3204`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/indexer/parser/__tests__/typescript-module-level-calls.test.ts: in both TypeScript and JavaScript sources, calls in class field initializers (public_field_definition, field_definition) and the constructor body are CALLS from the class entity, a function-valued field is not credited to the class, and a generator-valued declarator gets its own function entity whose calls are not credited to the file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | class field initializers and the constructor body are CALLS from the class entity; a function-valued field is not, and a generator-valued declarator is its own caller (.ts) | `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts` |
| pass | class field initializers and the constructor body are CALLS from the class entity; a function-valued field is not, and a generator-valued declarator is its own caller (.js) | `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts` | 0 | 9 | 0.4 s |  |
