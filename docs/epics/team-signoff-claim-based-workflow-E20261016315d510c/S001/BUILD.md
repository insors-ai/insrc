<!-- insrc:artifact BUILD-315d510cb28100e2-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-17T10:31:31.023Z  ·  **Updated:** 2026-10-17T11:33:10.928Z

**Commit:** fba82c15

## Summary

Regression: `npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts'` = 2035 tests, 2032 pass, 0 fail, 3 skipped (live-gated); `npx tsc --noEmit` clean. The tracker, tasks, setup, tracker-auto, tracker-tasks and bugfix-tracker suites pass, with the old catch-everything typed-create tests already updated in t2.

Legacy exec listing (grep of out( / silent( call sites in non-test src, mapped to their enclosing function; all in src/workflow/tracker/github.ts; the runner definitions out and silent excluded):
- commitAndPushArtifacts (git add/commit/push, lines 119-138)
- gitOriginOwnerRepo (git remote read, 147)
- ghAuthOk (168)
- ghCreateIssue (190, untyped create, no production caller)
- ghGetIssueState (276)
- ghFindIssueByLabels (290, no production caller since the port)
- retained setup.ts functions: ghTokenScopes (332), ghListOrgIssueTypes (351), ghCreateOrgIssueType (366), ghCreateProject (376), ghFindProjectByTitle (390), ghAddProjectSingleSelectField (404), ghListRepoIssueUrls (414), ghAddProjectItem (423)
- queryTasks (563)

Difference from the acceptance text: besides ghGetIssueState, queryTasks, the retained setup functions and commitAndPushArtifacts, four more still use the legacy path: ghAuthOk (the LLD keeps it exported), gitOriginOwnerRepo (a git read), and ghCreateIssue and ghFindIssueByLabels (neither has a production caller any more). They were never in the migration scope; I did not migrate them. New test legacy-exec.test.ts pins this exact list so a new or regressed legacy user fails.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✗ `t10`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/__tests__/bugfix-tracker.test.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/__tests__/questions.test.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/__tests__/tracker-auto.test.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/bugfix/tracker.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/config/__tests__/github.test.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/questions.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/tracker-auto.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/tracker/__tests__/fixtures/issue-ops-signatures-broken.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/tracker/__tests__/fixtures/issue-ops-signatures.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/tracker/__tests__/legacy-exec.test.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/tracker/__tests__/port.test.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/tracker/__tests__/setup.test.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/tracker/__tests__/tasks.test.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/tracker/__tests__/tracker.test.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/tracker/github.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-17T11:33:10.928Z)
