<!-- insrc:artifact CR-72b1bee074ba2dab-S001 -->

# Code review: 72b1bee074ba2dab:S001

⛔ **BLOCK** — HIGH 10 · MED 1 · LOW 4 · model `codex:gpt-6-astra`

**Changed files:** 10

## adherence — 0 finding(s)

_No findings._

## conventions — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/tracker/__tests__/github-adapter.test.ts:unknown | fakeAssigneeGh declares stickyAdd and failOn as optional properties without explicit `\| undefined` on their property types. For failOn, the return type's `\| undefined` does not make the function property accept undefined. Line numbers were not provided. |
| LOW | src/workflow/tracker/__tests__/github-adapter.test.ts:unknown | recordingGh declares optional failOn without `\| undefined` on the function property type; its return-type union does not satisfy this rule. Line numbers were not provided. |
| LOW | src/workflow/tracker/__tests__/unit-issue.test.ts:unknown | fakeTracker's over parameter declares optional properties without explicit `\| undefined`, including failFind, failLabel, afterFind, afterCreate, and shared. Apply the documented optional-property convention throughout this options object. Line numbers were not provided. |
| LOW | src/workflow/tracker/github.ts:unknown | runGh declares `discardOutput?: boolean` instead of the required `discardOutput?: boolean \| undefined`. Line numbers were not provided. |

## coverage — 11 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/workflow/tracker/__tests__/fixtures/issue-ops-signatures-broken.ts:1 | The changed file symbol has empty testsReaching and is not exercised according to the supplied coverage edges. |
| HIGH | src/workflow/tracker/__tests__/fixtures/issue-ops-signatures.ts:1 | The changed file symbol has empty testsReaching and is not exercised according to the supplied coverage edges. |
| MED | src/workflow/tracker/__tests__/fixtures/issue-ops-signatures.ts:1 | Coverage for ok is present but failing/unverified: its reaching file is absent from the test record, so passing execution is unverified. The passing port.test.ts record does not establish the status of this reaching file. |
| HIGH | src/workflow/tracker/__tests__/github-adapter.test.ts:1 | The changed file symbol and isEdit each have empty testsReaching. The file's passing test record does not supply missing reaching edges for these symbols. |
| HIGH | src/workflow/tracker/__tests__/port.test.ts:1 | The changed file symbol has empty testsReaching. The file's passing test record does not supply a missing reaching edge for this symbol. |
| HIGH | src/workflow/tracker/__tests__/unit-issue.test.ts:1 | The listed changed symbols each have empty testsReaching. The file's passing test record does not supply missing reaching edges for these symbols. |
| HIGH | src/workflow/tracker/github-adapter.ts:1 | The listed changed symbols each have empty testsReaching and therefore have a not-exercised coverage gap. Passing tests reaching createGithubTracker do not override these empty edges. |
| HIGH | src/workflow/tracker/github.ts:1 | The listed changed symbols each have empty testsReaching and therefore have a not-exercised coverage gap. Passing records for tests reaching other symbols do not establish coverage for these symbols. |
| HIGH | src/workflow/tracker/port.ts:1 | The listed changed symbols each have empty testsReaching and therefore have a not-exercised coverage gap. The passing signature-test titles cannot substitute for the required reaching edges. |
| HIGH | src/workflow/tracker/refs.ts:1 | Every supplied changed symbol in this file has empty testsReaching and therefore has a not-exercised coverage gap. |
| HIGH | src/workflow/tracker/unit-issue.ts:1 | Every supplied changed symbol in this file has empty testsReaching and therefore has a not-exercised coverage gap. Although unit-issue.test.ts passes, its titles cannot substitute for missing reaching edges. |

## quality — 0 finding(s)

_No findings._

