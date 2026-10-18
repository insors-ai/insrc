<!-- insrc:artifact CR-315d510cb28100e2-s5 -->

# Code review: 315d510cb28100e2:s5

⛔ **BLOCK** — HIGH 37 · MED 0 · LOW 10 · model `codex:gpt-6-astra`

**Changed files:** 35

## adherence — 0 finding(s)

_No findings._

## conventions — 10 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts:unknown | errorOf declares optional properties code and message without explicit `\| undefined`. Line numbers were not supplied. |
| LOW | src/daemon/steps/build-step/phases/validate.ts:unknown | runValidateSession declares nested optional properties sizeClass and triageRationale without explicit `\| undefined`. Line numbers were not supplied. |
| LOW | src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts:unknown | parse declares the optional return property error without explicit `\| undefined`. Line numbers were not supplied. |
| LOW | src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts:unknown | start declares the optional return property error without explicit `\| undefined`. Line numbers were not supplied. |
| LOW | src/daemon/workflow-rpc.ts:unknown | formatFailure declares optional properties message and details without explicit `\| undefined`. Line numbers were not supplied. |
| LOW | src/workflow/gates.ts:unknown | approveArtifactByJsonPath declares the optional property overrideReview without explicit `\| undefined`. Line numbers were not supplied. |
| LOW | src/workflow/gates.ts:unknown | approveWorkflowTarget declares the optional property enforce without explicit `\| undefined`. Line numbers were not supplied. |
| LOW | src/workflow/gates.ts:unknown | readArtifactMeta declares optional properties epicHash and storyId without explicit `\| undefined`. The union on the enclosing return type does not satisfy the property-level rule. Line numbers were not supplied. |
| LOW | src/workflow/tracker/__tests__/github-adapter.test.ts:unknown | fakeAssigneeGh declares optional properties stickyAdd and failOn without explicit `\| undefined`. For failOn, undefined belongs to the callback return type, not the property type. Line numbers were not supplied. |
| LOW | src/workflow/tracker/__tests__/github-adapter.test.ts:unknown | recordingGh declares optional property failOn without explicit `\| undefined` on the property type; the existing union applies only to the callback return type. Line numbers were not supplied. |

## coverage — 37 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/cli/__tests__/command.test.ts | The listed changed file symbol and interface have empty testsReaching: not exercised under the supplied coverage rule. |
| HIGH | src/cli/__tests__/command.test.ts | ctxWith has a reaching test file, but that file is absent from the test record: present but failing/unverified; its pass-state is unverified. |
| HIGH | src/cli/__tests__/gate-refusal-output.test.ts | The changed file symbol has empty testsReaching: not exercised under the supplied coverage rule. |
| HIGH | src/cli/__tests__/team-claim-release.test.ts | These changed symbols have empty testsReaching: not exercised under the supplied coverage rule. |
| HIGH | src/cli/__tests__/tui.test.ts | The changed file symbol has empty testsReaching: not exercised under the supplied coverage rule. |
| HIGH | src/cli/__tests__/tui.test.ts | These changed functions have reaching entries in tui.test.ts, which is absent from the test record: present but failing/unverified; their pass-state is unverified. |
| HIGH | src/cli/command.ts | Every listed changed symbol has empty testsReaching. Passing CLI test titles do not establish coverage edges for these symbols. |
| HIGH | src/cli/services/index.ts | These changed symbols have empty testsReaching: not exercised under the supplied coverage rule. |
| HIGH | src/cli/services/team.ts | Every listed changed symbol has empty testsReaching; coverage of the team service behavior is not established. |
| HIGH | src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts | These changed symbols have empty testsReaching despite the test file's passing record. |
| HIGH | src/daemon/steps/build-step/handler.ts | These changed symbols have empty testsReaching. The passing reaching test for handleBuildStep does not replace their missing edges. |
| HIGH | src/daemon/steps/build-step/phases/implement.ts | Every listed changed symbol has empty testsReaching; implementation-phase behavior is not exercised according to the supplied edges. |
| HIGH | src/daemon/steps/build-step/phases/validate.ts | These changed symbols have empty testsReaching. Passing tests reaching the provider and check-runner setters do not establish coverage of validation behavior. |
| HIGH | src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts | These changed symbols have empty testsReaching despite the test file's passing record. |
| HIGH | src/daemon/steps/review-step/phases/verdicts.ts | These changed symbols have empty testsReaching; the passing promised review test does not establish their coverage edges. |
| HIGH | src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts | These changed symbols have empty testsReaching despite the test file's passing record. |
| HIGH | src/daemon/steps/workflow-step/__tests__/plan-e2e.test.ts | These changed symbols have empty testsReaching despite the test file's passing record. |
| HIGH | src/daemon/steps/workflow-step/handler.ts | These changed symbols have empty testsReaching. The passing reaching tests for handleWorkflowStep do not replace their missing edges. |
| HIGH | src/daemon/steps/workflow-step/phases/plan.ts | Every listed changed symbol has empty testsReaching: not exercised according to the supplied edges. |
| HIGH | src/daemon/steps/workflow-step/phases/start.ts | Every listed changed symbol has empty testsReaching: not exercised according to the supplied edges. |
| HIGH | src/daemon/steps/workflow-step/phases/step.ts | Every listed changed symbol has empty testsReaching: not exercised according to the supplied edges. |
| HIGH | src/daemon/steps/workflow-step/phases/synthesize.ts | Every listed changed symbol has empty testsReaching: not exercised according to the supplied edges. |
| HIGH | src/daemon/workflow-rpc.ts | These changed symbols have empty testsReaching. Passing reaching tests for runWorkflowServerSide and runStart do not establish coverage of these other symbols. |
| HIGH | src/workflow/__tests__/gate-approve.test.ts | These changed symbols have empty testsReaching. The promised approval test is present and passing at file/title level; t5's separate BUILD result is fail and does not change that recorded test result. |
| HIGH | src/workflow/__tests__/gate-guarded-entry-points.test.ts | These changed symbols have empty testsReaching despite the test file's passing record. |
| HIGH | src/workflow/gates.ts | These changed symbols have empty testsReaching. Passing reaching tests for approveArtifactByJsonPath and approveWorkflowTarget do not replace the missing edges for these symbols. |
| HIGH | src/workflow/review/__tests__/gate-resolve-finding.test.ts | These changed symbols have empty testsReaching despite the test file's passing record. |
| HIGH | src/workflow/review/resolve.ts | Every listed changed symbol has empty testsReaching. The promised resolution test is present and passing, but does not supply reaching edges for these symbols. |
| HIGH | src/workflow/review/run-artifact.ts | Every listed changed symbol has empty testsReaching; artifact-review behavior is not exercised according to the supplied edges. |
| HIGH | src/workflow/team/__tests__/gate.test.ts | These changed symbols have empty testsReaching despite the test file's passing record. |
| HIGH | src/workflow/team/__tests__/review-fix-decision.test.ts | These changed symbols have empty testsReaching despite the test file's passing record. |
| HIGH | src/workflow/team/approval-gate.ts | Every listed changed symbol has empty testsReaching; approval and finding-application authorization behavior is not exercised according to the supplied edges. |
| HIGH | src/workflow/team/author-gate.ts | Every listed changed symbol has empty testsReaching; author/build authorization behavior is not exercised according to the supplied edges. |
| HIGH | src/workflow/team/gate.ts | These changed symbols have empty testsReaching. Passing reaching tests for teamGate, claim, release and the registration setters do not replace these missing edges; reviewFixDecision also remains uncovered despite its passing promised test title. |
| HIGH | src/workflow/tracker/__tests__/github-adapter.test.ts | These changed symbols have empty testsReaching despite the test file's passing record. |
| HIGH | src/workflow/tracker/github-adapter.ts | Every listed changed symbol has empty testsReaching. The promised addAssignee test is present and passing, but does not supply a reaching edge to addAssignee or these other adapter symbols. |
| HIGH | src/workflow/tracker/port.ts | Every listed changed symbol has empty testsReaching: not exercised under the supplied coverage rule. All 19 promised tests have corresponding passing titles in the supplied record, so there are no missing-promised-test findings. |

## quality — 0 finding(s)

_No findings._

