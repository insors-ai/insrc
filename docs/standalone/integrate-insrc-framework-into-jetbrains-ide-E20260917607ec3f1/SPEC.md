<!-- insrc:artifact SPEC-607ec3f1d0604b86 -->

# Spec: Integrate the insrc framework into the JetBrains IDE family (IntelliJ IDEA/Java, PyCharm/Python, GoLand/Go, WebStorm/JS) as ONE IntelliJ-Platform plugin scaffolded in-repo as a Gradle/Kotlin subproject with its own CI lane, published to the public JetBrains Marketplace.

**Category:** design

## Intent

Integrate the insrc framework into the JetBrains IDE family (IntelliJ IDEA/Java, PyCharm/Python, GoLand/Go, WebStorm/JS) as ONE IntelliJ-Platform plugin scaffolded in-repo as a Gradle/Kotlin subproject with its own CI lane, published to the public JetBrains Marketplace. Phase 1 (MCP-now) auto-detects whichever of AI Assistant / Junie is installed and enabled (supporting both config formats, requiring neither specifically) and wires insrc-mcp into it, surfacing Analyze + Workflow as MCP tools and always passing an explicit `repo` argument sourced from the active project (no reliance on a shared $INSRC_REPO env value). It reuses insrc-daemon-install.sh for daemon lifecycle (detect missing/stale, then offer install/update, with no installer logic re-implemented in Kotlin), using system Node.js (>=20) when present on PATH and provisioning a private, plugin-managed Node runtime only when system Node is missing or too old (initial provisioning requires one-click consent; subsequent stale-daemon updates apply automatically). It injects the tracked-workflow discipline (triage, design, review-before-approve, present-and-ask, build) as steering into the JetBrains AI config via the existing steering-refresh mechanism, writing a marker-delimited, replace-only insrc block into each detected host's own native instructions file/location and leaving surrounding user content untouched. On project open the plugin runs both the daemon presence/staleness check and the repo-registration check; an unregistered project gets a one-click "Enable insrc for this project" notification (registration only on that click). Auth stays on claude/codex CLI OAuth; the indexer already parses all four target languages.

## Scope boundary

Phase 2 (native tool-window panes over the daemon's JSON-RPC socket at ~/.insrc/daemon.sock, the parity path toward the VSCode fork: analyze/workflow/docgen/daemon/repos/setup) is scoped but deferred out of this effort. When neither AI Assistant nor Junie is installed/enabled at project-open, the plugin silently skips MCP/steering wiring (no error, no nag) and re-checks on every subsequent project open, wiring automatically the moment a host later appears. On uninstall (not mere disable), the plugin removes its marker-delimited MCP server entry and steering block from each host config it wrote into, restoring those files to their pre-plugin state minus insrc's markers. The plugin does not silently auto-register projects, does not re-implement the installer in Kotlin, does not make direct cloud REST calls, does not add deep IDE-native features (LSP hooks, native refactorings, inspections) in Phase 1, and does not extend language coverage beyond Java/Python/Go/TS-JS.

## Non-goals

- Sibling-repo for the plugin — scaffolded in this repo instead
- Docs-only Phase-1 setup — the plugin auto-wires, it doesn't just document steps
- Plugin re-cloning/building the daemon in Kotlin — reuses the existing installer script
- Deep IDE-native features in Phase 1 (LSP hooks, native refactorings, inspections)
- Languages beyond Java/Python/Go/TS-JS (e.g. Scala) in the plugin scope
- Direct cloud REST calls — auth stays on claude/codex CLI OAuth sessions
- Requiring both AI Assistant and Junie present — Phase 1 wires whichever is detected
- Silent auto-registration of unregistered projects — registration is a one-click user action, not automatic
- System-Node dependency as a hard blocker — the plugin provisions its own Node runtime when system Node is absent or stale
- Repeated install consent prompts — only the first daemon provisioning is a click, later stale-daemon updates are silent
- Cleanup on mere disable — injected MCP entry and steering block are removed only on uninstall, not on disable
- Erroring or nagging when neither AI Assistant nor Junie is present — the plugin no-ops silently and re-checks on later project opens
- AI Assistant only in Phase 1; Junie wiring deferred to a fast-follow story
- Junie only in Phase 1; AI Assistant deferred
- Require both simultaneously as a Phase 1 completion gate — no ship until both are wired and steering-injected
- Silent auto-register: plugin calls `repo.add` automatically on project open if unregistered, then triggers indexing with no prompt
- Manual only: plugin never touches repo registration; user must still register via the `insrc` TUI Repos pane as today
- Private/self-hosted plugin repository (custom update-site URL added in IDE settings)
- Manual sideload of a CI-built plugin zip ('Install Plugin from Disk')
- Bundle plugin delivery into insrc-daemon-install.sh (installer drops the jar into the IDE's plugins dir)
- Fail-fast with instructions: surface the installer's own error (link to nodejs.org), user installs Node themselves then retries
- Always provision a private/bundled Node runtime under ~/.insrc/, used to run the installer + daemon regardless of system Node
- Document Node.js as an explicit Phase-1 prerequisite for all four IDEs; 'Enable insrc' checks and blocks with a doc link rather than auto-remedying
- Per-project env injection: when registering the MCP server in a given project's AI-host config, set $INSRC_REPO to that project's root — one registration per open project, no protocol change needed
- Single global daemon-selected 'active repo': plugin tells the daemon which project is focused, tools omit repo entirely
- Single shared markdown file — write one insrc steering file once and point both hosts' configs at it via an include/reference where supported
- MCP-description-only — embed the steering text in the MCP server/tool descriptions returned by insrc-mcp itself, no file write to the host's config at all
- Auto-silent every time: plugin runs the installer in the background on every missing/stale detection, notifying only on completion or failure
- One-click consent every time (same pattern as repo registration): a notification banner offers Install/Update, proceeding only on click
- Config-gated: one-click consent by default, with an opt-in plugin setting for silent auto-update
- Clean up on both disable and uninstall
- Never auto clean up — leave injected blocks in place regardless
- On IDE startup (plugin loads once per IDE session, regardless of project)
- Lazily, on first actual insrc MCP tool invocation by the AI host
- One-time notification pointing the user to install AI Assistant or Junie from the Marketplace, then stay silent
- Still register the project + start the daemon, but skip only the MCP/steering injection until a host appears

## Decisions

- **Auto-detect at runtime: wire whichever of AI Assistant / Junie is installed and enabled, supporting both formats but not requiring both present** — Phase 1 auto-wires insrc-mcp into "the IDE's AI host" — JetBrains ships two distinct agentic surfaces (AI Assistant and Junie) with different MCP/config formats. Which host(s) does Phase 1 actually wire, and how?
  - Ruled out: _AI Assistant only in Phase 1; Junie wiring deferred to a fast-follow story_, _Junie only in Phase 1; AI Assistant deferred_, _Require both simultaneously as a Phase 1 completion gate — no ship until both are wired and steering-injected_
- **Prompt-once: plugin detects an unregistered project and surfaces a one-click "Enable insrc for this project" notification; registration only happens on that click** — The repo registry is a strict, non-auto-allocating contract — a project's entities can't be indexed until it's registered via `repo.add`. For the plugin's "zero manual config" promise to hold for analyze/workflow to actually return results, something has to register the open JetBrains project as an insrc repo. What does the plugin do about registration when a project is opened that isn't yet registered?
  - Ruled out: _Silent auto-register: plugin calls `repo.add` automatically on project open if unregistered, then triggers indexing with no prompt_, _Manual only: plugin never touches repo registration; user must still register via the `insrc` TUI Repos pane as today_
- **Publish to the public JetBrains Marketplace** — How does a user actually get the plugin installed into their JetBrains IDE, and how do they receive updates?
  - Ruled out: _Private/self-hosted plugin repository (custom update-site URL added in IDE settings)_, _Manual sideload of a CI-built plugin zip ('Install Plugin from Disk')_, _Bundle plugin delivery into insrc-daemon-install.sh (installer drops the jar into the IDE's plugins dir)_
- **Tiered — detect and use system Node when present; provision a private Node runtime only when it's missing or too old** — insrc-daemon-install.sh hard-requires Node.js >=20 + npm on PATH and dies with an "install Node.js first" message if either is missing (scripts/insrc-daemon-install.sh:150-158) — that's the daemon lifecycle Phase 1 reuses as-is. WebStorm users likely already have Node, but IntelliJ IDEA/PyCharm/GoLand users often don't. Given zero-manual-config is a stated Phase-1 promise, what does the plugin do when it needs to install/update the daemon and system Node.js is absent or too old?
  - Ruled out: _Fail-fast with instructions: surface the installer's own error (link to nodejs.org), user installs Node themselves then retries_, _Always provision a private/bundled Node runtime under ~/.insrc/, used to run the installer + daemon regardless of system Node_, _Document Node.js as an explicit Phase-1 prerequisite for all four IDEs; 'Enable insrc' checks and blocks with a doc link rather than auto-remedying_
- **Always pass explicit `repo` argument on every tool call, sourced from the active project in the plugin's own context** — insrc_analyze_step / insrc_workflow_step resolve which repo they act on from $INSRC_REPO in the MCP server's own environment, with an explicit `repo` argument as override (per CLAUDE.md). JetBrains projects are separate windows/processes, each with its own repo — so each project's MCP registration needs to be scoped to that project's repo, not one shared env value. How does the plugin scope repo context per project?
  - Ruled out: _Per-project env injection: when registering the MCP server in a given project's AI-host config, set $INSRC_REPO to that project's root — one registration per open project, no protocol change needed_, _Single global daemon-selected 'active repo': plugin tells the daemon which project is focused, tools omit repo entirely_
- **Per-host native rules file — write a marker-delimited, replace-only insrc block into each detected host's own instructions file/location (mirrors the existing steering-refresh pattern), leaving any surrounding user content untouched** — Phase 1 injects the tracked-workflow discipline as steering into the JetBrains AI config, reusing the existing steering-refresh mechanism (today: a replace-only, marker-delimited block, used for the VSCode fork). AI Assistant and Junie each have their own native instructions surface with different file locations/formats, and a project may already have its own custom rules there. Where does the plugin actually write insrc's steering block, and how does it coexist with a user's existing rules?
  - Ruled out: _Single shared markdown file — write one insrc steering file once and point both hosts' configs at it via an include/reference where supported_, _MCP-description-only — embed the steering text in the MCP server/tool descriptions returned by insrc-mcp itself, no file write to the host's config at all_
- **Consent on first install, silent thereafter: initial provisioning requires one click; subsequent stale-daemon updates apply automatically** — Daemon lifecycle reuses insrc-daemon-install.sh and "offers to install/update" when the daemon is missing or stale. That script downloads/runs a shell installer and can restart a background process — a real side-effecting action, distinct from the read-only detection in decision 4. Should running it require explicit user consent, and if so, every time or just the first time?
  - Ruled out: _Auto-silent every time: plugin runs the installer in the background on every missing/stale detection, notifying only on completion or failure_, _One-click consent every time (same pattern as repo registration): a notification banner offers Install/Update, proceeding only on click_, _Config-gated: one-click consent by default, with an opt-in plugin setting for silent auto-update_
- **Clean up on uninstall only (not on mere disable)** — The plugin injects a marker-delimited MCP server entry and a marker-delimited steering block into shared host config files it doesn't own (AI Assistant / Junie's own instructions and MCP registration surfaces). When the plugin is later disabled or uninstalled, what happens to those injected artifacts?
  - Ruled out: _Clean up on both disable and uninstall_, _Never auto clean up — leave injected blocks in place regardless_
- **On project open, paired with the registration check from decision 2** — The plugin needs to detect a missing/stale daemon and offer to install/update it (decision 7's consent flow). At what point in the plugin's lifecycle does that check actually run?
  - Ruled out: _On IDE startup (plugin loads once per IDE session, regardless of project)_, _Lazily, on first actual insrc MCP tool invocation by the AI host_
- **Silent no-op: skip MCP/steering wiring entirely, re-check on every project open, wire automatically the moment a host later appears** — Decisions 1 and 9 cover the case where AI Assistant or Junie is installed. But what should the plugin do on project-open when NEITHER AI Assistant nor Junie is installed/enabled — the core auto-wiring promise has nothing to wire into?
  - Ruled out: _One-time notification pointing the user to install AI Assistant or Junie from the Marketplace, then stay silent_, _Still register the project + start the daemon, but skip only the MCP/steering injection until a host appears_

## Citations

- **[[c1]]** `step-output` `s1` — "Phase 1 ships one IntelliJ-Platform plugin (IntelliJ IDEA, PyCharm, GoLand, WebStorm) scaffolded in-repo as a Gradle/Kotlin subproject with its own CI lane, published to the public JetBrains Marketpla"
- **[[c2]]** `code` `scripts/insrc-daemon-install.sh:150-158` — "insrc-daemon-install.sh hard-requires Node.js >=20 + npm on PATH and dies with an "install Node.js first" message if either is missing"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — brainstorm (brainstorm)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-17T10:36:47.272Z

_No load-bearing premises were extracted._
