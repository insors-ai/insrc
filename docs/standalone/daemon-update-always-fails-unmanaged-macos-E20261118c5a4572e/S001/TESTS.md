<!-- insrc:artifact TESTS-c5a4572e3949359a-s1 -->

# Tests: c5a4572e3949359a s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-18T06:25:16.610Z on commit `d3450ccd3`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/__tests__/macos-upgrade-routing.test.ts: 'Installer and updated CLI, VS Code and JetBrains route matrix' (rewritten)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Installer and updated CLI, VS Code and JetBrains route matrix | `src/daemon/__tests__/macos-upgrade-routing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/macos-upgrade-routing.test.ts` | 0 | 1 | 6.8 s |  |

## t2

Run at 2026-11-18T06:26:26.313Z on commit `d3450ccd3`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: vscode-plugin/src/daemon/__tests__/controller.test.ts: 'The VS Code update action selects the installer on legacy macOS and the selected controller after migration' (replaced with an assertion that update always spawns daemon-ctl.sh update, unmanaged or managed)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | run('update') always spawns daemon-ctl.sh update — for an unmanaged-but-present install and for a managed one after migration | `vscode-plugin/src/daemon/__tests__/controller.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/daemon/__tests__/controller.test.ts` | 0 | 9 | 0.4 s |  |

## t3

Run at 2026-11-18T06:27:29.736Z on commit `d3450ccd3`. Tests check: **failed**. 0 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

named tests matched no test file: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt (rewritten: the legacy branch it currently exercises via INSRC_ROUTE_MATRIX_* env vars is removed) (pass a `tests` mapping at the validate turn: for each named test, the file and title of the test cases that carry it)

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt (rewritten: the legacy branch it currently exercises via INSRC_ROUTE_MATRIX_* env vars is removed)**

Not mapped: no test case was named for this test, and nothing was run for it.

## t5

Run at 2026-11-18T06:28:26.984Z on commit `d3450ccd3`. Tests check: **failed**. 0 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

named tests matched no test file: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonProvisionerTest.kt (rewritten: legacy-target fixtures removed/replaced); jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonScriptLocatorTest.kt (rewritten: existingUpgradeTarget() assertions removed if the method is deleted, or updated to always-null if retained for interface compatibility); jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt (rewritten: the legacy branch it currently exercises via INSRC_ROUTE_MATRIX_* env vars is removed) (pass a `tests` mapping at the validate turn: for each named test, the file and title of the test cases that carry it)

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonProvisionerTest.kt (rewritten: legacy-target fixtures removed/replaced)**

Not mapped: no test case was named for this test, and nothing was run for it.

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultDaemonScriptLocatorTest.kt (rewritten: existingUpgradeTarget() assertions removed if the method is deleted, or updated to always-null if retained for interface compatibility)**

Not mapped: no test case was named for this test, and nothing was run for it.

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunnerTest.kt (rewritten: the legacy branch it currently exercises via INSRC_ROUTE_MATRIX_* env vars is removed)**

Not mapped: no test case was named for this test, and nothing was run for it.

## t4

Run at 2026-11-18T06:29:21.864Z on commit `d3450ccd3`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: vscode-plugin/src/daemon/__tests__/controller.test.ts: 'The VS Code update action selects the installer on legacy macOS and the selected controller after migration' (replaced with an assertion that update always spawns daemon-ctl.sh update, unmanaged or managed)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | run('update') always spawns daemon-ctl.sh update — for an unmanaged-but-present install and for a managed one after migration | `vscode-plugin/src/daemon/__tests__/controller.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/daemon/__tests__/controller.test.ts` | 0 | 9 | 0.4 s |  |

## t6

Run at 2026-11-18T06:30:20.296Z on commit `d3450ccd3`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/__tests__/macos-upgrade-routing.test.ts: 'Installer and updated CLI, VS Code and JetBrains route matrix' (rewritten)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Installer and updated CLI, VS Code and JetBrains route matrix | `src/daemon/__tests__/macos-upgrade-routing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/macos-upgrade-routing.test.ts` | 0 | 1 | 8.2 s |  |
