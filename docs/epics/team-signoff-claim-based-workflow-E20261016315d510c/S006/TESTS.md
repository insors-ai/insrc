<!-- insrc:artifact TESTS-315d510cb28100e2-s6 -->

# Tests: 315d510cb28100e2 s6

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t4

Run at 2026-10-18T17:39:37.745Z on commit `35e5c249`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/handoff-pure.test.ts: handoffBranchName fills placeholders, applies the default, rejects a grammar break and a pattern without {id}**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | handoffBranchName fills placeholders, applies the default, rejects a grammar break and a pattern without {id} | `src/workflow/team/__tests__/handoff-pure.test.ts` |

**unit: src/workflow/team/__tests__/handoff-pure.test.ts: checkpoint validation rejects an unknown schemaVersion or kind, a unit mismatch and a path outside the unit's artifact paths, for the run and draft variants**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | checkpoint validation rejects an unknown schemaVersion or kind, a unit mismatch and a path outside the unit's artifact paths, for the run and draft variants | `src/workflow/team/__tests__/handoff-pure.test.ts` |

**unit: src/workflow/team/__tests__/handoff-pure.test.ts: rebindCheckpoint replaces repoPath and repoIndexedAt in both intents, resets startedAtMs and leaves no parker path, for all three stages, and inferStageWorkflow follows the committed artifact chain**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rebindCheckpoint replaces repoPath and repoIndexedAt in both intents, resets startedAtMs and leaves no parker path, for all three stages, and inferStageWorkflow follows the committed artifact chain | `src/workflow/team/__tests__/handoff-pure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/handoff-pure.test.ts` | 0 | 3 | 1.1 s |  |

## t5

Run at 2026-10-18T17:46:56.854Z on commit `bb85e188`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/team/__tests__/park-offer.test.ts: a held-by-other refusal carries offerPark when the actor owns a live run in any stage or has an uncommitted draft for the unit, never for an unowned run, and the workflow-step refusal text names the park command**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a held-by-other refusal carries offerPark when the actor owns a live run in any stage or has an uncommitted draft for the unit, never for an unowned run, and the workflow-step refusal text names the park command | `src/workflow/team/__tests__/park-offer.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/park-offer.test.ts` | 0 | 3 | 3.1 s |  |

## t6

Run at 2026-10-18T17:50:27.773Z on commit `d9cb210f`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/team/__tests__/handoff-park-plan.test.ts: parkPlan refuses when the actor holds the unit, for a Task, with no issue or holder, with nothing to park, and for a supplied token of another unit, actor or no owner, and assembles a run or draft-only checkpoint otherwise**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parkPlan refuses when the actor holds the unit, for a Task, with no issue or holder, with nothing to park, and for a supplied token of another unit, actor or no owner, and assembles a run or draft-only checkpoint otherwise | `src/workflow/team/__tests__/handoff-park-plan.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/handoff-park-plan.test.ts` | 0 | 1 | 2 s |  |
