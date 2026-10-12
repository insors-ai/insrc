<!-- insrc:artifact BUILD-b4b6b835f29fab99-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-12T08:37:15.876Z  ·  **Updated:** 2026-10-12T09:55:02.035Z

**Commit:** c57c37fd

## Scope

Fix ISSUE-b4b6b835f29fab99: the build gate's typecheck runs `npx tsc --noEmit` once from the repository root, so the VS Code plugin project (vscode-plugin/, its own tsconfig.json) is never type-checked. Make the gate also type-check every TypeScript project that owns a file the task touched (nearest tsconfig.json above each file), report clean only when all are clean, and put each project's command and output in the evidence. A task touching only root src/ files behaves as today.

## Triage rationale

Small bugfix (ISSUE-b4b6b835f29fab99), routed issue -> build with no LLD: a defect in one module, the fixed TYPECHECK_ARGV in src/mcp/build-step/validation-checks.ts run once from the repo root.

## Summary

The validate session now gives each check plan the TypeScript projects, other than the root's, that own a file the build changed or one of its test files, found from the nearest tsconfig.json above each .ts/.tsx file. The changed files are those committed since the Story's range base (the HEAD commit when there is none), uncommitted changes and untracked files; each git listing stands on its own. The gate runs the typecheck in the root and then in each of those projects, and reports one result that is clean only when all are, with every project's command and output. A build inside the root project is unchanged. Decided and not done here: the root project excludes its own test files, and type-checking them today reports 223 existing errors, so that gap needs its own issue. A project's secondary tsconfig files are not checked either.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-c96a97a204fac22b-S001.json` — **insrc-build** (2026-10-12T09:55:02.035Z)
- `docs/standalone/every-save-chat-session-rewrites-its-E20261012c96a97a2/S001/BUILD.md` — **insrc-build** (2026-10-12T09:55:02.035Z)
