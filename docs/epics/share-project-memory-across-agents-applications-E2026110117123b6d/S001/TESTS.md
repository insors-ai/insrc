<!-- insrc:artifact TESTS-17123b6d304af2a2-s1 -->

# Tests: 17123b6d304af2a2 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 3 pass, 1 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-01T18:52:29.474Z on commit `00b9cc308`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: public-v1-types-and-emitted-boundary**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | public-v1-types-and-emitted-boundary | `packages/project-memory/src/__tests__/contracts.test.ts` |

**smoke: pure-public-import-without-native-or-daemon**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pure-public-import-without-native-or-daemon | `packages/project-memory/src/__tests__/contracts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/contracts.test.ts` | 0 | 2 | 1.4 s |  |

## t2

Run at 2026-11-01T18:58:56.941Z on commit `c3efb780e`. Tests check: **failed**. 1 pass, 1 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

named test cases that did not pass: fail: 'node22-fs-ext-abi-and-separate-descriptor-probe' in packages/project-memory/src/__tests__/native.test.ts

**integration: node22-fs-ext-abi-and-separate-descriptor-probe**

| Result | Test | File |
| :--- | :--- | :--- |
| fail | node22-fs-ext-abi-and-separate-descriptor-probe | `packages/project-memory/src/__tests__/native.test.ts` |
| pass | native-load-failure-is-not-ready | `packages/project-memory/src/__tests__/native.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/native.test.ts` | 1 | 2 | 0.5 s |  |
