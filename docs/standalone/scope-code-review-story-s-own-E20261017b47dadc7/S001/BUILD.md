<!-- insrc:artifact BUILD-b47dadc7cf0cccb1-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-18T14:39:57.345Z  ·  **Updated:** 2026-10-18T15:51:16.396Z

**Commit:** b7ad69db

## Summary

Built ISSUE-b47dadc7 S001: every build commit carries Insrc-Story; storyChangeSet, changedFiles, the review subject, the diff review and the BUILD record's commit are scoped by it (first-parent range as the fallback, recorded as changeSetAttribution); coverage judges only functions/methods/classes in non-test files with an evidence class each, and lowers any HIGH the evidence does not support, on both the daemon and controller paths. Shipped at 32dfd033; on the installed daemon this Story's review covered exactly its 26 own files (story-trailer) and ISSUE-ae864466's re-review had no coverage findings on Markdown or test files.

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

- `.insrc/artifacts/PLAN-b47dadc7cf0cccb1-S001.json` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/S001/smoke.md` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/daemon/steps/build-step/__tests__/render-trailer.test.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/daemon/steps/build-step/__tests__/render.test.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/daemon/steps/build-step/phases/implement.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/daemon/steps/build-step/render.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/daemon/steps/code-review-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/daemon/steps/code-review-step/handler.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/prompts/build/implement-task.md` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/code-review/__tests__/diff-attribution.test.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/code-review/__tests__/grounding-eligibility.test.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/code-review/__tests__/subject-attribution.test.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/code-review/__tests__/subject.test.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/code-review/grounding.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/code-review/subject.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/runners/build/__tests__/standalone-record-commit.test.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/runners/build/__tests__/story-commits.test.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/runners/build/changed-files.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
- `src/workflow/runners/build/story-commits.ts` — **insrc-build** (2026-10-18T15:51:16.396Z)
