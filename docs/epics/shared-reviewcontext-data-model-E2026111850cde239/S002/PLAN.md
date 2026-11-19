<!-- insrc:artifact PLAN-50cde239426d6e2a-s2 -->

# Plan: STORY-50cde239426d6e2a-s2

## Summary

**Epic:** `shared-reviewcontext-data-model`
**LLD run:** `wf-1795073668515-dyvzbj`
**LLD effective hash:** `720f2f3adc55...`

This Story adds Scope -- the type naming which review family and chain depth a review attempt covers -- plus two dedicated validators, validateDesignScope and validateCodeScope, that enforce exactly which named fields a Scope must carry at its own depth and reject any Pointer-typed field whose path escapes the registered repo root. The build is three Tasks: land the types, implement the validators over one shared declarative field-requirement table (closing a cross-LLD security gap by also calling Story s1's path validator), then write the full named test suite.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add Scope, ValidationResult and ScopeFieldRequirement types | S | — | — | unit: Scope, ScopeType, ScopeLevel, ValidationResult and ScopeValidator are exported with the exact documented field shapes | [[c1]] |
| 2 | **`t2`** Implement validateDesignScope and validateCodeScope | M | — | `t1` | unit: validateDesignScope and validateCodeScope are exported with their documented signatures and enforce the field-presence table and sc6 path validation, with no file I/O | [[c2]] |
| 3 | **`t3`** Write unit and integration tests for Scope and its validators | M | — | `t1`, `t2` | unit: a Scope with distinct def/hld/lld/plan/tasks/extension/amendment Pointers keeps each field independently addressable; unit: a minimal valid design-review Scope (scopeType='design', scopeLevel='def', only def populated) validates ok:true; unit: validateDesignScope returns ok:false when scopeLevel='hld' but hld is absent while def is populated; unit: validateDesignScope returns ok:true when scopeLevel='hld' and both def and hld are populated; unit: validateDesignScope/validateCodeScope return ok:false with a named violation when called on the wrong scopeType; unit: validateCodeScope returns ok:false when a field deeper than scopeLevel is populated; unit: validateCodeScope returns ok:false when scope.tasks is an empty array at a scopeLevel requiring tasks; unit: a validator returns ok:false naming the (scopeType, scopeLevel) combination itself as invalid when no requirement-table entry exists for it; unit: extension and amendment populated or absent independent of scopeLevel do not affect ok/violations; integration: validateDesignScope returns ok:false with a named violation when a populated Pointer-typed field's path escapes registeredRepoRoot; integration: validateCodeScope returns ok:false with a named violation when a populated Pointer-typed field's path escapes registeredRepoRoot | [[c1]] [[c2]] [[c3]] |

### 1.1 TASK-50cde239426d6e2a-s2-t1 — Add Scope, ValidationResult and ScopeFieldRequirement types

Add interface Scope {scopeType, scopeLevel, def?, hld?, lld?, plan?, tasks?, extension?, amendment?}, type ScopeType/ScopeLevel, interface ValidationResult {ok, violations}, type ScopeValidator, and the internal (non-exported) ScopeFieldRequirement declarative table shape to src/workflow/artifact-core/types.ts, beside Story s1's Locator/Pointer. Every named Scope field is independently typed (never a generic map), per k1.

**Acceptance checks:**
- Scope, ScopeType, ScopeLevel, ValidationResult and ScopeValidator are exported from types.ts with exactly sc3's interfaceSketch field shapes (readonly, optional-with-undefined per repo convention)
- A Scope with distinct def/hld/lld/plan/tasks/extension/amendment Pointers keeps each field independently addressable (no generic map)
- tsc --noEmit passes with the new types in place

### 1.2 TASK-50cde239426d6e2a-s2-t2 — Implement validateDesignScope and validateCodeScope

Add a private declarative (scopeType, scopeLevel) -> required/must-be-absent field table and one shared comparison engine in a new src/workflow/artifact-core/scope-checks.ts, then export validateDesignScope and validateCodeScope (each ScopeValidator-typed) as thin closures over that engine (alternative a1). Each validator first checks scope.scopeType matches its own dedicated literal, then the self-inclusive field-presence table, then calls sc6's validatePointerPath (from pointer-checks.ts) against every populated Pointer-typed field, folding any violation into the same ValidationResult.violations array.

**Acceptance checks:**
- validateDesignScope/validateCodeScope return ok:false with a named violation when called on the wrong scopeType
- A field required at the Scope's own declared scopeLevel being absent, or a field deeper than scopeLevel being populated, each returns ok:false with a named violation (self-inclusive chain, ac2)
- An invalid (scopeType, scopeLevel) combination with no table entry returns ok:false naming the combination itself, not a field-level error
- scope.tasks as an empty array at a scopeLevel requiring tasks is treated as absent
- Both validators call validatePointerPath against every populated Pointer-typed field and fold ok:false violations into the same violations array (sc6 consumption, closes the cross-LLD security gap)
- Neither validator performs file I/O itself

### 1.3 TASK-50cde239426d6e2a-s2-t3 — Write unit and integration tests for Scope and its validators

Add flat kebab-case *.test.ts files under src/workflow/artifact-core/__tests__/ covering: Scope's independently-addressable named fields and a minimal valid design-review Scope, the self-inclusive depth model, each validator's exact field-presence enforcement per (scopeType, scopeLevel), and the sc6 PointerPathValidator integration rejecting an escaping Pointer path -- one test case per testStrategy.testLevels subject, matching ac1/ac2/ac3's acceptanceMapping verbatim.

**Acceptance checks:**
- Every subject named in the LLD's testStrategy.testLevels has a corresponding test case
- ac1, ac2 and ac3's provingTests from the LLD's acceptanceMapping all pass
- npx tsx --test for the new test files passes with zero failures

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a Scope with distinct def/hld/lld/plan/tasks/extension/amendment Pointers keeps each field independently addressable | `t3` |
| a minimal valid design-review Scope (scopeType='design', scopeLevel='def', only def populated) validates ok:true | `t3` |
| validateDesignScope returns ok:false when scopeLevel='hld' but hld is absent while def is populated | `t3` |
| validateDesignScope returns ok:true when scopeLevel='hld' and both def and hld are populated | `t3` |
| validateDesignScope/validateCodeScope return ok:false with a named violation when called on the wrong scopeType | `t3` |
| validateCodeScope returns ok:false when a field deeper than scopeLevel is populated | `t3` |
| validateCodeScope returns ok:false when scope.tasks is an empty array at a scopeLevel requiring tasks | `t3` |
| a validator returns ok:false naming the (scopeType, scopeLevel) combination itself as invalid when no requirement-table entry exists for it | `t3` |
| extension and amendment populated or absent independent of scopeLevel do not affect ok/violations | `t3` |
| validateDesignScope returns ok:false with a named violation when a populated Pointer-typed field's path escapes registeredRepoRoot | `t3` |
| validateCodeScope returns ok:false with a named violation when a populated Pointer-typed field's path escapes registeredRepoRoot | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 dataModelChanges (Scope, ValidationResult, ScopeFieldRequirement)`
- **[[c2]]** `prior-artifact` `LLD s2 contractDetails.api and interactionWithShared sc6 consumption (validateDesignScope, validateCodeScope)`
- **[[c3]]** `prior-artifact` `LLD s2 testStrategy (testLevels and acceptanceMapping)`
