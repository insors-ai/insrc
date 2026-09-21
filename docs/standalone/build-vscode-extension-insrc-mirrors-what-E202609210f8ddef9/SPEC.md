<!-- insrc:artifact SPEC-0f8ddef9b2d99e8e -->

# Spec: Build a new VS Code EXTENSION for insrc, living in-repo at vscode-plugin/ (mirroring jetbrains-plugin/), that packages insrc for stock, unmodified VS Code as a thin orchestrator owning no reasoning.

**Category:** design

## Intent

Build a new VS Code EXTENSION for insrc, living in-repo at vscode-plugin/ (mirroring jetbrains-plugin/), that packages insrc for stock, unmodified VS Code as a thin orchestrator owning no reasoning. It (a) wires the AI host's MCP server config + tracked-workflow steering block via a pluggable multi-host adapter (detecting/wiring whichever of GitHub Copilot Chat, Claude Code, Cursor, Continue, or Cline are present, each behind its own adapter, gated by a single combined consent toast), (b) manages the ~/.insrc/daemon lifecycle (install/update/start/stop mirroring daemon-ctl.sh), bootstrapping the installer itself — only after an explicit user-clicked Install prompt — when daemon-ctl.sh isn't found, (c) scopes to the open workspace/repo, prompting a one-time-per-workspace Register toast when the root isn't yet registered (never a silent repo.add), and (d) surfaces a minimal status view (a status-bar item opening a Quick Pick of lifecycle actions). Code sharing with the daemon/CLI is deliberately thin: a new src/shared/ipc-client package (IPC types + a lightweight Unix-socket client) imported by both the CLI/TUI and the extension. Every consent-gated action (register workspace, install daemon, wire AI hosts) also has a durable command-palette entry point. Published to the VS Code Marketplace only for v1.

## Scope boundary

v1 is phased and onboarding-first: ONLY MCP/steering wiring + daemon lifecycle + the minimal status-bar view ship. Deferred to follow-up work items: the config editor, the Daemon/Workflows/Debug pages, the artifact-review panel (these collapse into a SINGLE later settings release), and the context-menu repo actions. The extension is a stock-VS-Code extension only — not a VS Code fork and not a replacement for the insrc-ide fork (which remains the deeper integration path). No reasoning (LLM calls, analysis, graph queries) ever runs in the extension process — all of it stays behind daemon IPC. Sharing is limited to the thin IPC package — no daemon internals/indexer/storage. v1 publishes to the VS Code Marketplace only (Open VSX / manual VSIX for the fork editors is a fast-follow, not v1); the v1 status surface is a status-bar item + Quick Pick, not a webview or tree-view; nothing auto-registers, auto-installs, or auto-wires — each is explicit and consent-gated (wiring via one combined toast, not per-host).

## Non-goals

- Not a fork of VS Code - must run as an ordinary extension in stock VS Code
- Not a reasoning surface - no LLM calls, analysis, or graph queries run inside the extension process; all of that stays behind daemon IPC
- Not a replacement for insrc-ide - the fork continues to exist as the deeper IDE-integration path
- Not a deep code-sharing effort with the daemon/CLI - only IPC types + a thin socket client are shared, not indexer/storage/daemon internals
- Not full feature parity in v1 - config editor, Debug/Workflows pages, and artifact-review panel are deferred to follow-up work items
- Not an insrc-side publish to Open VSX or manual VSIX distribution for v1 - VS Code Marketplace is the only v1 publish target
- Not a dedicated webview or tree-view status panel in v1 - the status surface is a single status-bar item with a Quick Pick, not a richer custom view
- Not auto-registration - an unregistered workspace root gets a dismissible one-time toast, never a silent repo.add
- Not a context-menu surface in v1 - repo-action right-click items are deferred alongside the config editor / Debug / Workflows / artifact-review panel
- Not an unprompted daemon install - the installer only runs after the user explicitly clicks Install on a toast
- Not per-host wiring consent - detected AI hosts are wired (or declined) via one combined consent toast, not separate prompts per host
- Separate standalone repo
- Full workspace import — the extension imports directly from src/shared, src/daemon IPC client code, etc. as needed
- No sharing — the extension hand-rolls its own IPC client/types, kept in sync manually
- Single host: GitHub Copilot Chat only (native VS Code AI, .vscode/mcp.json)
- Single host: Claude Code (VS Code extension) only
- Host-agnostic file wiring only — write the MCP server entry + steering block to every known host config file found in the workspace, no per-host adapter code/detection logic
- Full parity v1 — build every surface (config editor, Daemon/Workflows/Debug pages, artifact-review panel, context-menu actions) in the first release
- Phased, but daemon+config first — ship daemon lifecycle plus the full config editor first, defer Workflows/Debug/artifact-review panel to later
- VS Code Marketplace + Open VSX from v1
- VSIX-only, no marketplace publish for v1
- Custom sidebar Tree View (new Activity Bar container)
- Webview panel
- Output channel only (no dedicated visual state), status surfaced via log lines and command palette actions
- Mirror JetBrains exactly — assume pre-installed, show a "run the installer" message
- Open an integrated terminal pre-filled with the install command
- Auto-register silently - call repo.add on the workspace root automatically on first activation, no prompt
- Prompt via the status-bar Quick Pick - surface a 'Register Repo' action (root + steering toggles) mirroring the JetBrains context-menu action, register only on explicit click
- Do nothing automatic - leave registration to the existing insrc CLI/TUI (Repos pane) or manual repo.add IPC call
- Include full parity in v1 — right-click 'Register Repo' + 'Show Repo Status' actions mirroring the JetBrains plugin
- Partial v1 — ship only 'Register Repo' in the context menu, defer 'Show Repo Status'
- Fully automatic, silent install — installer runs immediately on first activation with no prompt
- Automatic but visible — install runs immediately with a progress notification, no consent gate
- Automatic silent wiring — on activation, write MCP config + steering block into every detected host without prompting
- Prompt-gated per host — one toast per detected host ("Wire insrc into Claude Code? [Wire]") before any config write
- On-demand only — never wire automatically; require an explicit command ("insrc: Wire AI Host") the user runs manually
- No commands — the one-time toasts are the only entry point; retrying requires reopening the workspace (which re-fires activation)
- Fold retry actions into the existing status-bar Quick Pick (add 'Install Daemon' / 'Wire AI Hosts' / 'Register Workspace' entries there) instead of separate palette commands

## Decisions

- **In-repo, under vscode-plugin/ (mirrors jetbrains-plugin/)** — The JetBrains plugin already set precedent by living in-repo at jetbrains-plugin/ as a thin config-orchestrator (see jetbrains-plugin-epic memory) - this extension has the identical relationship to the daemon, so the same call is the natural default unless there's a reason to diverge.
  - Ruled out: _Separate standalone repo_
- **Thin shared package — extract just the IPC types + a lightweight socket client (e.g. src/shared/ipc-client) that both the CLI/TUI and the new extension import** — The extension is in-repo and, unlike jetbrains-plugin/ (Kotlin), is the same language (TypeScript) as the daemon/CLI. How much of that existing code should it import directly?
  - Ruled out: _Full workspace import — the extension imports directly from src/shared, src/daemon IPC client code, etc. as needed_, _No sharing — the extension hand-rolls its own IPC client/types, kept in sync manually_
- **Pluggable multi-host adapter — detect and wire whichever of GitHub Copilot Chat, Claude Code (VS Code ext), Cursor, Continue, Cline are present, each behind its own adapter** — Which VS Code AI host(s) should the extension wire MCP config + steering into, and via what mechanism? (This is the VS Code analogue of the JetBrains plugin's AiHostAdapterImpl, which detects AI Assistant vs Junie.)
  - Ruled out: _Single host: GitHub Copilot Chat only (native VS Code AI, .vscode/mcp.json)_, _Single host: Claude Code (VS Code extension) only_, _Host-agnostic file wiring only — write the MCP server entry + steering block to every known host config file found in the workspace, no per-host adapter code/detection logic_
- **Phased, onboarding-first v1 — ship MCP/steering wiring + daemon lifecycle + a minimal status view first; defer the config editor, Debug/Workflows pages, and artifact-review panel to follow-up work items** — The JetBrains plugin itself shipped this way — a 5-story phased epic (foundation → MCP-wiring → daemon-lifecycle → steering → onboarding) — with Settings/Debug/artifact-review panels arriving as separate follow-up epics well afterward, so this precedent strongly informs the recommended option.
  - Ruled out: _Full parity v1 — build every surface (config editor, Daemon/Workflows/Debug pages, artifact-review panel, context-menu actions) in the first release_, _Phased, but daemon+config first — ship daemon lifecycle plus the full config editor first, defer Workflows/Debug/artifact-review panel to later_
- **VS Code Marketplace only** — v1 already wires Cursor as one of the pluggable AI-host adapters (decision 3), but Cursor/Windsurf/VSCodium can't install from the official VS Code Marketplace — they use Open VSX (or manual VSIX) instead. Where should the extension itself be published for v1?
  - Ruled out: _VS Code Marketplace + Open VSX from v1_, _VSIX-only, no marketplace publish for v1_
- **Status bar item — a single daemon-state indicator (running/stopped/error) that opens a Quick Pick with lifecycle actions (start/stop/install) on click** — Follows directly from the v1-scope decision (phased, onboarding-first — status view only, no config/Debug/Workflows/artifact-review pages in v1); no prior decision has fixed the UI mechanism for that status view.
  - Ruled out: _Custom sidebar Tree View (new Activity Bar container)_, _Webview panel_, _Output channel only (no dedicated visual state), status surfaced via log lines and command palette actions_
- **Extension bootstraps the install itself (downloads + runs the installer)** — v1's daemon-lifecycle actions (install/update/start/stop) mirror daemon-ctl.sh — the same script the JetBrains plugin's DaemonLifecycleCommandRunner shells out to, which assumes daemon-ctl.sh is already on disk (normally placed by the standalone insrc-daemon-install.sh). On first activation, if no daemon-ctl.sh is found, what should the extension do? [design-stage refinement: to match the JetBrains trust model the extension BUNDLES the installer script in the VSIX and runs the BUNDLED script, not a remote download.]
  - Ruled out: _Mirror JetBrains exactly — assume pre-installed, show a "run the installer" message_, _Open an integrated terminal pre-filled with the install command_
- **Prompt via a one-time activation notification - VS Code toast with a 'Register' action shown once per workspace on first activation** — v1 scopes the extension to the open workspace/repo and bootstraps the daemon itself, but the repo registry is a separate contract (CLAUDE.md rule: "Repo registry is the contract" - repo.add is the only way a repo gets registered, storage never auto-allocates). When the extension activates on a workspace whose root isn't yet registered with the daemon, what should it do?
  - Ruled out: _Auto-register silently - call repo.add on the workspace root automatically on first activation, no prompt_, _Prompt via the status-bar Quick Pick - surface a 'Register Repo' action (root + steering toggles) mirroring the JetBrains context-menu action, register only on explicit click_, _Do nothing automatic - leave registration to the existing insrc CLI/TUI (Repos pane) or manual repo.add IPC call_
- **Defer entirely to follow-up work, alongside the config editor / Debug / Workflows / artifact-review panel** — Ties directly to decision 4 (phased onboarding-first v1: only MCP/steering wiring + daemon lifecycle + minimal status view ship) and decision 8 (activation toast already handles the unregistered-repo case) — the question is whether a third, JetBrains-parity UI surface is still needed in v1 given those two already exist.
  - Ruled out: _Include full parity in v1 — right-click 'Register Repo' + 'Show Repo Status' actions mirroring the JetBrains plugin_, _Partial v1 — ship only 'Register Repo' in the context menu, defer 'Show Repo Status'_
- **Prompt-gated — a toast ("insrc daemon not found — Install?") with an explicit Install action; nothing runs until the user clicks it** — Decision 7 settled that the extension bootstraps the daemon installer itself on first activation when daemon-ctl.sh isn't found — but should that download-and-run happen automatically, or behind an explicit user prompt first?
  - Ruled out: _Fully automatic, silent install — installer runs immediately on first activation with no prompt_, _Automatic but visible — install runs immediately with a progress notification, no consent gate_
- **Single combined consent — one toast listing all detected hosts ("Wire insrc into: Claude Code, Cursor? [Wire All]") with one accept/decline** — Decision 10 made daemon bootstrap consent-gated (explicit Install click) because it's invasive. MCP/steering wiring is similarly invasive — it edits the detected AI host's own config files (e.g. Claude Code's mcpServers.json, Cursor's MCP settings). Should that wiring happen automatically per detected host, or require explicit per-host user consent?
  - Ruled out: _Automatic silent wiring — on activation, write MCP config + steering block into every detected host without prompting_, _Prompt-gated per host — one toast per detected host ("Wire insrc into Claude Code? [Wire]") before any config write_, _On-demand only — never wire automatically; require an explicit command ("insrc: Wire AI Host") the user runs manually_
- **Register palette commands for each action ("insrc: Register Workspace", "insrc: Install Daemon", "insrc: Wire AI Hosts") so a declined/dismissed toast never becomes a dead end** — v1's daemon-install, AI-host wiring, and workspace-registration actions are all gated behind one-time/dismissible toasts (decisions 8, 10, 11). If a user dismisses or declines a toast, should there also be a durable command-palette entry point to retry that action later, or are the toasts the only way in?
  - Ruled out: _No commands — the one-time toasts are the only entry point; retrying requires reopening the workspace (which re-fires activation)_, _Fold retry actions into the existing status-bar Quick Pick (add 'Install Daemon' / 'Wire AI Hosts' / 'Register Workspace' entries there) instead of separate palette commands_

## Citations

- **[[c1]]** `step-output` `s1` — "Confirmed brainstorm elicitation: 12 recorded decisions + non-goals for the insrc VS Code extension (v1), user-confirmed convergence."
- **[[c2]]** `prior-artifact` `jetbrains-plugin epic + nested-settings-pages epic — the structural precedent this extension mirrors (thin config-orchestrator, in-repo jetbrains-plugin/, phased onboarding-first shipping, AiHostAdapter multi-host detection, settings/Debug/Workflows/artifact-review as later surfaces).`
