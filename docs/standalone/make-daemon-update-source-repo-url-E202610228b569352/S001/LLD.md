<!-- insrc:artifact LLD-8b5693528b025a55-s1 -->

# LLD: E202610228b569352:S001

## Summary

**Epic:** `make-daemon-update-source-repo-url`
**HLD base run:** `wf-1792670042267-tcco05`
**HLD effective hash:** `8b5693528b02...`

The daemon update takes its git remote URL and branch from two optional keys in ~/.insrc/config.json (daemonUpdate.repoUrl and daemonUpdate.branch), so a fork or a feature branch can be deployed. One validated reader serves the daemon.update IPC helper and the CLI update; the helper script gets a --repo-url flag, and a switch to another branch is a clean checkout of origin/<branch>. Empty or absent keys leave today's behaviour unchanged.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `readUpdateSource`

```typescript
function readUpdateSource(configPath?: string): UpdateSource
```

**Parameters:**
- `configPath: string` _(optional)_ — the config file to read; defaults to PATHS.config

**Returns:** `UpdateSource` — { repoUrl?: string; branch?: string } with only the keys that are set and valid; an absent file or empty keys give {}

**Errors:**
- `UpdateSourceError` when the file is not valid JSON, daemonUpdate is not an object, or a value is not a string or fails validation (a URL that starts with '-', has whitespace or control characters, or is not an https, ssh, git or file URL, an scp-style git@host:path, or an absolute path; a branch outside the conservative ref pattern, containing '..', '//', a trailing '/' or '.lock')

**Postconditions:**
- a returned repoUrl and branch are safe to pass as single git arguments
- the file is not modified

### 2.2 `launchUpdate`

```typescript
function launchUpdate(deps?: UpdateRunnerDeps): DaemonUpdateResult
```

**Parameters:**
- `deps: UpdateRunnerDeps` _(optional)_ — test seams; gains readSource for the config reader

**Returns:** `DaemonUpdateResult` — the launch acknowledgement, unchanged

**Errors:**
- `Error` when 'daemon.update: invalid daemonUpdate config: <reason>' when the reader throws; nothing is spawned and no marker is written

**Preconditions:**
- the helper script resolves

**Postconditions:**
- the detached helper is spawned with `<daemonCtl> restart [--repo-url <url>] [--branch <name>]`, a flag present only for a key that is set

### 2.3 `runDetachedUpdate`

```typescript
function runDetachedUpdate(daemonCtl: string, deps?: UpdateRunnerDeps, subcommand?: string, extraArgs?: readonly string[]): Promise<DaemonUpdateOutcome>
```

**Parameters:**
- `extraArgs: readonly string[]` _(optional)_ — flags appended after the subcommand

**Returns:** `Promise<DaemonUpdateOutcome>` — unchanged

**Postconditions:**
- extraArgs reach daemon-ctl.sh after the subcommand; the detached entry takes them from argv[4..]

### 2.4 `update`

```typescript
function update(opts: UpdateOptions, onLog: LogFn): Promise<MaintenanceResult>
```

**Parameters:**
- `opts: UpdateOptions` — gains repoUrl?: string; branch keeps winning over the config

**Returns:** `Promise<MaintenanceResult>` — unchanged

**Errors:**
- `MaintenanceResult.error` when 'invalid daemonUpdate config: <reason>'; 'working tree has uncommitted changes' or 'HEAD has commits no remote branch has' when switching branch or remote; 'HEAD diverged from origin/<branch>' as today

**Preconditions:**
- DAEMON_ROOT is a git checkout

**Postconditions:**
- with no repoUrl and no branch configured the sequence is the one that ran before this Story

### 2.5 `daemon-ctl.sh --repo-url`

```typescript
scripts/daemon-ctl.sh [--repo-url <url>] [--branch <name>] start|restart|update
```

**Parameters:**
- `--repo-url: string` _(optional)_ — the remote origin must point at before the fetch

**Returns:** `exit code` — 0 success; 3 for a dirty tree, local-only commits or a diverged HEAD; 1 for a malformed flag

**Errors:**
- `exit 1` when --repo-url without a value, or a value that starts with '-'

**Postconditions:**
- origin's URL equals --repo-url when given (set with `git remote set-url origin`, logged)
- when --branch differs from the current branch the checkout is `git checkout -B <branch> origin/<branch>` after the tree and local-commit checks

## 3. Data model changes

### 3.1 `~/.insrc/config.json daemonUpdate` — new

Two optional string keys: daemonUpdate.repoUrl and daemonUpdate.branch. Empty string or absent means 'keep the checkout as it is'. Both get CONFIG_CATALOG rows (group General, default empty string) so the settings list shows them and the boot reconcile keeps them.

```
daemonUpdate: { repoUrl: string; branch: string }
```

**Call sites:**
- `src/config/config-catalog.ts`
- `src/shared/update-source.ts`
- `src/daemon/update-runner.ts`
- `src/cli/services/maintenance.ts`

### 3.2 `UpdateOptions` — field-add

repoUrl?: string, beside the existing branch?: string; both override the config when given.

```
+ readonly repoUrl?: string
```

**Call sites:**
- `src/cli/services/maintenance.ts`

### 3.3 `UpdateRunnerDeps` — field-add

readSource?: () => UpdateSource, the config reader seam.

```
+ readSource?: () => UpdateSource
```

**Call sites:**
- `src/daemon/update-runner.ts`
- `src/daemon/__tests__/update-runner.test.ts`

## 4. Error paths

**Error cases**

- **The config has an invalid value (a URL that starts with '-' or has whitespace, a branch with '..', a non-string, or daemonUpdate that is not an object)** (recoverable)
  - Detection: readUpdateSource validates each value and throws UpdateSourceError naming the key and the reason
  - Response: launchUpdate throws 'daemon.update: invalid daemonUpdate config: <reason>' before anything is spawned; the CLI update returns { ok: false, error } before the first git command
  - User impact: The update does not start and the message says which key to fix
- **config.json is not valid JSON** (recoverable)
  - Detection: JSON.parse throws inside readUpdateSource
  - Response: UpdateSourceError 'config.json cannot be read as JSON' and the same refusals as above
  - User impact: The update refuses rather than running against the checkout's current branch with a config nobody could read
- **The working tree has uncommitted changes when the branch or remote is being switched** (recoverable)
  - Detection: the existing `git diff --quiet` and `diff --cached` checks in sync_repo, and `git status --porcelain` in maintenance.ts
  - Response: exit 3 'uncommitted local changes; refusing to overwrite'; the remote URL is not changed before this check
  - User impact: Nothing is switched; the person commits or discards the changes
- **HEAD has commits that no remote branch contains and the branch is being switched** (recoverable)
  - Detection: `git branch -r --contains HEAD` prints nothing after the fetch
  - Response: exit 3 'HEAD has commits no remote branch has; refusing to switch'
  - User impact: Local work in the daemon checkout is never discarded by a checkout -B
- **The fetch fails (the URL is wrong, the branch does not exist there, or the network is down)** (recoverable)
  - Detection: `git fetch` exits non-zero
  - Response: the script dies with the fetch error (set -e); the CLI returns 'git fetch origin/<branch> failed'; origin's URL stays as set so a later run retries
  - User impact: The daemon keeps running the code it has; the outcome record says the update failed
- **The fork's branch has diverged from the checkout's HEAD while the branch name is unchanged** (recoverable)
  - Detection: merge-base --is-ancestor HEAD origin/<branch> fails, as it does today
  - Response: exit 3 'HEAD has diverged from origin/<branch>; resolve manually'
  - User impact: A person re-clones or resets the checkout; the message says so

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Neither key is set, or both are empty strings | readUpdateSource returns {}; no flag is passed; no remote or branch is touched |
| repoUrl equals origin's current URL | no `set-url` is run and nothing is logged for it |
| branch equals the current branch and repoUrl is unset | the sequence that ran before this Story: fetch, ff-only merge |
| branch names a branch that does not exist locally but exists at origin | `git checkout -B <branch> origin/<branch>` creates it from the fetched ref |
| repoUrl is an absolute local path or a file:// URL | accepted, so a fork can be tried from disk and the script test can use a temporary remote |
| opts.branch is given to the CLI update and the config also names a branch | opts.branch wins; the config's repoUrl still applies |

**Invariants to preserve**

- The update refuses a dirty tree and a diverged HEAD instead of overwriting; this Story adds checks and never removes one [[c1]]
- The IPC update spawns a detached helper that outlives the daemon and writes an outcome record; a launch failure writes no marker and spawns nothing [[c2]]
- The CLI update never starts the daemon and runs the config reconcile and steering refresh after the build [[c3]]
- Config keys the catalog declares are filled by the reconcile and keys it does not know are left alone, so an empty default means 'unset' [[c4]]

## 5. Test strategy

**Test framework:** `node:test`

**Test levels**

- **unit** — The config reader and the launcher's argument building, with injected seams and no git or daemon
  - Subjects: `update-source.test.ts: readUpdateSource returns only the set and valid keys, treats an absent file and empty strings as unset, and throws UpdateSourceError for each invalid value`, `update-runner.test.ts: launchUpdate passes --repo-url and --branch only for the keys that are set, and an invalid config spawns nothing and writes no marker`
  - Fixtures: `temporary config.json files`, `the existing spawn, lock and clock seams in update-runner.test.ts`
- **integration** — The real daemon-ctl.sh sequence against a temporary git remote and checkout, with --skip-install and --skip-build
  - Subjects: `daemon-ctl-source.test.ts: daemon-ctl.sh update with --repo-url and --branch points origin at the URL, switches to the branch and fast-forwards, and refuses a dirty tree and local-only commits`, `maintenance-source.test.ts: the CLI update applies the configured repo URL and branch the same way, and opts.branch wins over the config`
  - Fixtures: `a temporary bare remote and clone created with git in the test`, `INSRC_DAEMON_ROOT pointing at the clone`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `update-source.test.ts: readUpdateSource returns only the set and valid keys, treats an absent file and empty strings as unset, and throws UpdateSourceError for each invalid value`, `update-runner.test.ts: launchUpdate passes --repo-url and --branch only for the keys that are set, and an invalid config spawns nothing and writes no marker`, `daemon-ctl-source.test.ts: daemon-ctl.sh update with --repo-url and --branch points origin at the URL, switches to the branch and fast-forwards, and refuses a dirty tree and local-only commits`, `maintenance-source.test.ts: the CLI update applies the configured repo URL and branch the same way, and opts.branch wins over the config` |

## 6. Migration

**State before:** The daemon update always syncs the installed checkout against origin and the branch the checkout has checked out (daemon-ctl.sh sync_repo with BRANCH defaulting to HEAD's branch; maintenance.ts update with opts.branch defaulting the same way). The daemon.update IPC passes no flags, and no setting names a remote URL or a branch.

**State after:** Two optional config keys, daemonUpdate.repoUrl and daemonUpdate.branch, name the remote and branch the update follows. The IPC helper and the CLI update read them through one validated reader; daemon-ctl.sh accepts --repo-url; a switch to another branch is a clean checkout of origin/<branch>. With the keys empty or absent the behaviour is the one before.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the two catalog rows with empty-string defaults; the next boot reconcile writes them into config.json as empty strings, which mean unset — ↩ rollbackable
2. Ship the reader, the launcher and CLI changes and the new script flag; nothing changes until a key is set — ↩ rollbackable
3. The owner sets daemonUpdate.branch (and repoUrl for a fork) in config.json; the next update switches the checkout — ↩ rollbackable

**Backward compat:** No public API changes. The script keeps every existing flag and its exit codes; --repo-url is additive. UpdateOptions and UpdateRunnerDeps gain optional fields. An older daemon that does not know the keys ignores them, and the reconcile of an older build leaves unknown keys alone.

## 7. Alternatives considered

### 7.1 a1: One TypeScript reader, flags to the script — **CHOSEN**

A small module reads `daemonUpdate.repoUrl` and `daemonUpdate.branch` from the global config; the IPC helper passes them to daemon-ctl.sh as --repo-url/--branch, and maintenance.ts uses them directly.

Add src/shared/update-source.ts with readUpdateSource(configPath?) returning { repoUrl?, branch? } after validating each value. update-runner.ts reads it when it spawns the helper and appends --repo-url and --branch to the daemon-ctl.sh arguments. daemon-ctl.sh gains --repo-url: before the fetch it runs `git remote set-url origin <url>` when origin differs, and when the wanted branch differs from HEAD it checks it out (creating it from origin/<branch>) after the dirty check. maintenance.ts update() applies the same steps through its capture/stream helpers, with opts.branch winning over the config. Unset keys change nothing.

### 7.2 a2: Environment variables only

daemon-ctl.sh and maintenance.ts read INSRC_DAEMON_REPO_URL and INSRC_DAEMON_BRANCH; the config is mapped onto them by the launcher.

The script and maintenance.ts read the two environment variables; update-runner.ts copies the config values into the helper's environment. No new script flags.

**Rejected because:** Works, but the values reach the script through the environment unvalidated and the TUI path still needs its own mapping, so it duplicates more than a1.

### 7.3 a3: The script reads the config itself

daemon-ctl.sh parses ~/.insrc/config.json with node and applies the repo URL and branch; maintenance.ts shells out to it or repeats the parse.

Add a small node one-liner in the script to read daemonUpdate.repoUrl and daemonUpdate.branch, validate them in shell, then run the same set-url, checkout and fetch steps. maintenance.ts would call the script's update command instead of its own sequence.

**Rejected because:** Moves parsing into shell and would replace the CLI sequence that also runs the config reconcile and steering refresh; larger than the Story asks.

## 8. References

- **[[c1]]** `analyze-bundle` `daemon-ctl.sh sync_repo, cmd_start, cmd_update, cmd_restart and the --branch flag`
- **[[c2]]** `analyze-bundle` `update-runner.ts launchUpdate and runDetachedUpdate`
- **[[c3]]** `analyze-bundle` `maintenance.ts update (CLI path)`
- **[[c4]]** `analyze-bundle` `where ~/.insrc/config.json is read and how keys are declared`
- **[[c5]]** `analyze-bundle` `other update entry points and docs`
- **[[c6]]** `analyze-bundle` `tests to extend`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**3 do not hold · 0 could not be verified · 9 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-22T11:56:56.239Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| current-behaviour | HIGH | (Implicit in the branch switch and the edge case 'branch exists only at origin → `git checkout -B <branch> origin/<branch>` creates it from the fetched ref'.) After `git fetch origin <branch>`, the installed checkout has a remote-tracking ref origin/<branch> for any branch. | The installer that creates ~/.insrc/daemon clones with a single branch: scripts/insrc-daemon-install.sh:191 `git clone --quiet --branch "$BRANCH" --single-branch "$REPO_URL" "$INSTALL_ROOT"`, and nothing widens remote.origin.fetch afterwards (a grep for set-branches and remote.origin.fetch finds nothing). In such a clone the configured refspec only maps the cloned branch. `git fetch origin <other>` therefore writes FETCH_HEAD only and does not create refs/remotes/origin/<other>. As a result, the existing `rev-parse "origin/$branch"` (daemon-ctl.sh:98, maintenance.ts:105) and the planned `checkout -B <branch> origin/<branch>` both fail on a standard install whenever the configured branch differs from the one installed, which is the main use case of the Story. Switching the URL to a fork has the same problem for any branch other than the installed one. [files: scripts/insrc-daemon-install.sh, scripts/daemon-ctl.sh, src/cli/services/maintenance.ts] | The LLD must state how a branch outside the clone's refspec is fetched: either fetch with an explicit refspec (`git fetch origin +refs/heads/<b>:refs/remotes/origin/<b>`), or run `git remote set-branches --add origin <b>` before the fetch. Apply the same in maintenance.ts. Add a single-branch clone to the integration fixtures. |
| error-paths | MED | A dirty tree is refused before the remote URL changes ('the remote URL is not changed before this check'), while origin is set 'before the fetch'. | Today the dirty check runs AFTER the fetch: daemon-ctl.sh:85 fetch, :90 package-lock discard, :92 dirty check. maintenance.ts has the same order (:91 fetch, :99-100 discard and porcelain check). Because the contract puts `git remote set-url` before the fetch, the stated guarantee only holds if the dirty check, together with the package-lock.json discard that precedes it, moves ahead of set-url. Neither 2.4 nor 2.5 says so. Built as written (set-url inserted before the existing fetch), a dirty tree would still have its origin rewritten before the exit 3. [files: scripts/daemon-ctl.sh, src/cli/services/maintenance.ts] | State the new order in 2.4/2.5 for both implementations: discard package-lock.json, dirty check, set-url, fetch, local-only commit check, then checkout -B or the ff-merge. |
| tests | MED | The integration fixtures exercise the shape of checkout that the update runs against in practice. | The fixtures are 'a temporary bare remote and clone created with git in the test', which is a normal full clone. The real install is `git clone --single-branch` (scripts/insrc-daemon-install.sh:191). In that shape, switching to another branch fails because origin/<branch> is never created (see current-behaviour). A full-clone fixture would pass and hide that failure. The edge cases 'repoUrl equals origin's URL → no set-url' and 'branch only at origin' also have no named test. [files: scripts/insrc-daemon-install.sh] | Clone the fixture with --single-branch (as the installer does) and add cases for a branch other than the cloned one and for an unchanged URL. |

#### Could not verify (does not block)

_None._
