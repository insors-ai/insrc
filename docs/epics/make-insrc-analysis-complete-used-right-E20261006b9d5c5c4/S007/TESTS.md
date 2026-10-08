<!-- insrc:artifact TESTS-b9d5c5c40df5a574-s7 -->

# Tests: b9d5c5c40df5a574 s7

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-08T18:44:10.632Z on commit `be6abc9c`. Tests check: **passed**. 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: prepareScope and stepScope accept, refuse and return what they did, and prepareScope makes no pairing check in classification or task mode (mutation: make the check in every mode)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runShaper refuses a pairing the table does not allow before resolving the scope | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | runShaper accepts every pairing in the corrected table | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | the pairing is checked for run mode only: classification and task inputs are not refused | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | resolveScopeForTarget: every pairing of the table resolves to what resolveScope gives; every other pairing is refused before a reader is touched | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | prepareScope makes no pairing check outside run mode: a refused pairing resolves to what resolveScope gives | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | step tool start phase: resolved workspace scope, and the pairing test refusing a stand-in scope | `src/mcp/__tests__/analyze-step-scope.test.ts` |

**unit: the indexed check reads the registry and entities through the readers it is given, and the real store when given none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ensureNonEmptyClosure: given readers it reads the registry and the entities through them, not the real store | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: with readers the check keeps its leniency for a registry that cannot be read or holds no repo | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: pristine registry -> skipped silently, returns undefined | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: registered repo with entities -> returns repo path | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: registered repo with ZERO entities -> ScopeNotIndexedError | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: scope outside every registered repo -> ScopeNotIndexedError | `src/analyze/context/__tests__/invariants.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/invariants.test.ts` | 0 | 15 | 1.6 s |  |
| `src/analyze/context/__tests__/prepare-scope.test.ts` | 0 | 8 | 0.8 s |  |
| `src/mcp/__tests__/analyze-step-scope.test.ts` | 0 | 3 | 0.7 s |  |
