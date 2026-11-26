<!-- insrc:artifact ISSUE-d3e72fe73ee775a2 -->

# Vibe's read-only session cannot call the insrc MCP analyze tools headlessly because --enabled-tools does not bypass vibe's separate agent-approval gate

## Reproduction

1. Build a CliProvider with kind 'vibe' and call runReadOnlySession with a prompt asking it to call the insrc analyze MCP tool, against a repo whose .vibe/config.toml correctly registers the insrc MCP server (confirmed live 2026-11-24 with INSRC_LIVE_TESTS=1 against the real vibe and vibe-app-server binaries, repo /home/subho/work/dev/insors/insrc).
2. Expected: the model calls the insrc analyze tool (now correctly named mcp_insrc.insrc_analyze / mcp_insrc.insrc_analyze_step, per READ_ONLY_SESSION_VIBE_TOOL_NAMES) and the call succeeds, since it is in the enabled-tools set.
3. Observed: the call is denied. One live run reported the tool call was 'denied by the approval callback with tool_denied'; another live run (same setup) reported the model could not find any insrc_* tool at all ('capability search returned zero insrc_* tools'). Both runs used the same --enabled-tools arguments; read_file and grep (vibe's own built-in tools, also in the enabled set) worked normally in every run, and the write-refusal check (no file created) also held in every run -- only the MCP-provided insrc tools are affected.
4. Separately confirmed via `vibe --help` (2026-11-24, real installed vibe CLI): vibe has a second, independent authorization layer on top of --enabled-tools -- an agent policy selected by --agent <ask|accept-edits|smart-approve|auto-approve> (or --auto-approve as a shorthand for the auto-approve agent), which the read-only session never sets.

## Root cause

readOnlySessionOnce's vibe branch (src/agent/providers/cli-provider.ts:581-592) and runVibe (src/agent/providers/cli-provider.ts:666-716) build the read-only session's enabledTools/args purely from READ_ONLY_SESSION_VIBE_TOOL_NAMES (src/agent/providers/cli-provider.ts:118), and runVibe's verifyRuntime check (src/agent/providers/cli-provider.ts:697-710) only verifies that the runtime's reported tools match that allowlist and that `bypassToolPermissions === false` (src/agent/providers/cli-provider.ts:699) -- i.e. it treats --enabled-tools as the complete authorization story, the same way codex's --sandbox read-only and claude's --allowedTools are. But vibe --help (confirmed live) shows --enabled-tools only controls WHICH tools exist in the session; whether calling one of them executes or is denied is governed by a SEPARATE --agent policy (default 'ask' unless --agent/--auto-approve is passed), which the read-only session never sets (runVibe only sets agentConfig.autoApprove from args.includes('--auto-approve') at src/agent/providers/cli-provider.ts:694, and the read-only session's args never include that flag). Under the default 'ask' policy with no interactive approver attached (the read-only session runs headlessly via -p), a call to a provided (MCP) tool is denied rather than answered, which is what the live runs observed for the insrc analyze tools; vibe's own built-in read_file/grep tools are unaffected because they are not gated by this provided-tool approval mechanism.

## Fix intent

Determine, by investigating vibe's actual session/start agentConfig surface, whether a narrower authorization exists that allows ONLY the insrc MCP server's tools to execute without requiring the blanket --auto-approve/bypassToolPermissions=true bypass that runVibe's verifyRuntime check (src/agent/providers/cli-provider.ts:699) currently treats as a sign the session is unsafe. If such a narrower mechanism exists, the read-only session should use it so the insrc analyze tools can run while the rest of the existing safety invariant (no blanket approval bypass) is preserved; if no such mechanism exists, the fix intent and its safety tradeoffs need to be decided as part of the design before any code changes.

## Citations

- **[[c1]]** `code` `src/agent/providers/cli-provider.ts:581-592`
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:666-716`
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:697-710`
- **[[c4]]** `code` `src/agent/providers/cli-provider.ts:118`
- **[[c5]]** `code` `src/agent/providers/cli-provider.ts:694`
