<!-- insrc:artifact TESTS-7e0ae92e8f3d3c3e-s2 -->

# Tests: 7e0ae92e8f3d3c3e s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

Run at 2026-10-12T05:08:05.626Z on commit `fd652b27`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
