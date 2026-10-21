<!-- insrc:artifact BUILD-06f196a7ff528143-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-21T05:47:38.616Z  ·  **Updated:** 2026-10-21T09:06:42.228Z

**Commit:** ec90553f

## Summary

git_diff reads numstat with -z and parses literal old/new paths for renames; the body's truncated flag follows the shell's stdoutTruncated; a cut or mid-record numstat read fails the call. splitDiffByFile (now exported for its unit test) decodes git's quoted diff headers. The argv tests in diff.test.ts and git-diff-paths.test.ts now expect -z. Left out: git_show has its own copy of the old numstat parser; it is outside this LLD's surface.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✗ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t9`
- ✓ `t10`
- ✓ `t11`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/tools/builtins/git/__tests__/diff.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/daemon/tools/builtins/git/diff.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/code-review/__tests__/subject-attribution.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/runners/build/__tests__/story-commits.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/runners/build/story-commits.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/daemon/steps/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/runners/build/__tests__/changed-files.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/runners/build/changed-files.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/code-review/__tests__/diff-attribution.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/code-review/__tests__/diff-grounding.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/code-review/__tests__/grounding-eligibility.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/code-review/grounding.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/daemon/steps/code-review-step/handler.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/code-review/__tests__/grounding-ipc.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/code-review/__tests__/runner.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/code-review/__tests__/subject.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/code-review/subject.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/daemon/steps/build-step/__tests__/build-start.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/runners/build/__tests__/completion-record.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/daemon/steps/build-step/validation-checks.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `.insrc/artifacts/LLD-06f196a7ff528143-S001.json` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `docs/standalone/scope-story-s-code-review-what-E2026102106f196a7/S001/LLD.md` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `.insrc/artifacts/PLAN-06f196a7ff528143-S001.json` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `docs/standalone/scope-story-s-code-review-what-E2026102106f196a7/S001/PLAN.md` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/runners/build/__tests__/build-record.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/runners/build/range-base.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
- `src/daemon/tools/builtins/git/__tests__/git-diff-paths.test.ts` — **insrc-build** (2026-10-21T09:06:42.228Z)
