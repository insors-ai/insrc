<!-- insrc:artifact TESTS-b9d5c5c40df5a574-s8 -->

# Tests: b9d5c5c40df5a574 s8

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-09T13:08:04.779Z on commit `75899025`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: sourceModulesOf returns one module per directory that directly holds a source file, none for a directory of artifacts only, and none for a directory whose source is all in sub-directories (mutation: count artifact files as source)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sourceModulesOf returns one module per directory that directly holds a source file, none for a directory of artifacts only, and none for a directory whose source is all in sub-directories (mutation: count artifact files as source) | `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` |

**unit: sourceModulesOf keeps a stored module entity with its id and lists no directory in or under its directory as a module of its own, also when the entity lies above the area and is not itself listed (mutation: test rule (b) against the area's entities only)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sourceModulesOf keeps a stored module entity with its id and lists no directory in or under its directory as a module of its own, also when the entity lies above the area and is not itself listed (mutation: test rule (b) against the area's entities only) | `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` |

**unit: sourceModulesOf names a module by its path relative to the repo, '.' for the repo's own directory, and does not take 'payments' for part of 'pay' (mutation: test the prefix without the slash)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sourceModulesOf names a module by its path relative to the repo, '.' for the repo's own directory, and does not take 'payments' for part of 'pay' (mutation: test the prefix without the slash) | `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` |

**unit: moduleOfDirectory reads an absolute path, a relative path, a trailing slash and '.' as the same directory, and moduleOfEntityId reads a stored module entity's id with neither a scope nor a repo's entities (mutation: treat every value as an entity id, as before)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | moduleOfDirectory reads an absolute path, a relative path, a trailing slash and '.' as the same directory, and moduleOfEntityId reads a stored module entity's id with neither a scope nor a repo's entities (mutation: treat every value as an entity id, as before) | `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` |

**unit: moduleOfDirectory fails for a directory with no stored source under it, for one outside the repo, for one outside the scope's area and for a directory path under a file or symbol scope, and moduleOfEntityId for the id of an entity of another kind, each with its own message; a relative value with no known repo is joined to the scope's own directory**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | moduleOfDirectory fails for a directory with no stored source under it, for one outside the repo, for one outside the scope's area and for a directory path under a file or symbol scope, and moduleOfEntityId for the id of an entity of another kind, each with its own message; a relative value with no known repo is joined to the scope's own directory | `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` |

**smoke: the baseline of the analyze suite and of the gated file is recorded in the Story's folder before the first source change**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/ (README.md, analyze.txt with 1077 result lines, deterministic-runtimes.gated.txt with 11), committed at 83b63484, the commit before the first source change 1ad06bb2.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` | 0 | 5 | 0.6 s |  |
