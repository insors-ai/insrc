<!-- insrc:artifact BUILD-f9ced66a0e8835b8-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-08T08:26:39.223Z  ·  **Updated:** 2026-10-08T09:48:23.895Z

**Commit:** 526dc4f6

## Summary

Both build phases refuse with a retryable merge-in-progress error while a merge or squash is uncommitted, before any other work; both implement prompts carry the --no-ff merge rule from one MERGE_RULE constant.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

## Changes

- `.insrc/artifacts/ISSUE-f9ced66a0e8835b8.json` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `.insrc/artifacts/LLD-f9ced66a0e8835b8-s1.json` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `.insrc/artifacts/PLAN-f9ced66a0e8835b8-s1.json` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `docs/standalone/story-code-review-reviews-wrong-code-E20261007f9ced66a/S001/LLD.md` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `docs/standalone/story-code-review-reviews-wrong-code-E20261007f9ced66a/S001/PLAN.md` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/agent/providers/__tests__/cli-subprocess.test.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/daemon/tools/builtins/git/__tests__/git-diff-paths.test.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/daemon/tools/builtins/git/diff.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/mcp/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/mcp/build-step/__tests__/render.test.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/mcp/build-step/phases/implement.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/mcp/build-step/render.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/prompts/build/implement-task.md` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/workflow/code-review/__tests__/diff-grounding.test.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/workflow/code-review/dimensions/__tests__/code-review-cwd.test.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/workflow/code-review/dimensions/adherence.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/workflow/code-review/dimensions/conventions.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/workflow/code-review/dimensions/functional-coverage.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/workflow/code-review/dimensions/quality.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/workflow/code-review/grounding.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/workflow/runners/build/__tests__/changed-files.test.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/workflow/runners/build/__tests__/story-commits.test.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/workflow/runners/build/changed-files.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
- `src/workflow/runners/build/story-commits.ts` — **insrc-build** (2026-10-08T09:48:23.895Z)
