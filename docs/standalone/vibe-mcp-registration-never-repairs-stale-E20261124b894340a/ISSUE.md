<!-- insrc:artifact ISSUE-b894340a97f828f3 -->

# Vibe MCP registration never repairs a stale insrc entrypoint path when a repo's .vibe/config.toml was written on a different machine

## Reproduction

1. Register a repo's vibe client on machine A (e.g. a Mac, home /Users/alice), which writes src/daemon/mcp-register.ts's `[[mcp_servers]] name = "insrc" ... args = ["/Users/alice/.insrc/daemon/out/bin/insrc-mcp.js"]` block into that repo's `.vibe/config.toml` via upsertVibeProjectServer.
2. Move or re-clone the same repo directory onto machine B (e.g. Linux, home /home/bob) and re-run repo registration there.
3. Expected: the `insrc` entry's `args` path is corrected to the real, current-machine entrypoint computed by daemonInstallRoot() on machine B.
4. Observed: upsertVibeProjectServer finds the TOML text already satisfies vibeConfigHasServer(text, 'insrc') (a table named 'insrc' exists) and returns 'unchanged' without inspecting `args` at all, so the stale machine-A path is left in place. vibe then tries to spawn a nonexistent binary for that project and the insrc MCP server never starts, with insrc_analyze / insrc_analyze_step silently absent from vibe's tool capability set -- no error is surfaced anywhere. Reproduced live on 2026-11-24: this repo's own .vibe/config.toml held `args = ["/Users/subhagho/.insrc/daemon/out/bin/insrc-mcp.js"]` (a Mac path) while running on this Linux machine as user subho, discovered while live-testing the s1/t1 vibe read-only session fix for Epic a9ae072ce3b7b794.

## Root cause

upsertVibeProjectServer (src/daemon/mcp-register.ts:171-190) computes `mcpJs` for the CURRENT machine (ultimately `join(daemonInstallRoot(), 'out', 'bin', 'insrc-mcp.js')`, src/daemon/mcp-register.ts:261, where daemonInstallRoot() at src/daemon/mcp-register.ts:42-44 derives from this module's own `import.meta.url` on whichever machine is running), but its idempotency guard only calls vibeConfigHasServer(text, 'insrc') (src/daemon/mcp-register.ts:223-227), which checks ONLY that a `[[mcp_servers]]` chunk exists with `name = "insrc"` -- it never compares the chunk's own `args` value against the freshly-computed `mcpJs`. So once an `insrc` entry exists under any args value, upsertVibeProjectServer treats the repo as already registered forever, even when the recorded path belongs to a different machine, OS, username or home directory than the one running now. The function already has a repair branch for a DIFFERENT kind of staleness (an inline `mcp_servers` list moved to array-of-tables form via moveInlineListToTables, then rewritten if the normalized text differs from what was read) -- that branch simply has no equivalent check for a stale `args` path.

## Fix intent

Extend upsertVibeProjectServer's idempotency check so that, after confirming an `insrc` table exists, it also extracts that table's current `args` entrypoint path and compares it to the freshly-computed `mcpJs` for this machine. On a mismatch, repair the entry in place (replace that one table's `args` value) and return 'registered' instead of 'unchanged' -- mirroring the existing repair-and-return-'registered' path already used for the inline-list-vs-tables case, so a repo's vibe registration self-heals across a machine move without requiring the user to notice or manually re-run `vibe mcp add`.

## Citations

- **[[c1]]** `code` `src/daemon/mcp-register.ts:171-190`
- **[[c2]]** `code` `src/daemon/mcp-register.ts:223-227`
- **[[c3]]** `code` `src/daemon/mcp-register.ts:42-44`
- **[[c4]]** `code` `src/daemon/mcp-register.ts:261`
- **[[c5]]** `code` `src/daemon/mcp-register.ts:332-405`
