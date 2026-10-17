# s1/t10 — full regression and legacy-exec listing

Recorded 2026-10-17 at commit `fba82c15` (the t9 state plus the legacy-exec test).

## Commands and results

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) |
| `npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts'` | 2035 tests, 2032 pass, 0 fail, 3 skipped (live-gated) |

The workflow glob includes the tracker, tasks, setup, tracker-auto, tracker-tasks, bugfix-tracker, questions, config and port suites. The only existing tests changed are the ones that pinned the old catch-everything typed-create retry (done in t2).

## Legacy exec users

Search: every `out(` / `silent(` call with a `'gh'` or `'git'` command in non-test `src`, mapped to its enclosing function. The runner definitions `out` and `silent` are excluded. All hits are in `src/workflow/tracker/github.ts`.

| Function | Lines | Why it is still on the legacy path |
|---|---|---|
| `commitAndPushArtifacts` | 119-138 | git commit and push of artifacts; not a tracker call |
| `gitOriginOwnerRepo` | 147 | git remote read; not a tracker call |
| `ghAuthOk` | 168 | stays exported; the lenient gate calls it (LLD) |
| `ghCreateIssue` | 190 | untyped create; no production caller |
| `ghGetIssueState` | 276 | status read in sync.ts; deferred to the status-sync story |
| `ghFindIssueByLabels` | 290 | legacy lookup; no production caller since the port |
| `ghTokenScopes`, `ghListOrgIssueTypes`, `ghCreateOrgIssueType`, `ghCreateProject`, `ghFindProjectByTitle`, `ghAddProjectSingleSelectField`, `ghListRepoIssueUrls`, `ghAddProjectItem` | 332-423 | the retained setup.ts functions |
| `queryTasks` | 563 | graphql task search, kept as is |

Difference from the acceptance wording ("exactly ghGetIssueState, queryTasks, the retained setup.ts functions and commitAndPushArtifacts"): four more functions remain: `ghAuthOk`, `gitOriginOwnerRepo`, `ghCreateIssue` and `ghFindIssueByLabels`. None was in the migration scope; two have no production caller. They are not migrated here.

`src/workflow/tracker/__tests__/legacy-exec.test.ts` pins this exact list, so a new or regressed legacy user fails the test.
