<!-- insrc:artifact PLAN-ca9883ca42f4d73f-S001 -->

# Plan: E20261102ca9883ca:S001

## Summary

**Epic:** `daemon-update-never-retries-failed-npm`
**LLD run:** `wf-1793620136484-pv7ygj`
**LLD effective hash:** `0926c9113ed3...`

Building this fix means changing the install decision in the two update paths (the TypeScript update service and the daemon-ctl.sh script) to a marker written only after a successful install, adding the C++17 compiler flag to every daemon npm install including the installers, and proving it with fake-npm tests over a scratch git checkout plus a real clean install and a real update of the installed daemon.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** maintenance.update installs on a missing or stale marker, with C++17 CXXFLAGS | M | — | integration: S001 t1: an update after a failed install installs again, and the marker exists only after a successful install; integration: S001 t1: a matching marker skips the install; a stale or missing marker installs; integration: S001 t1: npm runs with -std=c++17 appended to the caller's CXXFLAGS; integration: S001 t1: skipInstall leaves npm uncalled and the marker unchanged; integration: S001 t1: an empty lockfile hash installs and writes no marker; a marker write failure fails the update | [[c1]] [[c3]] [[c4]] [[c5]] [[c6]] |
| 2 | **`t2`** daemon-ctl.sh applies the same marker rule and CXXFLAGS | M | `t1` | integration: S001 t2: daemon-ctl.sh update retries after a failed install (exit 4), then skips on a matching marker; integration: S001 t2: daemon-ctl.sh installs on a stale or missing marker, with -std=c++17 appended to CXXFLAGS; integration: S001 t2: daemon-ctl.sh and maintenance.update honour each other's marker; integration: S001 t2: --skip-install leaves npm uncalled; an empty lockfile hash installs and writes no marker | [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] |
| 3 | **`t3`** Installers build with C++17 and write the install marker | S | `t1` | unit: S001 t3: the installer builds with -std=c++17 and writes the install marker after npm install, in both identical copies | [[c3]] [[c4]] [[c6]] |
| 4 | **`t4`** Real install and installed-daemon update smoke, then the full sweep | M | `t1`, `t2`, `t3` | smoke: S001 t4: clean install under Node 22 builds fs-ext and the native modules; smoke: S001 t4: the installed daemon's update installs once, then skips | [[c6]] [[c7]] |

### 1.1 E20261102ca9883ca:S001:T001 — maintenance.update installs on a missing or stale marker, with C++17 CXXFLAGS

In update() (src/cli/services/maintenance.ts), replace the lockfile-changed decision with the install-marker rule: read node_modules/.insrc-install-ok, compare it with the synced lockfile's git blob hash, remove the marker before an install, write it after npm install exits 0, and run npm install with CXXFLAGS extended by -std=c++17. Keep skipInstall, the failure result and the lockfile-churn discard. Add the fake-npm integration test over a scratch git checkout.

**Acceptance checks:**
- An update after a failed install installs again, and the marker exists only after a successful install
- A matching marker skips the install and the log says the marker matches the lockfile; a stale or missing marker installs
- npm sees CXXFLAGS ending in -std=c++17 with any existing CXXFLAGS kept
- skipInstall leaves npm uncalled and the marker unchanged; a failed install returns { ok:false, error:'npm install failed' }
- An empty lockfile hash installs and writes no marker; a marker write failure returns ok:false

### 1.2 E20261102ca9883ca:S001:T002 — daemon-ctl.sh applies the same marker rule and CXXFLAGS

In scripts/daemon-ctl.sh, npm_install_if_needed uses the same marker path, content and decision as t1, removes it before and writes it after a successful install, and runs npm install with CXXFLAGS extended by -std=c++17; SYNC_LOCK_HASH_BEFORE no longer drives the decision. Add an integration test driving `daemon-ctl.sh update --skip-build` over a scratch checkout with a fake npm.

**Acceptance checks:**
- The failed-then-retried, matching, stale and missing marker cases behave as in t1
- npm sees CXXFLAGS ending in -std=c++17 with an existing value kept
- An empty lockfile hash installs and writes no marker
- A marker written by update() is honoured by daemon-ctl.sh and the other way round
- --skip-install leaves npm uncalled; a failed install exits 4

### 1.3 E20261102ca9883ca:S001:T003 — Installers build with C++17 and write the install marker

In scripts/insrc-daemon-install.sh, run npm install with CXXFLAGS extended by -std=c++17 and, after it succeeds, write the marker holding `git hash-object package-lock.json` of the checkout; copy the result to vscode-plugin/assets/insrc-daemon-install.sh. Extend src/config/__tests__/installer-defs.test.ts.

**Acceptance checks:**
- Both installer copies set CXXFLAGS with -std=c++17 on the npm install
- Both write the marker after the install, holding the checkout's lockfile blob hash, so the first update after a fresh install skips
- The two copies stay byte-identical

### 1.4 E20261102ca9883ca:S001:T004 — Real install and installed-daemon update smoke, then the full sweep

Clean clone of the repository under Node 22: npm install through the new path builds every native module including fs-ext and the project-memory native probe loads; after the push, update the installed daemon (~/.insrc/daemon): it installs once (no marker yet) and skips on the next update. Record both as evidence, then run the full test sweep once.

**Acceptance checks:**
- A clean install under Node 22 succeeds with fs-ext built and loadable (evidence file)
- The installed daemon's update installs once then skips (evidence file)
- Full sweep recorded with every failure classified

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| update() in src/cli/services/maintenance.ts | `t1` |
| npm_install_if_needed / cmd_update in scripts/daemon-ctl.sh | `t2` |
| scripts/insrc-daemon-install.sh | `t3` |
| vscode-plugin/assets/insrc-daemon-install.sh | `t3` |
| clean scratch clone of the repository | `t4` |
| ~/.insrc/daemon update path | `t4` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api update`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api npm_install_if_needed`
- **[[c3]]** `prior-artifact` `LLD S001 dataModelChanges install marker`
- **[[c4]]** `prior-artifact` `LLD S001 dataModelChanges daemon npm install environment (CXXFLAGS)`
- **[[c5]]** `prior-artifact` `LLD S001 errorPaths`
- **[[c6]]** `prior-artifact` `LLD S001 testStrategy`
- **[[c7]]** `prior-artifact` `LLD S001 migration`
