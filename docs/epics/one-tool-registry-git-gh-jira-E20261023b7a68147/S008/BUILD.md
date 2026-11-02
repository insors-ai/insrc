<!-- insrc:artifact BUILD-b7a68147dcf72034-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-11-02T11:25:07.236Z  ·  **Updated:** 2026-11-02T12:56:33.653Z

**Commit:** e9b399b45

## Summary

Close-out of s8: 13 commands excluded with reasons, no row assigned, inventory and snapshot tests updated, s8 outcome and full-sweep record written. After the first validation the controller's review added the ext:: guard for git submodule and three op-table tests (timeout, missing git, per-input class); the full s8 test set was re-run.

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

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/tools/builtins/git/__tests__/op-table.test.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/op-table.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `docs/daemon.md` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/__tests__/git-inspect.test.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/coverage.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/definitions.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/inspect.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/safe-args.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/__tests__/git-text.test.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/text.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/__tests__/git-objects.test.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/objects.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/__tests__/git-patch.test.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/patch.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/__tests__/git-tree.test.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/tree.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/__tests__/git-maintenance.test.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/__tests__/git-setup.test.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/maintenance.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/reflog.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/refs.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/setup.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/builtins/git/extended.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `docs/plans/tool-registry.md` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/__tests__/approval-class-mapping.test.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `src/daemon/tools/__tests__/typed-git-tools.test.ts` — **insrc-build** (2026-11-02T12:56:33.653Z)
- `docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S008/CODE-SELF-REVIEW.md` — **insrc-build** (2026-11-02T12:56:33.653Z)
