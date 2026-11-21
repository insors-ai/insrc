<!-- insrc:artifact BUILD-175ab0d1d56838a9-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-21T04:49:50.725Z  ·  **Updated:** 2026-11-21T13:30:19.697Z

**Commit:** 71446ab78

## Summary

Qualified owned Node22.22.1/npm10.9.4 on macOS arm64 and OrbStack Ubuntu24.04 Linux arm64/x64 with real installs/full builds/native loads and real Linux daemon start/status/restart/stop, exact kernel executable identities and confirmed cleanup. Corrected Python cache mutation and portable archive metadata. Owned shell and shared build environments now default ONNXRUNTIME_NODE_INSTALL_CUDA=skip only when absent, preserving explicit values including empty; regenerated client assets and passed actual shell/TUI npm inheritance tests. On OrbStack x64, with caller CUDA variables absent, both real ONNX 1.21.0/1.19.2 postinstall scripts succeeded with the automatic default; CPU binding loaded and trusted cache verification passed. Evidence: docs/plans/node-runtime-evidence/qualification-linux-orbstack.md and qualification-darwin-arm64.md. Both test machines stopped; no remaining owned actors/leases. Linux x64 is emulated, full builds used 8 GB per VM; no physical x86, GPU/inference, full sweep, IDE UI or signed Linux bundle qualification claimed. Intel macOS disabled, Windows unsupported. Human BUILD approval pending; automated reviews unavailable.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `copy-assets.mjs` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `docs/plans/node-runtime-evidence/README.md` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `docs/plans/node-runtime-evidence/SHASUMS256.txt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `docs/plans/node-runtime-evidence/SHASUMS256.txt.sig` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `docs/plans/node-runtime-evidence/release-key.asc` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `docs/plans/node-runtime-evidence/verification.txt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/src/main/resources/insrc/node-runtime-policy.json` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/__tests__/node-runtime-policy.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/node-runtime-policy.mjs` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/node-runtime-policy.sh` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/sync-node-runtime-policy.mjs` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/assets/node-runtime-policy.json` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/assets/node-runtime-policy.json` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `docs/plans/node-runtime-evidence/bootstrap-smoke.md` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/__tests__/node-runtime-store.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/node-runtime-store.mjs` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/provision-node-runtime.sh` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/__tests__/node-runtime-bootstrap-native.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/node-runtime-archive.sh` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `docs/plans/node-runtime-evidence/shell-execution.md` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/__tests__/node-runtime-shell-native.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/insrc-daemon-install.sh` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/node-runtime-env.sh` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/cli/services/__tests__/daemon-ctl-install-marker.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/daemon/__tests__/daemon-ctl-node-path.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/daemon/__tests__/daemon-ctl-source.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/daemon/__tests__/macos-upgrade-routing.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/shared/__tests__/fixtures/control-runtime.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `package-lock.json` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `package.json` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/__tests__/helpers/owned-source-fixture.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/__tests__/node-runtime-cli-native.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/insrc` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/insrc-mcp` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/cli/services/__tests__/maintenance-install-marker.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/cli/services/__tests__/managed-daemon-control.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/cli/services/__tests__/owned-runtime.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/cli/services/daemon.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/cli/services/maintenance.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/cli/services/owned-runtime.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/verify-installed-runtime.mjs` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `docs/plans/node-runtime-evidence/client-packaging.md` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/__tests__/node-runtime-gradle.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/build.gradle.kts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunner.kt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleContracts.kt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleModel.kt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleService.kt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultNodeRuntimeResolver.kt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultPrivateNodeProvisioner.kt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/ScriptDaemonProvisioner.kt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonProvisionerTest.kt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/NodeRuntimeResolverTest.kt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/PrivateNodeProvisionerTest.kt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/test-bridge/run-focused-junit.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/__tests__/node-runtime-packaging.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/__tests__/package-daemon-candidate.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/__tests__/package-linux-daemon-candidate.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/bundle-release-bootstrap.mjs` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/node-runtime-assets.mjs` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/package-daemon-bootstrap.mjs` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/package-daemon-candidate.mjs` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/sync-client-runtime-assets.mjs` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/assets/insrc-daemon-install.sh` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/src/daemon/__tests__/controller.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/src/daemon/__tests__/runtime-boundary.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/src/daemon/controller.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/src/daemon/subprocess.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/InsrcMcpRegistration.kt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/host/RegistrationCompositionTest.kt` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/src/daemon/__tests__/commands.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/src/daemon/commands.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/src/hosts/__tests__/adapter.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/src/hosts/__tests__/writers.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/src/hosts/adapter.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/src/hosts/mcp-writer.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `AGENTS.md` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `CLAUDE.md` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `docs/daemon.md` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `docs/plans/node-runtime-evidence/migration.md` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `docs/testing.md` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/__tests__/node-runtime-migration-native.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/bin/insrc-daemon-control.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/bin/insrc-runtime-smoke.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/daemon/__tests__/legacy-runtime-record.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/daemon/__tests__/managed-release-staging.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/daemon/legacy-cutover-admission.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/daemon/managed-release-staging.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/daemon/managed-update-preparation.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `src/shared/owned-node-runtime.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `docs/plans/node-runtime-evidence/qualification-darwin-arm64.md` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/src/daemon/__tests__/bundle.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `vscode-plugin/src/hosts/__tests__/activation.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/__tests__/node-runtime-coordinator-native.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `docs/plans/node-runtime-evidence/qualification-linux-orbstack.md` — **insrc-build** (2026-11-21T13:30:19.697Z)
- `scripts/__tests__/node-runtime-python-native.test.ts` — **insrc-build** (2026-11-21T13:30:19.697Z)
