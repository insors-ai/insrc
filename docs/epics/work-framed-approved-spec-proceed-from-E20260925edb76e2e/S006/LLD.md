<!-- insrc:artifact LLD-edb76e2e4d41217d-s6 -->

# LLD: E20260926edb76e2e:S006

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790398081061-o81y85`
**HLD effective hash:** `e2745c4bac48...`

## HLD context

**Framework:** Layered extension-host core + a thin terminal-styled webview (a1); vscode-free deps-injected host modules; the extension observes, never orchestrates (k8).
**Rollout phase:** Phase C — provider/history, edit governance, docs review & restore fidelity
**Consumes:** `sc1` (Terminal-UX design tokens + component vocabulary), `sc2` (Normalized CLI stream-event schema), `sc3` (Webview↔extension message protocol), `sc4` (Extension-local chat/session store shape)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Mock deliverables + palette are private to S001; consume only the sc1 contract. — owns `sc1`
- `s2`: Subprocess spawn + native stream parsing + flags stay private to S002; consumers see only sc2/sc5. — owns `sc2`, `sc5`
- `s3`: Renderer internals, input box, panel lifecycle, CSP/webview bootstrap are private to S003; consume sc3/sc4. — owns `sc3`, `sc4`
- `s4`: status/tool-call → marker-line mapping private to S004; adds no shared contract.
- `s5`: provider-selector/history-dropdown + resume wiring private to S005; adds no shared contract.
- `s7`: docs-review pane + DocsReviewClient over daemon IPC private to S007; adds no shared contract.
- `s8`: marker cssClass persistence/replay private to S008; additive sc4 fieldAdd owned by s3.

## Contract details

**Surface level:** internal

### `createEditGovernor`

```typescript
createEditGovernor(deps: EditGovernorDeps): EditGovernor
```

**Parameters:**
- `deps: EditGovernorDeps` — Injected vscode-free seams: { baseline: WorkspaceBaseline; fs: FsSeam; computeDiff; render: EditRenderSeam; diffView: () => 'chat' | 'editor' }.

**Returns:** `EditGovernor` — S006-private vscode-free governor holding per-turn state (mode, baseline?, edits Map) in memory only (k3). Renders every edit as a diff (ac1); in review mode gates accept/reject with pre-turn-snapshot revert (ac2).

**Errors:**
- `none (total)` when Seam failures are caught and degrade (missing baseline -> visualize-only); never throws into the turn loop.

**Preconditions:**
- Constructed once per host; beginTurn precedes observe/resolveTurn per turn.

**Postconditions:**
- No direct vscode refs; nothing new persisted.

### `EditGovernor.beginTurn`

```typescript
beginTurn(input: { mode: 'auto' | 'review'; cwd: string }): Promise<void>
```

**Parameters:**
- `input: { mode: 'auto' | 'review'; cwd: string }` — The session editMode (sc4) + workspace root at turn start.

**Returns:** `Promise<void>` — Captures the pre-turn baseline before the CLI can write (deps.baseline.snapshot); non-git -> no-baseline (visualize-only).

**Errors:**
- `swallowed` when snapshot failure -> no-baseline mode; never blocks the turn.

**Preconditions:**
- Called immediately before adapter.run() so the snapshot predates any CLI write.

**Postconditions:**
- A baseline handle (or no-baseline flag) + empty edits map are ready.

### `EditGovernor.observe`

```typescript
observe(path: string): Promise<void>
```

**Parameters:**
- `path: string` — The path from an sc2 file-edit event (the signal a path changed this turn).

**Returns:** `Promise<void>` — First observe per path: reads baseline + current disk content, computes the diff itself (independent of sc2.diff; correct for codex empty-hunks + claude MultiEdit) and renders via deps.render per diffView(). Auto: visualize-only (ac1); review: track undecided.

**Errors:**
- `swallowed` when read/compute failure logs + skips that path; the turn continues.

**Preconditions:**
- beginTurn was called this turn.

**Postconditions:**
- The edit is visible as a diff; in review mode the path is tracked.

### `EditGovernor.resolveTurn`

```typescript
resolveTurn(): Promise<void>
```

**Returns:** `Promise<void>` — Turn-end (sc2 done/error): auto = no-op; review = surface accept/reject per undecided path; resolves when all decided or superseded/disposed.

**Errors:**
- `swallowed` when prompt failure / dispose mid-review leaves edits kept + clears state; never throws.

**Preconditions:**
- beginTurn + zero-or-more observe happened this turn.

**Postconditions:**
- Edits map cleared; no file modified except via an explicit reject.

### `EditGovernor.decide`

```typescript
decide(path: string, accept: boolean): Promise<void>
```

**Parameters:**
- `path: string` — Path from an sc3 edit-decision or the editor affordance.
- `accept: boolean` — true keeps disk; false reverts to the pre-turn baseline.

**Returns:** `Promise<void>` — accept keeps; reject restores the path's pre-turn baseline via deps.fs.write (or git checkout of the baseline object). Reject with no baseline is a no-op with a surfaced note.

**Errors:**
- `swallowed` when revert write failure logs + surfaces; does not throw.

**Preconditions:**
- path was tracked by observe in review mode this turn (unknown path ignored).

**Postconditions:**
- On reject with a baseline, the file equals its pre-turn state; path marked decided.

### `handleMessage`

```typescript
handleMessage(message: unknown): void
```

**Parameters:**
- `message: unknown` — sc3 WebviewToHost envelope; S006 fills the reserved default-case set-edit-mode + edit-decision (chat-panel.ts:313).

**Returns:** `void` — set-edit-mode: set session.editMode (validated) + store.save (sc4; S005 title-persist pattern) + re-render toggle. edit-decision: forward to governor.decide. Malformed payloads keep the existing drop-with-warn.

**Errors:**
- `validation` when non-'auto'/'review' mode or non-string path dropped (typeof guard).

**Preconditions:**
- Called from the single onMessage handler.

**Postconditions:**
- editMode persists per session (ac3); decisions reach the governor.

### `createChatPanelHost`

```typescript
createChatPanelHost(deps: ChatPanelHostDeps): ChatPanelHost
```

**Parameters:**
- `deps: ChatPanelHostDeps` — Existing deps extended with OPTIONAL editGovernance seams (baseline/fs/editorDiff) + diffView accessor; absent -> today's marker-only behavior.

**Returns:** `ChatPanelHost` — Turn loop reshaped: governor.beginTurn before adapter.run, observe(path) per file-edit, resolveTurn on the terminal event; the marker-row render (S004/S008) is unchanged.

**Preconditions:**
- extension.ts injects real vscode-backed seams (git baseline, fs, vscode.diff) + a diffView accessor reading insrc.chat.diffView.

**Postconditions:**
- Existing construction without the new deps still works (marker-only).

### `EditRenderSeam`

```typescript
interface EditRenderSeam { showChat(path: string, diff: UnifiedDiff, opts: { review: boolean }): void; showEditor(path: string, baseline: string | undefined, opts: { review: boolean }): Promise<void>; }
```

**Parameters:**
- `(type): interface` — Injected render seam for the two surfaces (ac4): showChat posts the sc3 edit-prompt (webview, sc1-styled); showEditor opens native vscode.diff.

**Returns:** `interface` — Keeps the governor vscode-free; chat rides sc3, editor rides injected vscode APIs (no protocol change).

**Preconditions:**
- diffView() selects the method.

**Postconditions:**
- Chat diff stays in the one nonce'd CSP script; editor uses native diff, no webview.

## Data model changes

### `EditGovernor per-turn state (in-memory, S006-private)` — new

{ mode; baseline?; edits: Map<path,{decided}> } created at beginTurn, cleared at resolveTurn; not persisted (k3); sc4 store shape unaffected.

```
interface EditGovernorState { mode: 'auto'|'review'; baseline?: BaselineHandle; edits: Map<string,{decided:boolean}>; }
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts (turn loop)`
- `vscode-plugin/src/chat/edit-governor.ts (new module)`

### `insrc.chat.diffView (package.json contributes.configuration)` — new

Plugin-local string enum 'chat'|'editor' (default 'chat'); read via getConfiguration().get(full dotted key) in extension.ts and passed as the diffView accessor; NOT in the daemon config-catalog (insrc.chat.enabled precedent).

```
"insrc.chat.diffView": { "type": "string", "enum": ["chat","editor"], "default": "chat" }
```

**Call sites:**
- `vscode-plugin/package.json`
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts`

### `ChatSession.editMode (sc4)` — field-modify

No SHAPE change — editMode already exists (default 'auto'). S006 begins writing (set-edit-mode -> store.save) + reading it per turn. Store API + round-trip unchanged.

```
// no shape change; editMode already present on ChatSession
```

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Chat-view diff renders with sc1 tokens (the 'inline-diff' SurfaceKind); does not modify design-tokens.ts. |
| `sc2` | consumes | Consumes file-edit as a SIGNAL only; computes its own diff from baseline vs current, so it never depends on/reshapes sc2's payload (owned by s2) — correct for codex + claude MultiEdit/Write. |
| `sc3` | consumes | Uses already-declared edit-prompt/edit-decision/set-edit-mode unchanged; editor surface adds no protocol message. No sc3 shape change. |
| `sc4` | consumes | Reads editMode per turn; writes via store.save on set-edit-mode (S005 pattern). No store API/shape change; nothing new persisted (k3). |

## Error paths

### Error cases

- **Non-git workspace / git unavailable, so no exact pre-turn baseline at beginTurn.** (recoverable)
  - Detection: deps.baseline.available(cwd) false or snapshot() rejects; beginTurn catches and sets a no-baseline flag.
  - Response: Degrade to visualize-only; review accept/reject disabled with a surfaced note; no throw.
  - User impact: Diffs still shown; revert unavailable in a non-git folder; auto unaffected.
- **A reject revert write fails (locked/permission/removed).** (recoverable)
  - Detection: deps.fs.write (or git checkout) rejects inside decide(); caught.
  - Response: Log + surface an error note for that path; leave disk as-is; mark decided so resolveTurn completes; never throw.
  - User impact: That file not reverted; user told; other paths unaffected.
- **An edited path is binary/non-UTF8 so a text line-diff is meaningless.** (recoverable)
  - Detection: computeDiff / fs read detects non-text (null bytes / decode failure).
  - Response: Render a 'binary file changed' row; review accept/reject still works via whole-file baseline restore.
  - User impact: User sees the change + can accept/reject without a garbled diff.
- **An edit-decision arrives for an untracked/already-decided path (stale/duplicate click).** (recoverable)
  - Detection: governor.decide finds the path absent or already decided in the edits map.
  - Response: No-op; no file touched.
  - User impact: None.

### Edge cases

| Input | Expected |
| :--- | :--- |
| Same path edited multiple times in one turn. | Baseline captured on FIRST observe only; diff is pre-turn-vs-final; exactly one decision. |
| The CLI creates a NEW file absent pre-turn. | baseline.read undefined -> all-additions diff; reject removes the created file; accept keeps. |
| Session in auto mode. | Every edit renders visualize-only (ac1); never prompts/reverts; resolveTurn no-op. |
| User switches edit-mode mid-turn. | editMode persists immediately (sc4) but applies from the NEXT turn (governor reads mode at beginTurn); the in-flight turn keeps its mode (ac3). |
| diffView='editor' but a native diff cannot open. | Falls back to the chat surface (sc3 edit-prompt); accept/reject still works; logged, not thrown. |
| A review-mode turn touches many files. | Each path gets its own diff + decision; resolveTurn completes when all decided (or disposed/superseded -> kept). |
| Panel disposed / turn superseded with decisions pending. | Pending edits kept on disk (not auto-reverted); per-turn state cleared; no forced decision. |

### Invariants to preserve

- Chat-view diff renders inside the EXISTING single nonce'd script under strict CSP (textContent/className only, no innerHTML, no remote origin); editor-view uses native diff (no webview) — neither weakens the S003 shell. [[c1]]
- The live marker-row render (S004/S008 appendEvent/markerFor) is UNCHANGED; S006 layers the diff view on top of the existing edit marker — no double-render. [[c1]]
- No shared-contract SHAPE change: sc3 already declares the edit messages, sc4 already has editMode; diffView is plugin-local config, not an Epic contract. [[c2]]
- Chat history stays extension-local (k3): the governor persists nothing new; the baseline/diff/decision state is in-memory only; only editMode persists (store.save). [[c2]]
- S006 consumes sc2 file-edit as a SIGNAL only and computes its own diff; it never reshapes sc2 (owned by s2) — correct across codex empty-hunks + claude Write/MultiEdit. [[c3]]
- Host + EditGovernor stay vscode-free: all vscode/git/fs/editor-diff via injected seams, unit-testable with fakes (k1/k2: no cloud REST, CLI-only). [[c1]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via tsx --test (no vscode runtime; FakePanel + fake StreamAdapter + in-memory ChatSessionStore + new fake baseline/fs + fake editor-diff render seams)`

### Test levels

- **unit** — Pin the EditGovernor lifecycle + revert in isolation (edit-governor.test.ts, new).
  - Subjects: `beginTurn snapshots once; observe computes+renders a diff (auto: visualize-only, no tracking)`, `review decide(reject) restores baseline content via the fake fs; decide(accept) keeps disk`, `same path observed twice keeps the first baseline (revert = true pre-turn)`, `new file (baseline undefined) -> all-additions; reject removes it`, `non-git -> no-baseline: visualize-only, reject no-op with note, no throw`, `provider-agnostic: a codex empty-hunk signal still yields a real diff from before/after`
  - Fixtures: `fake WorkspaceBaseline (in-memory, available() toggle)`, `fake FsSeam (read/write/remove)`, `fake EditRenderSeam capturing showChat/showEditor`, `deterministic computeDiff`
- **integration** — Drive a turn through createChatPanelHost with fake governance seams (chat-panel.test.ts).
  - Subjects: `review turn posts sc3 edit-prompt; edit-decision reject reverts via fake fs; accept keeps`, `auto turn posts NO edit-prompt + no revert; edit marker still renders`, `set-edit-mode updates+persists editMode; mid-turn switch applies next turn`, `diffView 'chat' -> showChat (edit-prompt); 'editor' -> showEditor + no edit-prompt`, `beginTurn before adapter.run; resolveTurn on terminal event`, `stale edit-decision for unknown/decided path is a no-op (no fs write)`
  - Fixtures: `scriptedAdapter submit->file-edit->done`, `in-memory store`, `fake governance seams via ChatPanelHostDeps.editGovernance + diffView`
- **unit** — Chat-view diff preserves the webview security shell.
  - Subjects: `edit-prompt diff renders inside the ONE nonce'd script; one <script>, strict CSP, textContent/className only, no innerHTML, no remote/asWebviewUri`, `hunk lines added via textContent, styled via sc1 className, never markup`
  - Fixtures: `createChatPanelHost + FakePanel + injected genNonce; a scripted review edit-prompt`
- **integration** — Setting contributed + wired (extension-chat-wiring.test.ts).
  - Subjects: `package.json has insrc.chat.diffView type 'string' enum ['chat','editor'] default 'chat'`, `extension.ts reads it via getConfiguration().get(full dotted key) + wires diffView into the host`, `editGovernance seams wired at construction`
  - Fixtures: `manifest JSON + extension.ts source-scan`
- **unit** — sc4 editMode round-trip (session-store.test.ts).
  - Subjects: `editMode 'review' round-trips through save()/get()`, `editMode defaults 'auto' on create (unchanged)`
  - Fixtures: `in-memory store with deterministic now()/genId()`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit(governor): auto-mode observe renders visualize-only (no prompt/revert)`, `integration: auto-mode turn renders the diff + posts no edit-prompt; edit marker still renders` |
| `ac2` | `unit(governor): review decide(reject) restores pre-turn baseline; decide(accept) keeps disk`, `integration: review turn edit-decision reject reverts via fs; accept keeps` |
| `ac3` | `integration: set-edit-mode updates+persists editMode; mid-turn switch applies next turn`, `unit(store): editMode round-trips` |
| `ac4` | `integration: diffView 'chat' -> showChat (edit-prompt); 'editor' -> showEditor + no edit-prompt; accept/reject identical`, `integration(wiring): insrc.chat.diffView contributed + read + wired` |

## Migration

**State before:** file-edit renders only as an edit marker (S004/S008); no diff view, no governance. handleMessage default case (chat-panel.ts:313) drops set-edit-mode/edit-decision. sc4 editMode exists (default 'auto') but is never read/written. No insrc.chat.diffView. Host is vscode-free; the CLI writes disk directly (k8); no snapshot/revert. Behind insrc.chat.enabled (default off).

**State after:** New vscode-free EditGovernor (edit-governor.ts) from injected seams. Turn loop: beginTurn (pre-turn baseline) -> observe (self-computed diff) -> resolveTurn. Auto = visualize-only (kept); review = accept/reject with pre-turn-baseline revert. handleMessage implements set-edit-mode (persists editMode) + edit-decision. insrc.chat.diffView ('chat'|'editor', default 'chat') selects the surface. sc2/sc3/sc4 shapes, live marker render, CSP shell, k3 all unchanged; still behind insrc.chat.enabled.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add edit-governor.ts (createEditGovernor + types) over injected seams; nothing wired yet. — ↩ rollbackable
2. Extend ChatPanelHostDeps with OPTIONAL editGovernance seams + diffView; absent -> today's behavior. — ↩ rollbackable
3. Reshape the turn loop: beginTurn before adapter.run, observe per file-edit, resolveTurn on terminal event; marker render unchanged. — ↩ rollbackable
4. Implement handleMessage set-edit-mode (persist editMode) + edit-decision (-> decide); keep drop-with-warn for malformed. — ↩ rollbackable
5. Render the edit-mode toggle + chat-view inline diff inside the existing nonce'd script (sc1 tokens, textContent/className only). — ↩ rollbackable
6. Add insrc.chat.diffView enum to package.json contributes.configuration (default 'chat'). — ↩ rollbackable
7. Wire extension.ts: read diffView (full dotted key) + inject real git-baseline/fs/vscode.diff seams into createChatPanelHost. — ↩ rollbackable
8. Extend edit-governor.test.ts (new) + chat-panel.test.ts + extension-chat-wiring.test.ts + session-store.test.ts; run the full sweep. — ↩ rollbackable

**Backward compat:** No public/shared-contract API removed or reshaped. sc2/sc3/sc4 shapes byte-identical (sc3 messages already declared; sc4.editMode already existed, default 'auto' preserves behavior). createChatPanelHost's new deps are OPTIONAL. insrc.chat.diffView is additive (default 'chat'). Existing stored sessions load unchanged. No daemon interaction; k3 preserved. Behind insrc.chat.enabled.

## Alternatives considered

### a1: Git turn-start tree snapshot + extension-computed diff + injected chat/editor render seams — **CHOSEN**

Capture an exact working-tree baseline via git at turn start; compute the diff baseline-vs-current and render it (chat or editor per insrc.chat.diffView); reject restores the path from the baseline.

EditGovernor holds per-turn state; at turn start an injected workspaceBaseline seam snapshots the working tree (git write-tree/stash-create style, no working-tree disturbance). On each file-edit it reads baseline + current via an fs seam and computes a UnifiedDiff itself (independent of sc2.diff). diffView() routes to the chat webview (sc3 edit-prompt) or a native vscode.diff seam. Auto = visualize-only; review = per-path accept/reject with baseline revert. Non-git degrades to visualize-only. sc2/sc3/sc4 unchanged; only S006-private injected deps + a plugin-local setting.

### a2: Lazy per-file disk snapshot at the file-edit event (git-independent)

No turn-start baseline; on first file-edit for a path copy current disk content into memory and diff/revert against that.

Same governor/render/wiring as a1 but the baseline is captured lazily at the file-edit event via the fs seam. No git. Under k8 the CLI may have already written by the time we observe, so the captured baseline can be post-write.

**Rejected because:** The k8 observer timing makes the baseline racy: ac2 only partial. A good non-git FALLBACK for a1, not the primary.

### a3: Reconstruct the baseline from the sc2 diff payload (no snapshot)

Reverse-apply the sc2 file-edit diff (claude old_string) to reconstruct/rollback; store nothing.

Rely entirely on sc2's diff: claude Edit carries old_string so the pre-edit fragment can be reverse-applied. Render/routing/wiring as a1.

**Rejected because:** Violates ac2 and couples to sc2 internals: codex + claude Write/MultiEdit have no reconstructable baseline. Cannot deliver for both providers.

## Citations

- **[[c1]]** `analyze-bundle` `s1: chat-panel.ts createChatPanelHost is vscode-free (ChatPanelChannel + {createPanel,providers,store,cwd,genNonce}); turn loop renders file-edit as an edit marker; handleMessage default case (chat-panel.ts:313) reserves set-edit-mode/edit-decision; one nonced CSP webview shell (textContent/className only)` — "S006 layers the diff view + governance on top of the existing edit marker; new injected seams keep the host testable"
- **[[c2]]** `analyze-bundle` `s1: session-store.ts (sc4) ChatSession.editMode auto|review (default auto, line 151), round-trips via the memento (k3); no store API change needed` — "set-edit-mode sets editMode + store.save (S005 title-persist pattern); nothing new persisted"
- **[[c3]]** `analyze-bundle` `s1: stream-events.ts (sc2) file-edit + UnifiedDiff; cli-adapter.ts diffFromClaudeEdit (claude Edit/Write single-hunk) vs codex file_change/patch = EMPTY hunks` — "S006 treats file-edit as the SIGNAL and computes its own diff from a pre-turn baseline vs current, correct for both providers"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-26T06:09:31.615Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contract/handleMessage | citation | LOW | auto | chat-panel.ts handleMessage has a default/else branch that currently drops (leaves unimplemented) the sc3 set-edit-mode and edit-decision messages, which S006 will fill. | handleMessage at chat-panel.ts:267; its switch default (chat-panel.ts:312-315) is an accepted-but-ignored seam whose comment literally reads 'set-edit-mode (S006), edit-decision (S006), docs-decision (S007) ... never an error'. S006 filling those cases is exactly the reserved extension point. Sound. | none — verified sound |
| interaction/sc3 | citation | LOW | auto | The sc3 protocol (protocol.ts) already declares HostToWebview edit-prompt and WebviewToHost set-edit-mode + edit-decision, so S006 needs no sc3 shape change. | protocol.ts declares edit-prompt (line 37), set-edit-mode (46), edit-decision (47) plus their type-name arrays (55/64/65). All three sc3 messages S006 rides already exist; no sc3 shape change needed. Sound. | none — verified sound |
| interaction/sc4 | semantic | LOW | auto | ChatSession.editMode ('auto'\|'review') already exists on the sc4 store shape and defaults to 'auto' at create(), so S006 only reads/writes it (no store shape change). | session-store.ts:29 declares editMode: 'auto' \| 'review' on ChatSession; create() defaults it to 'auto' (confirmed earlier at :151, and the test fixture session-store.test.ts:154 uses editMode:'auto'). S006 only reads/writes it — no store shape change. Sound. | none — verified sound |
| interaction/sc2 | citation | LOW | auto | The sc2 adapter maps codex file_change/patch to a file-edit with EMPTY hunks and claude Edit/Write via diffFromClaudeEdit, so S006 cannot rely on the sc2 diff payload and computes its own diff. | cli-adapter.ts:217 maps codex file_change/patch and cli-adapter.ts:219 emits file-edit with hunks:[] (EMPTY); claude Edit/Write go via diffFromClaudeEdit (cli-adapter.ts:114/168). So the sc2 diff payload is unreliable for render, exactly as the LLD premises — S006 computing its own diff is justified. Sound. | none — verified sound |
| boundary/host | citation | LOW | auto | createChatPanelHost is a vscode-free deps-injected factory (all vscode via the injected ChatPanelChannel seam), so S006 adds its governance seams as new injected deps. | createChatPanelHost at chat-panel.ts:61 with the doc 'All vscode calls are injected via ChatPanelChannel' (chat-panel.ts:11) and ChatPanelHostDeps as the deps type; vscode-free deps-injection confirmed. S006 adding governance seams as new injected deps fits. Sound. | none — verified sound |
| interaction/sc1 | citation | LOW | auto | The sc1 SurfaceKind union already includes 'inline-diff', the surface S006's chat-view diff renders under; S006 does not modify design-tokens.ts. | design-tokens.ts:29 SurfaceKind union includes 'inline-diff'; SURFACE_KINDS (:36) + TERMINAL_SURFACE_CLASS['inline-diff']='insrc-term-diff' (:45) already provide the surface class. S006 consumes it and does not modify design-tokens.ts. Sound. | none — verified sound |
| setting/diffView | cross-artifact | LOW | auto | insrc.chat.diffView is a NEW plugin-local setting (not yet present); it follows the insrc.chat.enabled precedent of a package.json contributes.configuration key read via getConfiguration().get with the full dotted key. | grep -c insrc.chat.diffView in vscode-plugin/package.json = 0 (only appears in DEF/LLD docs), confirming it is genuinely NEW. The precedent insrc.chat.enabled is read at extension.ts:416 via getConfiguration().get<boolean>('insrc.chat.enabled') with the full dotted key (matching :184). S006 following that idiom for diffView is accurate. Sound. | none — verified sound |
