<!-- insrc:artifact BUILD-b7a68147dcf72034-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-25T19:43:56.030Z  ·  **Updated:** 2026-10-26T04:50:42.158Z

**Commit:** 020e2b0ff

## Summary

Fixed the two probe defects the judge named: the cleanup flag is set before create is called (so a throw still cleans up), and a failed update, archive, restore or delete is recorded as a separate '-failed' file instead of overwriting the success fixture. The recorded success fixtures and the passing live run are unchanged by this edit (the code path of a passing run is the same). The user accepted the key substitution in chat ("1. OK"); the earlier-file fixes came from the live runs and carry tests.

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
- ✓ `t10`
- ✗ `t11`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/tools/builtins/jira/__tests__/jira-inputs.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/input.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/limits.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/README.md` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/auth-status-unauthorized.txt` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/auth-status.txt` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/batch-clone.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/batch-edit-success.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/batch-missing-key.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/batch-no-transition.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/batch-partial.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/count.txt` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/visibility-group.txt` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/visibility-role.txt` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-parsers.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/readers.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/_fakeacli.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-argv.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-failures.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/exec.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/attachment-list.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/comment-list.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/comment-update-bad.txt` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/comment-update.txt` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/link-delete.txt` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/link-list.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/link-types.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/watcher-list.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-answers.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-output-schemas.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/answers.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/schemas.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/_sample.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-approval.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-family.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-output-validation.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/family.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/search.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/view.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-workitem-reads.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/workitem.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-workitem-changes.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/batch-comment-create.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-comment-link.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/comment.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/link.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/project-list.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/project-view.json` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-project-auth.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/auth.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/project.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/index.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/_all-ops.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-coverage.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-parser.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-registration.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-spawn-only.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/coverage.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/index.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `docs/plans/tool-registry.md` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-docs.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/jira-live.test.ts` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/project-archive.txt` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/project-create.txt` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/project-delete.txt` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/project-restore.txt` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/fixtures/project-update.txt` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `docs/plans/acli-recorded/jira-live-run-2026-10-26.txt` — **insrc-build** (2026-10-26T06:22:53.903Z)
- `src/daemon/tools/builtins/jira/__tests__/.gitignore` — **insrc-build** (2026-10-26T06:22:53.903Z)
