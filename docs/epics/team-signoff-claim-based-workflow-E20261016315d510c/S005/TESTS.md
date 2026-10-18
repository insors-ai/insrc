<!-- insrc:artifact TESTS-315d510cb28100e2-s5 -->

# Tests: 315d510cb28100e2 s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 21 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-18T14:24:07.223Z on commit `ecac83d1`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: addAssignee adds without removing, returns the assignees read back and reports a failed step without a retry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | addAssignee adds without removing, returns the assignees read back and reports a failed step without a retry | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/github-adapter.test.ts` | 0 | 19 | 1.1 s |  |

## t2

Run at 2026-10-18T14:28:59.399Z on commit `af5faa3e`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/gate.test.ts: teamGate allows with no tracker call when there is no policy, teamMode is false or claimsEnforced is false**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | teamGate allows with no tracker call when there is no policy, teamMode is false or claimsEnforced is false | `src/workflow/team/__tests__/gate.test.ts` |

**unit: src/workflow/team/__tests__/gate.test.ts: teamGate allows an unassigned stage for author and build and adds the actor through addAssignee (implicitClaim true), and takes no claim for approve-local or applying a finding**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | teamGate allows an unassigned stage for author and build and adds the actor through addAssignee (implicitClaim true), and takes no claim for approve-local or applying a finding | `src/workflow/team/__tests__/gate.test.ts` |

**unit: src/workflow/team/__tests__/gate.test.ts: teamGate recognises a developer assigned directly in the tracker as the holder with no separate claim, comparing logins case-insensitively**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | teamGate recognises a developer assigned directly in the tracker as the holder with no separate claim, comparing logins case-insensitively | `src/workflow/team/__tests__/gate.test.ts` |

**unit: src/workflow/team/__tests__/gate.test.ts: teamGate returns held-by-other naming the holder for author, build, approve-local, apply and open-signoff, whatever the holder's idle time**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | teamGate returns held-by-other naming the holder for author, build, approve-local, apply and open-signoff, whatever the holder's idle time | `src/workflow/team/__tests__/gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/gate.test.ts` | 0 | 4 | 1.2 s |  |

## t3

Run at 2026-10-18T14:32:06.718Z on commit `cf59ff21`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/gate.test.ts: the first author turn of a stage with no issue and no artifact is allowed as an explicit exception and any other action on a stage with no issue is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the first author turn of a stage with no issue and no artifact is allowed as an explicit exception and any other action on a stage with no issue is refused | `src/workflow/team/__tests__/gate.test.ts` |

**unit: src/workflow/team/__tests__/gate.test.ts: the registered completion hook is consulted for author and build on a next stage and for open-signoff, revise and release, a release called by the hook does not consult it again, and with none registered the gate behaves as continue (a hook-contract test; the completion-releases-the-claim integration test belongs to s7)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the registered completion hook is consulted for author and build on a next stage and for open-signoff, revise and release, a release called by the hook does not consult it again, and with none registered the gate behaves as continue (a hook-contract test; the completion-releases-the-claim integration test belongs to s7) | `src/workflow/team/__tests__/gate.test.ts` |

**unit: src/workflow/team/__tests__/gate.test.ts: each port failure kind, several assignees, an unreadable policy, a missing issue and a throwing completion hook map to refused or no-issue with the reason and never throw**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each port failure kind, several assignees, an unreadable policy, a missing issue and a throwing completion hook map to refused or no-issue with the reason and never throw | `src/workflow/team/__tests__/gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/gate.test.ts` | 0 | 7 | 3 s |  |

## t4

Run at 2026-10-18T14:36:33.618Z on commit `c5e1e766`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/gate.test.ts: claim takes only an unassigned stage, never removes another assignee, and reports a contested claim or a failed re-read as refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | claim takes only an unassigned stage, never removes another assignee, and reports a contested claim or a failed re-read as refused | `src/workflow/team/__tests__/gate.test.ts` |

**unit: src/workflow/team/__tests__/gate.test.ts: release clears the assignees for the holder and for an administrator, including a contested claim, and refuses anyone else without calling setAssignee**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | release clears the assignees for the holder and for an administrator, including a contested claim, and refuses anyone else without calling setAssignee | `src/workflow/team/__tests__/gate.test.ts` |

**unit: src/workflow/team/__tests__/review-fix-decision.test.ts: reviewFixDecision returns apply-auto-fixes for the holder or when no gate applies and report-only for a non-holder or a failed read**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reviewFixDecision returns apply-auto-fixes for the holder or when no gate applies and report-only for a non-holder or a failed read | `src/workflow/team/__tests__/review-fix-decision.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/gate.test.ts` | 0 | 9 | 1 s |  |
| `src/workflow/team/__tests__/review-fix-decision.test.ts` | 0 | 1 | 0.9 s |  |

## t5

Run at 2026-10-18T14:48:57.040Z on commit `68ff6426`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/gate-approve.test.ts: approveArtifactByJsonPath throws TeamGateRefusedError for a non-holder before any review check or stamp, and approveWorkflowTarget authorizes a BUILD target before ensureBuildRecordOnCompletion so a refused target creates no BUILD record, puts it in skipped[] with the reason and approves the others**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approveArtifactByJsonPath throws TeamGateRefusedError for a non-holder before any review check or stamp, and approveWorkflowTarget authorizes a BUILD target before ensureBuildRecordOnCompletion so a refused target creates no BUILD record, puts it in skipped[] with the reason and approves the others | `src/workflow/__tests__/gate-approve.test.ts` |
| pass | the terminal approve command prints the refusal naming the holder, formatted beside the review-block message | `src/cli/__tests__/gate-refusal-output.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/gate-refusal-output.test.ts` | 0 | 1 | 1.1 s |  |
| `src/workflow/__tests__/gate-approve.test.ts` | 0 | 1 | 1.2 s |  |

## t6

Run at 2026-10-18T14:53:33.952Z on commit `404fb77f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/review/__tests__/gate-resolve-finding.test.ts: resolveReviewFinding with action apply by a non-holder throws TeamGateRefusedError before writing the markdown or the artifact, while accept, override and defer still run**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveReviewFinding with action apply by a non-holder throws TeamGateRefusedError before writing the markdown or the artifact, while accept, override and defer still run | `src/workflow/review/__tests__/gate-resolve-finding.test.ts` |
| pass | the terminal resolve command prints the refusal naming the holder when applying a finding is refused | `src/cli/__tests__/gate-refusal-output.test.ts` |

**integration: src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts: a review of a stage held by someone else runs and reports findings, applies no auto-fix through verdicts.ts or run-artifact.ts, and leaves the revision unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a review of a stage held by someone else runs and reports findings, applies no auto-fix through verdicts.ts or run-artifact.ts, and leaves the revision unchanged | `src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/gate-refusal-output.test.ts` | 0 | 2 | 1.1 s |  |
| `src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts` | 0 | 1 | 1.3 s |  |
| `src/workflow/review/__tests__/gate-resolve-finding.test.ts` | 0 | 1 | 1.2 s |  |

## t7

Run at 2026-10-18T15:04:41.660Z on commit `bbcf17b1`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts: workflow-step start, plan, step and synthesize on a stage held by someone else are refused naming the holder before any state changes, the first author turn with no issue is let through, and a repo without a policy behaves as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | workflow-step start, plan, step and synthesize on a stage held by someone else are refused naming the holder before any state changes, the first author turn with no issue is let through, and a repo without a policy behaves as before | `src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts` |
| pass | the team gate comes before the upstream-question gate: a held stage whose upstream has open questions is refused naming the holder | `src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts` |
| pass | plan: synthesize asks the team gate again after finalizing, so a claim that moved meanwhile refuses the write | `src/daemon/steps/workflow-step/__tests__/plan-e2e.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts` | 0 | 2 | 1.7 s |  |
| `src/daemon/steps/workflow-step/__tests__/plan-e2e.test.ts` | 0 | 5 | 1.7 s |  |

## t8

Run at 2026-10-18T15:08:22.267Z on commit `847e35d8`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts: build implement and validate on a stage held by someone else are refused naming the holder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | build implement and validate on a stage held by someone else are refused naming the holder | `src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts` |
| pass | build with no policy behaves as before and never touches the tracker | `src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts` | 0 | 2 | 4.7 s |  |
