<!-- insrc:artifact ISSUE-08f9dd3412bc10f0 -->

# codexReadOnlySessionArgs' blanket per-server disable override crashes codex's bootstrap for at least two real globally-registered servers

## Reproduction

1. On a machine where codex has at least one globally-registered MCP server whose config.toml-level override is not fully reconstructable from a bare `-c mcp_servers.<name>.enabled=false` flag (confirmed live 2026-11-24: codex's own built-in plugin servers `codex_app` and `cua_repl`), call CliProvider.runReadOnlySession with kind 'codex'.
2. discoverCodexMcpServers (`codex -C cwd mcp list --json`) reports `codex_app`, `cua_repl`, `node_repl` and `insrc` as globally registered.
3. codexReadOnlySessionArgs builds one `-c mcp_servers.<name>.enabled=false` override for EVERY server other than insrc, including `codex_app` and `cua_repl`.
4. Expected: the codex read-only session starts, with every other server's tools unreachable.
5. Observed: codex's entire bootstrap crashes before the session starts -- `codex exited with 1. stderr=Error loading config.toml: invalid transport in \`mcp_servers.codex_app\`` (the same failure, naming `cua_repl`, occurs when that server is the one being disabled). The read-only session fails outright, not just for the one unexcludable server. `node_repl` -- also a built-in server absent from config.toml -- disables successfully via the identical override form, so the failure is not simply "every built-in server fails"; `codex mcp get codex_app --json` / `codex mcp get cua_repl --json` / `codex mcp get node_repl --json` (run live 2026-11-24) all report a full stdio transport and `auth_status: "unsupported"`, with no visible config-level difference that explains why node_repl's override succeeds and the other two crash.

## Root cause

codexReadOnlySessionArgs (src/agent/providers/cli-provider.ts:215-225) builds one `-c mcp_servers.<server.name>.enabled=false` override for every server in its `servers` parameter other than insrc, with no check of whether that particular server actually accepts a partial override of this form. readOnlySessionOnce's codex branch (src/agent/providers/cli-provider.ts:732-741) feeds it the full, unfiltered list discoverCodexMcpServers (src/agent/providers/cli-provider.ts:177-199) returns from `codex mcp list --json`, so every globally-registered server -- including codex's own built-in/plugin-provided ones like `codex_app` and `cua_repl`, which do not appear in any .codex/config.toml at all -- gets an override emitted for it unconditionally. codex, when asked to apply a partial override to one of these built-in entries, cannot reconstruct a complete, valid configuration for that server from the override alone and refuses to load at all ("invalid transport"), which aborts the whole codex invocation, not just that one server's exclusion. The underlying assumption -- that the mcp_servers.<name> override surface is uniformly safe for every name `mcp list` reports -- does not hold, and the live evidence (node_repl succeeds, codex_app and cua_repl crash, all three sharing the same auth_status and transport TYPE) does not yet establish which property actually predicts safety.

## Fix intent

Replace the unconditional one-override-per-other-server behavior with a mechanism that verifies, per server, whether disabling it via this override form is actually safe before relying on it in the session's argv, and have the read-only session refuse to start cleanly and explicitly -- rather than let codex's own bootstrap crash -- for a server whose exclusion safety cannot be established. The verification approach itself (what live signal distinguishes a safely-overridable server from one that is not) is part of the design this fix intent hands off to investigate; it is not assumed or chosen here.

## Citations

- **[[c1]]** `code` `src/agent/providers/cli-provider.ts:215-225`
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:177-199`
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:732-741`
