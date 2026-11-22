# Daemon installer and lifecycle replacement scope

**Latest corpus check:** candidate/source hashes and current import boundaries are unchanged; the analyzer still serves the prior index timestamp, so changed-corpus freshness is unconfirmed. See the [repeat validation result](install-upgrade-candidate-revalidation.md#repeat-validation-after-reported-corpus-change).

**Revalidated 2026-11-22:** [corrections and evidence](install-upgrade-candidate-revalidation.md). Branch `installer`, HEAD `69b8145359d4f201d9e80da1baa4e9fed9067271`. No deletion performed.

The user’s criterion: every file exclusively implementing daemon install/upgrade/start/stop/restart and its dedicated tests is a candidate, even when actively used. Shared functionality is preserved; active callers become rewiring obligations.

**278 whole-file candidates** across **449 classified entries** (446 original inventory entries plus three newly identified dedicated test files).

| Disposition | Files |
|---|---:|
| Implementation/scripts/assets/lifecycle CI candidates | 143 |
| Dedicated test files | 115 |
| Dedicated test helpers/fixtures | 20 |
| Mixed files: lifecycle extraction only | 19 |
| Outside exclusive scope / shared functionality | 120 |
| Preserve documentation/evidence/steering | 32 |

See [JSON classifications](install-upgrade-scope-candidates.json) for each reason and candidate source SHA-256. See the [member-level list](install-upgrade-member-candidates.md) for lifecycle portions inside files outside this set. This list is replacement scope, not an independent safe-unlink list.

## Revalidation corrections

- [src/shared/daemon-process.ts](../../src/shared/daemon-process.ts): **retain-outside-exclusive-scope** — Generic process observation/identity is required by retained daemon-run-files guard acquisition/conflict/reclaim, which protects keystore writes. Preserve this dependency closure.
- [src/daemon/__tests__/boot-cold-import.test.ts](../../src/daemon/__tests__/boot-cold-import.test.ts): **retain-outside-exclusive-scope** — Model catalog import/validation/default reconciliation assertions must survive. Only old launch/stop fixture wiring is a member-level integration candidate.
- [src/daemon/__tests__/config-boot-reconcile.test.ts](../../src/daemon/__tests__/config-boot-reconcile.test.ts): **retain-outside-exclusive-scope** — Tests canonical configuration/default evolution, reconciliation and architecture boundaries. Startup context does not make these exclusively process lifecycle tests.
- [src/daemon/__tests__/shutdown-store-failure.test.ts](../../src/daemon/__tests__/shutdown-store-failure.test.ts): **mixed-extract-lifecycle** — Contains general storeFailure status coverage plus shutdown/fatal/drain tests. Keep file/status assertions; replace only lifecycle mechanism assertions and retain teardown guarantees.
- [src/shared/__tests__/daemon-process.test.ts](../../src/shared/__tests__/daemon-process.test.ts): **retain-outside-exclusive-scope** — Generic process identity/parser/reincarnation coverage backs retained keystore guards, not solely daemon termination.
- [src/config/__tests__/installer-defs.test.ts](../../src/config/__tests__/installer-defs.test.ts): **candidate-test** — Dedicated installer or update/freshness suite; all methods inspected.
- [src/daemon/__tests__/daemon-status-field.test.ts](../../src/daemon/__tests__/daemon-status-field.test.ts): **candidate-test** — Dedicated installer or update/freshness suite; all methods inspected.
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/Sc4GatewayBindingsTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/Sc4GatewayBindingsTest.kt): **candidate-test** — Dedicated installer or update/freshness suite; all methods inspected.

## Boundary validation

- The prior ten `insrc_analyze_step` probes establish active dependencies among the managed/source engines and clients. Under the new rule those dependencies are rewiring obligations, not reasons to exclude dedicated lifecycle files.
- Three additional probes check mixed boundaries: import graphs for `src/daemon/lifecycle-registry.ts` and `src/shared/daemon-run-files.ts`, plus a module profile of `src/cli/services/daemon.ts`. See [saved boundary evidence](install-upgrade-scope-analysis-evidence.json).
- The workflow lifecycle registry has 21 indexed importers and depends on workflow artifact storage/lifecycle/feedback/identity services. It is outside process lifecycle scope. Its `lifecycle-wiring` and `lifecycle-adopt-wiring` tests stay as well. This corrects the original catalog’s misleading resource-registry description.
- Run-file guards have a keystore consumer. Keep/extract those shared primitives before replacing daemon run-file ownership. CLI daemon services also export backup, compact and general status, so the whole service file is mixed.
- Source review of exports, test declarations and callers supplements the graph. Graph coverage remains incomplete (eight ignored-file relationships); this is a scope inventory, not a runtime proof or completed replacement design.


## Dedicated implementation candidates (143)

### CI and qualification harness

- [.github/workflows/daemon-candidate.yml](../../.github/workflows/daemon-candidate.yml)
- [.github/workflows/daemon-linux-candidate.yml](../../.github/workflows/daemon-linux-candidate.yml)
- [.github/workflows/daemon-promotion.yml](../../.github/workflows/daemon-promotion.yml)
- [.github/workflows/daemon-qualification-sign.yml](../../.github/workflows/daemon-qualification-sign.yml)

### CLI and MCP lifecycle consumers

- [src/cli/services/lifecycle.ts](../../src/cli/services/lifecycle.ts)
- [src/cli/services/maintenance.ts](../../src/cli/services/maintenance.ts)
- [src/cli/services/managed-daemon-control.ts](../../src/cli/services/managed-daemon-control.ts)
- [src/cli/services/type-contracts/maintenance-result.ts](../../src/cli/services/type-contracts/maintenance-result.ts)
- [src/shared/update-source.ts](../../src/shared/update-source.ts)

### Daemon startup, shutdown and process ownership

- [src/daemon/fatal.ts](../../src/daemon/fatal.ts)
- [src/daemon/installed-commit.ts](../../src/daemon/installed-commit.ts)
- [src/daemon/run-file-ownership.ts](../../src/daemon/run-file-ownership.ts)
- [src/daemon/shutdown-watchdog.ts](../../src/daemon/shutdown-watchdog.ts)
- [src/daemon/shutdown.ts](../../src/daemon/shutdown.ts)
- [src/daemon/supervisor-run-files.ts](../../src/daemon/supervisor-run-files.ts)
- [src/daemon/supervisor-socket.ts](../../src/daemon/supervisor-socket.ts)
- [src/daemon/supervisor.ts](../../src/daemon/supervisor.ts)
- [src/daemon/update-runner.ts](../../src/daemon/update-runner.ts)
- [src/shared/daemon-process-client.ts](../../src/shared/daemon-process-client.ts)
- [src/shared/daemon-supervisor-protocol.ts](../../src/shared/daemon-supervisor-protocol.ts)
- [src/shared/darwin-lifecycle.ts](../../src/shared/darwin-lifecycle.ts)

### JetBrains lifecycle and host consumers

- [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/OrphanProcessSeam.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/OrphanProcessSeam.kt)
- [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/DaemonFreshnessFlow.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/DaemonFreshnessFlow.kt)
- [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/InstalledCommitFreshnessConsumer.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/InstalledCommitFreshnessConsumer.kt)
- [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/LastSeenPluginVersionStore.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/LastSeenPluginVersionStore.kt)
- [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunner.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunner.kt)
- [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleContracts.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleContracts.kt)
- [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleModel.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleModel.kt)
- [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleService.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleService.kt)
- [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonSetupPolicy.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonSetupPolicy.kt)
- [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultNodeRuntimeResolver.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultNodeRuntimeResolver.kt)
- [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultPrivateNodeProvisioner.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultPrivateNodeProvisioner.kt)
- [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/NativeChildEnvironment.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/NativeChildEnvironment.kt)
- [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/ScriptDaemonProvisioner.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/ScriptDaemonProvisioner.kt)
- [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/SetupConsentStoreService.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/SetupConsentStoreService.kt)
- [jetbrains-plugin/src/main/resources/insrc/node-runtime-policy.json](../../jetbrains-plugin/src/main/resources/insrc/node-runtime-policy.json)

### Linux source lifecycle and shared source release support

- [src/daemon/source-predecessor.ts](../../src/daemon/source-predecessor.ts)
- [src/daemon/source-release-qualification.ts](../../src/daemon/source-release-qualification.ts)
- [src/daemon/source-store-inspection.ts](../../src/daemon/source-store-inspection.ts)
- [src/daemon/source-store-probe.ts](../../src/daemon/source-store-probe.ts)
- [src/daemon/source-transaction-host.ts](../../src/daemon/source-transaction-host.ts)
- [src/daemon/source-update-launch.ts](../../src/daemon/source-update-launch.ts)
- [src/daemon/source-update-transaction.ts](../../src/daemon/source-update-transaction.ts)
- [src/shared/source-actor-client.ts](../../src/shared/source-actor-client.ts)
- [src/shared/source-installation.ts](../../src/shared/source-installation.ts)
- [src/shared/source-release-compatibility.ts](../../src/shared/source-release-compatibility.ts)
- [src/shared/source-release-target.ts](../../src/shared/source-release-target.ts)
- [src/shared/source-routing.ts](../../src/shared/source-routing.ts)
- [src/shared/source-update-outcomes.ts](../../src/shared/source-update-outcomes.ts)

### Native lifecycle helpers and build wiring

- [build-process-broker.mjs](../../build-process-broker.mjs)
- [build-shutdown-watchdog.mjs](../../build-shutdown-watchdog.mjs)
- [src/native/darwin-lifecycle/identity.c](../../src/native/darwin-lifecycle/identity.c)
- [src/native/process-broker/broker.h](../../src/native/process-broker/broker.h)
- [src/native/process-broker/darwin.c](../../src/native/process-broker/darwin.c)
- [src/native/process-broker/linux.c](../../src/native/process-broker/linux.c)
- [src/native/process-broker/main.c](../../src/native/process-broker/main.c)
- [src/native/source-actor/main.c](../../src/native/source-actor/main.c)

### Owned Node and source runtime selection

- [scripts/node-runtime-archive.sh](../../scripts/node-runtime-archive.sh)
- [scripts/node-runtime-assets.mjs](../../scripts/node-runtime-assets.mjs)
- [scripts/node-runtime-env.sh](../../scripts/node-runtime-env.sh)
- [scripts/node-runtime-policy.mjs](../../scripts/node-runtime-policy.mjs)
- [scripts/node-runtime-policy.sh](../../scripts/node-runtime-policy.sh)
- [scripts/node-runtime-store.mjs](../../scripts/node-runtime-store.mjs)
- [scripts/provision-node-runtime.sh](../../scripts/provision-node-runtime.sh)
- [scripts/source-selection-env.sh](../../scripts/source-selection-env.sh)
- [scripts/sync-node-runtime-policy.mjs](../../scripts/sync-node-runtime-policy.mjs)
- [src/assets/node-runtime-policy.json](../../src/assets/node-runtime-policy.json)
- [src/cli/services/owned-runtime.ts](../../src/cli/services/owned-runtime.ts)
- [src/shared/owned-node-runtime.ts](../../src/shared/owned-node-runtime.ts)

### Release, signing, qualification and distribution

- [scripts/bundle-release-bootstrap.mjs](../../scripts/bundle-release-bootstrap.mjs)
- [scripts/check-daemon-release-policy.sh](../../scripts/check-daemon-release-policy.sh)
- [scripts/daemon-bundle-metadata.mjs](../../scripts/daemon-bundle-metadata.mjs)
- [scripts/daemon-development-metadata.mjs](../../scripts/daemon-development-metadata.mjs)
- [scripts/daemon-release-artifact.sh](../../scripts/daemon-release-artifact.sh)
- [scripts/fetch-linux-daemon-candidate.mjs](../../scripts/fetch-linux-daemon-candidate.mjs)
- [scripts/install-daemon-bundle.mjs](../../scripts/install-daemon-bundle.mjs)
- [scripts/install-daemon-development-bundle.mjs](../../scripts/install-daemon-development-bundle.mjs)
- [scripts/linux-daemon-dispatch.mjs](../../scripts/linux-daemon-dispatch.mjs)
- [scripts/linux-daemon-metadata.mjs](../../scripts/linux-daemon-metadata.mjs)
- [scripts/linux-daemon-qualification.mjs](../../scripts/linux-daemon-qualification.mjs)
- [scripts/linux-daemon-signing-ledger.mjs](../../scripts/linux-daemon-signing-ledger.mjs)
- [scripts/package-daemon-bootstrap.mjs](../../scripts/package-daemon-bootstrap.mjs)
- [scripts/package-daemon-candidate.mjs](../../scripts/package-daemon-candidate.mjs)
- [scripts/package-daemon-development.mjs](../../scripts/package-daemon-development.mjs)
- [scripts/package-linux-daemon-candidate.mjs](../../scripts/package-linux-daemon-candidate.mjs)
- [scripts/prepare-daemon-qualification.mjs](../../scripts/prepare-daemon-qualification.mjs)
- [scripts/prepare-source-release.mjs](../../scripts/prepare-source-release.mjs)
- [scripts/promote-daemon-candidate.mjs](../../scripts/promote-daemon-candidate.mjs)
- [scripts/qualify-daemon-development.mjs](../../scripts/qualify-daemon-development.mjs)
- [scripts/record-daemon-qualification.mjs](../../scripts/record-daemon-qualification.mjs)
- [scripts/sign-daemon-development.mjs](../../scripts/sign-daemon-development.mjs)
- [scripts/sign-linux-daemon-candidate.mjs](../../scripts/sign-linux-daemon-candidate.mjs)
- [scripts/stage-daemon-bundle.mjs](../../scripts/stage-daemon-bundle.mjs)
- [scripts/verify-daemon-bootstrap.sh](../../scripts/verify-daemon-bootstrap.sh)
- [scripts/verify-daemon-bundle.mjs](../../scripts/verify-daemon-bundle.mjs)
- [scripts/verify-installed-runtime.mjs](../../scripts/verify-installed-runtime.mjs)

### Shell and executable entry points

- [scripts/daemon-ctl.sh](../../scripts/daemon-ctl.sh)
- [scripts/insrc-daemon-install.sh](../../scripts/insrc-daemon-install.sh)
- [src/bin/insrc-daemon-control.ts](../../src/bin/insrc-daemon-control.ts)
- [src/bin/insrc-daemon-supervisor.ts](../../src/bin/insrc-daemon-supervisor.ts)
- [src/bin/insrc-daemon-update.ts](../../src/bin/insrc-daemon-update.ts)
- [src/bin/insrc-legacy-rollback-preload.ts](../../src/bin/insrc-legacy-rollback-preload.ts)
- [src/bin/insrc-release-bootstrap.ts](../../src/bin/insrc-release-bootstrap.ts)
- [src/bin/insrc-runtime-smoke.ts](../../src/bin/insrc-runtime-smoke.ts)
- [src/bin/insrc-shutdown-watchdog.ts](../../src/bin/insrc-shutdown-watchdog.ts)
- [src/bin/insrc-source-control.ts](../../src/bin/insrc-source-control.ts)
- [src/bin/insrc-source-recovery.ts](../../src/bin/insrc-source-recovery.ts)
- [src/bin/insrc-source-startup-barrier.ts](../../src/bin/insrc-source-startup-barrier.ts)

### VS Code lifecycle and host consumers

- [vscode-plugin/assets/insrc-daemon-install.sh](../../vscode-plugin/assets/insrc-daemon-install.sh)
- [vscode-plugin/assets/node-runtime-policy.json](../../vscode-plugin/assets/node-runtime-policy.json)
- [vscode-plugin/src/daemon/commands.ts](../../vscode-plugin/src/daemon/commands.ts)
- [vscode-plugin/src/daemon/controller.ts](../../vscode-plugin/src/daemon/controller.ts)
- [vscode-plugin/src/daemon/paths.ts](../../vscode-plugin/src/daemon/paths.ts)
- [vscode-plugin/src/daemon/subprocess.ts](../../vscode-plugin/src/daemon/subprocess.ts)
- [vscode-plugin/src/freshness/daemon-freshness.ts](../../vscode-plugin/src/freshness/daemon-freshness.ts)
- [vscode-plugin/src/panels/orphan-kill.ts](../../vscode-plugin/src/panels/orphan-kill.ts)

### macOS managed lifecycle, migration and update

- [src/daemon/fresh-managed-activation.ts](../../src/daemon/fresh-managed-activation.ts)
- [src/daemon/legacy-admin-guard.ts](../../src/daemon/legacy-admin-guard.ts)
- [src/daemon/legacy-cutover-admission.ts](../../src/daemon/legacy-cutover-admission.ts)
- [src/daemon/legacy-daemon-cutover.ts](../../src/daemon/legacy-daemon-cutover.ts)
- [src/daemon/legacy-drain-evidence.ts](../../src/daemon/legacy-drain-evidence.ts)
- [src/daemon/legacy-launch-job.ts](../../src/daemon/legacy-launch-job.ts)
- [src/daemon/legacy-private-drain.ts](../../src/daemon/legacy-private-drain.ts)
- [src/daemon/legacy-public-stop.ts](../../src/daemon/legacy-public-stop.ts)
- [src/daemon/legacy-run-guard.ts](../../src/daemon/legacy-run-guard.ts)
- [src/daemon/managed-bundle-proof.ts](../../src/daemon/managed-bundle-proof.ts)
- [src/daemon/managed-daemon-lifecycle.ts](../../src/daemon/managed-daemon-lifecycle.ts)
- [src/daemon/managed-daemon-probation.ts](../../src/daemon/managed-daemon-probation.ts)
- [src/daemon/managed-release-inventory.ts](../../src/daemon/managed-release-inventory.ts)
- [src/daemon/managed-release-mach-o.ts](../../src/daemon/managed-release-mach-o.ts)
- [src/daemon/managed-release-staging.ts](../../src/daemon/managed-release-staging.ts)
- [src/daemon/managed-update-handoff.ts](../../src/daemon/managed-update-handoff.ts)
- [src/daemon/managed-update-ipc.ts](../../src/daemon/managed-update-ipc.ts)
- [src/daemon/managed-update-launch.ts](../../src/daemon/managed-update-launch.ts)
- [src/daemon/managed-update-preparation.ts](../../src/daemon/managed-update-preparation.ts)
- [src/daemon/managed-update-recovery.ts](../../src/daemon/managed-update-recovery.ts)
- [src/daemon/managed-update-transaction.ts](../../src/daemon/managed-update-transaction.ts)
- [src/daemon/release-compatibility.ts](../../src/daemon/release-compatibility.ts)
- [src/shared/daemon-bundle-release-floor.ts](../../src/shared/daemon-bundle-release-floor.ts)
- [src/shared/installation-mutation-gate.ts](../../src/shared/installation-mutation-gate.ts)
- [src/shared/managed-daemon-installation.ts](../../src/shared/managed-daemon-installation.ts)
- [src/shared/managed-release-trust.ts](../../src/shared/managed-release-trust.ts)
- [src/shared/managed-source-release.ts](../../src/shared/managed-source-release.ts)

## Dedicated test candidates (115)

### Tests and regression suites

- [jetbrains-plugin/__tests__/managed-update-confirmation-gradle.test.ts](../../jetbrains-plugin/__tests__/managed-update-confirmation-gradle.test.ts)
- [jetbrains-plugin/__tests__/node-runtime-gradle.test.ts](../../jetbrains-plugin/__tests__/node-runtime-gradle.test.ts)
- [jetbrains-plugin/__tests__/source-bootstrap-gradle.test.ts](../../jetbrains-plugin/__tests__/source-bootstrap-gradle.test.ts)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/debug/OrphanProcessSeamTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/debug/OrphanProcessSeamTest.kt)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/freshness/DaemonFreshnessFlowTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/freshness/DaemonFreshnessFlowTest.kt)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/freshness/InstalledCommitFreshnessConsumerTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/freshness/InstalledCommitFreshnessConsumerTest.kt)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/freshness/LastSeenPluginVersionStoreTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/freshness/LastSeenPluginVersionStoreTest.kt)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleServiceTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleServiceTest.kt)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonProvisionerTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonProvisionerTest.kt)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DecidePolicyTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DecidePolicyTest.kt)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonScriptLocatorTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonScriptLocatorTest.kt)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/NodeRuntimeResolverTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/NodeRuntimeResolverTest.kt)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/PrivateNodeProvisionerTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/PrivateNodeProvisionerTest.kt)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/S003TypesTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/S003TypesTest.kt)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/SetupConsentStoreTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/SetupConsentStoreTest.kt)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/SourceBootstrapIntegrationTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/SourceBootstrapIntegrationTest.kt)
- [scripts/__tests__/daemon-bundle-metadata.test.ts](../../scripts/__tests__/daemon-bundle-metadata.test.ts)
- [scripts/__tests__/daemon-development-metadata.test.ts](../../scripts/__tests__/daemon-development-metadata.test.ts)
- [scripts/__tests__/daemon-release-artifact.test.ts](../../scripts/__tests__/daemon-release-artifact.test.ts)
- [scripts/__tests__/daemon-release-policy.test.ts](../../scripts/__tests__/daemon-release-policy.test.ts)
- [scripts/__tests__/fetch-linux-daemon-candidate.test.ts](../../scripts/__tests__/fetch-linux-daemon-candidate.test.ts)
- [scripts/__tests__/historical-macos-upgrade-native.test.ts](../../scripts/__tests__/historical-macos-upgrade-native.test.ts)
- [scripts/__tests__/ide-source-entrypoints-native.test.ts](../../scripts/__tests__/ide-source-entrypoints-native.test.ts)
- [scripts/__tests__/linux-daemon-dispatch.test.ts](../../scripts/__tests__/linux-daemon-dispatch.test.ts)
- [scripts/__tests__/linux-daemon-final-signing.test.ts](../../scripts/__tests__/linux-daemon-final-signing.test.ts)
- [scripts/__tests__/linux-daemon-metadata.test.ts](../../scripts/__tests__/linux-daemon-metadata.test.ts)
- [scripts/__tests__/linux-daemon-qualification.test.ts](../../scripts/__tests__/linux-daemon-qualification.test.ts)
- [scripts/__tests__/node-runtime-bootstrap-native.test.ts](../../scripts/__tests__/node-runtime-bootstrap-native.test.ts)
- [scripts/__tests__/node-runtime-cli-native.test.ts](../../scripts/__tests__/node-runtime-cli-native.test.ts)
- [scripts/__tests__/node-runtime-coordinator-native.test.ts](../../scripts/__tests__/node-runtime-coordinator-native.test.ts)
- [scripts/__tests__/node-runtime-migration-native.test.ts](../../scripts/__tests__/node-runtime-migration-native.test.ts)
- [scripts/__tests__/node-runtime-packaging.test.ts](../../scripts/__tests__/node-runtime-packaging.test.ts)
- [scripts/__tests__/node-runtime-policy.test.ts](../../scripts/__tests__/node-runtime-policy.test.ts)
- [scripts/__tests__/node-runtime-python-native.test.ts](../../scripts/__tests__/node-runtime-python-native.test.ts)
- [scripts/__tests__/node-runtime-shell-native.test.ts](../../scripts/__tests__/node-runtime-shell-native.test.ts)
- [scripts/__tests__/node-runtime-store.test.ts](../../scripts/__tests__/node-runtime-store.test.ts)
- [scripts/__tests__/package-daemon-candidate.test.ts](../../scripts/__tests__/package-daemon-candidate.test.ts)
- [scripts/__tests__/package-daemon-development.test.ts](../../scripts/__tests__/package-daemon-development.test.ts)
- [scripts/__tests__/package-linux-daemon-candidate.test.ts](../../scripts/__tests__/package-linux-daemon-candidate.test.ts)
- [scripts/__tests__/promote-daemon-candidate.test.ts](../../scripts/__tests__/promote-daemon-candidate.test.ts)
- [scripts/__tests__/sign-daemon-development.test.ts](../../scripts/__tests__/sign-daemon-development.test.ts)
- [scripts/__tests__/source-bootstrap-inventory.test.ts](../../scripts/__tests__/source-bootstrap-inventory.test.ts)
- [scripts/__tests__/source-consumers-native.test.ts](../../scripts/__tests__/source-consumers-native.test.ts)
- [scripts/__tests__/source-entrypoints-native.test.ts](../../scripts/__tests__/source-entrypoints-native.test.ts)
- [scripts/__tests__/source-predecessor-native.test.ts](../../scripts/__tests__/source-predecessor-native.test.ts)
- [scripts/__tests__/source-upgrade-qualification-native.test.ts](../../scripts/__tests__/source-upgrade-qualification-native.test.ts)
- [scripts/__tests__/stage-daemon-bundle.test.ts](../../scripts/__tests__/stage-daemon-bundle.test.ts)
- [src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts](../../src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts)
- [src/cli/services/__tests__/daemon-ctl-install-marker.test.ts](../../src/cli/services/__tests__/daemon-ctl-install-marker.test.ts)
- [src/cli/services/__tests__/daemon-stop-forced.test.ts](../../src/cli/services/__tests__/daemon-stop-forced.test.ts)
- [src/cli/services/__tests__/daemon-stop.test.ts](../../src/cli/services/__tests__/daemon-stop.test.ts)
- [src/cli/services/__tests__/debug-orphans.test.ts](../../src/cli/services/__tests__/debug-orphans.test.ts)
- [src/cli/services/__tests__/maintenance-install-marker.test.ts](../../src/cli/services/__tests__/maintenance-install-marker.test.ts)
- [src/cli/services/__tests__/maintenance-reconcile.test.ts](../../src/cli/services/__tests__/maintenance-reconcile.test.ts)
- [src/cli/services/__tests__/maintenance-steering-refresh.test.ts](../../src/cli/services/__tests__/maintenance-steering-refresh.test.ts)
- [src/cli/services/__tests__/managed-daemon-control.test.ts](../../src/cli/services/__tests__/managed-daemon-control.test.ts)
- [src/cli/services/__tests__/owned-runtime.test.ts](../../src/cli/services/__tests__/owned-runtime.test.ts)
- [src/daemon/__tests__/daemon-ctl-node-path.test.ts](../../src/daemon/__tests__/daemon-ctl-node-path.test.ts)
- [src/daemon/__tests__/daemon-ctl-source.test.ts](../../src/daemon/__tests__/daemon-ctl-source.test.ts)
- [src/daemon/__tests__/daemon-supervisor.test.ts](../../src/daemon/__tests__/daemon-supervisor.test.ts)
- [src/daemon/__tests__/fresh-managed-activation.test.ts](../../src/daemon/__tests__/fresh-managed-activation.test.ts)
- [src/daemon/__tests__/installed-commit.test.ts](../../src/daemon/__tests__/installed-commit.test.ts)
- [src/daemon/__tests__/legacy-admin-guard.test.ts](../../src/daemon/__tests__/legacy-admin-guard.test.ts)
- [src/daemon/__tests__/legacy-cutover-admission.test.ts](../../src/daemon/__tests__/legacy-cutover-admission.test.ts)
- [src/daemon/__tests__/legacy-daemon-cutover.test.ts](../../src/daemon/__tests__/legacy-daemon-cutover.test.ts)
- [src/daemon/__tests__/legacy-private-drain.test.ts](../../src/daemon/__tests__/legacy-private-drain.test.ts)
- [src/daemon/__tests__/legacy-run-guard.test.ts](../../src/daemon/__tests__/legacy-run-guard.test.ts)
- [src/daemon/__tests__/legacy-runtime-record.test.ts](../../src/daemon/__tests__/legacy-runtime-record.test.ts)
- [src/daemon/__tests__/linux-installed-lifecycle.test.ts](../../src/daemon/__tests__/linux-installed-lifecycle.test.ts)
- [src/daemon/__tests__/macos-upgrade-routing.test.ts](../../src/daemon/__tests__/macos-upgrade-routing.test.ts)
- [src/daemon/__tests__/managed-daemon-lifecycle.test.ts](../../src/daemon/__tests__/managed-daemon-lifecycle.test.ts)
- [src/daemon/__tests__/managed-development-bundle-proof.test.ts](../../src/daemon/__tests__/managed-development-bundle-proof.test.ts)
- [src/daemon/__tests__/managed-release-bootstrap.test.ts](../../src/daemon/__tests__/managed-release-bootstrap.test.ts)
- [src/daemon/__tests__/managed-release-inventory.test.ts](../../src/daemon/__tests__/managed-release-inventory.test.ts)
- [src/daemon/__tests__/managed-release-mach-o.test.ts](../../src/daemon/__tests__/managed-release-mach-o.test.ts)
- [src/daemon/__tests__/managed-release-staging.test.ts](../../src/daemon/__tests__/managed-release-staging.test.ts)
- [src/daemon/__tests__/managed-release-trust.test.ts](../../src/daemon/__tests__/managed-release-trust.test.ts)
- [src/daemon/__tests__/managed-update-handoff.test.ts](../../src/daemon/__tests__/managed-update-handoff.test.ts)
- [src/daemon/__tests__/managed-update-ipc.test.ts](../../src/daemon/__tests__/managed-update-ipc.test.ts)
- [src/daemon/__tests__/managed-update-transaction.test.ts](../../src/daemon/__tests__/managed-update-transaction.test.ts)
- [src/daemon/__tests__/release-compatibility.test.ts](../../src/daemon/__tests__/release-compatibility.test.ts)
- [src/daemon/__tests__/run-file-ownership.test.ts](../../src/daemon/__tests__/run-file-ownership.test.ts)
- [src/daemon/__tests__/shutdown-bounded.test.ts](../../src/daemon/__tests__/shutdown-bounded.test.ts)
- [src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts](../../src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts)
- [src/daemon/__tests__/shutdown-watchdog.test.ts](../../src/daemon/__tests__/shutdown-watchdog.test.ts)
- [src/daemon/__tests__/source-interruption.test.ts](../../src/daemon/__tests__/source-interruption.test.ts)
- [src/daemon/__tests__/source-release-promotion.test.ts](../../src/daemon/__tests__/source-release-promotion.test.ts)
- [src/daemon/__tests__/source-transaction-host.test.ts](../../src/daemon/__tests__/source-transaction-host.test.ts)
- [src/daemon/__tests__/source-update-outcomes.test.ts](../../src/daemon/__tests__/source-update-outcomes.test.ts)
- [src/daemon/__tests__/source-update-transaction.test.ts](../../src/daemon/__tests__/source-update-transaction.test.ts)
- [src/daemon/__tests__/supervisor-run-files.test.ts](../../src/daemon/__tests__/supervisor-run-files.test.ts)
- [src/daemon/__tests__/update-handlers.test.ts](../../src/daemon/__tests__/update-handlers.test.ts)
- [src/daemon/__tests__/update-runner.test.ts](../../src/daemon/__tests__/update-runner.test.ts)
- [src/daemon/threads/__tests__/daemon-ctl-smoke.test.ts](../../src/daemon/threads/__tests__/daemon-ctl-smoke.test.ts)
- [src/shared/__tests__/daemon-bundle-release-floor.test.ts](../../src/shared/__tests__/daemon-bundle-release-floor.test.ts)
- [src/shared/__tests__/daemon-process-client.test.ts](../../src/shared/__tests__/daemon-process-client.test.ts)
- [src/shared/__tests__/daemon-supervisor-protocol.test.ts](../../src/shared/__tests__/daemon-supervisor-protocol.test.ts)
- [src/shared/__tests__/darwin-lifecycle.test.ts](../../src/shared/__tests__/darwin-lifecycle.test.ts)
- [src/shared/__tests__/installation-mutation-gate.test.ts](../../src/shared/__tests__/installation-mutation-gate.test.ts)
- [src/shared/__tests__/process-broker-native.test.ts](../../src/shared/__tests__/process-broker-native.test.ts)
- [src/shared/__tests__/source-actor-boot.test.ts](../../src/shared/__tests__/source-actor-boot.test.ts)
- [src/shared/__tests__/source-actor-native.test.ts](../../src/shared/__tests__/source-actor-native.test.ts)
- [src/shared/__tests__/source-installation.test.ts](../../src/shared/__tests__/source-installation.test.ts)
- [src/shared/__tests__/update-source.test.ts](../../src/shared/__tests__/update-source.test.ts)
- [vscode-plugin/src/daemon/__tests__/bundle.test.ts](../../vscode-plugin/src/daemon/__tests__/bundle.test.ts)
- [vscode-plugin/src/daemon/__tests__/commands.test.ts](../../vscode-plugin/src/daemon/__tests__/commands.test.ts)
- [vscode-plugin/src/daemon/__tests__/controller.test.ts](../../vscode-plugin/src/daemon/__tests__/controller.test.ts)
- [vscode-plugin/src/daemon/__tests__/runtime-boundary.test.ts](../../vscode-plugin/src/daemon/__tests__/runtime-boundary.test.ts)
- [vscode-plugin/src/freshness/__tests__/daemon-freshness.test.ts](../../vscode-plugin/src/freshness/__tests__/daemon-freshness.test.ts)
- [vscode-plugin/src/freshness/__tests__/extension-wiring.test.ts](../../vscode-plugin/src/freshness/__tests__/extension-wiring.test.ts)
- [vscode-plugin/src/panels/__tests__/orphan-kill.test.ts](../../vscode-plugin/src/panels/__tests__/orphan-kill.test.ts)
- [src/config/__tests__/installer-defs.test.ts](../../src/config/__tests__/installer-defs.test.ts)
- [src/daemon/__tests__/daemon-status-field.test.ts](../../src/daemon/__tests__/daemon-status-field.test.ts)
- [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/Sc4GatewayBindingsTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/Sc4GatewayBindingsTest.kt)

## Dedicated test support candidates (20)

### Test fixtures and historical qualification helpers

- [scripts/__tests__/fixtures/exempt/cli/services/maintenance.ts](../../scripts/__tests__/fixtures/exempt/cli/services/maintenance.ts)
- [scripts/__tests__/fixtures/exempt/daemon/installed-commit.ts](../../scripts/__tests__/fixtures/exempt/daemon/installed-commit.ts)
- [scripts/__tests__/fixtures/linux-daemon-release.ts](../../scripts/__tests__/fixtures/linux-daemon-release.ts)
- [scripts/__tests__/helpers/historical-daemon-qualification.mjs](../../scripts/__tests__/helpers/historical-daemon-qualification.mjs) — pending working-tree changes
- [scripts/__tests__/helpers/historical-linux-live.mjs](../../scripts/__tests__/helpers/historical-linux-live.mjs) — pending working-tree changes
- [scripts/__tests__/helpers/historical-mac-live.mjs](../../scripts/__tests__/helpers/historical-mac-live.mjs) — pending working-tree changes
- [scripts/__tests__/helpers/owned-source-fixture.ts](../../scripts/__tests__/helpers/owned-source-fixture.ts)
- [scripts/__tests__/helpers/source-entrypoint-authority.ts](../../scripts/__tests__/helpers/source-entrypoint-authority.ts)
- [scripts/__tests__/helpers/source-entrypoint-matrix.ts](../../scripts/__tests__/helpers/source-entrypoint-matrix.ts)
- [src/daemon/__tests__/fixtures/legacy-run-guard-crash.ts](../../src/daemon/__tests__/fixtures/legacy-run-guard-crash.ts)
- [src/daemon/__tests__/fixtures/linux-installed-lifecycle.sh](../../src/daemon/__tests__/fixtures/linux-installed-lifecycle.sh)
- [src/daemon/__tests__/fixtures/managed-update-ipc-detached.ts](../../src/daemon/__tests__/fixtures/managed-update-ipc-detached.ts)
- [src/daemon/__tests__/fixtures/managed-update-launch-child.ts](../../src/daemon/__tests__/fixtures/managed-update-launch-child.ts)
- [src/daemon/__tests__/fixtures/run-file-exit-child.ts](../../src/daemon/__tests__/fixtures/run-file-exit-child.ts)
- [src/daemon/__tests__/fixtures/run-file-owner-child.ts](../../src/daemon/__tests__/fixtures/run-file-owner-child.ts)
- [src/daemon/__tests__/helpers-update-fixture.ts](../../src/daemon/__tests__/helpers-update-fixture.ts)
- [src/daemon/__tests__/helpers/source-linux.ts](../../src/daemon/__tests__/helpers/source-linux.ts)
- [src/daemon/__tests__/helpers/source-transaction-fixture.ts](../../src/daemon/__tests__/helpers/source-transaction-fixture.ts)
- [src/shared/__tests__/fixtures/control-runtime.ts](../../src/shared/__tests__/fixtures/control-runtime.ts)
- [src/shared/__tests__/fixtures/process-broker-fake-backend.c](../../src/shared/__tests__/fixtures/process-broker-fake-backend.c)

## Mixed files: preserve other functionality

| File | Boundary |
|---|---|
| [src/cli/panes/DaemonPane.tsx](../../src/cli/panes/DaemonPane.tsx) | Start/stop/update UI plus backup/compaction and ongoing health. |
| [src/cli/panes/DaemonSection.tsx](../../src/cli/panes/DaemonSection.tsx) | Status/repository display plus orphan stop controls. |
| [src/cli/services/daemon.ts](../../src/cli/services/daemon.ts) | Start/stop plus backup, compact and general status operations; preserve non-lifecycle operations. |
| [src/cli/services/debug.ts](../../src/cli/services/debug.ts) | Orphan daemon stop plus MCP client/session and log diagnostics. |
| [src/daemon/admin-handlers.ts](../../src/daemon/admin-handlers.ts) | Shutdown/update plus other administrative IPC operations. |
| [src/daemon/handler-runtime.ts](../../src/daemon/handler-runtime.ts) | Lifecycle wiring and the wider daemon request handler assembly. |
| [src/daemon/index.ts](../../src/daemon/index.ts) | Startup/update/shutdown assembly plus application resource and handler registration; extract lifecycle parts. |
| [src/daemon/lifecycle.ts](../../src/daemon/lifecycle.ts) | PID/startup functions plus embedding model bootstrap and model-state API. |
| [src/shared/daemon-run-files.ts](../../src/shared/daemon-run-files.ts) | Run-file lifecycle primitives also protect keystore writes; preserve/extract shared locking. |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/PluginLifecycle.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/PluginLifecycle.kt) | Plugin lifecycle/host integration extends beyond daemon process lifecycle. |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt) | RPC contract includes non-lifecycle daemon operations. |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt) | Gateway includes repository settings and non-lifecycle RPC operations. |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingLifecycle.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingLifecycle.kt) | Onboarding spans daemon provisioning and other plugin/host setup. |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DaemonConfigurable.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DaemonConfigurable.kt) | Daemon lifecycle actions plus status, backup and compaction settings UI. |
| [scripts/sync-client-runtime-assets.mjs](../../scripts/sync-client-runtime-assets.mjs) | Installer generation plus MCP/agent steering asset packaging. |
| [scripts/insrc](../../scripts/insrc) | TUI launcher and runtime/selection bootstrap; preserve CLI launch contract. |
| [scripts/insrc-mcp](../../scripts/insrc-mcp) | MCP launcher and runtime/selection bootstrap; preserve MCP launch contract. |
| [src/daemon/__tests__/shutdown-store-failure.test.ts](../../src/daemon/__tests__/shutdown-store-failure.test.ts) | Contains general storeFailure status coverage plus shutdown/fatal/drain tests. Keep file/status assertions; replace only lifecycle mechanism assertions and retain teardown guarantees. |
| [vscode-plugin/src/extension.ts](../../vscode-plugin/src/extension.ts) | Lifecycle command/freshness registration plus all other extension activation. |

## Preserved boundaries

Preserve generic process identity and guard acquisition/conflict/reclamation used by keystore, model/configuration validation and reconciliation, generic IPC, backup/compact/status, workflow artifact lifecycle, storage/indexing and worker resource engines, broad build/test coordination and host/MCP/steering contracts. Replace lifecycle integration slices through the member list.

No implementation or existing test file changed. No build/tests, daemon operation, commit, merge or push was performed. Static evidence cannot certify replacement behavior.
