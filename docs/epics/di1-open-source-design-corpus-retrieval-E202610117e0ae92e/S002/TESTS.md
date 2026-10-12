<!-- insrc:artifact TESTS-7e0ae92e8f3d3c3e-s2 -->

# Tests: 7e0ae92e8f3d3c3e s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 25 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-12T05:49:13.408Z on commit `16df4f8a`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
| `src/design/corpus/sources/__tests__/contracts.test.ts` | 0 | 2 | 0.5 s |  |

## t2

Run at 2026-10-12T06:03:51.822Z on commit `4a48274e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t3

Run at 2026-10-12T05:04:07.092Z on commit `5a036847`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: pinned-reader preserves binary commit bytes despite worktree and branch changes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pinned-reader preserves binary commit bytes despite worktree and branch changes | `src/design/corpus/sources/__tests__/git-reader.test.ts` |

**integration: pinned-reader rejects missing commits paths and corrupt object framing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pinned-reader rejects missing commits paths and corrupt object framing | `src/design/corpus/sources/__tests__/git-reader.test.ts` |

**integration: reader-safety rejects selected unsafe paths before I/O and ignores unselected paths**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reader-safety rejects selected unsafe paths before I/O and ignores unselected paths | `src/design/corpus/sources/__tests__/git-reader.test.ts` |

**integration: reader-safety rejects symlinks and submodules and leaves LFS unresolved**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reader-safety rejects symlinks and submodules and leaves LFS unresolved | `src/design/corpus/sources/__tests__/git-reader.test.ts` |

**integration: reader-safety prevents replacement filters lazy fetch and config-driven commands**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reader-safety prevents replacement filters lazy fetch and config-driven commands | `src/design/corpus/sources/__tests__/git-reader.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/sources/__tests__/git-reader.test.ts` | 0 | 5 | 1.3 s |  |

## t4

Run at 2026-10-12T05:50:34.978Z on commit `16df4f8a`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: reader-safety bounds aggregate source and shared evidence bytes and counts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reader-safety bounds aggregate source and shared evidence bytes and counts | `src/design/corpus/sources/__tests__/reader-limits.test.ts` |

**integration: reader-safety cancels timed-out aborted and failed children without admitted bytes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reader-safety cancels timed-out aborted and failed children without admitted bytes | `src/design/corpus/sources/__tests__/reader-limits.test.ts` |

**integration: reader-safety rejects truncated or oversized stdout and stderr without leaks**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reader-safety rejects truncated or oversized stdout and stderr without leaks | `src/design/corpus/sources/__tests__/reader-limits.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/sources/__tests__/reader-limits.test.ts` | 0 | 3 | 0.8 s |  |

## t5

Run at 2026-10-12T06:04:28.885Z on commit `4a48274e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: lineage-closure retains every source and transformation for derived outputs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | lineage-closure retains every source and transformation for derived outputs | `src/design/corpus/sources/__tests__/lineage.test.ts` |

**unit: lineage-closure rejects unbound specimens inconsistent provenance and stale outputs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | lineage-closure rejects unbound specimens inconsistent provenance and stale outputs | `src/design/corpus/sources/__tests__/lineage.test.ts` |

**unit: lineage-closure requires explicit original and inferred output declarations**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | lineage-closure requires explicit original and inferred output declarations | `src/design/corpus/sources/__tests__/lineage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/sources/__tests__/lineage.test.ts` | 0 | 3 | 0.5 s |  |

## t6

Run at 2026-10-12T06:05:05.768Z on commit `4a48274e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: notice-closure preserves exact evidence bytes and all source obligations**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | notice-closure preserves exact evidence bytes and all source obligations | `src/design/corpus/sources/__tests__/notices.test.ts` |

**unit: notice-closure deduplicates shared evidence without losing attribution**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | notice-closure deduplicates shared evidence without losing attribution | `src/design/corpus/sources/__tests__/notices.test.ts` |

**unit: notice-closure produces stable expected bytes and rejects invalid evidence text**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | notice-closure produces stable expected bytes and rejects invalid evidence text | `src/design/corpus/sources/__tests__/notices.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/sources/__tests__/notices.test.ts` | 0 | 3 | 0.5 s |  |

## t7

Run at 2026-10-12T06:05:50.979Z on commit `4a48274e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: eligibility-binding reconstructs obligations and rejects modified candidate metadata**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | eligibility-binding reconstructs obligations and rejects modified candidate metadata | `src/design/corpus/sources/__tests__/assessment.test.ts` |

**unit: eligibility-binding rejects role swaps stale profiles and changed output evidence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | eligibility-binding rejects role swaps stale profiles and changed output evidence | `src/design/corpus/sources/__tests__/assessment.test.ts` |

**unit: acyclic-staging assesses before coverage finalization and rejects missing or duplicate coverage**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | acyclic-staging assesses before coverage finalization and rejects missing or duplicate coverage | `src/design/corpus/sources/__tests__/assessment.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/sources/__tests__/assessment.test.ts` | 0 | 3 | 0.6 s |  |

## t8

Run at 2026-10-12T06:06:19.789Z on commit `4a48274e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: candidate-roundtrip admits only eligible material and exports complete notices**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | candidate-roundtrip admits only eligible material and exports complete notices | `src/design/corpus/sources/__tests__/acceptance.test.ts` |

**integration: candidate-roundtrip validates original-only and multi-source derived packages**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | candidate-roundtrip validates original-only and multi-source derived packages | `src/design/corpus/sources/__tests__/acceptance.test.ts` |

**smoke: pure-boundary executes pure source modules with I/O forbidden**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pure-boundary executes pure source modules with I/O forbidden | `src/design/corpus/sources/__tests__/isolation.test.ts` |

**smoke: strict-build compiles source eligibility and passes the full corpus regression suite**

Reported by the builder, not run by the gate: **pass**. Evidence: plans/reviews/design-intelligence-di1-s2-final-review-verification.txt: unabridged 58/58 corpus TAP and npm run build after final review fixes; broader repository failures remain documented separately.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/sources/__tests__/acceptance.test.ts` | 0 | 2 | 0.8 s |  |
| `src/design/corpus/sources/__tests__/isolation.test.ts` | 0 | 1 | 1.3 s |  |
