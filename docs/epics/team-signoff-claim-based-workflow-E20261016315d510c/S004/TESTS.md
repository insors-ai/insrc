<!-- insrc:artifact TESTS-315d510cb28100e2-s4 -->

# Tests: 315d510cb28100e2 s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 53 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-18T05:01:29.552Z on commit `006b18f4`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/artifact-writer.test.ts: writeArtifact mints and keeps revisions, carries the whole tracker block, and rejects a value without meta**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | writeArtifact mints and keeps revisions, carries the whole tracker block, and rejects a value without meta | `src/workflow/__tests__/artifact-writer.test.ts` |

**unit: src/workflow/__tests__/artifact-writer.test.ts: readRevision reads 0 for bad values; patchTrackerMeta keeps every field, merges units and preserves the tracker kind**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readRevision reads 0 for bad values; patchTrackerMeta keeps every field, merges units and preserves the tracker kind | `src/workflow/__tests__/artifact-writer.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-writer.test.ts` | 0 | 2 | 0.8 s |  |

## t2

Run at 2026-10-18T05:07:10.187Z on commit `9e26cf99`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/gates-revision.test.ts: appendStoryToDefine mints a revision, approve reject and ack-stale leave revision and body unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | appendStoryToDefine mints a revision, approve reject and ack-stale leave revision and body unchanged | `src/workflow/__tests__/gates-revision.test.ts` |
| pass | approveArtifactByJsonPath sets meta.approvedAt | `src/workflow/__tests__/gates.test.ts` |
| pass | rejectArtifactByJsonPath sets meta.rejectedAt + reason | `src/workflow/__tests__/gates.test.ts` |
| pass | appendStoryToDefine appends the Story, re-renders md, and retains approval | `src/workflow/__tests__/scope-extend.test.ts` |

**unit: src/workflow/__tests__/meta-only-body-unchanged.test.ts: every meta-only writer leaves the body byte-identical and the revision unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every meta-only writer leaves the body byte-identical and the revision unchanged | `src/workflow/__tests__/meta-only-body-unchanged.test.ts` |
| pass | recordResolution persists a resolved choice to HLD meta + renders section | `src/workflow/__tests__/questions.test.ts` |
| pass | T13 the findings phase stamps the review and does not edit the design | `src/daemon/steps/review-step/__tests__/review-step-findings.test.ts` |
| pass | defaultStampDeps: writeParentRef patches meta.parentRef only, body byte-unchanged (k4) | `src/workflow/__tests__/bugfix-orchestration.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/review-step/__tests__/review-step-findings.test.ts` | 0 | 9 | 2.4 s |  |
| `src/workflow/__tests__/bugfix-orchestration.test.ts` | 0 | 23 | 1.7 s |  |
| `src/workflow/__tests__/gates-revision.test.ts` | 0 | 1 | 1.4 s |  |
| `src/workflow/__tests__/gates.test.ts` | 0 | 26 | 2.3 s |  |
| `src/workflow/__tests__/meta-only-body-unchanged.test.ts` | 0 | 1 | 1.7 s |  |
| `src/workflow/__tests__/questions.test.ts` | 0 | 7 | 1.5 s |  |
| `src/workflow/__tests__/scope-extend.test.ts` | 0 | 7 | 1.6 s |  |

## t3

Run at 2026-10-18T05:19:02.957Z on commit `c136b229`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review/__tests__/review-revision.test.ts: auto-fix review and apply resolution bump the revision, report-only review and accept override defer do not, through run-artifact and resolve**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | auto-fix review and apply resolution bump the revision, report-only review and accept override defer do not, through run-artifact and resolve | `src/workflow/review/__tests__/review-revision.test.ts` |
| pass | resolve apply mutates the artifact + records resolution; override clears the rest | `src/workflow/review/__tests__/resolve.test.ts` |

**integration: src/daemon/steps/review-step/__tests__/verdicts-revision.test.ts: the verdicts path bumps the revision only when auto-fixes change the body**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the verdicts path bumps the revision only when auto-fixes change the body | `src/daemon/steps/review-step/__tests__/verdicts-revision.test.ts` |
| pass | review-step drives the full loop and stamps meta.review with model=client | `src/daemon/steps/review-step/__tests__/review-step.test.ts` |

**integration: src/workflow/__tests__/draft-write-revision.test.ts: a first draft has revision 1 and a re-draft keeps the whole prior tracker block**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a first draft has revision 1 and a re-draft keeps the whole prior tracker block | `src/workflow/__tests__/draft-write-revision.test.ts` |
| pass | round-trip: append preserves meta + citations + other body keys byte-identical; only body.feedback grows | `src/workflow/artifacts/provenance/__tests__/writer.test.ts` |
| pass | persistStandaloneBuildRecord writes standalone:true json + the SAME md via the thin wrapper (byte-identical) | `src/workflow/runners/build/__tests__/build-record.test.ts` |
| pass | review decision: feedback saves the comments and changes no state, in any state of the artifact; with no comments it is refused | `src/workflow/__tests__/review-decision.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/review-step/__tests__/review-step.test.ts` | 0 | 4 | 1.2 s |  |
| `src/daemon/steps/review-step/__tests__/verdicts-revision.test.ts` | 0 | 1 | 1.2 s |  |
| `src/workflow/__tests__/draft-write-revision.test.ts` | 0 | 1 | 1.2 s |  |
| `src/workflow/__tests__/review-decision.test.ts` | 0 | 9 | 1.2 s |  |
| `src/workflow/artifacts/provenance/__tests__/writer.test.ts` | 0 | 5 | 1 s |  |
| `src/workflow/review/__tests__/resolve.test.ts` | 0 | 3 | 1.1 s |  |
| `src/workflow/review/__tests__/review-revision.test.ts` | 0 | 1 | 1.1 s |  |
| `src/workflow/runners/build/__tests__/build-record.test.ts` | 0 | 42 | 1.6 s |  |

## t4

Run at 2026-10-18T05:51:23.687Z on commit `d0efd264`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/__tests__/record-revision.test.ts: a second code review bumps the record revision through the default and the injected writer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a second code review bumps the record revision through the default and the injected writer | `src/workflow/code-review/__tests__/record-revision.test.ts` |
| pass | the opaque token resumes to next:done and persists a CR- record via runCodeReview (ac2/ac3) | `src/daemon/steps/code-review-step/__tests__/handler.test.ts` |

**unit: src/workflow/runners/build/__tests__/test-record-revision.test.ts: a second persisted mapping bumps the revision, a rollback restores bytes and revision, and a failed restore is reported as inconsistent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a second persisted mapping bumps the revision, a rollback restores bytes and revision, and a failed restore is reported as inconsistent | `src/workflow/runners/build/__tests__/test-record-revision.test.ts` |
| pass | the first write creates the record with one Task; a second Task is added; writing the first Task again replaces its entry only and keeps createdAt | `src/workflow/runners/build/__tests__/test-record.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/code-review-step/__tests__/handler.test.ts` | 0 | 30 | 0.6 s |  |
| `src/workflow/code-review/__tests__/record-revision.test.ts` | 0 | 1 | 0.7 s |  |
| `src/workflow/runners/build/__tests__/test-record-revision.test.ts` | 0 | 1 | 0.8 s |  |
| `src/workflow/runners/build/__tests__/test-record.test.ts` | 0 | 6 | 2.8 s |  |

## t5

Run at 2026-10-18T05:57:00.830Z on commit `6fbe3b89`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/artifact-write-inventory.test.ts: every writer file is inventoried, annotated and classified as the design says**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every writer file is inventoried, annotated and classified as the design says | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**unit: src/workflow/__tests__/artifact-write-inventory.test.ts: the detector flags raw, aliased and injected writers and accepts the positive controls**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the detector flags raw, aliased and injected writers and accepts the positive controls | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 2 | 4.7 s |  |

## t6

Run at 2026-10-18T06:05:22.964Z on commit `56da3f38`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/unit-issue.test.ts: ensureUnitIssue takes a unit and a port and returns a PortResult without a phase**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ensureUnitIssue takes a unit and a port and returns a PortResult without a phase | `src/workflow/tracker/__tests__/unit-issue.test.ts` |

**unit: src/workflow/tracker/__tests__/unit-issue.test.ts: resolveUnitIssueLocal resolves from records and legacy refs, reconciles locally and runs no command**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveUnitIssueLocal resolves from records and legacy refs, reconciles locally and runs no command | `src/workflow/tracker/__tests__/unit-issue.test.ts` |

**unit: src/workflow/tracker/__tests__/unit-issue.test.ts: a legacy LLD with only storyRef creates no second Story issue**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a legacy LLD with only storyRef creates no second Story issue | `src/workflow/tracker/__tests__/unit-issue.test.ts` |

**unit: src/workflow/tracker/__tests__/unit-issue.test.ts: team mode creates only when everything misses and reports phase before-create or create on failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team mode creates only when everything misses and reports phase before-create or create on failure | `src/workflow/tracker/__tests__/unit-issue.test.ts` |

**unit: src/workflow/tracker/__tests__/unit-issue.test.ts: a create that times out after the remote committed is adopted by its label on the next call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a create that times out after the remote committed is adopted by its label on the next call | `src/workflow/tracker/__tests__/unit-issue.test.ts` |

**unit: src/workflow/tracker/__tests__/unit-issue.test.ts: unitLabel gives the three forms, lower-cases ids, stays within 50 characters and rejects a malformed id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unitLabel gives the three forms, lower-cases ids, stays within 50 characters and rejects a malformed id | `src/workflow/tracker/__tests__/unit-issue.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/unit-issue.test.ts` | 0 | 6 | 0.5 s |  |

## t7

Run at 2026-10-18T06:07:19.480Z on commit `22cd5d6d`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/unit-extras.test.ts: runUnitExtras marks, skips, reports failures, retries only missing steps and repeats only after a marker failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runUnitExtras marks, skips, reports failures, retries only missing steps and repeats only after a marker failure | `src/workflow/tracker/__tests__/unit-extras.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/unit-extras.test.ts` | 0 | 1 | 1.1 s |  |

## t8

Run at 2026-10-18T06:16:32.006Z on commit `d4beed8c`. Tests check: **passed**. 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/approve-fallback-issues.test.ts: in team mode the three pushes adopt, force Task issues, fail on lookup or unreadable policy, and run extras once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | in team mode the three pushes adopt, force Task issues, fail on lookup or unreadable policy, and run extras once | `src/workflow/__tests__/approve-fallback-issues.test.ts` |

**integration: src/workflow/__tests__/approve-fallback-issues.test.ts: with no policy the three pushes behave exactly as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with no policy the three pushes behave exactly as before | `src/workflow/__tests__/approve-fallback-issues.test.ts` |

**integration: src/workflow/__tests__/tracker-auto.test.ts: the existing solo regression suite passes unedited**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | HLD approve creates the Epic issue, links docs, and writes nested meta.tracker | `src/workflow/__tests__/tracker-auto.test.ts` |
| pass | LLD approve creates the Story issue + aggregates into the Define; links the LLD doc | `src/workflow/__tests__/tracker-auto.test.ts` |
| pass | re-approving the HLD is idempotent (no second issue) | `src/workflow/__tests__/tracker-auto.test.ts` |
| pass | duplicate guard adopts an existing Epic issue instead of creating one | `src/workflow/__tests__/tracker-auto.test.ts` |
| pass | tracker disabled (no config) skips cleanly | `src/workflow/__tests__/tracker-auto.test.ts` |
| pass | missing required meta fields skip | `src/workflow/__tests__/tracker-auto.test.ts` |
| pass | R4: posts the review report as an issue comment when the artifact carries meta.review | `src/workflow/__tests__/tracker-auto.test.ts` |
| pass | the three push functions keep their gh sequence, best-effort behaviour and TrackerMeta through the adapter | `src/workflow/__tests__/tracker-auto.test.ts` |
| pass | a failing adoption lookup still leads to a create and does not throw | `src/workflow/__tests__/tracker-auto.test.ts` |
| pass | a failing create is reported as a failed result, not thrown | `src/workflow/__tests__/tracker-auto.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/approve-fallback-issues.test.ts` | 0 | 2 | 3.7 s |  |
| `src/workflow/__tests__/tracker-auto.test.ts` | 0 | 10 | 4.2 s |  |

## t9

Run at 2026-10-18T06:45:09.766Z on commit `d77a5d79`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/draft-issues.test.ts: not-applicable without a team policy, policy-unreadable and sc1 failure kinds map to messages**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ensureDraftIssues returns not-applicable without a team policy and maps policy and sc1 failures to messages | `src/workflow/__tests__/draft-issues.test.ts` |

**integration: src/workflow/__tests__/draft-issues.test.ts: Define, LLD and plan drafts create one issue per unit, a second write creates none, and failures stop and report**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Define, LLD and plan drafts create one issue per unit, a second write creates none, and failures stop and report | `src/workflow/__tests__/draft-issues.test.ts` |

**integration: src/workflow/__tests__/draft-issues.test.ts: outcomeKnown wording for a failed lookup and for a create that times out**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | outcomeKnown wording for a failed lookup and for a create that times out | `src/workflow/__tests__/draft-issues.test.ts` |

**integration: src/workflow/__tests__/redraft-preserves-tracker.test.ts: a re-draft keeps epicRef and storyRefs for sync, chain report and Task approval**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a re-draft keeps epicRef and storyRefs for sync, chain report and Task approval | `src/workflow/__tests__/redraft-preserves-tracker.test.ts` |

**integration: src/daemon/__tests__/draft-issues-synthesize.test.ts: the synthesize result and the whole workflow.run path carry readiness at every hop**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the synthesize result carries readiness for a team repo, a notice when not ready, and nothing without a policy | `src/daemon/__tests__/draft-issues-synthesize.test.ts` |
| pass | the whole workflow.run path carries readiness at every hop, including the emitted done frame | `src/daemon/__tests__/draft-issues-synthesize.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/draft-issues-synthesize.test.ts` | 0 | 2 | 2.5 s |  |
| `src/workflow/__tests__/draft-issues.test.ts` | 0 | 3 | 1.5 s |  |
| `src/workflow/__tests__/redraft-preserves-tracker.test.ts` | 0 | 1 | 1.6 s |  |

## t10

Run at 2026-10-18T06:47:16.556Z on commit `8430da33`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/cli/__tests__/run-readiness-notice.test.ts: runWorkflowStreaming preserves the fields and the run command prints the notice only when not ready**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runWorkflowStreaming preserves the fields and the run command prints the notice only when not ready | `src/cli/__tests__/run-readiness-notice.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/run-readiness-notice.test.ts` | 0 | 1 | 1.9 s |  |

## t11

Run at 2026-10-18T07:01:40.457Z on commit `f29c7197`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/unit-issue.test.ts: a lower-numbered issue is adopted and the call's own is commented on and closed, even when the close fails**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a lower-numbered issue is adopted and the call's own is commented on and closed, even when the close fails | `src/workflow/tracker/__tests__/unit-issue.test.ts` |

**unit: src/workflow/tracker/__tests__/unit-issue.test.ts: two simulated daemons that both create converge on the lowest issue**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two simulated daemons that both create converge on the lowest issue | `src/workflow/tracker/__tests__/unit-issue.test.ts` |

**unit: src/workflow/tracker/__tests__/unit-issue.test.ts: a failed findIssues listing keeps the recorded issue and a following call makes no tracker call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failed findIssues listing keeps the recorded issue and a following call makes no tracker call | `src/workflow/tracker/__tests__/unit-issue.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/unit-issue.test.ts` | 0 | 9 | 1.1 s |  |
