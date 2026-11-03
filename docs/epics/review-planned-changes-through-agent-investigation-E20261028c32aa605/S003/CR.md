<!-- insrc:artifact CR-c32aa60534232f36-s3 -->

# Code review: c32aa60534232f36:s3

⚠️ **WARN** — HIGH 0 · MED 10 · LOW 17 · model `claude:claude-sonnet-5`

**Changed files:** 15

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/code-review/investigation/continuation-types.ts:50-52 | The LLD's dataModelChanges schemaDiff for InvestigationBackend pins the qualification fields `pinnedReads`, `readOnly` and `cancellable` to the literal type `true` (a compile-time guarantee that only qualified backends can satisfy the interface). The implemented InvestigationBackend.qualification types these fields as plain `boolean`, which lets a backend object type-check with `false` values. Runtime guards in continuation-policy.ts's assertInvestigationBindings (`if(!q.pinnedReads\|\|!q.readOnly\|\|!q.cancellable...)`) still reject such a backend before dispatch, so no incorrect behavior results, but the static type no longer matches the approved schemaDiff's literal-`true` contract. |

## conventions — 0 finding(s)

_No findings._

## coverage — 23 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/code-review/investigation/continuation-policy.ts | createInvestigationPolicy's only testsReaching edge is via continuation-fixtures.ts#continuationFixture, a test-helper file not itself listed in the test record's file results, so its direct pass-state is unverified — though the fixture is consumed by continuation.test.ts and continuation-integration.test.ts, both passing. |
| MED | src/workflow/code-review/investigation/continuation-policy.ts | admitInvestigationRequest has no testsReaching edge in the graph, but the Story's test files (continuation-policy.test.ts, continuation.test.ts) pass; likely a missed call-graph edge rather than a real gap. |
| MED | src/workflow/code-review/investigation/continuation-policy.ts | assertInvestigationBindings has no testsReaching edge in the graph, but its only caller runInvestigationContinuation is exercised by passing tests (continuation.test.ts, continuation-integration.test.ts); likely a missed edge. |
| LOW | src/workflow/code-review/investigation/continuation-policy.ts | positive has no testsReaching edge, but its callers (createInvestigationPolicy, assertInvestigationBindings) sit in passing test files; likely a missed edge for this small guard helper. |
| LOW | src/workflow/code-review/investigation/continuation-types.ts | InvestigationError has no testsReaching edge and no recorded callers/callees; coverage via the passing suites cannot be confirmed from the graph. |
| MED | src/workflow/code-review/investigation/progress.ts | BlockProgressCoordinator (class) has no testsReaching edge despite progress.test.ts passing; graph likely does not trace class-level construction edges. |
| LOW | src/workflow/code-review/investigation/progress.ts | state() has no testsReaching edge; progress.test.ts passes but the graph does not trace this accessor method. |
| LOW | src/workflow/code-review/investigation/progress.ts | account() has no testsReaching edge though its caller runInvestigationContinuation is covered by passing continuation tests; likely a missed method-call edge. |
| LOW | src/workflow/code-review/investigation/progress.ts | publish() has no testsReaching edge; reached only internally from account/accept, both in files covered by passing tests. |
| LOW | src/workflow/code-review/investigation/navigation.ts | untilInvestigationAborted has no testsReaching edge though its callers (capability, runInvestigationContinuation) are covered by passing navigation.test.ts/continuation tests. |
| LOW | src/workflow/code-review/investigation/navigation.ts | abort() has no testsReaching edge; its sole caller untilInvestigationAborted sits in a passing-test code path. |
| MED | src/workflow/code-review/investigation/navigation.ts | InvestigationNavigation (class) has no testsReaching edge despite navigation.test.ts passing; graph likely does not trace construction/instantiation edges for this class. |
| LOW | src/workflow/code-review/investigation/navigation.ts | basis() has no testsReaching edge; coverage via navigation.test.ts cannot be confirmed from the graph alone. |
| LOW | src/workflow/code-review/investigation/navigation.ts | check() has no testsReaching edge; its caller capability() is covered by passing navigation.test.ts. |
| MED | src/workflow/code-review/investigation/navigation.ts | admit() has no testsReaching edge; its caller capability() is covered by passing navigation.test.ts, but this evidence-admission path itself is unconfirmed by the graph. |
| LOW | src/workflow/code-review/investigation/continuation.ts | InvestigationTransientError (class) has no testsReaching edge; coverage via passing continuation tests cannot be confirmed from the graph. |
| LOW | src/workflow/code-review/investigation/continuation.ts | unresolved() has no testsReaching edge; its callers pause/checkReply are reached from runInvestigationContinuation, covered by passing tests. |
| MED | src/workflow/code-review/investigation/continuation.ts | pause() has no testsReaching edge though runInvestigationContinuation is covered by passing continuation.test.ts/continuation-integration.test.ts; likely a missed internal edge. |
| MED | src/workflow/code-review/investigation/continuation.ts | checkReply() has no testsReaching edge though runInvestigationContinuation is covered by passing tests; the final-reply validation path is unconfirmed by the graph. |
| LOW | src/workflow/code-review/investigation/continuation.ts | check() has no testsReaching edge; its caller runInvestigationContinuation is covered by passing tests. |
| LOW | src/workflow/code-review/investigation/continuation.ts | currentContext() has no testsReaching edge; its caller runInvestigationContinuation is covered by passing tests. |
| MED | src/workflow/code-review/investigation/continuation-usage.ts | observationFor has no testsReaching edge despite its caller recordInvestigationUsage being part of the usage-observation path exercised by passing continuation-usage.test.ts. |
| MED | src/workflow/code-review/investigation/continuation-usage.ts | recordInvestigationUsage has no testsReaching edge and no recorded callers within this Story's symbol set; continuation-usage.test.ts passes, but this exported entry point's direct exercise is unconfirmed by the graph. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/code-review/investigation/continuation-usage.ts:1 | recordInvestigationUsage (and its callee observationFor) have no recorded callers anywhere in the Story's changed symbol set — runInvestigationContinuation only calls progress.ts's BlockProgressCoordinator.account for usage accounting, never recordInvestigationUsage. This looks like a new usage-observation path that was added but never wired into the main continuation loop, so elapsed active-time usage may not actually be recorded via this mechanism. Note the companion continuation-usage.test.ts also shows no resolved call edges, which can mean the graph grounding is simply hollow for this just-created file rather than proof the code is truly dead — verify by reading continuation.ts's body and running the test file directly before concluding either way. |
| LOW | src/workflow/code-review/investigation/continuation.ts:1 | The module-level check() function in continuation.ts (called from runInvestigationContinuation) and InvestigationNavigation.check() in navigation.ts (called from capability()) share the identical name 'check' but perform different checks (one appears to be an abort/turn guard, the other a ledger-drift guard against basis()). Reusing the same bare name for two semantically different guards in collaborating modules makes call sites harder to trace at a glance; a more specific name on one of them (e.g. assertNotAborted vs assertLedgerFresh) would remove the ambiguity. This is a naming/readability preference, not a functional defect. |
| LOW | src/workflow/code-review/investigation/continuation.ts:1 | runInvestigationContinuation directly orchestrates roughly a dozen distinct collaborators (abort racing, capability/admission, seed/digest building, binding assertion, progress accounting/acceptance, pause/reply checks, context lookup). Even with the logic correctly delegated to each owning module, the sheer fan-out from one function makes its control flow harder to follow at a glance; consider whether the first-turn vs continuation-turn setup (admitInvestigationRequest/buildInvestigationSeed/investigationRequestDigest/assertInvestigationBindings) can be collapsed behind a single helper to shrink the orchestrator's visible surface. Flagged as a readability observation, not a confirmed defect, since the actual branching structure isn't visible from the symbol summary alone. |

## diagram — 0 finding(s)

_No findings._

