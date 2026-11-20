<!-- insrc:artifact TESTS-f8cbf44536347149-s1 -->

# Tests: f8cbf44536347149 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 14 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-20T07:30:44.126Z on commit `8552b1bf1`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/__tests__/repo-settings.test.ts: applyBuildDefaults writes the type's typecheck and test commands and resultFormat exit-code together for a Python, Go, Rust and JVM repo with no build key, and writes nothing for a Node repo, an unknown repo and an entry that already sets any of the three keys**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | applyBuildDefaults writes the type's typecheck and test commands and resultFormat exit-code together for a Python, Go, Rust and JVM repo with no build key, and writes nothing for a Node repo, an unknown repo and an entry that already sets any of the three keys | `src/daemon/__tests__/repo-settings.test.ts` |

**unit: src/daemon/__tests__/repo-settings.test.ts: applyBuildDefaults never throws and reports write-failed when the entry cannot be read or the write fails, leaving no lone command**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | applyBuildDefaults never throws and reports write-failed when the entry cannot be read or the write fails, leaving no lone command | `src/daemon/__tests__/repo-settings.test.ts` |

**unit: src/daemon/__tests__/repo-settings.test.ts: repo.settings.get returns buildSetup with the type, the commands source and the suggestion for a repo with none, and writes nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo.settings.get returns buildSetup with the type, the commands source and the suggestion for a repo with none, and writes nothing | `src/daemon/__tests__/repo-settings.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/repo-settings.test.ts` | 0 | 13 | 0.8 s |  |

## t2

Run at 2026-11-20T07:34:44.968Z on commit `65880e2a6`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/__tests__/handler-runtime.test.ts: repo.add on a Python repo registers it and stores the default commands with no prompt, reports buildDefaults applied, and a failing write still registers the repo**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/__tests__/handler-runtime.test.ts: repo.add on a Python repo registers it and stores the default commands with no prompt, reports buildDefaults applied, and a failing write still registers the repo | `src/daemon/__tests__/handler-runtime.test.ts` |

**integration: src/daemon/__tests__/handler-runtime.test.ts: repo.add on a repo whose entry already holds commands keeps them and reports already-set**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/__tests__/handler-runtime.test.ts: repo.add on a repo whose entry already holds commands keeps them and reports already-set | `src/daemon/__tests__/handler-runtime.test.ts` |

**integration: src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a repo whose commands came from the add defaults is gated by those commands as an ordinary repo setting**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a repo whose commands came from the add defaults is gated by those commands as an ordinary repo setting | `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/handler-runtime.test.ts` | 0 | 10 | 1.1 s |  |
| `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts` | 0 | 5 | 1.1 s |  |

## t3

Run at 2026-11-20T07:36:39.461Z on commit `df77e6ef5`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/cli/__tests__/repo-fields-contract.test.ts: the shared fixture's repo.settings.get payload carries buildSetup and the terminal rows still equal the fixture's rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the shared fixture's repo.settings.get payload carries buildSetup and the terminal rows still equal the fixture's rows | `src/cli/__tests__/repo-fields-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/repo-fields-contract.test.ts` | 0 | 4 | 0.4 s |  |

## t4

Run at 2026-11-20T07:39:05.869Z on commit `73a0f4505`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/cli/__tests__/settings-modal.test.ts: the terminal Repo Configuration screen shows the Build rows as a section of their own with the suggestion as the placeholder of an unset row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the terminal Repo Configuration screen shows the Build rows as a section of their own with the suggestion as the placeholder of an unset row | `src/cli/__tests__/settings-modal.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/settings-modal.test.ts` | 0 | 3 | 8.2 s |  |

## t5

Run at 2026-11-20T07:45:59.819Z on commit `8fd6594d5`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts: the VS Code Repo Configuration page renders the Build rows in a section of their own with the keys, labels and kinds of the shared fixture, and shows the suggestion as the placeholder of an unset row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the VS Code Repo Configuration page renders the Build rows in a section of their own with the keys, labels and kinds of the shared fixture, and shows the suggestion as the placeholder of an unset row | `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts` |
| pass | the suggested build commands are applied after one consent, only for a repo with none, and rolled back when a write is refused | `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts` |
| pass | renderRepoConfig: discrete per-repo form fields from models.byRepo[repoPath] tasks and coreFloor (NOT raw JSON); missing entry -> all-global | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |
| pass | source-scan: the webview bootstraps post only the sanctioned message shapes (closed set) | `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts` |
| pass | webview-host.test.ts + chat-shell.test.ts: existing CSP/nonce tests preserved when the shell is extracted to panels/shell.ts (shell output byte-identical, all existing assertions pass unmodified) | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts` | 0 | 11 | 0.4 s |  |
| `vscode-plugin/src/panels/__tests__/repo-config.test.ts` | 0 | 21 | 0.4 s |  |
| `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts` | 0 | 6 | 0.4 s |  |
| `vscode-plugin/src/panels/__tests__/webview-host.test.ts` | 0 | 45 | 0.5 s |  |

## t6

Run at 2026-11-20T08:05:24.995Z on commit `e9fd0c5b8`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/RepoFieldsContractTest.kt: the JetBrains repo settings render the Build rows as a section of their own**

Reported by the builder, not run by the gate: **pass**. Evidence: RUN by the builder under JDK 21 (JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64, Gradle 8.10.2 --offline --no-configuration-cache) from jetbrains-plugin/: `./gradlew test --tests '*settings*'` BUILD SUCCESSFUL, 97 settings tests, 0 failures; RepoFieldsContractTest has 4 tests, all passing, including `the JetBrains repo settings render the Build rows as a section of their own` and `the suggested build commands clear the first key when the second is refused`. Report: jetbrains-plugin/build/test-results/test/TEST-ai.insors.insrc.jetbrains.settings.RepoFieldsContractTest.xml. Whole plugin suite (`./gradlew test`): 513 tests, 1 failure, ArtifactContentTest (review package), FileNotFoundException for ../src/workflow/review/design-review/__tests__/fixtures/artifact-review-wire.json, a fixture of the removed design-review code, unrelated to this Story. Committed at e9fd0c5b8.

## t7

Run at 2026-11-20T07:54:26.853Z on commit `591004d64`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**smoke: docs/daemon.md: the Build commands section is read against the shipped behaviour and states the add-time defaults, buildSetup and the Build section**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs/daemon.md: the Build commands section is read against the shipped behaviour and states the add-time defaults, buildSetup and the Build section | `src/daemon/__tests__/build-commands-doc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/build-commands-doc.test.ts` | 0 | 1 | 0.7 s |  |
