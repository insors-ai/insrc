<!-- insrc:artifact BUILD-6f1f61f26d4d6169-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-09T19:12:52.141Z  ·  **Updated:** 2026-11-09T19:14:41.943Z

**Commit:** 3f7b0c0bd

## Scope

Every supported way of installing the repository must ask for the same C++ standard the daemon install paths already use, so fs-ext compiles in CI and when a developer follows the build instructions. The daemon install paths keep their existing behaviour. The fix must confirm on macOS that a clean install with the documented command succeeds.

## Triage rationale

A defect with one established remedy: the daemon install paths already ask for C++17 through CXXFLAGS, and the remaining bare installs need the same setting. It touches two workflow files and the build instructions, with no code or contract change.

## Summary

The root install steps in ci.yml and vscode-plugin.yml now set CXXFLAGS=-std=c++17, and CLAUDE.md, AGENTS.md, README.md, docs/installation.md and docs/daemon.md give the install command with that flag. A clean install of origin/v2 on macOS with the flag exited 0 and fs-ext loaded; the output is in docs/standalone/give-every-repository-install-c-standard-E202611096f1f61f2/S001/evidence/macos-clean-install.txt. The workflows were not run on GitHub, and a bare install without the flag still fails on macOS, as agreed with the user.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.github/workflows/ci.yml` — **insrc-build** (2026-11-09T19:14:41.943Z)
- `.github/workflows/vscode-plugin.yml` — **insrc-build** (2026-11-09T19:14:41.943Z)
- `AGENTS.md` — **insrc-build** (2026-11-09T19:14:41.943Z)
- `CLAUDE.md` — **insrc-build** (2026-11-09T19:14:41.943Z)
- `README.md` — **insrc-build** (2026-11-09T19:14:41.943Z)
- `docs/daemon.md` — **insrc-build** (2026-11-09T19:14:41.943Z)
- `docs/installation.md` — **insrc-build** (2026-11-09T19:14:41.943Z)
