<!-- insrc:artifact LLD-edb76e2e4d41217d-s8 -->

# LLD: E20260926edb76e2e:S008

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790398081061-o81y85`
**HLD effective hash:** `e2745c4bac48...`

## HLD context

**Framework:** Layered extension-host core + a thin terminal-styled webview (alternative a1). All chat logic lives in vscode-free, deps-injected host modules that mirror the repo's existing createWebviewPanelHost(deps) factory idiom, so streaming, session, edit-governance and docs-review logic are unit-testable without a webview harness. The webview holds no business logic — it paints terminal-styled surfaces and emits user intents over a single typed, versioned message protocol. Each agentic CLI's native structured stream is normalized to ONE event union by a per-provider stream adapter, quarantining the still-to-spike claude/codex stream/resume contract at that boundary so no downstream surface is provider-specific. Grounding + tracked-workflow behaviour come through the CLI's own insrc MCP (the extension observes, never orchestrates — k8). This revision is a preserve-only application of amendment AMD-edb76e2e4d41217d-2: it adds story boundary s8 (restored-marker style fidelity) and changes nothing else in the shipped framework or contracts.
**Rollout phase:** Phase C — provider/history, edit governance, docs review & restore fidelity
**Consumes:** `sc1` (Terminal-UX design tokens + component vocabulary), `sc2` (Normalized CLI stream-event schema), `sc3` (Webview↔extension message protocol), `sc4` (Extension-local chat/session store shape)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The concrete mockup deliverables (per-surface terminal-styled mock images/HTML), the design-rationale write-up, and the exact palette/character choices are private to S001; downstream stories consume only the sc1 token/vocabulary contract, not the mock files themselves. — owns `sc1`
- `s2`: The subprocess spawn mechanics, the per-provider parsing of each CLI's NATIVE stream format, the exact claude/codex flags (the stream/resume spike), backpressure/cancellation handling, and error normalization stay private to S002; consumers see only the normalized TurnEvent union (sc2) and the StreamAdapter/ProviderRegistry interface (sc5). — owns `sc2`, `sc5`
- `s3`: The terminal renderer internals (how TurnEvents paint as terminal output), the input box, the panel/webview lifecycle and single-active-panel management, and the CSP/webview bootstrap are private to S003; other stories consume only the message protocol (sc3) and the session-store shape (sc4). — owns `sc3`, `sc4`
- `s4`: How status/tool-call TurnEvents are mapped to terminal-style marker lines, and how observed insrc MCP tool-calls are named/enriched into markers, are private to S004; it adds no new shared contract — it renders sc2 events as sc1-styled markers over sc3.
- `s5`: The provider-selector and history-dropdown UI, the new-chat vs open-chat flows, and the wiring of the StreamAdapter's native session-resume handle into a restored session are private to S005; it persists through sc4 and drives turns through sc5, adding no new shared contract.
- `s6`: The inline-diff renderer, the EditGovernor that applies the per-session auto/review toggle, and (review mode) the interception of the CLI's edit/write before the write reaches disk are private to S006; it consumes file-edit TurnEvents (sc2), the edit-mode field on the session (sc4), and the edit-prompt/edit-decision messages (sc3).
- `s7`: The docs-review pane and its DocsReviewClient over the existing daemon IPC (the exact pendingApproval listing + insrc_workflow_approve method names/payloads, pinned at the S007 LLD) and the mirroring of the JetBrains review/comment/accept-reject panel are private to S007; it consumes only the message protocol (sc3) and the terminal tokens (sc1) and adds no new shared contract to the Epic.

## Contract details

**Surface level:** internal-shared

### `appendEvent`

```typescript
appendEvent(s: ChatSession, ev: TurnEvent): void
```

**Parameters:**
- `s: ChatSession` — The active session whose transcript receives the row (sc4, consumed).
- `ev: TurnEvent` — The sc2 event to record.

**Returns:** `void` — The S004 host transcript writer (chat-panel.ts:~209), RESHAPED so a durable marker row now persists the sc1 cssClass alongside the label: it pushes { role:'marker', text: marker.label, cssClass: marker.cssClass } where marker = markerFor(ev). assistant-delta still -> role:'assistant'; status still skipped (transient); an unmapped kind (markerFor null) still writes no row.

**Preconditions:**
- marker = markerFor(ev) is non-null (a durable marker kind: tool-call/file-edit/done/error).

**Postconditions:**
- Each persisted marker row carries both text (the label) and cssClass (one of the five sc1 insrc-term__marker--* classes); no daemon write (k3), no workflow call (k8).
- The cssClass round-trips through the memento with the rest of the ChatSession (no store API change).

### `line`

```typescript
line(text: string, markerClass?: string): void
```

**Parameters:**
- `text: string` — The row text (via textContent — XSS-safe, unchanged).
- `markerClass: string` _(optional)_ — The sc1 marker class to set on the row <div>; omitted -> plain text row.

**Returns:** `void` — The S004-widened webview writer (chat-panel.ts:~90), CONSUMED unchanged by s8. The change is at its CALL SITE in the session-restored branch (chat-panel.ts:~94): the replay now passes the stored class — line(x.text, x.cssClass) — instead of line(x.text).

**Preconditions:**
- Called from inside the one nonce'd webview bootstrap script.

**Postconditions:**
- A restored marker row with a cssClass renders with its sc1 glyph + tone; a row without one (older data / user/assistant rows) renders as plain text — line() only sets className when markerClass is truthy.
- Still textContent-only (no innerHTML); no second <script>; CSP unchanged.

## Data model changes

### `TranscriptEntry.cssClass (session-store.ts, sc4)` — field-add

Add an optional `readonly cssClass?: string` to the sc4 TranscriptEntry. Set on marker rows (the sc1 class from markerFor); absent on user/assistant rows and on all pre-existing stored rows. Additive + backward-compatible: the memento JSON round-trip carries it automatically and isSession() (which only checks transcript is an Array) still validates old and new sessions. No store API/signature change, no migration. Current-behaviour invariant it changes: s1 bundle notes TranscriptEntry today is {role,text,at} with no style, so restored markers lose their glyph/tone (the S004 MED-1 regression).

```
  export interface TranscriptEntry {
    readonly role: 'user' | 'assistant' | 'marker';
    readonly text: string;
+   readonly cssClass?: string; // sc1 marker class for a role:'marker' row (S008)
    readonly at: string;
  }
```

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts (TranscriptEntry definition; round-tripped by get/save)`
- `vscode-plugin/src/chat/chat-panel.ts (appendEvent sets it on marker rows; the session-restored replay reads it into line(x.text, x.cssClass))`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | consumes | Consumes the sc4 store; proposes an ADDITIVE fieldAdd (optional readonly cssClass?: string on TranscriptEntry, owned by s3) via the amendment below. The ChatSessionStore interface + create/get/list/append/save signatures are unchanged; the field rides the existing memento round-trip. |
| `sc1` | consumes | The persisted cssClass value is exactly one of the five sc1 insrc-term__marker--* classes that renderTerminalStyle defines (glyph + phosphor tone); s8 does not modify design-tokens.ts. |
| `sc2` | consumes | The cssClass is computed by the s4 markerFor over the sc2 TurnEvent at write time; s8 reads the union as-is and does not reshape it. |
| `sc3` | consumes | Rides the EXISTING sc3 session-restored message: once TranscriptEntry carries cssClass, the restored transcript payload conveys it with NO new message type/field on the protocol — s8 adds nothing to sc3. |

## Error paths

### Error cases

- **A restored transcript row carries a cssClass that is not one of the five sc1 marker classes (corrupted store, or a future class the current sc1 does not define).** (recoverable)
  - Detection: The webview restore passes x.cssClass to line() as a className; an unknown class simply matches no sc1 ::before rule (there is no lookup/throw).
  - Response: Render the row text with that class applied but no glyph/tone (the class has no matching CSS rule) — i.e. it degrades to plain text; never throws. Optionally the host only writes classes from markerFor, so this only arises from external corruption.
  - User impact: A corrupted/unknown class shows the label as plain text instead of a glyph — no crash, no broken rendering.
- **A restored row is malformed (missing text, or cssClass is a non-string) after a partial/corrupt memento write.** (recoverable)
  - Detection: The webview restore forEach reads x.text / x.cssClass; the widened line(text, markerClass?) sets className only when markerClass is a truthy value and always sets textContent (so a non-string class is falsy-guarded).
  - Response: Skip the class (falsy -> no className) and render textContent; the S003 corruption-tolerant store already drops a whole malformed session to undefined before restore, so a per-row anomaly is the residual case and is rendered defensively.
  - User impact: The row still renders its text; at worst it loses its glyph — no exception in the one nonce'd script (which would break all later rows).

### Edge cases

| Input | Expected |
| :--- | :--- |
| A restored user or assistant row (role !== 'marker', no cssClass). | line(x.text, undefined) -> plain text row exactly as today; only marker rows carry a cssClass. |
| An older stored chat whose marker rows predate this change (no cssClass field). | x.cssClass is undefined -> line() sets no class -> plain-text marker (the S004 pre-fix look); no migration, no error (ac3). |
| A live marker row that was just appended (this session) and is then restored via open-chat without a reload. | It already carries cssClass (appendEvent set it), so it restores with full glyph + tone — identical to the live render. |
| A done marker with ok=false (label 'done (failed)'). | cssClass = insrc-term__marker--done (markerFor's value) is persisted + restored; the done glyph/tone shows, the failure is conveyed by the label text as in S004. |
| The live turn render path (turn-event message), unchanged by s8. | Still computes the marker webview-side via markerWebviewSource() and renders live; s8 only adds the persisted cssClass for the RESTORE path — no double-render, no change to live. |

### Invariants to preserve

- The webview keeps EXACTLY ONE nonce'd inline <script> under the strict CSP; s8 changes only the session-restored call site (line(x.text, x.cssClass)) inside that same script — no second script, no remote origin, no asWebviewUri. (s1 bundle: chat-panel.ts restore branch ~:94 within the one-script shell.) [[c2]]
- Marker rows render via textContent only (never innerHTML); cssClass is applied as a className attribute by the S004-widened line(), never interpolated into markup. The S003/S004 no-XSS invariant holds. (s1 bundle: chat-panel.ts line() writer.) [[c2]]
- Chat history stays extension-local via the injected Memento only; the cssClass persists on the transcript row through the existing round-trip — nothing is written to the daemon (k3). (s1 bundle: session-store.ts memento round-trip.) [[c1]]
- sc4 store API + round-trip are unchanged: create/get/list/append/save signatures are byte-identical and isSession() (which only checks transcript is an Array) still validates both old (no cssClass) and new rows — additive, no migration. (s1 bundle: session-store.ts isSession + round-trip.) [[c1]]
- The live render path is untouched: s8 only enriches the RESTORE replay + the persisted write; the turn-event/markerFor live rendering (S004) is unchanged, so restored == live with no duplicated mapper. (s1 bundle: chat-panel.ts appendEvent/markers.ts markerFor.) [[c2]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via tsx --test (no vscode runtime; FakePanel + fake StreamAdapter + in-memory ChatSessionStore double, matching session-store.test.ts / chat-panel.test.ts)`

### Test levels

- **unit** — Pin the sc4 round-trip of the new optional cssClass field + backward-compat, extending session-store.test.ts.
  - Subjects: `a marker TranscriptEntry with cssClass round-trips through append/save -> get(): the restored row's cssClass equals what was written`, `an older session whose marker rows lack cssClass still validates (isSession) + get()/list() return it unchanged (no field, no throw)`, `user/assistant rows never carry a cssClass`
  - Fixtures: `in-memory ChatSessionStore with deterministic now()/genId()`
- **integration** — Drive a turn + restore through createChatPanelHost (FakePanel + fake adapter + in-memory store) and assert persistence + restore rendering, extending chat-panel.test.ts.
  - Subjects: `a turn with tool-call(mcp)/file-edit/done events -> the persisted marker rows each carry cssClass = markerFor(ev).cssClass (ac2)`, `assistant-delta rows are role:'assistant' with no cssClass; status is not persisted (unchanged from S004/MED-2)`, `open-chat restore posts session-restored whose transcript marker rows include their cssClass (so the webview can style them)`
  - Fixtures: `fake StreamAdapter emitting a scripted status->tool-call(mcp)->file-edit->done sequence`, `in-memory ChatSessionStore double`
- **unit** — Assert the rendered shell's session-restored branch applies the stored class + preserves the S003/S004 CSP/XSS invariants (rendered-shell contract).
  - Subjects: `renderShell() session-restored replay calls line(x.text, x.cssClass) (passes the stored class), NOT line(x.text)`, `the shell still has EXACTLY ONE <script nonce=...> + strict CSP; line() sets textContent + className only (no innerHTML); no remote origin / asWebviewUri`, `a restore payload with a marker row lacking cssClass renders as plain text (no class), and a user/assistant row is unaffected`
  - Fixtures: `createChatPanelHost with a FakePanel + injected genNonce; a session whose transcript mixes marker rows (with cssClass) + an old marker row (without) + assistant rows`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit(shell): session-restored replay applies x.cssClass via line(x.text, x.cssClass) so a marker row renders with its insrc-term__marker--* class`, `integration: open-chat restore posts marker rows carrying their cssClass (the webview styles them with glyph+tone)` |
| `ac2` | `integration: after a turn, each persisted marker row's cssClass equals markerFor(ev).cssClass`, `unit(store): a marker row's cssClass round-trips through append/save -> get()` |
| `ac3` | `unit(store): an older session with cssClass-less marker rows validates + round-trips unchanged (no migration)`, `unit(shell): a restored marker row without cssClass renders as plain text (line() sets no class), no throw` |

## Migration

**State before:** Per s1 bundles: sc4 TranscriptEntry is {readonly role; readonly text; readonly at} with no style. chat-panel.ts appendEvent computes markerFor(ev) for a durable marker kind but persists only {role:'marker', text: marker.label} — marker.cssClass is dropped. The webview session-restored branch replays each row via line(x.text) with no class. So a reopened chat's markers render as plain text, indistinguishable from assistant output (the S004 MED-1 regression). markers.ts markerFor already returns {cssClass,label}; the S004-widened webview line(text, markerClass?) already sets className when a class is passed; live rendering already styles markers.

**State after:** sc4 TranscriptEntry gains an optional readonly cssClass?: string. appendEvent persists it on marker rows (marker.cssClass); it round-trips through the memento with no store API change. The webview session-restored replay passes it — line(x.text, x.cssClass) — so restored marker rows show their sc1 glyph + phosphor tone identically to live. Old stored rows lack the field and restore as plain text (no migration). Live rendering, sc1/sc2/sc3, and the store API are unchanged; the panel stays behind insrc.chat.enabled.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the optional readonly cssClass?: string field to the sc4 TranscriptEntry type in session-store.ts (additive; the memento round-trip + isSession() need no change). Nothing writes it yet. — ↩ rollbackable
2. In chat-panel.ts appendEvent, include cssClass: marker.cssClass when pushing a role:'marker' row (assistant-delta/status/unmapped paths unchanged). — ↩ rollbackable
3. In the chat-panel.ts webview session-restored replay, pass the stored class to the widened writer — line(x.text, x.cssClass) instead of line(x.text). Rows without a class (old data, user/assistant) render as plain text. — ↩ rollbackable
4. Extend session-store.test.ts (cssClass round-trips; old cssClass-less rows validate + restore) and chat-panel.test.ts (appendEvent persists cssClass; the shell restore replay applies x.cssClass; CSP/one-script intact); run the full sweep. — ↩ rollbackable

**Backward compat:** No public/shared-contract API is removed or reshaped: the sc4 ChatSessionStore interface + create/get/list/append/save signatures are byte-identical; cssClass is a new OPTIONAL readonly field on TranscriptEntry (a non-breaking fieldAdd). Existing stored sessions from S003/S004/S005 load unchanged — their marker rows simply lack cssClass and restore as plain text (the current behaviour), so NO data migration is required. line() keeps its S004 signature (the markerClass param is already optional); its restore call site just supplies the stored value. Live rendering + sc1/sc2/sc3 are untouched, so no other story is affected.

## Alternatives considered

### a1: Persist markerFor's cssClass on TranscriptEntry; restore replays it — **CHOSEN**

Add an optional readonly cssClass?: string to sc4 TranscriptEntry (sharedContract.fieldAdd, additive); host appendEvent stores marker.cssClass alongside the label; the webview session-restored replay passes it to the S004-widened line(x.text, x.cssClass).

One field carries the already-computed style through persistence. markerFor(ev) (s4, markers.ts) already returns {cssClass,label}; appendEvent already calls it for marker rows but drops the cssClass — s8 pushes {role:'marker', text: marker.label, cssClass: marker.cssClass}. The whole ChatSession JSON round-trips through the memento, so the field persists + reloads with no store API change (isSession() checks only that transcript is an array). On restore, the webview's session-restored branch changes from line(x.text) to line(x.text, x.cssClass) — line() is the S004-widened writer that sets className only when a class is present, so a row without cssClass renders as plain text (ac3, backward-compatible). No sc3 message change (the field rides the existing transcript payload); no design-tokens.ts change (the classes already exist).

### a2: Re-derive the marker class on restore (no persisted field)

Store nothing new; on restore, infer each marker row's cssClass from its persisted text/role by re-running a classifier.

Leave TranscriptEntry unchanged. On session-restored, for each role:'marker' row, attempt to reconstruct the sc1 class from the text (e.g. pattern-match 'done'/'done (failed)', a path, an 'server · name' tool label) or from role alone.

**Rejected because:** Avoids a contract change but VIOLATES ac1/ac2: the persisted label has already erased the kind, so restore cannot reliably recover the class, and nothing is stored to survive reload. Fundamentally cannot deliver the story.

### a3: Bake the glyph into the persisted marker text

Prepend the sc1 glyph char to the marker row's stored text so restore shows a glyph without any class (the S004-rejected a2 pattern).

When appendEvent writes a marker row, store text = `${glyph} ${label}` using terminalTheme.marker glyphs; restore prints it plain via the existing line(x.text). No field, no restore-render change.

**Rejected because:** Cheapest and shows a glyph on restore, but scores partial on ac1/ac2/sc1 because it drops the phosphor tone and couples persisted text to the glyph set — the same trade-off S004 already rejected for live markers. Loses to a1 on fidelity.

## Citations

- **[[c1]]** `analyze-bundle` `s1: session-store.ts (sc4) TranscriptEntry {role,text,at} + memento round-trip; isSession checks only transcript is an array` — "an added optional readonly cssClass?: string persists + reloads automatically; old rows validate fine; no migration"
- **[[c2]]** `analyze-bundle` `s1: chat-panel.ts appendEvent drops marker.cssClass + session-restored replays line(x.text) with no class (S004 MED-1); markers.ts markerFor returns {cssClass,label}; line(text,markerClass?) already accepts a class` — "persist marker.cssClass on the row + replay line(x.text, x.cssClass); one nonce'd script + textContent preserved"
- **[[c3]]** `analyze-bundle` `s1: sc1 marker classes (design-tokens.ts renderTerminalStyle) + sc3 session-restored (protocol.ts) consumed unchanged` — "the five insrc-term__marker--* ::before glyph+tone rules; session-restored carries transcript[] so the field rides the existing payload"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-26T05:09:16.359Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| data-model/TranscriptEntry | citation | LOW | auto | The sc4 TranscriptEntry type in session-store.ts is currently {readonly role; readonly text; readonly at} with no style field, so S008 adds an optional readonly cssClass?: string to it. | grep resolves `interface TranscriptEntry` at vscode-plugin/src/chat/session-store.ts:15; the HLD copy (HLD.md:124) shows the current shape {readonly role; readonly text; readonly at} with no style field. The additive optional cssClass?: string is therefore correctly premised. | none — verified sound |
| invariants/store-roundtrip | citation | LOW | auto | session-store.ts isSession() validates a session by checking only that transcript is an Array, so an added optional row field needs no migration and old rows still validate. | isSession at session-store.ts:67 checks typeof object + id/provider/createdAt/title/editMode strings and Array.isArray(s['transcript']) — it does NO per-ROW validation of transcript entries. So an added optional row field validates on both old and new sessions with no migration, exactly as the premise's load-bearing point requires. (Minor imprecision: it also checks session-level fields, not 'only' the transcript array, but that does not affect the additive-no-migration conclusion.) | none — verified sound |
| contract/appendEvent | citation | LOW | auto | chat-panel.ts appendEvent computes marker = markerFor(ev) for a durable marker kind and pushes a {role:'marker', text: marker.label} row, currently dropping marker.cssClass. | grep resolves `function appendEvent(s: ChatSession, ev: TurnEvent)` at chat-panel.ts:246 (LLD's ~209 is an approximate anchor that resolves to the intended writer). S004 LLD confirms it derives the marker row from markerFor(ev).label; the cssClass-drop premise is sound. | none — verified sound (actual line is chat-panel.ts:246) |
| contract/line | citation | LOW | auto | chat-panel.ts webview bootstrap defines a writer line(text, markerClass?) that sets className only when a marker class is passed and sets textContent (no innerHTML). | grep resolves the webview writer at chat-panel.ts:103: `function line(s,cls){const d=document.createElement('div');if(cls)d.className=cls;d.textContent=s;...}` — confirms the S004-widened signature line(text, markerClass?), className set only when truthy, textContent only (no innerHTML). Premise sound (LLD's ~90 is an approximate anchor to the same writer). | none — verified sound (actual line is chat-panel.ts:103) |
| migration/restore | citation | LOW | auto | The chat-panel.ts webview session-restored branch replays each transcript row via line(x.text) with no class, which S008 changes to line(x.text, x.cssClass). | grep resolves the session-restored replay at chat-panel.ts:115: `else if(m.type==='session-restored'){...t.textContent='';(m.transcript\|\|[]).forEach(x=>line(x.text));...}` — currently replays with line(x.text) and no class, exactly as premised; S008 changes it to line(x.text, x.cssClass). (LLD's ~94 is an approximate anchor to this branch, actual :115.) | none — verified sound (actual line is chat-panel.ts:115) |
| interaction/sc2-markerFor | semantic | LOW | auto | markers.ts markerFor(ev) returns a {cssClass,label} object (MarkerLine) so the cssClass to persist is already computed at write time. | grep resolves `export function markerFor(event: TurnEvent): MarkerLine \| null` at markers.ts:43; S004 LLD:36 confirms MarkerLine = {cssClass, label} with cssClass one of the sc1 marker classes. So the cssClass to persist is already computed at write time. | none — verified sound |
| interaction/sc1-classes | inventory | LOW | auto | There are exactly five sc1 marker classes (insrc-term__marker--pending\|tool\|edit\|done\|error) defined for glyph+tone, and S008 does not modify design-tokens.ts. | S004 LLD:36 enumerates exactly five sc1 marker classes: insrc-term__marker--pending\|tool\|edit\|done\|error; markerFor returns one of them. S008 modifies neither markers.ts nor design-tokens.ts. Inventory (5) confirmed. | none — verified sound |
| interaction/sc3 | semantic | LOW | auto | The sc3 session-restored message carries the transcript[] payload, so a new optional field on TranscriptEntry rides the existing message with no protocol change. | session-restored is typed `{ type: 'session-restored'; sessionId: string; transcript: TranscriptEntry[] }` (HLD.md:98) and posted with session.transcript at chat-panel.ts:287/304/338. The added optional field on TranscriptEntry rides this existing payload with no protocol change. | none — verified sound |
