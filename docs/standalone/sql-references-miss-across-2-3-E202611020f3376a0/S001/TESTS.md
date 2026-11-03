<!-- insrc:artifact TESTS-0f3376a086e3601c-S001 -->

# Tests: 0f3376a086e3601c S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-03T10:41:55.428Z on commit `fe6acd85c`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: S001 t1: the SQL name key folds bare and backtick segments, keeps double-quoted ones exact, and never collides**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: the SQL name key folds bare and backtick segments, keeps double-quoted ones exact, and never collides | `src/indexer/parser/__tests__/sql-names.test.ts` |

**unit: S001 t1: the reader keeps meaningful quoting in stored names, matches same-file references and CTEs by key, and keeps written names in rawTo and referencesIn**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: the reader keeps meaningful quoting in stored names, matches same-file references and CTEs by key, and keeps written names in rawTo and referencesIn | `src/indexer/parser/__tests__/sql-names.test.ts` |
| pass | s9 t8: a SQL fixture yields the document, table and view entities and their REFERENCES (ac2) | `src/indexer/parser/__tests__/sql.test.ts` |
| pass | s9 t8: a CTE name is not a reference, and pending names keep their delimiters | `src/indexer/parser/__tests__/sql.test.ts` |

**unit: S001 t1: names the grammar cannot read give the same entities and references as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: names the grammar cannot read give the same entities and references as before | `src/indexer/parser/__tests__/sql-names.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/parser/__tests__/sql-names.test.ts` | 0 | 3 | 0.7 s |  |
| `src/indexer/parser/__tests__/sql.test.ts` | 0 | 8 | 0.7 s |  |
