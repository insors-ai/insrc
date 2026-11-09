<!-- insrc:artifact ISSUE-b902426092868097 -->

# Keep Vibe configs valid when registering the insrc server

## Reproduction

1. Have a Vibe config (`~/.vibe/config.toml`) that holds `mcp_servers = []` as a top-level setting and no `[[mcp_servers]]` section for insrc.
2. Let the VS Code plugin register the insrc server with Vibe.
3. Start Vibe.

Observed on 2026-11-09: Vibe 3.0.4 exits with code 1 and `Cannot load the Vibe config. Layer 'user-toml': _build_config_snapshot() failed: Cannot mutate immutable namespace ('mcp_servers',) (at line 91, column 14)`. The file held `mcp_servers = []` at line 9 and `[[mcp_servers]]` at line 91. Python's `tomllib` reports the same error for that file, and the file parses with line 9 removed.

Expected: registering the server leaves a valid config, Vibe starts, and insrc is listed among its MCP servers.

## Root cause

TOML does not allow a key assigned an inline list to be extended later with an array-of-tables header, so a file cannot hold both `mcp_servers = []` and `[[mcp_servers]]`.

Vibe writes its whole config when it saves, so a config with no MCP servers can hold the inline form. `createTomlMcpConfigWriter` in `vscode-plugin/src/hosts/toml-mcp-writer.ts` recognises only table headers: when no `[[mcp_servers]]` section is named insrc it appends a new one at the end of the file, without looking for a top-level `mcp_servers` key.

`upsertVibeProjectServer` in `src/daemon/mcp-register.ts` has the same gap for a repository's `.vibe/config.toml`: `vibeConfigHasServer` looks only at `[[mcp_servers]]` chunks, and the function then appends the block produced by `vibeServerTomlBlock`.

On the affected machine, line 91's block matches the plugin writer's format and the config shares its last-modified minute with `~/.vibe/AGENTS.md`, which the plugin also writes. That attributes this occurrence to the plugin but does not prove it. Why the insrc entry had been absent before that write is not established.

## Fix intent

Registering the insrc server in a Vibe config that holds a top-level inline `mcp_servers` list produces a valid TOML file, from both the VS Code plugin and the daemon. Every server already in the inline list and every other setting is kept, and insrc is registered once. Registering again changes nothing. Where a writer cannot safely bring a config into a valid form, it leaves the file untouched and reports the failure instead of writing an invalid file.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/hosts/toml-mcp-writer.ts` — "next = [...lines, ...(needsBlank ? [''] : []), '[[mcp_servers]]', ...body];"
- **[[c2]]** `code` `src/daemon/mcp-register.ts` — "writeText(repoPath, base + vibeServerTomlBlock(mcpJs));"
- **[[c3]]** `analyze-bundle` `insrc_analyze_step: vscode-plugin/src/hosts/toml-mcp-writer.ts, callers and tests of the Vibe TOML config writers`
- **[[c4]]** `stakeholder` `User report on 2026-11-09 of the Vibe exit code 1 and its error message`
