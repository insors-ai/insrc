<!-- insrc:artifact TESTS-7e0ae92e8f3d3c3e-s2 -->

# Tests: 7e0ae92e8f3d3c3e s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-12T04:54:28.333Z on commit `152a7c48`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: source-schema preserves exact sc3 shapes and rejects invalid identities and fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | source-schema preserves exact sc3 shapes and rejects invalid identities and fields | `src/design/corpus/sources/__tests__/contracts.test.ts` |

**unit: validation-parity matches S001 path collision and UTC timestamp behavior**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | validation-parity matches S001 path collision and UTC timestamp behavior | `src/design/corpus/sources/__tests__/contracts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/sources/__tests__/contracts.test.ts` | 0 | 2 | 0.6 s |  |

## t2

Run at 2026-10-12T04:59:13.470Z on commit `7fd440ce`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: mixed-eligibility admits only reviewed exact-file profiles with complete evidence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | mixed-eligibility admits only reviewed exact-file profiles with complete evidence | `src/design/corpus/sources/__tests__/eligibility.test.ts` |

**unit: mixed-eligibility propagates stale evidence without rejecting independent eligible files**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | mixed-eligibility propagates stale evidence without rejecting independent eligible files | `src/design/corpus/sources/__tests__/eligibility.test.ts` |

**unit: mixed-eligibility requires explicit font and compound-license decisions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | mixed-eligibility requires explicit font and compound-license decisions | `src/design/corpus/sources/__tests__/eligibility.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/sources/__tests__/eligibility.test.ts` | 0 | 3 | 0.6 s |  |
