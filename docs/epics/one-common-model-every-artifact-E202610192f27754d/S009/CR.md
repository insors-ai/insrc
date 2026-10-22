<!-- insrc:artifact CR-2f27754d4ad00b8e-s9 -->

# Code review: 2f27754d4ad00b8e:s9

⚠️ **WARN** — HIGH 0 · MED 5 · LOW 8 · model `claude:opus`

**Changed files:** 318

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 0 finding(s)

_No findings._

## conventions — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/__tests__/repo-convert.test.ts:1 | This new test file starts straight with imports. Most test files in src/daemon/__tests__ (for example artifact-feedback-handler-contract.test.ts) open with the copyright header and a docblock giving the test's purpose and its `Run:` line. This file has neither. |
| LOW | src/daemon/__tests__/repo-schema-entry-points.test.ts:1 | This new test file has no copyright header and no purpose/`Run:` docblock. Its sibling tests in src/daemon/__tests__ have both. |
| LOW | src/mcp/__tests__/repo-schema-guard.test.ts:1 | This new test file has no copyright header and no purpose/`Run:` docblock. Other src/mcp/__tests__ files, such as workflow-approve-dispatch.test.ts, have a docblock. |
| LOW | src/daemon/steps/review-step/__tests__/review-fixture.ts:1 | This new fixture module has a one-line doc comment but no copyright header. The touched source and test modules otherwise carry the header. |

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | docs/plans/core-data-model.md:467 | The promised smoke test is unverified. It has no entry in the test record: no daemon run and no `reported: { result, evidence }` mapping. The only evidence is prose in the s9 hand-offs section of the plans document. That section also counts 453 renames where the promised test names 444, and explains the difference as an earlier analyzer count. The document and the test name disagree, and nothing records which count is correct. |
| MED | docs/plans/core-data-model.md:467 | The promised smoke test is unverified. The test record has no reported result or evidence for the apply run on the copy. The hand-off prose says the run found no difference between the before and after delivery facts, but it does not say that every approved artifact kept its revision number. No pass state can be confirmed from the record. |
| LOW | src/cli/services/workflow.ts:232 | The graph grounding is hollow. Every changed entity is a file-level diff entry with empty testsReaching (the diff-mode fallback), so the graph cannot confirm coverage for any symbol. Coverage was judged from the test record instead: all 49 promised unit and integration tests are present and passing, and the new entry points (repo-convert, repo-schema-guard, the MCP refusal, persistReview through the findings phase) each have a named passing test. One gap remains. The TUI service paths for reject and ackStale through lifecycleOfArtifact, the refusal for a path outside a repository, and reviewFindings through readReviewRecordOf have no named test in the record. The command and tui tests only swap in async fakes for them, which leaves these paths unverified, not proven untested. |

## quality — 6 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/cli/services/workflow.ts:165 | attachApprovedDocuments now commits only `.insrc/artifacts/<headId>.json` for the attachment record. Recording an attachment on a unit head through the lifecycle can also append to that head's sidecar log (and feedback file). commitApprovedArtifacts' addHead helper commits those files, but this path drops them. The second check-in can therefore leave the head's `.log.jsonl` uncommitted and out of step with the committed head, which is the condition the head/log integrity check later refuses (log-ahead-of-head / head-ahead-of-log). Reuse addHead's file set (head json plus the sidecar log and feedback files) here. |
| MED | src/cli/services/workflow.ts:332 | reviewArtifact builds a fresh, uncached store with `createRepoLifecycle(repoPath).service`. approve, reject and ackStale in the same file go through `lifecycleOfArtifact` → `lifecycleFor(repoPath)`, which uses the cached registry entry keyed by realpath. Two ArtifactStore/LifecycleService instances over one repository in the same process can diverge on in-memory state. The review is also resolved by the passed `repoPath` rather than the repository that holds the artifact. Use the same `lifecycleOfArtifact(jsonPath)` path. |
| MED | src/daemon/steps/review-step/phases/findings.ts:100 | handleFindings now writes through persistReview to the lifecycle but does not first run `lifecycle.inspect(artifactId)` and refuse a head whose integrity is not ok. handleVerdicts does this check before recording, so a head that is out of step with its change log is refused on the verdicts path. Unless persistReview performs the check itself, the findings path can record a review on that same head. Hoist the integrity check into persistReview, or repeat it here. |
| LOW | src/cli/services/workflow.ts:143 | The unit-head selection expression `unitHeadId({ unit: approval.workflow === 'design.epic' \|\| typeof storyId !== 'string' ? 'epic' : 'story', epicHash, ...storyId })` is written out twice, in commitApprovedArtifacts and attachApprovedDocuments. Inside addHead, `sidecar.filesOf(id)` is computed twice per call. A small helper would remove the repetition. |
| LOW | src/daemon/repo-convert.ts:45 | The apply path builds a second `new History(createFileSidecarStore(repoPath))` next to the history that createRepoLifecycle already made for the cached `lifecycleFor` entry. syncPlanTasks in tasks-sync.ts does the same, giving two History instances over one sidecar. Exposing `history` on the registry entry would remove the duplicate construction. |
| LOW | src/daemon/steps/review-step/phases/verdicts.ts:47 | The doc comment is missing a period: "gives the service of the run's repository The head is checked". This is a matter of taste, not a risk. |

