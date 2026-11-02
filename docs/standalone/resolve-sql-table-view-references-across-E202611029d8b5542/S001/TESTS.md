<!-- insrc:artifact TESTS-9d8b55429378a3be-S001 -->

# Tests: 9d8b55429378a3be S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## S001

Run at 2026-11-02T08:12:44.741Z on commit `24a045cf2`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: SQL references resolved by the cross-file pass**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a reference to a table or view defined in exactly one other file resolves inferred -- qualified or bare, whatever its case | `src/indexer/__tests__/cross-file-sql-references.test.ts` |
| pass | several candidates leave the reference ambiguous with its candidates and no edge; a qualified name never matches a bare definition | `src/indexer/__tests__/cross-file-sql-references.test.ts` |
| pass | a name no file defines is classed no-candidate (no-match), not not-attempted | `src/indexer/__tests__/cross-file-sql-references.test.ts` |
| pass | a settle that commits the file defining a table resolves a waiting reference of an unchanged file | `src/indexer/__tests__/cross-file-sql-references.test.ts` |

**integration: SQL repository through IndexerService**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s9 t8 (ac2): SQL files indexed through IndexerService store a table or view per definition beside the document, and REFERENCES per foreign key and per relation a view selects from | `src/indexer/__tests__/sql-index.test.ts` |
| pass | a settle that commits the file defining a table resolves a reference waiting on it in an unchanged file | `src/indexer/__tests__/sql-index.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/cross-file-sql-references.test.ts` | 0 | 13 | 3.4 s |  |
| `src/indexer/__tests__/sql-index.test.ts` | 0 | 2 | 0.9 s |  |
