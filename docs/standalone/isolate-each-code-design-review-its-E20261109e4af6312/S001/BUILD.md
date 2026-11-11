<!-- insrc:artifact BUILD-e4af63128c7cbec2-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-09T07:52:13.312Z  ·  **Updated:** 2026-11-11T16:04:20.516Z

**Commit:** aa9aa072f

## Summary

Design review now uses durable background worker admission and the existing coordinator's ancestry, author independence, chunk/impact/retry and latest-artifact policies. Per user clarification, recovery packets persist as unverified actions on the source attempt before acknowledgment, then qualify or retain pointed technical failures without replacing accepted feedback. Real registry tests cover cold resume, controller generation fencing, impact-selected work and approved full restart; production route cutover remains Task 14.

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

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/shared/__tests__/review-resources.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/shared/review-resources.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/admission-checkpoint.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/checkpoint.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/contracts.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/__tests__/fixtures.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/admission-checkpoint.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/checkpoint.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/contracts.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t1.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t10.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t11.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t12.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t13.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t14.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t15.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t16.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t2.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t3.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t4.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t5.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t6.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t7.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t8.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASK-e4af63128c7cbec2-s1-t9.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASKS-e4af63128c7cbec2-s1.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/TASKS-e4af63128c7cbec2-s1.log.jsonl` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/artifact-core/codecs.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/admission.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/completion.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/history.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/publication.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/record.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/__tests__/admission-history.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/approval.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/history.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/provenance.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/publication.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/read.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/results.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/report-log.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/resource-audit.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/coordinator.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/progress-view.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/coordinator.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/progress.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/__tests__/review-processes.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/review-processes.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/tools/shell-helper.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/shared/process-group.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/agent/providers/__tests__/review-worker-process.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/shared/review-native.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/shared/review-process-bridge.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/agent/providers/__tests__/helpers/review-process-worker.mjs` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/PLAN.md` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/__tests__/helpers/review-shell-host.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/__tests__/review-spawn-inventory.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/tools/__tests__/review-worker-shell.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/tools/review-shell-process.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/shared/review-native-guard.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/shared/vibe-session.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/__tests__/helpers/review-bootstrap-hang.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/review-worker-admission.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/review-worker-bootstrap.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/review-worker-contract.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/review-worker-native.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/review-worker-runtime.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/review-worker.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/workers.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/__tests__/review-workers.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/review-native-host.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/review-worker-resources.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/review-workers.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/__tests__/admission.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/controller.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/progress.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/worker-admission.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/code-review/task-review/worker-checkpoint.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/__tests__/helpers/worker-admission.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/__tests__/worker-admission.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/worker-admission.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/worker-checkpoint.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/__tests__/action-admission.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/action-admission.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/action-state.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/recovery-state.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
- `src/workflow/review/design-review/request-signature.ts` — **insrc-build** (2026-11-11T16:04:20.516Z)
