<!-- insrc:artifact LLD-c5a4572e3949359a-s1 -->

# LLD: STORY-c5a4572e3949359a-s1 — Two always-working daemon update paths fix (ISSUE-c5a4572e3949359a).

## Summary

**Epic:** `daemon-update-always-fails-unmanaged-macos`
**HLD base run:** `wf-1794979399326-f0w86q`
**HLD effective hash:** `dac20d855e4a...`

Two always-working daemon update paths. A managed (signed-release) install keeps today's full signed, transactional migration-and-update machinery untouched. An unmanaged (plain git-clone) install's update always completes via the same plain git-fetch + npm-install + npm-build sequence daemon-ctl.sh already runs on non-Darwin and that start/stop/restart already use unmanaged on Darwin -- no signing key required. scripts/daemon-ctl.sh's cmd_update becomes the single place that decides managed vs unmanaged for every caller; vscode-plugin's controller.ts and jetbrains-plugin's ScriptDaemonProvisioner.kt/DaemonLifecycleService.kt drop their now-redundant pre-emptive detection and simply delegate to it unconditionally.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `DaemonLifecycleController.run`

```typescript
run(action: LifecycleAction, options?: LifecycleRunOptions): Promise<LifecycleResult>
```

**Parameters:**
- `action: LifecycleAction` — One of 'start'|'stop'|'restart'|'update'.
- `options: LifecycleRunOptions | undefined` _(optional)_ — Carries the plain-start flag; unused by update.

**Returns:** `Promise<LifecycleResult>` — The real post-action reachability, re-probed via the shared IPC client.

**Errors:**
- `LifecycleResult (ok:false)` when daemon-ctl.sh exits non-zero; mapped via ctlReason(code).

**Preconditions:**
- paths.ctlScript (or the managed install's own daemon-ctl.sh) exists.

**Postconditions:**
- For action='update': no longer special-cases an unmanaged-but-present install into install(true)/the bundled signed installer -- it always calls daemon-ctl.sh update, which itself now safely routes managed vs unmanaged.
- Behavior for start/stop/restart and for a genuinely managed install's update is unchanged.

### 2.2 `ScriptDaemonProvisioner.run`

```typescript
fun run(kind: ProvisionKind, node: NodeRuntime): ProvisionOutcome
```

**Parameters:**
- `kind: ProvisionKind` — INSTALL or UPDATE.
- `node: NodeRuntime` — The resolved Node runtime to put on PATH for the spawned script.

**Returns:** `ProvisionOutcome` — ok + exitCode, or ok=false + a mapped reason; never throws.

**Errors:**
- `ProvisionOutcome(ok=false)` when The resolved script is missing, the spawn fails, or the script exits non-zero.

**Preconditions:**
- locator.scriptFor(kind) resolves to an existing script.

**Postconditions:**
- For kind=UPDATE: no longer branches on locator.existingUpgradeTarget() into the bundled insrc-daemon-install.sh -- it always spawns bash <daemon-ctl.sh> update, which now safely routes managed vs unmanaged on its own.
- Behavior for kind=INSTALL is unchanged.

## 3. Data model changes

### 3.1 `scripts/daemon-ctl.sh cmd_update (Darwin + unmanaged branch)` — invariant-change

Currently: on Darwin, when supervised_lifecycle returns rc=10 (unmanaged), cmd_update re-execs insrc-daemon-install.sh --target "$DAEMON_ROOT" -y, which requires INSRC_RELEASE_BOOTSTRAP_B64 and always fails without it. New invariant: an unmanaged install's update on Darwin always falls through to the same plain sync_repo/npm_install_if_needed/npm_build sequence the non-Darwin branch already uses (no exec into insrc-daemon-install.sh, no signing requirement), matching cmd_start/cmd_stop/cmd_restart's existing unmanaged behavior exactly. A managed install (supervised_lifecycle returns 0) is unaffected.

**Call sites:**
- `scripts/daemon-ctl.sh:396-416`
- `scripts/daemon-ctl.sh:368-394`
- `scripts/daemon-ctl.sh:330-345`

### 3.2 `vscode-plugin's createDaemonLifecycleController.run('update') unmanaged pre-emption` — invariant-change

Currently: when paths.managedStateRoot is set, managed is undefined (no installation.json) and the daemon entry/ctl script already exists, run('update') calls install(true), spawning the extension's bundled assets/insrc-daemon-install.sh --target ... -y directly -- bypassing daemon-ctl.sh entirely and hitting the same unprovisioned signing gate. New invariant: this special-case is removed; run('update') always spawns bash <script> update (script = the managed daemon-ctl.sh when managed, else paths.ctlScript), delegating the managed/unmanaged decision entirely to the now-fixed daemon-ctl.sh.

**Call sites:**
- `vscode-plugin/src/daemon/controller.ts:102-118`
- `vscode-plugin/src/daemon/__tests__/controller.test.ts`

### 3.3 `jetbrains-plugin's ScriptDaemonProvisioner.run(UPDATE) legacy branch / DaemonScriptLocator.existingUpgradeTarget()` — field-remove

Currently: run(kind) computes `val legacy = if (kind == ProvisionKind.UPDATE) locator.existingUpgradeTarget() else null`; when non-null (macOS, no managed install, ctl/entry exists), UPDATE's command becomes `bash <script> -y --target <legacy>` instead of `bash <script> update` -- the same unprovisioned signing gate as the installer. New invariant: the legacy branch and existingUpgradeTarget() are removed; UPDATE always spawns `bash <daemon-ctl.sh> update` (via locator.scriptFor(UPDATE)), delegating the managed/unmanaged decision entirely to the now-fixed daemon-ctl.sh, exactly like VS Code.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/ScriptDaemonProvisioner.kt:30-33`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/ScriptDaemonProvisioner.kt:57-73`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleService.kt:231-233`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonProvisionerTest.kt`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonScriptLocatorTest.kt`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt`

## 4. Diagrams

- [Sequence diagram](docs/standalone/daemon-update-always-fails-unmanaged-macos-E20261118c5a4572e/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Managed install's update fails for a genuine reason (bad signature, missing key on a managed box, network failure fetching the signed tag).** (recoverable)
  - Detection: supervised_lifecycle returns a non-10 rc (managed path engaged) and the signed bridge's own checks (git fetch, signature verification, compatibility catalog) fail as they do today.
  - Response: Unchanged: the existing signed-bridge error handling (die with the documented exit codes) applies exactly as before -- this Story does not touch the managed branch.
  - User impact: Same as today; this Story introduces no regression here.
- **An unmanaged install's plain update fails (e.g. local uncommitted changes, diverged branch, npm/build failure).** (recoverable)
  - Detection: sync_repo / npm_install_if_needed / npm_build return non-zero, exactly as cmd_start/cmd_stop/cmd_restart's existing unmanaged fallback already detects for those verbs.
  - Response: cmd_update returns the existing documented exit codes (2 not-a-git-checkout, 3 uncommitted/diverged, 4 git/npm/build failure) -- no change to this mapping; it already exists for the non-Darwin branch and is reused for Darwin.
  - User impact: Reported via ctlReason(code) in VS Code and mapReason(UPDATE, exitCode) in JetBrains, both of which already map these exact codes.
- **A caller (VS Code or JetBrains) still holds code that checks for an unmanaged-but-present install and expects the OLD install(true)/legacy routing (a stale build, or a test not yet updated).** (recoverable)
  - Detection: The removed special-case's call sites and the fields they drove (install(true)'s existing param, existingUpgradeTarget()) no longer exist after the fix; any remaining caller of them is a compile error (TS/Kotlin), not a silent behavior drift.
  - Response: None needed at runtime -- this is caught at build/compile time in both languages, not a runtime failure mode.
  - User impact: None in production; this is a build-time safety net, not a user-facing case.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An unmanaged install on Darwin whose daemon entry exists but whose ctl script is missing (a partial/corrupted checkout). | Unchanged from today's cmd_start/cmd_stop/cmd_restart behavior for the same shape: the plain fallback still requires the ctl script's own directory structure (require_daemon_dir) and fails the same documented way update already would for a broken checkout -- no new behavior introduced by this Story. |
| A box transitions from unmanaged to managed (the official migration completes) between two update calls. | supervised_lifecycle re-evaluates on every call; once managed-lifecycle/installation.json exists, the NEXT update call engages the managed branch, exactly as it already does today for start/stop/restart. This Story does not change that transition logic. |
| VS Code or JetBrains is itself the managed install's controller (paths.managedStateRoot resolves to a real installation.json with enabled:true). | Unchanged: both plugins already delegate to the managed install's own daemon-ctl.sh for every verb including update in that case; this Story's removed special-case only ever fired for the UNMANAGED branch, never this one. |

**Invariants to preserve**

- A managed install (supervised_lifecycle returns 0 / installation.json with enabled:true) always uses the signed, transactional migration-and-update machinery, unchanged by this Story. [[c1]]
- cmd_start, cmd_stop and cmd_restart's existing unmanaged-on-Darwin fallback (no signing, plain prepare_daemon/stop_managed_daemon/start_prepared_daemon) is the behavioral precedent this Story extends to cmd_update -- it is not itself modified. [[c2]]
- The cross-client integration test 'Installer and updated CLI, VS Code and JetBrains route matrix' (src/daemon/__tests__/macos-upgrade-routing.test.ts) is the authoritative spec for how all three clients route an update; its MANAGED-path assertions must still hold after this Story -- only its UNMANAGED-path assertions change. [[c3]]

## 6. Test strategy

**Test framework:** `node:test (TypeScript + bash integration, vscode-plugin and src/daemon) + JUnit5/Kotlin (jetbrains-plugin)`

**Test levels**

- **integration** — Rewrite the authoritative cross-client route-matrix test so an unmanaged checkout bypasses the signed bridge entirely (no authorize/npm ci/npm run/prepare-legacy-upgrade trace events; a plain git fetch + npm install + npm build instead) across all four surfaces, while a genuinely managed checkout's assertions are left exactly as they are today.
  - Subjects: `src/daemon/__tests__/macos-upgrade-routing.test.ts: 'Installer and updated CLI, VS Code and JetBrains route matrix' (rewritten)`
  - Fixtures: `The existing fake unmanaged .git checkout + shimmed uname/git/node/npm fixture in the test, extended with a second fixture for a genuinely managed checkout (managed-lifecycle/installation.json) so both paths are asserted in the same test`
- **unit** — Verify vscode-plugin's createDaemonLifecycleController.run('update') always spawns 'bash <script> update' with no install(true)/bundled-installer branch for an unmanaged install, and is unchanged for a managed one.
  - Subjects: `vscode-plugin/src/daemon/__tests__/controller.test.ts: 'The VS Code update action selects the installer on legacy macOS and the selected controller after migration' (replaced with an assertion that update always spawns daemon-ctl.sh update, unmanaged or managed)`
- **unit** — Verify ScriptDaemonProvisioner.run(UPDATE) always spawns 'bash <daemon-ctl.sh> update' with the legacy/existingUpgradeTarget() branch removed.
  - Subjects: `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonProvisionerTest.kt (rewritten: legacy-target fixtures removed/replaced)`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonScriptLocatorTest.kt (rewritten: existingUpgradeTarget() assertions removed if the method is deleted, or updated to always-null if retained for interface compatibility)`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt (rewritten: the legacy branch it currently exercises via INSRC_ROUTE_MATRIX_* env vars is removed)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/daemon/__tests__/macos-upgrade-routing.test.ts: 'Installer and updated CLI, VS Code and JetBrains route matrix' (unmanaged-path assertions)`, `vscode-plugin/src/daemon/__tests__/controller.test.ts (rewritten update test)`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt (rewritten)` |
| `ac2` | `src/daemon/__tests__/macos-upgrade-routing.test.ts: 'Installer and updated CLI, VS Code and JetBrains route matrix' (managed-path assertions, unchanged)` |
| `ac3` | `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonProvisionerTest.kt (rewritten)`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonScriptLocatorTest.kt (rewritten)`, `vscode-plugin/src/daemon/__tests__/controller.test.ts (rewritten)` |

## 7. Migration

**State before:** scripts/daemon-ctl.sh's cmd_update (lines 396-416) re-execs scripts/insrc-daemon-install.sh --target "$DAEMON_ROOT" -y for an unmanaged install on Darwin, which always dies on an unprovisioned INSRC_RELEASE_BOOTSTRAP_B64. vscode-plugin's createDaemonLifecycleController.run('update') (controller.ts:107-108) and jetbrains-plugin's ScriptDaemonProvisioner.run(UPDATE) via DaemonLifecycleService.existingUpgradeTarget() (DaemonLifecycleService.kt:231-233) each independently pre-empt daemon-ctl.sh for this same unmanaged case and hit the identical dead end by calling their own bundled insrc-daemon-install.sh directly.

**State after:** cmd_update's Darwin+unmanaged branch falls through to the same plain sync_repo/npm_install_if_needed/npm_build sequence the non-Darwin branch already uses -- no signing key required, matching cmd_start/cmd_stop/cmd_restart's existing unmanaged behavior. vscode-plugin's run('update') and jetbrains-plugin's ScriptDaemonProvisioner.run(UPDATE) both drop their pre-emptive unmanaged detection (install(true); existingUpgradeTarget()/the legacy branch) and always delegate to daemon-ctl.sh update, which itself safely routes managed vs unmanaged. A managed install's behavior in all three clients is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. In scripts/daemon-ctl.sh's cmd_update, remove the Darwin-specific re-exec into insrc-daemon-install.sh for the unmanaged (supervised_lifecycle rc=10) case; let it fall through to the existing plain update sequence. — ↩ rollbackable
2. In vscode-plugin/src/daemon/controller.ts, remove run('update')'s install(true) pre-emption so it always spawns the resolved daemon-ctl.sh with 'update'. — ↩ rollbackable
3. In jetbrains-plugin, remove ScriptDaemonProvisioner.run's legacy/existingUpgradeTarget() branch for UPDATE and the now-unused existingUpgradeTarget() method/DaemonScriptLocator default, so UPDATE always resolves and spawns daemon-ctl.sh update. — ↩ rollbackable
4. Rewrite the five affected test files (the cross-client macos-upgrade-routing.test.ts, controller.test.ts, DaemonProvisionerTest.kt, DefaultDaemonScriptLocatorTest.kt, DaemonLifecycleCommandRunnerTest.kt) to assert the new unmanaged-path behavior while preserving every managed-path assertion unchanged. — ↩ rollbackable

**Backward compat:** No persisted data or on-disk format changes. The public-facing LifecycleAction/ProvisionKind API signatures are unchanged for both plugins -- only internal routing behavior for 'update' on an unmanaged install changes, and it changes from 'always fails' to 'succeeds like start/stop/restart already do', so no existing working caller is affected. A managed install's behavior across all three clients is byte-for-byte unchanged. Removing existingUpgradeTarget() from the JetBrains DaemonScriptLocator interface is a source-level removal of an internal, non-public method with a default implementation (returns null), confined to this plugin's own lifecycle package with no external consumers.

## 8. Alternatives considered

### 8.1 a1: Branch inside scripts/insrc-daemon-install.sh only

Put the managed-vs-unmanaged split inside the installer script itself, leaving daemon-ctl.sh and both plugins' call sites unchanged.

insrc-daemon-install.sh's existing-checkout Darwin branch (scripts/insrc-daemon-install.sh:208-238) is the single point every current caller (cmd_update's fallback, controller.ts's install(true), ScriptDaemonProvisioner.kt's legacy branch) ultimately re-execs into. Make THAT branch itself check for a managed install and skip the signed bridge for an unmanaged one, running the plain git-fetch+build sequence in place instead of dying on the missing key. No other file changes.

**Rejected because:** Fixes the bug but leaves two independently-drifted detection implementations (controller.ts, ScriptDaemonProvisioner.kt) in place as dead/misleading code rather than removing the duplication that let the same bug ship twice.

### 8.2 a2: Fix cmd_update directly; retire the now-redundant plugin special-cases — **CHOSEN**

Make daemon-ctl.sh's cmd_update match start/stop/restart's existing unmanaged fallback, then let both plugins simply call daemon-ctl.sh update unconditionally.

scripts/daemon-ctl.sh's cmd_update (lines 396-416) stops re-execing insrc-daemon-install.sh for the Darwin+unmanaged case and falls through to the same sync_repo/npm_install_if_needed/npm_build sequence the other three verbs and the non-Darwin branch already use (lines 368-394, 409-415) -- one script becomes the single source of truth for 'how does an unmanaged update behave', matching the existing precedent exactly. Once that is safe unconditionally, vscode-plugin/src/daemon/controller.ts's run('update') drops its install(true) pre-emption (lines 97-99) and always calls daemon-ctl.sh update; jetbrains-plugin's ScriptDaemonProvisioner.kt drops its legacy/existingUpgradeTarget() branch (lines 57-73) the same way. Each caller becomes a thin, unconditional delegate to the one script that now safely routes managed vs unmanaged on its own.

### 8.3 a3: Fix only daemon-ctl.sh; leave both plugins untouched

Patch cmd_update's fallback but leave controller.ts's install(true) and ScriptDaemonProvisioner.kt's existingUpgradeTarget() exactly as they are.

Apply only the daemon-ctl.sh change from a2 (stop the Darwin+unmanaged re-exec into the signed bridge) and stop there -- no changes to vscode-plugin or jetbrains-plugin.

**Rejected because:** Neither plugin ever reaches daemon-ctl.sh for the unmanaged case today -- they pre-empt it and call the bundled installer directly -- so this does not fix the reported bug via either IDE's Update action.

### 8.4 a4: Opt-in environment flag to skip the signed bridge

Keep today's forced signed-bridge-on-unmanaged-update behavior as the default; add an env var a user must set explicitly to get the plain git-update path instead.

Introduce e.g. INSRC_SKIP_SIGNED_BRIDGE=1, checked in cmd_update's Darwin+unmanaged branch, to opt into the plain fallback instead of the signed bridge. Default (unset) behavior is unchanged -- still dies on the missing key.

**Rejected because:** Default behavior is unchanged, so every normal user still hits the failure; still requires the same plugin-side changes as a2 to even reach the opt-in flag.

## 9. References

- **[[c1]]** `code` `scripts/daemon-ctl.sh:396-416` — "cmd_update's Darwin re-exec into insrc-daemon-install.sh for an unmanaged install, and its own plain fallback for the non-Darwin case"
- **[[c2]]** `code` `scripts/daemon-ctl.sh:368-394` — "cmd_start/cmd_stop/cmd_restart's existing unmanaged fallback precedent"
- **[[c3]]** `code` `scripts/daemon-ctl.sh:330-345` — "supervised_lifecycle() returns 10 on Darwin with no managed-lifecycle state"
- **[[c4]]** `code` `scripts/insrc-daemon-install.sh:208-238` — "the signed macOS upgrade bridge requiring INSRC_RELEASE_BOOTSTRAP_B64"
- **[[c5]]** `code` `vscode-plugin/src/daemon/controller.ts:97-120` — "run('update')'s install(true) pre-emption for an unmanaged-but-present install"
- **[[c6]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleService.kt:231-233` — "existingUpgradeTarget()'s condition, equivalent to controller.ts's"
- **[[c7]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/ScriptDaemonProvisioner.kt:57-73` — "run(kind)'s legacy branch for UPDATE"
- **[[c8]]** `code` `src/daemon/__tests__/macos-upgrade-routing.test.ts` — "the cross-client 'Installer and updated CLI, VS Code and JetBrains route matrix' integration test"
- **[[c9]]** `prior-artifact` `ISSUE-c5a4572e3949359a` — "the approved, corrected cross-plugin root cause and fix intent"
