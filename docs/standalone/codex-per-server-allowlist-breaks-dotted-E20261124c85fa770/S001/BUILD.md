<!-- insrc:artifact BUILD-c85fa770c2cedefb-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-24T16:25:49.174Z  ·  **Updated:** 2026-11-24T16:28:10.102Z

**Commit:** 42c0f8448

## Scope

Build the per-server allowlist as ONE combined `-c mcp_servers={...}` TOML inline-table assignment, with every server name written as a quoted TOML string key, instead of as separate dotted-path `-c` flags. Check the discovered insrc entry's own `enabled` field in addition to its presence, and refuse up front with a new, distinctly-named error when it is globally disabled, rather than proceeding silently. Move the budget clock to start before the project-config walk (not after it) and thread the caller's AbortSignal through the walk's own file reads.

## Triage rationale

A single-file, already-implemented and tested fix to codexReadOnlySessionArgs and readOnlySessionOnce in src/agent/providers/cli-provider.ts (commit 71de28e05).

## Summary

Fixed 3 MED + 1 LOW findings against the codex per-server allowlist: codexReadOnlySessionArgs now emits one combined `-c mcp_servers={...}` TOML inline-table assignment with every server name as a quoted key (fixes dotted-name breakage and the later-whole-table-clobber hazard), checks the insrc entry's own `enabled` field and throws CodexMcpServerDisabledError when false, readOnlySessionOnce's project-config walk now starts the budget clock before the walk (not after) and threads AbortSignal through its reads, and the retry now logs a warning each time it fires.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-11-24T16:28:10.102Z)
