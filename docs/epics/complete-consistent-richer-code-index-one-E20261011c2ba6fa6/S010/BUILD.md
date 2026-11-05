<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s10 -->

# Build (plan-driven) — Story s10

**Standalone:** no  ·  **Created:** 2026-11-04T05:25:24.967Z  ·  **Updated:** 2026-11-05T04:32:36.489Z

**Commit:** 992618f97

## Summary

Document relationships built (t1-t11). Live measurement on this repository with gpt-6.1-sol after the code-review fix: 961 implied links, precision 0.794, recall 0.136, extractedRecovery 1.0 (first run before the fix: 0.778 / 0.150), so the switch stays off, the valid lc1 outcome. Installed daemon: written links as REFERENCES/extracted; repo.stats docRelations shows the figures and, live, unavailable with its reason. Manual code review (2 rounds, CR.md): one MED and two LOW fixed in 5c5bc0cf1, five LOW left open. t11's sweep check is accepted with an override by the user: no test fails deterministically at HEAD, and under equal load the pre-s10 tree fails more (54 vs 34; t11-sweep.md).

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
- ✗ `t11`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/db/__tests__/doc-relations-store.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/db/__tests__/subsystem-tables.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/db/doc-relations.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/db/entities.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/db/repos.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/indexer/parser/__tests__/markdown-links.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/indexer/parser/artifact.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/indexer/parser/markdown-links.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/indexer/__tests__/doc-links-commit.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/config/role-taxonomy.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/indexer/__tests__/doc-relations-provider.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/indexer/doc-relations-provider.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/daemon/doc-relations-rpc.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/db/__tests__/doc-relations-read.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/indexer/doc-relations-read.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/daemon/threads/summary-link.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/indexer/__tests__/doc-relations-jobs.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/indexer/doc-relations-measure.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/indexer/doc-relations-pass.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/indexer/__tests__/doc-relations-pass.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/prompts/analyze/doc-relations.system.md` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/indexer/__tests__/doc-relations-measure.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/analyze/context/__tests__/run-shaper-wiring.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/analyze/context/schema.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/analyze/context/types.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/analyze/explore/__tests__/doc-relations-attach.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/analyze/explore/__tests__/failed-lookups.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/analyze/explore/doc-relations-attach.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/analyze/explore/usage-example.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/analyze/explore/__tests__/helpers/mid-tier-home.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `jetbrains-plugin/__tests__/s10-gradle.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/actions/RepoStatusDialog.kt` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/actions/DocRelationsRowsTest.kt` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/cli/panes/ReposPane.tsx` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/cli/panes/__tests__/ReposPane-doc-relations.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/daemon/__tests__/doc-relations-status.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/daemon/repo-completeness.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/shared/doc-relations-status.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `vscode-plugin/src/panels/daemon-gateway.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `vscode-plugin/src/panels/detail-renderers.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `vscode-plugin/src/panels/types.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `vscode-plugin/src/panels/__tests__/doc-relations-status.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/analyze/orchestrator/__tests__/run-order.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `vscode-plugin/src/panels/__tests__/repo-config.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S010/t11-sweep.md` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s10.json` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S010/PLAN.md` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-11-05T04:32:36.489Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S010/t11-evidence.md` — **insrc-build** (2026-11-05T04:32:36.489Z)
