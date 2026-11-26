<!-- insrc:artifact SPEC-74e8a0cf59d3f57d -->

# Spec: Make Mistral Vibe a first-class CliProvider client using one shared plain-CLI execution adapter for backend requests and VS Code plugin chat, removing the vibe-app-server transport entirely while preserving plugin streaming.

**Category:** requirements

## Intent

Make Mistral Vibe a first-class CliProvider client using one shared plain-CLI execution adapter for backend requests and VS Code plugin chat, removing the vibe-app-server transport entirely while preserving plugin streaming. Model, effort, prompt transport, safety handling and the exact MCP tool naming are aligned by construction and qualified against the installed Vibe 3.1.4 (headless --model/--thinking, --approval-policy, custom agents, --enabled-tools, budget guards, --output-dir export evidence — live-confirmed 2026-11-24). Narrowly authorized insrc analysis tools are enabled in read-only sessions only when live qualification proves the no-blanket-bypass invariant; otherwise the session fails closed and analysis stays unavailable (ISSUE-d3e72fe73ee775a2). Hand-written TOML parsing is replaced with smol-toml across all identified daemon and plugin Vibe paths (ISSUE-0b3114f87754959b). The overlapping issue set is verified and reconciled: confirm the apparent prompt-transport fix (ISSUE-910fce32967bc4ea), identify remaining catalog gaps, and record the review-dependent issues as deferred pending the review rewrite.

## Scope boundary

The overhaul stops at the Vibe execution/config surfaces: the shared adapter replaces the backend CliProvider vibe paths and the plugin chat launch path, and the smol-toml replacement covers only the identified Vibe TOML paths (plugin MCP config writer, daemon registration checks, shared inline-list interpretation) with surgical edits that preserve unrelated user configuration. Review integration is out of scope until the review rewrite establishes its replacement (ISSUE-30962d0f44df1e76 and the review portion of ISSUE-738d62b848fd173f are recorded as deferred dependencies on it; 738d62b8's surviving catalog-coverage sub-point is verified within this scope). Read-only analysis authorization ships only on successful qualification — never via a blanket bypass. Issues close only with supporting evidence; no speculative closures.

## Non-goals

- Retain vibe-app-server as a backend transport or verification layer.
- Allow blanket permission bypass to enable read-only analysis tools.
- Restore removed review-activity or streaming-review machinery; review integration awaits the review rewrite.
- Plain CLI with temporary app-server fallback
- Retain app-server for selected requests
- Defer read-only MCP authorization
- Share launch rules; preserve chat UX
- Backend only
- Replace parsing only where the adapter needs it
- Defer TOML cleanup to separate tracked work
- Reconcile only directly implemented issues
- Document follow-ups only

## Decisions

- **Plain CLI only, with explicit safety qualification** — Installed Vibe 3.1.4 accepts headless model and thinking selection, removing the original reason for the transport split. Its flags alone do not establish equivalent tool-policy enforcement; choosing plain CLI does not authorize a blanket approval bypass.
  - Ruled out: _Plain CLI with temporary app-server fallback_, _Retain app-server for selected requests_
- **Qualify narrow authorization; fail closed** — Plain CLI with explicit safety qualification is settled. Installed Vibe's --enabled-tools does not bypass its separate agent approval gate; whether a custom policy or agent can safely authorize only the required analysis tools remains unproven.
  - Ruled out: _Defer read-only MCP authorization_
- **One shared execution adapter** — Plain CLI and fail-closed read-only authorization are settled. Plugin chat currently uses VIBE_ACTIVE_MODEL and its own prompt/streaming path, so its scope remains a material boundary decision.
  - Ruled out: _Share launch rules; preserve chat UX_, _Backend only_
- **Replace parsing across all identified Vibe paths** — ISSUE-0b3114f87754959b identifies three heuristic parsing areas; smol-toml is already a dependency, and the recent registration build required nine validation rounds hardening a hand-written lexer. Parser adoption must also preserve unrelated user configuration when editing files.
  - Ruled out: _Replace parsing only where the adapter needs it_, _Defer TOML cleanup to separate tracked work_
- **Verify and reconcile the issue set** — ISSUE-910fce32967bc4ea appears already fixed; ISSUE-30962d0f44df1e76 and the review portion of ISSUE-738d62b848fd173f depend on removed machinery, while the latter's catalog concern may still need verification.
  - Ruled out: _Reconcile only directly implemented issues_, _Document follow-ups only_

## Citations

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `code` `src/shared/vibe-session.ts` — "the vibe-app-server verified-session transport to be removed"
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts` — "CliProvider vibe paths: modelArgs() returns [] for vibe; runVibe switches to the app-server on explicit model/effort; READ_ONLY_SESSION_VIBE_TOOL_NAMES; runReviewSession removal"
- **[[c4]]** `code` `vscode-plugin/src/chat/cli-adapter.ts` — "plugin chat vibe mapper: --prompt= binding, VIBE_ACTIVE_MODEL pin, mcp_<server>_<tool> parser"
- **[[c5]]** `prior-artifact` `docs/standalone/vibe-s-read-only-session-cannot-E20261124d3e72fe7/ISSUE.md` — "--enabled-tools does not bypass vibe's separate agent-approval gate"
- **[[c6]]** `prior-artifact` `docs/standalone/read-vibe-configs-real-toml-parser-E202611090b3114f8/ISSUE.md` — "Read Vibe configs with a real TOML parser"
- **[[c7]]** `prior-artifact` `docs/standalone/pass-vibe-chat-prompts-correctly-programmatic-E20261105910fce32/ISSUE.md` — "Pass Vibe chat prompts correctly in programmatic mode"
- **[[c8]]** `prior-artifact` `docs/standalone/support-activity-supervised-reviews-through-mistral-E2026110430962d0f/ISSUE.md` — "activity-supervised reviews through Mistral Vibe CLI — predicated on removed review machinery"
- **[[c9]]** `prior-artifact` `docs/standalone/preserve-ollama-routing-claude-streaming-reviews-E20261110738d62b8/ISSUE.md` — "streaming reviews incl. Vibe — review portion depends on removed machinery; catalog-coverage sub-point survives"
