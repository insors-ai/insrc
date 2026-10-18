<!-- insrc:artifact CR-315d510cb28100e2-s5 -->

# Code review: 315d510cb28100e2:s5

⛔ **BLOCK** — HIGH 35 · MED 3 · LOW 8 · model `codex:gpt-6-astra`

**Changed files:** 35

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/team/gate.ts:156 | The first-author exception checks the unit's DEF or LLD instead of the artifact being authored. A first design.epic draft already has a DEF, and a first PLAN already has an LLD, so when issue creation fails these first drafts are refused despite having no artifact of their own. Pass the authoring stage into the existence check so the exception tests the target artifact. |

## conventions — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/cli/command.ts:223 | The new error-shape assertion declares `reason?: string` without the required explicit `\| undefined`. |
| LOW | src/cli/command.ts:247 | The new approval-error assertion declares `reason?: string` without the required explicit `\| undefined`. |
| LOW | src/workflow/team/approval-gate.ts:28 | Every optional property in `Meta` omits the documented explicit `\| undefined` union. |
| LOW | src/workflow/team/approval-gate.ts:38 | The parsed artifact shape declares `meta?: Meta` without explicit `\| undefined`. |
| LOW | src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts:41 | The optional `readPolicy`, `issue`, and `artifact` properties omit explicit `\| undefined` unions. |
| LOW | src/workflow/team/__tests__/gate.test.ts:33 | The optional properties of the fake port's `over` argument omit the required explicit `\| undefined` unions. |
| LOW | src/workflow/team/__tests__/gate.test.ts:71 | The optional `issue` and `artifact` properties omit the required explicit `\| undefined` unions. |

## coverage — 35 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/cli/__tests__/command.test.ts:83 | The changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/cli/__tests__/gate-refusal-output.test.ts:1 | The changed file symbol has empty testsReaching. Its recorded tests pass, but no reaching edge establishes coverage of this symbol. |
| HIGH | src/cli/__tests__/team-claim-release.test.ts:1 | The changed file symbol has empty testsReaching. Its recorded test passes, but no reaching edge establishes coverage of this symbol. |
| HIGH | src/cli/__tests__/tui.test.ts:103 | The changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/cli/command.ts:215 | Empty testsReaching leaves the changed command parsing and refusal rendering unexercised under the supplied coverage contract. Passing related tests do not supply the missing edges. |
| HIGH | src/cli/services/index.ts:149 | Empty testsReaching leaves the new claim/release service wiring unexercised under the supplied coverage contract. |
| HIGH | src/cli/services/team.ts:35 | Empty testsReaching leaves the new unit formatting and claim/release services unexercised under the supplied coverage contract. |
| HIGH | src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts:1 | The changed file symbol has empty testsReaching. Its recorded tests pass, but no reaching edge establishes coverage of this symbol. |
| HIGH | src/daemon/steps/build-step/handler.ts:54 | Empty testsReaching leaves the new team-gate error translation unexercised under the supplied coverage contract. |
| HIGH | src/daemon/steps/build-step/phases/implement.ts:65 | Empty testsReaching leaves the planned and standalone build authorization changes unexercised under the supplied coverage contract. |
| HIGH | src/daemon/steps/build-step/phases/validate.ts:218 | Empty testsReaching leaves the planned and standalone validation authorization changes unexercised under the supplied coverage contract. |
| HIGH | src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts:1 | The changed file symbol has empty testsReaching. Its recorded test passes, but no reaching edge establishes coverage of this symbol. |
| HIGH | src/daemon/steps/review-step/phases/verdicts.ts:94 | Empty testsReaching leaves the new report-only versus auto-fix decision unexercised under the supplied coverage contract. |
| HIGH | src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts:1 | The changed file symbol has empty testsReaching. Its recorded tests pass, but no reaching edge establishes coverage of this symbol. |
| HIGH | src/daemon/steps/workflow-step/__tests__/plan-e2e.test.ts:243 | The changed file symbol has empty testsReaching. The added test is recorded as passing, but no reaching edge establishes coverage of this symbol. |
| HIGH | src/daemon/steps/workflow-step/handler.ts:75 | Empty testsReaching leaves the new team-gate error translation unexercised under the supplied coverage contract. |
| HIGH | src/daemon/steps/workflow-step/phases/plan.ts:40 | Empty testsReaching leaves the new authorization before executor execution unexercised under the supplied coverage contract. |
| HIGH | src/daemon/steps/workflow-step/phases/start.ts:60 | Empty testsReaching leaves the new authorization before the upstream-question gate unexercised under the supplied coverage contract. |
| HIGH | src/daemon/steps/workflow-step/phases/step.ts:38 | Empty testsReaching leaves the new authorization before executor resumption unexercised under the supplied coverage contract. |
| HIGH | src/daemon/steps/workflow-step/phases/synthesize.ts:40 | Empty testsReaching leaves the authorization checks before and after finalization unexercised under the supplied coverage contract. |
| HIGH | src/daemon/workflow-rpc.ts:182 | Empty testsReaching leaves the new entry and pre-write authorization checks unexercised under the supplied coverage contract. |
| HIGH | src/workflow/__tests__/gate-approve.test.ts:1 | The changed file symbol has empty testsReaching. Its recorded test passes, but no reaching edge establishes coverage of this symbol. |
| HIGH | src/workflow/__tests__/gate-guarded-entry-points.test.ts:1 | The changed file symbol has empty testsReaching. Its recorded test passes, but no reaching edge establishes coverage of this symbol. |
| HIGH | src/workflow/gates.ts:603 | Empty testsReaching leaves approval authorization, refusal handling and authorization before BUILD record creation unexercised under the supplied coverage contract. |
| HIGH | src/workflow/review/__tests__/gate-resolve-finding.test.ts:1 | The changed file symbol has empty testsReaching. Its recorded test passes, but no reaching edge establishes coverage of this symbol. |
| HIGH | src/workflow/review/resolve.ts:106 | Empty testsReaching leaves authorization before applying a finding unexercised under the supplied coverage contract. |
| HIGH | src/workflow/review/run-artifact.ts:107 | Empty testsReaching leaves the new report-only versus auto-fix decision unexercised under the supplied coverage contract. |
| HIGH | src/workflow/team/__tests__/gate.test.ts:1 | The changed file symbol has empty testsReaching. Its recorded tests pass, but no reaching edge establishes coverage of this symbol. |
| HIGH | src/workflow/team/__tests__/review-fix-decision.test.ts:1 | The changed file symbol has empty testsReaching. Its recorded test passes, but no reaching edge establishes coverage of this symbol. |
| HIGH | src/workflow/team/approval-gate.ts:1 | Empty testsReaching leaves the new artifact-to-unit authorization and review-fix policy unexercised under the supplied coverage contract. |
| HIGH | src/workflow/team/author-gate.ts:1 | Empty testsReaching leaves the new authoring/build unit resolution and authorization unexercised under the supplied coverage contract. |
| HIGH | src/workflow/team/gate.ts:1 | Empty testsReaching leaves the new team gate, completion hook, claim, release and review-fix behavior unexercised under the supplied coverage contract. |
| HIGH | src/workflow/tracker/__tests__/github-adapter.test.ts:327 | The changed file symbol has empty testsReaching. The promised addAssignee test is present and passing, but no reaching edge establishes coverage of this symbol. All other 18 promised tests are also present and passing in the supplied records; none is missing. |
| HIGH | src/workflow/tracker/github-adapter.ts:119 | Empty testsReaching leaves the new addAssignee implementation and adapter wiring unexercised under the supplied coverage contract. |
| HIGH | src/workflow/tracker/port.ts:76 | The changed file symbol has empty testsReaching for the new addAssignee contract: not exercised under the supplied coverage rule. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/team/approval-gate.ts:52 | Unhandled malformed-plan path: missing task lists become an empty list, and tasks with non-string IDs are silently discarded. BUILD approval can consequently check only the Story or a subset of Tasks instead of refusing an unreadable task identity. Validate every task ID and refuse malformed plans when claims are enforced. |
| MED | src/daemon/steps/build-step/phases/validate.ts:218 | Correctness risk: ownership is checked before the asynchronous validation session, but no second check is shown before its BUILD record write. If ownership changes during checks or model review, validation can persist results after the actor loses the claim. Recheck at the persistence boundary, as the authoring routes already do. |
| LOW | src/workflow/team/gate.ts:252 | Duplication: claim repeats teamGate's holder comparison, add-only assignment, failure handling and contention detection. Changes to claim verification must be maintained in both paths, risking different behavior for explicit and implicit claims. Extract the shared assignment decision while preserving their distinct outcome messages. |

