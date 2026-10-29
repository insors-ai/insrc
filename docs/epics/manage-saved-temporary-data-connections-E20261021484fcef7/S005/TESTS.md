<!-- insrc:artifact TESTS-484fcef7efaf229e-s5 -->

# Tests: 484fcef7efaf229e s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-29T14:41:37.350Z on commit `e4b30504f`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S5-SYNC-FIXTURES: common JSON corpus version/digest, valid and malformed wire/state transcripts and live-evidence coverage index**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-SYNC-FIXTURES: common JSON corpus version/digest, valid and malformed wire/state transcripts and live-evidence coverage index | `src/shared/__tests__/connection-manager-corpus.test.ts` |
| pass | CM-S5-SYNC-FIXTURES: JUnit reads the identical packaged corpus and rejects digest/version drift | `src/shared/__tests__/connection-manager-corpus.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-corpus.test.ts` | 0 | 2 | 10.2 s |  |

## t2

Run at 2026-10-29T14:54:33.596Z on commit `3af052d7d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S5-WIRE-TS: bounded strict TypeScript v2 reply decoding and descriptor refusal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-WIRE-TS: bounded strict TypeScript v2 reply decoding and descriptor refusal | `src/shared/__tests__/connection-manager-wire.test.ts` |
| pass | CM-S5-WIRE-TS: rejects accessor prototype symbol sparse cyclic and excessive data without invoking getters | `src/shared/__tests__/connection-manager-wire.test.ts` |
| pass | CM-S5-WIRE-TS: validates root key operation mode epoch and stale test tuple before use | `src/shared/__tests__/connection-manager-wire.test.ts` |
| pass | CM-S5-WIRE-TS: rejects private public-config values and strips untrusted error copy | `src/shared/__tests__/connection-manager-wire.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-wire.test.ts` | 0 | 4 | 1.3 s |  |

## t3

Run at 2026-10-29T15:05:48.808Z on commit `acea568cf`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S5-WIRE-KT: Kotlin v2 DTO decoding matches common corpus and preserves legacy gateway types**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-WIRE-KT: Kotlin v2 DTO decoding matches common corpus and preserves legacy gateway types | `src/shared/__tests__/connection-manager-kotlin-wire.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-kotlin-wire.test.ts` | 0 | 1 | 4.5 s |  |
