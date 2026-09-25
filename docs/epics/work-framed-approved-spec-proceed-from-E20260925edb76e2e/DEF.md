<!-- insrc:artifact DEF-edb76e2e4d41217d -->

# Epic: Developers using the insrc VS Code extension have no in-editor conversational surface for AI-assisted development that runs on the coding subscriptions they already pay for.

**Flavor:** enhancement
**Seeded from:** `SPEC-67260700545c57e7`

## Problem

Developers using the insrc VS Code extension have no in-editor conversational surface for AI-assisted development that runs on the coding subscriptions they already pay for. The editor's built-in AI chat pushes them toward a separate, paid token/model allowance, and the insrc extension today exposes only a status/repo-config webview — there is no chat at all. As a result a developer who already has working Claude/Codex CLI sessions must leave the editor (drop to a terminal) to hold an agentic coding conversation, loses the in-editor context of what the assistant is doing (no visible progress/lifecycle signal), cannot see or govern the code edits the assistant makes from within the editor, and has no in-editor way to review the design/plan documents the tracked workflow produces (that review surface exists only in the JetBrains IDE). The problem is the absence of a first-class, subscription-reusing, in-editor development-chat experience — with visible progress, edit visibility, and document review — for VS Code users.

## Non-goals

- **A JetBrains implementation of this chat interface** — VS Code ships first to prove the experience; JetBrains parity is a deliberately separate later phase so this Epic stays shippable.
- **Using the editor's built-in/Copilot paid token or model allowance for chat completions** — The entire motivation is to reuse the user's existing Claude/Codex subscriptions; consuming a separate paid allowance would defeat the purpose.
- **Daemon-mediated execution of the chat CLI subprocess** — Chat execution is deliberately extension-managed so the chat's controller CLI can be a different provider than the daemon's own reasoning provider and stream with lowest latency; the daemon still owns the graph/DB reached over IPC.
- **Storing chat history in the daemon** — History is kept extension-local (VS Code state / local files); pushing it into the daemon's stores is out of scope for v1 and unnecessary given the Claude-Code-style local-transcript model.
- **Ollama (or any plain-completion model) as a chat provider** — Ollama is a plain-completion model, not an agentic coding CLI (no native tool-use, file edits, or insrc MCP grounding), so it does not fit a coding-chat surface; future agentic CLIs such as OpenCode are a later phase.
- **Making the chat the orchestrator of insrc's tracked feature workflow** — This is a general-purpose passthrough dev-chat; the CLI controller already drives the tracked workflow itself via its insrc MCP + steering, so the extension must not duplicate that orchestration.
- **Switching the provider mid-conversation within a single chat** — Continuity relies on each CLI's native session resume, which is per-provider; switching means starting a new chat, keeping a clean one-chat-to-one-session mapping.

## Assumptions

- `med` The claude and codex CLIs each expose a machine-readable structured streaming mode (e.g. claude --output-format stream-json) and a native session resume/session-id mechanism the extension can drive per turn. [[c1]]
- `high` The existing VS Code webview surface pattern (a factory that takes injected deps, createWebviewPanelHost) can be reused as the construction idiom for the new chat panel and the new docs-review pane. [[c2]]
- `med` The daemon exposes, over its existing IPC, a listing of pendingApproval workflow artifacts and an approve/reject path (insrc_workflow_approve) that the extension can call to back a VS Code docs-review pane mirroring the JetBrains one. [[c3]]
- `med` Codebase grounding for chat turns is delivered by the controller CLI's own insrc MCP tool calls (the Claude-Code model), so no new extension-side context-assembly mechanism is required. [[c1]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | contract | The chat's CLI execution and streaming are extension-managed: the extension spawns and streams the claude/codex subprocess directly, bypassing the daemon for execution. | [[c1]] |
| `k2` | invariant | Cloud LLM access happens only through the user's installed claude/codex CLI OAuth sessions — no Copilot allowance, no direct cloud REST from the extension. | [[c4]] |
| `k3` | contract | Chat history is stored extension-local (VS Code state / local files), never in the daemon's graph/config store. | [[c1]] |
| `k4` | contract | The chat provider set is the agentic coding CLIs (claude/codex) only; Ollama and other plain-completion providers are excluded from this Epic. | [[c1]] |
| `k5` | contract | The docs-review pane operates only on daemon-tracked pendingApproval workflow artifacts and performs accept/reject through the daemon's approval flow (insrc_workflow_approve); it does not review ad-hoc chat-generated files. | [[c3]] |
| `k6` | stakeholder | The core chat panel presents a TERMINAL look & feel (monospace, box-drawing chrome, phosphor accents matching the insrc docs-site TUI aesthetic), NOT a chat-bubble/message-box UI; streaming reads like terminal output and lifecycle markers render as terminal-style status lines. | [[c5]] |
| `k7` | stakeholder | VS Code is delivered first; JetBrains parity is a later phase and outside this Epic. | [[c1]] |
| `k8` | invariant | The chat is a general-purpose passthrough surface; the extension renders and observes but does not orchestrate insrc's tracked workflow (the CLI drives that via its MCP + steering). | [[c1]] |

## Stories

### E20260925edb76e2e:S001 — Terminal-UX design system + mockups for the chat experience

**User value:** `size: M`

As a developer I get an in-editor chat that looks and reads like a terminal rather than a chat-bubble app, and the team gets terminal-styled mockups of every surface to build against.

**Extends:** [[c5]] [[c2]]

**Acceptance criteria:**

- **ac1:** Given the chat experience is being designed, when the terminal-UX design system and mockups are produced, then they define a terminal look & feel (monospace, box-drawing chrome, phosphor accents matching the insrc docs-site TUI aesthetic) and mock the core chat panel, the provider + history dropdowns, the inline-diff view, and the docs-review pane — explicitly not a chat-bubble/message-box style. _(operationalizes `k6`)_
- **ac2:** Given VS Code is the first delivery target, when the mockups are delivered, then they cover the VS Code webview surface only, with JetBrains parity left out of scope. _(operationalizes `k6`, `k7`)_

### E20260925edb76e2e:S002 — Run chat turns on the user's own agentic CLI with real-time streaming

**User value:** `size: L`

As a developer my chat turns run on my own claude/codex CLI subscription (not a paid Copilot allowance), and the extension streams the CLI's activity in real time.

**Acceptance criteria:**

- **ac1:** Given a chat turn is submitted for a selected agentic CLI (claude or codex), when the turn runs, then the extension spawns and streams that CLI subprocess directly, bypassing the daemon for execution, in the CLI's structured streaming mode. _(operationalizes `k1`, `k4`)_
- **ac2:** Given the chat must not consume a Copilot/editor token allowance, when a turn executes, then completion happens only through the user's own CLI OAuth session and the extension makes no direct cloud REST call. _(operationalizes `k2`)_
- **ac3:** Given the CLI emits a structured event stream, when events arrive during a turn, then the extension parses discrete events (assistant output, tool-call, file-edit, done) that downstream surfaces can consume. _(operationalizes `k1`, `k8`)_

**Local constraints:**

- `lc1` (contract) Turns are driven through each CLI's machine-readable structured stream mode (e.g. claude --output-format stream-json), parsed per turn into discrete events. [[c1]]

### E20260925edb76e2e:S003 — Hold a free-form dev conversation in a terminal-styled chat panel

**User value:** `size: L`

As a developer I can hold a free-form development conversation in a terminal-styled panel inside VS Code and watch the reply stream in.

**Depends on:** `s1`, `s2`

**Acceptance criteria:**

- **ac1:** Given the chat panel is open, when I type a message and submit it, then my turn is sent to the chat's CLI and the reply streams into the panel rendered as terminal output rather than chat bubbles. _(operationalizes `k1`, `k6`)_
- **ac2:** Given a turn is streaming, when output arrives from the CLI, then it appears incrementally in real time in the panel. _(operationalizes `k1`, `k6`)_
- **ac3:** Given this is a general-purpose passthrough dev-chat, when I ask anything (a question or a coding task), then the panel relays it to the CLI without the extension itself orchestrating a tracked workflow. _(operationalizes `k8`)_

### E20260925edb76e2e:S004 — See per-turn lifecycle markers as the assistant works

**User value:** `size: M`

As a developer I can see what the assistant is doing as a turn progresses — thinking, calling a tool, editing, done — shown as terminal-style status lines.

**Depends on:** `s2`, `s3`

**Acceptance criteria:**

- **ac1:** Given a turn is running, when the CLI emits stream events, then the panel shows terminal-style lifecycle markers reflecting per-turn status (thinking / tool-call / streaming / done). _(operationalizes `k6`)_
- **ac2:** Given the CLI calls insrc MCP tools during a turn, when those calls stream, then the markers are enriched to name the observed activity, without the extension driving the workflow itself. _(operationalizes `k6`, `k8`)_

### E20260925edb76e2e:S005 — Pick a provider per chat, resume past chats, keep conversation continuity

**User value:** `size: L`

As a developer I can choose which CLI a new chat uses, switch between past chats from a history dropdown, and each chat keeps its conversation across turns.

**Depends on:** `s3`

**Acceptance criteria:**

- **ac1:** Given I start a new chat, when I pick a provider (claude or codex) from the selector, then that chat runs on the chosen agentic CLI and its provider is fixed for the chat's lifetime (switching provider means starting a new chat). _(operationalizes `k4`)_
- **ac2:** Given I have multiple past chats, when I open the history dropdown and select one, then its transcript is restored from extension-local storage. _(operationalizes `k3`)_
- **ac3:** Given a chat with prior turns, when I send a new turn, then conversation continuity is maintained via the CLI's own native session resume rather than extension-replayed history. _(operationalizes `k1`)_

**Local constraints:**

- `lc1` (contract) Session continuity uses each CLI's native resume/session-id; the extension does not replay prior turns. [[c1]]
- `lc2` (contract) A chat's provider is fixed at creation; changing provider starts a new chat with its own native session. [[c1]]

### E20260925edb76e2e:S006 — See and govern the assistant's code edits as an inline diff

**User value:** `size: L`

As a developer I can see every code edit the assistant makes as an inline diff, and per session choose whether edits auto-apply (visualize-only) or require my accept/reject before hitting disk.

**Depends on:** `s2`, `s3`

**Acceptance criteria:**

- **ac1:** Given a session in auto mode, when the CLI edits a file, then the change is shown as an inline diff after it lands (visualize-only) in every mode. _(operationalizes `k1`)_
- **ac2:** Given a session in review mode, when the CLI attempts a code edit, then the extension shows an inline diff with accept/reject and the write reaches disk only on accept. _(operationalizes `k1`)_
- **ac3:** Given a per-session edit-mode toggle, when I switch between auto and review, then subsequent edits in that session follow the selected mode. _(operationalizes `k1`)_

**Local constraints:**

- `lc1` (contract) Edit handling is a per-session toggle between auto (visualize-only, render on-disk change) and review (extension-gated accept/reject before the write). [[c1]]
- `lc2` (contract) Review mode intercepts the CLI's edit/write tool calls before the write reaches disk. [[c1]]

### E20260925edb76e2e:S007 — Review the tracked workflow's pending documents inside VS Code

**User value:** `size: L`

As a developer I can review the tracked workflow's pending design/plan documents inside VS Code — read, comment, accept/reject — without leaving the editor or dropping to the TUI.

**Depends on:** `s1`, `s3`

**Extends:** [[c3]]

**Acceptance criteria:**

- **ac1:** Given the daemon has pendingApproval workflow artifacts, when I open the docs-review pane, then it lists those artifacts (Epic/HLD/LLD/DEF/Story) fetched over daemon IPC. _(operationalizes `k5`)_
- **ac2:** Given a listed artifact, when I read it and choose accept or reject, then the decision is applied through the daemon's approval flow (insrc_workflow_approve). _(operationalizes `k5`)_
- **ac3:** Given the pane mirrors the JetBrains review panel, when it renders, then it uses the terminal-styled VS Code webview vocabulary and acts only on daemon-tracked artifacts, not ad-hoc chat-generated documents. _(operationalizes `k5`, `k6`)_

## Citations

- **[[c1]]** `prior-artifact` `docs/standalone/complete-editor-development-chat-interface-insrc-E2026092567260700/SPEC.md (approved SpecArtifact 67260700545c57e7)` — "12 settled decisions: extension-managed CLI spawn/stream; grounding via the CLI's own insrc MCP; extension-local history; general-purpose passthrough; auto/review inline-diff; claude/codex only (Ollam"
- **[[c2]]** `analyze-bundle` `code structural-map of vscode-plugin/src` — "The only existing webview is panels/webview-host.ts createWebviewPanelHost (status/repo-config); NO chat webview exists. Factory+deps-injection idiom; functions camelCase, classes PascalCase, tests *."
- **[[c3]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ (ReviewToolWindow.kt, ArtifactContentPane.kt, ReviewComment.kt)` — "The JetBrains-only artifact-review panel (review/comment/accept/reject over pendingApproval artifacts via the approval flow) that the VS Code docs-review pane must mirror; no VS Code equivalent exists"
- **[[c4]]** `convention` `CLAUDE.md project principles (No direct cloud REST; cloud LLM via claude/codex CLI; daemon owns all DB access)` — "Cloud LLM access happens through the locally-installed claude and codex CLI binaries (via CliProvider). Direct REST providers must not be reintroduced. Daemon owns all DB access — IDE communicates via"
- **[[c5]]** `code` `site/css/tui.css (insrc docs-site TUI aesthetic)` — "Monospace-everything, box-drawing chrome, phosphor accents, dark-first terminal look & feel — the visual vocabulary the core chat panel must adopt."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-25T13:43:33.796Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c2/S001/S003 | citation | LOW | auto | The VS Code extension exposes a webview host factory createWebviewPanelHost in vscode-plugin/src/panels/webview-host.ts, which is the reuse idiom cited for the new chat + docs-review panels. | createWebviewPanelHost has 33 grep hits and the cited anchor vscode-plugin/src/panels/webview-host.ts:111 read back OK — the reuse idiom exists as cited. | No action; citation confirmed. |
| problem/c2 | citation | LOW | auto | No chat webview currently exists in the VS Code extension (the chat panel is net-new); the only webview is the status/repo-config one. | The only 'chat webview/ChatPanel/chat-panel' hits are in the SPEC.md and DEF.md docs; a scoped rg over vscode-plugin/src returns zero — confirming no chat webview exists in the extension (net-new). | No action; the net-new claim holds. |
| c3/S007 | citation | LOW | auto | The only artifact-review UI in the repo is the JetBrains one (ReviewToolWindow.kt / ArtifactContentPane.kt / ReviewComment.kt), which the VS Code docs-review pane (S007) must mirror; no VS Code equivalent exists. | jetbrains-plugin/.../review/ReviewToolWindow.kt:1 read back OK; the JetBrains artifact-review panel exists as the mirror source and no VS Code equivalent was found. | No action; citation confirmed. |
| c5/k6/S001 | citation | LOW | auto | The insrc docs-site TUI aesthetic exists at site/css/tui.css and is the visual vocabulary the terminal-look chat panel must adopt. | site/css/tui.css:1 read back OK — the docs-site TUI aesthetic the terminal chat panel adopts exists as cited. | No action; citation confirmed. |
| c1/k5/S007 | citation | LOW | auto | The daemon exposes an approval flow (insrc_workflow_approve) that the docs-review pane's accept/reject calls into. | insrc_workflow_approve / workflow.approve has 50 grep hits — the daemon approval flow the docs-review pane calls exists. | No action; citation confirmed. |
| c3/k5/S007 | citation | LOW | auto | The daemon has a notion of pendingApproval workflow artifacts the docs-review pane lists over IPC. | pendingApproval has 18 grep hits — the daemon's pendingApproval artifact concept the docs-review pane lists exists. | No action; citation confirmed. |
| seed | cross-artifact | LOW | auto | This DEF is seeded from the approved SpecArtifact SPEC-67260700545c57e7 and preserves its settled decisions (incl. Ollama excluded, providers claude/codex only). | The amended SPEC json read OK and the 'Providers are the agentic coding CLIs only / Ollama is excluded' text matched (1 hit) — the DEF's seed + Ollama-exclusion decision are preserved from the approved spec. | No action; cross-artifact trace confirmed. |
| stories | ordering | LOW | auto | The 7-story dependency graph is acyclic: s1,s2 are roots; s3 depends on s1,s2; s4 on s2,s3; s5 on s3; s6 on s2,s3; s7 on s1,s3. | DEF read OK; the declared dependency edges (s3<-s1,s2; s4<-s2,s3; s5<-s3; s6<-s2,s3; s7<-s1,s3) form no cycle — s1,s2 are roots and every edge points to an earlier-rooted story. | No action; the graph is acyclic. |
| c1/k1/lc1/S002 | external-contract | LOW | assisted | The claude and codex CLIs each expose a machine-readable structured streaming mode (e.g. claude --output-format stream-json) and a native session resume/session-id mechanism the extension can drive per turn. | stream-json / --resume / session-id patterns hit 15 references (docs/prompts), but these do not prove the external claude/codex CLIs' exact flags — this is an out-of-process contract. The DEF already records it as a MED-confidence assumption, which is the correct treatment for a DEF; it must be validated by a spike at design.story/build (S002). | Keep as a recorded assumption; validate the exact claude/codex structured-stream + session-resume flags with a small spike during S002's design/build. No DEF change needed. |
| c4/k2 | citation | LOW | auto | The project mandates cloud LLM access only via the local claude/codex CLI (CliProvider), no direct cloud REST — the constraint k2 the chat honours. | CliProvider / 'No direct cloud REST' / claude-codex-CLI patterns hit 50 references and CLAUDE.md read OK — the project mandate behind k2 is real as cited. | No action; citation confirmed. |
