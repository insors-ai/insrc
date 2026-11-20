<!-- insrc:artifact PLAN-f8cbf44536347149-s1 -->

# Plan: STORY-f8cbf44536347149-s1

## Summary

**Epic:** `set-build-commands-when-repo-added`
**LLD run:** `wf-1795156338735-68c2uy`
**LLD effective hash:** `36e0a66fc3ac...`

Repo registration now stores a project type's typical build and test commands by itself, with no client prompt, and never overwrites or fails the add. The daemon owns the type table and the guarded writer; repo.settings.get gains a read-only buildSetup block. The terminal, VS Code and JetBrains Repo Configuration pages then show the Build rows as a section of their own, with the suggestion as the placeholder and a 'use suggested' action for repos with no commands. The work runs daemon first (t1, t2), then the shared fixture (t3), the three clients, and the docs.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add buildSetupFor and applyBuildDefaults in the repo settings module; return buildSetup from repo.settings.get | M | — | — | unit: src/daemon/__tests__/repo-settings.test.ts: applyBuildDefaults writes the type's typecheck and test commands and resultFormat exit-code together for a Python, Go, Rust and JVM repo with no build key, and writes nothing for a Node repo, an unknown repo and an entry that already sets any of the three keys; unit: src/daemon/__tests__/repo-settings.test.ts: applyBuildDefaults never throws and reports write-failed when the entry cannot be read or the write fails, leaving no lone command; unit: src/daemon/__tests__/repo-settings.test.ts: repo.settings.get returns buildSetup with the type, the commands source and the suggestion for a repo with none, and writes nothing | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Call applyBuildDefaults from repo.add as a guarded follow-up | S | — | `t1` | integration: src/daemon/__tests__/handler-runtime.test.ts: repo.add on a Python repo registers it and stores the default commands with no prompt, reports buildDefaults applied, and a failing write still registers the repo; integration: src/daemon/__tests__/handler-runtime.test.ts: repo.add on a repo whose entry already holds commands keeps them and reports already-set; integration: src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a repo whose commands came from the add defaults is gated by those commands as an ordinary repo setting | [[c1]] [[c2]] |
| 3 | **`t3`** Regenerate the shared fixture with buildSetup and show the suggestion in the terminal rows model | S | — | `t1` | unit: src/cli/__tests__/repo-fields-contract.test.ts: the shared fixture's repo.settings.get payload carries buildSetup and the terminal rows still equal the fixture's rows | [[c2]] [[c4]] |
| 4 | **`t4`** Terminal: a Build section and a 'use suggested' action on the Repo Configuration screen | M | — | `t3` | unit: src/cli/__tests__/settings-modal.test.ts: the terminal Repo Configuration screen shows the Build rows as a section of their own with the suggestion as the placeholder of an unset row | [[c2]] [[c4]] |
| 5 | **`t5`** VS Code: a Build section and a 'use suggested' action on the Repo Configuration page | M | — | `t3` | unit: vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts: the VS Code Repo Configuration page renders the Build rows in a section of their own with the keys, labels and kinds of the shared fixture, and shows the suggestion as the placeholder of an unset row | [[c2]] [[c4]] |
| 6 | **`t6`** JetBrains: a Build section and a 'use suggested' action in the repo settings | M | — | `t3` | smoke: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/RepoFieldsContractTest.kt: the JetBrains repo settings render the Build rows as a section of their own | [[c2]] [[c4]] |
| 7 | **`t7`** Document the automatic defaults and the Build section | S | — | `t2`, `t4`, `t5`, `t6` | smoke: docs/daemon.md: the Build commands section is read against the shipped behaviour and states the add-time defaults, buildSetup and the Build section | [[c1]] [[c3]] |

### 1.1 TASK-f8cbf44536347149-s1-t1 — Add buildSetupFor and applyBuildDefaults in the repo settings module; return buildSetup from repo.settings.get

In src/daemon/repo-settings.ts add the types BuildSetup and BuildDefaultsOutcome, buildSetupFor(repoPath, entry) (project type from detectProjectType, commands source from the entry and the gate's profile rules, suggestion from PROJECT_TYPE_GUIDANCE only for python, go, rust and jvm with no commands) and applyBuildDefaults(repoPath, deps?) (reads the repo's own entry, writes the three keys in one writeKeys call only when none is set and the type has typical commands, never throws). repo.settings.get and repo.settings.set return payload.buildSetup. Nothing calls applyBuildDefaults yet.

**Acceptance checks:**
- applyBuildDefaults writes typecheckCommand, testCommand and resultFormat 'exit-code' together for a Python, Go, Rust and JVM repo with no build key
- It writes nothing for a Node repo, an unknown repo, and an entry that sets any one of the three keys, and reports the reason
- It never throws: an unreadable entry or a failed write is { applied: false, reason: 'write-failed', note } and leaves no lone command
- repo.settings.get returns buildSetup (type, commands source, suggestion for a repo with none, 'invalid' with a note for a bad entry) and writes nothing
- Typecheck passes

### 1.2 TASK-f8cbf44536347149-s1-t2 — Call applyBuildDefaults from repo.add as a guarded follow-up

In the repo.add handler of src/daemon/handler-runtime.ts, after the registration and the indexing start, call applyBuildDefaults(normalisedPath) with the handler's own configPath and writer, guarded like the steering and MCP follow-ups, and return its outcome as buildDefaults in the result. A failure is logged and never fails the add; no client input is needed. Its tests are in src/daemon/__tests__/handler-runtime.test.ts and, for the gate reading a stored default as an ordinary setting, src/daemon/steps/build-step/__tests__/validate-task-round.test.ts.

**Acceptance checks:**
- repo.add on a Python repo registers it, stores the default commands with no prompt and reports buildDefaults applied
- repo.add on a repo whose entry already holds commands keeps them and reports already-set
- A failing write still registers the repo and the add succeeds
- A repo whose commands came from the add defaults is gated by those commands as an ordinary repo setting

### 1.3 TASK-f8cbf44536347149-s1-t3 — Regenerate the shared fixture with buildSetup and show the suggestion in the terminal rows model

Add a buildSetup to the repo.settings.get payload of src/config/__tests__/fixtures/repo-fields-catalog.json, and make buildSettingsRows in src/cli/panes/repo-settings-model.ts show the suggestion as the placeholder of an unset Build row (a repo with commandsSource 'none' and a suggestion). Rows keep the daemon's order, labels and kinds; a payload without buildSetup behaves as before.

**Acceptance checks:**
- The shared fixture's payload carries buildSetup and the terminal rows still equal the fixture's rows
- An unset Build row of a repo with a suggestion shows the suggestion as its placeholder text
- A payload with no buildSetup renders exactly as before
- Typecheck passes

### 1.4 TASK-f8cbf44536347149-s1-t4 — Terminal: a Build section and a 'use suggested' action on the Repo Configuration screen

In the terminal settings modal (src/cli/panes/RepoSettingsModal.tsx) show the Build rows as a section of their own and, for a repo with commands source 'none' and a suggestion, offer an action that writes the three suggested values with repo.settings.set, clearing the first key when the second cannot be written (the LLD's lone-command rule). Nothing else about the modal changes.

**Acceptance checks:**
- The modal shows the Build rows as a section of their own with the suggestion as the placeholder of an unset row
- The 'use suggested' action is offered only when commands source is 'none' and a suggestion exists, and never for a repo that has commands
- It writes the three keys through repo.settings.set only when invoked, and writes nothing otherwise
- When the second write fails the first key is cleared and the reason is shown, so no lone command is left
- The existing modal tests pass with the section

### 1.5 TASK-f8cbf44536347149-s1-t5 — VS Code: a Build section and a 'use suggested' action on the Repo Configuration page

In vscode-plugin/src/panels/repo-config.ts render the Build rows as a section of their own (not a sub-heading of the Tracker grid), with the suggestion as the placeholder of an unset row and an action that writes the three suggested values through the panel's existing repo-setting write with the same clear-the-first rollback. Keep the shared repo-fields contract: the same key, label, kind and note per row.

**Acceptance checks:**
- The page renders the Build rows in a section of their own with the keys, labels and kinds of the shared fixture
- An unset Build row shows the suggestion as its placeholder
- The 'use suggested' action is offered only when commands source is 'none' and a suggestion exists, writes only when invoked and rolls the first key back when the second write fails
- vscode-plugin's contract and renderer tests pass and its typecheck is clean

### 1.6 TASK-f8cbf44536347149-s1-t6 — JetBrains: a Build section and a 'use suggested' action in the repo settings

In jetbrains-plugin add buildSetup to RepoSettingsDto (parsed in DaemonGateway.kt) and render the Build rows as a section of their own in RepoTrackerModel's settings view, with the suggestion as the placeholder and the same 'use suggested' write with the clear-the-first rollback. Its Kotlin tests cannot be run here: the Task is verified by reading and by the user's Gradle run, and its smoke-level test is reported by the builder with evidence, not claimed as run.

**Acceptance checks:**
- RepoSettingsDto carries an optional buildSetup and a payload without it parses as before
- The repo settings view lists the Build rows as a section of their own with the suggestion as the placeholder
- The 'use suggested' action is offered only when commands source is 'none' and a suggestion exists, writes only when invoked and clears the first key if the second write fails
- The Kotlin contract test is updated and reported as not run here, with where the evidence is

### 1.7 TASK-f8cbf44536347149-s1-t7 — Document the automatic defaults and the Build section

In docs/daemon.md, extend the 'Build commands' section: the defaults written at repo add (which types, never overwriting, the buildDefaults result, that a default is a guess the user edits), buildSetup and the 'use suggested' action for repos with none, and the Build section on each client's Repo Configuration page.

**Acceptance checks:**
- docs/daemon.md describes the add-time defaults, the types they cover and that nothing is overwritten
- It describes buildSetup, the suggestion and the Build section on the terminal, VS Code and JetBrains pages
- It says a default is a typical command, not a verified one, and where to change it

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/daemon/__tests__/repo-settings.test.ts: applyBuildDefaults writes the type's typecheck and test commands and resultFormat exit-code together for a Python, Go, Rust and JVM repo with no build key, and writes nothing for a Node repo, an unknown repo and an entry that already sets any of the three keys | `t1` |
| src/daemon/__tests__/repo-settings.test.ts: applyBuildDefaults never throws and reports write-failed when the entry cannot be read or the write fails, leaving no lone command | `t1` |
| src/daemon/__tests__/repo-settings.test.ts: repo.settings.get returns buildSetup with the type, the commands source and the suggestion for a repo with none, and writes nothing | `t1` |
| src/cli/__tests__/repo-fields-contract.test.ts: the shared fixture's repo.settings.get payload carries buildSetup and the terminal rows still equal the fixture's rows | `t3` |
| src/cli/__tests__/settings-modal.test.ts: the terminal Repo Configuration screen shows the Build rows as a section of their own with the suggestion as the placeholder of an unset row | `t4` |
| vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts: the VS Code Repo Configuration page renders the Build rows in a section of their own with the keys, labels and kinds of the shared fixture, and shows the suggestion as the placeholder of an unset row | `t5` |
| src/daemon/__tests__/handler-runtime.test.ts: repo.add on a Python repo registers it and stores the default commands with no prompt, reports buildDefaults applied, and a failing write still registers the repo | `t2` |
| src/daemon/__tests__/handler-runtime.test.ts: repo.add on a repo whose entry already holds commands keeps them and reports already-set | `t2` |
| src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a repo whose commands came from the add defaults is gated by those commands as an ordinary repo setting | `t2` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/RepoFieldsContractTest.kt: the JetBrains repo settings render the Build rows as a section of their own | `t6` |

## 3. References

- **[[c1]]** `code` `src/daemon/handler-runtime.ts` — "the repo.add handler, where the guarded follow-ups (steering, MCP) run and the add result is built; the LLD's applyBuildDefaults call sits here"
- **[[c2]]** `code` `src/daemon/repo-settings.ts` — "repo.settings.get/set handlers, RepoSettingsPayload, and the injectable writeKeys/configPath that applyBuildDefaults and buildSetup reuse"
- **[[c3]]** `code` `src/daemon/steps/build-step/validation-checks.ts` — "detectProjectType and PROJECT_TYPE_GUIDANCE, the project-type table the defaults and the suggestion are taken from"
- **[[c4]]** `code` `src/config/__tests__/fixtures/repo-fields-catalog.json` — "the shared repo-fields fixture that the terminal, VS Code and JetBrains contract tests all read"
