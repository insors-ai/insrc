<!-- insrc:artifact PLAN-8ff6d364012cff02-s1 -->

# Plan: STORY-8ff6d364012cff02-s1

## Summary

**Epic:** `rename-github-json-repo-config-json`
**LLD run:** `wf-1795177657841-isaezi`
**LLD effective hash:** `8ff6d364012c...`

The build renames the per-repository settings file and everything that carries its old name in one compile-safe step, then adds the first-boot move with its tests, the path-function test, the source scans and the settings round trip, the JetBrains test fixtures, and the live documentation. The rename is one large task because the type check covers the tests and no aliases are allowed; the rest are small and independent of each other once the rename is in.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Rename the settings file layer, store, path function, variable and error code across the code and tests | L | — | — | integration: repo-settings.test.ts and the existing tracker, build-step and daemon tests that named the old names, updated to the new names, still pass; integration: the module-state and session-source inventory tests pass against the two fixtures edited only for the renamed paths and names | [[c1]] [[c2]] [[c4]] [[c5]] |
| 2 | **`t2`** Add the first-boot move of github.json to repo-config.json, with its tests | M | — | `t1` | unit: repo-config.test.ts: moveLegacyRepoConfig renames github.json to repo-config.json when only the old file exists, leaving no github.json and the same content byte for byte, and returns nothing-to-move when there is no github.json; unit: repo-config.test.ts: moveLegacyRepoConfig leaves both files untouched and returns both-exist when both exist, never overwrites an existing repo-config.json, returns failed with a note and leaves github.json in place when the rename throws, and never throws; unit: repo-config.test.ts: a second move after a successful one returns nothing-to-move, and a symbolic-link github.json is moved as a link; integration: repo-config.test.ts: a source check that src/daemon/index.ts calls moveLegacyRepoConfig after the directories are ensured and before the database is opened, inside a try/catch and only when INSRC_REPO_CONFIG is unset | [[c1]] [[c3]] [[c4]] [[c5]] |
| 3 | **`t3`** Add the path-function test, the source scans and the settings round trip | M | — | `t1`, `t2` | unit: repo-config.test.ts: repoConfigPath returns the INSRC_REPO_CONFIG value when it is set and non-empty, PATHS.insrc/repo-config.json otherwise, and ignores INSRC_GITHUB_CONFIG; integration: repo-config.test.ts: after a boot move, repo.settings.get and repo.settings.set through the real handlers read and write repo-config.json and keep the repo's entry; integration: repo-config.test.ts: a source scan finds no file under src that names INSRC_GITHUB_CONFIG, githubConfigPath, github-store, GithubConfigFile, GithubEntry, loadGithubConfigFile or GithubConfigError; integration: repo-config.test.ts: a source scan finds the GitHub-tracker names (resolveGithubConfig, resolveGithubConfigFromFile, resolveBranchPattern, resolveStrictTrackerTarget, parseGithubRemoteUrl) still exported from github.ts and the file layer exported from repo-config.ts | [[c3]] [[c4]] |
| 4 | **`t4`** Update the JetBrains test fixtures and comments | S | — | `t1` | smoke: the JetBrains settings tests (PerRepoSectionTest and InsrcSettingsTrackerTest) pass under JDK 21 with the new file name and error code in their sample data | [[c3]] [[c5]] |
| 5 | **`t5`** Update the live documentation and the doc test | M | — | `t2` | integration: build-commands-doc.test.ts: docs/daemon.md and the other live docs name repo-config.json and INSRC_REPO_CONFIG in line with the code | [[c4]] [[c5]] |

### 1.1 TASK-8ff6d364012cff02-s1-t1 — Rename the settings file layer, store, path function, variable and error code across the code and tests

In this order inside the one task: create src/workflow/config/repo-config.ts holding repoConfigPath (default repo-config.json, override INSRC_REPO_CONFIG, the old variable not read), RepoConfigFile, RepoConfigEntry, loadRepoConfigFile and RepoConfigError, moved out of github.ts, which keeps only the tracker-specific code and imports them; rename github-store.ts to repo-config-store.ts with its default path on repoConfigPath and the error code renamed to repo-config-unreadable; update every importer and user-facing message in the 20 non-test sources and the artifact-write inventory entry; then the 37 test files and the two pinned JSON fixtures (module-state-inventory.json, session-source-inventory.json). It is one task because the type check covers the tests and the plan forbids aliases, so a partial rename would not compile.

**Acceptance checks:**
- The project type-checks with no reference to githubConfigPath, github-store, GithubConfigFile, GithubEntry, loadGithubConfigFile, GithubConfigError or INSRC_GITHUB_CONFIG under src.
- resolveGithubConfig, resolveGithubConfigFromFile, resolveBranchPattern, resolveStrictTrackerTarget, TrackerAdapter and the remote-url parsers are still exported from github.ts under their names and behave as before.
- The store's reader, merge and writer are unchanged in behaviour and report the error code repo-config-unreadable.
- Every test file that named the old names, updated to the new names, passes, as do the module-state and session-source inventory tests that read the two fixtures.
- The two fixtures are edited only for the renamed paths and names; the inventory tests that read them pass with no other change to their content.

### 1.2 TASK-8ff6d364012cff02-s1-t2 — Add the first-boot move of github.json to repo-config.json, with its tests

Add moveLegacyRepoConfig and LegacyRepoConfigMove beside the store, and call it from src/daemon/index.ts straight after the directories are ensured and before the database is opened, only when INSRC_REPO_CONFIG is unset, inside a try/catch that logs: rename github.json to repo-config.json when only the old file exists, touch nothing when both exist, do nothing when there is no old file, never overwrite, never throw. Write in src/workflow/config/__tests__/repo-config.test.ts the move cases (only-old, none, both, failing rename, second boot, symbolic link) and the source check on the boot call's order, guard and try/catch.

**Acceptance checks:**
- With only github.json present the move renames it to repo-config.json byte for byte and leaves no github.json; with neither present it returns nothing-to-move.
- With both files present neither is touched and the result is both-exist; a failing rename returns failed with a note, leaves github.json in place and does not throw.
- A second move after a successful one returns nothing-to-move, and a symbolic-link github.json is moved as a link.
- The boot calls the move after the directories are ensured and before the database is opened, inside a try/catch, and skips it when INSRC_REPO_CONFIG is set; the source check fails when any of these is changed.

### 1.3 TASK-8ff6d364012cff02-s1-t3 — Add the path-function test, the source scans and the settings round trip

In src/workflow/config/__tests__/repo-config.test.ts add the repoConfigPath test (the override, the default and the ignored old variable), the source scan that no old identifier remains under src (skipping its own file, and not covering the pinned fixtures' directories), the scan that the tracker names stay exported from github.ts and the file layer from repo-config.ts, and a settings round trip through the real repo.settings handlers after a boot move.

**Acceptance checks:**
- repoConfigPath returns the INSRC_REPO_CONFIG value when it is set and non-empty, PATHS.insrc/repo-config.json otherwise, and ignores INSRC_GITHUB_CONFIG.
- The old-identifier scan passes on the renamed tree and fails when one of the old identifiers is reintroduced in a source file; it skips its own file.
- The tracker-names scan fails when one of those names is renamed or moved out of github.ts.
- After a boot move, repo.settings.get and repo.settings.set read and write repo-config.json and keep the repo's entry.

### 1.4 TASK-8ff6d364012cff02-s1-t4 — Update the JetBrains test fixtures and comments

Update the two JetBrains Kotlin tests (PerRepoSectionTest.kt, InsrcSettingsTrackerTest.kt) that use the old file name and error code in sample data, and the three comments in DaemonGateway.kt, to the new names, without changing how the plugin handles the daemon's replies.

**Acceptance checks:**
- The JetBrains settings tests pass under JDK 21 with the new file name and error code in their sample data.
- No source or test under jetbrains-plugin names github.json or github-json-unreadable.

### 1.5 TASK-8ff6d364012cff02-s1-t5 — Update the live documentation and the doc test

Update docs/daemon.md, docs/workflow.md (including the shell example that writes the file by hand and the tree listing), docs/installation.md, docs/index.html and the plans under docs/plans to name repo-config.json and INSRC_REPO_CONFIG, state that an existing github.json is moved at the first boot of the updated daemon and that a github.json created by hand afterwards is ignored because the settings now live in repo-config.json, and extend build-commands-doc.test.ts to keep this section equal to the code. Approved Story and Epic records are left as they are.

**Acceptance checks:**
- The live docs name repo-config.json and INSRC_REPO_CONFIG and none of them tells a user to create github.json.
- The docs state that an existing github.json is moved at the first boot of the updated daemon and that a github.json created by hand afterwards is ignored.
- build-commands-doc.test.ts passes and fails when the docs name a different file or variable than the code.
- Approved Story and Epic records under docs/standalone and docs/epics are unchanged.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| repo-config.test.ts: repoConfigPath returns the INSRC_REPO_CONFIG value when it is set and non-empty, PATHS.insrc/repo-config.json otherwise, and ignores INSRC_GITHUB_CONFIG | `t3` |
| repo-config.test.ts: moveLegacyRepoConfig renames github.json to repo-config.json when only the old file exists, leaving no github.json and the same content byte for byte, and returns nothing-to-move when there is no github.json | `t2` |
| repo-config.test.ts: moveLegacyRepoConfig leaves both files untouched and returns both-exist when both exist, never overwrites an existing repo-config.json, returns failed with a note and leaves github.json in place when the rename throws, and never throws | `t2` |
| repo-config.test.ts: a second move after a successful one returns nothing-to-move, and a symbolic-link github.json is moved as a link | `t2` |
| repo-config.test.ts: after a boot move, repo.settings.get and repo.settings.set through the real handlers read and write repo-config.json and keep the repo's entry | `t3` |
| repo-config.test.ts: a source scan finds no file under src that names INSRC_GITHUB_CONFIG, githubConfigPath, github-store, GithubConfigFile, GithubEntry, loadGithubConfigFile or GithubConfigError | `t3` |
| repo-config.test.ts: a source scan finds the GitHub-tracker names (resolveGithubConfig, resolveGithubConfigFromFile, resolveBranchPattern, resolveStrictTrackerTarget, parseGithubRemoteUrl) still exported from github.ts and the file layer exported from repo-config.ts | `t3` |
| repo-config.test.ts: a source check that src/daemon/index.ts calls moveLegacyRepoConfig after the directories are ensured and before the database is opened, inside a try/catch and only when INSRC_REPO_CONFIG is unset | `t2` |
| repo-settings.test.ts and the existing tracker, build-step and daemon tests that named the old names, updated to the new names, still pass | `t1` |
| build-commands-doc.test.ts: docs/daemon.md and the other live docs name repo-config.json and INSRC_REPO_CONFIG in line with the code | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD-8ff6d364012cff02-s1 contractDetails: repoConfigPath, loadRepoConfigFile, moveLegacyRepoConfig, readRepoEntry and writeRepoEntryKeys`
- **[[c2]]** `prior-artifact` `LLD-8ff6d364012cff02-s1 dataModelChanges: repo-config.json, RepoConfigFile, RepoConfigEntry, INSRC_REPO_CONFIG, LegacyRepoConfigMove and the unchanged repo.settings methods`
- **[[c3]]** `prior-artifact` `LLD-8ff6d364012cff02-s1 errorPaths: the failed rename, both files existing, the old variable and old file used outside, and the invariants`
- **[[c4]]** `prior-artifact` `LLD-8ff6d364012cff02-s1 testStrategy: the unit and integration subjects and the acceptance mapping ac1 to ac5`
- **[[c5]]** `prior-artifact` `LLD-8ff6d364012cff02-s1 migration: the six migration steps and the backward-compatibility notes`
