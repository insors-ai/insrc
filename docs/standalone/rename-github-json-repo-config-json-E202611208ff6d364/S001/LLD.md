<!-- insrc:artifact LLD-8ff6d364012cff02-s1 -->

# LLD: STORY-8ff6d364012cff02-s1 — Rename github.json to repo-config.json and its store, path function and env var

## Summary

**Epic:** `rename-github-json-repo-config-json`
**HLD base run:** `wf-1795177657841-isaezi`
**HLD effective hash:** `8ff6d364012c...`

Renames the daemon's per-repository settings file from ~/.insrc/github.json to ~/.insrc/repo-config.json, because GitHub is only one repo type, and renames what carries the old name: the path function (repoConfigPath), the override variable (INSRC_REPO_CONFIG, the old one dropped), the store module (repo-config-store.ts), and the file types and loader, which move out of github.ts into a new repo-config.ts. The GitHub-tracker code keeps its names. At the first boot of the updated daemon an existing github.json is moved to the new name with one atomic rename, before any reader runs, and nothing else about how the file is read or written changes.

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

**Surface level:** internal

### 2.1 `repoConfigPath`

```typescript
repoConfigPath(): string
```

**Returns:** `string` — The settings file location: the INSRC_REPO_CONFIG value when it is set and non-empty, otherwise PATHS.insrc/repo-config.json.

**Errors:**
- `never throws` when It only reads the environment and joins a path.

**Preconditions:**
- None.

**Postconditions:**
- Replaces githubConfigPath with the same behaviour under the new name and the new variable; the old variable INSRC_GITHUB_CONFIG is not read.

### 2.2 `loadRepoConfigFile`

```typescript
loadRepoConfigFile(configPath?: string): RepoConfigFile
```

**Parameters:**
- `configPath: string` _(optional)_ — The settings file; defaults to repoConfigPath().

**Returns:** `RepoConfigFile` — The parsed file, or an empty object when it is absent.

**Errors:**
- `RepoConfigError` when The file is unreadable or malformed; the same condition under which loadGithubConfigFile throws GithubConfigError today.

**Preconditions:**
- None.

**Postconditions:**
- Renamed from loadGithubConfigFile, with the error class renamed from GithubConfigError to RepoConfigError; behaviour is unchanged.

### 2.3 `moveLegacyRepoConfig`

```typescript
moveLegacyRepoConfig(dir?: string, seams?: { readonly rename?: (from: string, to: string) => void }): LegacyRepoConfigMove
```

**Parameters:**
- `dir: string` _(optional)_ — The directory holding the settings files; defaults to PATHS.insrc.
- `seams: { readonly rename?: (from: string, to: string) => void }` _(optional)_ — Test seam to observe or fail the rename.

**Returns:** `LegacyRepoConfigMove` — What the move did: moved, nothing-to-move, both-exist or failed, with a note for the last two.

**Errors:**
- `never throws` when A failed rename is the failed status; the function always returns.

**Preconditions:**
- The directory exists (called after boot step 2 ensures the directories), and INSRC_REPO_CONFIG is not set, so only the default location is ever moved.

**Postconditions:**
- When github.json exists and repo-config.json does not, github.json is renamed to repo-config.json with one atomic rename, nothing is copied and no github.json remains.
- When both exist, neither is touched.
- When github.json does not exist, nothing is done.
- Never overwrites an existing repo-config.json.

### 2.4 `readRepoEntry`

```typescript
readRepoEntry(repoPath: string, configPath?: string): ReadResult
```

**Parameters:**
- `repoPath: string` — The registered repo whose entry is selected.
- `configPath: string` _(optional)_ — The settings file; defaults to repoConfigPath().

**Returns:** `ReadResult` — The strict snapshot and the repo's own entry.

**Errors:**
- `github-json-unreadable` when The file is unreadable or malformed; the error code string keeps its current value unless the Story renames it, see the open questions.

**Preconditions:**
- None.

**Postconditions:**
- Unchanged behaviour; only its module (repo-config-store.ts) and its default path function change.

### 2.5 `writeRepoEntryKeys`

```typescript
writeRepoEntryKeys(repoPath: string, patch: EntryPatch, configPath?: string, seams?: StoreSeams): Promise<WriteResult>
```

**Parameters:**
- `repoPath: string` — The registered repo whose entry is patched.
- `patch: EntryPatch` — The keys to set or, with null, clear.
- `configPath: string` _(optional)_ — The settings file; defaults to repoConfigPath().
- `seams: StoreSeams` _(optional)_ — File-operation seams.

**Returns:** `Promise<WriteResult>` — Whether the patch changed the file, or the store's error.

**Errors:**
- `github-json-unreadable | file-changed | write-failed` when As today; returned as data, never a rejection.

**Preconditions:**
- None.

**Postconditions:**
- Unchanged behaviour: the same serialised read-merge-write-verify loop and atomic rename; only its module and default path function change.

## 3. Data model changes

### 3.1 `repo-config.json` — field-modify

The persisted per-repository settings file is renamed from ~/.insrc/github.json to ~/.insrc/repo-config.json. Its content, shape and the daemon-only writer are unchanged; an existing file is moved by one atomic rename at the first boot of the updated daemon.

**Call sites:**
- `src/workflow/config/github.ts:161`
- `src/workflow/config/github-store.ts`
- `src/daemon/index.ts:137`

### 3.2 `RepoConfigFile` — field-modify

Renamed from GithubConfigFile and moved from github.ts into the new repo-config.ts; the same shape { default?, repos? } with the same fields.

**Call sites:**
- `src/workflow/config/github.ts:111`
- `src/workflow/tracker/setup.ts:31`

### 3.3 `RepoConfigEntry` — field-modify

Renamed from GithubEntry and moved into repo-config.ts; the same fields, including the tracker, build and git-hook keys of a repo's own entry.

**Call sites:**
- `src/workflow/config/github.ts:68`
- `src/workflow/config/github-store.ts`

### 3.4 `INSRC_REPO_CONFIG` — field-modify

The environment variable that overrides the settings file path, renamed from INSRC_GITHUB_CONFIG; the old variable is no longer read, so tests and tools that set it must set the new one.

**Call sites:**
- `src/workflow/config/github.ts:161`
- `src/daemon/__tests__/handler-runtime.test.ts`

### 3.5 `LegacyRepoConfigMove` — new

{ readonly status: 'moved' | 'nothing-to-move' | 'both-exist' | 'failed'; readonly note?: string }. What the boot move did; logged, not persisted.

**Call sites:**
- `src/daemon/index.ts:137`
- `src/daemon/index.ts:260-266`

### 3.6 `repo.settings.* and repo.buildDefaults.migrate` — invariant-change

Method names, parameters and replies are unchanged; only the file they read and write has a new name.

**Call sites:**
- `src/daemon/repo-settings.ts:21`
- `src/daemon/handler-runtime.ts:97`

## 4. Error paths

**Error cases**

- **The rename of github.json to repo-config.json fails at boot (permissions, a read-only home, a cross-device or locked file).** (recoverable)
  - Detection: moveLegacyRepoConfig wraps the single rename in try/catch and returns status failed with the error message.
  - Response: The failure is logged as a warning and boot continues; github.json stays where it is and the move is tried again at the next boot. The daemon then reads an absent repo-config.json as empty.
  - User impact: Until the move succeeds the settings appear empty, the build gate falls back to its project-type default, and a settings write would create a new repo-config.json beside the unmoved github.json (the both-exist case below); the user fixes the cause and restarts.
- **Both github.json and repo-config.json exist at boot (for example a settings write after a failed move, or a manual copy).** (recoverable)
  - Detection: moveLegacyRepoConfig finds both files present before it renames anything.
  - Response: Neither file is touched and the status is both-exist with a warning naming both paths; repo-config.json is the one the daemon reads.
  - User impact: Settings only in github.json are not picked up until the user merges or removes it; nothing is lost or overwritten.
- **The boot move itself throws unexpectedly (a bug).** (recoverable)
  - Detection: the call in src/daemon/index.ts wraps moveLegacyRepoConfig in try/catch and logs, like the other boot steps.
  - Response: Logged; boot continues.
  - User impact: None on startup beyond the failed-rename case above.
- **A script, test or tool still sets INSRC_GITHUB_CONFIG or reads ~/.insrc/github.json.** (recoverable)
  - Detection: Nothing in the daemon reads the old variable or path: the old variable is ignored, so a test that sets only it reads and may write the real ~/.insrc/repo-config.json.
  - Response: The 36 test files are updated in this Story and a source scan in the tests fails when any file under src still names INSRC_GITHUB_CONFIG, githubConfigPath or github-store.
  - User impact: An external tool that set the old variable no longer redirects the daemon; the user changes it to INSRC_REPO_CONFIG.
- **repo-config.json exists but is malformed.** (recoverable)
  - Detection: The strict reader returns the unreadable error exactly as it does for github.json today.
  - Response: Unchanged: the same unreadable result and the same refusal to write.
  - User impact: Unchanged from today.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A fresh install: neither file exists. | nothing-to-move; repo-config.json is created by the first write. |
| A second boot after a successful move. | github.json is gone, so nothing-to-move; the pass costs one existence check. |
| INSRC_REPO_CONFIG is set (tests, or a user override). | The boot move is skipped and only the override path is used; a github.json next to it is never touched. |
| github.json is empty or holds invalid JSON. | It is moved as it is; the strict reader then reports it unreadable under the new name, exactly as it did under the old one. |
| github.json is a symbolic link. | The link itself is renamed, so repo-config.json is the same link to the same target; nothing is copied. |
| A repo.settings.set or repo.add arrives right after boot. | It writes repo-config.json, because the move ran at boot step 2 before the server listened. |
| The file holds a root key other than default and repos (the follow-up schemaVersion). | It moves with the file unchanged. |
| Approved Story and Epic records under docs that name github.json. | They are records and are left as they are; only live documentation and sources change. |

**Invariants to preserve**

- The strict reader, the merge and the serialised, verified, atomic writer behave exactly as before; only their module and the default path function change. [[c1]]
- The daemon is the only reader and writer of the settings file, and the IDE clients and terminal reach it only through the repo.settings.* methods, whose names, parameters and replies do not change. [[c3]]
- Nothing that is GitHub-tracker-specific is renamed: TrackerAdapter, resolveGithubConfig, resolveGithubConfigFromFile, resolveBranchPattern, resolveStrictTrackerTarget and the remote-url parsers keep their names and behaviour. [[c1]]
- A boot step never blocks or fails startup: the move runs synchronously and cheaply at step 2 after the directories exist, and a failure is logged, like the other boot steps. [[c4]]
- The file's content is never rewritten by the move: one rename keeps every key, including the default entry, repos and unknown root keys. [[c1]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict (the repo's runner, as in src/daemon/__tests__/repo-settings.test.ts)`

**Test levels**

- **unit** — Prove the path function, the variable and the boot move over temporary directories.
  - Subjects: `repo-config.test.ts: repoConfigPath returns the INSRC_REPO_CONFIG value when it is set and non-empty, PATHS.insrc/repo-config.json otherwise, and ignores INSRC_GITHUB_CONFIG`, `repo-config.test.ts: moveLegacyRepoConfig renames github.json to repo-config.json when only the old file exists, leaving no github.json and the same content byte for byte, and returns nothing-to-move when there is no github.json`, `repo-config.test.ts: moveLegacyRepoConfig leaves both files untouched and returns both-exist when both exist, never overwrites an existing repo-config.json, returns failed with a note and leaves github.json in place when the rename throws, and never throws`, `repo-config.test.ts: a second move after a successful one returns nothing-to-move, and a symbolic-link github.json is moved as a link`
  - Fixtures: `temporary directory standing in for ~/.insrc`, `a rename seam that throws`
- **integration** — Prove the renamed store and the renamed callers behave as before, and that no old name is left.
  - Subjects: `repo-config.test.ts: after a boot move, repo.settings.get and repo.settings.set through the real handlers read and write repo-config.json and keep the repo's entry`, `repo-config.test.ts: a source scan finds no file under src that names INSRC_GITHUB_CONFIG, githubConfigPath, github-store, GithubConfigFile, GithubEntry, loadGithubConfigFile or GithubConfigError`, `repo-config.test.ts: a source scan finds the GitHub-tracker names (resolveGithubConfig, resolveGithubConfigFromFile, resolveBranchPattern, resolveStrictTrackerTarget, parseGithubRemoteUrl) still exported from github.ts and the file layer exported from repo-config.ts`, `repo-config.test.ts: a source check that src/daemon/index.ts calls moveLegacyRepoConfig after the directories are ensured and before the database is opened, inside a try/catch and only when INSRC_REPO_CONFIG is unset`, `repo-settings.test.ts and the existing tracker, build-step and daemon tests that named the old names, updated to the new names, still pass`, `build-commands-doc.test.ts: docs/daemon.md and the other live docs name repo-config.json and INSRC_REPO_CONFIG in line with the code`
  - Fixtures: `temporary repo-config.json via INSRC_REPO_CONFIG`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `repo-config.test.ts: repoConfigPath returns the INSRC_REPO_CONFIG value when it is set and non-empty, PATHS.insrc/repo-config.json otherwise, and ignores INSRC_GITHUB_CONFIG`, `repo-config.test.ts: a source scan finds no file under src that names INSRC_GITHUB_CONFIG, githubConfigPath, github-store, GithubConfigFile, GithubEntry, loadGithubConfigFile or GithubConfigError` |
| `ac2` | `repo-config.test.ts: moveLegacyRepoConfig renames github.json to repo-config.json when only the old file exists, leaving no github.json and the same content byte for byte, and returns nothing-to-move when there is no github.json`, `repo-config.test.ts: moveLegacyRepoConfig leaves both files untouched and returns both-exist when both exist, never overwrites an existing repo-config.json, returns failed with a note and leaves github.json in place when the rename throws, and never throws`, `repo-config.test.ts: a second move after a successful one returns nothing-to-move, and a symbolic-link github.json is moved as a link` |
| `ac3` | `repo-config.test.ts: after a boot move, repo.settings.get and repo.settings.set through the real handlers read and write repo-config.json and keep the repo's entry`, `repo-config.test.ts: a source scan finds the GitHub-tracker names (resolveGithubConfig, resolveGithubConfigFromFile, resolveBranchPattern, resolveStrictTrackerTarget, parseGithubRemoteUrl) still exported from github.ts and the file layer exported from repo-config.ts`, `repo-settings.test.ts and the existing tracker, build-step and daemon tests that named the old names, updated to the new names, still pass` |
| `ac4` | `repo-config.test.ts: a source scan finds no file under src that names INSRC_GITHUB_CONFIG, githubConfigPath, github-store, GithubConfigFile, GithubEntry, loadGithubConfigFile or GithubConfigError`, `build-commands-doc.test.ts: docs/daemon.md and the other live docs name repo-config.json and INSRC_REPO_CONFIG in line with the code` |
| `ac5` | `repo-config.test.ts: a source check that src/daemon/index.ts calls moveLegacyRepoConfig after the directories are ensured and before the database is opened, inside a try/catch and only when INSRC_REPO_CONFIG is unset` |

## 6. Migration

**State before:** The per-repository settings live in ~/.insrc/github.json. Its path comes from githubConfigPath with the INSRC_GITHUB_CONFIG override, and its types, loader and error sit in src/workflow/config/github.ts beside the GitHub-tracker resolution (src/workflow/config/github.ts:68-238). The strict reader and verified writer are in src/workflow/config/github-store.ts. About 110 files, 36 of them tests, name these (see the s1 bundles). The daemon's boot ensures the directories at step 2 and reads the file only later, after the registry and tools are in place (src/daemon/index.ts:137-312).

**State after:** The file is ~/.insrc/repo-config.json, located by repoConfigPath with the INSRC_REPO_CONFIG override. Its types, loader and error live in the new src/workflow/config/repo-config.ts; the store is src/workflow/config/repo-config-store.ts; github.ts keeps only the GitHub-tracker code. At the first boot of the updated daemon, straight after the directories are ensured, an existing github.json is renamed to repo-config.json before anything reads it. Callers, tests, user-facing messages and live docs use the new names. The old names are gone, and how the file is read and written is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Create repo-config.ts holding the path function, the file and entry types, the loader and the error class under their new names; make github.ts import them and keep only the tracker-specific code under its existing names. — ↩ rollbackable
2. Rename the store module to repo-config-store.ts and point its default path at repoConfigPath; update every import in the daemon, workflow, build step and CLI modules, the artifact-write inventory entry, and the user-facing messages and checklist title that name the file. — ↩ rollbackable
3. Add the legacy move beside the store and call it from the daemon's boot straight after the directories are ensured, only when INSRC_REPO_CONFIG is unset, inside a try/catch that logs. — ↩ rollbackable
4. Update the 36 test files and the three Kotlin sources that name the old variable or file to the new names, and add a source scan that fails when any file under src still names an old identifier. — ↩ rollbackable
5. Update the live documentation (docs/daemon.md, docs/workflow.md, docs/installation.md, docs/index.html and the plans under docs/plans) to the new file and variable names; leave approved Story and Epic records under docs/standalone and docs/epics as they are. — ↩ rollbackable
6. At the first boot of the updated daemon, the existing github.json is renamed to repo-config.json once; reverting the daemon afterwards means renaming the file back by hand, because the older daemon reads github.json and would see no settings. — ✕ non-rollbackable

**Backward compat:** No daemon RPC method, parameter or reply changes: repo.settings.*, repo.buildDefaults.migrate and the IDE and terminal clients that use them are unaffected. What breaks is outside the IPC: INSRC_GITHUB_CONFIG is no longer read, and anything outside the repo that reads ~/.insrc/github.json directly finds it gone after the first boot. The file's content and shape are unchanged. An older daemon started after the move reads no github.json and sees empty settings; renaming the file back restores it.

## 7. Alternatives considered

### 7.1 a1: Split the file layer into repo-config.ts, rename the store, move the old file at boot step 2 — **CHOSEN**

A new repo-config.ts holds the path function, types, loader and error; repo-config-store.ts is the renamed store; github.ts keeps only tracker resolution; an existing github.json is moved at boot step 2.

Create src/workflow/config/repo-config.ts holding what is not GitHub-specific today in github.ts: repoConfigPath (default PATHS.insrc/repo-config.json, override INSRC_REPO_CONFIG, the old variable no longer read), RepoConfigEntry and RepoConfigFile (renamed from GithubEntry and GithubConfigFile), loadRepoConfigFile and RepoConfigError. Rename github-store.ts to repo-config-store.ts with its readers, merge and writer unchanged in behaviour. github.ts keeps only the tracker-specific code (TrackerAdapter, ResolvedGithubConfig and its source type, resolveGithubConfig, resolveGithubConfigFromFile, resolveBranchPattern, resolveStrictTrackerTarget, parseGithubRemoteUrl, parseGitRemoteOwnerRepo) and imports the file layer from repo-config.ts. Add a small function in the store module that, when repo-config.json is absent and github.json exists beside it, renames the old file to the new name (one atomic rename, nothing left behind, never overwriting an existing repo-config.json), and call it from the daemon's boot right after the directories are ensured (step 2) and before any reader. Update every caller, test, user-facing message, the artifact-write inventory entry and the live docs to the new names. No aliases and no fallback for the old names.

### 7.2 a2: Rename the identifiers in place; keep the file layer inside github.ts

Rename the file, the path function, the env var and the types, and rename github-store.ts, but leave the file layer where it is in github.ts.

Do the renames of a1 (file name, repoConfigPath, INSRC_REPO_CONFIG, the store module, the types, the loader and error) and the same boot move, but leave them defined in src/workflow/config/github.ts, so that module keeps both the settings-file layer and the tracker resolution.

**Rejected because:** Smaller, but leaves the naming problem in the module that holds the file layer, so a split would still be owed (k1 partial).

### 7.3 a3: Rename, with deprecated aliases and an env-var fallback for one release

As a1, plus githubConfigPath and the old env var kept as deprecated aliases for one release.

As a1, but githubConfigPath stays exported as a deprecated alias of repoConfigPath and INSRC_GITHUB_CONFIG is read as a fallback when INSRC_REPO_CONFIG is unset, to be removed in a later release.

**Rejected because:** Adds a compatibility layer that was explicitly decided against (violates k3).

### 7.4 a4: No boot move: readers fall back to github.json

Read repo-config.json and, when it is absent, github.json; write only the new name.

The strict reader tries repo-config.json and, if it does not exist, reads github.json; the first write creates repo-config.json from what was read and leaves github.json in place. No boot step.

**Rejected because:** Spreads a fallback over every reader and contradicts the decision to move the file (violates k4).

## 8. References

- **[[c1]]** `code` `src/workflow/config/github.ts:161` — "s1 bundle 1: the names that carry 'github' for the settings file and where they are defined (also lines 49, 68, 111, 171, 190, 216, 238 and github-store.ts)"
- **[[c2]]** `code` `src/daemon/repo-settings.ts:21` — "s1 bundle 2: who calls githubConfigPath, the store and the loaders outside tests (also handler-runtime.ts:97, tracker-setup-handlers.ts:64, git-hooks-methods.ts:69, command-setting.ts:41, tracker/setu"
- **[[c3]]** `code` `src/workflow/config/github.ts:162` — "s1 bundle 3: the INSRC_GITHUB_CONFIG override, who sets it, and how the daemon is the only reader and writer"
- **[[c4]]** `code` `src/daemon/index.ts:137` — "s1 bundle 4: the daemon's boot order (also lines 112, 189, 260-266, 291, 312, 387-407)"
- **[[c5]]** `code` `src/daemon/__tests__/repo-settings.test.ts` — "s1 bundle 5: tests and docs the rename and the move would extend or must update (also build-commands-doc.test.ts, handler-runtime.test.ts, docs/daemon.md)"

## 9. Open questions

- Confirm the constraints k1-k6 this LLD authored: the settings file, path function, variable, store and types lose 'github'; the GitHub-tracker names keep theirs; the old variable is dropped with no alias; the existing file is moved atomically once at boot, before any reader, never over a repo-config.json, with no copy kept; behaviour and the repo.settings.* method names are otherwise unchanged; live docs and tests are updated while approved Story records are left alone. Two of these rest on answers I assumed to my questions 2 and 3 (drop the old variable outright; rename the file and keep no copy), so please confirm them.
- Confirm the acceptance criteria ac1-ac5 this LLD authored, since the Story carries none: ac1 the file, path function, variable, store and types carry the new names and nothing under src still names the old ones; ac2 an existing github.json is moved once at the first boot to repo-config.json without overwriting anything, and a failure or both files existing is logged and loses nothing; ac3 reading and writing the settings, and the GitHub-tracker code, behave as before; ac4 the live docs and tests use the new names; ac5 the move runs after the directories are ensured and before any reader, and never blocks startup.
- Decide whether the store's error code string 'github-json-unreadable' should be renamed too (for example to 'repo-config-unreadable'). I kept it, so no client sees a changed code, but it still names the old file. Renaming it changes a string any client matching on it would see.
- Confirm the new symbol names and modules (repoConfigPath, loadRepoConfigFile, RepoConfigFile, RepoConfigEntry, RepoConfigError, moveLegacyRepoConfig, LegacyRepoConfigMove, src/workflow/config/repo-config.ts, src/workflow/config/repo-config-store.ts). They do not exist yet, so no analyzer bundle can cite them.
- Confirm the citation mapping: c1 is the bundle on the names and where they are defined, c2 the bundle on who calls them, c3 the bundle on the override variable and the daemon-only access, c4 the boot-order bundle, c5 the tests-and-docs bundle (invariant sources use these). The facts came from reading the source and text searches, not an analyzer pass.
- Order of work: this Story is built first, and LLD-d70697dff9f56b4a-s1 (the schemaVersion boot migration) is then retargeted at repo-config.json; that LLD still names github.json and is not approved.

## Resolved questions

- `qf90f1f4b` — Confirm the constraints k1-k6 this LLD authored: the settings file, path function, variable, store and types lose 'github'; the GitHub-tracker names keep theirs; the old variable is dropped with no alias; the existing file is moved atomically once at boot, before any reader, never over a repo-config.json, with no copy kept; behaviour and the repo.settings.* method names are otherwise unchanged; live docs and tests are updated while approved Story records are left alone. Two of these rest on answers I assumed to my questions 2 and 3 (drop the old variable outright; rename the file and keep no copy), so please confirm them.
  - **resolved**: Confirm all k1–k6 — The user asked on 2026-11-20 to go ahead with the proposed resolutions. The old variable is dropped with no alias and the existing file is moved once with no copy kept. Correction to the LLD's backwardCompat line: a search of scripts, CI, package.json, plugin main sources, shell profiles, Claude settings, running process environments and the installed daemon found nothing outside src and docs that sets INSRC_GITHUB_CONFIG or reads github.json. The real exposures are the user's own ~/.insrc/github.json (moved at the first boot after the update; github.json.bak-before-fake-repo-removal is not touched), live docs that tell users to hand-write the file (docs/workflow.md, docs/installation.md, docs/index.html, which this Story updates; a user who still creates github.json after the move has it ignored, logged only as both-exist at the next boot), and two JetBrains Kotlin test fixtures that name github.json and the error code. _(2026-11-20T16:38:15.093Z)_
- `q100118bb` — Confirm the acceptance criteria ac1-ac5 this LLD authored, since the Story carries none: ac1 the file, path function, variable, store and types carry the new names and nothing under src still names the old ones; ac2 an existing github.json is moved once at the first boot to repo-config.json without overwriting anything, and a failure or both files existing is logged and loses nothing; ac3 reading and writing the settings, and the GitHub-tracker code, behave as before; ac4 the live docs and tests use the new names; ac5 the move runs after the directories are ensured and before any reader, and never blocks startup.
  - **resolved**: Adopt ac1–ac5 — The user asked on 2026-11-20 to go ahead. ac1 prohibits the identifiers INSRC_GITHUB_CONFIG, githubConfigPath, github-store, GithubConfigFile, GithubEntry, loadGithubConfigFile and GithubConfigError under src; ac5 means the move runs synchronously after the directories are ensured and, being one rename inside a try/catch, cannot block or fail startup. The Story's file list also includes two JetBrains Kotlin test fixtures (jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSectionTest.kt and InsrcSettingsTrackerTest.kt) and the three live docs that tell users to hand-write the file, with the docs noting that the file is now repo-config.json and that a hand-created github.json is ignored. _(2026-11-20T16:39:23.843Z)_

## Citations

- **[[c1]]** `code` `src/workflow/config/github.ts:161` — "s1 bundle 1: the names that carry 'github' for the settings file and where they are defined (also lines 49, 68, 111, 171, 190, 216, 238 and github-store.ts)"
- **[[c2]]** `code` `src/daemon/repo-settings.ts:21` — "s1 bundle 2: who calls githubConfigPath, the store and the loaders outside tests (also handler-runtime.ts:97, tracker-setup-handlers.ts:64, git-hooks-methods.ts:69, command-setting.ts:41, tracker/setu"
- **[[c3]]** `code` `src/workflow/config/github.ts:162` — "s1 bundle 3: the INSRC_GITHUB_CONFIG override, who sets it, and how the daemon is the only reader and writer"
- **[[c4]]** `code` `src/daemon/index.ts:137` — "s1 bundle 4: the daemon's boot order (also lines 112, 189, 260-266, 291, 312, 387-407)"
- **[[c5]]** `code` `src/daemon/__tests__/repo-settings.test.ts` — "s1 bundle 5: tests and docs the rename and the move would extend or must update (also build-commands-doc.test.ts, handler-runtime.test.ts, docs/daemon.md)"
