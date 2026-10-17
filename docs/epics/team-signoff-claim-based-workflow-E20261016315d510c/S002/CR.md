<!-- insrc:artifact CR-315d510cb28100e2-s2 -->

# Code review: 315d510cb28100e2:s2

⛔ **BLOCK** — HIGH 27 · MED 43 · LOW 0 · model `codex:gpt-6-astra`

**Changed files:** 26

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/team/sighting-store.ts:73 | Repository identity resolution runs git with its independent 5-second timeout. Refresh invokes this through lock acquisition, sighting reads, and sighting writes without passing the shared deadline. These calls can push a refresh beyond 10 seconds, including while recording after the final deadline check. Resolve the identity once within the refresh budget and reuse it, or propagate the remaining deadline through the store. |

## conventions — 0 finding(s)

_No findings._

## coverage — 67 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/cli/__tests__/command.test.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/cli/__tests__/team-service.test.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/cli/__tests__/tui.test.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/cli/command.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. Present test definitions do not substitute for reaching edges. |
| HIGH | src/cli/services/index.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/cli/services/team.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/shared/paths.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/__tests__/anchor-finder.test.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/__tests__/branch-resolution.test.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/__tests__/git-fixture.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/__tests__/policy-parser.test.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/__tests__/policy-reader.test.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/__tests__/policy-refresh.test.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/__tests__/sighting-store.test.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/__tests__/starter-policy.test.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/anchor-finder.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/branch-resolution.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/create-only.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/git-async.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/git.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/policy-parser.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/policy-reader.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/policy-refresh.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/sighting-store.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/starter-policy.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| HIGH | src/workflow/team/types.ts:1 | Changed file symbol has empty testsReaching: not exercised under the supplied coverage contract. |
| MED | src/workflow/team/__tests__/policy-parser.test.ts:1 | Promised test is present but failing/unverified: UNVERIFIED because no build record is available; failure is not established. |
| MED | src/workflow/team/__tests__/policy-parser.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/sighting-store.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/sighting-store.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/sighting-store.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/sighting-store.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/sighting-store.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/anchor-finder.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/anchor-finder.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/anchor-finder.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/anchor-finder.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-reader.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-reader.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-reader.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-reader.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-reader.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-reader.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-reader.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-reader.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-reader.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-reader.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-reader.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-reader.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-reader.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/branch-resolution.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/branch-resolution.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/branch-resolution.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-refresh.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-refresh.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-refresh.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-refresh.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-refresh.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-refresh.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/policy-refresh.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/starter-policy.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/workflow/team/__tests__/starter-policy.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/cli/__tests__/command.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/cli/__tests__/command.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/cli/__tests__/command.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/cli/__tests__/command.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |
| MED | src/cli/__tests__/tui.test.ts:1 | Promised test is present but failing/unverified: no build record confirms a pass. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/workflow/team/policy-reader.ts:137 | Correctness: Git interprets this ls-tree path relative to its working directory. When repo is a repository subdirectory, the lookup searches beneath that directory instead of the repository root and can return 'none' despite an active root policy. The equivalent refresh lookup can remove the sighting. Normalize the working directory to the repository root before policy lookups. |
| MED | src/workflow/team/policy-refresh.ts:100 | Duplication: refreshLocked repeats readAt's policy inspection sequence: ls-tree, absence detection, git show, and parsePolicyFile. Maintaining separate implementations risks inconsistent treatment of missing, unreadable, and invalid policies. Extract a shared inspection helper accepting the Git runner so refresh can retain its deadline and recording behavior. |

