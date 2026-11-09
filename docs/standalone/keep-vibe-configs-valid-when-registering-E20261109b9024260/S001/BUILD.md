<!-- insrc:artifact BUILD-b902426092868097-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-09T05:13:39.589Z  ·  **Updated:** 2026-11-09T07:55:33.108Z

**Commit:** 621464563

## Scope

Registering the insrc server in a Vibe config that holds a top-level inline mcp_servers list produces a valid TOML file, from both the VS Code plugin (vscode-plugin/src/hosts/toml-mcp-writer.ts) and the daemon (upsertVibeProjectServer in src/daemon/mcp-register.ts). Every server already in the inline list and every other setting is kept, and insrc is registered once. Registering again changes nothing. Where a writer cannot safely bring a config into a valid form, it leaves the file untouched and reports the failure instead of writing an invalid file.

## Triage rationale

Small bugfix ISSUE-b902426092868097: two writers append a server section without accounting for the inline list that Vibe saves.

## Summary

Both Vibe config writers now move an inline mcp_servers list into [[mcp_servers]] tables before adding the insrc server, through one shared helper, and leave a config they cannot fix untouched. An inline entry whose name is not a plain quoted string, whose keys use escapes, or which spans lines is refused rather than converted. The user chose to keep the shared helper.

## Tasks validated

- ✗ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/mcp-register.test.ts` — **insrc-build** (2026-11-09T07:55:33.108Z)
- `src/daemon/mcp-register.ts` — **insrc-build** (2026-11-09T07:55:33.108Z)
- `src/shared/__tests__/toml-inline-list.test.ts` — **insrc-build** (2026-11-09T07:55:33.108Z)
- `src/shared/toml-inline-list.ts` — **insrc-build** (2026-11-09T07:55:33.108Z)
- `vscode-plugin/src/hosts/__tests__/commands.test.ts` — **insrc-build** (2026-11-09T07:55:33.108Z)
- `vscode-plugin/src/hosts/__tests__/writers.test.ts` — **insrc-build** (2026-11-09T07:55:33.108Z)
- `vscode-plugin/src/hosts/toml-mcp-writer.ts` — **insrc-build** (2026-11-09T07:55:33.108Z)
- `.insrc/artifacts/ISSUE-b902426092868097.json` — **insrc-build** (2026-11-09T07:55:33.108Z)
- `.insrc/artifacts/ISSUE-b902426092868097.log.jsonl` — **insrc-build** (2026-11-09T07:55:33.108Z)
- `docs/standalone/keep-vibe-configs-valid-when-registering-E20261109b9024260/ISSUE.md` — **insrc-build** (2026-11-09T07:55:33.108Z)
