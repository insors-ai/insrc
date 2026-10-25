<!-- insrc:artifact BUILD-b7a68147dcf72034-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-24T18:48:54.780Z  ·  **Updated:** 2026-10-24T20:34:21.426Z

**Commit:** fd9380674

## Summary

Ran the full sweep once, in foreground chunks over every directory of src and vscode-plugin/src, and compared it by test name with the sweep after s1. Every earlier failure is still there and none is in a file this Story touched; one failure is new (artifact-write-inventory.test.ts) and comes from the daemon-shutdown commits made on this branch while s4 was built (src/bin/insrc-shutdown-watchdog.ts, src/daemon/run-file-ownership.ts, src/shared/daemon-run-files.ts, src/daemon/lifecycle.ts), not from s4. Results and the per-directory table are in docs/plans/tool-registry.md (section 's4 full sweep').

## Tasks validated

- ✗ `t1`
- ✓ `t2`
- ✗ `t3`
- ✗ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✗ `t10`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/amend.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/blame.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/branch.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/checkout.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/cherry-pick.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/commit.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/diff.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/fetch.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/helpers.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/index.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/log.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/merge.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/pull.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/push.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/rebase.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/remote.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/reset.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/revert.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/show.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/stage.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/stash.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/status.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/tag.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/worktree.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/shell-helper.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/__tests__/fixtures/failure-baseline.json` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/__tests__/fixtures/failure-calls.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `docs/plans/tool-registry.md` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/__tests__/shell-helper-bytes.test.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/git-isolation.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/__tests__/git-parsers.test.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/parsers.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/__tests__/_repo.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/schemas.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/__tests__/approval-class-mapping.test.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/cat-file.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/for-each-ref.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/ls-files.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/ls-tree.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/rev-list.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/rev-parse.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/__tests__/git-path-history.test.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/fetch-refs.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/hash-object.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/merge-base.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/path-history.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/show-ref.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/symbolic-ref.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `docs/daemon.md` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/builtins/git/coverage.ts` — **insrc-build** (2026-10-24T20:34:21.426Z)
- `src/daemon/tools/__tests__/fixtures/approval-snapshot.json` — **insrc-build** (2026-10-24T20:34:21.426Z)
