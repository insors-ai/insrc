<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-11T09:49:16.267Z  ·  **Updated:** 2026-10-11T10:11:32.404Z

**Commit:** 7d18c49e

## Summary

DaemonStatus gains the optional storeFailure field. The status payload is built by a new src/daemon/status.ts, which guards the store read of the repository list: with the store failed the request answers with an empty list and the cause. The cause line is shown by the CLI's daemon pane and status command, the VS Code plugin's daemon view (which imports the shared type) and the JetBrains plugin's daemon settings page (DaemonStatusDto.storeFailureCause and storeFailureRow). The JetBrains part is covered by a Kotlin test in DaemonStatusGatewayTest, which the gate cannot run; it was run locally with Gradle under JDK 21 (7 tests, 0 failures).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/LLD.md` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/PLAN.md` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DaemonConfigurable.kt` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonStatusGatewayTest.kt` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/cli/__tests__/command.test.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/cli/panes/DaemonPane.tsx` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/cli/services/__tests__/daemon-stop-forced.test.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/cli/services/__tests__/daemon-stop.test.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/cli/services/daemon.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/cli/services/maintenance.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/daemon/__tests__/status-store-failure.test.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/db/graph/__tests__/helpers/store-child-driver.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/db/graph/__tests__/lock-loss-detection.test.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/db/graph/__tests__/lock-loss-reproduction.test.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/db/graph/__tests__/store-health.test.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `vscode-plugin/src/panels/__tests__/daemon-gateway.test.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
- `vscode-plugin/src/panels/daemon-gateway.ts` — **insrc-build** (2026-10-11T10:11:32.404Z)
