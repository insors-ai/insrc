<!-- insrc:artifact PLAN-50cde239426d6e2a-s1 -->

# Plan: STORY-50cde239426d6e2a-s1

## Summary

**Epic:** `shared-reviewcontext-data-model`
**LLD run:** `wf-1795072380921-ph8gfl`
**LLD effective hash:** `720f2f3adc55...`

Building Story s1 means adding four small, purely-additive plain-data types and two pure, synchronous functions to one existing file (src/workflow/artifact-core/types.ts), with no I/O and no changes to any existing code. The work is almost entirely new surface area with a matching set of unit tests; nothing here touches a file any other Story or system already depends on.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add Locator, Pointer, StalenessResult and PathValidationResult interfaces to src/workflow/artifact-core/types.ts | S | — | — | unit: Locator, Pointer, StalenessResult and PathValidationResult are exported with the exact documented field shapes | [[c1]] |
| 2 | **`t2`** Implement PointerStalenessCheck and PointerPathValidator as pure functions | S | — | `t1` | unit: PointerStalenessCheck and PointerPathValidator are exported with their documented signatures and are pure (no I/O) | [[c1]] [[c2]] |
| 3 | **`t3`** Write unit tests for the new types and both functions | M | — | `t1`, `t2` | unit: a Pointer with path + section (Locator) identifies both the file and the region; unit: a Pointer with no section still identifies the whole file; unit: a Locator with kind='symbol'/'lineRange'/'docSection' is accepted; unit: a Locator with an arbitrary future kind string is accepted and read via a non-exhaustive string-keyed lookup, not an exhaustive switch; unit: PointerStalenessCheck returns stale:true when pointer.contentHash differs from currentContentHash; unit: PointerStalenessCheck returns stale:false when pointer.contentHash equals currentContentHash; unit: PointerStalenessCheck returns stale:false when pointer.contentHash is absent (no hash was ever recorded); unit: PointerStalenessCheck returns stale:true when pointer.contentHash is an empty string compared against a real hex digest; unit: PointerStalenessCheck always returns the same stale value for the same two arguments (purity), only checkedAt varies; unit: PointerPathValidator returns ok:true for a Pointer.path that resolves within registeredRepoRoot; unit: PointerPathValidator returns ok:false with a named violation for a Pointer.path containing '..' segments that resolves outside registeredRepoRoot | [[c3]] |

### 1.1 TASK-50cde239426d6e2a-s1-t1 — Add Locator, Pointer, StalenessResult and PathValidationResult interfaces to src/workflow/artifact-core/types.ts

Add a new, clearly-labeled section (e.g. '// --- shared-reviewcontext-data-model Epic sc1/sc2/sc6 (Locator/Pointer/staleness/path-validation), owned by s1 ---') at the end of src/workflow/artifact-core/types.ts defining: type LocatorKind = 'symbol' | 'lineRange' | 'docSection'; interface Locator { kind, value }; interface Pointer { path, section?, contentHash? }; interface StalenessResult { stale, checkedAt }; interface PathValidationResult { ok, violations }. No functions in this Task -- types only.

**Acceptance checks:**
- Locator, Pointer, StalenessResult and PathValidationResult are exported from src/workflow/artifact-core/types.ts with exactly the field shapes the LLD's dataModelChanges describe
- The new section is labeled unambiguously with this Epic's own name, not a bare 'sc1/sc2/sc6' that could be confused with this file's existing, differently-scoped sc-labeled sections
- tsc typechecks the file with no errors

### 1.2 TASK-50cde239426d6e2a-s1-t2 — Implement PointerStalenessCheck and PointerPathValidator as pure functions

Add type PointerStalenessCheck = (pointer, currentContentHash) => StalenessResult and type PointerPathValidator = (pointer, registeredRepoRoot) => PathValidationResult, each with a concrete implementing function, exported beside the types from t1. PointerStalenessCheck does a plain string comparison (no I/O); PointerPathValidator resolves pointer.path against registeredRepoRoot via path.resolve (mirroring src/db/repos.ts's own repo-path normalization) and checks the result stays within registeredRepoRoot, with no I/O either.

**Acceptance checks:**
- PointerStalenessCheck returns {stale:false} when pointer.contentHash is absent, and compares currentContentHash against pointer.contentHash otherwise, with no file I/O
- PointerPathValidator returns {ok:true, violations:[]} for an in-root path and {ok:false, violations:[...]} naming the escaping path for a '..'-escaping path, with no file I/O
- Both functions are pure: identical inputs always produce identical ok/stale, varying only in any wall-clock field documented for that function

### 1.3 TASK-50cde239426d6e2a-s1-t3 — Write unit tests for the new types and both functions

Add flat kebab-case *.test.ts files under src/workflow/artifact-core/__tests__/ (matching this directory's existing one-concern-per-file convention) covering: Locator/Pointer shape + open-kind acceptance, PointerStalenessCheck's documented precondition/edge cases, and PointerPathValidator's in-root/escaping-path cases, per the LLD's testStrategy.

**Acceptance checks:**
- Every subject named in the LLD's testStrategy.testLevels has a corresponding test case
- ac1, ac2 and ac3's provingTests from the LLD's acceptanceMapping all pass
- npx tsx --test for the new test files passes with zero failures

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a Pointer with path + section (Locator) identifies both the file and the region | `t3` |
| a Pointer with no section still identifies the whole file | `t3` |
| a Locator with kind='symbol'/'lineRange'/'docSection' is accepted | `t3` |
| a Locator with an arbitrary future kind string is accepted and read via a non-exhaustive string-keyed lookup, not an exhaustive switch | `t3` |
| PointerStalenessCheck returns stale:true when pointer.contentHash differs from currentContentHash | `t3` |
| PointerStalenessCheck returns stale:false when pointer.contentHash equals currentContentHash | `t3` |
| PointerStalenessCheck returns stale:false when pointer.contentHash is absent (no hash was ever recorded) | `t3` |
| PointerStalenessCheck returns stale:true when pointer.contentHash is an empty string compared against a real hex digest | `t3` |
| PointerStalenessCheck always returns the same stale value for the same two arguments (purity), only checkedAt varies | `t3` |
| PointerPathValidator returns ok:true for a Pointer.path that resolves within registeredRepoRoot | `t3` |
| PointerPathValidator returns ok:false with a named violation for a Pointer.path containing '..' segments that resolves outside registeredRepoRoot | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 dataModelChanges (Locator, Pointer, StalenessResult, PathValidationResult)`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails.api (PointerStalenessCheck, PointerPathValidator)`
- **[[c3]]** `prior-artifact` `LLD s1 testStrategy`
