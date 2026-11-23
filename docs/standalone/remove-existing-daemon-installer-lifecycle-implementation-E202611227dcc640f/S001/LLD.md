<!-- insrc:artifact LLD-7dcc640fef47d9e6-s1 -->

# LLD: STORY-7dcc640fef47d9e6-s1 — Remove the existing daemon installer and lifecycle implementation

## Summary

**Epic:** `remove-existing-daemon-installer-lifecycle-implementation`
**HLD base run:** `wf-1795374098665-sasfw7`
**HLD effective hash:** `7dcc640fef47...`

Remove the existing daemon installer, upgrade, supervisor and start/stop implementation so a replacement can be designed from a clean baseline. Delete the 278 dedicated files and the 176 identified member/test slices, and remove their client, build and release wiring. Preserve shared application behavior and retained test assertions; this change does not install a replacement engine or operate the running daemon.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** public

## 3. Data model changes

### 3.1 `Existing daemon installation and process-control surface` — field-remove

Remove the whole-file and member contracts enumerated in the two committed manifests, including lifecycle-only result/types/fields, update acknowledgement hooks, PID/selection/controller ownership, CLI and IDE controls, native helpers and release authority. Exact accounting is 278 whole files (143 implementation/build/asset/CI,115 tests,20 helpers) and176 member/test entries in70 other files. No new public API or persistent schema is introduced. Removed IPC methods use existing generic unsupported/method-not-found handling; lifecycle controls disappear from CLI/IDE surfaces. Do not retain compatibility facades or silently route to old files.

**Call sites:**
- `docs/plans/install-upgrade-scope-candidates.json`
- `docs/plans/install-upgrade-member-candidates.json`
- `src/shared/managed-daemon-installation.ts`
- `src/cli/services/daemon.ts`
- `src/daemon/handler-runtime.ts`
- `src/shared/ipc-client.ts`
- `vscode-plugin/src/daemon/paths.ts`

### 3.2 `Retained application, transport and shared guard ownership` — invariant-change

After removal, CLI/IDE consumers continue to use generic IPC one-to-one request channels for remaining methods; no control-engine dependency remains. Shared process identity and keystore guard acquisition/conflict/reclamation remain owned by shared code, with multiple consumers preserved. Resource-close callbacks stay application-owned: store/worker/queue/socket flush and cleanup must remain coherent without the old supervisor/watchdog/transaction authority. Preserve model/configuration bootstrap, workflow artifact approvals, backups/compaction/status, host/MCP registration and generic launch contracts. Remove only lifecycle execution slices from mixed routines. Existing installed user state has no ownership transfer and no migration; it is untouched.

**Call sites:**
- `src/shared/daemon-process.ts`
- `src/shared/daemon-run-files.ts`
- `src/shared/keystore.ts`
- `src/shared/ipc-client.ts`
- `src/cli/services/daemon.ts`
- `src/daemon/handler-runtime.ts`
- `docs/plans/install-upgrade-candidate-revalidation.json`

## 4. Error paths

**Error cases**

- **A candidate file or member source no longer matches the committed snapshot.** (recoverable)
  - Detection: Manifest path/hash and member-selector checks fail before editing, or a current caller scan finds a new preservation obligation.
  - Response: Stop the affected deletion batch, reconcile that record with current source, and report the concrete change. Never blindly delete by stale line ranges.
  - User impact: Cleanup pauses for correction; unrelated source and installed user state stay intact.
- **Removal leaves an unresolved import, registered command, resource asset or test selector.** (recoverable)
  - Detection: Current-source reference scan, TypeScript/client build, packaging input check or focused retained test fails.
  - Response: Remove the exclusively lifecycle registration or rewire the retained contract at its existing boundary, then rerun the affected check. Do not restore the retired engine or disable broad checks to make the build pass.
  - User impact: Branch is incomplete until the integration check passes.
- **A shared guard, model/configuration, workflow or resource-close invariant is accidentally removed.** (recoverable)
  - Detection: Retained boundary tests or compiler use-sites fail; manifest accounting shows a mixed-test/function range was removed wholesale.
  - Response: Restore the preserved behavior from baseline, narrow the lifecycle slice and revalidate that boundary.
  - User impact: Prevents collateral loss of application functionality.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A previously installed client sends a removed lifecycle IPC method. | Existing generic method-not-found handling; no update, stop, fallback shell invocation or ambient runtime probing. |
| An existing external daemon or retained user installation remains running during source cleanup. | No process, launch job, socket, installed tree, journal, trust record or store outside the workspace is altered. |
| A mixed model/configuration flow previously executed a daemon restart. | Remove that execution and old restart-control UI; preserve saved model/configuration decisions, no-duplicate-approval behavior and truthful apply-later information. |
| Resource-close expectations reside in a test that also asserts old watchdog/ownership mechanics. | Replace only the old lifecycle assertions; preserve the actual resource drain/close contract. |

**Invariants to preserve**

- Generic IPC transport remains available to the broad application/IDE/configuration/approval consumers; only lifecycle-specific methods/hooks are removed. [[c1]]
- Shared process identity and keystore guard acquisition, conflict and reclamation survive removal of lifecycle-only guard transfer/borrowing. [[c2]]
- Removal accounting follows the exact committed file/member scope; retained behavior in mixed sources and tests is preserved and no installed state is mutated. [[c2]]

## 5. Test strategy

**Test framework:** `Use the repository's existing Node test coordinator and TypeScript test conventions, VS Code test/bundle scripts and JetBrains focused JUnit/Gradle bridge. Preserve test-harness process ownership and bounds. Tests are run only after all relevant code tasks have been built, with one story build approval after final validation rather than per task.`

**Test levels**

- **contract** — Prove complete removal accounting and clean retained-source boundaries.
  - Subjects: `All 278 whole-file candidates absent from tracked source; all 176 member/test entries accounted for as removed declaration or narrowed slice.`, `No executable imports, commands, packaging inputs, lifecycle CI or test selectors point at removed targets.`, `Retained files and tests preserve the explicit non-lifecycle responsibilities from both manifests.`
  - Fixtures: `Committed candidate manifests and baseline 728c31abc`, `Current source reference and TypeScript AST scans`
- **unit** — Run existing retained tests for behavior that deletion must preserve, rather than adding tests that mirror removed code.
  - Subjects: `Shared process identity and shared run-file/keystore guard behavior.`, `Configuration/catalog/model validation and generic IPC framing, timeout, uncertainty and persistent lanes.`, `Retained workflow artifact lifecycle and model approval/tier save assertions.`
- **integration** — Validate retained client and application integration after lifecycle controls and adapters are removed.
  - Subjects: `VS Code activation/reachability, onboarding registration/host wiring, settings/model flows, backup/compact/status and debug MCP/log surfaces.`, `JetBrains remaining gateway/settings/model/onboarding code and focused JUnit suites where toolchain is available.`, `Application-owned worker/queue/store/socket draining assertions retained from mixed suites.`
- **smoke** — Ensure the workspace can compile and package retained application code without retired lifecycle assets.
  - Subjects: `One normal backend build plus required backend/tool typechecks.`, `VS Code typecheck/bundle and resource checks.`, `JetBrains compile/focused tests when available; explicitly record any unavailable check.`, `No test invokes real installer/update/start/stop on the user's installation; no multi-platform native qualification matrix.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Manifest removal and member accounting report; current-source dangling reference audit.` |
| `ac2` | `Retained shared process/keystore guard, model/configuration and generic IPC tests.` |
| `ac3` | `Backend build/typecheck and client compilation/packaging checks with lifecycle dependencies removed.` |
| `ac4` | `Focused retained CLI/IDE onboarding/settings/model/status/backup/compact and resource-close tests.` |
| `ac5` | `Workspace-only edit inventory and executed-command evidence confirming no installed-state/process mutation; no replacement engine introduced.` |

## 6. Migration

**State before:** As grounded in s1 c1/c2, the branch contains the existing macOS managed/legacy, Linux source, owned-runtime, release and client lifecycle paths; generic IPC and shared guard dependencies must survive. Both deletion manifests and evidence are committed at728c31abc; source hashes match and the working tree was clean before this tracked design.

**State after:** The old engine and its dedicated tests are absent from workspace source. Mixed-file lifecycle contracts/controls/hooks are removed with preserved generic transport, configuration/model/workflow/data behavior and application resource cleanup. Source installation/update/start/stop controls are intentionally unavailable pending a separately designed replacement. Existing installed user trees, daemon processes and stores are unchanged.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Freeze the committed manifests and verify source hashes/selectors; prepare batch accounting and retained boundary checks. — ↩ rollbackable
2. Remove dedicated lifecycle sources, native/runtime/release assets and their dedicated tests/helpers; adjust surviving build/package/CI references. — ↩ rollbackable
3. Remove backend and CLI lifecycle member slices, retaining generic IPC/keystore guards/model bootstrap/resource-close callback bodies and other service behavior. — ↩ rollbackable
4. Remove VS Code and JetBrains lifecycle control/freshness/auto-start/installer wiring and corresponding mixed-test slices; retain status/backup/compact, model/settings and host/MCP registration behavior. — ↩ rollbackable
5. Reconcile source inventories and documentation of the temporary branch state; run one build and focused retained validation, account for all files/members and report remaining limitations. — ↩ rollbackable

**Backward compat:** Deliberate development-branch removal of old lifecycle commands and IPC contracts. No compatibility facade, hidden fallback or automatic install/upgrade migration is retained. Existing generic method-not-found behavior handles callers of removed methods; no advertised control may report success without implementation. Other application/IDE IPC contracts remain aligned. No release is published by this change.

## 7. Alternatives considered

### 7.1 a1: Manifest-driven deletion with retained application cleanup in place — **CHOSEN**

Delete both identified sets, remove old control APIs/UI, and retain only existing application startup/resource-close behavior in the surviving modules.

The two committed manifests own deletion accounting. Remove dedicated files and identified lifecycle slices; strip client command/IPC/update contracts and build/release dependencies. Existing generic transports, model/configuration bootstrap, shared keystore guard primitives and application-owned resource-close callbacks remain in their current modules with direct integration. No replacement installer, supervisor, transaction journal or compatibility facade is introduced. Remove lifecycle controls from product surfaces and use existing generic method-not-found behavior for removed IPC names.

### 7.2 a2: Manifest-driven deletion with an application resource-close boundary

Delete the same old implementation but extract retained resource cleanup into a narrow application-owned close boundary.

Remove the exact whole-file and member scope, then separate queue/worker/store/socket draining from OS process supervision into a narrow internal resource-close contract. Clients and public lifecycle APIs are removed as in a1; the resource-close boundary has no installer, update, supervisor, rollback, PID/kill or release responsibilities. Preserve non-lifecycle behavior and validate the extracted close behavior in focused tests.

**Rejected because:** Also meets removal/preservation scope, but the new close boundary adds API/file churn and architectural decisions not needed to remove the existing engine. Use only if implementation demonstrates retained callbacks cannot remain coherent in place.

## 8. References

- **[[c1]]** `analyze-bundle` `docs/plans/install-upgrade-corpus-revalidation-evidence.json` — "Shared guard/process identity boundaries and current lifecycle callers remain; graph coverage incomplete."
- **[[c2]]** `doc` `docs/plans/install-upgrade-candidate-revalidation.md` — "Preserve generic process identity and keystore guard behavior; apply corrected whole-file and member scopes."
- **[[c3]]** `doc` `docs/plans/install-upgrade-scope-candidates.json` — "278 whole-file candidates:143 implementation/build/asset/CI files,115 tests,20 helpers."
- **[[c4]]** `doc` `docs/plans/install-upgrade-member-candidates.json` — "176 member/test entries across70 other files with explicit retained behavior and source hashes."
