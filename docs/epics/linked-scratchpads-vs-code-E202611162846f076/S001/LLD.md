<!-- insrc:artifact LLD-2846f076fd5f785f-s1 -->

# LLD: STORY-2846f076fd5f785f-s1 — Native Markdown Editor pad surface

## Summary

**Epic:** `linked-scratchpads-vs-code`
**HLD base run:** `wf-1794821904095-ndy0d1`
**HLD effective hash:** `a1e1d0dc0f84...`
**Tracker:** [insors-ai/insrc#194](https://github.com/insors-ai/insrc/issues/194)

s1 replaces the scratchpad's custom document webview with VS Code's own built-in Markdown Editor, opened on the pad's real file. Opening reshapes the existing createScratchPanels/openDocument function to call vscode.openWith (or a plain-editor fallback when the host lacks the capability, probed via the existing HostEnv.getExtension), and retires documentBodyHtml/documentBootstrap, the scratch-save/scratch-saved protocol, and openDocument's generation/epoch bookkeeping (docGeneration/epochs/readyGenerations/pendingContent/retireAllGenerations) outright; openBrowse itself (the list-panel opener) is unchanged. s1 also establishes ScratchpadRef (sc1), the Epic's one cross-cutting note-identity primitive every later story builds on.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-2846f076fd5f785f** § 2. Framework summary

**Rollout phase:** Phase A — Native editor foundation
**Owns:** `sc1` (ScratchpadRef)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: The chat-menu cap-10 rendering, the list panel's cap-20/3-line-preview/delete UI, and the relevance-ranking algorithm itself (title-first, tie-break via sc1's stableId) are private to s2; sc3 exposes only the read-model shape (title/preview/mtime), not the ranking logic. — owns `sc3`
- `s3`: Find-in-note's match highlighting, wraparound navigation, and collapsed-section reveal operate entirely on the open editor's live text buffer — no cross-story data or contract is produced or consumed.
- `s4`: The entry-boundary/timestamp Markdown convention, day-grouping, and the Undated bucket are private to how one note's content renders; no story downstream of s4 in the Epic's dependency graph consumes dated-entry structure, so it is not exposed as a shared contract.
- `s5`: The link-target picker UI and the qualified-target Markdown syntax (percent-encoded target segments, versioned, per the HLD's resolved open question) are private to s5; sc2 exposes only the resolved-reference and backlink-query shape s6 consumes, not the authoring UI or syntax. — owns `sc2`
- `s6`: The backlink view's grouping-by-source-note rendering, on the pad and on file/symbol surfaces, is private UI; no story is downstream of s6 in the Epic's graph, so it exposes no further contract.
- `s7`: The archive/restore state machine, the permanent-delete confirmation flow, and the decision of where stable ID/repo-association/archive-state are actually persisted are private to s7; it extends sc1's bare ScratchpadRef with lifecycle state but does not re-expose that lifecycle representation as a further contract, since s8/s9/s10 only need sc1's identity.
- `s8`: The attach-to-turn picker UI, the removable-preview rendering, and revision-pinning for a queued turn are private to s8; it consumes sc1 to cite the note and exposes no further contract, since only s9 depends on s8 and s9's own need (provenance link) is satisfied by sc1 directly.
- `s9`: The promote-to-draft action's brainstorm/ISSUE routing and idempotent-retry handling are private to s9; no story is downstream of s9 in the Epic's graph.
- `s10`: The tag-filter UI and starter-template catalog are private to s10; it extends sc3's list read-model with the tags field but no story is downstream of s10 in the Epic's graph.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `createScratchPanels`

```typescript
createScratchPanels(deps: ScratchPanelsDeps): ScratchPanels
```

**Parameters:**
- `deps: ScratchPanelsDeps` — Host-injected dependencies (store, fs, webview factory, etc.) the panels module needs.

**Returns:** `ScratchPanels` — The panels module's public surface (list/browse/delete actions plus, after this Story, the native-editor open action).

**Preconditions:**
- deps supplies a working ScratchStore; the extension's commands/contributes are already registered by activate().

**Postconditions:**
- The returned ScratchPanels no longer constructs a custom document webview to open a pad; opening routes through the native-editor opener instead.

### 2.2 `openBrowse`

```typescript
openBrowse(): Promise<ScratchPanelHandle | undefined>
```

**Returns:** `Promise<ScratchPanelHandle | undefined>` — Resolves to the list panel's own webview handle, unchanged by this Story — openBrowse opens the SCRATCHPADS_VIEW_TYPE list panel, not an individual pad.

**Postconditions:**
- openBrowse itself is NOT reshaped by this Story: it still only opens the list panel and, on its existing 'scratch-open' webview message, calls openDocument(msg.id) — the function this Story actually reshapes. An earlier draft of this LLD incorrectly described openBrowse (the zero-arg list-panel opener) as the function being reshaped to call vscode.openWith; the real per-pad opener is openDocument(id: string).

### 2.3 `openDocument`

```typescript
openDocument(id: string): Promise<void>
```

**Parameters:**
- `id: string` — The scratchpad's basename-derived id (today) / ScratchpadRef.stableId (going forward) identifying which pad to open.

**Returns:** `Promise<void>` — Resolves once the pad has been opened (natively or via the fallback editor); no webview handle or generation token is returned since the native editor owns its own tab lifecycle.

**Errors:**
- `rejected Promise` when vscode.openWith (or the fallback showTextDocument) rejects, e.g. the target uri cannot be resolved, or the underlying read raises ScratchNotFound.

**Preconditions:**
- A ScratchpadRef for the target pad resolves to a real file on disk under vscode-plugin/src/chat/scratch-store.ts's existing file contract.

**Postconditions:**
- On a capable host, the pad is open via vscode.markdown.editor, locked by default. On an incapable host, the plain default editor is open instead and one non-blocking notice has been shown.
- The prior per-id docGeneration/epochs/readyGenerations/pendingContent bookkeeping (vscode-plugin/src/panels/scratch-panels.ts, openDocument's current body) — which existed only to referee the custom webview's save/reload race — no longer applies: VS Code's own text-document model owns that race once openDocument no longer constructs a webview.
- scratch-host.ts's 'scratch-new' case (vscode-plugin/src/chat/scratch-host.ts:137-138) currently checks `if (opened === undefined) log.warn(...)` against openDocument's old Promise<ScratchPanelHandle | undefined> return value; once openDocument resolves void, that check can no longer distinguish 'opened' from 'did not open' and must be removed — a rejected openDocument already surfaces through the outer try/catch's 'create failed' log, so no detection is lost.

### 2.4 `getExtension`

```typescript
getExtension(id: string): boolean
```

**Parameters:**
- `id: string` — The extension id to probe for — here, 'vscode.markdown-language-features'.

**Returns:** `boolean` — Whether the host currently has that extension installed and enabled.

**Postconditions:**
- s1's opener calls this existing HostEnv method before choosing vscode.openWith vs. the fallback path; this Story does not change getExtension itself.

## 3. Data model changes

### 3.1 `ScratchpadRef` — new

The Epic's cross-cutting identity primitive (sc1), introduced by this Story: { repo, stableId }. s1 establishes it for the pad being opened (today derived from the existing basename-ID vscode-plugin/src/chat/scratch-store.ts already assigns, pending s7's fuller rename-survival semantics) so s2/s5/s7/s8/s9 have a stable reference to build on.

```
+ interface ScratchpadRef { readonly repo: string; readonly stableId: string; }
```

**Call sites:**
- `vscode-plugin/src/chat/scratch-store.ts`
- `vscode-plugin/src/panels/scratch-panels.ts`

### 3.2 `DocumentWebviewProtocol` — field-remove

The custom document-channel protocol (scratch-save / scratch-saved) and its carrying functions (documentBodyHtml, documentBootstrap) are removed outright, along with openDocument's entire webview-construction body — the per-id generation/epoch bookkeeping that existed solely to referee the webview's save/reload race (docGeneration, epochs, readyGenerations, pendingContent, retireAllGenerations) retires with it, since VS Code's own text-document model owns that race once openDocument no longer owns a custom webview. SCRATCH_INTENT_TYPES stays the same six intents (scratch-browse, scratch-delete, scratch-new, scratch-open, scratch-open-menu, send-to-chat); openBrowse itself is untouched — it still dispatches 'scratch-open' to openDocument, which is the function whose internals this Story replaces. Only the scratch-open and scratch-new handlers in scratch-host.ts call openDocument and are affected (scratch-open-menu only lists recent entries and is unaffected). scratch-new's existing `if (opened === undefined) log.warn(...)` check (scratch-host.ts:137-138) depends on openDocument's old return shape and must be removed, since void can no longer distinguish 'opened' from 'did not open' — a failed open already surfaces via the outer catch's 'create failed' log. scratch-browse/scratch-delete remain wired to openBrowse/invalidateId+closeDocumentIfShowing exactly as before, but deleteAndRefresh's existing invalidateId(id)/closeDocumentIfShowing(id) calls on a successful delete are not: closeDocumentIfShowing must be retained and reshaped (once an open pad is a native editor tab rather than a webview panel, 'close if showing' means closing that tab/document instead of disposing a webview handle) so the existing delete-then-close behavior keeps working; invalidateId's epoch counter has no remaining reader once the webview reload race it guarded against is gone, and is removed.

```
- documentBodyHtml(): string
- documentBootstrap(gen: number, id: string): string
- openDocument's webview-construction body (docHandle/setHtml) and its docGeneration/epochs/readyGenerations/pendingContent bookkeeping, plus retireAllGenerations
- invalidateId(id: string): void
- scratch-host.ts's dead `if (opened === undefined) log.warn(...)` check in the scratch-new handler (depends on openDocument's old return shape)
~ closeDocumentIfShowing(id: string): void — retained, reshaped to close the native editor tab/document for id instead of disposing a webview handle
~ openDocument(id: string): Promise<ScratchPanelHandle | undefined> -> Promise<void> — the ScratchPanels interface declaration itself (scratch-panels.ts:110) must be updated to match
```

**Call sites:**
- `vscode-plugin/src/panels/scratch-panels.ts`
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts`
- `vscode-plugin/src/chat/scratch-host.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | s1 owns and establishes ScratchpadRef for every pad it opens — the one contract s2, s5, s7, s8, and s9 consume downstream. |

## 5. Error paths

**Error cases**

- **Host does not have markdown-language-features installed/enabled (getExtension returns false).** (recoverable)
  - Detection: s1's opener calls HostEnv.getExtension('vscode.markdown-language-features') before invoking vscode.openWith; a false result is detected synchronously, before any editor-open attempt.
  - Response: Falls back to vscode.window.showTextDocument(uri) (the plain default editor) and shows one non-blocking notice that the native Markdown Editor is unavailable on this host.
  - User impact: The pad still opens and is usable, just without the rendered/locked editor experience; the user sees one brief notice, not a failure.
- **vscode.openWith rejects even though the capability probe passed (e.g. a transient VS Code error, or the editor was disabled between the probe and the call).** (recoverable)
  - Detection: The Promise returned by vscode.commands.executeCommand('vscode.openWith', ...) rejects.
  - Response: Catch the rejection and fall back to the same plain-editor path used for a negative probe, with a distinct notice ('open failed' vs. 'host incapable') so the two causes aren't conflated in logs or in what the user sees.
  - User impact: The pad still opens via the fallback; the user is not blocked, but sees a notice.
- **The pad's underlying file no longer exists on disk when the user triggers the open (deleted out-of-band, or via a concurrent scratch-delete).** (recoverable)
  - Detection: vscode.openWith / showTextDocument rejects with a file-not-found error, or vscode-plugin/src/chat/scratch-store.ts's existing read guard (already raising ScratchNotFound) fails before the open is attempted.
  - Response: Surface scratch-store.ts's existing ScratchNotFound handling rather than inventing a new error path; show the existing not-found message instead of opening anything.
  - User impact: The user sees a clear not-found message instead of a stuck or broken-looking tab.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The same pad is clicked twice in quick succession (double-click, or two near-simultaneous scratch-open messages for the same id). | vscode.openWith/showTextDocument on the same uri is idempotent at the VS Code API level — it reveals/focuses the existing tab rather than opening a second one; s1 relies on that existing VS Code behavior rather than adding its own de-duplication. |
| The pad file is already open in another tab of the SAME file (e.g. via scratch-open and also by browsing the file directly in the workspace). | VS Code's own text-document model treats both as the same document; opening via openWith does not create a second, divergent buffer — this is exactly the 'VS Code's own text-document model owns save/undo/conflict' behavior ac1 asks for, not something s1 implements itself. |
| The host is a VS Code fork whose appName/uriScheme matches a known entry in hosts/specs.ts (e.g. Cursor) but has NOT installed markdown-language-features. | The getExtension probe, not the host-identity probe, is authoritative for this decision — a recognized host identity does not imply the capability; the fallback path triggers exactly as it would for an unrecognized host. |
| A legacy pad whose stableId has not yet been established (opened before s7's lifecycle rollout lands). | s1 establishes ScratchpadRef for the pad on first touch, deriving stableId from the existing basename-ID the store already assigns; opening a pad never fails or blocks waiting on s7's fuller lifecycle semantics. |
| scratch-host.ts's 'scratch-new' case creates a pad and immediately opens it, previously checking openDocument's Promise<ScratchPanelHandle \| undefined> return value to warn on a silent open failure. | That check is removed, not left in place to log spuriously against the new Promise<void> return value — it would otherwise fire a false 'did not open' warning on every successful create. A real open failure still surfaces via the outer try/catch's 'create failed' log, so no failure mode goes undetected. |

**Invariants to preserve**

- The scratchpad file contract on disk (basename-ID *.md files under ~/.insrc/scratches/, guarded exclusive-create/read/write) is unchanged by this Story — only how the file is opened changes, never how it is stored. [[c2]]
- scratch-browse, scratch-delete, and scratch-new continue to work exactly as before — this Story touches only the scratch-open / scratch-open-menu handlers. [[c3]]
- vscode.markdown.editor remains VS Code's own bundled custom editor, invoked via openWith on the real file; this Story does not fork or wrap it with a bespoke webview. [[c8]]
- HostEnv.getExtension is consumed as-is, not modified; host-capability detection reuses this existing mechanism rather than a parallel one. [[c12]]

## 6. Test strategy

**Test framework:** `node:test (node --test, assert)`

**Test levels**

- **unit** — Exercise the capability-probe branch and fallback notice logic in isolation, without a real VS Code host.
  - Subjects: `openDocument's getExtension('vscode.markdown-language-features') branch (true -> openWith, false -> fallback)`, `The rejected-openWith fallback path (distinct notice from the negative-probe path)`, `ScratchpadRef establishment for a pad that has no prior stableId`
  - Fixtures: `A controllable fake HostEnv (getExtension returns true/false per test)`, `A fake vscode.commands.executeCommand / vscode.window.showTextDocument stand-in recording calls, matching the existing fakePanels-style pattern in extension-chat-wiring.test.ts`
- **integration** — Verify the scratch-open / scratch-open-menu intents actually route through createScratchPanels into the new opener end-to-end, and that the other four SCRATCH_INTENT_TYPES are untouched.
  - Subjects: `createScratchPanels(deps) wiring for scratch-open and scratch-open-menu`, `scratch-browse / scratch-delete / scratch-new remain unaffected`, `Removal of the scratch-save/scratch-saved document-channel protocol and its carrying functions`
  - Fixtures: `fakeScratchFs (vscode-plugin/src/chat/__tests__/fake-scratch-fs.ts)`, `fakePanels (extension-chat-wiring.test.ts / scratch-host.test.ts)`, `The existing extension-chat-wiring.test.ts harness`
- **live** — Prove the one thing no fake/shim can prove: the real vscode.markdown.editor custom editor actually renders, locks, and supports its native authoring affordances on a real VS Code host.
  - Subjects: `ac1's rendered-view, lock-by-default, and image paste/drop / URL-as-link paste / insert-link-from-workspace behavior`, `ac2's pencil/lock toggle switching between rendered-read-only and editable view`
  - Fixtures: `A real VS Code instance with markdown-language-features enabled (the default/standard case)`, `A host or a disabled-extension configuration for the negative-probe fallback path`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `scratch-panel.test.ts: openDocument calls vscode.openWith with 'vscode.markdown.editor' on the resolved file uri when the host capability probe succeeds`, `extension-chat-wiring.test.ts: a scratch-open message routes to the native opener, not the retired document webview`, `LIVE (reported, not gate-run): on a real VS Code host, the pad renders via the built-in Markdown Editor, locked by default, with working image paste/drop, URL-as-link paste, and insert-link/insert-image-from-workspace` |
| `ac2` | `scratch-panel.test.ts: the pencil control invokes the editor's native toggleLocked command and the lock control returns it`, `LIVE (reported, not gate-run): on a real VS Code host, the pencil/lock toggle visibly switches between rendered-read-only and editable view` |
| `ac3` | `extension-chat-wiring.test.ts: documentBodyHtml/documentBootstrap and the scratch-save/scratch-saved strings are no longer present in the built sources (replacing the old regex-pinned assertion at line 826)`, `scratch-panel.test.ts: createScratchPanels no longer constructs a document webview for scratch-open`, `scratch-store.test.ts: the on-disk file contract (exclusive create, guarded read/write/delete) is unchanged by this Story` |

## 7. Migration

**State before:** Opening a pad calls createScratchPanels(deps)'s openBrowse(), the list-panel opener, which on a 'scratch-open' webview message calls openDocument(id: string): Promise<ScratchPanelHandle | undefined> (vscode-plugin/src/panels/scratch-panels.ts:450-558) — the actual per-pad opener. openDocument constructs a custom webview via documentBodyHtml(): string (vscode-plugin/src/panels/scratch-panels.ts:199-205) and documentBootstrap(gen, id): string (vscode-plugin/src/panels/scratch-panels.ts:231-289), tracking per-id generation/epoch state (docGeneration, epochs, readyGenerations, pendingContent, retireAllGenerations) to referee the webview's save/reload race. The webview talks back over a document-channel protocol: 'scratch-save' routes through scratchHost.onDocMessage to store.updateScratch(id, text), which replies 'scratch-saved' (vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts:493,832,845,848). A successful delete calls invalidateId(id) and closeDocumentIfShowing(id) to retire a shown document's webview. createScratchPanels is wired in at vscode-plugin/src/extension.ts's activate(context): void (113-1174). No host-capability probe exists for this path today, and no ScratchpadRef/stable-id concept exists — pads are addressed by their basename-derived id only. createScratchHost's onMessage (vscode-plugin/src/chat/scratch-host.ts) is the primary driver of these functions from the chat channel: 'scratch-open' calls deps.panels.openDocument(msg.id) (line 150); 'scratch-new' awaits deps.panels.openDocument(entry.id) and warns `if (opened === undefined)` against its ScratchPanelHandle-or-undefined return (lines 137-138); 'scratch-delete' calls deps.panels.invalidateId/closeDocumentIfShowing (lines 155,165); 'scratch-browse' calls deps.panels.openBrowse() (line 171). 'scratch-open-menu' only lists recent entries and never calls openDocument.

**State after:** openDocument (reached, as before, via openBrowse's unchanged 'scratch-open' dispatch) calls HostEnv.getExtension('vscode.markdown-language-features') first; on true it opens the pad via vscode.openWith(uri, 'vscode.markdown.editor') (locked by default, pencil/lock wired to the editor's own native toggleLocked command); on false (or on a rejected openWith) it falls back to vscode.window.showTextDocument(uri) plus one non-blocking notice. documentBodyHtml, documentBootstrap, the scratch-save/scratch-saved protocol, and openDocument's docGeneration/epochs/readyGenerations/pendingContent/retireAllGenerations bookkeeping are deleted. closeDocumentIfShowing is retained, reshaped to close the native editor tab/document for the given id instead of disposing a webview handle; invalidateId is removed (no reader survives). scratch-browse/scratch-delete/scratch-new are unchanged. ScratchpadRef ({ repo, stableId }) is established for every opened pad, derived from the existing basename-ID. The ScratchPanels interface declaration (scratch-panels.ts:110) is updated to `openDocument(id: string): Promise<void>` to match; scratch-host.ts's 'scratch-new' case drops its now-meaningless `if (opened === undefined) log.warn(...)` check, since a real open failure already surfaces via the outer catch's 'create failed' log.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the host-capability probe call (reusing HostEnv.getExtension) and the ScratchpadRef establishment logic as new, additive code paths alongside the existing opener; nothing existing is removed yet. — ↩ rollbackable
2. Add the new opener (vscode.openWith on capability-probe success, vscode.window.showTextDocument + notice on failure) and wire it to the scratch-open / scratch-open-menu handlers in createScratchPanels, gated by the insrc.scratchpad.nativeEditor flag per the HLD's Phase A rollout. When the flag is off, scratch-open is temporarily a no-op rather than reverting to the old viewer — the flag controls whether the NEW path is active, it does not bring the retired code back. — ↩ rollbackable _(needs: `insrc.scratchpad.nativeEditor`)_
3. Remove documentBodyHtml, documentBootstrap, openDocument's webview-construction body, its docGeneration/epochs/readyGenerations/pendingContent bookkeeping, retireAllGenerations, invalidateId, and the scratch-save/scratch-saved document-channel protocol outright, in the same change; reshape closeDocumentIfShowing to close the native tab/document instead of disposing a webview — ac3 requires the old path gone unconditionally, not deferred behind the flag. — ✕ non-rollbackable
4. Update extension-chat-wiring.test.ts's regex-pinned webview assertions (the textarea/save-button/scratch-save/scratch-saved/replySaved/selectionStart pin) and scratch-panel.test.ts to assert the new opener's behavior instead, per the test strategy's acceptance mapping. — ↩ rollbackable
5. Update the ScratchPanels interface declaration's openDocument signature to Promise<void> (scratch-panels.ts:110), and remove scratch-host.ts's now-dead `if (opened === undefined) log.warn(...)` check in the scratch-new handler (scratch-host.ts:137-138) in the same change as step 3 — leaving it in place would log a false 'did not open' warning on every successful create. — ✕ non-rollbackable

**Backward compat:** The on-disk scratchpad file contract in scratch-store.ts (basename-ID *.md files, exclusive create, guarded read/write) is unchanged; scratch-browse/scratch-delete/scratch-new keep working identically to today, including the existing invalidateId/closeDocumentIfShowing calls on a successful delete (closeDocumentIfShowing is reshaped, not removed). Any code or test relying on documentBodyHtml, documentBootstrap, the scratch-save/scratch-saved message types, openDocument's generation/epoch bookkeeping, or openDocument's old Promise<ScratchPanelHandle | undefined> return shape will break — these are intentionally and permanently removed per ac3, not preserved or shimmed. openBrowse's own return shape and behavior are unchanged.

## 8. Alternatives considered

### 8.1 a1: Direct openWith + native toggleLocked, default-editor fallback — **CHOSEN**

Open the real file with vscode.markdown.editor when the host-capability probe passes; wire the pencil/lock affordance to the editor's own built-in toggleLocked command instead of tracking lock state ourselves; fall back to the plain default editor with a brief notice when the probe fails.

Register a command/editor-title action that calls vscode.commands.executeCommand('vscode.openWith', uri, 'vscode.markdown.editor') once HostEnv.getExtension('vscode.markdown-language-features') succeeds (hosts/specs.ts's existing by-editor-env probe pattern). The pencil/lock UI invokes the editor's own native lock-toggle command rather than s1 tracking locked/unlocked state itself — the built-in editor already owns that state and its rendered-vs-editable view. When the probe fails, fall back to vscode.window.showTextDocument(uri) (the plain text editor) and show one non-blocking notice, per the HLD's already-resolved fallback choice.

The retired path (documentBodyHtml, documentBootstrap, createScratchPanels's webview wiring, openDocument's webview-open body and its generation/epoch bookkeeping) and the scratch-save/scratch-saved document-channel protocol are deleted outright. Of the six SCRATCH_INTENT_TYPES, only scratch-open/scratch-open-menu are rewired to the new opener; scratch-browse/scratch-delete/scratch-new (s2/s7 territory) are untouched.

### 8.2 a2: openWith + self-tracked lock state, default-editor fallback

Same openWith/probe/fallback shape as a1, but s1 tracks its own per-URI locked/unlocked state and drives the rendered-vs-editable view directly, instead of delegating to the built-in editor's toggleLocked command.

Identical capability probe and openWith/fallback behavior to a1, but s1 keeps its own state (e.g. a per-URI map, or workspaceState) for whether a pad is currently locked, and calls lower-level editor APIs to flip between rendered-read-only and editable views rather than invoking the bundled toggleLocked command. This gives s1 full control over the pencil/lock button's exact icon, tooltip, and placement, independent of whatever surface the built-in editor's own command exposes.

**Rejected because:** a2's ac2 score is 'partial': tracking lock state separately from the built-in editor's own internal state creates a real drift risk the alternative's own cons section names, for no acceptance-criteria benefit over a1.

### 8.3 a3: Dual-path transition: retain the legacy webview as a fallback viewer

Add the native openWith path alongside the existing custom document webview, keeping the old viewer available as a secondary/legacy path and deferring its removal to a later cleanup rather than retiring it in this Story.

Introduce vscode.markdown.editor via openWith as in a1, but keep documentBodyHtml/documentBootstrap/createScratchPanels's webview-open path and the scratch-save/scratch-saved protocol in place, reachable via a secondary action (e.g. a 'legacy view' command), and schedule its removal for a follow-up story rather than this one.

**Rejected because:** a3's ac3 score is 'violates': it keeps the custom document webview and save channel in place by design, directly contradicting the Story's explicit requirement that neither remains.

## 9. References

- **[[c2]]** `code` `vscode-plugin/src/chat/scratch-store.ts` — "Flat ~/.insrc/scratches/*.md store, basename IDs, guarded read/write."
- **[[c3]]** `code` `vscode-plugin/src/panels/scratch-panels.ts` — "Custom webview document view (documentBodyHtml/documentBootstrap, scratch-save/scratch-saved); unbounded browse list (browseHtml/renderBrowse/openBrowse) with per-row open/delete icons."
- **[[c8]]** `stakeholder` `user (VS Code host inspection, 2026-11-15)` — "Confirmed on the user's VS Code install: code --list-extensions --show-versions lists markdown-language-features@10.0.0; its manifest registers customEditors vscode.markdown.preview.editor and vscode."
- **[[c12]]** `code` `vscode-plugin/src/hosts/specs.ts:23` — "env.getExtension(detection.extensionId) is an existing, reusable by-extension host-capability check (HostEnv.getExtension, vscode-plugin/src/hosts/types.ts:33; wired via vscode.extensions.getExtension"
- **[[c17]]** `code` `vscode-plugin/src/chat/scratch-host.ts` — "createScratchHost's onMessage is the primary driver of the functions this Story touches: case 'scratch-open' calls deps.panels.openDocument(msg.id) (line 150); case 'scratch-new' awaits deps.panels.op"

## 10. Open questions

- Item ep3 (partial): the invariantsToPreserve citation c8 (VS Code's bundled markdown.editor custom editor) is inherited from the HLD/DEF citation chain, not freshly re-verified by an insrc_analyze_step pass during this LLD's own context.assemble. Nothing is fabricated; re-verify before build if the host's bundled extension version has changed since the original check (2026-11-15).
- Item alt2 (partial): s3's alternatives.judge step scored every alternative against the Story's acceptance criteria (ac1-ac3) and the one HLD shared contract (sc1), but not against the Epic-level constraints (k1-k6) the checklist also calls for. k3 (the Epic constraint s1's ACs operationalize) would score 'satisfies' trivially for all three alternatives; k1/k2/k4/k5/k6 belong to adjacent boundaries and are unaffected by this Story's alternatives either way — re-scoring is unlikely to change the winner but was not done.
- The insrc.scratchpad.nativeEditor flag's semantics, as read in this LLD (it gates activation of the NEW opener; it does not revive the retired webview, since ac3 requires permanent removal regardless of flag state), is this Story's own interpretation of the HLD's Phase A rollout note, not something the HLD itself specified explicitly. Build should follow this LLD's reading.
- Self-correction during LLD self-review: earlier drafting of contractDetails, dataModelChanges, testStrategy, migration, and alternativesConsidered wrongly described openBrowse — the zero-arg list-panel opener — as the function this Story reshapes to call vscode.openWith. The actual per-pad opener openBrowse dispatches to is openDocument(id: string) (vscode-plugin/src/panels/scratch-panels.ts:450-558), which also owns generation/epoch bookkeeping (docGeneration, epochs, readyGenerations, pendingContent, retireAllGenerations) and the closeDocumentIfShowing/invalidateId hooks deleteAndRefresh calls on delete — none of which the original draft accounted for. All affected sections have been corrected to center on openDocument; openBrowse itself is confirmed unchanged.
- Second self-review round: the first correction (centering the LLD on openDocument instead of openBrowse) changed openDocument's contractDetails signature to Promise<void> but missed that the real ScratchPanels interface declares Promise<ScratchPanelHandle | undefined> (scratch-panels.ts:110), and that scratch-host.ts's 'scratch-new' handler (lines 137-138) actively checks that return value — a real caller the LLD had not cited anywhere. Fixed: scratch-host.ts is now cited and added to callSites; the interface-declaration update and the removal of scratch-new's now-meaningless check are now explicit migration steps; the imprecise claim that 'scratch-open-menu' calls the native opener is corrected (it only lists recent entries).
