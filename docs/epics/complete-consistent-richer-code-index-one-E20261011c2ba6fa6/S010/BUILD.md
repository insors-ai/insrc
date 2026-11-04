<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s10 -->

# Build (plan-driven) — Story s10

**Standalone:** no  ·  **Created:** 2026-11-04T05:25:24.967Z  ·  **Updated:** 2026-11-04T07:13:02.393Z

**Commit:** c7140757c

## Summary

Document-relations status (switch, figures, extraction cause) is read by withCompleteness for repo.list, repo.stats and the status board, and rendered by the CLI ReposPane, the VS Code repository list and the JetBrains RepoStatusDialog; completeness is unchanged.

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

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/db/__tests__/doc-relations-store.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/db/__tests__/subsystem-tables.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/db/doc-relations.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/db/entities.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/db/repos.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/indexer/parser/__tests__/markdown-links.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/indexer/parser/artifact.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/indexer/parser/markdown-links.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/indexer/__tests__/doc-links-commit.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/config/role-taxonomy.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/indexer/__tests__/doc-relations-provider.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/indexer/doc-relations-provider.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/daemon/doc-relations-rpc.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/db/__tests__/doc-relations-read.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/indexer/doc-relations-read.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/daemon/threads/summary-link.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/indexer/__tests__/doc-relations-jobs.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/indexer/doc-relations-measure.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/indexer/doc-relations-pass.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/indexer/__tests__/doc-relations-pass.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/prompts/analyze/doc-relations.system.md` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/indexer/__tests__/doc-relations-measure.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/analyze/context/__tests__/run-shaper-wiring.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/analyze/context/schema.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/analyze/context/types.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/analyze/explore/__tests__/doc-relations-attach.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/analyze/explore/__tests__/failed-lookups.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/analyze/explore/doc-relations-attach.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/analyze/explore/usage-example.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/analyze/explore/__tests__/helpers/mid-tier-home.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `jetbrains-plugin/__tests__/s10-gradle.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/actions/RepoStatusDialog.kt` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/actions/DocRelationsRowsTest.kt` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/cli/panes/ReposPane.tsx` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/cli/panes/__tests__/ReposPane-doc-relations.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/daemon/__tests__/doc-relations-status.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/daemon/repo-completeness.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `src/shared/doc-relations-status.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `vscode-plugin/src/panels/daemon-gateway.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `vscode-plugin/src/panels/detail-renderers.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `vscode-plugin/src/panels/types.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
- `vscode-plugin/src/panels/__tests__/doc-relations-status.test.ts` — **insrc-build** (2026-11-04T07:13:02.393Z)
