<!-- insrc:artifact BUILD-e370095b52a98433-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-18T04:27:22.158Z  ·  **Updated:** 2026-11-18T04:30:55.775Z

**Commit:** cb7f6f6fa

## Scope

Bugfix (ISSUE-e370095b52a98433, magnitude small): remove the redundant disturl="https://nodejs.org/dist" line from the repo-root .npmrc and extend its comment to state that target="22.22.1" + runtime="node" are the effective pin landing node-gyp headers on Node 22.22.1 (the guard that makes fs-ext@2.1.1 compile on Macs with default node 24/26). No dependency/script/source changes. NOTE: the change is already committed as cb7f6f6fa on top of the build range base a4ac9f749; re-running implement is only to re-stamp the admission gate.

## Triage rationale

Single-file config fix at the repo-root .npmrc; disturl is npm's built-in default; target="22.22.1" is the load-bearing pin (probed: target-only -> clean fs-ext build + load under Node 22; disturl-only/none -> 20 C++ errors on 26.5.1 headers).

## Summary

Removed the redundant disturl line from .npmrc and documented target/runtime as the effective Node 22.22.1 header pin (ISSUE-e370095b52a98433), committed as cb7f6f6fa directly on the build range base a4ac9f749 (git diff a4ac9f749..HEAD -- .npmrc shows exactly the disturl removal + new comment). Verified: npm config get target=22.22.1; probe build of fs-ext@2.1.1 with target-only .npmrc compiles clean and loads under Node 22 (modules=127). One-file config change; no source or tests affected.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.npmrc` — **insrc-build** (2026-11-18T04:30:55.775Z)
