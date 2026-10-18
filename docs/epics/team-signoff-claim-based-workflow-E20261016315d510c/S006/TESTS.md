<!-- insrc:artifact TESTS-315d510cb28100e2-s6 -->

# Tests: 315d510cb28100e2 s6

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 20 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

Run at 2026-10-18T17:58:42.749Z on commit `dbaaaf5c`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/team/__tests__/handoff-park-plan.test.ts: parkPlan refuses when the actor holds the unit, for a Task, with no issue or holder, with nothing to park, and for a supplied token of another unit, actor or no owner, and assembles a run or draft-only checkpoint otherwise**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parkPlan refuses when the actor holds the unit, for a Task, with no issue or holder, with nothing to park, and for a supplied token of another unit, actor or no owner, and assembles a run or draft-only checkpoint otherwise | `src/workflow/team/__tests__/handoff-park-plan.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/handoff-park-plan.test.ts` | 0 | 1 | 1.9 s |  |

## t7

Run at 2026-10-18T18:10:25.283Z on commit `2645648d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/team/__tests__/handoff-park.test.ts: parking commits the draft and checkpoint to the handoff branch, pushes it, notes the branch on the issue through issueOps.comment and leaves the user's branch, index and working tree untouched**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parking commits the draft and checkpoint to the handoff branch, pushes it, notes the branch on the issue through issueOps.comment and leaves the user's branch, index and working tree untouched | `src/workflow/team/__tests__/handoff-park.test.ts` |

**integration: src/workflow/team/__tests__/handoff-park.test.ts: a git failure cleans up the worktree and local branch, a failed note returns noted false, a rejected push says someone else parked first, and a second park commits on top**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a git failure cleans up the worktree and local branch, a failed note returns noted false, a rejected push says someone else parked first, and a second park commits on top | `src/workflow/team/__tests__/handoff-park.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/handoff-park.test.ts` | 0 | 2 | 5.2 s |  |

## t8

Run at 2026-10-18T18:18:11.224Z on commit `2ff7cd6b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/team/__tests__/handoff-resume-check.test.ts: resumeCheck refuses an unregistered receiving path and a clone of a different repository before restoring anything, and refuses a moved upstream including the effective HLD and the Define**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resumeCheck refuses an unregistered receiving path and a clone of a different repository before restoring anything, and refuses a moved upstream including the effective HLD and the Define | `src/workflow/team/__tests__/handoff-resume-check.test.ts` |

**integration: src/workflow/team/__tests__/handoff-resume-check.test.ts: a missing branch returns restart, a network failure is refused, a committed LLD with no PLAN resumes as plan, both committed is nothing-to-resume, and an unknown schema, unit mismatch, outside path and dirty file are each refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a missing branch returns restart, a network failure is refused, a committed LLD with no PLAN resumes as plan, both committed is nothing-to-resume, and an unknown schema, unit mismatch, outside path and dirty file are each refused | `src/workflow/team/__tests__/handoff-resume-check.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/handoff-resume-check.test.ts` | 0 | 2 | 4.5 s |  |

## t9

Run at 2026-10-18T19:25:08.076Z on commit `156fd131`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/team/__tests__/handoff-resume.test.ts: a new assignee on a clone at another absolute path resumes a run parked before the plan, and one parked mid-steps at its next step with its earlier step outputs, rebound to that clone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a new assignee on a clone at another absolute path resumes a run parked before the plan, and one parked mid-steps at its next step with its earlier step outputs, rebound to that clone | `src/workflow/team/__tests__/handoff-resume.test.ts` |

**integration: src/workflow/team/__tests__/handoff-resume.test.ts: a draft-only checkpoint restores the draft and returns restart, and a restore that fails part way leaves the working tree as it was and saves no state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a draft-only checkpoint restores the draft and returns restart, and a restore that fails part way leaves the working tree as it was and saves no state | `src/workflow/team/__tests__/handoff-resume.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/handoff-resume.test.ts` | 0 | 2 | 3.2 s |  |

## t10

Run at 2026-10-18T19:41:34.369Z on commit `e4928c76`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/steps/workflow-step/__tests__/handoff-phases.test.ts: the park and resume phases and the team.park and team.resume operations reach the run store, return the park result or the next turn, and map a gate refusal to team-gate-refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the park and resume phases and the team.park and team.resume operations reach the run store, return the park result or the next turn, and map a gate refusal to team-gate-refused | `src/daemon/steps/workflow-step/__tests__/handoff-phases.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/workflow-step/__tests__/handoff-phases.test.ts` | 0 | 1 | 0.9 s |  |

## t11

Run at 2026-10-18T19:45:10.509Z on commit `45667a0c`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/mcp/__tests__/park-resume-phases.test.ts: an MCP call with phase park and with phase resume passes validation and reaches the workflow-step handler, and the schema registry and the tool-surface fixture list both phases**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an MCP call with phase park and with phase resume passes validation and reaches the workflow-step handler, and the schema registry and the tool-surface fixture list both phases | `src/mcp/__tests__/park-resume-phases.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/park-resume-phases.test.ts` | 0 | 1 | 2.8 s |  |

## t12

Run at 2026-10-18T19:48:13.964Z on commit `3a897e46`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/cli/__tests__/team-park-resume.test.ts: team park and team resume parse the unit and --workflow, print the offer, the outcome or the holder, and print the usage line for bad arguments**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team park and team resume parse the unit and --workflow, print the offer, the outcome or the holder, and print the usage line for bad arguments | `src/cli/__tests__/team-park-resume.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/team-park-resume.test.ts` | 0 | 1 | 1.2 s |  |

## t13

Run at 2026-10-18T19:50:02.281Z on commit `9314fa8e`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/gate-guarded-entry-points.test.ts: the inventory of guarded entry points (daemon step phases, approveArtifactByJsonPath, approveWorkflowTarget, resolveReviewFinding apply) is complete, and the analyze and code-review steps are not on it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the inventory of guarded entry points (daemon step phases, approveArtifactByJsonPath, approveWorkflowTarget, resolveReviewFinding apply) is complete, and the analyze and code-review steps are not on it | `src/workflow/__tests__/gate-guarded-entry-points.test.ts` |

**integration: src/workflow/team/__tests__/handoff-e2e.test.ts: from a reassignment refusal with an offer through park to resume on a second clone, and after a lost machine with no parked branch only the stage that has no artifact restarts, a committed LLD leaving the plan to do**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | from a reassignment refusal with an offer through park to resume on a second clone, and after a lost machine with no parked branch only the stage that has no artifact restarts, a committed LLD leaving the plan to do | `src/workflow/team/__tests__/handoff-e2e.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/gate-guarded-entry-points.test.ts` | 0 | 1 | 1.6 s |  |
| `src/workflow/team/__tests__/handoff-e2e.test.ts` | 0 | 1 | 2.1 s |  |
