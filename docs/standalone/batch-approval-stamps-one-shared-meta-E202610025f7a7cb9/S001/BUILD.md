<!-- insrc:artifact BUILD-5f7a7cb95b643ae5-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-04T15:17:30.878Z  ·  **Updated:** 2026-10-04T16:10:32.571Z

**Commit:** 8de52b0

## Summary

Each Story now gets its own range base, stamped in a non-approvable build-start file when its build begins and moved only after a finished, approved build. The BUILD writers keep that file out of change logs. Both code-review paths measure from the same base, leave the workflow's ledger files out inside git, and fall back step by step to their old behaviour if that fails. Seven tasks; tests run against real git and the real build phases; every mutation of each production change turned its suite red (8, 11, 13, 29, 7, 11 and 20). The daemon validate gate could not run tests in its sandbox, so its per-task verdicts are static readings.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`
- ✗ `t7`

## Changes

- `.insrc/artifacts/PLAN-5f7a7cb95b643ae5-S001.json` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/daemon/tools/builtins/git/__tests__/diff.test.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/daemon/tools/builtins/git/diff.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/mcp/build-step/__tests__/build-start.test.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/mcp/build-step/phases/implement.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/mcp/code-review-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/mcp/code-review-step/handler.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/workflow/code-review/__tests__/diff-grounding.test.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/workflow/code-review/__tests__/subject.test.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/workflow/code-review/grounding.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/workflow/code-review/subject.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/workflow/runners/build/__tests__/changed-files.test.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/workflow/runners/build/__tests__/range-base.test.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/workflow/runners/build/changed-files.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
- `src/workflow/runners/build/range-base.ts` — **insrc-build** (2026-10-04T16:10:32.571Z)
