<!-- insrc:artifact PLAN-c5a4572e3949359a-s1 -->

# Plan: STORY-c5a4572e3949359a-s1

## Summary

**Epic:** `daemon-update-always-fails-unmanaged-macos`
**LLD run:** `wf-1794979399326-f0w86q`
**LLD effective hash:** `dac20d855e4a...`

Building this Story is a small, coordinated fix across three codebases: one bash function (scripts/daemon-ctl.sh's cmd_update) stops forcing an unmanaged install through a signing gate it can never pass, matching the plain fallback its sibling verbs already use; then both IDE plugins (VS Code's controller.ts, JetBrains's ScriptDaemonProvisioner.kt) drop their own now-redundant pre-emptive detection of the same case, since the shared script now safely routes either way on its own. Five existing tests are rewritten to match, including the authoritative cross-client integration test that currently codifies the broken behavior as correct.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Fix scripts/daemon-ctl.sh's cmd_update: drop the Darwin+unmanaged re-exec into the signed installer bridge | S | — | — | integration: src/daemon/__tests__/macos-upgrade-routing.test.ts: 'Installer and updated CLI, VS Code and JetBrains route matrix' (rewritten) | [[c1]] |
| 2 | **`t2`** Simplify vscode-plugin's createDaemonLifecycleController.run('update'): drop the install(true) pre-emption | S | — | `t1` | unit: vscode-plugin/src/daemon/__tests__/controller.test.ts: 'The VS Code update action selects the installer on legacy macOS and the selected controller after migration' (replaced with an assertion that update always spawns daemon-ctl.sh update, unmanaged or managed) | [[c2]] |
| 3 | **`t3`** Simplify jetbrains-plugin's ScriptDaemonProvisioner.run(UPDATE): remove the legacy/existingUpgradeTarget() branch | S | — | `t1` | unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt (rewritten: the legacy branch it currently exercises via INSRC_ROUTE_MATRIX_* env vars is removed) | [[c3]] |
| 4 | **`t4`** Rewrite vscode-plugin's controller.test.ts to assert the corrected update routing | S | — | `t2` | unit: vscode-plugin/src/daemon/__tests__/controller.test.ts: 'The VS Code update action selects the installer on legacy macOS and the selected controller after migration' (replaced with an assertion that update always spawns daemon-ctl.sh update, unmanaged or managed) | [[c2]] [[c4]] |
| 5 | **`t5`** Rewrite jetbrains-plugin's three affected test files to assert the corrected update routing | M | — | `t3` | unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonProvisionerTest.kt (rewritten: legacy-target fixtures removed/replaced); unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonScriptLocatorTest.kt (rewritten: existingUpgradeTarget() assertions removed if the method is deleted, or updated to always-null if retained for interface compatibility); unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt (rewritten: the legacy branch it currently exercises via INSRC_ROUTE_MATRIX_* env vars is removed) | [[c3]] [[c4]] |
| 6 | **`t6`** Rewrite the cross-client integration test 'Installer and updated CLI, VS Code and JetBrains route matrix' | L | — | `t1`, `t2`, `t3` | integration: src/daemon/__tests__/macos-upgrade-routing.test.ts: 'Installer and updated CLI, VS Code and JetBrains route matrix' (rewritten) | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |

### 1.1 TASK-c5a4572e3949359a-s1-t1 — Fix scripts/daemon-ctl.sh's cmd_update: drop the Darwin+unmanaged re-exec into the signed installer bridge

Remove the Darwin-specific re-exec into insrc-daemon-install.sh in cmd_update's unmanaged (supervised_lifecycle rc=10) branch; let it fall through to the existing plain sync_repo/npm_install_if_needed/npm_build sequence already used on non-Darwin, matching cmd_start/cmd_stop/cmd_restart's existing unmanaged behavior. The managed branch (rc=0) is untouched.

**Acceptance checks:**
- An unmanaged install's `daemon-ctl.sh update` on Darwin completes via git fetch + npm install + npm build with no signing requirement and no call into insrc-daemon-install.sh.
- A managed install's `daemon-ctl.sh update` behavior is unchanged.

### 1.2 TASK-c5a4572e3949359a-s1-t2 — Simplify vscode-plugin's createDaemonLifecycleController.run('update'): drop the install(true) pre-emption

Remove run('update')'s special-case that detects an unmanaged-but-present install and calls install(true) (spawning the bundled signed installer). run('update') always spawns the resolved daemon-ctl.sh with 'update', delegating the managed/unmanaged decision to the now-fixed script from t1.

**Acceptance checks:**
- run('update') on an unmanaged install always spawns 'bash <daemon-ctl.sh> update', never the bundled installer.
- run('update') on a managed install is unchanged.

### 1.3 TASK-c5a4572e3949359a-s1-t3 — Simplify jetbrains-plugin's ScriptDaemonProvisioner.run(UPDATE): remove the legacy/existingUpgradeTarget() branch

Remove run(kind)'s legacy branch for UPDATE (computed from locator.existingUpgradeTarget()) so UPDATE always resolves via locator.scriptFor(UPDATE) and spawns 'bash <daemon-ctl.sh> update'. Remove the now-dead DaemonLifecycleService.existingUpgradeTarget() override and the DaemonScriptLocator interface's existingUpgradeTarget() default, since nothing calls it anymore.

**Acceptance checks:**
- ScriptDaemonProvisioner.run(ProvisionKind.UPDATE, ...) on an unmanaged install always spawns 'bash <daemon-ctl.sh> update', never the bundled installer with --target.
- ScriptDaemonProvisioner.run(ProvisionKind.INSTALL, ...) is unchanged.

### 1.4 TASK-c5a4572e3949359a-s1-t4 — Rewrite vscode-plugin's controller.test.ts to assert the corrected update routing

Replace 'The VS Code update action selects the installer on legacy macOS and the selected controller after migration' with an assertion that run('update') always spawns daemon-ctl.sh update for both the unmanaged and the managed case, matching t2's new behavior.

**Acceptance checks:**
- The rewritten test passes against t2's implementation and fails if the install(true) pre-emption is reintroduced.

### 1.5 TASK-c5a4572e3949359a-s1-t5 — Rewrite jetbrains-plugin's three affected test files to assert the corrected update routing

Rewrite DaemonProvisionerTest.kt, DefaultDaemonScriptLocatorTest.kt and DaemonLifecycleCommandRunnerTest.kt so none of them exercise the removed legacy/existingUpgradeTarget() branch; each asserts UPDATE always spawns daemon-ctl.sh update for an unmanaged install, matching t3's new behavior, with INSTALL coverage unchanged.

**Acceptance checks:**
- All three rewritten test files pass against t3's implementation and fail if the legacy branch or existingUpgradeTarget() is reintroduced.

### 1.6 TASK-c5a4572e3949359a-s1-t6 — Rewrite the cross-client integration test 'Installer and updated CLI, VS Code and JetBrains route matrix'

Rewrite src/daemon/__tests__/macos-upgrade-routing.test.ts so its unmanaged-checkout assertions expect a plain git-fetch+npm-install+npm-build sequence (no authorize/npm ci/npm run/prepare-legacy-upgrade trace events) across all four surfaces (raw installer, daemon-ctl.sh update, vscode-plugin's run('update'), jetbrains-plugin's DaemonLifecycleCommandRunnerTest bridge), while adding a second fixture for a genuinely managed checkout whose assertions are left exactly as the test's current managed-path behavior.

**Acceptance checks:**
- The rewritten test's unmanaged-fixture assertions show no authorize/npm-ci/npm-run/prepare-legacy-upgrade trace events across all four surfaces, and all four complete successfully.
- The rewritten test's new managed-fixture assertions show the signed bridge still engaging for all four surfaces, unchanged from today.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/daemon/__tests__/macos-upgrade-routing.test.ts: 'Installer and updated CLI, VS Code and JetBrains route matrix' (rewritten) | `t1`, `t2`, `t3`, `t6` |
| vscode-plugin/src/daemon/__tests__/controller.test.ts: 'The VS Code update action selects the installer on legacy macOS and the selected controller after migration' (replaced with an assertion that update always spawns daemon-ctl.sh update, unmanaged or managed) | `t2`, `t4` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonProvisionerTest.kt (rewritten: legacy-target fixtures removed/replaced) | `t3`, `t5` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonScriptLocatorTest.kt (rewritten: existingUpgradeTarget() assertions removed if the method is deleted, or updated to always-null if retained for interface compatibility) | `t3`, `t5` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt (rewritten: the legacy branch it currently exercises via INSRC_ROUTE_MATRIX_* env vars is removed) | `t3`, `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD-c5a4572e3949359a-s1 dataModelChanges[0] (scripts/daemon-ctl.sh cmd_update Darwin + unmanaged branch)`
- **[[c2]]** `prior-artifact` `LLD-c5a4572e3949359a-s1 dataModelChanges[1] (vscode-plugin's createDaemonLifecycleController.run('update') unmanaged pre-emption)`
- **[[c3]]** `prior-artifact` `LLD-c5a4572e3949359a-s1 dataModelChanges[2] (jetbrains-plugin's ScriptDaemonProvisioner.run(UPDATE) legacy branch / existingUpgradeTarget())`
- **[[c4]]** `prior-artifact` `LLD-c5a4572e3949359a-s1 testStrategy (5 affected test files, acceptance mapping ac1-ac3)`
- **[[c5]]** `prior-artifact` `LLD-c5a4572e3949359a-s1 migration (stateBefore/stateAfter/migrationSteps, backwardCompat)`
