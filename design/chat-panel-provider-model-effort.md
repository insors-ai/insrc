# Chat panel: provider → model popup + effort gauge (design)

Proposed replacement for the chat panel's provider `<select>` with (a) a popup menu
that cascades provider → available model, and (b) an effort "gauge" button that opens
a slider of effort levels. Both controls live in the **bottom-right corner of the
panel** — the right end of the footer status bar (`.statusbar .right`) — and their
popups open upward from there. The selection is shown on the buttons themselves; there
is no persistent "next turn" indicator.

Mock: [`mocks/chat-provider-model-effort.html`](../mocks/chat-provider-model-effort.html) (interactive, standalone).

## Current state (what this replaces)

- `vscode-plugin/src/chat/chat-panel.ts` renders a footer status bar
  (`.statusbar`) holding `#insrc-provider` (a `<select>` over
  `providers.available` = installed claude/codex/vibe binaries) plus the attach
  button and the edit-mode select. Changing the provider posts
  `{type:'new-chat', provider}` and starts a new chat.
- The header `.chrome .right` holds only the session history chip (`#insrc-history`)
  and stays as-is.
- A chat session (`ChatSession` in `session-store.ts`) persists `provider`,
  `nativeSessionId`, `mode` — but no model or effort. The model/effort today come
  from the daemon's global tier config, not from the chat.
- Model metadata is already served by the daemon: `models.definitions` /
  `providers.listModels` (per family: `cliKind`, models with `efforts`, rejected
  ids) — typed in `vscode-plugin/src/models/definitions.ts`. The chat panel does
  not consume it yet.

## Goals

1. Pick **provider → model** from one popup in the header's right corner, replacing
   the footer provider dropdown.
2. Pick **effort** from a gauge button (shows the current level) that opens a
   slider of the available effort levels.
3. Selection is **per chat session** and persisted (survives reload, follows the
   session when switched), defaulting to the CLI's own default (shown as
   "default") so behavior is unchanged for existing sessions.
4. The choice reaches the spawned CLI: `--model/--effort` (claude),
   `-m/-c model_reasoning_effort=` (codex), `VIBE_ACTIVE_MODEL` env (vibe).

## UX spec

### Placement

Bottom-right corner: the footer status bar keeps attach + edit-mode on the left and
gains a right-aligned `.right` group holding the two new controls:

```
┌─ chrome ────────────────────────────────────────┐
│                                       [hist ▾]  │
├─ transcript ────────────────────────────────────┤
│ …                                               │
├─ input bar ─────────────────────────────────────┤
└─ statusbar ─────────────────────── [📎] [edits ▾] [claude · opus ▾] [◔ high] ┘
```

The old provider `<select>` is removed from the status bar. Both popups anchor to
the `.right` group and open **upward** (`bottom: calc(100% + 6px); right: 0`) so they
never cover the input.

### Provider/model popup (`#insrc-runbtn`)

- A single button labelled `<provider> · <model>` (model shown as its alias/display
  name or "default"). Chevron indicates it opens a menu.
- Click opens a right-aligned popup **above** the button: two scrollable panes
  (max-height capped) under tiny uppercase section labels — left **Provider**
  (installed only, from `providers.available`), right the **models** of the
  hovered provider, with a leading **default** entry (the CLI's own default model)
  followed by each served model (name + alias/id chip; rejected ids excluded).
  - Selection is shown as a **✓ check slot** on the left of the active item (not a
    full-row fill); hovering only previews the model pane, clicking commits.
  - One hint bar spans the popup's bottom ("provider change starts a new chat ·
    model change applies to the next turns"; once the chat has started: "provider
    is fixed once a chat has started · model and effort apply to the next turns").
- Selecting a model closes the popup and applies. Changing the **provider** posts
  `new-chat` (new session, as today) carrying provider + model + effort — **but only
  while the active session is still an empty draft**: once a chat has started (its
  transcript has rows), the other providers render disabled (`aria-disabled`, no
  handlers) in the provider pane, and the host refuses a `new-chat` naming a
  different provider, re-echoing the current `run-config`. Changing only the
  **model** (or effort) posts a run-config update that applies to subsequent turns
  at any time.
- The popup opens with a subtle 5px rise/fade (120 ms); Esc, click-outside or panel
  blur closes it; at most one popup is open. Plain host-rendered DOM (no remote
  resources), styled with the existing theme tokens, so the panel CSP is unchanged.
- Keyboard: Esc closes; arrows move within a pane; Enter applies.

### Effort gauge (`#insrc-effortbtn`)

- A compact button showing a gauge glyph + the **current effort level**
  (`high`, `max`, …) or `default` when unset. Disabled-looking (dimmed) when the
  selected model has no efforts (`efforts: []`, e.g. some ollama-hosted rows).
- Click opens a right-aligned popup **above** the button: a section label
  ("EFFORT"), a **horizontal slider with one tick + notch label per level** — a
  leading `default` notch followed by the selected model's `efforts` (when model =
  default: the family's union of efforts). The active tick/label is accent-highlighted;
  the current level is shown only on the gauge button itself (no duplicate readout
  inside the popup). The thumb snaps to notches; releasing the slider posts the
  run-config update, so the gauge label updates immediately. One note line at the
  bottom (vibe caveat, or "applies to the next turns").
- vibe caveat surfaced in the popup footer: vibe has no per-call thinking flag —
  the level is informational there and the model's `thinking` setting in
  `~/.vibe/config.toml` applies.

### Semantics

- Model/effort changes apply to **subsequent turns** of the current session; the
  popup never interrupts a running turn. There is no separate "next turn" readout —
  the buttons are the only indicator of the pending config.
- Provider change = new chat (existing behavior), carrying the currently shown
  model/effort so the button state carries over — but a **started** chat (rows in
  the transcript) keeps its provider: the webview derives `started` from the
  `session-restored` total (and the first submit) and disables the other providers
  in the popup; the host backstops it by refusing a cross-provider `new-chat` on a
  started session. Model/effort stay changeable for the rest of the chat.
- History/restore: the buttons reflect the active session's persisted
  `model`/`effort`.

## Data flow

```
daemon models.definitions ──▶ plugin gateway modelCatalog() ──▶ chat-panel render (families by cliKind)
                                                                      │
   providers.available (installed CLIs) ─────────────────────────────┤
                                                                      ▼
                                              bottom-right buttons (provider·model, effort gauge)
   webview ── new-chat {provider, model, effort} / set-run-config {model?, effort?} ──▶ host
                                                                      │
                                              ChatSession.model/effort (persisted, session-store)
                                                                      │
                                              TurnRequest { provider, model?, effort?, … }
                                                                      ▼
                                              cli-adapter mappers' buildArgs:
                                                claude: --model <m> --effort <e>
                                                codex:  -m <m> -c model_reasoning_effort=<e>
                                                vibe:   VIBE_ACTIVE_MODEL=<m> (new env opt on SpawnFn); effort not forwarded
```

- `cliKind` → `ProviderId`: `cli-claude→claude`, `cli-codex→codex`, `cli-vibe→vibe`
  (the same mapping the daemon's `familyForClient` uses).
- Model list per provider = that family's served models (shipped + user-approved,
  rejected excluded), exactly what `models.definitions` returns.
- Effort levels = selected model's `efforts`, else the family's union; `''`
  (absent) means the CLI default.

## Message / type changes (implementation backlog)

| File | Change |
|---|---|
| `chat/protocol.ts` | `new-chat` gains `model?`, `effort?`; new `set-run-config { model?, effort? }` |
| `chat/session-store.ts`, `session-file-store.ts` | `ChatSession` gains `model?`, `effort?` (optional, back-compat default = CLI default) |
| `chat/chat-panel.ts` | status-bar right-corner buttons + upward popups/slider markup, CSS, bootstrap handlers, message posting, footer provider select removed |
| `chat/cli-adapter.ts` | `TurnRequest` gains `model?`, `effort?`; per-mapper `buildArgs` mapping (table above); `SpawnFn` opts gain `env` for vibe's `VIBE_ACTIVE_MODEL` |
| `chat/turn-lifecycle.ts`, queue | pass model/effort through to `TurnRequest` |
| `models/` + gateway | a `modelCatalog()` read (wraps `models.definitions` IPC) for the panel |
| tests | panel render (popup contents, gauge states), message validation, mapper argv with model/effort, session persistence round-trip |

### Built (status)

Implemented as above, with two small deviations: the catalog read is wired as a
`definitions: () => client.rpc('models.definitions')` dep on `ChatPanelHostDeps`
(`extension.ts`), not a new `modelCatalog()` gateway function; and
`turn-lifecycle.ts` needed no change — it passes the `TurnRequest` through, so
model/effort ride along from the panel. The old provider `<select>` and its
runtime lock (`setProvLock`/`provLocked`) are removed entirely; a provider change
posts `new-chat` only on an unstarted draft — a started session's provider is fixed
(webview disables the other providers once `started`; the host refuses a
cross-provider `new-chat` and re-echoes `run-config`). Popup colours use only theme
variables (`--pop-shadow` → `--vscode-widget-shadow`, hover → `--sel`).

## Open questions

1. **Mid-session model change vs native resume**: claude pins the model per native
   session on `--resume`. Recommended default: always pass `--model`; if a resumed
   native session overrides it, the CLI wins and the popup is refreshed from the
   turn's actual args on next render. Confirm against the installed CLIs in the
   live suite.
2. **vibe effort**: not forwardable per call (no flag) — shown in the slider but
   applied only via the user's vibe `thinking` config. Alternative: write a
   per-invocation temp config — rejected for v1 (would fight the user's config
   layering); document instead.
3. **Queue/outbox**: queued messages capture the run config at enqueue time; a
   config change does not rewrite queued messages (consistent with provider change
   starting a new chat).

## Accessibility & safety

- Buttons are real `<button>`s with `aria-haspopup="menu"` / `aria-expanded`; the
  slider is an `input[type=range]` with `aria-valuetext` = the level label.
- All markup is host-rendered and attribute-escaped (`escapeHtml`), inline under
  the existing nonce — no new CSP surface, no remote fetches.
- Popup closes on Esc / outside click / panel blur; at most one popup open.
