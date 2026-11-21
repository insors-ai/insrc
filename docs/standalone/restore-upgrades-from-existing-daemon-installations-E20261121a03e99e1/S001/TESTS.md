<!-- insrc:artifact TESTS-a03e99e17a364550-s1 -->

# Tests: a03e99e17a364550 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-21T17:48:45.684Z on commit `80ace719b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Portable source qualification rejects wrong channel/profile/floor before npm**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Portable source qualification rejects wrong channel/profile/floor before npm | `scripts/__tests__/source-upgrade-qualification-native.test.ts` |
| pass | Linux source promotion requires target-specific historical upgrade evidence | `scripts/__tests__/source-upgrade-qualification-native.test.ts` |

**integration: Independent staging uses absolute owned npm and preserves Mac signed behavior**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Independent staging uses absolute owned npm and preserves Mac signed behavior | `scripts/__tests__/source-upgrade-qualification-native.test.ts` |
| pass | Release provenance, changed bytes and absent legacy declaration | `src/daemon/__tests__/managed-release-staging.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/source-upgrade-qualification-native.test.ts` | 0 | 3 | 37.8 s |  |
| `src/daemon/__tests__/managed-release-staging.test.ts` | 0 | 7 | 18.3 s |  |

## t2

Run at 2026-11-21T19:10:57.925Z on commit `50a172185`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Linux selector/journal reject malformed, linked and nonprivate files**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Linux selector/journal reject malformed, linked and nonprivate files | `src/shared/__tests__/source-installation.test.ts` |
| pass | Portable source qualification rejects wrong channel/profile/floor before npm | `scripts/__tests__/source-upgrade-qualification-native.test.ts` |

**integration: Atomic publication with unknown fsync/rename outcome reconciles safely**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Atomic publication with unknown fsync/rename outcome reconciles safely | `src/shared/__tests__/source-installation.test.ts` |
| pass | Linux source journal serializes competing writers | `src/shared/__tests__/source-installation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/source-upgrade-qualification-native.test.ts` | 0 | 3 | 36.5 s |  |
| `src/shared/__tests__/source-installation.test.ts` | 0 | 3 | 52.4 s |  |

## t3

Run at 2026-11-21T19:43:49.953Z on commit `6f078b30d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Source-ahead stale output and partial npm preserve incumbent and require qualified recovery**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Source-ahead stale output and partial npm preserve incumbent and require qualified recovery | `scripts/__tests__/source-predecessor-native.test.ts` |

**integration: Dirty lock/source preserved; independently staged rollback baseline admitted only by actual compatibility**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Dirty lock/source preserved; independently staged rollback baseline admitted only by actual compatibility | `scripts/__tests__/source-predecessor-native.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/source-predecessor-native.test.ts` | 0 | 2 | 22.9 s |  |
