<!-- insrc:artifact BUILD-e4af63128c7cbec2-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-09T07:52:13.312Z  ·  **Updated:** 2026-11-09T09:08:06.224Z

**Commit:** d6331139b

## Summary

Corrected the prior validation findings: existing code/design coordinator progress readers now expose unverified admission diagnostics and design history reads use version-aware permanent records. Actual lifecycle approval followed by guard-only updates and publication replay preserves the original approval/review; unlogged source/metadata edits still reject. The 141 affected regressions, 12 progress checks and 8 publication/approval checks pass. The separate approved SMTP fix now restores global typecheck and passed independent review. Per the approved build sequence, new admission failure emission is connected by the later family adapter tasks t9/t10; production routing changes only at t14.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/shared/__tests__/review-resources.test.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/shared/review-resources.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/code-review/task-review/admission-checkpoint.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/code-review/task-review/checkpoint.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/code-review/task-review/contracts.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/__tests__/fixtures.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/admission-checkpoint.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/checkpoint.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/contracts.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t1.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t10.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t11.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t12.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t13.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t14.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t15.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t16.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t2.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t3.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t4.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t5.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t6.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t7.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t8.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t9.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASKS-e4af63128c7cbec2-s1.json` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `.insrc/artifacts/TASKS-e4af63128c7cbec2-s1.log.jsonl` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/artifact-core/codecs.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/code-review/task-review/admission.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/code-review/task-review/completion.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/code-review/task-review/history.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/code-review/task-review/publication.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/code-review/task-review/record.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/__tests__/admission-history.test.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/approval.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/history.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/provenance.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/publication.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/read.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/results.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/report-log.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/resource-audit.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/code-review/task-review/coordinator.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/code-review/task-review/progress-view.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/coordinator.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
- `src/workflow/review/design-review/progress.ts` — **insrc-build** (2026-11-09T09:08:06.224Z)
