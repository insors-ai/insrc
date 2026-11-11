<!-- insrc:artifact BUILD-3992d2e1e26124dc-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-10T11:27:18.492Z  ·  **Updated:** 2026-11-10T17:38:41.765Z

**Commit:** 660ea82e3

## Summary

Both IDEs correlate managed outcomes by update ID and preserve legacy confirmation. The JetBrains targeted bridge compiles freshness and transport tests in isolation because pre-existing tracker-settings test fixtures fail the wider compile.

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
- ✓ `t12`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/shared/__tests__/daemon-supervisor-protocol.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/shared/daemon-supervisor-protocol.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `build-process-broker.mjs` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/native/darwin-lifecycle/identity.c` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/shared/__tests__/darwin-lifecycle.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/shared/darwin-lifecycle.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/shared/__tests__/installation-mutation-gate.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/shared/installation-mutation-gate.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/__tests__/daemon-supervisor.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/supervisor-socket.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/supervisor.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/__tests__/supervisor-run-files.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/run-file-ownership.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/supervisor-run-files.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/shared/daemon-run-files.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/__tests__/managed-daemon-lifecycle.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/admin-handlers.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/managed-daemon-lifecycle.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/shutdown.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/threads/admin-worker.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/threads/main-services.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `docs/standalone/restore-reliable-daemon-restart-macos-E202611103992d2e1/S001/test-evidence/t6-orbstack-linux.tap` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/bin/insrc-daemon-control.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/bin/insrc-daemon-supervisor.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/cli/services/__tests__/managed-daemon-control.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/cli/services/daemon.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/cli/services/maintenance.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/cli/services/managed-daemon-control.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/shared/managed-daemon-installation.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/__tests__/release-compatibility.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/managed-daemon-probation.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/release-compatibility.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/__tests__/fixtures/managed-update-launch-child.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/__tests__/managed-update-handoff.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/managed-update-handoff.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/managed-update-launch.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/request-context.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/server.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/bin/insrc-daemon-update.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/__tests__/managed-update-transaction.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/managed-update-recovery.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/managed-update-transaction.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/__tests__/legacy-daemon-cutover.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/legacy-daemon-cutover.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/legacy-launch-job.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/__tests__/fixtures/managed-update-ipc-detached.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/__tests__/managed-update-ipc.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/managed-update-ipc.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/daemon/update-runner.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `jetbrains-plugin/__tests__/managed-update-confirmation-gradle.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/DaemonFreshnessFlow.kt` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpcParseTest.kt` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/freshness/DaemonFreshnessFlowTest.kt` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/shared/__tests__/ipc-client.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `src/shared/ipc-client.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `vscode-plugin/src/freshness/__tests__/daemon-freshness.test.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
- `vscode-plugin/src/freshness/daemon-freshness.ts` — **insrc-build** (2026-11-10T17:38:41.765Z)
