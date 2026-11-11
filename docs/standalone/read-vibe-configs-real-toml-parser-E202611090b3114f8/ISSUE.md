<!-- insrc:artifact ISSUE-0b3114f87754959b -->

# Read Vibe configs with a real TOML parser

## Reproduction

Register the insrc server in a Vibe config (`.vibe/config.toml`) holding one of these valid TOML forms.

1. `[mcp_servers."a#b"]` with no `[[mcp_servers]]` entry. Observed: not refused, so `[[mcp_servers]]` is appended and the file becomes invalid. Expected: a valid file, or a refusal with the file untouched.
2. An inline entry such as `mcp_servers = [{ name = "insrc'docs", command = "docs" }]`, written through the daemon. Observed: the daemon treats insrc as already registered and does not add it. Expected: insrc is added.
3. Section-like text inside an unrelated multi-line string, such as a `notes` value containing `[[mcp_servers]]` and `name = "insrc"`. Observed: the plugin writer treats that text as a real section and can corrupt the file, and the daemon treats insrc as registered. Expected: the text is left alone and insrc is registered.

These cases were reported by the code review and the build check of ISSUE-b902426092868097 and accepted there as known limits; they come from reading the code and were not run against a live Vibe.

## Root cause

Neither writer parses TOML. `createTomlMcpConfigWriter` in `vscode-plugin/src/hosts/toml-mcp-writer.ts` reads the file line by line and treats header-shaped lines as sections. `vibeConfigHasServer` in `src/daemon/mcp-register.ts` splits on `[[` and matches the name with a regular expression that accepts either quote as the closing delimiter. `src/shared/toml-inline-list.ts` scans strings and brackets by hand and checks table headers with a regular expression that excludes `#` and `]`, even inside quotes.

Each of these approximates TOML's grammar, so each can disagree with what the file really means. The three code review rounds on ISSUE-b902426092868097 kept finding rarer spellings for that reason.

## Fix intent

The Vibe config writers in the plugin and the daemon decide what a config holds from a real TOML parse, so spelling, quoting and text inside strings can no longer change the answer. Registering insrc leaves a valid file, keeps every other server and setting, and adds insrc exactly once. A config that cannot be changed safely is left untouched and the failure is reported.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/hosts/toml-mcp-writer.ts`
- **[[c2]]** `code` `src/daemon/mcp-register.ts`
- **[[c3]]** `code` `src/shared/toml-inline-list.ts`
- **[[c4]]** `analyze-bundle` `insrc_analyze_step: vscode-plugin/src/hosts/toml-mcp-writer.ts, callers and tests of the Vibe TOML config writers`
- **[[c5]]** `prior-artifact` `docs/standalone/keep-vibe-configs-valid-when-registering-E20261109b9024260/S001/CR.md`
