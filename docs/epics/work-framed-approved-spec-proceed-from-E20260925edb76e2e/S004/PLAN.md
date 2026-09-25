<!-- insrc:artifact PLAN-edb76e2e4d41217d-s4 -->

# Plan: E20260925edb76e2e:S004

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790356631554-prnqzz`
**LLD effective hash:** `f394a9ecb688...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** New pure markers.ts: MarkerLine + markerFor + markerWebviewSource | M | — | unit: markerFor maps every sc2 status phase (thinking/streaming->pending, tool->tool, editing->edit) to the right class + label; unit: markerFor(tool-call) -> tool class; label ev.tool with no mcp, `${server} · ${name}` with mcp; unit: markerFor file-edit/done(ok true+false)/error -> edit/done/error class + label; assistant-delta + unknown kind -> null (no throw); unit: every markerFor cssClass is one of the five insrc-term__marker--* stems | [[c1]] [[c2]] |
| 2 | **`t2`** Widen webview line() + route non-delta fall-through through the embedded mapper | M | `t1` | unit: renderShell() output routes non-delta turn-events through the mapper (applies insrc-term__marker--* class), not the bare '['+kind+']'; unit: rendered shell keeps EXACTLY ONE <script nonce=...> + strict CSP; line() sets textContent, never innerHTML | [[c3]] [[c5]] |
| 3 | **`t3`** Reuse host appendEvent via markerFor; fill the status/done gap | S | `t1` | integration: appendEvent records status + done role:'marker' rows (S003 gap) with markerFor(ev).label; assistant-delta still role:'assistant' | [[c4]] [[c5]] |
| 4 | **`t4`** Tests: markerFor parity + shell-routing contract + integration turn | M | `t1`, `t2`, `t3` | unit: eval(markerWebviewSource()) computes {cssClass,label} deepEqual to markerFor for every sample event (drift fails build); unit: markerWebviewSource() references only the five marker classes; no import / http(s): / asWebviewUri / vscode token; unit: renderTerminalStyle output (sc1) unchanged by S004 and defines all five marker ::before rules; integration: a status(thinking)->tool-call(mcp)->status(streaming)->file-edit->done(ok:true) turn posts a marker turn-event per event and persists status+done rows (reuse chat-panel.test.ts harness); integration: an insrc MCP tool-call renders an enriched 'insrc · insrc_analyze_step' marker while the host invokes no workflow tool (k8 passthrough) | [[c6]] [[c7]] |

### E20260925edb76e2e:S004:T001 — New pure markers.ts: MarkerLine + markerFor + markerWebviewSource

Add vscode-plugin/src/chat/markers.ts (vscode-free, pure): export interface MarkerLine {readonly cssClass; readonly label}; a single shared kind->{cssClass,label} decision table that BOTH markerFor and markerWebviewSource derive from (so they are structurally one source, per the s3 critique). markerFor(event: TurnEvent): MarkerLine | null is total over the sc2 union (assistant-delta->null; status thinking/streaming->pending, tool->tool, editing->edit + phase label; tool-call->tool with mcp?`${server} · ${name}`:tool; file-edit->edit path; done->done 'done'/'done (failed)'; error->error message), cssClass values exactly the five sc1 insrc-term__marker--* stems, plus a `const _never: never` exhaustiveness guard returning null on any unmapped kind. markerWebviewSource(): string returns a JS function-source mirroring that same table for the webview to embed inline (guards `event && typeof event.kind==='string'`, references only the five marker classes, no import/remote/vscode token).

**Acceptance checks:**
- markers.ts compiles under strict tsc, imports only the sc2 TurnEvent type, no vscode import
- markerFor is total: every sc2 kind returns a MarkerLine with a valid sc1 cssClass, or null for assistant-delta / unmapped kind (never throws)
- tool-call enrichment: label = `${mcp.server} · ${mcp.name}` when mcp present, ev.tool otherwise
- markerWebviewSource() returns a source string with no import / http(s): / asWebviewUri / vscode reference, derived from the same decision table as markerFor

### E20260925edb76e2e:S004:T002 — Widen webview line() + route non-delta fall-through through the embedded mapper

In chat-panel.ts renderShell bootstrap: widen `line(text, markerClass?)` to set the optional class on the row <div> (still textContent, never innerHTML), embed markerWebviewSource() inside the SAME one nonce'd script, and replace the :89 non-assistant-delta fall-through `'['+ev.kind+']'` with a call through the embedded mapper -> line(marker.label, marker.cssClass) (assistant-delta still plain text; unmapped/null -> skip). The :90 session-restore replay stays unchanged (plain text).

**Acceptance checks:**
- line() accepts an optional marker class and sets it via className only; still uses textContent (no innerHTML)
- non-assistant-delta turn-events render a <div class="insrc-term__marker--*"> with the mapper label, not the bare '['+kind+']'
- renderShell still emits EXACTLY ONE <script nonce=...> and the strict CSP (script-src 'nonce-...') unchanged
- the restore-replay path is untouched

### E20260925edb76e2e:S004:T003 — Reuse host appendEvent via markerFor; fill the status/done gap

In chat-panel.ts appendEvent (:205): derive every role:'marker' row's text from markerFor(ev).label (single-sourced with the webview), and ADD the previously-missing status and done marker rows; keep assistant-delta -> role:'assistant' and preserve the errored-turn persistence behaviour. No daemon write (k3), no workflow call (k8).

**Acceptance checks:**
- appendEvent records a role:'marker' row for status and done (previously dropped), with label from markerFor(ev)
- tool-call/file-edit/error marker rows now use markerFor(ev).label (single source with webview)
- assistant-delta still -> role:'assistant'; the S003 errored-turn persistence still holds; no new import of a workflow/MCP tool

### E20260925edb76e2e:S004:T004 — Tests: markerFor parity + shell-routing contract + integration turn

Add vscode-plugin/src/chat/__tests__/markers.test.ts (host<->webview parity + CSP-safe scan) and EXTEND the existing chat-panel.test.ts (reuse its FakePanel + fake StreamAdapter harness, no parallel harness): rendered-shell routes non-delta events to an insrc-term__marker--* class with one nonce'd script + CSP intact; integration: status->tool-call(mcp)->status->file-edit->done sequence persists status+done marker rows and enriches the insrc MCP marker while the host invokes no workflow tool. node:test + assert/strict, in-memory ChatSessionStore double.

**Acceptance checks:**
- markers.test.ts covers the parity (eval(markerWebviewSource()) deepEquals markerFor per kind) + the CSP-safe assertions
- chat-panel.test.ts (extended, same harness) asserts shell marker-routing (not the bare bracket), one nonce'd script + strict CSP, and status+done transcript rows via a scripted turn
- the full vscode-plugin chat sweep is green under tsx --test
- ac1 and ac2 each have >=1 passing proving test

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| markerFor(status{thinking\|streaming\|tool\|editing}) -> pending/pending/tool/edit class + 'thinking…'/'streaming…'/'running tool…'/'editing…' label | `t1` |
| markerFor(tool-call) -> tool class; label = ev.tool when no mcp, `${server} · ${name}` when mcp present (ac2) | `t1` |
| markerFor(file-edit) -> edit class + path label; markerFor(done{ok:true\|false}) -> done class + 'done'/'done (failed)'; markerFor(error) -> error class + message | `t1` |
| markerFor(assistant-delta) -> null; markerFor(unknown/forward kind) -> null (no throw) | `t1` |
| every returned cssClass is one of the five insrc-term__marker--* stems that renderTerminalStyle defines | `t1` |
| for each sample event, eval(markerWebviewSource()) and assert its {cssClass,label} deepEquals markerFor(event) (drift fails the build) | `t4` |
| markerWebviewSource() references only the five marker classes; contains no import / http(s): / asWebviewUri / vscode token | `t4` |
| renderShell() output routes the non-assistant-delta turn-event through the marker mapper (applies an insrc-term__marker--* class), NOT the old bare '['+kind+']' fall-through | `t2` |
| the shell still has EXACTLY ONE <script nonce=...> and the strict CSP (script-src 'nonce-...'); line() still uses textContent, never innerHTML | `t2` |
| renderTerminalStyle output (sc1) is unchanged by S004 (design-tokens.ts not modified) and defines all five marker ::before rules the classes rely on | `t4` |
| a status(thinking)->tool-call(mcp)->status(streaming)->file-edit->done(ok:true) sequence posts a turn-event per event AND appendEvent records a role:'marker' row for status and done (previously dropped) with markerFor(ev).label | `t3`, `t4` |
| an insrc MCP tool-call (mcp:{server:'insrc',name:'insrc_analyze_step'}) yields a marker row labelled 'insrc · insrc_analyze_step' and the host never invokes any workflow tool (k8 passthrough — fake adapter is the only side-effecting collaborator) | `t4` |
| assistant-delta still -> role:'assistant' (no marker row); the errored-turn persistence from S003 still holds | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails/markerFor + markerWebviewSource (the pure single-sourced mapper API)` — "markerFor(event: TurnEvent): MarkerLine | null; markerWebviewSource(): string — pure, total, no vscode import"
- **[[c2]]** `prior-artifact` `LLD s4 dataModelChanges/MarkerLine (new markers.ts module)` — "new module vscode-plugin/src/chat/markers.ts exporting MarkerLine + markerFor + markerWebviewSource"
- **[[c3]]** `prior-artifact` `LLD s4 contractDetails/line (widen the S003 webview writer + route non-delta fall-through)` — "line(text: string, markerClass?: string): void — the :89 fall-through now routes through the mapper instead of '['+kind+']'"
- **[[c4]]** `prior-artifact` `LLD s4 contractDetails/appendEvent (host transcript writer reuse + status/done gap)` — "appendEvent uses markerFor(ev).label and fills the previously-missing status + done marker rows"
- **[[c5]]** `prior-artifact` `LLD s4 migration (stateBefore->stateAfter render-seam edits + invariants)` — "widen line(), route the non-delta fall-through through markerWebviewSource(), add status+done host rows; one nonce'd script + CSP + textContent invariants preserved"
- **[[c6]]** `prior-artifact` `LLD s4 testStrategy unit levels (markerFor totality + host/webview parity + CSP-safe)` — "unit: markerFor per-kind + mcp enrichment; parity eval(markerWebviewSource()) deepEquals markerFor; markerWebviewSource() CSP-safe"
- **[[c7]]** `prior-artifact` `LLD s4 testStrategy contract + integration levels + acceptanceMapping (ac1/ac2)` — "contract: shell marker-routing + one nonce'd script/CSP; integration: status->...->done persists status+done rows + enriched insrc MCP marker (k8)"
