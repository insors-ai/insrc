<!-- insrc:artifact BUILD-b47dadc7cf0cccb1-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-18T14:39:57.345Z  ·  **Updated:** 2026-10-18T16:57:44.390Z

**Commit:** e222bf76

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

- `.insrc/artifacts/BUILD-11e2b8a74bdff8c8-S001.json` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `.insrc/artifacts/BUILD-b5a62f289cbcdaee-S001.json` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `.insrc/artifacts/CR-11e2b8a74bdff8c8-S001.json` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `.insrc/artifacts/CR-b47dadc7cf0cccb1-S001.json` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `.insrc/artifacts/CR-b5a62f289cbcdaee-S001.json` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `.insrc/artifacts/ISSUE-11e2b8a74bdff8c8.json` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `.insrc/artifacts/ISSUE-b5a62f289cbcdaee.json` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `.insrc/artifacts/PLAN-b47dadc7cf0cccb1-S001.json` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `.insrc/artifacts/TESTS-11e2b8a74bdff8c8-S001.json` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `.insrc/artifacts/TESTS-b5a62f289cbcdaee-S001.json` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `.insrc/build-start/11e2b8a74bdff8c8-S001.json` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `.insrc/build-start/b5a62f289cbcdaee-S001.json` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `docs/standalone/keep-stored-good-summary-when-full-E20261018b5a62f28/ISSUE.md` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `docs/standalone/keep-stored-good-summary-when-full-E20261018b5a62f28/S001/BUILD.md` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `docs/standalone/keep-stored-good-summary-when-full-E20261018b5a62f28/S001/CR.md` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `docs/standalone/keep-stored-good-summary-when-full-E20261018b5a62f28/S001/TESTS.md` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/S001/CR.md` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/S001/smoke.md` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `docs/standalone/show-builder-reported-smoke-live-results-E2026101811e2b8a7/ISSUE.md` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `docs/standalone/show-builder-reported-smoke-live-results-E2026101811e2b8a7/S001/BUILD.md` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `docs/standalone/show-builder-reported-smoke-live-results-E2026101811e2b8a7/S001/CR.md` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `docs/standalone/show-builder-reported-smoke-live-results-E2026101811e2b8a7/S001/TESTS.md` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/daemon/steps/build-step/__tests__/render-trailer.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/daemon/steps/build-step/__tests__/render.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/daemon/steps/build-step/phases/implement.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/daemon/steps/build-step/render.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/daemon/steps/code-review-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/daemon/steps/code-review-step/handler.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/db/__tests__/doc-summary-carry.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/db/doc-summaries.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/prompts/build/implement-task.md` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/code-review/__tests__/diff-attribution.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/code-review/__tests__/grounding-eligibility.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/code-review/__tests__/subject-attribution.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/code-review/__tests__/subject.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/code-review/dimensions/__tests__/reported-tests-view.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/code-review/dimensions/test-record-view.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/code-review/grounding.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/code-review/subject.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/runners/build/__tests__/standalone-record-commit.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/runners/build/__tests__/story-commits.test.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/runners/build/changed-files.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
- `src/workflow/runners/build/story-commits.ts` — **insrc-build** (2026-10-18T16:57:44.390Z)
