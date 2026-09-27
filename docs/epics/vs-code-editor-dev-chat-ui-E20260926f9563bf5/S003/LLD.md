<!-- insrc:artifact LLD-f9563bf5bbb29c43-s3 -->

# LLD: E20260926f9563bf5:S003

**Epic:** `vs-code-editor-dev-chat-ui`
**HLD base run:** `wf-1790428640052-v7rbx8`
**HLD effective hash:** `8417b84c742c...`

## HLD context

**Framework:** Deliver the overhaul as ONE shared inline render layer plus an additively-widened event/protocol contract, both foundational in S001, with S002/S003/S004 building on them. S001 establishes (sc1) a message view-model derived at view time from the plain durable transcript + a render registry of inline widget renderers, and (sc2) the additively-widened TurnEvent + webview protocol (tool-call carries its command; the approval event/message + permission-mode are reserved shapes S004 fills). S002 restyles the shell chrome (fixed header, bottom-pinned input, icon-only Send/Stop, one animated progress widget) around the EXISTING DOM regions, preserving their stable element ids so it needs no cross-story contract. S003 adds the concrete renderers to sc1's registry (user/assistant differentiation, collapse-by-default 3-line preview for both roles + tool results/inline diffs via one shared chevron primitive, markdown + JSON widgets). S004 fills sc2's approval event + permission-decision message and adds a CLI permission-mode seam on the adapter spawn, plus an approval-card renderer and the auto-mode status indicator. The agreed mock (k5) and locked directions (k6) are implemented ONCE in the render layer. Everything inline under the nonce'd CSP (k1), the transcript stays plain + replayable (k4), the contract stays additive/non-breaking (k2), and permissions ride CLI flags with no REST (k3).
**Rollout phase:** Phase C — rich rendering
**Consumes:** `sc1` (MessageViewModel + inline RenderRegistry)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Owns the two foundations plus its own behaviours: the live user-prompt echo on submit (de-duplicated against the replayed row on session-restored, lc1), per-step assistant text via the view-model, surfacing the tool COMMAND (populating ToolCallEvent.command and a never-collapsed inline tool-command renderer), and the 32-char session-name ellipsis in the header. Introduces the view-model + registry and routes existing rows through it with flat line() kept as the fallback renderer, so no current row kind regresses. — owns `sc1`, `sc2`
- `s2`: Owns the shell chrome as pure layout over the EXISTING DOM regions: fixed header on top, bottom-pinned input with an icon-only Send/Stop button (▶ green / ■ red), and a single animated progress widget above the input (live-only, never written to the transcript). Preserves the stable element ids/regions (the transcript node, the status bar, the input) so the S001 render layer and the S004 approval card + auto-mode indicator slot into the same regions without S002 exposing a cross-story contract. Independent of S001 in the graph; both touch renderShell in separable ways (S001 the render script, S002 the shell CSS/controls) and both keep the element-id contract stable.
- `s4`: Consumes sc1 (registers the approval-card renderer) and sc2 (fills the approval-request event + permission-decision message + permission-mode). Owns the adapter permission seam: run claude with --permission-prompts host + a permission-prompt handler (codex: its approval routing) so a permission request surfaces as an approval-request event; relay the webview's approve/deny decision back to the CLI's permission channel; and a permission-mode seam on the spawn args (auto = --permission-mode/bypass; review = host-answered) driven by an auto/review selector shown in the status bar. All via CLI flags (k3), no REST.

## Contract details

**Surface level:** internal

### `renderRegistryWebviewSource`

```typescript
renderRegistryWebviewSource(): string
```

**Returns:** `string` — The existing sc1 factory source (render-registry.ts, S001). S003 REPLACES the bodies of the pre-registered 'user' and 'assistant-text' renderers (role-differentiated + collapse-when-long via host.collapsible) and ADDS 'assistant-markdown'/'assistant-json'/'tool-result'/'inline-diff' renderers into the same registry. The assistant renderer detects content-type (JSON.parse → JSON widget; markdown markers → markdown widget; else plain). All DOM via createElement/textContent/className, never innerHTML.

**Errors:**
- `none` when renderRow's per-row try/catch (S001) still falls back to line() if any renderer throws — one bad row never blanks the transcript.

**Preconditions:**
- Runs webview-side, inline under the nonce'd CSP (k1); consumes sc1 (does not edit toViewModel).

**Postconditions:**
- 'user' and 'assistant-text' rows are role-differentiated and collapse to a 3-line preview when long; assistant markdown/JSON render as widgets; tool-command stays inline/never-collapsed (k6 d); the RowKind set, toViewModel and the durable transcript are unchanged (k2/k4).

### `RenderHost.collapsible`

```typescript
collapsible(el: HTMLElement, opts: { defaultCollapsed: boolean }): HTMLElement
```

**Parameters:**
- `el: HTMLElement` — The content element to wrap (a message body, a tool-result body, or a diff body).
- `opts.defaultCollapsed: boolean` — S003 passes true for long messages + tool results + inline diffs (collapsed by default, k6 b/c).

**Returns:** `HTMLElement` — The sc1 shared collapse container with the icon-only chevron (▸/▾) + 3-line clamp (S001). S003 CONSUMES it — it does not re-implement collapse; that keeps k6 a/b single-sourced.

**Errors:**
- `none` when Pure DOM construction (S001).

**Preconditions:**
- Consumed from the sc1 RenderHost passed into each renderer; not re-implemented (k5).

**Postconditions:**
- Collapsed content shows a 3-line preview; the chevron toggles collapsed<->expanded; the tool-command renderer never calls it (k6 d).

### `register`

```typescript
register(kind: RowKind, r: RowRenderer): void
```

**Parameters:**
- `kind: RowKind` — One of the sc1 RowKinds S003 fills: 'user','assistant-text','inline-diff','tool-result' (and optionally 'assistant-markdown'/'assistant-json' aliased to the same widget builders).
- `r: RowRenderer` — The concrete inline renderer S003 supplies.

**Returns:** `void` — The sc1 registry mutator (S001). S003 CONSUMES it to install its renderers; it does not change register's shape.

**Errors:**
- `none` when Re-registering a kind replaces its renderer (S003 replaces S001's placeholder user/assistant-text bodies).

**Preconditions:**
- Called at factory-construction time inside renderRegistryWebviewSource, before renderRow dispatches.

**Postconditions:**
- Each S003 RowKind resolves to its concrete renderer; unregistered kinds still fall back to line() (k2).

## Data model changes

### `sc1 renderers in render-registry.ts (user / assistant-text bodies + markdown/JSON/tool-result/inline-diff)` — field-modify

Replace S001's placeholder 'user'/'assistant-text' renderer bodies (plain line()) with role-differentiated rows that wrap long content in host.collapsible({defaultCollapsed:true}) (ac1/ac2); the assistant renderer detects content-type and renders a markdown widget or a structured JSON widget else plain text (ac3), all via createElement/textContent (k1). Add 'inline-diff' (collapsible-to-caption over the hunk body) and 'tool-result' (collapsible, dormant — no producer, k2) renderers. The 'tool-command' renderer is left inline/never-collapsed (k6 d). toViewModel is NOT edited (consumed).

```
register('user', role-tone + collapsible-when-long)
register('assistant-text', role-tone + collapsible-when-long + content-type widget)
register('inline-diff', collapsible-to-caption)
register('tool-result', collapsible-to-caption)  // dormant until a producer emits it
```

**Call sites:**
- `vscode-plugin/src/chat/render-registry.ts`

### `S003 role + widget CSS in chat-panel.ts layoutStyle` — field-add

Add inline CSS tokens for the user vs assistant role tones (ac1) and the markdown/JSON widget + tool-result/inline-diff caption styling, reusing the existing RENDER_REGISTRY_STYLE collapse classes (S001). Inline under the CSP, no remote origin (k1).

```
+ .insrc-msg--user / .insrc-msg--assistant tones
+ .insrc-md-* (markdown widget) / .insrc-json-* (JSON widget) / tool-result caption classes
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | S003 consumes sc1: it registers concrete renderers into the existing RenderRegistry (via register), reuses RenderHost.collapsible for the icon-only chevron 3-line collapse, and reads only the plain RowViewModel. It does NOT edit toViewModel or the RowKind set (S001-owned); markdown/JSON classification is done at render time inside S003's assistant renderer, so no sc1 change and no HLD amendment. S004 later adds the 'approval' renderer to the same registry independently. |

## Error paths

### Error cases

- **Assistant text is almost-JSON (starts with { or [ but does not parse) or malformed markdown.** (recoverable)
  - Detection: The assistant renderer wraps content-type detection in try/catch: JSON.parse throws → not JSON; the markdown sniff is a marker test that either matches or not.
  - Response: Fall through to the next widget (JSON fail → try markdown → else plain text); never throw. The row always renders as at least plain text.
  - User impact: Ambiguous content shows as readable plain text instead of a broken widget.
- **A widget builder (markdown/JSON/collapse) throws while constructing DOM.** (recoverable)
  - Detection: sc1 renderRow's existing per-row try/catch (S001) catches any renderer throw.
  - Response: Fall back to the flat line() renderer for that row — one bad row never blanks or breaks the transcript.
  - User impact: The affected row shows as plain text; the rest of the conversation renders normally.
- **A pathologically large assistant message or deeply-nested JSON.** (recoverable)
  - Detection: The renderer bounds its work: the JSON widget renders only to a sensible depth/size and the collapse primitive clamps the preview to 3 lines (only the expanded view is full).
  - Response: Render a bounded widget (truncate depth / rely on the collapsed 3-line preview); no unbounded DOM growth per row.
  - User impact: Huge content stays compact by default (collapsed) and legible when expanded.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A short (< 3 line) user or assistant message. | Rendered with its role tone but NOT wrapped in the collapse primitive (nothing to collapse) — no chevron shown (ac2 only collapses long messages). |
| An assistant message that is exactly valid JSON. | Rendered as the structured JSON widget (ac3); the raw text is still the source (transcript unchanged, k4). |
| An assistant message with markdown (headings/lists/code fences). | Rendered as the inline markdown widget (createElement, no innerHTML); collapsed to a 3-line preview if long. |
| A tool-COMMAND row (from S001) alongside the new renderers. | Stays inline, single-line, never wrapped in collapse (k6 d) — S003 does not touch it. |
| A row whose kind is 'tool-result' (no producer emits it today). | The registered tool-result renderer exists but is never invoked; no behavioural change (dormant, k2). |
| A plain-text assistant message with no JSON/markdown markers. | Rendered as plain text with the assistant role tone (the content-type detection falls through to plain). |

### Invariants to preserve

- S003 CONSUMES sc1 — it registers renderers + reuses host.collapsible + reads the plain RowViewModel; it does NOT edit toViewModel or the RowKind set (S001-owned), so no cross-story boundary breach and no new event/protocol shape (k2). [[c1]]
- The icon-only chevron + 3-line clamp come from the SINGLE sc1 collapse primitive (RENDER_REGISTRY_STYLE); S003 reuses it rather than re-implementing collapse, so k6 a/b stay single-sourced (k5). [[c1]]
- All widgets build DOM via createElement/textContent/className, never innerHTML on assistant text, inline under the nonce'd CSP with no remote origin (k1). [[c1]]
- Rich rendering (widgets + collapse state) is derived at view time; the durable transcript stays a plain role/text/cssClass record and no rendered HTML is persisted (k4/lc1), and the sc1 fallback line() keeps every currently-handled row kind rendering so the ~203 chat tests stay green (k2). [[c1]]
- The tool-COMMAND renderer (S001) stays inline and is never collapsed by S003 (k6 d). [[c1]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (the vscode-plugin/src/chat suites: render-registry.test.ts for the eval'd renderers + chat-panel.test.ts for the shell/CSP invariants)`

### Test levels

- **unit** — Prove the S003 renderers in isolation by eval'ing renderRegistryWebviewSource() against a fake document + fake line (the render-registry.test.ts pattern): role differentiation, collapse-when-long, markdown/JSON widgets, and the tool-command never-collapse invariant.
  - Subjects: `the 'user' renderer emits a user-role-classed row and the 'assistant-text' renderer an assistant-role-classed row (distinct tones) — ac1`, `a long (>3-line) message is wrapped in host.collapsible (default-collapsed, icon-only chevron); a short message is NOT wrapped — ac2`, `the assistant renderer detects valid JSON → a structured JSON widget, and markdown → a markdown widget, and plain text → plain, all via createElement/textContent (no innerHTML) — ac3/k1`, `almost-JSON / a throwing widget falls through to plain text / the sc1 line() fallback (per-row isolation)`, `the 'tool-command' renderer is unchanged — inline, single line, never wrapped in collapse (k6 d)`, `the 'inline-diff' and 'tool-result' renderers wrap their body in host.collapsible collapsed-to-caption (k6 c)`
  - Fixtures: `the render-registry.test.ts fake document (createElement records className/textContent/children/listeners) + fake line()`, `sample RowViewModels: short/long user + assistant, a JSON string, a markdown string, a plain string`
- **integration** — Prove the shell still renders + the ~203 existing chat tests stay green after S003 registers its renderers (chat-panel.test.ts html/posted-message assertions; no DOM exec).
  - Subjects: `the rendered shell still has exactly one nonce'd inline <script>, no innerHTML, no remote origin after the S003 renderers + CSS are embedded (k1)`, `the existing chat-panel/cli-adapter/markers/render-registry suites stay green — sc1 fallback + toViewModel unchanged (k2), transcript stays plain (k4/lc1)`
  - Fixtures: `the existing FakeChannel + createChatPanelHost harness (genNonce fixed)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: the 'user' renderer emits a user-role-classed row and the 'assistant-text' renderer an assistant-role-classed row (distinct tones)` |
| `ac2` | `unit: a long (>3-line) message is wrapped in host.collapsible (default-collapsed, icon-only chevron); a short message is NOT wrapped` |
| `ac3` | `unit: the assistant renderer detects valid JSON → a structured JSON widget, and markdown → a markdown widget, and plain text → plain, all via createElement/textContent (no innerHTML)` |

## Migration

**State before:** The sc1 registry (render-registry.ts, S001) pre-registers placeholder renderers: 'user' and 'assistant-text' both render a plain line() row with NO role differentiation and NO collapse, and 'tool-command' renders inline/never-collapsed. host.collapsible (icon-only chevron + 3-line clamp) + RENDER_REGISTRY_STYLE exist but only the collapse primitive is defined — nothing consumes it yet. toViewModel maps an assistant message to kind 'assistant-text' (no markdown/JSON classification). RowKind already reserves 'assistant-markdown'|'assistant-json'|'tool-result'|'inline-diff'. So user/assistant look identical, long messages are not collapsed, and markdown/JSON render as flat text.

**State after:** S003 has REPLACED the 'user'/'assistant-text' renderer bodies with role-differentiated rows that wrap long content (>3 lines) in host.collapsible (default-collapsed, icon-only chevron) (ac1/ac2), the assistant renderer detects content-type and renders a markdown widget / structured JSON widget / plain text (ac3), and 'inline-diff'/'tool-result' renderers wrap their body in collapsible-to-caption (k6 c; tool-result dormant). The tool-command renderer is unchanged (inline, k6 d). toViewModel, the RowKind set, the sc2 contract and the durable transcript are all untouched; the sc1 fallback line() still covers every unmapped kind, so the ~203 chat tests stay green.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the S003 role-tone + markdown/JSON-widget + caption CSS to chat-panel.ts layoutStyle, reusing the existing RENDER_REGISTRY_STYLE collapse classes — additive, purely visual. — ↩ rollbackable
2. Replace the 'user' and 'assistant-text' renderer bodies in renderRegistryWebviewSource with role-differentiated rows that wrap content in host.collapsible({defaultCollapsed:true}) only when it exceeds ~3 lines; short messages render un-wrapped. — ↩ rollbackable
3. Add content-type detection to the assistant renderer: try JSON.parse → structured JSON widget; else markdown-marker sniff → markdown widget; else plain text — all via createElement/textContent, wrapped in try/catch that falls through to plain. — ↩ rollbackable
4. Register 'inline-diff' and 'tool-result' renderers that wrap their body in host.collapsible collapsed-to-caption (tool-result dormant until a producer emits it); leave the 'tool-command' renderer inline/never-collapsed. — ↩ rollbackable

**Backward compat:** S003 only CONSUMES sc1 — it re-registers renderers into the existing registry and adds CSS; it edits no public API signature (renderRegistryWebviewSource/register/collapsible/renderRow/toViewModel keep their shapes) and adds no event/protocol shape (k2). Re-registering 'user'/'assistant-text' replaces S001's placeholder bodies with richer ones that still render the same text (now differentiated/collapsible); the sc1 fallback line() still covers every other kind, so no current row kind regresses. The durable transcript schema is unchanged and no rendered HTML is persisted (k4/lc1). The tool-command renderer (S001) and the sc2 contract are untouched. A rollback restores the S001 placeholder renderers with no data migration.

## Alternatives considered

### a1: Render-time content-type detection in S003's own renderers; toViewModel untouched — **CHOSEN**

S003 registers role-differentiated user/assistant renderers that wrap long content in host.collapsible and, for assistant text, detect content-type at render time (JSON.parse-able → JSON widget; markdown markers → markdown widget; else plain) — sc1/toViewModel stay untouched.

S003 stays entirely a consumer of sc1: it REPLACES the bodies of the pre-registered 'user' and 'assistant-text' renderers and registers 'tool-result'/'inline-diff' renderers into the SAME registry. The user renderer emits a role-classed row (a --user tone) and the assistant renderer a distinct assistant tone (ac1). Both wrap their content in host.collapsible({defaultCollapsed:true}) ONLY when the text exceeds ~3 lines, giving the icon-only chevron 3-line preview (ac2) via the existing RENDER_REGISTRY_STYLE. For ac3 the assistant renderer inspects the plain view-model text: if it JSON.parse()s to an object/array it renders a structured JSON widget (inline key/value DOM via createElement + textContent); else if it carries markdown markers it renders a minimal inline markdown widget (headings/lists/code/emphasis via createElement, never innerHTML); else plain text. The tool-COMMAND renderer (S001) stays inline/never-collapsed (k6 d). tool-result/inline-diff renderers use host.collapsible collapsed-to-caption (k6 c) — inline-diff wraps the existing hunk rows; tool-result is dormant until a producer exists (no new event, k2). toViewModel/sc1 and the durable transcript are untouched (k4/lc1); all DOM is inline under the CSP (k1).

### a2: toViewModel classifies assistant content into assistant-markdown/assistant-json kinds (sc1 amendment)

Teach sc1's toViewModel to detect markdown/JSON and emit the reserved 'assistant-markdown'/'assistant-json' RowKinds; S003 registers one renderer per kind.

Same role-differentiation + collapse renderers as a1, but ac3 is driven by KIND: toViewModel (sc1, S001-owned) is taught to classify an assistant message and emit kind 'assistant-markdown' or 'assistant-json' (else 'assistant-text'); S003 registers a dedicated renderer per kind (each a pure kind→widget with no in-renderer sniffing). Because toViewModel is part of sc1 (owned by S001), this requires a small HLD amendment (storyBoundary.addConsumer or a note that S003 co-edits toViewModel's classification) or a back-flow to S001.

**Rejected because:** Behaviourally equal to a1 and arguably cleaner dispatch, but PARTIAL on sc1: it edits S001-owned toViewModel and needs an HLD amendment — a boundary breach the stay-in-scope rule says to avoid when a1 achieves the same user outcome in-boundary.

### a3: One unified message renderer for user+assistant (role + content branch in a single fn)

Register a single shared renderer for both 'user' and 'assistant-text' that branches internally on role (differentiation), length (collapse), and assistant content-type (markdown/JSON).

Instead of separate per-kind renderers, register ONE function for 'user' and 'assistant-text' that reads vm.role to pick the tone (ac1), wraps in host.collapsible when long (ac2), and — for assistant — detects markdown/JSON and renders the widget (ac3). tool-result/inline-diff still get their own renderers. sc1/toViewModel untouched, like a1.

**Rejected because:** In-boundary like a1 but a single fat renderer conflates three concerns, is harder to unit-test per-kind, and diverges from the per-kind registry design S004 extends — lower cohesion for no gain over a1.

## Citations

- **[[c1]]** `analyze-bundle` `vscode-plugin/src/chat/render-registry.ts (sc1 registry/collapsible/toViewModel) + chat-panel.ts (layoutStyle) + render-registry.test.ts (S003 s1 grounding)` — "sc1 (S001) exposes register/renderRow/collapsible (icon-only chevron + 3-line clamp) + toViewModel; S001 pre-registered placeholder user/assistant-text (plain line, no role/collapse) + tool-command (i"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-26T15:37:31.480Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contractDetails/renderRegistryWebviewSource | citation | LOW | manual | render-registry.ts exposes renderRegistryWebviewSource() whose factory provides register + renderRow + collapsible (the sc1 registry S003 registers into). | grep confirms renderRegistryWebviewSource (src) + `function renderRow` + `function collapsible` in render-registry.ts — the sc1 registry/collapse seam S003 registers into exists as cited. | None — confirmed. |
| migration/stateBefore | citation | LOW | manual | S001 pre-registered the 'user' and 'assistant-text' renderers as plain line() rows (no role differentiation, no collapse) — the placeholder bodies S003 replaces. | grep matches the exact placeholder bodies `register('user',function(vm){return line(vm.text)` and `register('assistant-text',function(vm){return line(vm.text)` (1 src hit each) — the plain-line renderers S003 replaces. | None — confirmed. |
| invariants/k6d | citation | LOW | manual | The 'tool-command' renderer renders inline via line() with the tool tone and does not use collapsible — S003 must leave it inline (k6 d). | grep matches `register('tool-command',function(vm){return line(vm.text,'insrc-term__marker--tool')` (1 src hit) — tool-command renders inline via line(), no collapsible (k6 d). | None — confirmed; S003 must leave it inline. |
| contractDetails/RenderHost.collapsible | citation | LOW | manual | The sc1 collapse primitive + its 3-line clamp already exist (RENDER_REGISTRY_STYLE with -webkit-line-clamp:3 + the icon-only chevron), so S003 reuses rather than re-implements collapse. | grep confirms `-webkit-line-clamp:3` (2 src) + `insrc-collapse__chevron` (7 src) + RENDER_REGISTRY_STYLE (7 src) — the sc1 collapse primitive + 3-line clamp exist; S003 reuses them (k5/k6 a/b single-sourced). | None — confirmed. |
| errorCases/renderer-throw | citation | LOW | manual | renderRow wraps each renderer in a try/catch that falls back to line(), so a throwing S003 widget cannot blank the transcript (per-row isolation). | grep matches `try{return r.render` + `REG.fallback.render` (1 src each) — renderRow's per-row try/catch fallback exists, so a throwing S003 widget falls back to line() (per-row isolation). | None — confirmed. |
| interactionWithShared | semantic | LOW | manual | toViewModel maps an assistant message to kind 'assistant-text' (no markdown/JSON classification), so S003's assistant renderer must content-type-detect at render time; S003 does not edit toViewModel. | grep confirms `function toViewModel` (2 src) mapping assistant→'assistant-text'; 'assistant-markdown' appears only in the RowKind type (1 src), not as a toViewModel output — so S003's render-time content-type detection is the right approach and toViewModel is not edited. | None — confirmed; toViewModel untouched. |
| search.text/tool-result | closed-union | LOW | manual | The TurnEvent union has no 'tool-result' producer (kinds: assistant-delta/tool-call/file-edit/status/done/error), so a 'tool-result' renderer is registered-but-dormant and k2 forbids adding a new event. | stream-events.ts:30 read found; grep shows the TurnEvent kinds (assistant-delta/tool-call/file-edit/status/done/error, 40 src) and 'tool-result' only as the RowKind type (1 src) with NO event producer — so the tool-result renderer is correctly dormant and no new event is added (k2). | None — confirmed dormant/reserved. |
| testStrategy | citation | LOW | manual | render-registry.test.ts evals renderRegistryWebviewSource() against a fake document + fake line — the harness S003's renderer unit tests extend. | render-registry.test.ts read found; grep confirms the eval'd-factory harness (makeRegistry/fakeDocument, 18 hits) — the pattern S003's renderer unit tests extend. | None — confirmed. |
| boundary | cross-artifact | LOW | manual | sc1 is owned by S001 and consumed by S003 per the approved HLD, so S003 registering renderers (not editing toViewModel) is in-boundary. | The bare-path HLD read returned found:false (no line anchor), but grep matched ownedByStory/sc1/consumedByStories and the LLD's embedded HLD slice records sc1 ownedByStory=s1 / consumedByStories includes s3 — the consumer trace holds (design.story ran on the approved HLD). | None — ownership/consumer trace confirmed via the approved HLD slice. |
