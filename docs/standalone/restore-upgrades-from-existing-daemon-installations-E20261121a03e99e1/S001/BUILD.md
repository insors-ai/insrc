<!-- insrc:artifact BUILD-a03e99e17a364550-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-21T17:48:45.684Z  ·  **Updated:** 2026-11-22T12:11:16.574Z

**Commit:** ee97116b4

## Summary

Qualified the real a30aa7f91 macOS application from external Node22.23.2 to independently provisioned Node22.22.1/npm10.9.4, then a subsequent update, actual native-build refusal, probation rollback/clean retry, IPC graph/vector/session/config retention, selected restart and real MCP routing. Qualification exposed and corrected Node injection in generated migration launchers, retaining older-fence recovery; affected IDE routing/native regressions and owned-process closure passed.

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

- `docs/plans/node-runtime-evidence/source-upgrade-bootstrap.md` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/source-upgrade-qualification-native.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/bundle-release-bootstrap.mjs` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/prepare-source-release.mjs` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/bin/insrc-release-bootstrap.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/__tests__/managed-release-bootstrap.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/__tests__/source-release-promotion.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/managed-release-staging.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/managed-update-preparation.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/release-compatibility.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/source-release-qualification.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/shared/source-release-compatibility.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/shared/source-release-target.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `.insrc/artifacts/TASKS-a03e99e17a364550-s1.log.jsonl` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `docs/plans/node-runtime-evidence/source-installation-state.md` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/shared/__tests__/source-installation.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/shared/managed-source-release.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/shared/source-installation.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `docs/plans/node-runtime-evidence/source-predecessor-recovery.md` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/source-predecessor-native.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/bin/insrc-runtime-smoke.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/bin/insrc-source-recovery.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/source-predecessor.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `docs/plans/node-runtime-evidence/source-update-transaction.md` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/__tests__/helpers/source-linux.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/__tests__/source-update-transaction.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/source-update-transaction.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `build-process-broker.mjs` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `docs/plans/node-runtime-evidence/source-entrypoints.md` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/bin/insrc-source-startup-barrier.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/native/source-actor/main.c` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/shared/__tests__/source-actor-native.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/shared/source-actor-client.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/source-bootstrap-inventory.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/source-store-inspection.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/source-store-probe.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/__tests__/source-transaction-host.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/source-transaction-host.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/shared/__tests__/source-actor-boot.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/source-entrypoints-native.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/insrc-daemon-install.sh` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/bin/insrc-source-control.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `docs/plans/node-runtime-evidence/source-consumers.md` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/shared/source-routing.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/helpers/owned-source-fixture.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/helpers/source-entrypoint-authority.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/node-runtime-cli-native.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/package-daemon-candidate.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/package-linux-daemon-candidate.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/source-consumers-native.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/insrc` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/insrc-mcp` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/package-daemon-candidate.mjs` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/source-selection-env.sh` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/cli/__tests__/maintenance-source.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/cli/services/__tests__/maintenance-install-marker.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/cli/services/__tests__/maintenance-reconcile.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/cli/services/__tests__/maintenance-steering-refresh.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/cli/services/daemon.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/cli/services/maintenance.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/admin-handlers.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/managed-update-ipc.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/source-update-launch.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/shared/source-update-outcomes.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/__tests__/helpers/source-transaction-fixture.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/__tests__/source-update-outcomes.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `docs/plans/node-runtime-evidence/ide-consumers.md` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `jetbrains-plugin/__tests__/managed-update-confirmation-gradle.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `jetbrains-plugin/__tests__/source-bootstrap-gradle.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `jetbrains-plugin/build.gradle.kts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/InstalledCommitFreshnessConsumer.kt` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/InsrcMcpRegistration.kt` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunner.kt` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleContracts.kt` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleService.kt` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/NativeChildEnvironment.kt` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/ScriptDaemonProvisioner.kt` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/freshness/InstalledCommitFreshnessConsumerTest.kt` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonProvisionerTest.kt` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/SourceBootstrapIntegrationTest.kt` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/helpers/source-entrypoint-matrix.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/ide-source-entrypoints-native.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/node-runtime-packaging.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/node-runtime-assets.mjs` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/sync-client-runtime-assets.mjs` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `vscode-plugin/assets/insrc-daemon-install.sh` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `vscode-plugin/src/daemon/__tests__/controller.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `vscode-plugin/src/daemon/controller.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `vscode-plugin/src/daemon/paths.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `vscode-plugin/src/daemon/subprocess.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `vscode-plugin/src/freshness/__tests__/extension-wiring.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `vscode-plugin/src/hosts/adapter.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `docs/plans/node-runtime-evidence/source-fault-gates.md` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/__tests__/source-interruption.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/__tests__/legacy-cutover-admission.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/legacy-cutover-admission.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `docs/plans/node-runtime-evidence/historical-macos-upgrade.md` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/helpers/historical-daemon-qualification.mjs` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/helpers/historical-mac-live.mjs` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `scripts/__tests__/historical-macos-upgrade-native.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
- `src/daemon/__tests__/macos-upgrade-routing.test.ts` — **insrc-build** (2026-11-22T12:11:16.574Z)
