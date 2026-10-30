<!-- insrc:artifact TESTS-3789fd85d0bbeb22-s1 -->

# Tests: 3789fd85d0bbeb22 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-30T08:12:56.225Z on commit `553004628`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Native JSONL startup inventory survives cancellation; partial tail is diagnostic only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Native JSONL startup inventory survives cancellation; partial tail is diagnostic only | `src/agent/providers/__tests__/claude-investigation-events.test.ts` |

**unit: Malformed contradictory unknown-version and oversized streams never pass isolation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Malformed contradictory unknown-version and oversized streams never pass isolation | `src/agent/providers/__tests__/claude-investigation-events.test.ts` |

**unit: Native-only terminal result validation preserves ordinary Claude buffered completions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Native-only terminal result validation preserves ordinary Claude buffered completions | `src/agent/providers/__tests__/claude-investigation-events.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/claude-investigation-events.test.ts` | 0 | 3 | 0.7 s |  |

## t2

Run at 2026-10-30T08:23:48.018Z on commit `565644594`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Project discovery canaries and labelled positive controls produce attributable host observations**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Project discovery canaries and labelled positive controls produce attributable host observations | `src/daemon/__tests__/review-investigation-probe-fixtures.test.ts` |

**integration: Inactive controls missing native telemetry and model claims remain unverified**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Inactive controls missing native telemetry and model claims remain unverified | `src/daemon/__tests__/review-investigation-probe-fixtures.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/review-investigation-probe-fixtures.test.ts` | 0 | 4 | 0.8 s |  |

## t3

Run at 2026-10-30T08:50:35.361Z on commit `46ac5a0bf`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Restricted capability leaks fail and control-phase evidence cannot qualify production**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Restricted capability leaks fail and control-phase evidence cannot qualify production | `src/agent/providers/__tests__/native-investigation-probe.test.ts` |

**integration: Combined phase deadline budget capture bounds and shared provider lane prevent retries or overlap**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Combined phase deadline budget capture bounds and shared provider lane prevent retries or overlap | `src/agent/providers/__tests__/native-investigation-probe.test.ts` |
| pass | Probe and review across repositories share one lane until actual teardown | `src/daemon/__tests__/review-investigation-provider-lane.test.ts` |

**integration: Raw phase export rejects tampering foreign roots stale pins and control-to-production promotion**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Raw phase export rejects tampering foreign roots stale pins and control-to-production promotion | `src/agent/providers/__tests__/native-investigation-probe.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/native-investigation-probe.test.ts` | 0 | 8 | 9.9 s |  |
| `src/daemon/__tests__/review-investigation-provider-lane.test.ts` | 0 | 2 | 1.6 s |  |
