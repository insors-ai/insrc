# Install, upgrade and daemon lifecycle catalog

Snapshot: **2026-11-22**, branch `v2`, HEAD `69b8145359d4f201d9e80da1baa4e9fed9067271`. **Catalog only: no implementation, build, test, installation or daemon operation was performed for this inventory.**

This inventory records the existing implementation before any redesign. It includes production entry points, runtime ownership, update/recovery engines, native helpers, release tooling, IDE clients, generated asset sources, tests and primary documentation. It makes no removal recommendation and does not certify that an installation path works.

The current [scope-based deletion candidate list](install-upgrade-scope-candidates.md) applies the user's exclusive-functionality rule, including active code and dedicated tests. The earlier [dead-code assessment](install-upgrade-deletion-assessment.md) remains as historical evidence. The inventory below remains the original snapshot.

**446 files**, 85,925 source/document lines across 16 groups. The [JSON inventory](install-upgrade-daemon-lifecycle-catalog.json) records every listed file’s category, role, size, working-tree status, lexical exported names and relative import specifiers.

## Existing control paths

| Path | Front doors | Implementation owners |
|---|---|---|
| Source installation/bootstrap | Canonical installer and packaged IDE installer copies | Owned Node provisioning; independent release bootstrap; source release staging and target-specific activation |
| macOS managed lifecycle | Shell, CLI, IDEs, managed control executable | Managed installation selector, launchd/supervisor, managed lifecycle/probation, update transaction and recovery |
| macOS legacy migration | Installer/control preparation and cutover | Legacy recipe admission/fencing, public stop/private drain, run guard, managed activation and rollback |
| Linux selected source lifecycle | Shell, CLI, IDEs, source control executable | Source selector/journal, native actor, transaction host, source update transaction, predecessor recovery |
| Retained legacy source maintenance | Legacy branches in shell and CLI maintenance; detached update helper | Existing checkout git/npm/build paths and legacy runtime markers; distinct from authenticated staged updates |
| Managed signed bundles/development bundles | Bundle packaging/install scripts and managed control | Bundle inventories, trust/floors, qualification, staging and managed activation |
| Separate Linux candidate bundle lane | Linux candidate scripts and CI workflow | Candidate fetch/dispatch/signing/qualification; distinct from ordinary Linux source installation |

`src/daemon/index.ts` intercepts unary `daemon.update`: Linux launches source update; macOS launches the managed helper after managed installation checks. The fallback handler in `admin-handlers.ts` is not the whole update implementation. Public `daemon.shutdown` enters the daemon shutdown coordinator. Client stop paths also carry process/run-file ownership logic.

`src/daemon/supervisor.ts` supervises the OS daemon. `src/daemon/threads/supervisor.ts` supervises application workers. IDE/CLI orphan cleanup is a separate explicit debug surface, not the normal managed stop route.

## Persistent state and ownership surfaces

Paths below are defined by code and use the configured installation/home root. They are not a dump of this machine’s private configuration or data.

| State surface | Purpose / owners |
|---|---|
| `~/.insrc/daemon.pid`, `daemon.sock`, `daemon.run-files.guard` | Public daemon endpoint/process ownership; lifecycle, run-file helpers and native broker |
| `~/.insrc/daemon-node` | Retained legacy owned runtime marker |
| `~/.insrc/daemon.update.lock`, `daemon.update-outcome.json` | Legacy update runner lock/outcome |
| `~/.insrc/runtimes/node-v<version>-<target>/<sha>/` | Verified Node archive, distribution and inventory |
| `~/.insrc/source-runtimes/<installation-hash>.json` | Source installation → owned runtime binding |
| `managed-lifecycle/` | Managed installation selector, journal/mutation state, supervisor socket/plist/log, staged releases and release verifier |
| `source-lifecycle/journal.json`, `mutation.guard`, `releases/`, `actors/` | Linux atomic selection/transaction, exclusive mutation, staged releases, actor control/evidence/logs |
| `source-lifecycle/update-outcomes/`, public `daemon.update-outcome.json`, and release floor records | `source-update-outcomes.ts`, source bootstrap and trust/floor modules; durable acknowledgement and rollback authority |
| `config.json` → `daemonUpdate.repoUrl`, `daemonUpdate.branch` | Configured update source; `shared/update-source.ts` |
| Graph/Lance stores and repository configuration | Preserved application data inspected/drained at lifecycle boundaries; storage is not owned by installers |

## Runtime, packaging and generated copies

- Canonical source runtime policy is `src/assets/node-runtime-policy.json`: Node 22.22.1 / npm 10.9.4; source targets enabled here are darwin-arm64, linux-arm64 and linux-x64. Darwin x64 is disabled and Windows has no target entry in this source policy snapshot. Signed managed releases retain their authenticated bundled `tools/node`.
- `node-runtime-env.sh` and `owned-node-runtime.ts` construct owned toolchain environments. Inherited `NODE_OPTIONS`/`NODE_PATH`, native header settings and `ONNXRUNTIME_NODE_INSTALL_CUDA` defaults belong in this catalog because they affect install/build/launch behavior. An explicitly supplied CUDA setting is preserved.
- `scripts/insrc-daemon-install.sh` is a template: its embedded release/Node bootstrap placeholders are empty in raw source at this snapshot. Release packaging populates them. A raw checkout copy and a qualified packaged installer are separate artifacts.
- `scripts/sync-client-runtime-assets.mjs` and policy sync tooling generate VS Code’s checked-in installer/policy assets and JetBrains resources. JetBrains’ packaged installer is generated under `jetbrains-plugin/build/generated-resources/insrc/insrc-daemon-install.sh`; it is not an independent canonical installer source.
- TypeScript sources compile to `out/`: daemon `out/daemon/index.js`, lifecycle/MCP executable counterparts under `out/bin/`, plus copied assets. Native outputs include the process broker, Darwin lifecycle helper, Linux source actor and standalone shutdown watchdog. Generated build trees and third-party `node_modules` are not recursively listed.
- `prepare-source-release.mjs` consumes compatibility/evidence inputs and prepares source promotion authority. Expected compatibility catalogs `release/macos-compatibility.json`, `release/linux-arm64-compatibility.json`, `release/linux-x64-compatibility.json` are absent from this snapshot; private test fixtures may construct their own.
- macOS candidate/promotion, signed-development distribution, Linux candidate distribution and authenticated source-release preparation are separate release tooling families. Their existence is not evidence that every target is qualified.

## File inventory

Each production file below has one primary category; cross-platform shared helpers are identified in the role text. Tests/fixtures and adjacent resource boundaries have their own groups. Paths are repository-relative.

### Shell and executable entry points (15)

| File | Responsibility | Lines |
|---|---|---:|
| [scripts/daemon-ctl.sh](../../scripts/daemon-ctl.sh) | Shell start/stop/restart/update/status/recover dispatcher; source/managed routing and retained legacy fallback. | 455 |
| [scripts/insrc](../../scripts/insrc) | Interactive CLI shell launcher and selected runtime entry. | 39 |
| [scripts/insrc-daemon-install.sh](../../scripts/insrc-daemon-install.sh) | Canonical source installer template; provisions owned Node and selects authenticated installation/migration routes. | 734 |
| [scripts/insrc-mcp](../../scripts/insrc-mcp) | MCP shell launcher and selected source/runtime entry. | 35 |
| [src/bin/insrc-daemon-control.ts](../../src/bin/insrc-daemon-control.ts) | macOS managed control bridge, staging, legacy upgrade preparation and lifecycle dispatch. | 357 |
| [src/bin/insrc-daemon-supervisor.ts](../../src/bin/insrc-daemon-supervisor.ts) | OS daemon supervisor executable entry. | 106 |
| [src/bin/insrc-daemon-update.ts](../../src/bin/insrc-daemon-update.ts) | Acknowledged managed update helper executable. | 15 |
| [src/bin/insrc-legacy-rollback-preload.ts](../../src/bin/insrc-legacy-rollback-preload.ts) | Legacy rollback/restart preload and private drain integration. | 66 |
| [src/bin/insrc-mcp.ts](../../src/bin/insrc-mcp.ts) | MCP stdio entry and session bootstrap consumer. | 53 |
| [src/bin/insrc-release-bootstrap.ts](../../src/bin/insrc-release-bootstrap.ts) | Bundled independent release authorization, qualification, staging and recovery verifier. | 337 |
| [src/bin/insrc-runtime-smoke.ts](../../src/bin/insrc-runtime-smoke.ts) | Runtime/native module smoke executable used in qualification. | 15 |
| [src/bin/insrc-shutdown-watchdog.ts](../../src/bin/insrc-shutdown-watchdog.ts) | Independent shutdown watchdog executable. | 61 |
| [src/bin/insrc-source-control.ts](../../src/bin/insrc-source-control.ts) | Linux source selection, upgrade/recovery and start/stop/restart/status controller. | 260 |
| [src/bin/insrc-source-recovery.ts](../../src/bin/insrc-source-recovery.ts) | Historical predecessor inspection and explicit signed rebuild preparation. | 69 |
| [src/bin/insrc-source-startup-barrier.ts](../../src/bin/insrc-source-startup-barrier.ts) | Inherited native actor authorization barrier before application startup. | 39 |

### Owned Node and source runtime selection (14)

| File | Responsibility | Lines |
|---|---|---:|
| [.npmrc](../../.npmrc) | Native build runtime/header configuration. | 32 |
| [scripts/node-runtime-archive.sh](../../scripts/node-runtime-archive.sh) | Archive verification/extraction shell helpers. | 56 |
| [scripts/node-runtime-assets.mjs](../../scripts/node-runtime-assets.mjs) | Packages canonical bootstrap/runtime assets and verifies packaged authority. | 69 |
| [scripts/node-runtime-env.sh](../../scripts/node-runtime-env.sh) | Owned Node/npm environment, inherited Node injection cleanup, headers and unset-only CUDA skip default. | 42 |
| [scripts/node-runtime-policy.mjs](../../scripts/node-runtime-policy.mjs) | Policy loading and shell rendering. | 62 |
| [scripts/node-runtime-policy.sh](../../scripts/node-runtime-policy.sh) | Generated shell representation of runtime policy. | 26 |
| [scripts/node-runtime-store.mjs](../../scripts/node-runtime-store.mjs) | Verified archive/distribution inventories, cache, publication and installation bindings. | 125 |
| [scripts/provision-node-runtime.sh](../../scripts/provision-node-runtime.sh) | Downloads/provisions the pinned official Node archive rather than selecting ambient Node. | 73 |
| [scripts/source-selection-env.sh](../../scripts/source-selection-env.sh) | Shell resolution of selected source installation and control/runtime roots. | 37 |
| [scripts/sync-client-runtime-assets.mjs](../../scripts/sync-client-runtime-assets.mjs) | Generates IDE packaged installer/runtime assets from canonical inputs. | 24 |
| [scripts/sync-node-runtime-policy.mjs](../../scripts/sync-node-runtime-policy.mjs) | Synchronizes generated policy representations. | 42 |
| [src/assets/node-runtime-policy.json](../../src/assets/node-runtime-policy.json) | Canonical pinned Node/npm versions, archive hashes and enabled source targets. | 40 |
| [src/cli/services/owned-runtime.ts](../../src/cli/services/owned-runtime.ts) | CLI re-export of shared owned runtime API. | 2 |
| [src/shared/owned-node-runtime.ts](../../src/shared/owned-node-runtime.ts) | Owned toolchain resolution, child environment and installation markers. | 59 |

### CLI and MCP lifecycle consumers (21)

| File | Responsibility | Lines |
|---|---|---:|
| [src/cli/client.ts](../../src/cli/client.ts) | CLI daemon IPC client. | 6 |
| [src/cli/command.ts](../../src/cli/command.ts) | Daemon command grammar exposed in TUI. | 521 |
| [src/cli/hooks/useDaemonStatus.ts](../../src/cli/hooks/useDaemonStatus.ts) | Daemon status polling for UI. | 47 |
| [src/cli/index.tsx](../../src/cli/index.tsx) | Interactive CLI bootstrap. | 37 |
| [src/cli/panes/DaemonPane.tsx](../../src/cli/panes/DaemonPane.tsx) | Daemon controls and state presentation. | 126 |
| [src/cli/panes/DaemonSection.tsx](../../src/cli/panes/DaemonSection.tsx) | Daemon setup/lifecycle section. | 166 |
| [src/cli/panes/DebugPane.tsx](../../src/cli/panes/DebugPane.tsx) | Debug/orphan process actions; separate from normal managed lifecycle. | 80 |
| [src/cli/panes/SetupPane.tsx](../../src/cli/panes/SetupPane.tsx) | Setup surface consuming daemon services. | 88 |
| [src/cli/services/daemon.ts](../../src/cli/services/daemon.ts) | Status/start/stop routing, IPC shutdown and retained process stop target. | 235 |
| [src/cli/services/debug.ts](../../src/cli/services/debug.ts) | Adjacent process inspection and explicit orphan cleanup surface. | 547 |
| [src/cli/services/index.ts](../../src/cli/services/index.ts) | Public service exports. | 189 |
| [src/cli/services/lifecycle.ts](../../src/cli/services/lifecycle.ts) | PID/process capture, readiness, bounded stop and run-file cleanup. | 120 |
| [src/cli/services/maintenance.ts](../../src/cli/services/maintenance.ts) | Update/restart orchestration, source/managed routes and retained legacy git/npm/build maintenance. | 333 |
| [src/cli/services/managed-daemon-control.ts](../../src/cli/services/managed-daemon-control.ts) | Authenticated managed supervisor client and control API. | 290 |
| [src/cli/services/setup.ts](../../src/cli/services/setup.ts) | Adjacent model/bootstrap setup invoked by setup UI. | 138 |
| [src/cli/services/type-contracts/maintenance-result.ts](../../src/cli/services/type-contracts/maintenance-result.ts) | Maintenance result contract. | 52 |
| [src/daemon/mcp-register.ts](../../src/daemon/mcp-register.ts) | Writes host MCP registration and launcher configuration. | 405 |
| [src/mcp/server.ts](../../src/mcp/server.ts) | MCP server daemon-client integration. | 1303 |
| [src/mcp/session-bootstrap.ts](../../src/mcp/session-bootstrap.ts) | MCP session bootstrap against daemon. | 39 |
| [src/shared/ipc-client.ts](../../src/shared/ipc-client.ts) | Shared Unix-socket client transport consumed by lifecycle callers. | 467 |
| [src/shared/update-source.ts](../../src/shared/update-source.ts) | Configured update repository/branch resolution and arguments. | 83 |

### Daemon startup, shutdown and process ownership (26)

| File | Responsibility | Lines |
|---|---|---:|
| [src/daemon/admin-handlers.ts](../../src/daemon/admin-handlers.ts) | Administrative IPC methods including shutdown and update outcome; update ownership delegated by main dispatch. | 125 |
| [src/daemon/config-write.ts](../../src/daemon/config-write.ts) | Daemon configuration persistence integration. | 114 |
| [src/daemon/fatal.ts](../../src/daemon/fatal.ts) | Fatal process exit handling. | 63 |
| [src/daemon/handler-runtime.ts](../../src/daemon/handler-runtime.ts) | Shared handler lifecycle/runtime context. | 1919 |
| [src/daemon/index.ts](../../src/daemon/index.ts) | Daemon startup/teardown assembly and unary daemon.update interception; Linux source vs macOS managed launch. | 765 |
| [src/daemon/installed-commit.ts](../../src/daemon/installed-commit.ts) | Installed source commit identity used for freshness/update reporting. | 50 |
| [src/daemon/lifecycle-registry.ts](../../src/daemon/lifecycle-registry.ts) | Registry of owned resources to drain/close. | 77 |
| [src/daemon/lifecycle.ts](../../src/daemon/lifecycle.ts) | PID establishment, already-running checks and bootstrap integration. | 131 |
| [src/daemon/run-file-ownership.ts](../../src/daemon/run-file-ownership.ts) | Daemon run-file ownership integration. | 154 |
| [src/daemon/server.ts](../../src/daemon/server.ts) | Unix socket JSON-RPC server and response delivery boundary. | 448 |
| [src/daemon/shutdown-watchdog.ts](../../src/daemon/shutdown-watchdog.ts) | Bounded shutdown watchdog coordination. | 48 |
| [src/daemon/shutdown.ts](../../src/daemon/shutdown.ts) | Phased subsystem/store shutdown, shutdown completion and watchdog arming. | 213 |
| [src/daemon/status.ts](../../src/daemon/status.ts) | Status snapshots consumed by lifecycle clients. | 122 |
| [src/daemon/supervisor-run-files.ts](../../src/daemon/supervisor-run-files.ts) | Supervisor-owned PID/socket/run-file handling. | 234 |
| [src/daemon/supervisor-socket.ts](../../src/daemon/supervisor-socket.ts) | Managed supervisor control socket. | 100 |
| [src/daemon/supervisor.ts](../../src/daemon/supervisor.ts) | OS-level daemon supervisor orchestration. | 451 |
| [src/daemon/update-runner.ts](../../src/daemon/update-runner.ts) | Retained detached legacy shell updater, locks and outcome machinery; no external production launchUpdate caller found in scan. | 303 |
| [src/shared/daemon-process-client.ts](../../src/shared/daemon-process-client.ts) | Process broker capabilities, retained stop targets and lifecycle client. | 195 |
| [src/shared/daemon-process.ts](../../src/shared/daemon-process.ts) | Process incarnation and exact process identity. | 81 |
| [src/shared/daemon-run-files.ts](../../src/shared/daemon-run-files.ts) | Run-file guard/identity/ownership primitives. | 411 |
| [src/shared/daemon-supervisor-protocol.ts](../../src/shared/daemon-supervisor-protocol.ts) | Supervisor request/response protocol. | 291 |
| [src/shared/darwin-lifecycle.ts](../../src/shared/darwin-lifecycle.ts) | macOS process identity, launch context/job exit and directory swap adapter. | 281 |
| [src/shared/locks/lock-manager.ts](../../src/shared/locks/lock-manager.ts) | Adjacent shared lock infrastructure. | 875 |
| [src/shared/locks/maintenance-lock.ts](../../src/shared/locks/maintenance-lock.ts) | Adjacent maintenance mutual exclusion. | 128 |
| [src/shared/paths.ts](../../src/shared/paths.ts) | Central installation, run-file, data and log path definitions. | 134 |
| [src/shared/process-group.ts](../../src/shared/process-group.ts) | Adjacent general child process group timeout/abort/closure support. | 172 |

### macOS managed lifecycle, migration and update (27)

| File | Responsibility | Lines |
|---|---|---:|
| [src/daemon/fresh-managed-activation.ts](../../src/daemon/fresh-managed-activation.ts) | Fresh managed installation activation. | 220 |
| [src/daemon/legacy-admin-guard.ts](../../src/daemon/legacy-admin-guard.ts) | Legacy administrative request gate during cutover. | 59 |
| [src/daemon/legacy-cutover-admission.ts](../../src/daemon/legacy-cutover-admission.ts) | Legacy launch recipe/context admission, launcher fencing and generated dispatchers. | 390 |
| [src/daemon/legacy-daemon-cutover.ts](../../src/daemon/legacy-daemon-cutover.ts) | Legacy-to-managed cutover coordinator. | 134 |
| [src/daemon/legacy-drain-evidence.ts](../../src/daemon/legacy-drain-evidence.ts) | Legacy drain completion evidence. | 71 |
| [src/daemon/legacy-launch-job.ts](../../src/daemon/legacy-launch-job.ts) | Legacy launch job discovery/handling. | 292 |
| [src/daemon/legacy-private-drain.ts](../../src/daemon/legacy-private-drain.ts) | Private legacy daemon drain handshake. | 106 |
| [src/daemon/legacy-public-stop.ts](../../src/daemon/legacy-public-stop.ts) | Public IPC stop path for legacy predecessor. | 50 |
| [src/daemon/legacy-run-guard.ts](../../src/daemon/legacy-run-guard.ts) | Legacy daemon run ownership guard. | 191 |
| [src/daemon/managed-bundle-proof.ts](../../src/daemon/managed-bundle-proof.ts) | Installed managed bundle proof checks. | 108 |
| [src/daemon/managed-daemon-lifecycle.ts](../../src/daemon/managed-daemon-lifecycle.ts) | Managed daemon lifecycle controller. | 189 |
| [src/daemon/managed-daemon-probation.ts](../../src/daemon/managed-daemon-probation.ts) | Candidate probation/readiness admission. | 99 |
| [src/daemon/managed-release-inventory.ts](../../src/daemon/managed-release-inventory.ts) | Managed release file inventory and pin validation. | 141 |
| [src/daemon/managed-release-mach-o.ts](../../src/daemon/managed-release-mach-o.ts) | macOS binary/Mach-O validation. | 207 |
| [src/daemon/managed-release-staging.ts](../../src/daemon/managed-release-staging.ts) | Shared source staging, dependency/build/native qualification, inventory pins and runtime bindings; also used by Linux. | 273 |
| [src/daemon/managed-update-handoff.ts](../../src/daemon/managed-update-handoff.ts) | Update helper/supervisor handoff and acknowledgement. | 224 |
| [src/daemon/managed-update-ipc.ts](../../src/daemon/managed-update-ipc.ts) | Private managed update IPC and acknowledgement transport. | 57 |
| [src/daemon/managed-update-launch.ts](../../src/daemon/managed-update-launch.ts) | Launch detached managed update helper after public reply handling. | 115 |
| [src/daemon/managed-update-preparation.ts](../../src/daemon/managed-update-preparation.ts) | Prepare candidate, predecessor and update inputs. | 308 |
| [src/daemon/managed-update-recovery.ts](../../src/daemon/managed-update-recovery.ts) | Interrupted managed update recovery. | 477 |
| [src/daemon/managed-update-transaction.ts](../../src/daemon/managed-update-transaction.ts) | Managed update transaction, commit/rollback state. | 81 |
| [src/daemon/release-compatibility.ts](../../src/daemon/release-compatibility.ts) | Managed release/store compatibility contract. | 60 |
| [src/shared/daemon-bundle-release-floor.ts](../../src/shared/daemon-bundle-release-floor.ts) | Managed bundle anti-rollback/release floor state. | 52 |
| [src/shared/installation-mutation-gate.ts](../../src/shared/installation-mutation-gate.ts) | Mutation exclusion, reservations, receipts, journal and recovery authority. | 768 |
| [src/shared/managed-daemon-installation.ts](../../src/shared/managed-daemon-installation.ts) | Installation selector/descriptor, launchd plist/job management and quiescence verification. | 476 |
| [src/shared/managed-release-trust.ts](../../src/shared/managed-release-trust.ts) | Release trust and qualification envelopes. | 231 |
| [src/shared/managed-source-release.ts](../../src/shared/managed-source-release.ts) | Authenticated source release receipts and release floors. | 32 |

### Linux source lifecycle and shared source release support (13)

| File | Responsibility | Lines |
|---|---|---:|
| [src/daemon/source-predecessor.ts](../../src/daemon/source-predecessor.ts) | Predecessor inventory/fingerprint and independently authenticated rebuild preparation. | 188 |
| [src/daemon/source-release-qualification.ts](../../src/daemon/source-release-qualification.ts) | Source issuer/head/stage qualification; also used by macOS. | 99 |
| [src/daemon/source-store-inspection.ts](../../src/daemon/source-store-inspection.ts) | Store compatibility inspection for source transitions. | 68 |
| [src/daemon/source-store-probe.ts](../../src/daemon/source-store-probe.ts) | Isolated source store probe entry. | 69 |
| [src/daemon/source-transaction-host.ts](../../src/daemon/source-transaction-host.ts) | Native actor host integration, candidate readiness and store probes. | 208 |
| [src/daemon/source-update-launch.ts](../../src/daemon/source-update-launch.ts) | Public daemon update launch for Linux source control. | 88 |
| [src/daemon/source-update-transaction.ts](../../src/daemon/source-update-transaction.ts) | Linux source update/lifecycle transaction, exclusive operation and recovery. | 398 |
| [src/shared/source-actor-client.ts](../../src/shared/source-actor-client.ts) | Native retained actor tickets, control and child scope ownership. | 362 |
| [src/shared/source-installation.ts](../../src/shared/source-installation.ts) | Atomic source selector/journal, installation store and pin/selection validation. | 433 |
| [src/shared/source-release-compatibility.ts](../../src/shared/source-release-compatibility.ts) | Source compatibility validation shared across targets. | 98 |
| [src/shared/source-release-target.ts](../../src/shared/source-release-target.ts) | Source release target contracts. | 15 |
| [src/shared/source-routing.ts](../../src/shared/source-routing.ts) | Caller resolution of selected source control/launch entry and control invocation. | 110 |
| [src/shared/source-update-outcomes.ts](../../src/shared/source-update-outcomes.ts) | Acknowledged and durable source update outcome records. | 131 |

### Native lifecycle helpers and build wiring (14)

| File | Responsibility | Lines |
|---|---|---:|
| [.gitignore](../../.gitignore) | Generated/runtime output exclusions relevant to inventory boundaries. | 33 |
| [build-process-broker.mjs](../../build-process-broker.mjs) | Builds process broker, platform lifecycle and source actor binaries. | 40 |
| [build-shutdown-watchdog.mjs](../../build-shutdown-watchdog.mjs) | Builds standalone shutdown watchdog. | 12 |
| [copy-assets.mjs](../../copy-assets.mjs) | Copies runtime resources into compiled output. | 74 |
| [package-lock.json](../../package-lock.json) | Locked dependency graph consumed by installation/staging npm operations. | 9852 |
| [package.json](../../package.json) | Runtime binaries/dependencies and build, test, packaging script entry points. | 154 |
| [src/native/darwin-lifecycle/identity.c](../../src/native/darwin-lifecycle/identity.c) | macOS native lifecycle identity/launch/swap operations. | 218 |
| [src/native/process-broker/broker.h](../../src/native/process-broker/broker.h) | Native broker protocol/backend contract. | 21 |
| [src/native/process-broker/darwin.c](../../src/native/process-broker/darwin.c) | Darwin process identity/signaling backend. | 81 |
| [src/native/process-broker/linux.c](../../src/native/process-broker/linux.c) | Linux process identity/signaling backend. | 84 |
| [src/native/process-broker/main.c](../../src/native/process-broker/main.c) | Native process broker executable and command handling. | 69 |
| [src/native/source-actor/main.c](../../src/native/source-actor/main.c) | Linux retained source actor, child scopes and operation control. | 387 |
| [tsconfig.json](../../tsconfig.json) | Production TypeScript build configuration. | 33 |
| [tsconfig.typecheck.json](../../tsconfig.typecheck.json) | Type-check configuration. | 13 |

### Release, signing, qualification and distribution (27)

| File | Responsibility | Lines |
|---|---|---:|
| [scripts/bundle-release-bootstrap.mjs](../../scripts/bundle-release-bootstrap.mjs) | Bundle independent source release verifier. | 31 |
| [scripts/check-daemon-release-policy.sh](../../scripts/check-daemon-release-policy.sh) | Release policy gate. | 27 |
| [scripts/daemon-bundle-metadata.mjs](../../scripts/daemon-bundle-metadata.mjs) | Managed bundle metadata. | 129 |
| [scripts/daemon-development-metadata.mjs](../../scripts/daemon-development-metadata.mjs) | Development bundle metadata. | 144 |
| [scripts/daemon-release-artifact.sh](../../scripts/daemon-release-artifact.sh) | Release artifact shell operations. | 48 |
| [scripts/fetch-linux-daemon-candidate.mjs](../../scripts/fetch-linux-daemon-candidate.mjs) | Fetch Linux candidate. | 167 |
| [scripts/install-daemon-bundle.mjs](../../scripts/install-daemon-bundle.mjs) | Install managed bundle. | 112 |
| [scripts/install-daemon-development-bundle.mjs](../../scripts/install-daemon-development-bundle.mjs) | Install signed-development bundle. | 172 |
| [scripts/linux-daemon-dispatch.mjs](../../scripts/linux-daemon-dispatch.mjs) | Linux candidate dispatch. | 59 |
| [scripts/linux-daemon-metadata.mjs](../../scripts/linux-daemon-metadata.mjs) | Linux candidate metadata. | 123 |
| [scripts/linux-daemon-qualification.mjs](../../scripts/linux-daemon-qualification.mjs) | Linux candidate qualification. | 104 |
| [scripts/linux-daemon-signing-ledger.mjs](../../scripts/linux-daemon-signing-ledger.mjs) | Linux signing ledger. | 116 |
| [scripts/package-daemon-bootstrap.mjs](../../scripts/package-daemon-bootstrap.mjs) | Package bootstrap distribution. | 48 |
| [scripts/package-daemon-candidate.mjs](../../scripts/package-daemon-candidate.mjs) | Package macOS managed candidate. | 160 |
| [scripts/package-daemon-development.mjs](../../scripts/package-daemon-development.mjs) | Package signed-development bundle. | 169 |
| [scripts/package-linux-daemon-candidate.mjs](../../scripts/package-linux-daemon-candidate.mjs) | Package separate Linux candidate bundle lane. | 192 |
| [scripts/prepare-daemon-qualification.mjs](../../scripts/prepare-daemon-qualification.mjs) | Prepare qualification inputs. | 43 |
| [scripts/prepare-source-release.mjs](../../scripts/prepare-source-release.mjs) | Validate exact source/evidence/compatibility inputs; prepare signed source release and installer. | 89 |
| [scripts/promote-daemon-candidate.mjs](../../scripts/promote-daemon-candidate.mjs) | Promote qualified candidate. | 63 |
| [scripts/qualify-daemon-development.mjs](../../scripts/qualify-daemon-development.mjs) | Qualify development bundle. | 116 |
| [scripts/record-daemon-qualification.mjs](../../scripts/record-daemon-qualification.mjs) | Record qualification receipts. | 25 |
| [scripts/sign-daemon-development.mjs](../../scripts/sign-daemon-development.mjs) | Sign development bundle. | 206 |
| [scripts/sign-linux-daemon-candidate.mjs](../../scripts/sign-linux-daemon-candidate.mjs) | Sign Linux candidate. | 87 |
| [scripts/stage-daemon-bundle.mjs](../../scripts/stage-daemon-bundle.mjs) | Stage managed bundle. | 204 |
| [scripts/verify-daemon-bootstrap.sh](../../scripts/verify-daemon-bootstrap.sh) | Verify bootstrap assets. | 15 |
| [scripts/verify-daemon-bundle.mjs](../../scripts/verify-daemon-bundle.mjs) | Verify managed bundle. | 61 |
| [scripts/verify-installed-runtime.mjs](../../scripts/verify-installed-runtime.mjs) | Verify installed runtime integrity. | 25 |

### VS Code lifecycle and host consumers (24)

| File | Responsibility | Lines |
|---|---|---:|
| [vscode-plugin/assets/insrc-daemon-install.sh](../../vscode-plugin/assets/insrc-daemon-install.sh) | Generated packaged copy of canonical source installer. | 734 |
| [vscode-plugin/assets/node-runtime-policy.json](../../vscode-plugin/assets/node-runtime-policy.json) | Packaged runtime policy copy. | 40 |
| [vscode-plugin/esbuild.mjs](../../vscode-plugin/esbuild.mjs) | Extension bundling and runtime asset packaging. | 61 |
| [vscode-plugin/package.json](../../vscode-plugin/package.json) | Extension commands, packaging and dependencies. | 923 |
| [vscode-plugin/src/daemon/commands.ts](../../vscode-plugin/src/daemon/commands.ts) | Daemon command/argument construction. | 89 |
| [vscode-plugin/src/daemon/controller.ts](../../vscode-plugin/src/daemon/controller.ts) | Install/update via packaged installer and selected lifecycle control. | 108 |
| [vscode-plugin/src/daemon/paths.ts](../../vscode-plugin/src/daemon/paths.ts) | Selected daemon/control/MCP root resolution. | 83 |
| [vscode-plugin/src/daemon/subprocess.ts](../../vscode-plugin/src/daemon/subprocess.ts) | Lifecycle child process launch/closure. | 56 |
| [vscode-plugin/src/extension.ts](../../vscode-plugin/src/extension.ts) | Registers lifecycle controls, startup and freshness flows. | 1190 |
| [vscode-plugin/src/freshness/daemon-freshness.ts](../../vscode-plugin/src/freshness/daemon-freshness.ts) | Installed daemon freshness and upgrade/restart prompting. | 307 |
| [vscode-plugin/src/hosts/adapter.ts](../../vscode-plugin/src/hosts/adapter.ts) | Host registration/launcher, command or steering integration; adjacent to daemon/MCP installation. | 110 |
| [vscode-plugin/src/hosts/commands.ts](../../vscode-plugin/src/hosts/commands.ts) | Host registration/launcher, command or steering integration; adjacent to daemon/MCP installation. | 83 |
| [vscode-plugin/src/hosts/fs.ts](../../vscode-plugin/src/hosts/fs.ts) | Host registration/launcher, command or steering integration; adjacent to daemon/MCP installation. | 59 |
| [vscode-plugin/src/hosts/mcp-writer.ts](../../vscode-plugin/src/hosts/mcp-writer.ts) | Host registration/launcher, command or steering integration; adjacent to daemon/MCP installation. | 125 |
| [vscode-plugin/src/hosts/specs.ts](../../vscode-plugin/src/hosts/specs.ts) | Host registration/launcher, command or steering integration; adjacent to daemon/MCP installation. | 86 |
| [vscode-plugin/src/hosts/steering-body.ts](../../vscode-plugin/src/hosts/steering-body.ts) | Host registration/launcher, command or steering integration; adjacent to daemon/MCP installation. | 49 |
| [vscode-plugin/src/hosts/steering-writer.ts](../../vscode-plugin/src/hosts/steering-writer.ts) | Host registration/launcher, command or steering integration; adjacent to daemon/MCP installation. | 151 |
| [vscode-plugin/src/hosts/toml-mcp-writer.ts](../../vscode-plugin/src/hosts/toml-mcp-writer.ts) | Host registration/launcher, command or steering integration; adjacent to daemon/MCP installation. | 167 |
| [vscode-plugin/src/hosts/types.ts](../../vscode-plugin/src/hosts/types.ts) | Host registration/launcher, command or steering integration; adjacent to daemon/MCP installation. | 76 |
| [vscode-plugin/src/models/model-tier-picker.ts](../../vscode-plugin/src/models/model-tier-picker.ts) | Adjacent configuration caller requiring daemon restart. | 497 |
| [vscode-plugin/src/panels/daemon-gateway.ts](../../vscode-plugin/src/panels/daemon-gateway.ts) | Panel-facing daemon operations/IPC. | 173 |
| [vscode-plugin/src/panels/orphan-kill.ts](../../vscode-plugin/src/panels/orphan-kill.ts) | Separate consent-gated stray process cleanup; excludes managed daemon PID. | 118 |
| [vscode-plugin/src/surfaces/command-registry.ts](../../vscode-plugin/src/surfaces/command-registry.ts) | Extension command registration boundary. | 60 |
| [vscode-plugin/src/uninstall.ts](../../vscode-plugin/src/uninstall.ts) | Extension uninstall cleanup integration. | 84 |

### JetBrains lifecycle and host consumers (32)

| File | Responsibility | Lines |
|---|---|---:|
| [jetbrains-plugin/build.gradle.kts](../../jetbrains-plugin/build.gradle.kts) | Build/resource generation and packaged installer/runtime assets. | 158 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/PluginLifecycle.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/PluginLifecycle.kt) | Plugin startup/shutdown lifecycle integration. | 73 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt) | Daemon gateway contract. | 1925 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt) | Daemon gateway implementation/service. | 92 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt) | Unix socket RPC transport. | 394 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/OrphanProcessSeam.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/OrphanProcessSeam.kt) | Separate explicit stray process inspection/kill via ProcessHandle, excluding managed PID. | 191 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/DaemonFreshnessFlow.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/DaemonFreshnessFlow.kt) | Installed commit/plugin freshness and daemon upgrade/restart flow. | 302 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/InstalledCommitFreshnessConsumer.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/InstalledCommitFreshnessConsumer.kt) | Installed commit/plugin freshness and daemon upgrade/restart flow. | 194 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/LastSeenPluginVersionStore.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/LastSeenPluginVersionStore.kt) | Installed commit/plugin freshness and daemon upgrade/restart flow. | 46 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/AiHostAdapter.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/AiHostAdapter.kt) | AI host detection, MCP launcher/config registration or associated marker/steering support. | 118 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/AiHostAdapterImpl.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/AiHostAdapterImpl.kt) | AI host detection, MCP launcher/config registration or associated marker/steering support. | 44 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/HostDetection.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/HostDetection.kt) | AI host detection, MCP launcher/config registration or associated marker/steering support. | 59 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/InsrcMcpRegistration.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/InsrcMcpRegistration.kt) | AI host detection, MCP launcher/config registration or associated marker/steering support. | 84 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/JetBrainsHostProbes.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/JetBrainsHostProbes.kt) | AI host detection, MCP launcher/config registration or associated marker/steering support. | 107 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/JsonMcpConfigWriter.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/JsonMcpConfigWriter.kt) | AI host detection, MCP launcher/config registration or associated marker/steering support. | 99 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/MarkerFileWriter.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/MarkerFileWriter.kt) | AI host detection, MCP launcher/config registration or associated marker/steering support. | 87 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/MarkerSection.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/MarkerSection.kt) | AI host detection, MCP launcher/config registration or associated marker/steering support. | 136 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/McpWiringLifecycle.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/McpWiringLifecycle.kt) | AI host detection, MCP launcher/config registration or associated marker/steering support. | 47 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunner.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunner.kt) | JetBrains lifecycle setup, consent, runtime provisioning/resolution or command execution; responsibility named by class/file. | 85 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleContracts.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleContracts.kt) | JetBrains lifecycle setup, consent, runtime provisioning/resolution or command execution; responsibility named by class/file. | 60 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleModel.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleModel.kt) | JetBrains lifecycle setup, consent, runtime provisioning/resolution or command execution; responsibility named by class/file. | 83 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleService.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleService.kt) | JetBrains lifecycle setup, consent, runtime provisioning/resolution or command execution; responsibility named by class/file. | 265 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonSetupPolicy.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonSetupPolicy.kt) | JetBrains lifecycle setup, consent, runtime provisioning/resolution or command execution; responsibility named by class/file. | 28 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultNodeRuntimeResolver.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultNodeRuntimeResolver.kt) | JetBrains lifecycle setup, consent, runtime provisioning/resolution or command execution; responsibility named by class/file. | 13 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultPrivateNodeProvisioner.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultPrivateNodeProvisioner.kt) | JetBrains lifecycle setup, consent, runtime provisioning/resolution or command execution; responsibility named by class/file. | 64 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/NativeChildEnvironment.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/NativeChildEnvironment.kt) | JetBrains lifecycle setup, consent, runtime provisioning/resolution or command execution; responsibility named by class/file. | 32 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/ScriptDaemonProvisioner.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/ScriptDaemonProvisioner.kt) | JetBrains lifecycle setup, consent, runtime provisioning/resolution or command execution; responsibility named by class/file. | 112 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/SetupConsentStoreService.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/SetupConsentStoreService.kt) | JetBrains lifecycle setup, consent, runtime provisioning/resolution or command execution; responsibility named by class/file. | 43 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingLifecycle.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingLifecycle.kt) | Setup/onboarding lifecycle consumer. | 137 |
| [jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DaemonConfigurable.kt](../../jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DaemonConfigurable.kt) | Daemon settings/actions UI. | 149 |
| [jetbrains-plugin/src/main/resources/META-INF/plugin.xml](../../jetbrains-plugin/src/main/resources/META-INF/plugin.xml) | Plugin service/action/lifecycle registrations. | 402 |
| [jetbrains-plugin/src/main/resources/insrc/node-runtime-policy.json](../../jetbrains-plugin/src/main/resources/insrc/node-runtime-policy.json) | Checked-in runtime policy copy. | 40 |

### Adjacent startup/shutdown resource boundaries (21)

| File | Responsibility | Lines |
|---|---|---:|
| [src/daemon/backup.ts](../../src/daemon/backup.ts) | Data/indexing/backup resource initialized or drained by lifecycle; not a second lifecycle controller. | 107 |
| [src/daemon/queue.ts](../../src/daemon/queue.ts) | Data/indexing/backup resource initialized or drained by lifecycle; not a second lifecycle controller. | 462 |
| [src/daemon/store-file-open-diagnostic.ts](../../src/daemon/store-file-open-diagnostic.ts) | Data/indexing/backup resource initialized or drained by lifecycle; not a second lifecycle controller. | 118 |
| [src/daemon/threads/admin-status.ts](../../src/daemon/threads/admin-status.ts) | In-process worker lifecycle/bootstrap boundary; worker supervisor is distinct from OS daemon supervisor. | 130 |
| [src/daemon/threads/admin-worker.ts](../../src/daemon/threads/admin-worker.ts) | In-process worker lifecycle/bootstrap boundary; worker supervisor is distinct from OS daemon supervisor. | 48 |
| [src/daemon/threads/indexing-worker.ts](../../src/daemon/threads/indexing-worker.ts) | In-process worker lifecycle/bootstrap boundary; worker supervisor is distinct from OS daemon supervisor. | 179 |
| [src/daemon/threads/indexing-workers.ts](../../src/daemon/threads/indexing-workers.ts) | In-process worker lifecycle/bootstrap boundary; worker supervisor is distinct from OS daemon supervisor. | 100 |
| [src/daemon/threads/lazy-runtime.ts](../../src/daemon/threads/lazy-runtime.ts) | In-process worker lifecycle/bootstrap boundary; worker supervisor is distinct from OS daemon supervisor. | 50 |
| [src/daemon/threads/main-services.ts](../../src/daemon/threads/main-services.ts) | In-process worker lifecycle/bootstrap boundary; worker supervisor is distinct from OS daemon supervisor. | 237 |
| [src/daemon/threads/method-class.ts](../../src/daemon/threads/method-class.ts) | In-process worker lifecycle/bootstrap boundary; worker supervisor is distinct from OS daemon supervisor. | 405 |
| [src/daemon/threads/session-worker.ts](../../src/daemon/threads/session-worker.ts) | In-process worker lifecycle/bootstrap boundary; worker supervisor is distinct from OS daemon supervisor. | 211 |
| [src/daemon/threads/summary-worker.ts](../../src/daemon/threads/summary-worker.ts) | In-process worker lifecycle/bootstrap boundary; worker supervisor is distinct from OS daemon supervisor. | 66 |
| [src/daemon/threads/supervisor.ts](../../src/daemon/threads/supervisor.ts) | In-process worker lifecycle/bootstrap boundary; worker supervisor is distinct from OS daemon supervisor. | 191 |
| [src/daemon/threads/worker-entry.ts](../../src/daemon/threads/worker-entry.ts) | In-process worker lifecycle/bootstrap boundary; worker supervisor is distinct from OS daemon supervisor. | 99 |
| [src/daemon/threads/worker-requests.ts](../../src/daemon/threads/worker-requests.ts) | In-process worker lifecycle/bootstrap boundary; worker supervisor is distinct from OS daemon supervisor. | 114 |
| [src/daemon/threads/workers.ts](../../src/daemon/threads/workers.ts) | In-process worker lifecycle/bootstrap boundary; worker supervisor is distinct from OS daemon supervisor. | 116 |
| [src/db/client.ts](../../src/db/client.ts) | Data/indexing/backup resource initialized or drained by lifecycle; not a second lifecycle controller. | 50 |
| [src/db/graph/store.ts](../../src/db/graph/store.ts) | Data/indexing/backup resource initialized or drained by lifecycle; not a second lifecycle controller. | 1504 |
| [src/db/lance/conn.ts](../../src/db/lance/conn.ts) | Data/indexing/backup resource initialized or drained by lifecycle; not a second lifecycle controller. | 189 |
| [src/indexer/index.ts](../../src/indexer/index.ts) | Data/indexing/backup resource initialized or drained by lifecycle; not a second lifecycle controller. | 1615 |
| [src/indexer/watcher.ts](../../src/indexer/watcher.ts) | Data/indexing/backup resource initialized or drained by lifecycle; not a second lifecycle controller. | 304 |

### CI and qualification harness (14)

| File | Responsibility | Lines |
|---|---|---:|
| [.github/workflows/ci.yml](../../.github/workflows/ci.yml) | CI build/qualification/signing/promotion or client packaging entry; lane named by workflow. | 51 |
| [.github/workflows/daemon-candidate.yml](../../.github/workflows/daemon-candidate.yml) | CI build/qualification/signing/promotion or client packaging entry; lane named by workflow. | 68 |
| [.github/workflows/daemon-linux-candidate.yml](../../.github/workflows/daemon-linux-candidate.yml) | CI build/qualification/signing/promotion or client packaging entry; lane named by workflow. | 77 |
| [.github/workflows/daemon-promotion.yml](../../.github/workflows/daemon-promotion.yml) | CI build/qualification/signing/promotion or client packaging entry; lane named by workflow. | 98 |
| [.github/workflows/daemon-qualification-sign.yml](../../.github/workflows/daemon-qualification-sign.yml) | CI build/qualification/signing/promotion or client packaging entry; lane named by workflow. | 54 |
| [.github/workflows/jetbrains-plugin.yml](../../.github/workflows/jetbrains-plugin.yml) | CI build/qualification/signing/promotion or client packaging entry; lane named by workflow. | 42 |
| [.github/workflows/vscode-plugin.yml](../../.github/workflows/vscode-plugin.yml) | CI build/qualification/signing/promotion or client packaging entry; lane named by workflow. | 66 |
| [scripts/clean-output.mjs](../../scripts/clean-output.mjs) | Test coordinator build/process ownership, execution/probes or output cleanup support; not installer runtime. | 4 |
| [scripts/test-harness/build.mjs](../../scripts/test-harness/build.mjs) | Test coordinator build/process ownership, execution/probes or output cleanup support; not installer runtime. | 121 |
| [scripts/test-harness/context.mjs](../../scripts/test-harness/context.mjs) | Test coordinator build/process ownership, execution/probes or output cleanup support; not installer runtime. | 175 |
| [scripts/test-harness/probe.mjs](../../scripts/test-harness/probe.mjs) | Test coordinator build/process ownership, execution/probes or output cleanup support; not installer runtime. | 36 |
| [scripts/test-harness/process.mjs](../../scripts/test-harness/process.mjs) | Test coordinator build/process ownership, execution/probes or output cleanup support; not installer runtime. | 117 |
| [scripts/test-harness/run.mjs](../../scripts/test-harness/run.mjs) | Test coordinator build/process ownership, execution/probes or output cleanup support; not installer runtime. | 111 |
| [scripts/test-harness/specialized.mjs](../../scripts/test-harness/specialized.mjs) | Test coordinator build/process ownership, execution/probes or output cleanup support; not installer runtime. | 38 |

### Tests and regression suites (137)

| File | Responsibility | Lines |
|---|---|---:|
| [jetbrains-plugin/__tests__/managed-update-confirmation-gradle.test.ts](../../jetbrains-plugin/__tests__/managed-update-confirmation-gradle.test.ts) | Test-only coverage: managed-update-confirmation-gradle. Presence does not establish passing status. | 47 |
| [jetbrains-plugin/__tests__/node-runtime-gradle.test.ts](../../jetbrains-plugin/__tests__/node-runtime-gradle.test.ts) | Test-only coverage: node-runtime-gradle. Presence does not establish passing status. | 32 |
| [jetbrains-plugin/__tests__/source-bootstrap-gradle.test.ts](../../jetbrains-plugin/__tests__/source-bootstrap-gradle.test.ts) | Test-only coverage: source-bootstrap-gradle. Presence does not establish passing status. | 31 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonActionGatewayTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonActionGatewayTest.kt) | Test-only daemon UI/gateway or orphan cleanup coverage; presence does not establish passing status. | 99 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayServiceTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayServiceTest.kt) | Test-only daemon UI/gateway or orphan cleanup coverage; presence does not establish passing status. | 61 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonStatusGatewayTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonStatusGatewayTest.kt) | Test-only daemon UI/gateway or orphan cleanup coverage; presence does not establish passing status. | 153 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/PersistentDaemonLaneTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/PersistentDaemonLaneTest.kt) | Test-only daemon UI/gateway or orphan cleanup coverage; presence does not establish passing status. | 165 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/debug/OrphanProcessSeamTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/debug/OrphanProcessSeamTest.kt) | Test-only daemon UI/gateway or orphan cleanup coverage; presence does not establish passing status. | 143 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/freshness/DaemonFreshnessFlowTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/freshness/DaemonFreshnessFlowTest.kt) | Test-only coverage: DaemonFreshnessFlow. Presence does not establish passing status. | 388 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/freshness/InstalledCommitFreshnessConsumerTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/freshness/InstalledCommitFreshnessConsumerTest.kt) | Test-only coverage: InstalledCommitFreshnessConsumer. Presence does not establish passing status. | 108 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/freshness/LastSeenPluginVersionStoreTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/freshness/LastSeenPluginVersionStoreTest.kt) | Test-only coverage: LastSeenPluginVersionStore. Presence does not establish passing status. | 41 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt) | Test-only coverage: DaemonLifecycleCommandRunner. Presence does not establish passing status. | 120 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleServiceTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleServiceTest.kt) | Test-only coverage: DaemonLifecycleService. Presence does not establish passing status. | 250 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonProvisionerTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonProvisionerTest.kt) | Test-only coverage: DaemonProvisioner. Presence does not establish passing status. | 104 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DecidePolicyTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DecidePolicyTest.kt) | Test-only coverage: DecidePolicy. Presence does not establish passing status. | 31 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonScriptLocatorTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonScriptLocatorTest.kt) | Test-only coverage: DefaultDaemonScriptLocator. Presence does not establish passing status. | 54 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/NodeRuntimeResolverTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/NodeRuntimeResolverTest.kt) | Test-only coverage: NodeRuntimeResolver. Presence does not establish passing status. | 22 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/PrivateNodeProvisionerTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/PrivateNodeProvisionerTest.kt) | Test-only coverage: PrivateNodeProvisioner. Presence does not establish passing status. | 42 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/S003TypesTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/S003TypesTest.kt) | Test-only coverage: S003Types. Presence does not establish passing status. | 63 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/SetupConsentStoreTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/SetupConsentStoreTest.kt) | Test-only coverage: SetupConsentStore. Presence does not establish passing status. | 32 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/SourceBootstrapIntegrationTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/SourceBootstrapIntegrationTest.kt) | Test-only coverage: SourceBootstrapIntegration. Presence does not establish passing status. | 87 |
| [jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/ops/DaemonPageTest.kt](../../jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/ops/DaemonPageTest.kt) | Test-only daemon UI/gateway or orphan cleanup coverage; presence does not establish passing status. | 65 |
| [scripts/__tests__/daemon-bundle-metadata.test.ts](../../scripts/__tests__/daemon-bundle-metadata.test.ts) | Test-only coverage: daemon-bundle-metadata. Presence does not establish passing status. | 152 |
| [scripts/__tests__/daemon-development-metadata.test.ts](../../scripts/__tests__/daemon-development-metadata.test.ts) | Test-only coverage: daemon-development-metadata. Presence does not establish passing status. | 159 |
| [scripts/__tests__/daemon-release-artifact.test.ts](../../scripts/__tests__/daemon-release-artifact.test.ts) | Test-only coverage: daemon-release-artifact. Presence does not establish passing status. | 70 |
| [scripts/__tests__/daemon-release-policy.test.ts](../../scripts/__tests__/daemon-release-policy.test.ts) | Test-only coverage: daemon-release-policy. Presence does not establish passing status. | 87 |
| [scripts/__tests__/fetch-linux-daemon-candidate.test.ts](../../scripts/__tests__/fetch-linux-daemon-candidate.test.ts) | Test-only coverage: fetch-linux-daemon-candidate. Presence does not establish passing status. | 171 |
| [scripts/__tests__/historical-macos-upgrade-native.test.ts](../../scripts/__tests__/historical-macos-upgrade-native.test.ts) | Test-only coverage: historical-macos-upgrade-native. Presence does not establish passing status. | 64 |
| [scripts/__tests__/ide-source-entrypoints-native.test.ts](../../scripts/__tests__/ide-source-entrypoints-native.test.ts) | Test-only coverage: ide-source-entrypoints-native. Presence does not establish passing status. | 5 |
| [scripts/__tests__/linux-daemon-dispatch.test.ts](../../scripts/__tests__/linux-daemon-dispatch.test.ts) | Test-only coverage: linux-daemon-dispatch. Presence does not establish passing status. | 66 |
| [scripts/__tests__/linux-daemon-final-signing.test.ts](../../scripts/__tests__/linux-daemon-final-signing.test.ts) | Test-only coverage: linux-daemon-final-signing. Presence does not establish passing status. | 277 |
| [scripts/__tests__/linux-daemon-metadata.test.ts](../../scripts/__tests__/linux-daemon-metadata.test.ts) | Test-only coverage: linux-daemon-metadata. Presence does not establish passing status. | 64 |
| [scripts/__tests__/linux-daemon-qualification.test.ts](../../scripts/__tests__/linux-daemon-qualification.test.ts) | Test-only coverage: linux-daemon-qualification. Presence does not establish passing status. | 41 |
| [scripts/__tests__/node-runtime-bootstrap-native.test.ts](../../scripts/__tests__/node-runtime-bootstrap-native.test.ts) | Test-only coverage: node-runtime-bootstrap-native. Presence does not establish passing status. | 44 |
| [scripts/__tests__/node-runtime-cli-native.test.ts](../../scripts/__tests__/node-runtime-cli-native.test.ts) | Test-only coverage: node-runtime-cli-native. Presence does not establish passing status. | 122 |
| [scripts/__tests__/node-runtime-coordinator-native.test.ts](../../scripts/__tests__/node-runtime-coordinator-native.test.ts) | Test-only coverage: node-runtime-coordinator-native. Presence does not establish passing status. | 31 |
| [scripts/__tests__/node-runtime-migration-native.test.ts](../../scripts/__tests__/node-runtime-migration-native.test.ts) | Test-only coverage: node-runtime-migration-native. Presence does not establish passing status. | 94 |
| [scripts/__tests__/node-runtime-packaging.test.ts](../../scripts/__tests__/node-runtime-packaging.test.ts) | Test-only coverage: node-runtime-packaging. Presence does not establish passing status. | 77 |
| [scripts/__tests__/node-runtime-policy.test.ts](../../scripts/__tests__/node-runtime-policy.test.ts) | Test-only coverage: node-runtime-policy. Presence does not establish passing status. | 61 |
| [scripts/__tests__/node-runtime-python-native.test.ts](../../scripts/__tests__/node-runtime-python-native.test.ts) | Test-only coverage: node-runtime-python-native. Presence does not establish passing status. | 46 |
| [scripts/__tests__/node-runtime-shell-native.test.ts](../../scripts/__tests__/node-runtime-shell-native.test.ts) | Test-only coverage: node-runtime-shell-native. Presence does not establish passing status. | 140 |
| [scripts/__tests__/node-runtime-store.test.ts](../../scripts/__tests__/node-runtime-store.test.ts) | Test-only coverage: node-runtime-store. Presence does not establish passing status. | 200 |
| [scripts/__tests__/package-daemon-candidate.test.ts](../../scripts/__tests__/package-daemon-candidate.test.ts) | Test-only coverage: package-daemon-candidate. Presence does not establish passing status. | 122 |
| [scripts/__tests__/package-daemon-development.test.ts](../../scripts/__tests__/package-daemon-development.test.ts) | Test-only coverage: package-daemon-development. Presence does not establish passing status. | 125 |
| [scripts/__tests__/package-linux-daemon-candidate.test.ts](../../scripts/__tests__/package-linux-daemon-candidate.test.ts) | Test-only coverage: package-linux-daemon-candidate. Presence does not establish passing status. | 99 |
| [scripts/__tests__/promote-daemon-candidate.test.ts](../../scripts/__tests__/promote-daemon-candidate.test.ts) | Test-only coverage: promote-daemon-candidate. Presence does not establish passing status. | 88 |
| [scripts/__tests__/sign-daemon-development.test.ts](../../scripts/__tests__/sign-daemon-development.test.ts) | Test-only coverage: sign-daemon-development. Presence does not establish passing status. | 199 |
| [scripts/__tests__/source-bootstrap-inventory.test.ts](../../scripts/__tests__/source-bootstrap-inventory.test.ts) | Test-only coverage: source-bootstrap-inventory. Presence does not establish passing status. | 85 |
| [scripts/__tests__/source-consumers-native.test.ts](../../scripts/__tests__/source-consumers-native.test.ts) | Test-only coverage: source-consumers-native. Presence does not establish passing status. | 175 |
| [scripts/__tests__/source-entrypoints-native.test.ts](../../scripts/__tests__/source-entrypoints-native.test.ts) | Test-only coverage: source-entrypoints-native. Presence does not establish passing status. | 9 |
| [scripts/__tests__/source-predecessor-native.test.ts](../../scripts/__tests__/source-predecessor-native.test.ts) | Test-only coverage: source-predecessor-native. Presence does not establish passing status. | 158 |
| [scripts/__tests__/source-upgrade-qualification-native.test.ts](../../scripts/__tests__/source-upgrade-qualification-native.test.ts) | Test-only coverage: source-upgrade-qualification-native. Presence does not establish passing status. | 190 |
| [scripts/__tests__/stage-daemon-bundle.test.ts](../../scripts/__tests__/stage-daemon-bundle.test.ts) | Test-only coverage: stage-daemon-bundle. Presence does not establish passing status. | 82 |
| [src/cli/__tests__/cli-services-daemon-errors.test.ts](../../src/cli/__tests__/cli-services-daemon-errors.test.ts) | Test-only coverage: cli-services-daemon-errors. Presence does not establish passing status. | 69 |
| [src/cli/panes/__tests__/DaemonSection.test.ts](../../src/cli/panes/__tests__/DaemonSection.test.ts) | Test-only coverage: DaemonSection. Presence does not establish passing status. | 220 |
| [src/cli/panes/__tests__/DebugPane.test.ts](../../src/cli/panes/__tests__/DebugPane.test.ts) | Test-only coverage: DebugPane. Presence does not establish passing status. | 141 |
| [src/cli/panes/__tests__/MCPSection.test.ts](../../src/cli/panes/__tests__/MCPSection.test.ts) | Test-only coverage: MCPSection. Presence does not establish passing status. | 132 |
| [src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts](../../src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts) | Test-only coverage: daemon-ctl-forced-stop. Presence does not establish passing status. | 135 |
| [src/cli/services/__tests__/daemon-ctl-install-marker.test.ts](../../src/cli/services/__tests__/daemon-ctl-install-marker.test.ts) | Test-only coverage: daemon-ctl-install-marker. Presence does not establish passing status. | 175 |
| [src/cli/services/__tests__/daemon-stop-forced.test.ts](../../src/cli/services/__tests__/daemon-stop-forced.test.ts) | Test-only coverage: daemon-stop-forced. Presence does not establish passing status. | 284 |
| [src/cli/services/__tests__/daemon-stop.test.ts](../../src/cli/services/__tests__/daemon-stop.test.ts) | Test-only coverage: daemon-stop. Presence does not establish passing status. | 80 |
| [src/cli/services/__tests__/debug-daemon-status.test.ts](../../src/cli/services/__tests__/debug-daemon-status.test.ts) | Test-only coverage: debug-daemon-status. Presence does not establish passing status. | 101 |
| [src/cli/services/__tests__/debug-orphans.test.ts](../../src/cli/services/__tests__/debug-orphans.test.ts) | Test-only coverage: debug-orphans. Presence does not establish passing status. | 163 |
| [src/cli/services/__tests__/maintenance-install-marker.test.ts](../../src/cli/services/__tests__/maintenance-install-marker.test.ts) | Test-only coverage: maintenance-install-marker. Presence does not establish passing status. | 34 |
| [src/cli/services/__tests__/maintenance-reconcile.test.ts](../../src/cli/services/__tests__/maintenance-reconcile.test.ts) | Test-only coverage: maintenance-reconcile. Presence does not establish passing status. | 180 |
| [src/cli/services/__tests__/maintenance-steering-refresh.test.ts](../../src/cli/services/__tests__/maintenance-steering-refresh.test.ts) | Test-only coverage: maintenance-steering-refresh. Presence does not establish passing status. | 104 |
| [src/cli/services/__tests__/managed-daemon-control.test.ts](../../src/cli/services/__tests__/managed-daemon-control.test.ts) | Test-only coverage: managed-daemon-control. Presence does not establish passing status. | 295 |
| [src/cli/services/__tests__/owned-runtime.test.ts](../../src/cli/services/__tests__/owned-runtime.test.ts) | Test-only coverage: owned-runtime. Presence does not establish passing status. | 42 |
| [src/daemon/__tests__/boot-cold-import.test.ts](../../src/daemon/__tests__/boot-cold-import.test.ts) | Test-only coverage: boot-cold-import. Presence does not establish passing status. | 151 |
| [src/daemon/__tests__/config-boot-reconcile.test.ts](../../src/daemon/__tests__/config-boot-reconcile.test.ts) | Test-only coverage: config-boot-reconcile. Presence does not establish passing status. | 145 |
| [src/daemon/__tests__/daemon-ctl-node-path.test.ts](../../src/daemon/__tests__/daemon-ctl-node-path.test.ts) | Test-only coverage: daemon-ctl-node-path. Presence does not establish passing status. | 289 |
| [src/daemon/__tests__/daemon-ctl-source.test.ts](../../src/daemon/__tests__/daemon-ctl-source.test.ts) | Test-only coverage: daemon-ctl-source. Presence does not establish passing status. | 104 |
| [src/daemon/__tests__/daemon-supervisor.test.ts](../../src/daemon/__tests__/daemon-supervisor.test.ts) | Test-only coverage: daemon-supervisor. Presence does not establish passing status. | 301 |
| [src/daemon/__tests__/fresh-managed-activation.test.ts](../../src/daemon/__tests__/fresh-managed-activation.test.ts) | Test-only coverage: fresh-managed-activation. Presence does not establish passing status. | 301 |
| [src/daemon/__tests__/installed-commit.test.ts](../../src/daemon/__tests__/installed-commit.test.ts) | Test-only coverage: installed-commit. Presence does not establish passing status. | 56 |
| [src/daemon/__tests__/legacy-admin-guard.test.ts](../../src/daemon/__tests__/legacy-admin-guard.test.ts) | Test-only coverage: legacy-admin-guard. Presence does not establish passing status. | 104 |
| [src/daemon/__tests__/legacy-cutover-admission.test.ts](../../src/daemon/__tests__/legacy-cutover-admission.test.ts) | Test-only coverage: legacy-cutover-admission. Presence does not establish passing status. | 315 |
| [src/daemon/__tests__/legacy-daemon-cutover.test.ts](../../src/daemon/__tests__/legacy-daemon-cutover.test.ts) | Test-only coverage: legacy-daemon-cutover. Presence does not establish passing status. | 83 |
| [src/daemon/__tests__/legacy-private-drain.test.ts](../../src/daemon/__tests__/legacy-private-drain.test.ts) | Test-only coverage: legacy-private-drain. Presence does not establish passing status. | 99 |
| [src/daemon/__tests__/legacy-run-guard.test.ts](../../src/daemon/__tests__/legacy-run-guard.test.ts) | Test-only coverage: legacy-run-guard. Presence does not establish passing status. | 131 |
| [src/daemon/__tests__/legacy-runtime-record.test.ts](../../src/daemon/__tests__/legacy-runtime-record.test.ts) | Test-only coverage: legacy-runtime-record. Presence does not establish passing status. | 23 |
| [src/daemon/__tests__/lifecycle-adopt-wiring.test.ts](../../src/daemon/__tests__/lifecycle-adopt-wiring.test.ts) | Test-only coverage: lifecycle-adopt-wiring. Presence does not establish passing status. | 130 |
| [src/daemon/__tests__/lifecycle-wiring.test.ts](../../src/daemon/__tests__/lifecycle-wiring.test.ts) | Test-only coverage: lifecycle-wiring. Presence does not establish passing status. | 145 |
| [src/daemon/__tests__/linux-installed-lifecycle.test.ts](../../src/daemon/__tests__/linux-installed-lifecycle.test.ts) | Test-only coverage: linux-installed-lifecycle. Presence does not establish passing status. | 23 |
| [src/daemon/__tests__/macos-upgrade-routing.test.ts](../../src/daemon/__tests__/macos-upgrade-routing.test.ts) | Test-only coverage: macos-upgrade-routing. Presence does not establish passing status. | 130 |
| [src/daemon/__tests__/managed-daemon-lifecycle.test.ts](../../src/daemon/__tests__/managed-daemon-lifecycle.test.ts) | Test-only coverage: managed-daemon-lifecycle. Presence does not establish passing status. | 301 |
| [src/daemon/__tests__/managed-development-bundle-proof.test.ts](../../src/daemon/__tests__/managed-development-bundle-proof.test.ts) | Test-only coverage: managed-development-bundle-proof. Presence does not establish passing status. | 118 |
| [src/daemon/__tests__/managed-release-bootstrap.test.ts](../../src/daemon/__tests__/managed-release-bootstrap.test.ts) | Test-only coverage: managed-release-bootstrap. Presence does not establish passing status. | 237 |
| [src/daemon/__tests__/managed-release-inventory.test.ts](../../src/daemon/__tests__/managed-release-inventory.test.ts) | Test-only coverage: managed-release-inventory. Presence does not establish passing status. | 83 |
| [src/daemon/__tests__/managed-release-mach-o.test.ts](../../src/daemon/__tests__/managed-release-mach-o.test.ts) | Test-only coverage: managed-release-mach-o. Presence does not establish passing status. | 206 |
| [src/daemon/__tests__/managed-release-staging.test.ts](../../src/daemon/__tests__/managed-release-staging.test.ts) | Test-only coverage: managed-release-staging. Presence does not establish passing status. | 509 |
| [src/daemon/__tests__/managed-release-trust.test.ts](../../src/daemon/__tests__/managed-release-trust.test.ts) | Test-only coverage: managed-release-trust. Presence does not establish passing status. | 120 |
| [src/daemon/__tests__/managed-update-handoff.test.ts](../../src/daemon/__tests__/managed-update-handoff.test.ts) | Test-only coverage: managed-update-handoff. Presence does not establish passing status. | 243 |
| [src/daemon/__tests__/managed-update-ipc.test.ts](../../src/daemon/__tests__/managed-update-ipc.test.ts) | Test-only coverage: managed-update-ipc. Presence does not establish passing status. | 210 |
| [src/daemon/__tests__/managed-update-transaction.test.ts](../../src/daemon/__tests__/managed-update-transaction.test.ts) | Test-only coverage: managed-update-transaction. Presence does not establish passing status. | 693 |
| [src/daemon/__tests__/release-compatibility.test.ts](../../src/daemon/__tests__/release-compatibility.test.ts) | Test-only coverage: release-compatibility. Presence does not establish passing status. | 125 |
| [src/daemon/__tests__/run-file-ownership.test.ts](../../src/daemon/__tests__/run-file-ownership.test.ts) | Test-only coverage: run-file-ownership. Presence does not establish passing status. | 124 |
| [src/daemon/__tests__/shutdown-bounded.test.ts](../../src/daemon/__tests__/shutdown-bounded.test.ts) | Test-only coverage: shutdown-bounded. Presence does not establish passing status. | 59 |
| [src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts](../../src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts) | Test-only coverage: shutdown-lifecycle-evidence. Presence does not establish passing status. | 113 |
| [src/daemon/__tests__/shutdown-store-failure.test.ts](../../src/daemon/__tests__/shutdown-store-failure.test.ts) | Test-only coverage: shutdown-store-failure. Presence does not establish passing status. | 296 |
| [src/daemon/__tests__/shutdown-watchdog.test.ts](../../src/daemon/__tests__/shutdown-watchdog.test.ts) | Test-only coverage: shutdown-watchdog. Presence does not establish passing status. | 118 |
| [src/daemon/__tests__/source-interruption.test.ts](../../src/daemon/__tests__/source-interruption.test.ts) | Test-only coverage: source-interruption. Presence does not establish passing status. | 213 |
| [src/daemon/__tests__/source-release-promotion.test.ts](../../src/daemon/__tests__/source-release-promotion.test.ts) | Test-only coverage: source-release-promotion. Presence does not establish passing status. | 124 |
| [src/daemon/__tests__/source-transaction-host.test.ts](../../src/daemon/__tests__/source-transaction-host.test.ts) | Test-only coverage: source-transaction-host. Presence does not establish passing status. | 132 |
| [src/daemon/__tests__/source-update-outcomes.test.ts](../../src/daemon/__tests__/source-update-outcomes.test.ts) | Test-only coverage: source-update-outcomes. Presence does not establish passing status. | 41 |
| [src/daemon/__tests__/source-update-transaction.test.ts](../../src/daemon/__tests__/source-update-transaction.test.ts) | Test-only coverage: source-update-transaction. Presence does not establish passing status. | 117 |
| [src/daemon/__tests__/supervisor-run-files.test.ts](../../src/daemon/__tests__/supervisor-run-files.test.ts) | Test-only coverage: supervisor-run-files. Presence does not establish passing status. | 242 |
| [src/daemon/__tests__/update-handlers.test.ts](../../src/daemon/__tests__/update-handlers.test.ts) | Test-only coverage: update-handlers. Presence does not establish passing status. | 103 |
| [src/daemon/__tests__/update-runner.test.ts](../../src/daemon/__tests__/update-runner.test.ts) | Test-only coverage: update-runner. Presence does not establish passing status. | 266 |
| [src/daemon/threads/__tests__/daemon-ctl-smoke.test.ts](../../src/daemon/threads/__tests__/daemon-ctl-smoke.test.ts) | Test-only coverage: daemon-ctl-smoke. Presence does not establish passing status. | 65 |
| [src/daemon/threads/__tests__/supervisor.test.ts](../../src/daemon/threads/__tests__/supervisor.test.ts) | Test-only coverage: supervisor. Presence does not establish passing status. | 231 |
| [src/shared/__tests__/daemon-bundle-release-floor.test.ts](../../src/shared/__tests__/daemon-bundle-release-floor.test.ts) | Test-only coverage: daemon-bundle-release-floor. Presence does not establish passing status. | 20 |
| [src/shared/__tests__/daemon-process-client.test.ts](../../src/shared/__tests__/daemon-process-client.test.ts) | Test-only coverage: daemon-process-client. Presence does not establish passing status. | 158 |
| [src/shared/__tests__/daemon-process.test.ts](../../src/shared/__tests__/daemon-process.test.ts) | Test-only coverage: daemon-process. Presence does not establish passing status. | 47 |
| [src/shared/__tests__/daemon-run-files.test.ts](../../src/shared/__tests__/daemon-run-files.test.ts) | Test-only coverage: daemon-run-files. Presence does not establish passing status. | 538 |
| [src/shared/__tests__/daemon-supervisor-protocol.test.ts](../../src/shared/__tests__/daemon-supervisor-protocol.test.ts) | Test-only coverage: daemon-supervisor-protocol. Presence does not establish passing status. | 137 |
| [src/shared/__tests__/darwin-lifecycle.test.ts](../../src/shared/__tests__/darwin-lifecycle.test.ts) | Test-only coverage: darwin-lifecycle. Presence does not establish passing status. | 186 |
| [src/shared/__tests__/installation-mutation-gate.test.ts](../../src/shared/__tests__/installation-mutation-gate.test.ts) | Test-only coverage: installation-mutation-gate. Presence does not establish passing status. | 281 |
| [src/shared/__tests__/process-broker-native.test.ts](../../src/shared/__tests__/process-broker-native.test.ts) | Test-only coverage: process-broker-native. Presence does not establish passing status. | 125 |
| [src/shared/__tests__/source-actor-boot.test.ts](../../src/shared/__tests__/source-actor-boot.test.ts) | Test-only coverage: source-actor-boot. Presence does not establish passing status. | 84 |
| [src/shared/__tests__/source-actor-native.test.ts](../../src/shared/__tests__/source-actor-native.test.ts) | Test-only coverage: source-actor-native. Presence does not establish passing status. | 268 |
| [src/shared/__tests__/source-installation.test.ts](../../src/shared/__tests__/source-installation.test.ts) | Test-only coverage: source-installation. Presence does not establish passing status. | 183 |
| [src/shared/__tests__/update-source.test.ts](../../src/shared/__tests__/update-source.test.ts) | Test-only coverage: update-source. Presence does not establish passing status. | 56 |
| [vscode-plugin/src/__tests__/uninstall.test.ts](../../vscode-plugin/src/__tests__/uninstall.test.ts) | Test-only coverage: uninstall. Presence does not establish passing status. | 89 |
| [vscode-plugin/src/daemon/__tests__/bundle.test.ts](../../vscode-plugin/src/daemon/__tests__/bundle.test.ts) | Test-only coverage: bundle. Presence does not establish passing status. | 55 |
| [vscode-plugin/src/daemon/__tests__/commands.test.ts](../../vscode-plugin/src/daemon/__tests__/commands.test.ts) | Test-only coverage: commands. Presence does not establish passing status. | 145 |
| [vscode-plugin/src/daemon/__tests__/controller.test.ts](../../vscode-plugin/src/daemon/__tests__/controller.test.ts) | Test-only coverage: controller. Presence does not establish passing status. | 214 |
| [vscode-plugin/src/daemon/__tests__/runtime-boundary.test.ts](../../vscode-plugin/src/daemon/__tests__/runtime-boundary.test.ts) | Test-only coverage: runtime-boundary. Presence does not establish passing status. | 10 |
| [vscode-plugin/src/freshness/__tests__/daemon-freshness.test.ts](../../vscode-plugin/src/freshness/__tests__/daemon-freshness.test.ts) | Test-only coverage: daemon-freshness. Presence does not establish passing status. | 502 |
| [vscode-plugin/src/freshness/__tests__/extension-wiring.test.ts](../../vscode-plugin/src/freshness/__tests__/extension-wiring.test.ts) | Test-only coverage: extension-wiring. Presence does not establish passing status. | 85 |
| [vscode-plugin/src/hosts/__tests__/activation.test.ts](../../vscode-plugin/src/hosts/__tests__/activation.test.ts) | Test-only coverage: activation. Presence does not establish passing status. | 52 |
| [vscode-plugin/src/hosts/__tests__/adapter.test.ts](../../vscode-plugin/src/hosts/__tests__/adapter.test.ts) | Test-only coverage: adapter. Presence does not establish passing status. | 176 |
| [vscode-plugin/src/hosts/__tests__/commands.test.ts](../../vscode-plugin/src/hosts/__tests__/commands.test.ts) | Test-only coverage: commands. Presence does not establish passing status. | 144 |
| [vscode-plugin/src/hosts/__tests__/fakes.ts](../../vscode-plugin/src/hosts/__tests__/fakes.ts) | Test-only coverage: fakes.ts. Presence does not establish passing status. | 49 |
| [vscode-plugin/src/hosts/__tests__/writers.test.ts](../../vscode-plugin/src/hosts/__tests__/writers.test.ts) | Test-only coverage: writers. Presence does not establish passing status. | 314 |
| [vscode-plugin/src/panels/__tests__/daemon-gateway.test.ts](../../vscode-plugin/src/panels/__tests__/daemon-gateway.test.ts) | Test-only coverage: daemon-gateway. Presence does not establish passing status. | 189 |
| [vscode-plugin/src/panels/__tests__/orphan-kill.test.ts](../../vscode-plugin/src/panels/__tests__/orphan-kill.test.ts) | Test-only coverage: orphan-kill. Presence does not establish passing status. | 125 |

### Test fixtures and historical qualification helpers (23)

| File | Responsibility | Lines |
|---|---|---:|
| [jetbrains-plugin/test-bridge/run-focused-junit.ts](../../jetbrains-plugin/test-bridge/run-focused-junit.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 32 |
| [scripts/__tests__/fixtures/exempt/cli/services/maintenance.ts](../../scripts/__tests__/fixtures/exempt/cli/services/maintenance.ts) | Static source-scan exemption fixture; not a production implementation. | 2 |
| [scripts/__tests__/fixtures/exempt/daemon/installed-commit.ts](../../scripts/__tests__/fixtures/exempt/daemon/installed-commit.ts) | Static source-scan exemption fixture; not a production implementation. | 2 |
| [scripts/__tests__/fixtures/linux-daemon-release.ts](../../scripts/__tests__/fixtures/linux-daemon-release.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 47 |
| [scripts/__tests__/helpers/historical-daemon-qualification.mjs](../../scripts/__tests__/helpers/historical-daemon-qualification.mjs) **[M]** | Test-only fixture, harness or isolated process helper; not a production fallback. | 102 |
| [scripts/__tests__/helpers/historical-linux-live.mjs](../../scripts/__tests__/helpers/historical-linux-live.mjs) **[??]** | UNTRACKED unfinished historical Linux live qualification prototype; not a completed qualification gate. | 293 |
| [scripts/__tests__/helpers/historical-mac-live.mjs](../../scripts/__tests__/helpers/historical-mac-live.mjs) **[M]** | Test-only fixture, harness or isolated process helper; not a production fallback. | 291 |
| [scripts/__tests__/helpers/owned-source-fixture.ts](../../scripts/__tests__/helpers/owned-source-fixture.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 62 |
| [scripts/__tests__/helpers/source-entrypoint-authority.ts](../../scripts/__tests__/helpers/source-entrypoint-authority.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 91 |
| [scripts/__tests__/helpers/source-entrypoint-matrix.ts](../../scripts/__tests__/helpers/source-entrypoint-matrix.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 185 |
| [src/daemon/__tests__/fixtures/legacy-run-guard-crash.ts](../../src/daemon/__tests__/fixtures/legacy-run-guard-crash.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 34 |
| [src/daemon/__tests__/fixtures/linux-installed-lifecycle.sh](../../src/daemon/__tests__/fixtures/linux-installed-lifecycle.sh) | Test-only fixture, harness or isolated process helper; not a production fallback. | 85 |
| [src/daemon/__tests__/fixtures/managed-update-ipc-detached.ts](../../src/daemon/__tests__/fixtures/managed-update-ipc-detached.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 74 |
| [src/daemon/__tests__/fixtures/managed-update-launch-child.ts](../../src/daemon/__tests__/fixtures/managed-update-launch-child.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 33 |
| [src/daemon/__tests__/fixtures/run-file-exit-child.ts](../../src/daemon/__tests__/fixtures/run-file-exit-child.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 26 |
| [src/daemon/__tests__/fixtures/run-file-owner-child.ts](../../src/daemon/__tests__/fixtures/run-file-owner-child.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 11 |
| [src/daemon/__tests__/helpers-update-fixture.ts](../../src/daemon/__tests__/helpers-update-fixture.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 53 |
| [src/daemon/__tests__/helpers/source-linux.ts](../../src/daemon/__tests__/helpers/source-linux.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 43 |
| [src/daemon/__tests__/helpers/source-transaction-fixture.ts](../../src/daemon/__tests__/helpers/source-transaction-fixture.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 219 |
| [src/mcp/__tests__/fixtures/close-inherited-stores.mjs](../../src/mcp/__tests__/fixtures/close-inherited-stores.mjs) | Test-only fixture, harness or isolated process helper; not a production fallback. | 14 |
| [src/mcp/__tests__/helpers/mcp-e2e.ts](../../src/mcp/__tests__/helpers/mcp-e2e.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 156 |
| [src/shared/__tests__/fixtures/control-runtime.ts](../../src/shared/__tests__/fixtures/control-runtime.ts) | Test-only fixture, harness or isolated process helper; not a production fallback. | 17 |
| [src/shared/__tests__/fixtures/process-broker-fake-backend.c](../../src/shared/__tests__/fixtures/process-broker-fake-backend.c) | Test-only fixture, harness or isolated process helper; not a production fallback. | 18 |

### Primary documentation and evidence (32)

| File | Responsibility | Lines |
|---|---|---:|
| [AGENTS.md](../../AGENTS.md) | Repository runtime, lifecycle and workflow constraints. | 363 |
| [CLAUDE.md](../../CLAUDE.md) | Repository steering/agent constraints. | 363 |
| [docs/daemon.md](../daemon.md) | Daemon usage, lifecycle and runtime guide. | 2300 |
| [docs/installation.md](../installation.md) | Installation/upgrade user guide. | 232 |
| [docs/plans/daemon-update-source.md](daemon-update-source.md) | Configured daemon update source plan/history. | 11 |
| [docs/plans/node-runtime-evidence/README.md](node-runtime-evidence/README.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 54 |
| [docs/plans/node-runtime-evidence/SHASUMS256.txt](node-runtime-evidence/SHASUMS256.txt) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 41 |
| [docs/plans/node-runtime-evidence/SHASUMS256.txt.sig](node-runtime-evidence/SHASUMS256.txt.sig) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 19 |
| [docs/plans/node-runtime-evidence/bootstrap-smoke.md](node-runtime-evidence/bootstrap-smoke.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 59 |
| [docs/plans/node-runtime-evidence/client-packaging.md](node-runtime-evidence/client-packaging.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 52 |
| [docs/plans/node-runtime-evidence/historical-macos-upgrade.md](node-runtime-evidence/historical-macos-upgrade.md) **[M]** | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 41 |
| [docs/plans/node-runtime-evidence/ide-consumers.md](node-runtime-evidence/ide-consumers.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 56 |
| [docs/plans/node-runtime-evidence/linux-arm64-review.md](node-runtime-evidence/linux-arm64-review.md) **[??]** | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 32 |
| [docs/plans/node-runtime-evidence/migration.md](node-runtime-evidence/migration.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 68 |
| [docs/plans/node-runtime-evidence/qualification-darwin-arm64.md](node-runtime-evidence/qualification-darwin-arm64.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 105 |
| [docs/plans/node-runtime-evidence/qualification-linux-orbstack.md](node-runtime-evidence/qualification-linux-orbstack.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 178 |
| [docs/plans/node-runtime-evidence/release-key.asc](node-runtime-evidence/release-key.asc) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 52 |
| [docs/plans/node-runtime-evidence/shell-execution.md](node-runtime-evidence/shell-execution.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 78 |
| [docs/plans/node-runtime-evidence/source-consumers.md](node-runtime-evidence/source-consumers.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 93 |
| [docs/plans/node-runtime-evidence/source-entrypoints.md](node-runtime-evidence/source-entrypoints.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 91 |
| [docs/plans/node-runtime-evidence/source-fault-gates.md](node-runtime-evidence/source-fault-gates.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 53 |
| [docs/plans/node-runtime-evidence/source-installation-state.md](node-runtime-evidence/source-installation-state.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 90 |
| [docs/plans/node-runtime-evidence/source-predecessor-recovery.md](node-runtime-evidence/source-predecessor-recovery.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 25 |
| [docs/plans/node-runtime-evidence/source-update-transaction.md](node-runtime-evidence/source-update-transaction.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 31 |
| [docs/plans/node-runtime-evidence/source-upgrade-bootstrap.md](node-runtime-evidence/source-upgrade-bootstrap.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 67 |
| [docs/plans/node-runtime-evidence/verification.txt](node-runtime-evidence/verification.txt) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 12 |
| [docs/release-notes-daemon-0.1.0.md](../release-notes-daemon-0.1.0.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 90 |
| [docs/release-notes-daemon-0.1.1.md](../release-notes-daemon-0.1.1.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 65 |
| [docs/release-notes-daemon-0.2.0.md](../release-notes-daemon-0.2.0.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 70 |
| [docs/release-notes-daemon-0.2.1.md](../release-notes-daemon-0.2.1.md) | Historical qualification/evidence or release note; describes recorded scope, not proof that current working tree passes. | 67 |
| [docs/testing.md](../testing.md) | Test coordinator, process ownership, bounds and recovery guide. | 123 |
| [src/native/process-broker/README.md](../../src/native/process-broker/README.md) | Native broker protocol/build documentation. | 58 |

### Adjacent contracts and lifecycle callers (6)

| File | Responsibility | Lines |
|---|---|---:|
| [src/cli/panes/ModelCheckScreen.tsx](../../src/cli/panes/ModelCheckScreen.tsx) | Adjacent model setup screen with daemon restart integration. | 287 |
| [src/cli/panes/ModelTiersPane.tsx](../../src/cli/panes/ModelTiersPane.tsx) | Adjacent model configuration screen with daemon restart integration. | 323 |
| [src/daemon/repo-call-audit.ts](../../src/daemon/repo-call-audit.ts) | Adjacent daemon API caller policy/audit references to lifecycle methods. | 343 |
| [src/daemon/steering-inject.ts](../../src/daemon/steering-inject.ts) | Adjacent agent steering registration/injection consumed by maintenance reconciliation. | 393 |
| [src/shared/types.ts](../../src/shared/types.ts) | Shared daemon/admin request types and lifecycle contracts. | 1356 |
| [src/workflow/artifact-write-inventory.ts](../../src/workflow/artifact-write-inventory.ts) | Workflow write-scope inventory referencing lifecycle code; metadata rather than an execution engine. | 425 |

## Historical tracked work

The following directories contain relevant issues/designs/plans and build records. They are referenced as historical containers rather than duplicating every generated task/evidence artifact in the file inventory.

- [docs/standalone/daemon-stop-must-wait-process-end-E20261013fd8d70c3](../standalone/daemon-stop-must-wait-process-end-E20261013fd8d70c3)/
- [docs/standalone/daemon-update-never-retries-failed-npm-E20261102ca9883ca](../standalone/daemon-update-never-retries-failed-npm-E20261102ca9883ca)/
- [docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6](../standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6)/
- [docs/standalone/fix-daemon-update-path-so-insrc-E202609255f34b37c](../standalone/fix-daemon-update-path-so-insrc-E202609255f34b37c)/
- [docs/standalone/install-signed-v2-daemon-development-bundles-E20261114234b9967](../standalone/install-signed-v2-daemon-development-bundles-E20261114234b9967)/
- [docs/standalone/restore-reliable-daemon-restart-macos-E202611103992d2e1](../standalone/restore-reliable-daemon-restart-macos-E202611103992d2e1)/
- [docs/standalone/restore-upgrades-from-existing-daemon-installations-E20261121a03e99e1](../standalone/restore-upgrades-from-existing-daemon-installations-E20261121a03e99e1)/
- [docs/standalone/use-daemon-owned-node-runtime-predictable-E20261120175ab0d1](../standalone/use-daemon-owned-node-runtime-predictable-E20261120175ab0d1)/

## Snapshot status and limits

- Pre-existing pending changes were preserved. The JSON snapshot lists them; affected inventoried files are marked in the tables. In particular, `historical-linux-live.mjs` is an untracked unfinished prototype, and `linux-arm64-review.md` records incomplete Linux work. They are not successful qualification results.
- Inventory evidence combines repository file/text/import scans with bounded analyzer module profiles/import graphs. The indexed graph predates some current additions and reported incomplete relationships; current source scans supplement it. Lexical imports and names in JSON are navigational aids, not proof of all runtime callers.
- Scope includes directly relevant lifecycle sources, their tests/helpers, primary docs and adjacent shutdown resource boundaries. It excludes third-party dependency internals, compiled output trees, full DB/indexer internals, and a recursive listing of historical generated workflow/evidence records.
- No tests were run for this catalog. Test entries identify coverage locations only. No pending implementation was completed, committed, merged or pushed.
