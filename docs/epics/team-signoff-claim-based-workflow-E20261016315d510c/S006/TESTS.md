<!-- insrc:artifact TESTS-315d510cb28100e2-s6 -->

# Tests: 315d510cb28100e2 s6

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-18T17:06:54.425Z on commit `dd063c03`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/park-offer.test.ts: teamGate sets offerPark only on held-by-other and only through a registered provider, a throwing provider counts as false, a repo with no policy makes no provider call, and describeOutcome appends the park command only then**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | teamGate sets offerPark only on held-by-other and only through a registered provider, a throwing provider counts as false, a repo with no policy makes no provider call, and describeOutcome appends the park command only then | `src/workflow/team/__tests__/park-offer.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/park-offer.test.ts` | 0 | 1 | 1 s |  |

## t2

Run at 2026-10-18T17:09:55.658Z on commit `71f2da1e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts: the state store keeps meta beside the payload, carries it through reencodeState and replaceState, lists entries newest first without touching expiry, and an entry saved without meta behaves as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the state store keeps meta beside the payload, carries it through reencodeState and replaceState, lists entries newest first without touching expiry, and an entry saved without meta behaves as before | `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` | 0 | 1 | 1 s |  |

## t3

Run at 2026-10-18T17:20:30.641Z on commit `53e59f21`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/snapshot-upstream.test.ts: snapshotUpstream lists the artifacts each workflow reads, including the Define and the effective HLD with approved amendments, a missing revision reads as 0, and a standalone Story does not fail**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | snapshotUpstream lists the artifacts each workflow reads, including the Define and the effective HLD with approved amendments, a missing revision reads as 0, and a standalone Story does not fail | `src/workflow/team/__tests__/snapshot-upstream.test.ts` |

**integration: src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts: handleStart records the acting user and the upstream snapshot on the stored run, plan and step turns keep them, and a repo without a policy records neither and makes no tracker call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | handleStart records the acting user and the upstream snapshot on the stored run, plan and step turns keep them, and a repo without a policy records neither and makes no tracker call | `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` | 0 | 1 | 1.2 s |  |
| `src/workflow/team/__tests__/snapshot-upstream.test.ts` | 0 | 2 | 1 s |  |
