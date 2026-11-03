<!-- insrc:artifact PLAN-9ac84abac177b399-s1 -->

# Plan: STORY-9ac84abac177b399-s1

## Summary

**Epic:** `install-git-hooks-refresh-tracker-status`
**LLD run:** `wf-1793710750491-eyso0w`
**LLD effective hash:** `9ac84abac177...`

Building this Story makes the tracker refresh callable for a whole repository with a guard against overlap, adds the opt-in setting and a tiny hook program that never fails git, writes and removes the marked hook blocks safely on files of any shape, and exposes install, uninstall and status as daemon methods that resolve the hooks directory through the typed git tool. A final task proves real git runs the hooks, documents the feature and its limits, and compares the affected suites with a clean checkout.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Make tracker.sync repository-wide with an in-flight guard | S | — | — | integration: src/daemon/__tests__/tracker-sync-method.test.ts: tracker.sync without an epicHash refreshes every Epic once, a second call while one runs is skipped, and a call with an epicHash is unchanged | [[c1]] [[c2]] |
| 2 | **`t2`** Add the gitHooks setting row | S | — | — | unit: src/daemon/__tests__/repo-settings.test.ts: the gitHooks setting reads false when absent, is validated as a boolean and round-trips through github.json | [[c3]] [[c4]] |
| 3 | **`t3`** Add the hook entry program | S | — | — | unit: src/bin/__tests__/insrc-git-hook.test.ts: the hook entry exits 0 when the daemon is not running, times out, answers an error or names an unregistered repository | [[c5]] [[c6]] |
| 4 | **`t4`** Write and remove the marked hook block | M | — | — | unit: src/daemon/git-hooks/__tests__/hook-block.test.ts: the hook block is written into an absent, an empty, a husky-style and a user-written hook file and the existing content is kept byte for byte; unit: src/daemon/git-hooks/__tests__/hook-block.test.ts: applying is idempotent and removing takes only the marked block and deletes a file that held nothing else; unit: src/daemon/git-hooks/__tests__/hook-block.test.ts: a hook file that cannot be written is reported with its reason and left unchanged | [[c7]] [[c8]] |
| 5 | **`t5`** Inspect a hook file | S | — | `t4` | unit: src/daemon/git-hooks/__tests__/hook-inspect.test.ts: inspection reports present, absent, foreign, early-exit and stale-entry files | [[c7]] [[c8]] |
| 6 | **`t6`** Add the install, uninstall and status daemon methods | M | — | `t2`, `t4`, `t5` | integration: src/daemon/__tests__/git-hooks-methods.test.ts: repo.gitHooks.install, uninstall and status refuse an unregistered repository, write only through the daemon, and keep the gitHooks setting equal to what is installed; integration: src/daemon/__tests__/git-hooks-methods.test.ts: a failing hook file leaves the other hook installed and is reported with its reason | [[c8]] [[c9]] [[c10]] |
| 7 | **`t7`** Prove real git runs the hooks, document the feature and run the affected suites | M | — | `t1`, `t3`, `t6` | integration: src/daemon/__tests__/git-hooks-real-git.test.ts: a real git pull and a real git pull --rebase run the installed hooks and git exits 0 even when the hook entry is missing or the daemon is down | [[c1]] [[c7]] [[c10]] |

### 1.1 TASK-9ac84abac177b399-s1-t1 — Make tracker.sync repository-wide with an in-flight guard

Let handleTrackerSync accept a call without an epicHash and refresh every Epic through refreshTrackerStatus, summarising the report in the existing result shape; a second repository-wide call for the same repository while one runs returns a skipped result at once. A call with an epicHash is unchanged.

**Acceptance checks:**
- tracker.sync with an epicHash returns exactly what it returned before
- tracker.sync without an epicHash refreshes every Epic once and summarises synced, skipped or failed with the joined reasons
- A second repository-wide call for the same repository while one is running returns a skipped result without starting another, and a call after the first ends runs normally

### 1.2 TASK-9ac84abac177b399-s1-t2 — Add the gitHooks setting row

Add the boolean gitHooks row (default false) to the repository tracker fields and the gitHooks key to GithubEntry, and extend the settings, completeness and round-trip tests so a configuration file written with the key reads back and one without it reads false.

**Acceptance checks:**
- repo.settings.get returns false for a repository whose entry has no gitHooks key, and repo.settings.set accepts true and false and refuses a non-boolean
- A github.json written with gitHooks true reads back with it and keeps every other key
- The Repos pane completeness test and the settings tests pass with the new row

### 1.3 TASK-9ac84abac177b399-s1-t3 — Add the hook entry program

Add the small non-interactive program under src/bin that calls the daemon's tracker.sync with the repository path and no epicHash over the shared rpc client with a short timeout and always exits 0; list it with the other bins so the build compiles it into out/bin.

**Acceptance checks:**
- The entry exits 0 when the daemon is not running, when the call times out, when the daemon answers an error and when the repository is not registered
- The entry imports only the rpc client and the paths module and runs one rpc call with a timeout
- The build compiles the entry into out/bin and package.json lists it

### 1.4 TASK-9ac84abac177b399-s1-t4 — Write and remove the marked hook block

Add the module that builds the marked hook block for a given hook entry path, applies it to a hook file of any starting shape (absent, empty, husky-style, user-written, already carrying the block) through a temporary file and a rename keeping or setting the executable mode, and removes only the marked block, deleting a file that held nothing else.

**Acceptance checks:**
- The block is written into an absent, an empty, a husky-style and a user-written file and the existing content is kept byte for byte
- Applying twice leaves one block, removing leaves the original content, and a file that held only the block is deleted
- A file that cannot be written is reported with its reason and left unchanged, and the file mode is kept or made executable

### 1.5 TASK-9ac84abac177b399-s1-t5 — Inspect a hook file

Add the inspection the status method uses: for a hook file report whether our block is present, whether other content is present, whether the last non-empty line of foreign content exits early, and whether the entry path recorded in our block differs from the current one.

**Acceptance checks:**
- Inspection reports present, absent and foreign-only files correctly
- A foreign last line that is an exit or an exec is flagged
- A block whose recorded entry path differs from the current one is reported as stale

### 1.6 TASK-9ac84abac177b399-s1-t6 — Add the install, uninstall and status daemon methods

Add repo.gitHooks.install, repo.gitHooks.uninstall and repo.gitHooks.status: each refuses an unregistered repository, resolves the hooks directory with the typed git_rev_parse gitPath input, applies, removes or inspects the blocks for post-merge and post-rewrite through the block module, sets the gitHooks setting through the daemon's settings handler, and returns data without throwing. Register them in the handler table, the method-class table and the repository-call audit and extend the recorded handler key-set test.

**Acceptance checks:**
- An unregistered repository and a path that is not a git repository are refused with a reason and nothing is written
- Install writes both blocks and sets gitHooks true, a hook file that fails leaves the other installed and is reported, and uninstall removes the blocks and sets it false
- The hooks directory comes from git_rev_parse and honours core.hooksPath, the three methods are in all three registries, and handler-runtime.test.ts records them

### 1.7 TASK-9ac84abac177b399-s1-t7 — Prove real git runs the hooks, document the feature and run the affected suites

Add the integration cases where a real git pull and a real git pull --rebase in a temporary repository run the installed hooks and exit 0 even when the entry or the daemon is missing, document the feature and its limits in docs/plans/team-workflow.md, then run the affected suites once in the foreground by area and record the comparison with a clean base checkout.

**Acceptance checks:**
- A real pull and a real pull --rebase run the post-merge and post-rewrite hooks and git exits 0 with the entry missing and with the daemon down
- docs/plans/team-workflow.md states the feature, the terminal-push gap, the hook managers that regenerate files and the explicit refresh
- The tracker, daemon method, settings and handler-runtime suites pass or fail identically to a clean base checkout, recorded in a sweep file

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| the hook block is written into an absent, an empty, a husky-style and a user-written hook file and an existing hook's content is kept byte for byte | `t4` |
| install is idempotent and uninstall removes only the marked block and deletes a file that held nothing else | `t4` |
| a hook file that cannot be written leaves the other hook installed and the failing one reported with its reason | `t4`, `t6` |
| the hook entry exits 0 when the daemon is not running, times out, answers an error or names an unregistered repository | `t3` |
| a real git pull and a real git pull --rebase in a temporary repository run the installed post-merge and post-rewrite hooks and git exits 0 even when the hook entry is missing or the daemon is down | `t7` |
| repo.gitHooks.install, uninstall and status refuse an unregistered repository, write only through the daemon, and keep the gitHooks setting equal to what is installed | `t6` |
| tracker.sync without an epicHash refreshes every Epic once, a second call while one runs is skipped, and a call with an epicHash is unchanged | `t1` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contract: handleTrackerSync and refreshTrackerStatus, the repository-wide refresh`
- **[[c2]]** `prior-artifact` `LLD s1 data model: tracker.sync (epicHash now optional), and the overlapping-refresh error case`
- **[[c3]]** `prior-artifact` `LLD s1 data model: REPO_TRACKER_FIELDS (the gitHooks row)`
- **[[c4]]** `prior-artifact` `LLD s1 migration step 2, backward compatibility, and self-review F2`
- **[[c5]]** `prior-artifact` `LLD s1 data model: Hook entry (src/bin, compiled into out/bin)`
- **[[c6]]** `prior-artifact` `LLD s1 contract: rpc, and the daemon-not-running error case`
- **[[c7]]** `prior-artifact` `LLD s1 data model: Git hook block (post-merge, post-rewrite)`
- **[[c8]]** `prior-artifact` `LLD s1 error paths: unwritable hook file, dropped block, early-exit foreign content, and self-review F5`
- **[[c9]]** `prior-artifact` `LLD s1 data model: Daemon install, uninstall and status methods (repo.gitHooks.*)`
- **[[c10]]** `prior-artifact` `LLD s1 migration step 4, and self-review F1 and F4`
