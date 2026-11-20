<!-- insrc:artifact LLD-f8cbf44536347149-s1 -->

# LLD: STORY-f8cbf44536347149-s1 — Set the build commands when a repo is added and edit them on the Repo Configuration page

## Summary

**Epic:** `set-build-commands-when-repo-added`
**HLD base run:** `wf-1795156338735-68c2uy`
**HLD effective hash:** `36e0a66fc3ac...`

When a repository is added, the daemon now sets its build commands itself: for a Python, Go, Rust or JVM project it stores that type's typical typecheck and test commands (and the exit-code result format) in the repo's own settings, once, without asking anyone and without overwriting anything already set. A Node project keeps the gate's own default and a project of an unknown type gets nothing. The result of the add says what was done. The Repo Configuration page of each client gets its own Build section to see and edit the three commands, and for a repo that has none (added before this change, or of an unknown type) it shows the type's typical commands as suggestions to apply.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `repo.add`

```typescript
'repo.add': (params: { path: string; steering?: SteeringSelection }) => Promise<{ ok: true; steering?: SteeringResult; mcp?: McpResult; buildDefaults?: BuildDefaultsOutcome }>
```

**Parameters:**
- `path: string` — The repository path to register, validated as before.
- `steering: SteeringSelection` _(optional)_ — As before: the steering-block and MCP selection; unrelated to the build defaults.

**Returns:** `{ ok: true; steering?; mcp?; buildDefaults? }` — As before, plus buildDefaults: what the build-defaults follow-up did.

**Errors:**
- `Error: Cannot add repository: <reason>` when The path is invalid, as before; the build defaults never add an error.

**Preconditions:**
- The path passed validateRepoPath.

**Postconditions:**
- The repo is registered and indexing has started whatever the build defaults did.
- No build setting is written for a Node or unknown project, nor when the repo's entry already sets typecheckCommand, testCommand or resultFormat.
- buildDefaults is always present once the registration succeeded.

### 2.2 `applyBuildDefaults`

```typescript
function applyBuildDefaults(repoPath: string, deps?: { readonly writeKeys?: typeof writeRepoEntryKeys; readonly configPath?: () => string }): Promise<BuildDefaultsOutcome>
```

**Parameters:**
- `repoPath: string` — The just-registered repository's root.
- `deps: { writeKeys?; configPath? }` _(optional)_ — The injectable writer and file path the repo settings handlers already take.

**Returns:** `BuildDefaultsOutcome` — Whether the defaults were written, for which project type and which commands, or why nothing was written.

**Postconditions:**
- Never throws: a failed read or write is reported as reason 'write-failed' with the message.
- Writes the three keys in one call of the serialised writer (typecheckCommand, testCommand, resultFormat 'exit-code'), so a lone command is never stored.
- Reads the repo's own entry first and writes nothing when any of the three keys is present.

### 2.3 `repo.settings.get`

```typescript
'repo.settings.get': (params: { repo: string }) => Promise<SettingsResult>   // SettingsResult.payload: RepoSettingsPayload gains buildSetup
```

**Parameters:**
- `repo: string` — The registered repository's exact path, as before.

**Returns:** `SettingsResult` — As before, plus payload.buildSetup: the project type, where the gate's commands come from and, for a repo with no commands and a type that has typical commands, the suggestion.

**Errors:**
- `repo-not-registered` when The path is not a registered repository, as before.

**Preconditions:**
- The repo is registered.

**Postconditions:**
- Nothing is written: buildSetup is derived from the repo root's marker files and the repo's own entry.
- buildSetup.suggestion is present only when commandsSource is 'none' and the project type is python, go, rust or jvm.
- A repo whose entry holds an invalid build setting reports commandsSource 'invalid' with a note, and no suggestion.

### 2.4 `buildSettingsRows`

```typescript
function buildSettingsRows(fields: readonly RepoFieldDef[], payload: RepoSettingsPayload): SettingsRow[]
```

**Parameters:**
- `fields: readonly RepoFieldDef[]` — The daemon's repoFields rows.
- `payload: RepoSettingsPayload` — The repo's settings payload, now carrying buildSetup.

**Returns:** `SettingsRow[]` — The terminal's rows; an unset Build row shows its suggestion as the placeholder.

**Postconditions:**
- Rows keep the daemon's order and labels; only the placeholder of an unset Build row changes.

### 2.5 `renderRepoConfig`

```typescript
function renderRepoConfig(deps: RepoConfigRendererDeps): RepoConfigRenderer
```

**Parameters:**
- `deps: RepoConfigRendererDeps` — The panel's daemon-facing dependencies.

**Returns:** `RepoConfigRenderer` — The VS Code Repo Configuration page, whose Build rows move from a sub-heading of the Tracker grid into a section of their own.

**Postconditions:**
- The Build rows keep their keys, labels and kinds; the shared repo-fields contract still holds.

## 3. Data model changes

### 3.1 `BuildDefaultsOutcome` — new

{ applied: boolean; projectType: 'node' | 'python' | 'go' | 'rust' | 'jvm' | 'unknown'; typecheckCommand?: string; testCommand?: string; resultFormat?: 'exit-code'; reason?: 'already-set' | 'node-default' | 'no-typical-commands' | 'write-failed'; note?: string }. Returned by repo.add as buildDefaults; never stored.

**Call sites:**
- `src/daemon/handler-runtime.ts:351`
- `src/daemon/repo-settings.ts`

### 3.2 `repo.add result` — field-add

Adds the optional-by-version field buildDefaults to the { ok, steering?, mcp? } result; a client that ignores it behaves as before.

**Call sites:**
- `src/daemon/handler-runtime.ts:351`
- `src/cli/services/repo.ts:49`

### 3.3 `RepoSettingsPayload` — field-add

Adds `buildSetup: BuildSetup`, always present, read-only (not a settings row).

**Call sites:**
- `src/daemon/repo-settings.ts`
- `src/cli/panes/repo-settings-model.ts`
- `vscode-plugin/src/panels/repo-config.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/RepoTrackerModel.kt`

### 3.4 `BuildSetup` — new

{ projectType: 'node' | 'python' | 'go' | 'rust' | 'jvm' | 'unknown'; commandsSource: 'node-default' | 'repo-setting' | 'none' | 'invalid'; note?: string; suggestion?: { typecheckCommand: string; testCommand: string; resultFormat: 'exit-code' } }. Derived on each read and never stored.

**Call sites:**
- `src/daemon/repo-settings.ts`
- `src/daemon/steps/build-step/validation-checks.ts:94-101`

### 3.5 `repoFields (Build rows)` — field-modify

The rows (typecheckCommand, testCommand, resultFormat) are unchanged; how a client groups them changes: the VS Code page renders them in a section of their own, and the shared fixture src/config/__tests__/fixtures/repo-fields-catalog.json gains the buildSetup of its repo.settings.get payload.

**Call sites:**
- `src/config/repo-fields.ts`
- `src/config/__tests__/fixtures/repo-fields-catalog.json`
- `vscode-plugin/src/panels/repo-config.ts`

## 4. Error paths

**Error cases**

- **The defaults cannot be written at repo add (github.json changed by another process on each attempt, or the write fails)** (recoverable)
  - Detection: writeRepoEntryKeys returns { ok: false, error: { code: 'file-changed' | 'write-failed' } } inside applyBuildDefaults
  - Response: applyBuildDefaults returns { applied: false, reason: 'write-failed', note } and logs it; the repo is registered and indexed regardless; nothing is stored, so no lone command is left
  - User impact: The repo reads 'the gate ran nothing' until its commands are set; the Build section shows the project type's typical commands as suggestions to apply
- **The repo's own entry cannot be read before the write (github.json unreadable or malformed)** (recoverable)
  - Detection: readRepoEntry returns { ok: false, error: { code: 'github-json-unreadable' } }
  - Response: Nothing is written (the entry's contents are unknown, so an existing value could be overwritten); the outcome is { applied: false, reason: 'write-failed', note } and the add succeeds
  - User impact: The add succeeds; the settings file is reported unreadable on the Repo Configuration page as it is today
- **The stored default is wrong for the project (it uses ruff instead of mypy, a task runner instead of go test) or its tool is not installed** (recoverable)
  - Detection: The build gate runs the stored command and gets a non-zero exit code, a failing report or a 'could not start' note, which its verdict and the test record show
  - Response: The gate fails the check with that command's own output, as it would for any stored setting; the user edits the three commands on the Build section, and a later repo add never overwrites the edit
  - User impact: A build fails with the command's output, which names the command, until the user corrects it; the default was a guess the user accepted by choosing automatic defaults
- **A client is older or newer than the daemon and the repo.add result or the settings payload lacks buildDefaults or buildSetup** (recoverable)
  - Detection: The field is undefined when the client reads it
  - Response: The client shows nothing about the defaults and no suggestion, and renders the Build rows as before
  - User impact: Same as today; the daemon still wrote the defaults, which the user sees on the page

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A Node project (package.json at the root) is added | applyBuildDefaults writes nothing: { applied: false, projectType: 'node', reason: 'node-default' }; the gate uses its Node default and the Build section is still shown |
| A project of an unknown type (no marker, or markers of several types) is added | Nothing is written: { applied: false, projectType: 'unknown', reason: 'no-typical-commands' } (its guidance is prose, not a command); the repo reads 'the gate ran nothing' until the user sets the commands |
| A Python, Go, Rust or JVM project with no build key in its entry is added | The type's PROJECT_TYPE_GUIDANCE typecheck and test commands and resultFormat 'exit-code' are written together, and the outcome is { applied: true, ... } with the commands |
| A repo that was removed and added again whose entry still holds its commands | Nothing is written: { applied: false, reason: 'already-set' }; the stored values are kept |
| The entry sets only one of the three keys, for example resultFormat | Nothing is written ('already-set'): any present key is the user's, and the gate's own refusal of a lone command tells them what is missing |
| repo.add is called twice for the same repo | The first call writes the defaults and the second finds the keys set and writes nothing ('already-set') |
| A repo registered before this change with no commands | Nothing is written automatically; its Build section shows the type's typical commands as the placeholder with an action to apply them |
| A monorepo whose root has package.json and a go.mod in a subdirectory | The root decides the type (node): nothing is written |

**Invariants to preserve**

- repo.add keeps registering the repo and starting indexing exactly as before; its follow-ups stay guarded so that a failure is logged and never fails the add, and the build defaults follow the same contract [[c1]]
- The daemon stays the only writer of github.json, through the serialised writeRepoEntryKeys; the defaults are written as ordinary settings that repo.settings.set can change or clear, and repo.settings.set keeps its validation and registered-repo rule [[c2]]
- A value already set in the repo's own entry is never overwritten by the defaults [[c2]]
- The typical commands come only from PROJECT_TYPE_GUIDANCE in the daemon, and the gate runs a command only from the Node default or a stored repo setting; it refuses a lone command, so the three keys are written together [[c3]]
- Every client renders the same key, label, kind and note per repoFields row, in the daemon's order, from the shared fixture; the new section changes no row [[c4]]

## 5. Test strategy

**Test framework:** `node:test run through tsx (convention of src/daemon/__tests__, src/cli/__tests__ and vscode-plugin/src/**/__tests__), with temporary repositories and the injectable writer of the repo settings handlers; the JetBrains plugin's Kotlin tests run under Gradle and are not run here`

**Test levels**

- **unit** — Prove applyBuildDefaults, the buildSetup block and the clients' Build section, without a real toolchain
  - Subjects: `src/daemon/__tests__/repo-settings.test.ts: applyBuildDefaults writes the type's typecheck and test commands and resultFormat exit-code together for a Python, Go, Rust and JVM repo with no build key, and writes nothing for a Node repo, an unknown repo and an entry that already sets any of the three keys`, `src/daemon/__tests__/repo-settings.test.ts: applyBuildDefaults never throws and reports write-failed when the entry cannot be read or the write fails, leaving no lone command`, `src/daemon/__tests__/repo-settings.test.ts: repo.settings.get returns buildSetup with the type, the commands source and the suggestion for a repo with none, and writes nothing`, `src/cli/__tests__/repo-fields-contract.test.ts: the shared fixture's repo.settings.get payload carries buildSetup and the terminal rows still equal the fixture's rows`, `src/cli/__tests__/settings-modal.test.ts: the terminal Repo Configuration screen shows the Build rows as a section of their own with the suggestion as the placeholder of an unset row`, `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts: the VS Code Repo Configuration page renders the Build rows in a section of their own with the keys, labels and kinds of the shared fixture, and shows the suggestion as the placeholder of an unset row`
  - Fixtures: `Temporary repositories holding only a marker file (pyproject.toml, go.mod, Cargo.toml, pom.xml, package.json, or none)`, `A temporary github.json and the injectable writeKeys and configPath of the repo settings handlers`, `The existing stand-in services and fakes of the terminal and VS Code tests`, `The shared fixture src/config/__tests__/fixtures/repo-fields-catalog.json`
- **integration** — Prove repo.add end to end: the defaults are stored without any client input, never fail the add, and the gate then runs them
  - Subjects: `src/daemon/__tests__/handler-runtime.test.ts: repo.add on a Python repo registers it and stores the default commands with no prompt, reports buildDefaults applied, and a failing write still registers the repo`, `src/daemon/__tests__/handler-runtime.test.ts: repo.add on a repo whose entry already holds commands keeps them and reports already-set`, `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a repo whose commands came from the add defaults is gated by those commands as an ordinary repo setting`
  - Fixtures: `The existing repo.add handler harness with a temporary github.json`, `The validate-round harness with a stand-in check runner`
- **smoke** — The JetBrains Repo Configuration settings, which cannot be run here (no Gradle)
  - Subjects: `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/RepoFieldsContractTest.kt: the JetBrains repo settings render the Build rows as a section of their own`
  - Fixtures: `A Gradle build of the JetBrains plugin, run by the user`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/daemon/__tests__/repo-settings.test.ts: applyBuildDefaults writes the type's typecheck and test commands and resultFormat exit-code together for a Python, Go, Rust and JVM repo with no build key, and writes nothing for a Node repo, an unknown repo and an entry that already sets any of the three keys`, `src/daemon/__tests__/handler-runtime.test.ts: repo.add on a Python repo registers it and stores the default commands with no prompt, reports buildDefaults applied, and a failing write still registers the repo` |
| `ac2` | `src/daemon/__tests__/handler-runtime.test.ts: repo.add on a repo whose entry already holds commands keeps them and reports already-set`, `src/daemon/__tests__/repo-settings.test.ts: applyBuildDefaults writes the type's typecheck and test commands and resultFormat exit-code together for a Python, Go, Rust and JVM repo with no build key, and writes nothing for a Node repo, an unknown repo and an entry that already sets any of the three keys` |
| `ac3` | `src/daemon/__tests__/repo-settings.test.ts: applyBuildDefaults never throws and reports write-failed when the entry cannot be read or the write fails, leaving no lone command`, `src/daemon/__tests__/handler-runtime.test.ts: repo.add on a Python repo registers it and stores the default commands with no prompt, reports buildDefaults applied, and a failing write still registers the repo` |
| `ac4` | `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts: the VS Code Repo Configuration page renders the Build rows in a section of their own with the keys, labels and kinds of the shared fixture, and shows the suggestion as the placeholder of an unset row`, `src/cli/__tests__/settings-modal.test.ts: the terminal Repo Configuration screen shows the Build rows as a section of their own with the suggestion as the placeholder of an unset row`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/RepoFieldsContractTest.kt: the JetBrains repo settings render the Build rows as a section of their own` |
| `ac5` | `src/daemon/__tests__/repo-settings.test.ts: repo.settings.get returns buildSetup with the type, the commands source and the suggestion for a repo with none, and writes nothing`, `src/cli/__tests__/repo-fields-contract.test.ts: the shared fixture's repo.settings.get payload carries buildSetup and the terminal rows still equal the fixture's rows`, `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a repo whose commands came from the add defaults is gated by those commands as an ordinary repo setting` |

## 6. Migration

**State before:** repo.add registers a repository, starts indexing and runs the steering and MCP follow-ups only when asked, each guarded so a failure never fails the add; no path writes a build setting at add, and the add is mostly non-interactive (the search.text bundle). A repo's build commands are keys of its own entry in github.json written only through repo.settings.set or by hand, rendered by the three clients with no project-type suggestion (the module.profile bundle). The typical commands of each project type exist only in PROJECT_TYPE_GUIDANCE and feed the builder prompts; the gate runs a command only from the Node default or a stored setting (the usage.example bundle). A non-Node repo therefore reads 'the gate ran nothing' until its commands are set by hand.

**State after:** repo.add also calls a guarded applyBuildDefaults after the registration: for a Python, Go, Rust or JVM repo whose entry sets none of the three build keys it stores that type's typecheck and test commands and resultFormat exit-code in one write, and the result reports what happened (buildDefaults). Node and unknown repos and repos whose entry already sets a key are left as they are. The defaults are ordinary settings, editable or clearable afterwards. repo.settings.get also returns a read-only buildSetup (type, commands source, suggestion for a repo with none), and each client's Repo Configuration page shows the Build rows as a section of their own with the suggestion as the placeholder of an unset row.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add buildSetupFor and applyBuildDefaults in the daemon's repo settings module; return buildSetup from repo.settings.get; nothing calls applyBuildDefaults yet and no stored data changes — ↩ rollbackable
2. Call applyBuildDefaults from repo.add as a guarded follow-up and return buildDefaults in the result; this is the first write at add, for repos added from then on — ↩ rollbackable
3. Regenerate the shared repoFields fixture's repo.settings.get payload with a buildSetup, and teach the terminal rows model to show the suggestion as the placeholder of an unset Build row — ↩ rollbackable
4. Terminal and VS Code: give the Repo Configuration screen and page a Build section of their own — ↩ rollbackable
5. JetBrains: give the repo settings a Build section of their own; its Kotlin tests are run by the user — ↩ rollbackable
6. Document the automatic defaults and the Build section in docs/daemon.md — ↩ rollbackable

**Backward compat:** No existing method changes shape: repo.add gains an optional result field and repo.settings.get one field, which an older client ignores, and a newer client facing an older daemon finds them absent and shows nothing extra. No stored data is rewritten: only repos added after the change get defaults, and repos already registered keep exactly what they have (their page offers the suggestion). Rolling the code back leaves the stored commands in place; they are ordinary settings the gate keeps honouring. repo.settings.set, the repoFields rows and their order are unchanged.

## 7. Alternatives considered

### 7.1 a1: The daemon writes the type's default commands in repo.add, once, when none are set — **CHOSEN**

After registration, repo.add detects the project type and stores its typical commands in the repo's own entry unless the entry already sets a build key; the Build section edits them afterwards.

Add a small daemon function applyBuildDefaults(repoPath) that reads the repo's own entry with readRepoEntry, returns without writing when typecheckCommand, testCommand or resultFormat is already set or when the project type is node (the gate's own default) or unknown (its guidance is prose), and otherwise writes the type's PROJECT_TYPE_GUIDANCE typecheck and test command and resultFormat 'exit-code' with the existing serialised writer writeRepoEntryKeys. The repo.add handler calls it after the registration as a guarded follow-up, like the steering and MCP follow-ups: a failure is logged and never fails the add, and the result gains buildDefaults (applied, project type, commands, or the reason nothing was written). No client prompts. The Repo Configuration page of each client renders the Build rows as a section of their own; for a repo with no commands (added before this change, or of an unknown type) repo.settings.get returns a read-only buildSetup whose suggestion the page shows as the placeholder with a 'use suggested' action.

### 7.2 a2: The gate uses the type's typical commands when no setting exists, nothing stored

commandProfileOf falls back to PROJECT_TYPE_GUIDANCE for python, go, rust and jvm; no write at add.

Change commandProfileOf so a project of those types with no repo setting gets commandsSource 'type-default' and the table's commands instead of 'none'; nothing is written at repo add; the Build section shows the effective default as a read-only placeholder and an edit stores a setting that wins.

**Rejected because:** The gate would run commands that are stored nowhere, so the settings and the behaviour disagree, and the build-gate Story's invariant that the gate runs only the Node default or a stored setting would have to be reversed.

### 7.3 a3: Each client writes the defaults after the add with repo.settings.set, without asking

After repo.add succeeds, the terminal, VS Code and JetBrains clients read buildSetup and write the suggestion at once.

Keep the buildSetup block of repo.settings.get with its suggestion and have each client, right after a successful add, write the suggestion through repo.settings.set with no prompt.

**Rejected because:** The same silent write would be duplicated in three clients, and the non-interactive callers that matter most (a script's repo.add) would set nothing.

### 7.4 a4: A Build section on the Repo Configuration pages only, no default at add

Each client gets its own Build section with the type's suggestion as the placeholder; the user sets the commands from the page.

Render the Build rows as a section of their own on the terminal screen, the VS Code page and the JetBrains settings, with the suggestion from repo.settings.get as the placeholder and a 'use suggested' action. repo.add is unchanged.

**Rejected because:** It leaves the commands unset at add, which is what the request asks to change.

## 8. References

- **[[c1]]** `code` `src/daemon/handler-runtime.ts` — "s1 search.text bundle: the repo.add handler, its guarded steering and MCP follow-ups and the three clients' add flows (src/cli/services/repo.ts, vscode-plugin/src/workspace/registrar.ts, jetbrains-plu"
- **[[c2]]** `code` `src/daemon/repo-settings.ts` — "s1 module.profile bundle: repo.settings.get and repo.settings.set, the serialised writer writeRepoEntryKeys in src/workflow/config/github-store.ts and REPO_TRACKER_FIELDS in src/config/repo-fields.ts"
- **[[c3]]** `code` `src/daemon/steps/build-step/validation-checks.ts` — "s1 usage.example bundle: detectProjectType, PROJECT_TYPE_GUIDANCE and commandProfileOf, which the gate resolves a stored setting through"
- **[[c4]]** `code` `src/cli/__tests__/repo-fields-contract.test.ts` — "s1 test.locate bundle: the client contract tests over the shared fixture src/config/__tests__/fixtures/repo-fields-catalog.json, the repo.add and repo.settings tests, and the JetBrains RepoFieldsContr"

## 9. Open questions

- cd1 partial: applyBuildDefaults, BuildDefaultsOutcome and BuildSetup are new symbols, declared as new rather than taken from an existing symbol.
- ep3 partial: the invariants cite c1 to c4, assumed to be the ids of the s1 bundles in order and given below as citations.
- ts1 partial: the Story has no acceptance criteria, so ac1 to ac5 were written by this LLD and need the user's confirmation as the acceptance criteria.
- alt2 partial: alternatives were scored against six constraints k1 to k6 derived from the user's decision to apply defaults automatically, since no Story, Epic or HLD constraints exist.
- sbdry4 partial: the criterion ids ac1 to ac5, the constraint ids k1 to k6 and the citation ids c1 to c4 are labels this LLD assigned.

## Resolved questions

- `q9af5e00a` — cd1 partial: applyBuildDefaults, BuildDefaultsOutcome and BuildSetup are new symbols, declared as new rather than taken from an existing symbol.
  - **resolved**: Define all three as new symbols — User asked to resolve the open questions (2026-11-20): applyBuildDefaults, BuildDefaultsOutcome and BuildSetup have no existing equivalents and are new symbols. _(2026-11-20T06:43:35.862Z)_
- `qa898cbc6` — ep3 partial: the invariants cite c1 to c4, assumed to be the ids of the s1 bundles in order and given below as citations.
  - **resolved**: Verify existing IDs — Verified 2026-11-20: c1-c4 in the LLD are the four s1 analyze bundles in order (search.text, module.profile, usage.example, test.locate), and the invariants cite the intended bundles. _(2026-11-20T06:44:52.268Z)_
- `q59c82aa2` — ts1 partial: the Story has no acceptance criteria, so ac1 to ac5 were written by this LLD and need the user's confirmation as the acceptance criteria.
  - **resolved**: Confirm ac1-ac5 — The user asked on 2026-11-20 to resolve the open questions after the five LLD-authored criteria were presented; ac1-ac5 stand as written as the Story's acceptance criteria (no amendment was requested). _(2026-11-20T06:45:44.050Z)_
- `q8988339c` — alt2 partial: alternatives were scored against six constraints k1 to k6 derived from the user's decision to apply defaults automatically, since no Story, Epic or HLD constraints exist.
  - **resolved**: Confirm constraints before proceeding — The user asked on 2026-11-20 to resolve the open questions; the six constraints k1-k6 (no intervention at add, never overwrite, a failure never fails the add, Build section on every client, reuse the writer and keep the table in the daemon, stay small) derive from the user's own decision and are the scoring basis; no Story, Epic or HLD constraints exist. _(2026-11-20T06:46:23.797Z)_
- `qf0ab7bee` — sbdry4 partial: the criterion ids ac1 to ac5, the constraint ids k1 to k6 and the citation ids c1 to c4 are labels this LLD assigned.
  - **resolved**: Keep LLD-local labels — User asked to resolve the open questions (2026-11-20): ac1-ac5, k1-k6 and c1-c4 are labels assigned by LLD-f8cbf44536347149-s1 and resolve within it; no upstream identity is claimed. _(2026-11-20T06:46:47.221Z)_

## Citations

- **[[c1]]** `code` `src/daemon/handler-runtime.ts` — "s1 search.text bundle: the repo.add handler, its guarded steering and MCP follow-ups and the three clients' add flows (src/cli/services/repo.ts, vscode-plugin/src/workspace/registrar.ts, jetbrains-plu"
- **[[c2]]** `code` `src/daemon/repo-settings.ts` — "s1 module.profile bundle: repo.settings.get and repo.settings.set, the serialised writer writeRepoEntryKeys in src/workflow/config/github-store.ts and REPO_TRACKER_FIELDS in src/config/repo-fields.ts"
- **[[c3]]** `code` `src/daemon/steps/build-step/validation-checks.ts` — "s1 usage.example bundle: detectProjectType, PROJECT_TYPE_GUIDANCE and commandProfileOf, which the gate resolves a stored setting through"
- **[[c4]]** `code` `src/cli/__tests__/repo-fields-contract.test.ts` — "s1 test.locate bundle: the client contract tests over the shared fixture src/config/__tests__/fixtures/repo-fields-catalog.json, the repo.add and repo.settings tests, and the JetBrains RepoFieldsContr"
