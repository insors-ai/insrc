<!-- insrc:artifact TESTS-4adebe9eb17a3ef2-s1 -->

# Tests: 4adebe9eb17a3ef2 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-14T15:06:10.652Z on commit `c289b9a2a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Local branch routing and candidate metadata**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | candidate workflow accepts only the protected dispatch revision and has no test or publish jobs | `scripts/__tests__/package-daemon-candidate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/package-daemon-candidate.test.ts` | 0 | 2 | 0.4 s |  |

## t2

Run at 2026-11-14T15:06:46.604Z on commit `c289b9a2a`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Exact attempt and signed archive provenance**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | release artifact retrieval rejects failed attempts, development refs, and cross-attempt substitution | `scripts/__tests__/daemon-release-artifact.test.ts` |
| pass | promotion admits only the approved manifest, archive and local evidence | `scripts/__tests__/promote-daemon-candidate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/daemon-release-artifact.test.ts` | 0 | 1 | 0.8 s |  |
| `scripts/__tests__/promote-daemon-candidate.test.ts` | 0 | 2 | 0.4 s |  |

## t3

Run at 2026-11-14T15:07:50.222Z on commit `c289b9a2a`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Local environment policy and live disable checks**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | live readiness and main-only signing policy fail closed after approval | `scripts/__tests__/daemon-release-policy.test.ts` |
| pass | disabling readiness after signing aborts the next publication mutation | `scripts/__tests__/daemon-release-policy.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/daemon-release-policy.test.ts` | 0 | 3 | 0.9 s |  |

## t4

Run at 2026-11-14T15:08:34.140Z on commit `c289b9a2a`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Local staged rollout and release sequence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | promotion admits only the approved manifest, archive and local evidence | `scripts/__tests__/promote-daemon-candidate.test.ts` |
| pass | staging authenticates archive bytes and rejects links leaving the runtime | `scripts/__tests__/stage-daemon-bundle.test.ts` |
| pass | disabling readiness after signing aborts the next publication mutation | `scripts/__tests__/daemon-release-policy.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/daemon-release-policy.test.ts` | 0 | 3 | 4.2 s |  |
| `scripts/__tests__/promote-daemon-candidate.test.ts` | 0 | 2 | 0.4 s |  |
| `scripts/__tests__/stage-daemon-bundle.test.ts` | 0 | 1 | 0.6 s |  |
