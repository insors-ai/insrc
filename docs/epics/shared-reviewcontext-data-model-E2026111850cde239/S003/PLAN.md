<!-- insrc:artifact PLAN-50cde239426d6e2a-s3 -->

# Plan: STORY-50cde239426d6e2a-s3

## Summary

**Epic:** `shared-reviewcontext-data-model`
**LLD run:** `wf-1795074125025-18n7k9`
**LLD effective hash:** `720f2f3adc55...`

This Story adds ReviewTargets -- the submitter-owned list naming exactly the content to review this round, rebuilt fresh every round with no builder, factory or merge function of any kind. The build is two Tasks: land the one-field type, then write the full named test suite proving both its exactness (no carry-forward capability) and its structural compatibility with Story s1's path-validation contract.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add ReviewTargets type | S | — | — | unit: ReviewTargets is exported with the exact documented field shape | [[c1]] |
| 2 | **`t2`** Write unit and contract tests for ReviewTargets | S | — | `t1` | unit: a ReviewTargets built from a fresh Pointer list contains exactly those entries, nothing else; unit: no builder, factory or merge function exists anywhere in ReviewTargets' exported surface (a1's deliberate absence of such an API); unit: two ReviewTargets instances built for consecutive rounds on the same artifact are independent objects sharing no entries by construction; unit: ReviewTargets' exported surface contains no validator, allow-list or restriction function of any kind that could cap investigation to entries; unit: a ReviewTargets with zero entries is structurally valid; unit: entries with a duplicate Pointer (same path and section) is accepted; unit: entries mixing whole-file Pointers (no section) and region-pinned Pointers (section populated) is accepted; integration: every ReviewTargets.entries[] Pointer can be passed directly to sc6's PointerPathValidator with no reshaping | [[c1]] [[c2]] |

### 1.1 TASK-50cde239426d6e2a-s3-t1 — Add ReviewTargets type

Add interface ReviewTargets { readonly entries: readonly Pointer[] } to src/workflow/artifact-core/types.ts, beside Scope and Pointer. Exactly sc4's interfaceSketch, with zero additional API surface (no builder, factory, merge function, or validator) per the approved alternative a1.

**Acceptance checks:**
- ReviewTargets is exported from types.ts with exactly sc4's interfaceSketch field shape (readonly entries: readonly Pointer[])
- No builder, factory, merge, or validator function for ReviewTargets exists anywhere in types.ts
- tsc --noEmit passes with the new type in place

### 1.2 TASK-50cde239426d6e2a-s3-t2 — Write unit and contract tests for ReviewTargets

Add a flat kebab-case *.test.ts file under src/workflow/artifact-core/__tests__/ covering: exact-entries construction, independence across rounds, the deliberate absence of any merge/builder/validator function, empty/duplicate/mixed-section entries, and structural compatibility with sc6's PointerPathValidator -- one test case per testStrategy.testLevels subject, matching ac1/ac2's acceptanceMapping verbatim.

**Acceptance checks:**
- Every subject named in the LLD's testStrategy.testLevels has a corresponding test case
- ac1 and ac2's provingTests from the LLD's acceptanceMapping all pass
- npx tsx --test for the new test file passes with zero failures

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a ReviewTargets built from a fresh Pointer list contains exactly those entries, nothing else | `t2` |
| no builder, factory or merge function exists anywhere in ReviewTargets' exported surface (a1's deliberate absence of such an API) | `t2` |
| two ReviewTargets instances built for consecutive rounds on the same artifact are independent objects sharing no entries by construction | `t2` |
| ReviewTargets' exported surface contains no validator, allow-list or restriction function of any kind that could cap investigation to entries | `t2` |
| a ReviewTargets with zero entries is structurally valid | `t2` |
| entries with a duplicate Pointer (same path and section) is accepted | `t2` |
| entries mixing whole-file Pointers (no section) and region-pinned Pointers (section populated) is accepted | `t2` |
| every ReviewTargets.entries[] Pointer can be passed directly to sc6's PointerPathValidator with no reshaping | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 dataModelChanges (ReviewTargets)`
- **[[c2]]** `prior-artifact` `LLD s3 testStrategy (testLevels and acceptanceMapping)`
