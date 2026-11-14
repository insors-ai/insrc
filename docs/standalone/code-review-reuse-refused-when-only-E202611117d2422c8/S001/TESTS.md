<!-- insrc:artifact TESTS-7d2422c8f57fa483-s1 -->

# Tests: 7d2422c8f57fa483 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 23 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-11T17:34:49.769Z on commit `453462b94`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: the attempt header schema accepts only the v2 identity format**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the attempt header schema accepts only the v2 identity format | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**unit: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: an identity format on an unaccepted attempt is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an identity format on an unaccepted attempt is refused | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` | 0 | 2 | 2.6 s |  |

## t2

Run at 2026-11-11T17:39:54.264Z on commit `aeffb3a7a`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: the v1 task identity equals the identity pinned from the pre-change code**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the v1 task identity equals the identity pinned from the pre-change code | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**unit: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: the v2 task identity ignores command, execution details and evidence references**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the v2 task identity ignores command, execution details and evidence references | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**unit: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: the v2 task identity changes with the test file, cases or result**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the v2 task identity changes with the test file, cases or result | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**unit: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a task with no assigned tests keeps a v2 identity over requirements, changes and documents**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a task with no assigned tests keeps a v2 identity over requirements, changes and documents | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: the rejection names a provenance-only change between two v1 attempts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the rejection names a provenance-only change between two v1 attempts | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` | 0 | 7 | 4.5 s |  |

## t3

Run at 2026-11-11T18:08:08.542Z on commit `9acbf7d3d`. Tests check: **passed**. 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a correction attempt reuses a task when only provenance text in its test rows changed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a correction attempt reuses a task when only provenance text in its test rows changed | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: three tasks reused after their evidence references are removed are accepted in one submission**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | three tasks reused after their evidence references are removed are accepted in one submission | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: reuse is still refused with reassess feedback when a test's cases changed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reuse is still refused with reassess feedback when a test's cases changed | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: reordered test cases refuse reuse**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reordered test cases refuse reuse | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: reuse from an attempt recorded under the earlier identity format is refused with reassess feedback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reuse from an attempt recorded under the earlier identity format is refused with reassess feedback | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: three tasks whose source used the earlier identity format are refused in one rejection naming all three**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | three tasks whose source used the earlier identity format are refused in one rejection naming all three | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a saved attempt without an identity format re-binds with its stored v1 identities**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a saved attempt without an identity format re-binds with its stored v1 identities | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a saved v1 attempt that reused a v1 attempt still re-binds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a saved v1 attempt that reused a v1 attempt still re-binds | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a published v2 reuse row passes the record reuse-identity check**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a published v2 reuse row passes the record reuse-identity check | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts: existing tests pass unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | both routes durably accept direct/model mapping before acknowledgement or assessment without diagnostics | `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` |
| pass | offline binding rejects index-only, decision-only, selected task, state and test count tampering | `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` |
| pass | task identity binds relevant code requirements documents and full tests but excludes unrelated revision movement | `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` |
| pass | changed evidence names the affected reuse task and both routes accept corrected reassessment without losing eligible reuse | `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` |
| pass | fresh native/controller resume restores exact mixed decisions and summary before a planned reuse completes | `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/compatibility.test.ts: existing tests pass unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | old checkpoint and CR compatibility: absent origin fields mean containing-attempt assessment | `src/workflow/code-review/task-review/__tests__/compatibility.test.ts` |
| pass | migration compatibility: preserve origin-bearing history and reject unsupported downgrade readers | `src/workflow/code-review/task-review/__tests__/compatibility.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` | 0 | 5 | 96 s |  |
| `src/workflow/code-review/task-review/__tests__/compatibility.test.ts` | 0 | 5 | 47.1 s |  |
| `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` | 0 | 16 | 74.1 s |  |
