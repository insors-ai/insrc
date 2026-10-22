<!-- insrc:artifact CR-2f27754d4ad00b8e-s9 -->

# Code review: 2f27754d4ad00b8e:s9

⚠️ **WARN** — HIGH 0 · MED 6 · LOW 11 · model `claude:opus`

**Changed files:** 318

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/repo-convert.ts:43 | A preview (the default mode of repo.convert) calls `planConversion(repoPath, { rules: CONVERSION_RULES })` without a tracker port, even when the repository has a GitHub tracker configured. The tracker is opened only on the apply path. So the preview never lists the pre-s8 'Attached ...' comments in `legacyAttachComments`, and it never plans the optional relabel either. The design makes preview the step where the user reads the legacy attach comments before applying. The s9 hand-off (docs/plans/core-data-model.md) also tells the owner to 'check the preview on the real repository with the tracker configured', but the preview as built cannot show them. |

## conventions — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/repo-convert.ts:27 | RepoConvertParams declares `readonly repo?: string;` and `readonly mode?: ConversionMode;` (line 28) without the explicit `\| undefined` that the documented exactOptionalPropertyTypes rule asks for. The neighbouring TrackerAttachParams uses the same short form, so the local code drifts here too, but the documented rule is the baseline. |
| LOW | src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts:24 | `approveJson` (helpers/approve.js) and `approvalStateOf` (approval-view.js) are imported but never used. A grep finds only the import line for each. They look like leftovers from a mechanical import swap; the other changed tests import only the helpers they call. |
| LOW | src/daemon/steps/build-step/__tests__/comment-sync-callers.test.ts:21 | `approveJson` and `approvalStateOf` are imported but never used; each name appears only on its import line. This is the same leftover import block as in gate-call-sites.test.ts. |
| LOW | src/daemon/steps/build-step/__tests__/validate-task-round.test.ts:20 | `approveJson` and `approvalStateOf` are imported but never used; each name appears only on its import line. The same file also has a spacing slip, `lldEffectiveHash: 'x'},`, where the surrounding literals use `'x' },`. |
| LOW | src/daemon/steps/review-step/phases/findings.ts:33 | The value import of `LifecycleConflictError` from artifact-core/types.js comes after the local `../state-store.js` and `../types.js` imports, apart from the other workflow imports at the top. Line 23 already imports `type { Actor }` from the same module. In verdicts.ts, the matching phase, both imports from artifact-core/types.js sit together in the workflow import group. |

## coverage — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/convert/run.ts:1 | The coverage grounding has no graph data. Every changed entry (about 250) is a diff-level 'file' entity with empty callers, callees and testsReaching, and most have no hunk text. So empty testsReaching here says nothing about whether the code is tested; it only shows the graph was not indexed for this change set. I judged coverage from the test record instead. All 49 promised unit and integration tests are listed there as passing, across 46 build tasks. I did not raise one HIGH per file, because that would turn a gap in the grounding into invented findings. Re-run this review on a fresh index to get real per-symbol reach. |
| MED | docs/plans/core-data-model.md:466 | Promised smoke test 'smoke: preview on a copy of this repository lists the expected 444 renames and 56 flat amendments' is present but unverified. It is a smoke test with no run result and no reported { result, evidence } entry in the test record. The s9 hand-off text also says the smoke preview found 453 heads with the old story id form, not the 444 the plan's test name expects. Its stated assertion (444) therefore does not match the recorded outcome. Record the smoke result with evidence and update the expected count, or explain the difference in the test record. |
| MED | docs/plans/core-data-model.md:466 | Promised smoke test 'smoke: apply on the copy reports no unexplained difference and every approved artifact keeps its revision number' is present but unverified. The plans document describes this outcome in prose, but the test record has no reported result or evidence for it. |
| LOW | src/cli/services/workflow.ts:142 | The code-review round-1 fix to the CLI approve flow has no confirmed pass-state. It adds headFiles/unitHeadOf: the check-in and attachment commits now include the head's .log.jsonl and feedback files and the EPIC or STORY unit head. src/workflow/__tests__/approve-attach.test.ts was changed but is not in the test record. task-set-approve.test.ts (passing) exercises the cli approve flow, but nothing recorded shows the attachment commit's file set. |
| LOW | src/daemon/steps/build-step/__tests__/validate-task-round.test.ts:106 | This test now asserts a behaviour change: the BUILD record no longer answers taskBuildPassed for a Task with no head. Many other changed test files are also missing from the test record, including build-step.test.ts, build-start.test.ts, review-step-routing.test.ts, review-step.test.ts, verdicts-lifecycle.test.ts, amendments-e2e.test.ts, define-extend-e2e.test.ts and tracker-tasks-coarse.test.ts. Their pass-state is unverified in this record, even though the end-of-story sweep commit suggests they were run. |

## quality — 6 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/repo-schema-guard.ts:40 | repoSchemaRefusalOfInput reads only `input.repo` and otherwise falls back to INSRC_REPO. The later phases of the review, workflow and analyze steps (claims / verdicts / findings / plan / step / synthesize) carry only a `state` token and no `repo`. On those phases the gate checks the INSRC_REPO repository, not the repository the run's state belongs to. If the daemon's INSRC_REPO names a different repository than the one the run started on, two things can happen: a converted repository's later phase is refused, or an unconverted repository passes the gate after `start`. The guard should resolve the repo from the decoded state, or apply only where `repo` is present. |
| MED | src/cli/services/workflow.ts:140 | `addHead(basename(approval.path).replace(/\.json$/, ''))` takes the head id from approval.path by stripping only a `.json` suffix. If approval.path is ever the rendered `.md` path (for example `docs/epics/.../LLD.md`), the id comes out as `LLD.md`. headFiles then looks for `.insrc/artifacts/LLD.md.json`, and its existsSync filter drops it without any error. The approved head's log and feedback files are then left out of the check-in commit, and nothing reports it. Derive the id from jsonPathForMd(approval.path), or assert that the file exists. |
| LOW | src/daemon/steps/review-step/phases/findings.ts:91 | The pre-read integrity check (inspect → `!integrity.ok` → throw LifecycleConflictError) and the REVIEWER/CONTROLLER actor constants are copied verbatim from the verdicts phase. They could live with persistReview or in a shared helper, so that the two phases cannot drift apart. |
| LOW | src/daemon/steps/review-step/phases/verdicts.ts:103 | The headConflict(jsonPath) check was removed, so a head is now refused only when lifecycle.inspect returns a result whose integrity fails. When inspect returns undefined (a head with no lifecycle record), nothing checks whether the head's stored hash matches its content any more. Before this change, headConflict still guarded that path. |
| LOW | src/daemon/repo-convert.ts:46 | In apply mode the handler builds a second `new History(createFileSidecarStore(repoPath))` next to the History that lifecycleFor(repoPath) already built through createRepoLifecycle. The handler also passes the raw repoPath, while the registry stores a realpath. TaskSets and the conversion therefore get a History instance that the registry's store and FeedbackService do not share. Reuse the registry entry's history instead. |
| LOW | src/daemon/repo-convert.ts:36 | `params` is cast to RepoConvertParams without checking types. A non-string `repo` (for example a number) reaches `.length` and existsSync and fails with a confusing message or a TypeError, instead of the handler's own 'repo is required' error. |

