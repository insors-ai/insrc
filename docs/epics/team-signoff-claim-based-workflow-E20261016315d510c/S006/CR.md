<!-- insrc:artifact CR-315d510cb28100e2-s6 -->

# Code review: 315d510cb28100e2:s6

⛔ **BLOCK** — HIGH 53 · MED 0 · LOW 8 · model `codex:gpt-6-astra`

**Changed files:** 46

## adherence — 0 finding(s)

_No findings._

## conventions — 8 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts:unknown | parse declares the optional error property without an explicit `\| undefined`. The supplied summary does not include line numbers. |
| LOW | src/mcp/server.ts:unknown | handleWorkflowApprove declares the optional return property `isError?: boolean` without an explicit `\| undefined`. The supplied summary does not include line numbers. |
| LOW | src/mcp/server.ts:unknown | handleInsrcPresent declares the optional return property `isError?: boolean` without an explicit `\| undefined`. The supplied summary does not include line numbers. |
| LOW | src/workflow/team/__tests__/handoff-park-plan.test.ts:unknown | plan declares `opts.runToken?: string` without an explicit `\| undefined`. The supplied summary does not include line numbers. |
| LOW | src/workflow/team/__tests__/handoff-resume-check.test.ts:unknown | parkRun declares `opts.run?: boolean` without an explicit `\| undefined`. The supplied summary does not include line numbers. |
| LOW | src/workflow/team/__tests__/handoff-resume-check.test.ts:unknown | check declares optional override properties repo, unit, workflow, and deps without explicit `\| undefined` unions. The supplied summary does not include line numbers. |
| LOW | src/workflow/team/__tests__/park-offer.test.ts:unknown | runPayload declares optional override properties workflow and storyId without explicit `\| undefined` unions. The supplied summary does not include line numbers. |
| LOW | src/workflow/team/__tests__/snapshot-upstream.test.ts:unknown | seedChain declares optional revision properties def, hld, and lld without explicit `\| undefined` unions. The supplied summary does not include line numbers. |

## coverage — 53 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | docs/plans/s6-open-issues.md | These changed symbols have empty testsReaching and therefore are not exercised under the supplied coverage contract. |
| HIGH | src/cli/__tests__/command.test.ts | The file symbol and Spies have empty testsReaching. |
| HIGH | src/cli/__tests__/command.test.ts | ctxWith has reaching tests present but failing/unverified: command.test.ts is absent from the test record, so its pass-state is unverified. |
| HIGH | src/cli/__tests__/settings-modal.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/cli/__tests__/settings-modal.test.ts | Reaching tests are present but failing/unverified: settings-modal.test.ts is absent from the test record, so passing coverage cannot be confirmed. |
| HIGH | src/cli/__tests__/team-claim-release.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/cli/__tests__/team-claim-release.test.ts | Reaching tests are present but failing/unverified: team-claim-release.test.ts is absent from the test record. |
| HIGH | src/cli/__tests__/team-park-resume.test.ts | These changed symbols have empty testsReaching. The passing test file does not supply reaching edges for them. |
| HIGH | src/cli/__tests__/tui.test.ts | The changed file symbol has empty testsReaching. |
| HIGH | src/cli/__tests__/tui.test.ts | Reaching tests are present but failing/unverified: tui.test.ts is absent from the test record. |
| HIGH | src/cli/command.ts | These changed symbols have empty testsReaching. Passing coverage of runCommand cannot substitute for their missing edges. |
| HIGH | src/cli/services/index.ts | These changed symbols have empty testsReaching. |
| HIGH | src/cli/services/team.ts | These changed symbols have empty testsReaching. teamPark and teamResume have passing reaching tests, but those do not establish edges for these symbols. |
| HIGH | src/config/__tests__/fixtures/repo-fields-catalog.json | Both changed file and config symbols have empty testsReaching. |
| HIGH | src/config/__tests__/repo-fields.test.ts | The changed file symbol has empty testsReaching. |
| HIGH | src/config/__tests__/repo-fields.test.ts | codeOf has reaching tests present but failing/unverified: repo-fields.test.ts is absent from the test record. |
| HIGH | src/config/repo-fields.ts | These changed symbols have empty testsReaching. |
| HIGH | src/config/repo-fields.ts | Reaching tests are present but failing/unverified: the only reaching file, repo-fields.test.ts, is absent from the test record. |
| HIGH | src/daemon/index.ts | These changed symbols have empty testsReaching, including startup registration in main. |
| HIGH | src/daemon/steps/host.ts | These changed symbols have empty testsReaching. |
| HIGH | src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts | These changed symbols have empty testsReaching despite the file's passing promised test. |
| HIGH | src/daemon/steps/workflow-step/__tests__/handoff-phases.test.ts | These changed symbols have empty testsReaching despite the file's passing promised test. |
| HIGH | src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts | The changed file symbol has empty testsReaching. |
| HIGH | src/daemon/steps/workflow-step/handler.ts | These changed symbols have empty testsReaching. Passing tests reaching handleWorkflowStep do not supply coverage edges for dispatch or errorResult. |
| HIGH | src/daemon/steps/workflow-step/handoff-rpc.ts | These changed symbols have empty testsReaching. |
| HIGH | src/daemon/steps/workflow-step/park-offer.ts | These changed symbols have empty testsReaching, including the live-run eligibility checks. |
| HIGH | src/daemon/steps/workflow-step/phases/park.ts | These changed symbols have empty testsReaching. The promised park-phase test is present and passing, but no reaching edge establishes coverage of these symbols. |
| HIGH | src/daemon/steps/workflow-step/phases/resume.ts | These changed symbols have empty testsReaching. The promised resume-phase test is present and passing, but no reaching edge establishes coverage of these symbols. |
| HIGH | src/daemon/steps/workflow-step/phases/start.ts | These changed symbols have empty testsReaching, including handleStart's ownership and upstream metadata behavior. |
| HIGH | src/daemon/steps/workflow-step/resume.ts | Every listed changed symbol has empty testsReaching, including restoration, rollback, state creation and resumed-turn selection. Passing promised resume tests do not override these missing edges. |
| HIGH | src/daemon/steps/workflow-step/state-store.ts | These changed symbols have empty testsReaching, including replacement, release and expiry handling. |
| HIGH | src/daemon/steps/workflow-step/state.ts | These changed symbols have empty testsReaching. |
| HIGH | src/daemon/steps/workflow-step/types.ts | Every listed changed symbol in this file has empty testsReaching. |
| HIGH | src/mcp/__tests__/fixtures/tool-surface.golden.json | Both changed file and config symbols have empty testsReaching. |
| HIGH | src/mcp/__tests__/park-resume-phases.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/mcp/__tests__/schema-registry.test.ts | The changed file symbol has empty testsReaching. |
| HIGH | src/mcp/server.ts | Every listed changed symbol in this file has empty testsReaching. Passing MCP phase tests do not establish symbol coverage without reaching edges. |
| HIGH | src/workflow/__tests__/gate-guarded-entry-points.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/artifact-write-inventory.ts | Every listed changed symbol in this file has empty testsReaching. |
| HIGH | src/workflow/config/github.ts | Every listed changed symbol in this file has empty testsReaching. |
| HIGH | src/workflow/team/__tests__/handoff-e2e.test.ts | The changed file symbol has empty testsReaching. Its promised test is present and passing. |
| HIGH | src/workflow/team/__tests__/handoff-park-plan.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/team/__tests__/handoff-park.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/team/__tests__/handoff-pure.test.ts | The changed file symbol has empty testsReaching. All three promised tests in this file are present and passing. |
| HIGH | src/workflow/team/__tests__/handoff-resume-check.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/team/__tests__/handoff-resume.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/team/__tests__/helpers/handoff-world.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/team/__tests__/helpers/handoff-world.ts | Reaching tests are present but failing/unverified: these symbols are reached only from helpers/handoff-world.ts, which is absent from the test record. Passing files that use other helpers cannot establish their pass-state under the supplied rule. |
| HIGH | src/workflow/team/__tests__/park-offer.test.ts | These changed symbols have empty testsReaching. Both promised tests in this file are present and passing. |
| HIGH | src/workflow/team/__tests__/snapshot-upstream.test.ts | The changed file symbol has empty testsReaching. Its promised test is present and passing. |
| HIGH | src/workflow/team/gate.ts | These changed symbols have empty testsReaching, including teamGate, park-offer refusal rendering and actor resolution. The passing promised tests do not override missing symbol-level edges. |
| HIGH | src/workflow/team/handoff.ts | These changed symbols have empty testsReaching, including checkpoint validation, portability, branch naming, park planning/execution and resume checks' supporting logic. All 20 promised tests are present with passing results; nevertheless, those test titles cannot replace the required symbol-level reaching edges. |
| HIGH | src/workflow/team/run-meta.ts | These changed symbols have empty testsReaching. snapshotUpstream and runMetaFor have passing reaching tests, but the listed symbols do not. |

## quality — 0 finding(s)

_No findings._

