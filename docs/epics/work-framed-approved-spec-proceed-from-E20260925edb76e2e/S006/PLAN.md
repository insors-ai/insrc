<!-- insrc:artifact PLAN-edb76e2e4d41217d-s6 -->

# Plan: E20260926edb76e2e:S006

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790401938774-4m48s8`
**LLD effective hash:** `e2745c4bac48...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** New edit-governor.ts module (createEditGovernor + types + computeDiff) | M | — | unit: edit-governor: beginTurn snapshots once; observe computes+renders a diff (auto = visualize-only, no tracking); unit: edit-governor: review decide(reject) restores baseline via fake fs; decide(accept) keeps disk; unit: edit-governor: same path observed twice keeps the first baseline; new-file baseline undefined -> all-additions, reject removes it; provider-agnostic diff from before/after; unit: edit-governor: non-git -> no-baseline visualize-only, reject no-op with note, never throws | [[c1]] [[c3]] |
| 2 | **`t2`** Extend ChatPanelHostDeps + reshape the turn loop to drive the governor | M | `t1` | integration: chat-panel: beginTurn fires before adapter.run; observe per file-edit; resolveTurn on terminal event; integration: chat-panel: host constructed WITHOUT editGovernance/diffView behaves as today (marker-only, edit marker still renders) | [[c1]] |
| 3 | **`t3`** Implement handleMessage set-edit-mode + edit-decision | S | `t2` | integration: chat-panel: set-edit-mode updates+persists editMode (store.get reflects it); mid-turn switch applies next turn; integration: chat-panel: edit-decision reject reverts via fake fs; accept keeps; stale/unknown path is a no-op; unit: session-store: editMode 'review' round-trips through save()/get(); defaults 'auto' on create | [[c1]] [[c2]] |
| 4 | **`t4`** Render the edit-mode toggle + chat-view inline diff in the webview | M | `t2`, `t3` | unit: chat-panel shell: edit-prompt diff renders inside the ONE nonce'd script; strict CSP, textContent/className only, no innerHTML, no remote/asWebviewUri; unit: chat-panel shell: hunk lines added via textContent styled by sc1 className, never markup | [[c1]] |
| 5 | **`t5`** Contribute the insrc.chat.diffView setting in package.json | S | — | integration: extension-chat-wiring: package.json has insrc.chat.diffView type 'string' enum ['chat','editor'] default 'chat' | [[c2]] |
| 6 | **`t6`** Wire extension.ts: read diffView + inject the real vscode-backed seams | M | `t1`, `t2`, `t5` | integration: extension-chat-wiring: extension.ts reads insrc.chat.diffView (full dotted key) + wires diffView + editGovernance seams into createChatPanelHost | [[c1]] [[c2]] |
| 7 | **`t7`** Tests: governor unit suite + host/wiring/store extensions + full sweep | M | `t1`, `t2`, `t3`, `t4`, `t5`, `t6` | integration: chat-panel: review turn posts sc3 edit-prompt; auto turn posts none; diffView 'chat'->showChat vs 'editor'->showEditor (no edit-prompt); smoke: full vscode-plugin sweep green under tsx --test + tsc --noEmit clean; ac1-ac4 all have a passing proving test | [[c1]] [[c2]] [[c3]] |

### E20260926edb76e2e:S006:T001 — New edit-governor.ts module (createEditGovernor + types + computeDiff)

Add vscode-plugin/src/chat/edit-governor.ts: createEditGovernor(deps) returning an EditGovernor with beginTurn/observe/resolveTurn/decide over injected seams (WorkspaceBaseline, FsSeam, EditRenderSeam, diffView accessor), plus the EditGovernorState in-memory type and a small pure computeDiff(before,after,path)->UnifiedDiff. Pure/vscode-free; total (seam failures caught -> degrade). Nothing wired yet.

**Acceptance checks:**
- edit-governor.ts exports createEditGovernor + the EditGovernor/EditGovernorDeps/EditRenderSeam/WorkspaceBaseline/FsSeam types; imports no vscode
- beginTurn captures a baseline handle (or no-baseline flag) + resets the edits map; observe computes a diff via computeDiff and calls render; decide reject restores baseline, accept keeps; resolveTurn clears state
- computeDiff produces a UnifiedDiff from two strings independent of any sc2 payload (handles new-file baseline undefined + binary/non-text)

### E20260926edb76e2e:S006:T002 — Extend ChatPanelHostDeps + reshape the turn loop to drive the governor

In chat-panel.ts, add OPTIONAL editGovernance seams + a diffView accessor to ChatPanelHostDeps and construct the EditGovernor when present. Reshape the turn loop to call governor.beginTurn(mode,cwd) before adapter.run(), governor.observe(path) on each sc2 file-edit event, and governor.resolveTurn() on the terminal (done/error) event. The existing marker-row render (S004/S008) is untouched; when the deps are absent the host behaves exactly as today.

**Acceptance checks:**
- ChatPanelHostDeps gains optional editGovernance + diffView; existing construction without them compiles + behaves as before (marker-only)
- beginTurn is invoked before adapter.run(); observe(path) fires per file-edit; resolveTurn on the terminal event
- no change to the existing turn-event marker rendering path

### E20260926edb76e2e:S006:T003 — Implement handleMessage set-edit-mode + edit-decision

Fill the reserved handleMessage default case (chat-panel.ts:312) with set-edit-mode (validate mode 'auto'|'review', set session.editMode, store.save per the S005 title-persist pattern, re-render the toggle) and edit-decision (validate path is a string, forward to governor.decide). Malformed payloads keep the existing drop-with-warn. Ordered before t4 so the edit-decision the webview controls emit is handled end-to-end.

**Acceptance checks:**
- set-edit-mode sets + persists session.editMode via store.save; invalid mode dropped
- edit-decision forwards to governor.decide(path, accept); non-string path dropped
- existing message cases + the drop-with-warn default remain intact

### E20260926edb76e2e:S006:T004 — Render the edit-mode toggle + chat-view inline diff in the webview

Inside the ONE nonce'd webview script, render the sc1-styled per-session edit-mode toggle (emits set-edit-mode) and the chat-view inline diff for an edit-prompt message (added/removed lines via the line(s,cls) writer using textContent + sc1 className, with accept/reject controls emitting edit-decision, handled by t3). No second script, no innerHTML, no remote origin; CSP unchanged.

**Acceptance checks:**
- the webview renders an edit-mode toggle + a diff view for edit-prompt; still exactly one <script> under the strict CSP
- diff hunk + control text set via textContent/className, never innerHTML; no remote origin / asWebviewUri added
- accept/reject controls post edit-decision {path, accept} (handled by t3)

### E20260926edb76e2e:S006:T005 — Contribute the insrc.chat.diffView setting in package.json

Add insrc.chat.diffView to vscode-plugin/package.json contributes.configuration: type 'string', enum ['chat','editor'], default 'chat', with enumDescriptions + description, next to insrc.chat.enabled.

**Acceptance checks:**
- package.json contributes.configuration has insrc.chat.diffView with type 'string', enum ['chat','editor'], default 'chat'
- it sits alongside insrc.chat.enabled and appears in VS Code's native Settings UI

### E20260926edb76e2e:S006:T006 — Wire extension.ts: read diffView + inject the real vscode-backed seams

In extension.ts, read insrc.chat.diffView via getConfiguration().get<'chat'|'editor'>(full dotted key) into a diffView accessor, and inject the real seams into createChatPanelHost: a git WorkspaceBaseline (shelled via the existing node child-process seam, no new dependency), an FsSeam (workspace.fs/node:fs read/write/remove), and an EditRenderSeam whose showChat posts the sc3 edit-prompt and showEditor opens a native vscode.diff (readonly baseline doc vs the file).

**Acceptance checks:**
- extension.ts reads insrc.chat.diffView with the full dotted key and passes a diffView accessor into createChatPanelHost
- real git-baseline/fs/editorDiff seams are injected; the panel stays behind insrc.chat.enabled
- no direct cloud REST introduced (k2); baseline uses the existing node spawn seam

### E20260926edb76e2e:S006:T007 — Tests: governor unit suite + host/wiring/store extensions + full sweep

Add edit-governor.test.ts (lifecycle, review accept/reject revert via fake fs, same-path-once baseline, new-file remove, non-git no-baseline, provider-agnostic diff) with fake WorkspaceBaseline/FsSeam/EditRenderSeam; extend chat-panel.test.ts (set-edit-mode persist, review vs auto, diffView chat/editor routing, shell CSP), extension-chat-wiring.test.ts (diffView manifest enum/default + wiring), session-store.test.ts (editMode round-trip). Each of ac1-ac4 must have an explicit passing proving test. Run the full plugin sweep + tsc --noEmit.

**Acceptance checks:**
- ac1, ac2, ac3, ac4 each have at least one passing proving test (no ac silently uncovered)
- edit-governor.test.ts + the three extended suites pass under tsx --test; tsc --noEmit clean
- the CSP/one-script/no-innerHTML shell invariants are asserted for the chat-view diff

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| beginTurn snapshots once; observe computes+renders a diff (auto: visualize-only, no tracking) | `t1` |
| review decide(reject) restores baseline content via the fake fs; decide(accept) keeps disk | `t1` |
| same path observed twice keeps the first baseline (revert = true pre-turn) | `t1` |
| new file (baseline undefined) -> all-additions; reject removes it | `t1` |
| non-git -> no-baseline: visualize-only, reject no-op with note, no throw | `t1` |
| provider-agnostic: a codex empty-hunk signal still yields a real diff from before/after | `t1` |
| review turn posts sc3 edit-prompt; edit-decision reject reverts via fake fs; accept keeps | `t3`, `t7` |
| auto turn posts NO edit-prompt + no revert; edit marker still renders | `t2`, `t7` |
| set-edit-mode updates+persists editMode; mid-turn switch applies next turn | `t3` |
| diffView 'chat' -> showChat (edit-prompt); 'editor' -> showEditor + no edit-prompt | `t7` |
| beginTurn before adapter.run; resolveTurn on terminal event | `t2` |
| stale edit-decision for unknown/decided path is a no-op (no fs write) | `t3` |
| edit-prompt diff renders inside the ONE nonce'd script; one <script>, strict CSP, textContent/className only, no innerHTML, no remote/asWebviewUri | `t4` |
| hunk lines added via textContent, styled via sc1 className, never markup | `t4` |
| package.json has insrc.chat.diffView type 'string' enum ['chat','editor'] default 'chat' | `t5` |
| extension.ts reads it via getConfiguration().get(full dotted key) + wires diffView into the host | `t6` |
| editGovernance seams wired at construction | `t6` |
| editMode 'review' round-trips through save()/get() | `t3` |
| editMode defaults 'auto' on create (unchanged) | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s6 contractDetails: createEditGovernor/EditGovernor/EditRenderSeam + createChatPanelHost turn-loop reshape + handleMessage set-edit-mode/edit-decision + chat-view render (host/webview/governor, vscode-free deps-injection)`
- **[[c2]]** `prior-artifact` `LLD s6 dataModelChanges: insrc.chat.diffView plugin-local setting + ChatSession.editMode (sc4) read/write via store.save (no shape change)`
- **[[c3]]** `prior-artifact` `LLD s6 interactionWithShared/invariants: consume sc2 file-edit as a SIGNAL and compute the diff itself (codex empty hunks + claude Write/MultiEdit) via the pre-turn baseline`
