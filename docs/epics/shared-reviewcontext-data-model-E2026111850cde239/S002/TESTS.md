<!-- insrc:artifact TESTS-50cde239426d6e2a-s2 -->

# Tests: 50cde239426d6e2a s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-19T10:14:17.565Z on commit `0480ee661`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Scope, ScopeType, ScopeLevel, ValidationResult and ScopeValidator are exported with the exact documented field shapes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | are exported with the exact documented field shapes | `src/workflow/artifact-core/__tests__/scope.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/scope.test.ts` | 0 | 2 | 0.9 s |  |

## t2

Run at 2026-11-19T11:01:28.291Z on commit `4fb9abd16`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: validateDesignScope and validateCodeScope are exported with their documented signatures and enforce the field-presence table and sc6 path validation, with no file I/O**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | are exported with their documented signatures and enforce the field-presence table and sc6 path validation, with no file I/O | `src/workflow/artifact-core/__tests__/scope-checks.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/scope-checks.test.ts` | 0 | 15 | 0.5 s |  |

## t3

Run at 2026-11-19T10:48:28.502Z on commit `5120ab5ad`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a Scope with distinct def/hld/lld/plan/tasks/extension/amendment Pointers keeps each field independently addressable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Scope with distinct def/hld/lld/plan/tasks/extension/amendment Pointers keeps each field independently addressable | `src/workflow/artifact-core/__tests__/scope.test.ts` |

**unit: a minimal valid design-review Scope (scopeType='design', scopeLevel='def', only def populated) validates ok:true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a minimal valid design-review Scope (scopeType='design', scopeLevel='def', only def populated) validates ok:true | `src/workflow/artifact-core/__tests__/scope.test.ts` |

**unit: validateDesignScope returns ok:false when scopeLevel='hld' but hld is absent while def is populated**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | validateDesignScope returns ok:false when scopeLevel='hld' but hld is absent while def is populated | `src/workflow/artifact-core/__tests__/scope-checks.test.ts` |

**unit: validateDesignScope returns ok:true when scopeLevel='hld' and both def and hld are populated**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | validateDesignScope returns ok:true when scopeLevel='hld' and both def and hld are populated | `src/workflow/artifact-core/__tests__/scope-checks.test.ts` |

**unit: validateDesignScope/validateCodeScope return ok:false with a named violation when called on the wrong scopeType**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | validateDesignScope/validateCodeScope return ok:false with a named violation when called on the wrong scopeType | `src/workflow/artifact-core/__tests__/scope-checks.test.ts` |

**unit: validateCodeScope returns ok:false when a field deeper than scopeLevel is populated**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | validateCodeScope returns ok:false when a field deeper than scopeLevel is populated | `src/workflow/artifact-core/__tests__/scope-checks.test.ts` |

**unit: validateCodeScope returns ok:false when scope.tasks is an empty array at a scopeLevel requiring tasks**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | validateCodeScope returns ok:false when scope.tasks is an empty array at a scopeLevel requiring tasks | `src/workflow/artifact-core/__tests__/scope-checks.test.ts` |

**unit: a validator returns ok:false naming the (scopeType, scopeLevel) combination itself as invalid when no requirement-table entry exists for it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a validator returns ok:false naming the (scopeType, scopeLevel) combination itself as invalid when no requirement-table entry exists for it | `src/workflow/artifact-core/__tests__/scope-checks.test.ts` |

**unit: extension and amendment populated or absent independent of scopeLevel do not affect ok/violations**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension and amendment populated or absent independent of scopeLevel do not affect ok/violations | `src/workflow/artifact-core/__tests__/scope-checks.test.ts` |

**integration: validateDesignScope returns ok:false with a named violation when a populated Pointer-typed field's path escapes registeredRepoRoot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | validateDesignScope returns ok:false with a named violation when a populated Pointer-typed field's path escapes registeredRepoRoot | `src/workflow/artifact-core/__tests__/scope-checks.test.ts` |

**integration: validateCodeScope returns ok:false with a named violation when a populated Pointer-typed field's path escapes registeredRepoRoot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | validateCodeScope returns ok:false with a named violation when a populated Pointer-typed field's path escapes registeredRepoRoot | `src/workflow/artifact-core/__tests__/scope-checks.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/scope-checks.test.ts` | 0 | 13 | 0.5 s |  |
| `src/workflow/artifact-core/__tests__/scope.test.ts` | 0 | 4 | 0.9 s |  |
