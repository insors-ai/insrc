<!-- insrc:artifact CR-315d510cb28100e2-s4 -->

# Code review: 315d510cb28100e2:s4

⛔ **BLOCK** — HIGH 50 · MED 12 · LOW 13 · model `codex:gpt-6-astra`

**Changed files:** 50

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/storage.ts:167 | Identical content writes retain the previous revision, including leaving revision absent on a legacy artifact. The approved writer must increment on every content write, including record regeneration. Documenting this as a build deviation does not amend the supplied approval. |
| MED | src/workflow/artifacts/provenance/writer.ts:104 | The provenance writer uses 'meta-only', so feedback writes do not mint a revision. Both the implementation and its inventory classification contradict the explicitly approved content classification. |
| MED | src/workflow/draft-issues.ts:119 | Readiness additionally requires isUnitSettled. Consequently, a recorded issue with a failed parent link triggers tracker loading and can become not-ready; a successful creation whose record cannot be saved also becomes not-ready. The approved behavior treats linking and recording failures as nonblocking, returns the known issue, and resolves local refs without tracker calls. |
| MED | src/workflow/tracker-auto.ts:537 | The team Task loop only ensures issues. It never runs a body-comment extra for each Task; the subsequent extras call posts a plan review to the Story instead. Task body comments and their per-Task completion marks are therefore missing. |
| MED | src/workflow/tracker/github.ts:309 | findIssues caps the listing at 1,000 and rejects results reaching that ceiling instead of completing pagination. At that size the duplicate check cannot select the lowest issue even when the tracker is available. |

## conventions — 13 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/tracker-auto.ts:65 | The added `extrasFailed?` property on the `created` result omits the required explicit `\| undefined`. |
| LOW | src/workflow/tracker-auto.ts:66 | The added `extrasFailed?` property on the `already-exists` result omits the required explicit `\| undefined`. |
| LOW | src/workflow/tracker/refs.ts:35 | The new optional `extrasDone` object property omits `\| undefined` after its object type, although its nested optional properties include it. |
| LOW | src/workflow/runners/build/test-record.ts:236 | The optional `restore` property must declare `((absPath: string, content: string) => void) \| undefined`. |
| LOW | src/workflow/__tests__/approve-fallback-issues.test.ts:41 | The optional `failFind` and `failComment` properties omit explicit `\| undefined`. |
| LOW | src/workflow/__tests__/approve-fallback-issues.test.ts:81 | The optional `pushTasks` property omits explicit `\| undefined`. |
| LOW | src/workflow/__tests__/draft-issues.test.ts:42 | The optional `failFind`, `failCreateAt`, and `loadFails` properties omit explicit `\| undefined`. |
| LOW | src/workflow/tracker/__tests__/unit-issue.test.ts:45 | The optional `failFind`, `failLabel`, `failCreate`, and `commitThenFail` properties omit explicit `\| undefined`. |
| LOW | src/workflow/tracker/__tests__/unit-issue.test.ts:47 | The optional `withListing`, `failList`, `failClose`, and `failLink` properties omit explicit `\| undefined`. |
| LOW | src/workflow/tracker/__tests__/unit-issue.test.ts:49 | The optional `staleFinds` property omits explicit `\| undefined`. |
| LOW | src/workflow/tracker/__tests__/unit-issue.test.ts:51 | The optional `racer` property omits explicit `\| undefined`. |
| LOW | src/workflow/tracker/__tests__/unit-issue.test.ts:53 | The optional `afterCreate` callback omits explicit `\| undefined` on its function type. |
| LOW | src/workflow/tracker/__tests__/unit-issue.test.ts:55 | The optional `shared` object property omits explicit `\| undefined`. |

## coverage — 53 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | docs/plans/team-workflow.md:179 | The supplied changed entity has empty testsReaching; under the required edge-based rule it is not exercised. |
| HIGH | src/cli/__tests__/run-readiness-notice.test.ts:1 | Empty testsReaching for this changed entity. Its test is recorded passing, but that does not supply a reaching edge. |
| HIGH | src/cli/command.ts:192 | Empty testsReaching: the changed notice-rendering behavior has no test-reaching edge. |
| HIGH | src/cli/services/workflow.ts:244 | Empty testsReaching: readiness and notice propagation has no test-reaching edge. |
| HIGH | src/daemon/__tests__/draft-issues-synthesize.test.ts:1 | Empty testsReaching for this changed entity. Its tests are recorded passing, but that does not supply a reaching edge. |
| HIGH | src/daemon/steps/code-review-step/handler.ts:132 | Empty testsReaching: the changed record-writer wiring has no test-reaching edge. |
| HIGH | src/daemon/steps/review-step/__tests__/verdicts-revision.test.ts:1 | Empty testsReaching for this changed entity. Its test is recorded passing, but that does not supply a reaching edge. |
| HIGH | src/daemon/steps/review-step/phases/findings.ts:91 | Empty testsReaching: the meta-only review write has no test-reaching edge. |
| HIGH | src/daemon/steps/review-step/phases/verdicts.ts:97 | Empty testsReaching: content versus meta-only revision handling has no test-reaching edge. |
| HIGH | src/daemon/steps/workflow-step/phases/synthesize.ts:86 | Empty testsReaching: draft revision writing and issue-readiness propagation have no test-reaching edge. |
| HIGH | src/daemon/steps/workflow-step/types.ts:120 | The supplied changed entity has empty testsReaching; no reaching test establishes coverage of the extended result contract. |
| HIGH | src/daemon/workflow-rpc.ts:341 | Empty testsReaching: draft issue handling and readiness delivery through the done frame have no test-reaching edge. |
| HIGH | src/mcp/daemon-stream.ts:73 | The supplied changed entity has empty testsReaching; no reaching test establishes coverage of the extended stream contract. |
| HIGH | src/workflow/__tests__/approve-fallback-issues.test.ts:1 | Empty testsReaching for this changed entity. Its tests are recorded passing, but that does not supply a reaching edge. |
| HIGH | src/workflow/__tests__/artifact-write-inventory.test.ts:1 | Empty testsReaching for this changed entity. Its tests are recorded passing, but that does not supply a reaching edge. |
| HIGH | src/workflow/__tests__/artifact-writer.test.ts:1 | Empty testsReaching for this changed entity. Its tests are recorded passing, but that does not supply a reaching edge. |
| HIGH | src/workflow/__tests__/draft-issues.test.ts:1 | Empty testsReaching for this changed entity. Recorded passing tests do not supply a reaching edge. |
| HIGH | src/workflow/__tests__/draft-write-revision.test.ts:1 | Empty testsReaching for this changed entity. Its test is recorded passing, but that does not supply a reaching edge. |
| HIGH | src/workflow/__tests__/gates-revision.test.ts:1 | Empty testsReaching for this changed entity. Its test is recorded passing, but that does not supply a reaching edge. |
| HIGH | src/workflow/__tests__/meta-only-body-unchanged.test.ts:1 | Empty testsReaching for this changed entity. Its test is recorded passing, but that does not supply a reaching edge. |
| HIGH | src/workflow/__tests__/redraft-preserves-tracker.test.ts:1 | Empty testsReaching for this changed entity. Its test is recorded passing, but that does not supply a reaching edge. |
| HIGH | src/workflow/artifact-write-inventory.ts:1 | Empty testsReaching: the new writer inventory and bypass detector have no test-reaching edge. |
| HIGH | src/workflow/artifacts/provenance/writer.ts:104 | Empty testsReaching: feedback persistence through the meta-only artifact writer has no test-reaching edge. |
| HIGH | src/workflow/bugfix/stamp.ts:87 | Empty testsReaching: parent-reference stamping through the meta-only writer has no test-reaching edge. |
| HIGH | src/workflow/code-review/__tests__/record-revision.test.ts:1 | Empty testsReaching for this changed entity. Its test is recorded passing, but that does not supply a reaching edge. |
| HIGH | src/workflow/code-review/runner.ts:155 | Empty testsReaching: the revision-minting code-review record writer has no test-reaching edge. |
| HIGH | src/workflow/draft-issues.ts:1 | Empty testsReaching: draft issue creation, readiness reporting and local reuse have no test-reaching edge. |
| HIGH | src/workflow/gates.ts:204 | Empty testsReaching: content revision minting and meta-only gate writes have no test-reaching edge. |
| HIGH | src/workflow/orchestrator.ts:2933 | Empty testsReaching: tracker push and sync persistence through the meta-only writer has no test-reaching edge. |
| HIGH | src/workflow/questions.ts:420 | Empty testsReaching: question-resolution persistence through the meta-only writer has no test-reaching edge. |
| HIGH | src/workflow/resolve-comment.ts:251 | Empty testsReaching: appending a comment as a content write has no test-reaching edge. |
| HIGH | src/workflow/review/__tests__/review-revision.test.ts:1 | Empty testsReaching for this changed entity. Its test is recorded passing, but that does not supply a reaching edge. |
| HIGH | src/workflow/review/resolve.ts:131 | Empty testsReaching: revision handling for apply versus accept, override and defer has no test-reaching edge. |
| HIGH | src/workflow/review/run-artifact.ts:120 | Empty testsReaching: revision handling for auto-fix versus report-only reviews has no test-reaching edge. |
| HIGH | src/workflow/runners/build/__tests__/build-record.test.ts:165 | Empty testsReaching for this changed entity. The test file is recorded passing, but that does not supply a reaching edge. |
| HIGH | src/workflow/runners/build/__tests__/test-record-revision.test.ts:1 | Empty testsReaching for this changed entity. Its test is recorded passing, but that does not supply a reaching edge. |
| HIGH | src/workflow/runners/build/__tests__/test-record.test.ts:63 | Empty testsReaching for this changed entity. The test file is recorded passing, but that does not supply a reaching edge. |
| HIGH | src/workflow/runners/build/standalone-record.ts:323 | Empty testsReaching: BUILD record persistence through the revision-minting writer has no test-reaching edge. |
| HIGH | src/workflow/runners/build/test-record.ts:264 | Empty testsReaching: TESTS revision writes, rollback and inconsistent-record errors have no test-reaching edge. |
| HIGH | src/workflow/storage.ts:90 | Empty testsReaching: artifact revision handling and tracker-block preservation have no test-reaching edge. |
| HIGH | src/workflow/tracker-auto.ts:337 | Empty testsReaching: team-mode approval routing, issue adoption and retryable extras have no test-reaching edge. |
| HIGH | src/workflow/tracker/__tests__/github-adapter.test.ts:195 | Empty testsReaching for this changed entity; the new listing test also has no supplied run result. |
| HIGH | src/workflow/tracker/__tests__/unit-extras.test.ts:1 | Empty testsReaching for this changed entity. Its test is recorded passing, but that does not supply a reaching edge. |
| HIGH | src/workflow/tracker/__tests__/unit-issue.test.ts:1 | Empty testsReaching for this changed entity. Recorded passing tests do not supply a reaching edge. |
| HIGH | src/workflow/tracker/github-adapter.ts:166 | Empty testsReaching: the new findIssues adapter operation has no test-reaching edge. |
| HIGH | src/workflow/tracker/github.ts:308 | Empty testsReaching: strict issue listing and truncation rejection have no test-reaching edge. |
| HIGH | src/workflow/tracker/port.ts:78 | The supplied changed entity has empty testsReaching; no reaching test establishes coverage of the findIssues contract. |
| HIGH | src/workflow/tracker/refs.ts:125 | Empty testsReaching: unit-record merging, tracker-kind preservation and meta-only persistence have no test-reaching edge. |
| HIGH | src/workflow/tracker/unit-issue.ts:1 | Empty testsReaching: unit issue resolution, creation, duplicate reconciliation and extras execution have no test-reaching edge. |
| HIGH | src/workflow/types.ts:345 | The supplied changed entity has empty testsReaching; no reaching test establishes coverage of the revision metadata contract. |
| MED | src/workflow/tracker/__tests__/github-adapter.test.ts:195 | The findIssues listing test is present but failing/unverified: this file has no supplied test-record result, so its pass-state is unverified. |
| MED | src/workflow/__tests__/draft-issues.test.ts:219 | This test is present but failing/unverified: its title is absent from the supplied latest-run results, so its pass-state is unverified. |
| MED | src/workflow/tracker/__tests__/unit-issue.test.ts:389 | This test is present but failing/unverified: its title is absent from the supplied latest-run results, so its pass-state is unverified. |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/tracker/unit-issue.ts:291 | Correctness: after a Story or Task create commits remotely but times out, the retry adopts it by label and immediately records it as settled. This branch never links the adopted issue to its parent or records a pending link, so the child can remain permanently unlinked while readiness reports success. |
| MED | src/workflow/artifact-write-inventory.ts:239 | Avoidable complexity: inventory validation combines an AST writer detector with separate regex-based function and argument parsing. writeKindsIn searches through the next semicolon rather than inspecting the third argument, so a 'content' literal in artifact data or a comment can satisfy the check for a meta-only call. Reuse AST traversal for function boundaries and write-kind arguments to avoid false validation. |
| MED | src/workflow/tracker/refs.ts:125 | Duplication: patchTrackerMeta independently implements the same tracker-block spread and per-unit merge as carryTracker. These two paths govern preservation of issue references during patches and replacements; changes to merge semantics can easily reach only one path. Share the merge implementation while preserving the adapter default. |
| MED | src/workflow/tracker/unit-issue.ts:399 | Unhandled error path: buildSpec only catches reading/parsing the plan, then calls .find and t.id.toLowerCase on unchecked JSON. A malformed tasks value or missing task ID throws through ensureUnitIssueDetailed and ensureUnitIssue instead of returning their declared failure result. Validate the parsed task structure or convert construction errors into a before-create failure. |

