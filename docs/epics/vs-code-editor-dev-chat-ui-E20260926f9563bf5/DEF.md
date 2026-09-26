<!-- insrc:artifact DEF-f9563bf5bbb29c43 -->

# Epic: The in-editor dev-chat runs turns correctly but its conversation view does not faithfully represent what happens during a turn, and it gives the user no control or visibility over actions that need a decision.

**Flavor:** enhancement

## Problem

The in-editor dev-chat runs turns correctly but its conversation view does not faithfully represent what happens during a turn, and it gives the user no control or visibility over actions that need a decision. While a turn runs, the user's own submitted prompt never appears in the conversation — it only shows up later if the session is reloaded — so the transcript reads as a one-sided stream. The assistant's output and the tools it runs are surfaced as terse step labels rather than the actual assistant content or the actual command that was run, so a reader cannot tell what was said or done. Long messages are undifferentiated flat text with no visual distinction between the user and the assistant, no way to collapse a long block, and no legible rendering when the content is markdown or structured data. The panel chrome is not pinned, so the header and the input area drift with the conversation, there is no explicit send or stop affordance, and progress is shown by a status line that repeats inside the conversation instead of a single persistent indicator. Finally, when an action needs the user's permission the request is invisible in the chat, so the action is silently blocked with no way for the user to approve it and no signal of whether an automatic no-prompt mode is in effect.

## Non-goals

- **Changing the underlying claude/codex CLI providers, the daemon, or the analyze/workflow frameworks.** — Scope is the chat UI and its own event/protocol surface in vscode-plugin/src/chat + extension wiring; the backend is out of scope.
- **Adding provider integrations beyond claude and codex.** — The provider set is fixed for this epic; new providers are a separate concern.
- **Redesigning the docs-review pane.** — The docs-review surface (prior S007) is a distinct feature with its own approval flow; this epic is the chat turn loop only.
- **Persisting rich-rendered HTML (markdown/JSON widgets) into the durable session transcript.** — Rendering is a view concern; the stored transcript must stay a plain, replayable record so it round-trips across reloads and store versions (k4).

## Assumptions

- `high` The chat renders in a VS Code webview whose only script is a per-render nonce'd inline bootstrap under a strict CSP with no external network access. [[c1]]
- `high` claude runs headless via `-p --output-format=stream-json --verbose` and codex via `exec --json`; the adapter parses their streamed JSON into TurnEvents. [[c3]]
- `low` Whether headless claude -p / codex exec emit approvable tool-permission prompts and accept a permission-mode / --ask-for-approval flag is UNVERIFIED; it must be confirmed (HLD/spike) before the approvals story is designed. [[c3]]
- `high` The durable transcript already stores user/assistant/marker rows; the conversation-fidelity gap is live in-turn rendering, not storage. [[c1]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | convention | All webview rendering assets (styles, scripts, any markdown/JSON widget code) stay inline under the nonce'd CSP; no external network fetch from the webview. | [[c1]] |
| `k2` | contract | The shared TurnEvent + webview protocol contract is consumed by BOTH the adapter (producer) and the webview (consumer) and is covered by ~151 chat tests; any widening must keep every existing event kind + message working (additive, non-breaking). | [[c4]] |
| `k3` | contract | Cloud LLM access stays through the local claude/codex CLI subprocesses; no direct cloud REST is introduced (any permission-mode is a CLI flag, not an API call). | [[c5]] |
| `k4` | invariant | The durable session transcript stays a plain, replayable record (roles + text + cssClass); rich rendering is derived at view time and never persisted. | [[c1]] |
| `k5` | stakeholder | The visual result follows the AGREED UX mock for this epic (docs/epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/mocks.html) EXACTLY — no deviation. That mock is the single design source of truth for every story; the single-dark terminal palette + JetBrains Mono are inherited from the original approved S001 mock. | [[c2]] |
| `k6` | stakeholder | Agreed interaction directions (locked in review, no deviation): (a) collapse/expand is an ICON-ONLY chevron (▸ collapsed / ▾ expanded) — no text labels, no line-count; (b) long user AND assistant messages default-COLLAPSED to a 3-line preview (uniform across roles); (c) tool RESULTS and INLINE DIFFS are also collapsible via the same chevron, collapsing to their caption header, default collapsed; (d) the single-line tool COMMAND row stays inline and always visible (surfacing the real command is required by S001 ac3 — never collapse it away); (e) Send/Stop is an ICON-ONLY square button (▶ green Send at rest / ■ red Stop while a turn runs), no text label; (f) the session name is truncated to 32 chars with an ellipsis; (g) header is fixed on top and the input is pinned at the bottom — only the transcript scrolls; (h) a single animated progress widget sits above the input (live-only, never persisted) — no repeated inline 'thinking' rows; (i) tool-permission requests surface in-chat as an approve/deny card and the chosen auto/review mode shows in the status bar. | [[c2]] |

## Stories

### E20260926f9563bf5:S001 — Conversation fidelity: echo the user, show assistant text + tool commands, truncate the session name

**User value:** `size: M`

As a chat user I can read a faithful record of the turn as it happens — my own prompt, the assistant's actual output at each step, and the real command each tool ran — so I can follow and trust what the agent is doing.

**Extends:** [[c1]] [[c4]]

**Acceptance criteria:**

- **ac1:** Given a chat session is open, when the user submits a prompt, then the user's prompt appears in the conversation immediately as its own message, during the turn (not only after a later session reload). _(operationalizes `k2`, `k4`)_
- **ac2:** Given the assistant produces output across multiple steps of a turn, when each step arrives, then the assistant's actual response content for that step is shown, not merely a step/status label. _(operationalizes `k2`)_
- **ac3:** Given the agent runs a command-bearing tool during a turn, when the tool is invoked, then the actual command that was run is surfaced in the conversation, not just the tool's name. _(operationalizes `k2`)_
- **ac4:** Given a session whose name is longer than 32 characters, when the session name is displayed in the header, then it is shown truncated to 32 characters with a trailing ellipsis. _(operationalizes `k5`)_

**Local constraints:**

- `lc1` (invariant) The live user-prompt echo and the durable transcript must not double-render the same message on a subsequent session reload (the replay and the live echo agree on one user row). [[c1]]

### E20260926f9563bf5:S002 — Layout & input: fixed header, bottom-pinned input with Send/Stop, animated thinking indicator

**User value:** `size: M`

As a chat user I always have the header and the input in view and an obvious way to send or stop a turn, with a single clear progress indicator, so the panel is usable at any conversation length.

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given a conversation longer than the panel height, when the user scrolls, then the header stays fixed at the top and the input area stays fixed at the bottom while only the conversation area scrolls. _(operationalizes `k5`)_
- **ac2:** Given the input area, when the user wants to send a prompt or stop a running turn, then an explicit Send control submits the prompt and, while a turn is running, a Stop control cancels it. _(operationalizes `k5`)_
- **ac3:** Given a turn is running, when the agent is working (thinking/streaming/using a tool), then a single animated progress indicator is shown above the input area instead of repeated 'thinking' rows accumulating inside the conversation. _(operationalizes `k5`)_

**Local constraints:**

- `lc1` (invariant) The animated progress indicator is a live-only view element; it is never written into the durable transcript. [[c1]]

### E20260926f9563bf5:S003 — Rich rendering: differentiate user vs assistant, collapse long messages, render markdown/JSON

**User value:** `size: L`

As a chat user I can quickly tell my messages from the assistant's, keep long messages compact, and read markdown or structured output in a legible form rather than flat text.

**Depends on:** `s1`

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given a conversation with both user and assistant messages, when the messages are displayed, then user messages are visually differentiated from assistant messages. _(operationalizes `k5`)_
- **ac2:** Given a message longer than a few lines, when it is displayed, then it is collapsed to a ~3-line preview with a control to expand and re-collapse it. _(operationalizes `k5`)_
- **ac3:** Given assistant output that is markdown or structured data (e.g. JSON), when it is displayed, then it is rendered with a type-appropriate widget (formatted markdown / structured view) rather than as flat unstyled text. _(operationalizes `k1`, `k5`)_

**Local constraints:**

- `lc1` (invariant) Rich rendering (markdown/JSON widgets, collapse state) is derived at view time from the plain transcript; the stored transcript stays a plain replayable record and no rendered HTML is persisted. [[c1]]

### E20260926f9563bf5:S004 — Approvals & auto-mode: surface tool-permission requests and relay the chosen mode

**User value:** `size: L`

As a chat user I see when an action needs my permission and can approve or deny it in the chat, and when I choose an automatic mode the agent runs without blocking — so actions are never silently blocked with no way forward.

**Depends on:** `s1`

**Extends:** [[c3]] [[c4]]

**Acceptance criteria:**

- **ac1:** Given a running turn in which the agent needs permission to perform an action, when the underlying session requests that permission, then the request is surfaced to the user in the chat with approve and deny controls, rather than the action being silently blocked. _(operationalizes `k2`, `k3`)_
- **ac2:** Given a surfaced permission request, when the user approves or denies it, then the decision is relayed to the underlying session so the action proceeds or is declined accordingly. _(operationalizes `k3`)_
- **ac3:** Given the user has selected an automatic (no-prompt) mode, when a turn runs, then that mode is relayed to the underlying claude/codex session so it does not block on permissions, and the chat indicates that auto mode is active. _(operationalizes `k3`)_

**Local constraints:**

- `lc1` (contract) Before this story's surface is designed/built, it MUST be verified whether headless claude -p / codex exec emit approvable permission prompts and accept a permission-mode / --ask-for-approval flag; if they do not, the story's approach is revised in the HLD rather than built against an unverified CLI contract. [[c3]]
- `lc2` (contract) Any permission-mode is passed as a CLI flag to the local claude/codex subprocess; no direct cloud REST is introduced. [[c5]]

## Open questions

- Item a2: the low-confidence assumption (headless claude -p / codex exec permission behaviour is unverified) is carried as s4 localConstraint lc1 (a verification gate before S4 is designed/built) rather than a formal openQuestion field; the HLD must resolve it before S4.

## Resolved questions

- `q42234e8d` — Item a2: the low-confidence assumption (headless claude -p / codex exec permission behaviour is unverified) is carried as s4 localConstraint lc1 (a verification gate before S4 is designed/built) rather than a formal openQuestion field; the HLD must resolve it before S4.
  - **resolved**: Resolve it now with a headless CLI spike — Verified against the installed binaries: `claude -p` supports `--permission-mode` (incl. bypassPermissions/manual) and `--permission-prompts host|none` (host = the SDK host answers prompts; none = denied automatically, which is today's silent-block cause) plus --allowed-tools/--disallowed-tools; `codex exec` supports -s/--sandbox, approval-request routing, and --dangerously-bypass-approvals-and-sandbox, with --json events. Both expose headless permission handling + an auto/bypass flag, so S004 is designed on verified ground: host-answered permission prompts relayed to the webview + a permission-mode seam for auto/review. lc1 discharged. _(2026-09-26T13:17:04.244Z)_

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:167` — "renderShell() webview shell + nonce'd inline bootstrap; line() at :234 flat textContent; user prompt not echoed live (:262); durable transcript rows host-side."
- **[[c2]]** `doc` `docs/epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/mocks.html` — "The AGREED UX mock for this epic (v5) — single-dark terminal; icon-only chevron collapse (messages default 3-line, tool results + inline diffs collapse to caption); inline always-visible tool command;"
- **[[c3]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:140` — "claude ['-p', prompt, '--output-format=stream-json', '--verbose']; codex ['exec','--json',prompt] — no permission-mode / --ask-for-approval / auto flag; no approval event."
- **[[c4]]** `code` `vscode-plugin/src/chat/stream-events.ts:30` — "TurnEvent union + TURN_EVENT_KINDS consumed by adapter + webview; tool-call carries only the tool name; ~151 tests depend on it."
- **[[c5]]** `convention` `CLAUDE.md — Project principles` — "No direct cloud REST; cloud LLM access happens through the local claude/codex CLI binaries."
