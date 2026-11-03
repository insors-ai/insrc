<!-- insrc:artifact BUILD-9ac84abac177b399-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-03T14:13:12.532Z  ·  **Updated:** 2026-11-03T14:53:10.577Z

**Commit:** 616eb489b

## Summary

Added src/daemon/__tests__/git-hooks-real-git.test.ts: a temporary remote and two clones, hooks installed through repo.gitHooks.install; a real merging git pull runs post-merge and a real git pull --rebase runs post-rewrite (the recording stand-in entry gets the repository root and hook name and exits 1), git exits 0 each time, and with the entry file deleted a pull --rebase still exits 0 and status still shows both blocks. Documented the feature and its limits (terminal push gap, hook managers, foreign early exit, worktrees, moved daemon, explicit refresh) in docs/plans/team-workflow.md. The sweep ran by area against a clean base worktree (52c23f143) and is recorded in S001/SWEEP.md: identical failures except repo-call-audit and repo-call-table, which fail only on the other session's design-review-step.recover/failure phases; the gitHooks methods they first reported were fixed by listing them in handler-runtime.ts text.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/tracker-sync-method.test.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/daemon/tracker-setup-handlers.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/daemon/__tests__/repo-settings.test.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `package.json` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/bin/__tests__/insrc-git-hook.test.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/bin/insrc-git-hook.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/daemon/git-hooks/__tests__/hook-block.test.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/daemon/git-hooks/hook-block.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/daemon/git-hooks/__tests__/hook-inspect.test.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/daemon/git-hooks/hook-inspect.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/daemon/__tests__/git-hooks-methods.test.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/daemon/git-hooks-methods.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/daemon/repo-call-audit.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/daemon/repo-settings.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `docs/plans/team-workflow.md` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `src/daemon/__tests__/git-hooks-real-git.test.ts` — **insrc-build** (2026-11-03T14:53:10.577Z)
- `docs/standalone/install-git-hooks-refresh-tracker-status-E202611039ac84aba/S001/SWEEP.md` — **insrc-build** (2026-11-03T14:53:10.577Z)
