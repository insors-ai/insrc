# Install/upgrade deletion assessment

**Superseded criterion:** the user subsequently defined all files exclusively implementing daemon install/upgrade/start/stop/restart, and their dedicated tests, as deletion candidates regardless of active use. Use the [current scope-based candidate list](install-upgrade-scope-candidates.md). This document retains the earlier dead-code assessment and evidence.

Snapshot: 2026-11-22, branch `installer`, HEAD `69b8145359d4f201d9e80da1baa4e9fed9067271`. Input: the [446-file catalog](install-upgrade-daemon-lifecycle-catalog.md). **Assessment only; nothing has been deleted or refactored.**

The strongest whole-file deletion candidate is **`src/bin/insrc-legacy-rollback-preload.ts` (66 lines)**: it has no discovered importer or invocation. Four additional files can be removed through small coordinated cleanups. Two other files contain apparently unused functions alongside live functions and must remain until those functions are separated. The rest have no established deletion case in this assessment; that is not a claim that every line is necessary.

“Candidate” means supported by current static evidence, not certified against every external installation. No deletion build or regression test was run. Existing installed release trees and rollback files on disk are outside the deletion scope.

## Whole-file candidate

| File | Evidence | Qualification |
|---|---|---|
| [src/bin/insrc-legacy-rollback-preload.ts](../../src/bin/insrc-legacy-rollback-preload.ts) | Analyzer: **0 incoming / 4 outgoing** import edges. Current repository scan found no import, `--import` argument, path construction, shell/CI invocation, package binary registration or packaged asset reference selecting this executable. Its `INSRC_LEGACY_ROLLBACK_CONTEXT` producer is inside `guardedLegacyShellJob`, whose only discovered caller is a unit test. | Strong candidate for removal from future builds. This is an orphan execution branch, rather than the live legacy recovery engine. Do not delete its four imported modules merely because this executable is removed. Analyzer graph coverage is incomplete; runtime or external launch recipes were not exhaustively observed. |

The current `legacy-admin-guard.test.ts` constructs its own temporary preload; it does **not** execute this production preload. Thus that test's existence does not establish reachability of the executable.

## Coordinated file removals

These are **not safe as isolated `rm` operations**. They have explicit callers or tests that must change in the same approved cleanup.

| File | Required companion edits | Why this can simplify the implementation |
|---|---|---|
| [src/daemon/legacy-admin-guard.ts](../../src/daemon/legacy-admin-guard.ts) | Remove the orphan preload above and retire its unit-test branch below. The only discovered production importer is the orphan preload. | Its import interception hook belongs exclusively to the unselected guarded rollback branch. |
| [src/daemon/__tests__/legacy-admin-guard.test.ts](../../src/daemon/__tests__/legacy-admin-guard.test.ts) | Retire `installLegacyAdminGuard` and `guardedLegacyShellJob` together. Keep the other functions in `legacy-launch-job.ts` and their live coverage. | The two tests cover the unselected guarded descriptor constructor and import hook. Removing tests alone would only discard coverage. |
| [src/cli/services/owned-runtime.ts](../../src/cli/services/owned-runtime.ts) | Redirect `daemon.ts`, `maintenance.ts`, and `services/__tests__/owned-runtime.test.ts` to `src/shared/owned-node-runtime.ts`. | This two-line file is only a re-export. The shared runtime implementation and its tests remain. Analyzer records both production callers and the test caller. |
| [src/daemon/__tests__/update-handlers.test.ts](../../src/daemon/__tests__/update-handlers.test.ts) | Retire `makeUpdateHandlers` from `update-runner.ts`; retain tests for current public dispatch, managed/source updates and outcome reading. | Tests exercise an old handler factory with no discovered production caller. Current daemon dispatch uses different handlers. |

## Partial dead-code candidates: keep the files

| File | Candidate functions/branch | Live functionality that prevents whole-file deletion |
|---|---|---|
| [src/daemon/update-runner.ts](../../src/daemon/update-runner.ts) | `launchUpdate`, `runDetachedUpdate`, `writeUpdateOutcome`, `makeUpdateHandlers`, their exclusively supporting code and self-invocation branch have no discovered external production callers. Review as one legacy updater cleanup. | **`readUpdateOutcome` is imported by `managed-update-ipc.ts` and used for unselected/unmanaged installations.** Keep that read behavior and its outcome compatibility. `source-consumers-native.test.ts` and `daemon-status-field.test.ts` also reference this module beyond its two named unit suites. Move the reader or retain a smaller module before considering deletion. |
| [src/daemon/legacy-launch-job.ts](../../src/daemon/legacy-launch-job.ts) | `guardedLegacyShellJob`: analyzer found one inferred caller, in `legacy-admin-guard.test.ts`; current source scan corroborates test-only use. | The file contains launch-job pinning/identity/recovery operations used by live migration/recovery. Remove only the orphan constructor and exclusive support after checking the remaining functions. |

Changes to these files also require inspecting source inventories: `src/assets/connection-management-inventory.json`, `src/daemon/db/__tests__/fixtures/session-source-inventory.json`, and `src/workflow/artifact-write-inventory.ts`. The session inventory test checks exact file classifications and source digests. Update inventories after reviewing actual changed boundaries; do not bypass the checks or blindly refresh digests.

## Explicitly rejected deletion shortcuts

| Tempting target | Why keep it now |
|---|---|
| `src/daemon/legacy-daemon-cutover.ts` and other `legacy-*` files as a group | Analyzer finds `managed-update-recovery.ts` importing the cutover coordinator. Legacy naming does not make the migration/recovery path unused. Only the orphan guarded preload branch above has a deletion case. |
| `src/shared/managed-daemon-installation.ts` | Analyzer reports **27 incoming edges**, including CLI, VS Code, control executables, migration, staging and recovery. |
| `src/shared/source-routing.ts` | Analyzer reports **5 incoming edges**, including CLI maintenance/start, source update launch and public update outcome integration. |
| `src/daemon/managed-update-preparation.ts` | Both `insrc-daemon-control.ts` and `insrc-daemon-update.ts` import it. |
| `scripts/daemon-ctl.sh`, CLI maintenance, IDE lifecycle controllers | These still provide selected lifecycle routing and client contracts. Replacing their orchestration requires a migration/design decision, not orphan deletion. |
| `scripts/package-daemon-bootstrap.mjs` | Analyzer has zero importers, but this is a command-line packager. `sync-node-runtime-policy.mjs` also checks it, and it includes bundle verification/staging/install tools in a distribution. Import count alone is insufficient. |
| Signed development / Linux candidate packaging, signing and install scripts | Standalone administrative commands can have no imports. Linux candidate CI invokes its dispatch and packaging scripts; candidate fetching/signing/qualification have additional script relationships. Retiring these release channels is a separate scope decision. |
| `scripts/verify-daemon-bootstrap.sh` | A standalone verification command with test coverage in `daemon-bundle-metadata.test.ts`; no evidence the interface has been retired. |
| VS Code installer/policy copies | `daemon/paths.ts` resolves the installer asset; `package.json` invokes `sync-client-runtime-assets.mjs`. Copies are generated/package inputs, not duplicate independent implementations to remove blindly. |
| JetBrains checked policy and generated installer | Policy sync/build resource generation maintains these inputs; packaged lifecycle consumers need them. |
| `NativeChildEnvironment.kt` | Filename scan suggests no callers, but Kotlin top-level **`nativeChildEnvironment`** is called by both `ScriptDaemonProvisioner.kt` and `DaemonLifecycleCommandRunner.kt`. |
| `services/type-contracts/maintenance-result.ts` | A deliberately compiled type-contract fixture. It needs no runtime importer to enforce a build-time contract. |
| Tests/fixtures wholesale | Lack of production importers is normal. Keep coverage for retained behavior; retire only tests specific to removed implementation in the same change. |
| Qualification evidence, prior designs and pending historical helpers | Historical records and unfinished work are not obsolete runtime engines. Preserve them during implementation cleanup. |
| Worker supervisor, DB, indexing, IPC and shared process/lock helpers | These are adjacent or shared infrastructure. Installation mentions do not establish exclusive lifecycle ownership. |

## Validation evidence and limitations

Used **`insrc_analyze_step`**, with two completed sessions and **10 deterministic probes**:

1. Import graphs for `update-runner.ts`, CLI `owned-runtime.ts`, `managed-daemon-installation.ts`, `legacy-daemon-cutover.ts`, `source-routing.ts`, and `managed-update-preparation.ts`.
2. Import graphs for the orphan preload, bootstrap packager, and CLI runtime wrapper; `usage.example` for `guardedLegacyShellJob`.

The [saved analyzer evidence](install-upgrade-deletion-analysis-evidence.json) contains probe outputs, synthesized results and completeness reports. The index timestamp is **2026-11-22 09:28:55 UTC**. All probes report incomplete graph coverage: **8 relationships point to ignored files**. Zero graph callers alone was therefore never treated as proof of safe deletion. The analyzer only validated the selected candidates/hubs, not all 446 files individually.

Current repository scans supplemented the graph with filenames, relative imports, symbol names, executable paths, shell dispatch, package scripts, workflows, client resource generation, and compile-time/source-inventory consumers. A lexical scan is a discovery aid: it can miss computed paths and symbol resolution, and can count comments or history as references. Historical `.insrc` records and inventory strings were separated from executable callers when judging candidates.

The [file disposition list](install-upgrade-deletion-dispositions.json) accounts for every catalog entry. Default retention means “no demonstrated deletion case”; the list does not invent individual reachability proofs for files outside the focused analysis.

The branch is based on local `v2`, eight commits behind the cached `origin/v2`. The inspected diff contains workflow artifact/document changes only, with no install/lifecycle source changes. No fetch, merge or push was performed for this assessment.

No code was changed, no file deleted, no build/test run, and no daemon action performed. Any subsequent implementation cleanup still follows the repository's tracked workflow and approval requirements.
