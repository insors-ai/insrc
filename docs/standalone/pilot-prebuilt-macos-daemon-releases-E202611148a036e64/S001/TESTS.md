<!-- insrc:artifact TESTS-8a036e6436ae82ab-s1 -->

# Tests: 8a036e6436ae82ab s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-14T07:34:20.403Z on commit `c35776117`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Candidate layout and build-only workflow**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | candidate layout survives moving the runtime and rejects external links | `scripts/__tests__/package-daemon-candidate.test.ts` |
| pass | candidate workflow accepts only the protected dispatch revision and has no test or publish jobs | `scripts/__tests__/package-daemon-candidate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/package-daemon-candidate.test.ts` | 0 | 2 | 0.5 s |  |

## t2

Run at 2026-11-14T07:38:04.569Z on commit `29bd123ed`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Bootstrap checksum and signature/target trust**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bundle signatures bind raw bytes, signer, trust domain and supported target | `scripts/__tests__/daemon-bundle-metadata.test.ts` |
| pass | qualification requires one passing record per required local test | `scripts/__tests__/daemon-bundle-metadata.test.ts` |
| pass | bootstrap checksum rejects changed bytes before bootstrap execution | `scripts/__tests__/daemon-bundle-metadata.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/daemon-bundle-metadata.test.ts` | 0 | 3 | 0.5 s |  |

## t3

Run at 2026-11-14T07:40:43.640Z on commit `294ac4f23`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Archive path and digest rejection**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | staging authenticates archive bytes and rejects links leaving the runtime | `scripts/__tests__/stage-daemon-bundle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/stage-daemon-bundle.test.ts` | 0 | 1 | 0.8 s |  |

## t4

Run at 2026-11-14T07:48:13.921Z on commit `ca55b4090`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Fresh activation, legacy handoff, floor and offline crash recovery**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a release floor permits identical retry but rejects rollback or conflicting reuse | `src/shared/__tests__/daemon-bundle-release-floor.test.ts` |
| pass | Fresh controller activation reconciles partial selector and bootstrap | `src/daemon/__tests__/fresh-managed-activation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/fresh-managed-activation.test.ts` | 0 | 4 | 9.8 s |  |
| `src/shared/__tests__/daemon-bundle-release-floor.test.ts` | 0 | 1 | 0.3 s |  |

## t6

Run at 2026-11-14T07:52:09.882Z on commit `ed6143d4c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Promotion controls, evidence binding and no rebuild**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | promotion admits only the approved manifest, archive and local evidence | `scripts/__tests__/promote-daemon-candidate.test.ts` |
| pass | promotion requires protected approval and never rebuilds the candidate | `scripts/__tests__/promote-daemon-candidate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/promote-daemon-candidate.test.ts` | 0 | 2 | 0.6 s |  |
