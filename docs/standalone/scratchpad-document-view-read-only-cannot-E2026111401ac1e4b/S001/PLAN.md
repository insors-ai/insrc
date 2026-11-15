<!-- insrc:artifact PLAN-01ac1e4b6a6c9c2f-s1 -->

# Plan: STORY-01ac1e4b6a6c9c2f-s1

## Summary

**Epic:** `scratchpad-document-view-read-only-cannot`
**LLD run:** `wf-1794672418662-gm1x9s`
**LLD effective hash:** `e3f317296671...`

Building this Story turns the scratchpad document view from a read-only <pre> into an editable in-plugin textarea with a safe save round-trip. Four tasks, in dependency order: a new ScratchStore.updateScratch that rewrites the .md under the store's existing validation plus exclusive no-follow temp-write and unlink/link no-clobber publish (t1); a new document-channel scratch-save/scratch-saved message contract in scratch-panels.ts that leaves the chat channel untouched (t2); the document view reshape — textarea, dirty tracking, save button + Ctrl/Cmd+S, gen-guarded replies, textarea-selection send-to-chat — with the new onScratchSave seam and replySaved (t3); and the scratch-host 'scratch-save' route plus its extension.ts wiring, with fakes-backed unit, contract and integration tests throughout (t4).

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add ScratchStore.updateScratch with exclusive no-follow temp write + no-clobber publish | M | — | — | unit: scratch-store.test.ts: updateScratch happy path writes full text and replaces content; id validation refusal (outside-root, symlink, non-.md) → ScratchRefused; missing file → ScratchNotFound; write failure leaves destination unchanged and unlinks temp; temp path occupied by a symlink or existing file → exclusive create fails (EEXIST/ELOOP) and nothing is written outside the root; unit: scratch-store.test.ts: updateScratch bumps mtime so listScratches reflects the save | [[c2]] [[c7]] |
| 2 | **`t2`** Add document-channel scratch-save / scratch-saved message contract in scratch-panels.ts | S | — | — | integration: scratch-panel.test.ts: 'scratch-save' in SCRATCH_DOC_WEBVIEW_TO_HOST_TYPES and NOT in SCRATCH_DOC_HOST_TO_WEBVIEW_TYPES; 'scratch-saved' in SCRATCH_DOC_HOST_TO_WEBVIEW_TYPES and NOT in SCRATCH_DOC_WEBVIEW_TO_HOST_TYPES; both carry gen; the chat-channel protocol.ts unions/arrays are untouched (direction isolation per channel) | [[c5]] [[c7]] |
| 3 | **`t3`** Reshape the document view: pre→textarea, save wiring, gen-guarded replies, onScratchSave seam, replySaved | L | — | `t2` | integration: scratch-panel.test.ts: documentBodyHtml emits <textarea id="insrc-scratchdoc"> and the save button; documentBootstrap pins the scratch-save post with gen + keydown Ctrl/Cmd+S + scratch-saved handler honoring only gen === docGeneration + textarea selectionStart/selectionEnd send-to-chat; integration: scratch-panel.test.ts behavioral: input event sets dirty (save button visible, title suffix via setTitle), 'scratch-saved' ok with matching gen clears dirty, ok=false keeps dirty and shows error, stale-gen reply ignored; scratch-content sets textarea .value (not textContent/innerHTML); send-to-chat reads selection from textarea selectionStart/selectionEnd over doc.value and posts capUtf8-capped text; integration: scratch-panel.test.ts: send-to-chat post via textarea selection (selectionStart/selectionEnd) present in the new bootstrap; capUtf8 behavior untouched (existing tests); existing ISSUE-3183af2a tests (wrap() drop logging, reveal(true), popup icons) still pass | [[c1]] [[c7]] |
| 4 | **`t4`** Route scratch-save in the scratch host and wire onScratchSave in extension.ts | M | — | `t1`, `t3` | unit: scratch-host.test.ts (NEW): 'scratch-save' {id,gen,text} → store.updateScratch called with exact args → replySaved(gen, {type:'scratch-saved', id, gen, ok:true, ...}) posted to the document panel + refreshBrowse + scratch-list re-pushed; store failure → ok:false with error and log.warn; malformed (non-string id/text, non-number gen) dropped with warn; integration: extension-chat-wiring.test.ts regex pins: textarea element, save button, 'scratch-save'/'scratch-saved' strings, replySaved, selectionStart present in the built sources and panel wiring; onScratchSave wiring pinned | [[c3]] [[c6]] [[c7]] |

### 1.1 TASK-01ac1e4b6a6c9c2f-s1-t1 — Add ScratchStore.updateScratch with exclusive no-follow temp write + no-clobber publish

Add ScratchStore.updateScratch(id, text) to vscode-plugin/src/chat/scratch-store.ts under the store's existing validation (inside ~/.insrc/scratches root, *.md basename, lstat regular file, symlink refused, O_NOFOLLOW) plus a new ScratchFs.writeFileExclusive for the exclusive no-follow temp write and unlink/link no-clobber publish (never rename, bounded retry); extend fake-scratch-fs.ts and the existing scratch-store.test.ts with the happy path, refusal/not-found/store-error cases, temp cleanup, and mtime-bump coverage.

**Acceptance checks:**
- updateScratch(id, text) exists on the ScratchStore interface and nodeScratchFs implementation
- happy path replaces file content with the full text, bumps mtime, leaves no temp file
- id validation refusals: outside-root / non-.md / non-regular / symlink → ScratchRefused; missing file → ScratchNotFound; write/publish failure → ScratchStoreError with destination untouched and temp unlinked
- temp file created exclusively and no-follow (O_CREAT|O_EXCL|O_NOFOLLOW; EEXIST/ELOOP on an occupied or symlinked temp name aborts the save)
- publish is unlink(destination)+link(temp,destination)+unlink(temp) — never rename — with destination re-opened O_NOFOLLOW+fstat to confirm the validated inode before unlink, and bounded retry on link EEXIST
- fake-scratch-fs.ts extended with writeFileExclusive EEXIST/ELOOP semantics plus link/unlink/open-fstat coverage

### 1.2 TASK-01ac1e4b6a6c9c2f-s1-t2 — Add document-channel scratch-save / scratch-saved message contract in scratch-panels.ts

Add the new document-channel protocol in vscode-plugin/src/panels/scratch-panels.ts: the scratch-save/scratch-saved message types with their const arrays, leaving the chat-channel protocol.ts unions untouched; pin direction isolation and gen carriage in scratch-panel.test.ts / protocol.test.ts.

**Acceptance checks:**
- ScratchDocWebviewToHost gains { type: 'scratch-save'; id; gen; text } and ScratchDocHostToWebview gains { type: 'scratch-saved'; id; gen; ok; error? } in scratch-panels.ts, each with its own const array (SCRATCH_DOC_WEBVIEW_TO_HOST_TYPES / SCRATCH_DOC_HOST_TO_WEBVIEW_TYPES)
- chat-channel protocol.ts unions/arrays are untouched (direction isolation asserted in the panel/protocol tests)
- both messages carry gen so the reply is generation-guarded end to end
- scratch-panel.test.ts asserts 'scratch-save' is only webview→host and 'scratch-saved' only host→webview

### 1.3 TASK-01ac1e4b6a6c9c2f-s1-t3 — Reshape the document view: pre→textarea, save wiring, gen-guarded replies, onScratchSave seam, replySaved

Reshape the scratchpad document view in vscode-plugin/src/panels/scratch-panels.ts: pre → CSP-safe textarea (content via .value), documentBootstrap(gen, id), dirty tracking with save button + title suffix, Ctrl/Cmd+S and click posting document-channel 'scratch-save', gen-guarded 'scratch-saved' handling, a new panels.replySaved(gen, msg) and a new ScratchPanelsDeps.onScratchSave seam, and send-to-chat re-read from the textarea's own selection; all pinned in scratch-panel.test.ts.

**Acceptance checks:**
- documentBodyHtml emits <textarea id="insrc-scratchdoc" class="scratch-doc"> (not pre) plus the hidden save button
- scratch-content push sets doc.value, never innerHTML/textContent
- documentBootstrap gains the id parameter — documentBootstrap(gen, id)
- input → dirty (save button visible + panel title '•' suffix); keydown Ctrl/Cmd+S and save-button click post 'scratch-save' { id, gen: docGeneration, text: doc.value }
- 'scratch-saved' honored only when msg.gen === live docGeneration and id matches → clear dirty on ok / show error on ok=false; stale-gen replies ignored
- send-to-chat re-pointed to the textarea selection API (selectionStart/selectionEnd over doc.value on select/keyup/mouseup), still capUtf8-capped
- ScratchPanels gains replySaved(gen, msg) targeting the live document generation; the panel's onMessage exposes a new deps.onScratchSave seam validated against showingId + live docGeneration
- singleton panel, docGeneration/epoch guards, pendingContent replay and wrap() drop logging unchanged
- scratch-panel.test.ts source + behavioral pins cover all of the above

### 1.4 TASK-01ac1e4b6a6c9c2f-s1-t4 — Route scratch-save in the scratch host and wire onScratchSave in extension.ts

Add the 'scratch-save' route to createScratchHost.onMessage in scratch-host.ts (validate, await store.updateScratch, reply via panels.replySaved with gen, refresh browse + chat list; ok:false + warn on failure) and wire the document panel's onScratchSave seam in extension.ts to that route; new scratch-host.test.ts plus extension-chat-wiring.test.ts pins.

**Acceptance checks:**
- createScratchHost.onMessage has a 'scratch-save' case validating string id/text + numeric gen (warn+drop otherwise)
- on success: await store.updateScratch(id, text) then panels.replySaved(gen, { type:'scratch-saved', id, gen, ok:true }) + refreshBrowse() + scratch-list re-push (sendScratchList) so the menu mtime refreshes
- on store failure: replySaved ok:false with error + log.warn, browse/list still refresh
- extension.ts wires the new onScratchSave seam to the scratch-host route exactly like onSendToChat (chat-channel SCRATCH_INTENT_TYPES interception cannot see document-panel messages)
- NEW vscode-plugin/src/chat/__tests__/scratch-host.test.ts covers ok / ok=false / malformed-drop / refresh calls with fake store + fake panels; extension-chat-wiring.test.ts regex-pins the onScratchSave wiring and replySaved

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| vscode-plugin/src/chat/__tests__/scratch-store.test.ts | `t1` |
| vscode-plugin/src/chat/__tests__/fake-scratch-fs.ts | `t1` |
| vscode-plugin/src/chat/__tests__/scratch-host.test.ts (NEW in this change — the file did not exist before) | `t4` |
| vscode-plugin/src/chat/__tests__/protocol.test.ts (direction isolation + coverage assertions) | `t2` |
| vscode-plugin/src/panels/__tests__/scratch-panel.test.ts | `t3` |
| vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts | `t4` |

## 3. References

- **[[c1]]** `code` `vscode-plugin/src/panels/scratch-panels.ts:146-151` — "documentBodyHtml renders <pre id="insrc-scratchdoc" class="scratch-doc"></pre> — the read-only surface being replaced by the textarea"
- **[[c2]]** `code` `vscode-plugin/src/chat/scratch-store.ts` — "ScratchStore exposes listScratches/createScratch/readScratch/deleteScratch only; updateScratch is added with the same id validation and temp-write + publish discipline"
- **[[c3]]** `code` `vscode-plugin/src/chat/scratch-host.ts` — "SCRATCH_INTENT_TYPES lists the six scratch intents; the scratch-save case is added to onMessage"
- **[[c5]]** `code` `vscode-plugin/src/chat/protocol.ts:442-444` — "the chat-channel WEBVIEW_TO_HOST_TYPES / HOST_TO_WEBVIEW_TYPES const arrays stay untouched — document-channel messages get their own unions in scratch-panels.ts"
- **[[c6]]** `prior-artifact` `docs/standalone/scratchpad-document-view-read-only-cannot-E2026111401ac1e4b/ISSUE.md` — "ISSUE-01ac1e4b6a6c9c2f (approved, sized): fix intent = editable surface + scratch-save round-trip through a no-clobber store update op, dirty state, browse refresh, send-to-chat preserved"
- **[[c7]]** `prior-artifact` `docs/standalone/scratchpad-document-view-read-only-cannot-E2026111401ac1e4b/S001/LLD.md` — "the approved standalone LLD: contract details §2.1-§2.5, data model changes §3.1-§3.3, error paths, test strategy ac1-ac5, migration steps 1-4"
