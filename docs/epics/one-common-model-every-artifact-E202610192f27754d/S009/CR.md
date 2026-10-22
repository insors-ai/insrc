<!-- insrc:artifact CR-2f27754d4ad00b8e-s9 -->

# Code review: 2f27754d4ad00b8e:s9

⛔ **BLOCK** — HIGH 1 · MED 5 · LOW 6 · model `claude:opus`

**Changed files:** 318

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 0 finding(s)

_No findings._

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/repo-convert.ts:27 | `RepoConvertParams` declares `readonly repo?: string;` and `readonly mode?: ConversionMode;` without the `\| undefined` that the strict-optional rule requires for optional properties under exactOptionalPropertyTypes. This copies the older `TrackerAttachParams` shape, but the documented rule asks for `repo?: string \| undefined` and `mode?: ConversionMode \| undefined`. |
| LOW | src/daemon/steps/review-step/__tests__/review-fixture.ts:25 | The `head` parameter type of `writeDesign` declares `citations?: unknown[]` without `\| undefined`, which breaks the documented rule that optional properties are declared `\| undefined`. |

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/cli/services/workflow.ts:143 | Changed CLI approval behaviour has no tests reaching it, and no test file in the test record exercises it. The changes: headFiles / unitHeadOf add the head json plus its .log.jsonl and feedback sidecars to the check-in and attachment commits; lifecycleOfArtifact routes approve, reject and ackStale through the registry lifecycle; reviewFindings reads readReviewRecordOf. The only CLI tests in the diff (src/cli/__tests__/command.test.ts, src/cli/__tests__/tui.test.ts) just turn their stubs async and are not in the test record. This is the round-1 code-review fix ('the attachment commit keeps the head's log and feedback files, the CLI review uses the registry lifecycle'), and no passing test pins it. |
| MED | src/daemon/steps/review-step/phases/verdicts.ts:93 | The coverage grounding is hollow. Every changed symbol is a file-level diff entry with empty callers, callees and testsReaching, so no symbol-level coverage can be read from it. Most changed production files have a named promised test that is present and passing in the record. For example: repo-convert.ts by repo-convert.test.ts; repo-schema-guard.ts and the guarded entry points by repo-schema-entry-points.test.ts and repo-schema-guard.test.ts; review-step findings.ts by review-step-findings.test.ts; the convert/* modules by the convert-*.test.ts suite. Many changed test files are not listed in the test record, so their pass-state is unverified (present but unverified). These include review-step.test.ts, verdicts-lifecycle.test.ts, verdicts-revision.test.ts, review-step-routing.test.ts, gate-review-fix.test.ts, build-step.test.ts, build-start.test.ts, validate-task-round.test.ts, amendments-e2e.test.ts, define-extend-e2e.test.ts, tracker-e2e.test.ts, tracker-tasks-coarse.test.ts, approve-attach.test.ts, workflow-review-rpc.test.ts, code-review-rpc.test.ts and lifecycle-wiring.test.ts. They exercise the persistReview rewiring of verdicts.ts and the mandatory-lifecycle changes in code-review-rpc.ts, workflow-review-rpc.ts and tasks-sync.ts. Run the full sweep to confirm them. |
| MED | docs/plans/core-data-model.md:467 | The promised smoke test 'preview on a copy of this repository lists the expected 444 renames and 56 flat amendments' is present but unverified. The test record has no reported result for it. The plans document describes a smoke run that found 453 renames, not 444, and explains the difference as a later direct count. The 56 flat amendments match. Record the smoke result through the gate (reported: { result, evidence }) so its pass-state is on the record, and note the corrected count. |
| MED | docs/plans/core-data-model.md:467 | The promised smoke test 'apply on the copy reports no unexplained difference and every approved artifact keeps its revision number' is present but unverified. The test record has no reported result for it. The plans document states that the smoke apply found 0 problems and no difference in delivery facts, but it does not say that approved artifacts kept their revision numbers. The gate has no evidence for either claim. |

## quality — 6 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/steps/review-step/phases/verdicts.ts:103 | The `headConflict(state.jsonPath)` check was removed, so the head is now checked only through `lifecycle.inspect`. When `inspect` returns undefined (the head is not known to the lifecycle store, for example a design file outside the store or one that was never registered), nothing checks it at all: a head whose stored hash no longer matches its content, or whose change log is ahead of it, now goes on to `persistReview`. Before this change it was refused. Either refuse when `seen === undefined` or keep the head-only conflict check as a fallback. |
| MED | src/daemon/steps/review-step/phases/findings.ts:92 | The findings phase now calls `lifecycle.inspect`, which also finishes any staged journal write, BEFORE the same-party check `authorPartyOf(...) === 'controller'`. A call that is about to be refused with SamePartyReviewError can therefore still change the repository by completing a staged write. Check the author party first, then inspect. |
| LOW | src/daemon/steps/review-step/phases/findings.ts:40 | findings.ts and verdicts.ts repeat the same pre-persist sequence: the REVIEWER and CONTROLLER Actor constants, the artifactId derived with basename(...).replace(/\.json$/, ''), the inspect-and-throw-LifecycleConflictError guard, and the same-party refusal. Move this into one helper (or into persistReview) so the two phases cannot drift apart. |
| LOW | src/daemon/repo-convert.ts:46 | The apply path builds its own `new History(createFileSidecarStore(repoPath))` alongside the cached registry entry, which has its own History made by `createRepoLifecycle` but does not expose it. The conversion's TaskSets and the registry's FeedbackService then work through two separate History instances over the same sidecar files, so any state or caching inside History can disagree. src/daemon/tasks-sync.ts builds a second one the same way. Expose `history` on the RepoLifecycle entry and reuse it. |
| LOW | src/cli/services/workflow.ts:138 | `addHead(basename(approval.path).replace(/\.json$/, ''))` assumes `approval.path` is the json head path. If it is ever the markdown path (for example `LLD.md`), the derived id is wrong and `headFiles` quietly filters every file out because none exists, so the approved head's log and feedback files are left out of the check-in commit with no error. Derive the id from `jsonPath` (which `approve` already has) or check the suffix. |
| LOW | src/daemon/tasks-sync.ts:45 | With the legacy approvedAt bridge removed, the imports it used (readFileSync, and APPROVAL_ACTOR if nothing else uses it) may now be unused. Check them and remove any that are. |

