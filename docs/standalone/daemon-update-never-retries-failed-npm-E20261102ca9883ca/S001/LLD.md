<!-- insrc:artifact LLD-ca9883ca42f4d73f-S001 -->

# LLD: E20261102ca9883ca:S001

## Summary

**Epic:** `daemon-update-never-retries-failed-npm`
**HLD base run:** `wf-1793620136484-pv7ygj`
**HLD effective hash:** `0926c9113ed3...`

A daemon update installs dependencies again whenever the last install did not finish successfully, not only when the lockfile changed: a small marker inside node_modules records the lockfile it was installed from, and it exists only after a successful install. Every daemon install also asks the C++ compiler for C++17, so the project-memory package's file-locking dependency builds on the pinned Node 22 headers. The same rule applies on the TUI update path and the script path both IDE plugins use.

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

### 2.1 `update`

```typescript
export async function update(opts: UpdateOptions, onLog: LogFn): Promise<MaintenanceResult>
```

**Parameters:**
- `opts: UpdateOptions` — skipSync / skipInstall / skipBuild / branch, unchanged
- `onLog: LogFn` — progress lines, unchanged

**Returns:** `Promise<MaintenanceResult>` — Unchanged shape: { ok, steps, error? }; steps includes 'install' when an install ran.

**Errors:**
- `MaintenanceResult { ok: false, error: 'npm install failed' }` when npm install exits non-zero; the install marker is absent afterwards, so the next update installs again

**Preconditions:**
- DAEMON_ROOT is a daemon git checkout (unchanged check)

**Postconditions:**
- The install runs when skipInstall is not set and the install marker is missing or does not hold the hash of the synced package-lock.json (the lockfile-changed and node_modules-missing cases are subsumed: either leaves the marker absent or stale)
- Before npm install starts, the marker is removed; after npm install exits 0, the marker is written with the hash of the synced package-lock.json taken before the install
- npm install runs with the environment's CXXFLAGS plus -std=c++17 (an existing CXXFLAGS value is kept, with the flag appended)
- When the install is skipped the log says the marker matches the lockfile

### 2.2 `npm_install_if_needed`

```typescript
npm_install_if_needed()  # bash function in scripts/daemon-ctl.sh; reads DAEMON_ROOT, DAEMON_SRC, LOG_FILE
```

**Returns:** `exit status` — 0 when the install was skipped or succeeded; the script dies with exit 4 when npm install fails (unchanged)

**Errors:**
- `die ... 4` when npm install exits non-zero; the marker is absent afterwards

**Preconditions:**
- sync_repo has run (the lockfile churn is discarded), unchanged

**Postconditions:**
- Same decision, marker write and CXXFLAGS rule as update(), with the same marker path and content, so the TUI path and the plugin path agree on one installed state
- SYNC_LOCK_HASH_BEFORE is no longer used for the decision

## 3. Data model changes

### 3.1 `install marker (node_modules/.insrc-install-ok in the daemon checkout)` — new

A plain-text file holding one line: the git blob hash (`git hash-object package-lock.json`) of the synced package-lock.json from which the last successful npm install ran. Absent = no successful install recorded (fresh checkout, failed or interrupted install, node_modules deleted). Written by update(), npm_install_if_needed and the first-time installer scripts after npm install exits 0; removed by update() and npm_install_if_needed before an install starts. Lives inside node_modules so removing node_modules removes it. Existing installs have no marker, so their next update installs once.

```
+ <DAEMON_ROOT>/node_modules/.insrc-install-ok : text, one line, the lockfile blob hash
```

**Call sites:**
- `src/cli/services/maintenance.ts:121-131`
- `scripts/daemon-ctl.sh:111-121`
- `scripts/insrc-daemon-install.sh:202`
- `vscode-plugin/assets/insrc-daemon-install.sh`

### 3.2 `daemon npm install environment (CXXFLAGS)` — invariant-change

Every npm install the daemon tooling runs (maintenance.update, daemon-ctl.sh, both installer copies) sets CXXFLAGS to the caller's CXXFLAGS with -std=c++17 appended, so native dependencies whose build files set no C++ standard compile against the Node 22.22.1 headers pinned in .npmrc. Packages that pin their own standard (tree-sitter's -std=c++17) keep building; the full install is verified in the build stage. The project-memory package and its fs-ext dependency are not changed. The flag value is -std=c++17, the value the project-memory package's owner (Epic 17123b6d) already decided and qualified: its README (packages/project-memory/README.md:119), CI (.github/workflows/project-memory.yml:46) and packed-install test (packages/project-memory/src/__tests__/packed.test.ts:17) all use CXXFLAGS=-std=c++17, and its qualification evidence passed with it [c10]. The daemon reuses that value rather than choosing its own; -std=c++17 was also probed to build and load fs-ext on 2026-11-02 [c8].

**Call sites:**
- `src/cli/services/maintenance.ts:121-131`
- `scripts/daemon-ctl.sh:111-121`
- `scripts/insrc-daemon-install.sh:202`
- `.npmrc:21-23`
- `packages/project-memory/package.json:36`
- `packages/project-memory/README.md:119`
- `.github/workflows/project-memory.yml:46`
- `packages/project-memory/src/__tests__/packed.test.ts:17`

## 4. Error paths

**Error cases**

- **npm install exits non-zero (a native build fails, the network drops)** (recoverable)
  - Detection: update() sees the npm child's non-zero exit code; npm_install_if_needed sees the subshell's non-zero status
  - Response: Return { ok:false, error:'npm install failed' } / die with exit 4, as today; the marker was removed before the install and is not written
  - User impact: The update fails visibly; the next update installs again instead of skipping
- **The install is interrupted (process killed, machine sleeps or loses power) after it started** (recoverable)
  - Detection: No detection at the time; on the next update the marker is absent because it is removed before the install and written only after exit 0
  - Response: The next update installs
  - User impact: One extra install on the next update; no permanently half-installed daemon
- **The marker cannot be written after a successful install (read-only or full disk)** (recoverable)
  - Detection: The write throws (update) or the redirect fails (daemon-ctl.sh)
  - Response: update() returns { ok:false, error } naming the marker write; daemon-ctl.sh dies with exit 4 and the log names it
  - User impact: The update reports failure even though packages are installed; the next update installs again, which is safe
- **git hash-object of package-lock.json fails (file missing in the checkout)** (recoverable)
  - Detection: Empty hash string from the git call
  - Response: Treat as no match: install, and write no marker for an empty hash, so the next update installs again
  - User impact: Installs every update until the lockfile exists; never skips wrongly

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An existing install made before this change (node_modules present, no marker) | The next update installs once and writes the marker; later updates with the same lockfile skip |
| Lockfile changes in the pull and the previous install succeeded | The marker holds the old hash, so the update installs and writes the new hash |
| node_modules deleted by hand | The marker goes with it; the next update installs |
| The user already exports CXXFLAGS (for example -O2) | npm install sees CXXFLAGS='-O2 -std=c++17'; the user's flags are kept |
| --skip-install / skipInstall: true | No install and no marker change, as today |
| The update runs twice in a row with nothing new | The second run skips the install (marker matches) |
| npm install rewrites package-lock.json during the install | The marker holds the hash taken before the install (the synced origin copy); sync_repo / update discard the rewrite before the next comparison, so the next update compares against the same origin hash and skips |

**Invariants to preserve**

- A failed npm install fails the update: update() returns { ok:false, error:'npm install failed' } and daemon-ctl.sh dies with exit 4. [[c1]]
- Lockfile churn from npm install is discarded before the cleanliness check and fast-forward (git checkout -- package-lock.json) in both update paths. [[c2]]
- skipInstall / --skip-install skips the install entirely. [[c1]]
- The two installer copies stay byte-identical. [[c3]]
- Native builds target the Node 22.22.1 headers pinned in .npmrc. [[c4]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx (npx tsx --test), as in src/cli/services/__tests__/ and src/daemon/threads/__tests__/`

**Test levels**

- **integration** — maintenance.update's install decision, marker and CXXFLAGS over a real scratch daemon checkout (a local git origin + clone) with a fake `npm` first on PATH that records its arguments and CXXFLAGS and exits with a chosen code; INSRC_DAEMON_ROOT points at the clone before the module is imported; skipBuild avoids a real build.
  - Subjects: `update() in src/cli/services/maintenance.ts`
  - Fixtures: `scratch git origin + clone with package.json, src/ and package-lock.json`, `fake npm script on PATH recording argv + CXXFLAGS, exit code from an env var`
- **integration** — The same rule in scripts/daemon-ctl.sh npm_install_if_needed, driven through `daemon-ctl.sh update` with --skip-build over the same scratch checkout and fake npm, so the TUI and plugin paths are held to one behaviour and one marker.
  - Subjects: `npm_install_if_needed / cmd_update in scripts/daemon-ctl.sh`
  - Fixtures: `same scratch checkout and fake npm; the script's daemon-root setting pointed at the clone`
- **contract** — Both installer copies set the C++17 CXXFLAGS on their npm install and write the marker after it, and stay identical.
  - Subjects: `scripts/insrc-daemon-install.sh`, `vscode-plugin/assets/insrc-daemon-install.sh`
- **smoke** — A real `npm install` of the daemon checkout under Node 22 with the new environment builds every native module, including fs-ext, and the project-memory native probe loads; then a real update of the installed daemon reinstalls once (no marker yet) and skips on the next run.
  - Subjects: `clean scratch clone of the repository`, `~/.insrc/daemon update path`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `maintenance.update: an update after a failed install installs again (fake npm exits 1, then 0), and the marker exists only after the successful one`, `daemon-ctl.sh update: the same failed-then-retried sequence` |
| `ac2` | `maintenance.update: with a matching marker and unchanged lockfile the install is skipped; with a stale marker (lockfile changed) or no marker (existing install, node_modules deleted) it installs`, `daemon-ctl.sh update: the same three cases` |
| `ac3` | `maintenance.update and daemon-ctl.sh: the fake npm sees CXXFLAGS ending in -std=c++17 and keeps a caller's existing CXXFLAGS`, `installer contract: both installer copies set the flag and write the marker, and are identical` |
| `ac4` | `smoke: a clean npm install of the repository under Node 22 builds fs-ext and the other native modules (recorded as evidence)`, `smoke: updating the installed daemon reinstalls once, then skips (recorded as evidence)` |
| `ac5` | `maintenance.update: skipInstall leaves npm uncalled and the marker unchanged; a failed install still returns { ok:false, error:'npm install failed' }`, `daemon-ctl.sh: --skip-install leaves npm uncalled; a failed install exits 4` |

## 6. Migration

**State before:** Both update paths decide to install from the lockfile hash before vs after the sync, or a missing node_modules (src/cli/services/maintenance.ts:121-131; scripts/daemon-ctl.sh:111-121, per s1 bundles 1 and 2). No successful-install record exists, and npm install runs with the caller's environment unchanged, so fs-ext fails to build under npm's bundled node-gyp 11.5.0 (s1 bundle 5).

**State after:** Both update paths install when node_modules/.insrc-install-ok is absent or holds a different lockfile hash; the marker is removed before and written after a successful install. Every daemon npm install, including both installer copies, runs with -std=c++17 appended to CXXFLAGS. The installers write the marker too.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Ship the new decision rule, marker handling and CXXFLAGS in maintenance.update and daemon-ctl.sh, and the CXXFLAGS plus marker write in both installer copies, together in one change. — ↩ rollbackable
2. No data migration: an existing install has no marker, so its first update after this change installs once (with the C++17 flag, which also repairs a daemon whose earlier install failed) and writes the marker. — ↩ rollbackable
3. Rolling back to the old code ignores the marker file; a leftover marker inside node_modules is harmless. — ↩ rollbackable

**Backward compat:** No public API change: update()'s options and result shape and daemon-ctl.sh's commands, flags and exit codes stay the same. The only visible differences are one extra install on the first update after the change, and an install whenever the previous one did not complete.

## 7. Alternatives considered

### 7.1 a1: Install marker keyed by the lockfile hash + C++17 CXXFLAGS at every daemon install site — **CHOSEN**

A marker file inside node_modules records the lockfile hash of the last successful install; updates install when it is absent or different, and every daemon npm install runs with -std=c++17 appended to CXXFLAGS.

Both update paths (maintenance.update and daemon-ctl.sh npm_install_if_needed) decide to install when the marker node_modules/.insrc-install-ok is missing or does not hold the hash of the synced (origin) package-lock.json, instead of comparing the before/after hashes. The marker is removed before an install starts and written only after npm install exits 0, so a failed or interrupted install leaves it absent and the next update installs again; deleting node_modules removes it too. The first-time installers write the same marker after their install. Every daemon npm install (the two update paths and both installer copies) runs with CXXFLAGS extended by -std=c++17 (keeping any CXXFLAGS the user set), so a native dependency whose build file sets no C++ standard (fs-ext) compiles against the Node 22.22.1 headers. The project-memory package and its fs-ext dependency are unchanged.

### 7.2 a2: Install marker + a newer node-gyp pinned for npm

Same marker for (a); for (b) point npm at node-gyp 13 (which adds -std=gnu++17) via a dev dependency and npm config.

The marker rule from a1 for the install decision. For the build, add node-gyp 13.x to the root package.json and set npm's node-gyp path to it in .npmrc, so every native build (including a developer's own npm install) uses the newer node-gyp that passes -std=gnu++17 from the Node 22 headers' common.gypi.

**Rejected because:** fi-b and fi-d only partial: the first install cannot use a node-gyp it has not installed yet.

### 7.3 a3: Retry flag on failure only + patch fs-ext

Record a failed install (a flag file) to force the next install, and patch fs-ext's binding.gyp to request C++17.

On a non-zero npm install exit, write a 'last install failed' flag; the next update installs when the flag exists. For fs-ext, apply a patch (patch-package or an npm override to a fork) adding a C++17 flag to its binding.gyp.

**Rejected because:** Violates fi-c and only partially meets fi-a.

## 8. References

- **[[c1]]** `code` `src/cli/services/maintenance.ts:121-131` — "const lockChanged = lockBefore !== lockAfter || !existsSync(join(root, 'node_modules'));"
- **[[c2]]** `code` `scripts/daemon-ctl.sh:111-121` — "if [ -z "$lock_before" ] || [ "$lock_before" != "$lock_after" ] || [ ! -d "$DAEMON_SRC/node_modules" ]; then"
- **[[c3]]** `code` `src/config/__tests__/installer-defs.test.ts:80` — "assert.equal(read('vscode-plugin/assets/insrc-daemon-install.sh'), script);"
- **[[c4]]** `code` `.npmrc:21-23` — "target="22.22.1""
- **[[c5]]** `code` `packages/project-memory/package.json:36` — ""fs-ext": "2.1.1""
- **[[c6]]** `code` `src/daemon/update-runner.ts`
- **[[c7]]** `code` `scripts/insrc-daemon-install.sh:202` — "( cd "$DAEMON_SRC" && npm install --no-fund --no-audit ) 2>&1 | tail -3"
- **[[c8]]** `stakeholder` `Probe 2026-11-02 under Node 22.23.2 with npm-bundled node-gyp 11.5.0: fs-ext 2.1.1 compiles with no -std flag and fails on std::is_void_v; with CXXFLAGS=-std=c++17 (and also -std=gnu++17) it builds and require(fs-ext).flockSync loads.`
- **[[c9]]** `prior-artifact` `docs/standalone/daemon-update-never-retries-failed-npm-E20261102ca9883ca/ISSUE.md`
- **[[c10]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/evidence/t2/qualification.json:23` — ""qualifiedCommand": "PATH=/opt/homebrew/opt/node@22/bin:$PATH CXXFLAGS=-std=c++17 npm rebuild fs-ext --foreground-scripts""
- **[[c11]]** `code` `packages/project-memory/README.md:119` — "Node 22 headers and C++17. On macOS run `CXXFLAGS=-std=c++17 npm ci` or rebuild"

## 9. Open questions

- ep3 (partial): invariantsToPreserve cite positional sources c1-c4; map c1->citation c1 (src/cli/services/maintenance.ts:121-131), c2->c2 (scripts/daemon-ctl.sh:111-121), c3->c3 (src/config/__tests__/installer-defs.test.ts:80), c4->c4 (.npmrc:21-23).

## Resolved questions

- `q24486cc3` — ep3 (partial): invariantsToPreserve cite positional sources c1-c4; map c1->citation c1 (src/cli/services/maintenance.ts:121-131), c2->c2 (scripts/daemon-ctl.sh:111-121), c3->c3 (src/config/__tests__/installer-defs.test.ts:80), c4->c4 (.npmrc:21-23).
  - **resolved**: Accept the mapping: invariantsToPreserve sources c1-c4 are the LLD citations c1 (src/cli/services/maintenance.ts:121-131), c2 (scripts/daemon-ctl.sh:111-121), c3 (src/config/__tests__/installer-defs.test.ts:80) and c4 (.npmrc:21-23), which hold the cited invariants. — The citations list defines c1-c4 with exactly these refs, so the sources resolve. _(2026-11-02T11:52:39.295Z)_

## Citations

- **[[c1]]** `code` `src/cli/services/maintenance.ts:121-131` — "const lockChanged = lockBefore !== lockAfter || !existsSync(join(root, 'node_modules'));"
- **[[c2]]** `code` `scripts/daemon-ctl.sh:111-121` — "if [ -z "$lock_before" ] || [ "$lock_before" != "$lock_after" ] || [ ! -d "$DAEMON_SRC/node_modules" ]; then"
- **[[c3]]** `code` `src/config/__tests__/installer-defs.test.ts:80` — "assert.equal(read('vscode-plugin/assets/insrc-daemon-install.sh'), script);"
- **[[c4]]** `code` `.npmrc:21-23` — "target="22.22.1""
- **[[c5]]** `code` `packages/project-memory/package.json:36` — ""fs-ext": "2.1.1""
- **[[c6]]** `code` `src/daemon/update-runner.ts`
- **[[c7]]** `code` `scripts/insrc-daemon-install.sh:202` — "( cd "$DAEMON_SRC" && npm install --no-fund --no-audit ) 2>&1 | tail -3"
- **[[c8]]** `stakeholder` `Probe 2026-11-02 under Node 22.23.2 with npm-bundled node-gyp 11.5.0: fs-ext 2.1.1 compiles with no -std flag and fails on std::is_void_v; with CXXFLAGS=-std=c++17 (and also -std=gnu++17) it builds and require(fs-ext).flockSync loads.`
- **[[c9]]** `prior-artifact` `docs/standalone/daemon-update-never-retries-failed-npm-E20261102ca9883ca/ISSUE.md`
- **[[c10]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/evidence/t2/qualification.json:23` — ""qualifiedCommand": "PATH=/opt/homebrew/opt/node@22/bin:$PATH CXXFLAGS=-std=c++17 npm rebuild fs-ext --foreground-scripts""
- **[[c11]]** `code` `packages/project-memory/README.md:119` — "Node 22 headers and C++17. On macOS run `CXXFLAGS=-std=c++17 npm ci` or rebuild"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 5 hold** · template `design-issue` · model `cli-claude:claude-sonnet-5` · reviewed 2026-11-02T11:56:25.116Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
