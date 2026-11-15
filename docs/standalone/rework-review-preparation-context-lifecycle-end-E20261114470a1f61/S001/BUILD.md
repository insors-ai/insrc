<!-- insrc:artifact BUILD-470a1f61b26b12c6-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-14T12:24:52.408Z  ·  **Updated:** 2026-11-14T18:32:38.272Z

**Commit:** e35232e9f

## Summary

Task 11 adds exact multi-file private cleanup claims for both review families with permanent final-runtime audits and explicit fsync of approval/permanent proof before deletion. Full fault matrices, actual worker-kill recoveries and approval/file/claim mismatch cases passed; default production cutover remains t12.

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
- ✓ `t11`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/threads/__tests__/fixtures/review-preparation/README.md` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/__tests__/fixtures/review-preparation/history.json.gz` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/__tests__/fixtures/review-preparation/manifest.json` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/__tests__/review-preparation-baseline.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/__tests__/helpers/review-production-fixture.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/shared/__tests__/review-preparation.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/shared/review-preparation.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/__tests__/preparation-checkpoint.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/preparation-checkpoint.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/__tests__/review-runtime-store.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/review-runtime-store.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/code-review/task-review/checkpoint.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/config/review-defaults.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/config/review.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/tools/builtins/git/cat-file.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/code-review/task-review/sources.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/__tests__/source-session.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/source-session.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/__tests__/helpers/prepared-context-reader.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/__tests__/review-context-registry.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/review-context-registry.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/prepared-context.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/code-review/task-review/admission.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/code-review/task-review/worker-admission.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/code-preparation.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/__tests__/code-preparation-execution.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/__tests__/design-preparation-execution.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/design-preparation.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/design-review/__tests__/impact-execution.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/design-review/__tests__/recovery.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/design-review/__tests__/subject.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/design-review/coordinator.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/design-review/subject-monitor.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ReviewWorkerProgressDto.kt` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgress.kt` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgressTest.kt` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/design-review-rpc.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/review-service.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/steps/task-review-step.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/task-review-rpc.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/__tests__/helpers/preparation-bridge-worker.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/__tests__/review-preparation-host.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/review-preparation-client.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/review-preparation-host.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/review-workers.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/mcp/__tests__/review-cancellation-wire.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/mcp/__tests__/schema-registry.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/mcp/code-review/schema.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/mcp/design-review/schema.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/shared/review-worker-progress.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/__tests__/history-binding.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/__tests__/preparation-progress.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/preparation-progress.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/artifact-core/codecs.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/code-review/task-review/completion.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/code-review/task-review/contracts.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/code-review/task-review/history.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/code-review/task-review/publication.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/code-review/task-review/record.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/__tests__/prepared-publication.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/design-review/approval.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/design-review/history.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/design-review/publication.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/history-binding.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/publication-proof.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/daemon/threads/__tests__/helpers/prepared-cleanup-worker.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/__tests__/prepared-cleanup.test.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/__tests__/prepared-publication-fixture.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/cleanup-authorization.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/cleanup-claim-files.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/cleanup-claim.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/cleanup-context-ownership.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
- `src/workflow/review/history-evidence.ts` — **insrc-build** (2026-11-14T18:32:38.272Z)
