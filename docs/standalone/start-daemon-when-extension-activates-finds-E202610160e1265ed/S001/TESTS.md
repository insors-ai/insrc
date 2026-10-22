<!-- insrc:artifact TESTS-0e1265ed8581e188-s1 -->

# Tests: 0e1265ed8581e188 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 10 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## S001

Run at 2026-10-16T06:40:42.435Z on commit `cb91914f`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: a stopped, installed daemon is started once after the probe, as a plain start, and the status shows running**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a stopped, installed daemon is started once after the probe, as a plain start, and the status shows running | `vscode-plugin/src/__tests__/activation.test.ts` |

**unit: no start is attempted for a running or errored daemon, for a daemon that is not installed, or when no controller is given**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no start is attempted for a running or errored daemon, for a daemon that is not installed, or when no controller is given | `vscode-plugin/src/__tests__/activation.test.ts` |

**unit: a start is skipped when the fresh reachability check just before it finds the daemon running**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a start is skipped when the fresh reachability check just before it finds the daemon running | `vscode-plugin/src/__tests__/activation.test.ts` |

**unit: a failed or throwing start leaves an errored status with the reason, is not retried, and never rejects into activation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failed or throwing start leaves an errored status with the reason, is not retried, and never rejects into activation | `vscode-plugin/src/__tests__/activation.test.ts` |

**unit: a start that reports success while the daemon is still unreachable is shown as errored with the reason 'the daemon did not answer after start'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a start that reports success while the daemon is still unreachable is shown as errored with the reason 'the daemon did not answer after start' | `vscode-plugin/src/__tests__/activation.test.ts` |

**unit: runReachabilityProbe answers the state it pushed into the status surface**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runReachabilityProbe answers the state it pushed into the status surface | `vscode-plugin/src/__tests__/activation.test.ts` |

**unit: activation calls onSettled once after the probe and any start have finished, also when the probe or the start fails or throws**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | activation calls onSettled once after the probe and any start have finished, also when the probe or the start fails or throws | `vscode-plugin/src/__tests__/activation.test.ts` |

**unit: a plain start runs daemon-ctl.sh start with --skip-sync, --skip-install and --skip-build, and a run without options builds the same command line as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a plain start runs daemon-ctl.sh start with --skip-sync, --skip-install and --skip-build, and a run without options builds the same command line as before | `vscode-plugin/src/daemon/__tests__/controller.test.ts` |

**integration: the extension entry passes the daemon lifecycle controller into the activation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the extension entry passes the daemon lifecycle controller into the activation | `vscode-plugin/src/__tests__/activation.test.ts` |

**integration: the extension entry runs the settings pull, the update check and onboarding only after activation has settled**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the extension entry runs the settings pull, the update check and onboarding only after activation has settled | `vscode-plugin/src/__tests__/activation.test.ts` |

**live: after VS Code restarts with the installed daemon stopped, the daemon is running and the status bar shows it**

Reported by the builder, not run by the gate: **pass**. Evidence: Run by the user on 2026-10-16 with the rebuilt vsix installed (build cb91914f). First run (build 6f330297, before the settled ordering): with the daemon stopped, a window reload started it, but a stale 'daemon is not running - start the daemon' toast also appeared (the settings pull raced the start); that run is not counted as a pass and led to the onSettled ordering. Second run (cb91914f): the daemon was restarted by the extension and the update check found nothing to update because the daemon was already at origin. Third run, after pushing main so origin was ahead of the installed daemon: the user stopped the daemon, reloaded, and reported the single word 'worked'. I read that as: the daemon started on its own with no stale toast and the update check ran (Update prompt) in the same activation. The user's reply did not itemise those observations, so this is recorded as reported on that reading, not independently confirmed.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/__tests__/activation.test.ts` | 0 | 15 | 0.5 s |  |
| `vscode-plugin/src/daemon/__tests__/controller.test.ts` | 0 | 8 | 0.3 s |  |
