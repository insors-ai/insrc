<!-- insrc:artifact TESTS-c32aa60534232f36-s1 -->

# Tests: c32aa60534232f36 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-28T12:35:44.800Z on commit `50ae942af`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: sc1/sc6 canonical identity, invalid value and type contract fixtures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sc1/sc6 canonical identity, invalid value and type contract fixtures | `src/workflow/code-review/investigation/__tests__/identity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/investigation/__tests__/identity.test.ts` | 0 | 1 | 0.4 s |  |

## t2

Run at 2026-10-28T12:40:14.335Z on commit `98aecbe22`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Exact parent/blob/change-kind packet and hardened reader reuse fixtures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Exact parent/blob/change-kind packet and hardened reader reuse fixtures | `src/workflow/code-review/investigation/__tests__/git-packets.test.ts` |
| pass | packet extraction refuses unsupported files and preserves zero-count ranges | `src/workflow/code-review/investigation/__tests__/git-packets.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/investigation/__tests__/git-packets.test.ts` | 0 | 2 | 0.7 s |  |

## t3

Run at 2026-10-28T12:45:19.657Z on commit `c621851b9`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Approved task projection, trusted attribution and freshness fixtures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Approved task projection, trusted attribution and freshness fixtures | `src/workflow/code-review/investigation/__tests__/subject.test.ts` |
| pass | planless provenance and present unapproved PLAN are distinct | `src/workflow/code-review/investigation/__tests__/subject.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/investigation/__tests__/subject.test.ts` | 0 | 4 | 1 s |  |

## t4

Run at 2026-10-28T12:50:03.692Z on commit `f8b686d8b`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Bounded immutable source navigation and reference isolation fixtures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Bounded immutable source navigation and reference isolation fixtures | `src/workflow/code-review/investigation/__tests__/source.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/investigation/__tests__/source.test.ts` | 0 | 5 | 1.1 s |  |

## t5

Run at 2026-10-28T12:57:37.753Z on commit `28b18ad6c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Cross-module adversarial scope and legacy/corpus regression fixtures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Cross-module adversarial scope and legacy/corpus regression fixtures | `src/workflow/code-review/investigation/__tests__/adversarial.test.ts` |
| pass | explicit merge parent, pinned binary and symlink context boundaries | `src/workflow/code-review/investigation/__tests__/adversarial.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/investigation/__tests__/adversarial.test.ts` | 0 | 2 | 0.9 s |  |
