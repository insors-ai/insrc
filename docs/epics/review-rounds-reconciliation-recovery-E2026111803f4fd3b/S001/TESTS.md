<!-- insrc:artifact TESTS-03f4fd3b9102aab8-s1 -->

# Tests: 03f4fd3b9102aab8 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-19T16:50:02.110Z on commit `83d89193c`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a round 1 call invokes hooks.ground once with the complete targets and no prior-findings argument**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a round 1 call invokes hooks.ground once with the complete targets and no prior-findings argument | `src/workflow/review-round/__tests__/driver.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/driver.test.ts` | 0 | 16 | 0.3 s |  |

## t2

Run at 2026-11-19T16:30:48.757Z on commit `1e6b04b7d`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a round 1 call invokes hooks.ground once with the complete targets and no prior-findings argument**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a round 1 call invokes hooks.ground once with the complete targets and no prior-findings argument | `src/workflow/review-round/__tests__/driver.test.ts` |

**unit: a round 2 (Correction-and-Re-review) call invokes hooks.ground through the identical call shape as round 1, differing only in the round number passed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a round 2 (Correction-and-Re-review) call invokes hooks.ground through the identical call shape as round 1, differing only in the round number passed | `src/workflow/review-round/__tests__/driver.test.ts` |

**unit: hooks.ground receives the full targets/artifact unmodified -- nothing is stripped or withheld before grounding runs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | hooks.ground receives the full targets/artifact unmodified -- nothing is stripped or withheld before grounding runs | `src/workflow/review-round/__tests__/driver.test.ts` |

**unit: round 0 is rejected with a RangeError before any hook is called**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | round 0 is rejected with a RangeError before any hook is called | `src/workflow/review-round/__tests__/driver.test.ts` |

**unit: a negative round is rejected with a RangeError before any hook is called**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a negative round is rejected with a RangeError before any hook is called | `src/workflow/review-round/__tests__/driver.test.ts` |

**unit: a non-integer round is rejected with a RangeError before any hook is called**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a non-integer round is rejected with a RangeError before any hook is called | `src/workflow/review-round/__tests__/driver.test.ts` |

**unit: a rejecting hooks.ground propagates its rejection and hooks.security is never called for that round**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a rejecting hooks.ground propagates its rejection and hooks.security is never called for that round | `src/workflow/review-round/__tests__/driver.test.ts` |

**unit: a rejecting hooks.security propagates its rejection rather than returning hooks.ground's findings alone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a rejecting hooks.security propagates its rejection rather than returning hooks.ground's findings alone | `src/workflow/review-round/__tests__/driver.test.ts` |

**unit: an empty ReviewTargets.entries array is passed through to hooks.ground unchanged, with no special-casing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an empty ReviewTargets.entries array is passed through to hooks.ground unchanged, with no special-casing | `src/workflow/review-round/__tests__/driver.test.ts` |

**unit: opts omitted defaults runSecurityPass to true -- hooks.security runs when it is supplied**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | opts omitted defaults runSecurityPass to true -- hooks.security runs when it is supplied | `src/workflow/review-round/__tests__/driver.test.ts` |

**unit: opts.runSecurityPass:false suppresses hooks.security even when it is supplied**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | opts.runSecurityPass:false suppresses hooks.security even when it is supplied | `src/workflow/review-round/__tests__/driver.test.ts` |

**unit: hooks.security undefined is a no-op, not a thrown error, when runSecurityPass is true or omitted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | hooks.security undefined is a no-op, not a thrown error, when runSecurityPass is true or omitted | `src/workflow/review-round/__tests__/driver.test.ts` |

**unit: a large round number (e.g. 50) runs through the identical code path as round 1, with no round-number-based branching**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a large round number (e.g. 50) runs through the identical code path as round 1, with no round-number-based branching | `src/workflow/review-round/__tests__/driver.test.ts` |

**unit: reviewId never appears in hooks.ground's or hooks.security's own call arguments across round 1 and round 2, and is left available unchanged for the caller to thread on to the sc4/sc5 calls, never substituted for a different value**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reviewId never appears in hooks.ground's or hooks.security's own call arguments across round 1 and round 2, and is left available unchanged for the caller to thread on to the sc4/sc5 calls, never substituted for a different value | `src/workflow/review-round/__tests__/driver.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/driver.test.ts` | 0 | 15 | 0.3 s |  |
