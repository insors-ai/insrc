<!-- insrc:artifact ISSUE-767aef145a1b22ef -->

# Register the insrc MCP server in vibe's user-global config.toml, not in each repo's project-local .vibe/config.toml

## Reproduction

1. Register a repo's vibe client (repo.add / MCP registration passing a repoPath) on machine A. registerOne takes the vibe+repo branch and upsertVibeProjectServer writes an [[mcp_servers]] insrc block into that repo's own .vibe/config.toml, with args = ["<machine A home>/.insrc/daemon/out/bin/insrc-mcp.js"] — an absolute path valid only on machine A.
2. The project-local .vibe/config.toml travels with the repo: it is cloned to other machines and committed to git (this repo's .vibe/config.toml is tracked), so the entry is dead on every machine except A, leaks machine-specific paths into the repo, and vibe only applies project configs in trusted folders anyway.
3. Observed live on 2026-11-24: this repo's committed .vibe/config.toml held args = ["/Users/subhagho/.insrc/daemon/out/bin/insrc-mcp.js"] (a Mac path) while running on this Linux machine as user subho, discovered while live-testing the s1/t1 vibe read-only session fix for Epic a9ae072ce3b7b794 — insrc MCP tools silently absent from vibe for the project.
4. Expected: the insrc MCP entry lives in the user-global config ($VIBE_HOME|~/.vibe/config.toml), where the machine-local absolute path is always correct for the machine that registered, and a repo carries no machine-specific registration at all.

## Root cause

The layer choice in registerOne: when a repoPath is given, vibe registration deliberately diverges from every other path and writes the project layer instead of the user-global one. The entrypoint it records (mcpJs = join(daemonInstallRoot(), 'out', 'bin', 'insrc-mcp.js')) is machine-global — it lives under the registering user's home — so a repo-committed project-local .vibe/config.toml can never carry a valid value for anyone else; the comment justifying the project layer as making the repo "self-contained" is wrong for an absolute per-machine path. The earlier same-day draft ISSUE-b894340a97f828f3 chased the resulting symptom (a stale cross-machine args path never repaired by upsertVibeProjectServer's name-only idempotency guard) instead of this layer choice; this issue reframes it.

## Fix intent

Register the insrc MCP server for vibe in the USER-GLOBAL config ($VIBE_HOME|~/.vibe/config.toml) — the same destination the no-repo path already uses — and stop writing the entry into each repo's project-local .vibe/config.toml. Retire upsertVibeProjectServer's role in registration (the vibe+repo branch in registerOne) while keeping the user-level ~/.vibe/AGENTS.md steering upsert and the existing idempotency semantics. Handle cleanup of existing project-layer insrc blocks (e.g. this repo's stale committed .vibe/config.toml entry) so the change does not leave dead, cross-machine-wrong entries behind.

## Citations

- **[[c1]]** `code` `src/daemon/mcp-register.ts:359-370` — "} else if (repoPath !== undefined) { // vibe + repo: write the entry into the repo's OWN .vibe/config.toml"
- **[[c2]]** `code` `src/daemon/mcp-register.ts:171-190` — "export function upsertVibeProjectServer(repoPath: string, mcpJs: string, deps: McpRegisterDeps = {}): 'unchanged' | 'registered'"
- **[[c3]]** `code` `src/daemon/mcp-register.ts:138-141` — "export function vibeProjectConfigPath(repoPath: string): string { return join(repoPath, '.vibe', 'config.toml'); }"
- **[[c4]]** `code` `src/daemon/mcp-register.ts:261` — "const mcpJs = join(installRoot, 'out', 'bin', 'insrc-mcp.js');"
- **[[c5]]** `code` `src/daemon/mcp-register.ts:129-134` — "Writing the entry into the repo's own .vibe/config.toml therefore makes the repo self-contained: anyone opening it gets the insrc MCP on the next vibe start."
- **[[c6]]** `code` `src/daemon/mcp-register.ts:243` — "{ client: 'vibe', bin: 'vibe', selected: false, addArgs: js => ['mcp', 'add', 'insrc', '--transport', 'stdio', '--command', 'node', '--arg', js] }"
- **[[c7]]** `code` `src/daemon/mcp-register.ts:371-376` — "const text = vibeConfigText(); if (text !== undefined && vibeConfigHasServer(text, 'insrc')) { return { client: p.client, action: 'unchanged' }; }"
- **[[c8]]** `prior-artifact` `docs/standalone/vibe-mcp-registration-never-repairs-stale-E20261124b894340a/ISSUE.md` — "Vibe MCP registration never repairs a stale insrc entrypoint path when a repo's .vibe/config.toml was written on a different machine"
