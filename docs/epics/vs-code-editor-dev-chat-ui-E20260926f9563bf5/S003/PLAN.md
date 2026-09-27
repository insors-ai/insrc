<!-- insrc:artifact PLAN-f9563bf5bbb29c43-s3 -->

# Plan: E20260926f9563bf5:S003

**Epic:** `vs-code-editor-dev-chat-ui`
**LLD run:** `wf-1790436483527-1spdus`
**LLD effective hash:** `8417b84c742c...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add S003 role-tone + markdown/JSON-widget + caption CSS to chat-panel.ts layoutStyle | S | — | integration: the rendered shell still has exactly one nonce'd inline <script>, no innerHTML, no remote origin after the S003 renderers + CSS are embedded (k1) | [[c2]] |
| 2 | **`t2`** Role-differentiate the user/assistant-text renderers + collapse-when-long (ac1/ac2) | M | `t1` | unit: the 'user' renderer emits a user-role-classed row and the 'assistant-text' renderer an assistant-role-classed row (distinct tones); unit: a long (>3-line) message is wrapped in host.collapsible (default-collapsed, icon-only chevron); a short message is NOT wrapped; unit: the 'tool-command' renderer is unchanged — inline, single line, never wrapped in collapse (k6 d) | [[c1]] |
| 3 | **`t3`** Assistant content-type detection + markdown/JSON widgets (ac3) | M | `t2` | unit: the assistant renderer detects valid JSON → a structured JSON widget, and markdown → a markdown widget, and plain text → plain, all via createElement/textContent (no innerHTML); unit: almost-JSON / a throwing widget falls through to plain text / the sc1 line() fallback (per-row isolation) | [[c1]] |
| 4 | **`t4`** Register collapsible inline-diff + tool-result renderers (k6 c) | S | `t1` | unit: the 'inline-diff' and 'tool-result' renderers wrap their body in host.collapsible collapsed-to-caption (k6 c); integration: the existing chat-panel/cli-adapter/markers/render-registry suites stay green — sc1 fallback + toViewModel unchanged (k2), transcript stays plain (k4/lc1) | [[c1]] |

### E20260926f9563bf5:S003:T001 — Add S003 role-tone + markdown/JSON-widget + caption CSS to chat-panel.ts layoutStyle

Append inline CSS to renderShell's layoutStyle: user vs assistant role tones (.insrc-msg--user/.insrc-msg--assistant), the markdown widget (.insrc-md-*) + JSON widget (.insrc-json-*) styling, and the tool-result/inline-diff caption classes. Reuse the existing RENDER_REGISTRY_STYLE collapse classes (S001). Inline under the CSP, no remote origin.

**Acceptance checks:**
- renderShell html includes the .insrc-msg--user / .insrc-msg--assistant role tones and the markdown/JSON widget + caption classes
- still exactly one nonce'd inline <script>; no innerHTML; no remote origin (k1); every existing element id preserved

### E20260926f9563bf5:S003:T002 — Role-differentiate the user/assistant-text renderers + collapse-when-long (ac1/ac2)

In renderRegistryWebviewSource replace the placeholder 'user' and 'assistant-text' renderer bodies with role-classed rows (user tone vs assistant tone, ac1) that wrap their content in host.collapsible({defaultCollapsed:true}) ONLY when the text exceeds ~3 lines (ac2); short messages render un-wrapped. All via createElement/textContent (k1). The tool-command renderer is left untouched (inline, k6 d).

**Acceptance checks:**
- the 'user' renderer emits a user-role-classed row and the 'assistant-text' renderer an assistant-role-classed row (distinct tones) — ac1
- a >3-line message is wrapped in host.collapsible (default-collapsed, icon-only chevron); a <=3-line message is NOT wrapped — ac2
- the tool-command renderer is unchanged (inline, never collapsed, k6 d)
- renderers use createElement/textContent only (no innerHTML); a renderer throw still falls back to line() (per-row isolation)

### E20260926f9563bf5:S003:T003 — Assistant content-type detection + markdown/JSON widgets (ac3)

Extend the assistant renderer (t2) with content-type detection: try JSON.parse → render a structured JSON widget (inline key/value DOM); else a markdown-marker sniff → render a MINIMAL inline markdown widget (headings/list items/inline code/emphasis + code fences — not a full CommonMark parser) via createElement; else plain text. Wrap detection in try/catch that falls through to plain (never throws). Long widget output still collapses via t2's collapse wrapping. No innerHTML (k1). If the markdown widget grows beyond the minimal scope, split the JSON and markdown builders into separate build tasks (the unit tests isolate JSON vs markdown vs plain, so a split stays clean).

**Acceptance checks:**
- valid JSON → a structured JSON widget; markdown markers → a minimal markdown widget; plain text → plain (ac3)
- almost-JSON / malformed content falls through to plain text without throwing
- all widgets build DOM via createElement/textContent, never innerHTML (k1); the durable transcript stays plain (k4/lc1)

### E20260926f9563bf5:S003:T004 — Register collapsible inline-diff + tool-result renderers (k6 c)

Register 'inline-diff' and 'tool-result' renderers into the sc1 registry that wrap their body in host.collapsible collapsed-to-caption (default-collapsed, k6 c); inline-diff wraps the hunk body, tool-result is dormant until a producer emits it (no new event, k2). The tool-command renderer stays inline (k6 d).

**Acceptance checks:**
- the 'inline-diff' and 'tool-result' renderers wrap their body in host.collapsible collapsed-to-caption (k6 c)
- no new TurnEvent/protocol shape is added; tool-result is registered-but-dormant (k2)
- the tool-command renderer remains inline/never-collapsed (k6 d)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| the 'user' renderer emits a user-role-classed row and the 'assistant-text' renderer an assistant-role-classed row (distinct tones) — ac1 | `t2` |
| a long (>3-line) message is wrapped in host.collapsible (default-collapsed, icon-only chevron); a short message is NOT wrapped — ac2 | `t2` |
| the assistant renderer detects valid JSON → a structured JSON widget, and markdown → a markdown widget, and plain text → plain, all via createElement/textContent (no innerHTML) — ac3/k1 | `t3` |
| almost-JSON / a throwing widget falls through to plain text / the sc1 line() fallback (per-row isolation) | `t3` |
| the 'tool-command' renderer is unchanged — inline, single line, never wrapped in collapse (k6 d) | `t2` |
| the 'inline-diff' and 'tool-result' renderers wrap their body in host.collapsible collapsed-to-caption (k6 c) | `t4` |
| the rendered shell still has exactly one nonce'd inline <script>, no innerHTML, no remote origin after the S003 renderers + CSS are embedded (k1) | `t1` |
| the existing chat-panel/cli-adapter/markers/render-registry suites stay green — sc1 fallback + toViewModel unchanged (k2), transcript stays plain (k4/lc1) | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 dataModelChanges: sc1 renderers in render-registry.ts (user/assistant-text role+collapse, assistant markdown/JSON content widgets, inline-diff/tool-result collapsible; tool-command left inline)` — "Replace S001's placeholder user/assistant-text bodies with role-differentiated + collapse-when-long renderers; the assistant renderer detects content-type (JSON/markdown/plain); add inline-diff + tool"
- **[[c2]]** `prior-artifact` `LLD s3 dataModelChanges: S003 role + widget CSS in chat-panel.ts layoutStyle` — "Add inline CSS for the user/assistant role tones + markdown/JSON widget + tool-result/inline-diff caption styling, reusing the existing RENDER_REGISTRY_STYLE collapse classes; inline under the CSP, no"
