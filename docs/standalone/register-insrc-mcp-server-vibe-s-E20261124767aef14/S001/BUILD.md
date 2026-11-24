<!-- insrc:artifact BUILD-767aef145a1b22ef-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-24T11:37:59.812Z  ·  **Updated:** 2026-11-24T11:59:31.026Z

**Commit:** 66983555a

## Scope

Register the insrc MCP server in vibe's user-global config.toml, not in each repo's project-local .vibe/config.toml

Reproduction: 1. Register a repo's vibe client (repo.add / MCP registration passing a repoPath) on machine A. registerOne takes the vibe+repo branch and upsertVibeProjectServer writes an [[mcp_servers]] insrc block into that repo's own .vibe/config.toml, with args = ["<machine A home>/.insrc/daemon/out/bin/insrc-mcp.js"] — an absolute path valid only on machine A. 2. The project-local .vibe/config.toml travels with the repo: it is cloned to other machines and committed to git (this repo's .vibe/config.toml is tracked), so the entry is dead on every machine except A, leaks machine-specific paths into the repo, and vibe only applies project configs in trusted folders anyway. 3. Observed live on 2026-11-24: this repo's committed .vibe/config.toml held args = ["/Users/subhagho/.insrc/daemon/out/bin/insrc-mcp.js"] (a Mac path) while running on this Linux machine as user subho, discovered while live-testing the s1/t1 vibe read-only session fix for Epic a9ae072ce3b7b794 — insrc MCP tools silently absent from vibe for the project. 4. Expected: the insrc MCP entry lives in the user-global config ($VIBE_HOME|~/.vibe/config.toml), where the machine-local absolute path is always correct for the machine that registered, and a repo carries no machine-specific registration at all.

Root cause: The layer choice in registerOne: when a repoPath is given, vibe registration deliberately diverges from every other path and writes the project layer instead of the user-global one. The entrypoint it records (mcpJs = join(daemonInstallRoot(), 'out', 'bin', 'insrc-mcp.js')) is machine-global — it lives under the registering user's home — so a repo-committed project-local .vibe/config.toml can never carry a valid value for anyone else; the comment justifying the project layer as making the repo "self-contained" is wrong for an absolute per-machine path.

Fix intent: Register the insrc MCP server for vibe in the USER-GLOBAL config ($VIBE_HOME|~/.vibe/config.toml) — the same destination the no-repo path already uses — and stop writing the entry into each repo's project-local .vibe/config.toml. Retire upsertVibeProjectServer's role in registration (the vibe+repo branch in registerOne) while keeping the user-level ~/.vibe/AGENTS.md steering upsert and the existing idempotency semantics. Handle cleanup of existing project-layer insrc blocks (e.g. this repo's stale committed .vibe/config.toml entry) so the change does not leave dead, cross-machine-wrong entries behind.

## Summary

Moved vibe MCP registration to the user-global config: registerOne's vibe+repo project-layer branch is gone (vibe now always registers through the user-global pre-check + `vibe mcp add`), a new removeVibeProjectServer cleans legacy project-layer insrc entries at registration (analysis on an index-preserving masked copy: comments to end of line, single-line strings with escapes, multiline basic/literal strings with escape sequences, fence runs, line-continuation backslashes; quote-aware TOML key components in headers; indented [[mcp_servers]] elements inside a removed chunk keep their sub-tables; the entry's own [mcp_servers.*] sub-tables drop with it; unrelated tables and other servers preserved byte for byte; file deleted when nothing else remains; a removal that drops nothing reports absent without writing; best-effort so cleanup never fails registration), and the mcp.status probe reads the user-global config only. The repo's own stale committed .vibe/config.toml is removed and the entry was registered live in ~/.vibe/config.toml via `vibe mcp add`. 53 tests in src/daemon/__tests__/mcp-register.test.ts cover the layer behavior, the full cleanup matrix and the probe.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.vibe/config.toml` — **insrc-build** (2026-11-24T11:59:31.026Z)
- `src/daemon/__tests__/mcp-register.test.ts` — **insrc-build** (2026-11-24T11:59:31.026Z)
- `src/daemon/mcp-register.ts` — **insrc-build** (2026-11-24T11:59:31.026Z)
