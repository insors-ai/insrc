<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-11T09:49:16.267Z  ·  **Updated:** 2026-10-11T10:38:18.205Z

**Commit:** ec94718e

## Summary

reviewArtifactFile, runReview and gatherEvidence take an optional reader of a repository's indexed entities and pass it to resolveSourceRoots. The CLI's review service passes one that calls the new read-only daemon request repo.entitiesForSourceRoots (src/daemon/source-roots-rpc.ts), which returns the repository's file entities; a review inside the daemon and the MCP server's review step pass nothing. When the reader fails the review falls back to the repository root and says so and why (ReviewReport.sourceRootFallback, the written document, the CLI summary). Found on the way, for Task t9: src/workflow/review/__tests__/probe-source-roots.test.ts calls gatherEvidence with the default reader and no temporary store path, so it reaches the live store.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/LLD.md` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/PLAN.md` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DaemonConfigurable.kt` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonStatusGatewayTest.kt` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/cli/__tests__/command.test.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/cli/panes/DaemonPane.tsx` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/cli/services/__tests__/daemon-stop-forced.test.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/cli/services/__tests__/daemon-stop.test.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/cli/services/__tests__/review-source-roots-daemon.test.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/cli/services/daemon.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/cli/services/maintenance.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/cli/services/workflow.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/daemon/__tests__/shutdown-store-failure.test.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/daemon/__tests__/status-store-failure.test.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/daemon/fatal.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/daemon/shutdown.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/daemon/source-roots-rpc.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/db/graph/__tests__/helpers/store-child-driver.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/db/graph/__tests__/lock-loss-detection.test.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/db/graph/__tests__/lock-loss-reproduction.test.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/db/graph/__tests__/store-health.test.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/workflow/review/__tests__/source-root-reader.test.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/workflow/review/probe.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/workflow/review/report.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/workflow/review/review.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/workflow/review/source-roots.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `src/workflow/review/types.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `vscode-plugin/src/panels/__tests__/daemon-gateway.test.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
- `vscode-plugin/src/panels/daemon-gateway.ts` — **insrc-build** (2026-10-11T10:38:18.205Z)
