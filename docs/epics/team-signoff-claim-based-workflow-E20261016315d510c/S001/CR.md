<!-- insrc:artifact CR-315d510cb28100e2-s1 -->

# Code review: 315d510cb28100e2:s1

⛔ **BLOCK** — HIGH 20 · MED 0 · LOW 12 · model `codex:gpt-6-astra`

**Changed files:** 19

## adherence — 0 finding(s)

_No findings._

## conventions — 12 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/__tests__/bugfix-tracker.test.ts:unknown | issue declares hasParentRef?: boolean without explicit \| undefined. Source line numbers were not supplied. |
| LOW | src/workflow/__tests__/bugfix-tracker.test.ts:unknown | makeCreateDeps declares spy?: CreateSpy without explicit \| undefined. |
| LOW | src/workflow/__tests__/bugfix-tracker.test.ts:unknown | makeCloseDeps declares spy?: CloseSpy without explicit \| undefined. |
| LOW | src/workflow/__tests__/bugfix-tracker.test.ts:unknown | adapterGh declares optional listOut and failOn properties without explicit \| undefined. |
| LOW | src/workflow/bugfix/tracker.ts:unknown | defaultTrackerCreateDeps declares optional labels and promptOnLostRef properties without explicit \| undefined. |
| LOW | src/workflow/bugfix/tracker.ts:unknown | defaultTrackerCloseDeps declares optional labels and promptOnLostRef properties without explicit \| undefined. |
| LOW | src/workflow/questions.ts:unknown | recordResolution declares the optional commit property without explicit \| undefined. |
| LOW | src/workflow/tracker/__tests__/github-adapter.test.ts:unknown | fakeAssigneeGh declares optional stickyAdd and failOn properties without explicit \| undefined. The undefined in failOn's return type does not make the property explicitly accept undefined. |
| LOW | src/workflow/tracker/__tests__/github-adapter.test.ts:unknown | recordingGh declares optional failOn without explicit \| undefined on the property type; undefined appears only in the callback's return type. |
| LOW | src/workflow/tracker/__tests__/tasks.test.ts:unknown | fakeGh declares login?: string without explicit \| undefined. |
| LOW | src/workflow/tracker/__tests__/tracker.test.ts:unknown | fakeGit declares optional nothingStaged and pushFails properties without explicit \| undefined. |
| LOW | src/workflow/tracker/github.ts:unknown | runGh declares discardOutput?: boolean without explicit \| undefined. |

## coverage — 20 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/workflow/__tests__/bugfix-tracker.test.ts | These changed symbols have empty testsReaching and therefore are not exercised under the supplied coverage contract. The file's passing tests do not supply the missing edges. |
| HIGH | src/workflow/__tests__/questions.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/__tests__/tracker-auto.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/bugfix/tracker.ts | These changed symbols have empty testsReaching. Passing promised tests do not override the supplied symbol-level coverage gaps. |
| HIGH | src/workflow/config/__tests__/github.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/config/github.ts | Every supplied changed symbol in this file has empty testsReaching. |
| HIGH | src/workflow/questions.ts | Every supplied changed symbol in this file has empty testsReaching. |
| HIGH | src/workflow/tracker-auto.ts | Every supplied changed symbol in this file has empty testsReaching. |
| HIGH | src/workflow/tracker/__tests__/fixtures/issue-ops-signatures-broken.ts | The changed file symbol has empty testsReaching. |
| HIGH | src/workflow/tracker/__tests__/fixtures/issue-ops-signatures.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/tracker/__tests__/github-adapter.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/tracker/__tests__/legacy-exec.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/tracker/__tests__/port.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/tracker/__tests__/setup.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/tracker/__tests__/tasks.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/tracker/__tests__/tracker.test.ts | These changed symbols have empty testsReaching. |
| HIGH | src/workflow/tracker/github-adapter.ts | Every supplied changed symbol in this file has empty testsReaching. |
| HIGH | src/workflow/tracker/github.ts | These changed symbols have empty testsReaching. Only _setTrackerExecForTests, ghCreateIssueTyped and ghLinkSubIssue have supplied reaching edges to passing test files. |
| HIGH | src/workflow/tracker/port.ts | Every supplied changed symbol in this file has empty testsReaching. |
| HIGH | src/workflow/tracker/__tests__/port.test.ts | The promised aggregate validation is present but failing/unverified: BUILD task t10 is recorded as fail. All individually promised test cases have corresponding passing titles, including equivalent wording for missingCapabilities and default-target refusal, but the record does not establish a passing full workflow/MCP sweep with clean tsc --noEmit or identify which aggregate check failed. |

## quality — 0 finding(s)

_No findings._

