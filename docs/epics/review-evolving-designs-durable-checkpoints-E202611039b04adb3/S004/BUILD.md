<!-- insrc:artifact BUILD-9b04adb36cac716d-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-11-07T19:47:05.310Z  ·  **Updated:** 2026-11-08T06:43:32.591Z

**Commit:** 31ac0dec8

## Summary

Deterministic (not hosted-model) compiled normal MCP/daemon qualification passed both reviewer parties across DEF/HLD/LLD, registered MCP approval, private-claim cleanup and fresh coordinator permanent reads. Production npm build passes (/tmp/s4-t8-production-build.log); focused design/storage regressions 133/133, updated design approval regressions 36/36, combined MCP/current-code-review smoke 8/8. Fault qualification fixed a required final Markdown CAS gap by persisting a bounded document hash in the existing journal; stage/append edits fail closed even after restart, with one entry and no model replay. VS Code parser and shared JetBrains fixture/test exist; JVM execution remains blocked by unchanged SaveResult.Saved constructor error in DaemonGateway.kt. Broader obsolete approval tests still target the deliberately retired legacy code-review engine and are not claimed passing. No activation subsystem, legacy execution or raw approval bypass added.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✗ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-9b04adb36cac716d-s4.json` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `.insrc/artifacts/LLD-9b04adb36cac716d-s4.log.jsonl` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `.insrc/artifacts/PLAN-9b04adb36cac716d-s4.json` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `.insrc/artifacts/PLAN-9b04adb36cac716d-s4.log.jsonl` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t1.json` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t2.json` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t3.json` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t4.json` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t5.json` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t6.json` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t7.json` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t8.json` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t9.json` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `.insrc/artifacts/TASKS-9b04adb36cac716d-s4.json` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `.insrc/artifacts/TASKS-9b04adb36cac716d-s4.log.jsonl` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S004/LLD.md` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S004/PLAN.md` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S004/sequence-diagram.html` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/__tests__/history-aggregate.test.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/__tests__/impact-contracts.test.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/checkpoint.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/contracts.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/history.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/provenance.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/results.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/__tests__/capacity.test.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/capacity.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/coordinator.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/artifact-core/__tests__/design-history-storage.test.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/artifact-core/journal.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/artifact-core/sidecar-store.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/artifact-core/sidecar.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/artifact-core/store.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/artifact-core/history.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/artifact-core/types.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/daemon/design-review-rpc.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/__tests__/publication.test.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/__tests__/recovery.test.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/progress.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/publication.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/subject.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/cli/command.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/cli/services/workflow.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/mcp/__tests__/design-review.test.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/artifact-content.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/delivery/gate.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/delivery/types.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/__tests__/readers.test.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/read.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/report-file.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/report-log.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/tracker-auto.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ArtifactContentTest.kt` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/__tests__/fixtures/artifact-review-wire.json` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/artifact-core/lifecycle-service.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/__tests__/approval.test.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/approval.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/fence.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/__tests__/cleanup.test.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/cleanup.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/mcp/__tests__/helpers/design-review-stdio.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/__tests__/gates-lifecycle-service.test.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/__tests__/other-party-review-gate.test.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
- `src/workflow/review/design-review/__tests__/persistence-fence.test.ts` — **insrc-build** (2026-11-08T06:43:32.591Z)
