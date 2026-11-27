<!-- insrc:artifact LLD-2846f076fd5f785f-s1 -->

# LLD: STORY-2846f076fd5f785f-s1 — Single-pane Milkdown Markdown editor

## Summary

**Epic:** `linked-scratchpads-vs-code`
**HLD base run:** `wf-1795803141296-eodyo2`
**HLD effective hash:** `6a3ff5cbf2ff...`
**Tracker:** [insors-ai/insrc#194](https://github.com/insors-ai/insrc/issues/194)

S001 replaces the legacy scratchpad textarea with Milkdown + Crepe in one VS Code custom text-editor pane backed by the real Markdown TextDocument. It provides remembered lock/pencil controls and a selection Send icon that acts only on a click, alongside safe versioned editing, native document lifecycle integration and explicit error/recovery handling. It preserves identity, browse/new/delete and recency behavior. Published APIs support the design, while real Markdown, undo, save/conflict and host qualification remain mandatory build checks.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [HLD context](#2-hld-context)
3. [Contract details](#3-contract-details)
4. [Data model changes](#4-data-model-changes)
5. [Diagrams](#5-diagrams)
6. [Interaction with shared contracts](#6-interaction-with-shared-contracts)
7. [Error paths](#7-error-paths)
8. [Test strategy](#8-test-strategy)
9. [Migration](#9-migration)
10. [Alternatives considered](#10-alternatives-considered)
11. [UX](#11-ux)
12. [References](#12-references)

## 1. Epic impact analysis

**Does not apply**: First Epic story; no approved sibling BUILD.

## 2. HLD context

> See **HLD-2846f076fd5f785f** § 2. Framework summary

**Rollout phase:** Phase A — Milkdown editor foundation
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

## 3. Contract details

**Surface level:** internal-shared

### 3.1 `createScratchPanels`

```typescript
createScratchPanels(deps: ScratchPanelsDeps): ScratchPanels
```

**Parameters:**
- `deps: ScratchPanelsDeps` — Existing store/browse dependencies plus injected editor-open, tab/dirty/close, save-listener, persisted-mode and notification seams. VS Code bindings remain in activation.

**Returns:** `ScratchPanels` — Browse and one-pane rich-document action boundary.

**Preconditions:**
- Activation registers proposed viewType insrc.scratchpad.editor as CustomTextEditorProvider, restricted to validated scratchpad URIs; do not replace Markdown editors globally.
- Pin compatible @milkdown packages to published 7.23.0 and lock dependencies. Bundle browser code/CSS locally with the existing VS Code webview CSP pattern; no CDN or library AI/provider calls.

**Postconditions:**
- Use Milkdown + Crepe for rich content; the backing TextDocument is the only committed buffer. Proposed new private modules: vscode-plugin/src/panels/scratch-editor-provider.ts (VS Code-free host controller) and vscode-plugin/src/panels/scratch-editor-webview.ts (browser entry). Activation supplies all vscode APIs.
- Preserve the previously accepted remembered-mode behavior with an insrc-owned globalState preference; initial value is locked. A new pane snapshots that preference. Pencil/lock changes this pane and the future-pane preference, not other already-open panes. Call Crepe.setReadonly explicitly, never touch native editor private storage.
- Provide a separate Send-only TooltipProvider with explicit non-empty selection visibility even when readonly; Crepe's formatting tooltip hides when readonly and is not sufficient. Hide mutation tools while locked. Preserve selection on pointer activation and offer keyboard activation with accessible name Send to chat.
- Flag insrc.scratchpad.richEditor defaults true. Off opens the same file in a plain TextDocument editor with one notice; no silent no-op or legacy textarea fallback. A failed rich editor initialization preserves the original file and offers that same explicit fallback.
- Images: override onUpload/inline/block upload to send a host request; persist user-supplied image bytes under a validated scratch-root asset directory with exclusive names and a 10 MiB per-image bound. Preserve relative Markdown paths; use proxyDomURL only for display resolution through asWebviewUri. Never persist blob:/vscode-webview: URLs. Workspace link/image actions use host pickers and explicit user selection. No default remote upload or AI feature.

### 3.2 `ScratchStore`

```typescript
interface ScratchStore { listScratches(limit?: number): Promise<ScratchEntry[]>; createScratch(title: string, body?: string): Promise<ScratchEntry>; readScratch(id: string): Promise<{ entry: ScratchEntry; content: string }>; updateScratch(id: string, text: string): Promise<void>; deleteScratch(id: string): Promise<void>; resolveScratch(id: string): Promise<{ ref: ScratchpadRef; filePath: string }>; }
```

**Returns:** `ScratchStore` — Existing guarded store plus deterministic shared identity/path resolution.

**Errors:**
- `ScratchRefused` when Unsafe ID/path, symlink/non-regular target or invalid root containment.
- `ScratchNotFound` when Required file is absent.
- `ScratchStoreError` when Filesystem operation fails.

**Preconditions:**
- Reuse basename/root/regular-file validation before editor-open, delete and asset actions. No direct URI concatenation from messages.

**Postconditions:**
- Proposed shared vscode-plugin/src/chat/scratch-identity.ts exports ScratchpadRef {repo,stableId} and HOME_SCRATCHPAD_SCOPE = 'insrc:scratchpads:home'. Until s7 supplies persisted association/lifecycle mapping, all legacy/new pre-s7 pads resolve to that home scope and existing validated basename including .md. Active workspace never changes their identity.
- resolveScratch is read-only and available without opening a pane. S007 must migrate and preserve that identity before rename/move/archive; no s7 metadata persistence or daemon index is built here.
- Native TextDocument I/O follows normal VS Code save/conflict/backup behavior, as explicitly accepted. Existing store operations retain their guards; do not route native saves through updateScratch or claim ongoing O_NOFOLLOW protection for native saves.
- Rich document admission bound is 1 MiB UTF-8, with a 2 MiB encoded message cap (image transfer is a separate bounded action). Larger notes are refused for rich editing without truncation or file writes. This is a proposed support budget to qualify, not a claim of measured capacity.

### 3.3 `ScratchPanels`

```typescript
interface ScratchPanels { openBrowse(): Promise<ScratchPanelHandle | undefined>; openDocument(id: string): Promise<void>; refreshBrowse(): Promise<void>; deleteDocument(id: string): Promise<'deleted' | 'cancelled'>; dispose(): void; }
```

**Returns:** `ScratchPanels` — Explicit asynchronous open/delete and controller lifetime.

**Errors:**
- `ScratchRefused | ScratchNotFound | ScratchStoreError` when Store validation or deletion fails.
- `Error` when Editor open, synchronization or targeted tab operation fails.

**Preconditions:**
- Every chat/browse event boundary attaches a rejection handler. Creation and open failure are reported separately; refresh failures do not suppress opening.
- One per-TextDocument queue is shared by every pane in a window. Bind each message to its registered URI, random paneSessionId, monotonic draftSeq/editId and accepted baseVersion/digest; reject cross-document, stale-session, oversized, duplicate-conflicting and unknown messages.

**Postconditions:**
- Synchronization: every local doc-changing transaction immediately reports its latest Markdown draft to the host, even while another edit is in flight; selection-only transactions report no edit. Host retains the latest draft for recovery, serializes one WorkspaceEdit at a time, and coalesces superseded queued snapshots. Before applying, recheck base version/digest. A queued descendant may advance only after its identified parent was acknowledged and no unrelated document edit intervened; otherwise reject and retain it as a recovery draft.
- Compute a minimal contiguous text replacement from the accepted source to the admitted Markdown proposal; do not full-replace solely for convenience. Await workspace.applyEdit and acknowledge with draftSeq, document version/digest and canonical snapshot. Match self-origin onDidChange events to the in-flight proposal. Broadcast host/undo/external updates to all panes without echo. An acknowledgement for an older local sequence advances the base but must not overwrite a newer local draft. Any unmatched update freezes mutation and preserves the competing draft for explicit recovery, never last-writer-wins.
- Keep a bounded per-document recovery record in extension-owned local storage for received but unapplied drafts, keyed by canonical URI and sequence, with 1 MiB text bound. Persist before acknowledging receipt; clear only when committed or explicitly discarded. A normal tab dispose must not cancel an already accepted document edit or delete its recovery record. On reopening, show pending recovery without silently overwriting the canonical document. Test close/reload while edits are in flight; if host lifecycle safety cannot be demonstrated, validation fails.
- Single undo authority: remove the published Milkdown history plugin array via Editor.remove before create and replace its key/toolbar actions with host undo/redo commands for the intended document. Drain pending proposals and verify active target before invoking; host change broadcasts are authoritative, never added to another Milkdown history. Standard save command drains first. onWillSaveTextDocument is only a best-effort drain hook because VS Code can bypass it; normal save/autosave guarantees apply, and pending drafts remain recoverable rather than falsely marked saved.
- Fidelity admission: opening, parsing, toggling lock or selecting never writes. Retain the original source. Before allowing a proposal, compare the configured Markdown parse/serialize/parse structure and required raw-syntax fingerprints, including front matter, HTML/comments, code/diagram fences and literal future link syntax. Unknown constructs need exact preservation through an explicitly tested opaque node/plugin; absent that, refuse mutation with the original/draft intact. A minimal diff is not a fidelity proof. Test that supported edits cannot drop unrelated unknown content; no best-effort destructive save.
- Send: clicking captures immutable {paneSessionId,draftSeq,docVersion,selectedText} before focus changes. selectedText is plain selected content from the current ProseMirror document, preserving paragraph boundaries. Drain the captured draft sequence, validate source/session/version and cap with existing capUtf8 (65,536 bytes including ellipsis). If the source changed incompatibly, retain the captured text and report retry; never silently recapture different text. Then use the existing scratch-host send-to-chat route: reveal, await ready, check disposed, insert into composer. No submit, clipboard, attachment or model call.
- Deletion: both chat and browse call deleteDocument. Serialize against local document edits, drain pending drafts and inspect all exact-URI text/custom tabs across groups. Dirty/pending/recovery state cancels and asks the user to save/revert; never force discard. Await targeted closure of clean matching tabs, cancel on false, recheck state and revalidate before deleteScratch. On unlink failure attempt to reopen the still-existing note and report failure. Cross-window global exclusion is not promised; native external-delete/conflict behavior must preserve other windows' dirty drafts.
- Save notifications: activation owns one disposable onDidSaveTextDocument listener scoped to validated scratchpad URIs; coalesce refreshBrowse and proposed ScratchHost.refreshList. Catch each refresh separately, never open closed UI or turn a successful save into a failed save. Creation/deletion and fallback saves use the same refresh boundary.
- Remove legacy documentBodyHtml/documentBootstrap, scratch-save/scratch-saved/scratch-dirty/readiness/content messages and associated types, callbacks, onDocMessage, replySaved, showingId, invalidateId and old generations in one change. Retain capUtf8, the browse webview, six chat intents and existing guarded store APIs. The new versioned editor bridge is a different typed protocol, not reuse of the retired save channel.

## 4. Data model changes

### 4.1 `ScratchpadRef` — new

One deterministic reference per pre-s7 pad, independent of window/workspace: repo is the exported explicit home-scope value; stableId is the validated existing basename. Many panes reference one document; pane sessions and selection state are transient and are never the stable identity. No daemon registry/graph rows are allocated.

```
export interface ScratchpadRef { readonly repo: string; readonly stableId: string; }
export const HOME_SCRATCHPAD_SCOPE = 'insrc:scratchpads:home';
```

**Call sites:**
- `vscode-plugin/src/chat/scratch-store.ts`
- `vscode-plugin/src/panels/scratch-panels.ts`

### 4.2 `ScratchEditorProtocol` — new

Proposed private protocol discriminants cover editor-ready/document-state/draft/receipt/apply-ack/conflict/lock/send-selection/undo/redo/save/asset-request. Every document action is bound to the host-owned pane session and URI. Host state includes accepted version/digest, in-flight operation, latest pending recovery draft and pane subscribers. Define closed runtime-validated unions; never forward arbitrary commands/paths from Markdown content. Asset payloads are separately bounded. New private browser/provider modules are proposed, not existing capabilities.

```
interface ScratchDraftProposal { readonly type: 'draft'; readonly paneSessionId: string; readonly draftSeq: number; readonly baseVersion: number; readonly baseDigest: string; readonly parentEditId?: string | undefined; readonly markdown: string; }
interface ScratchSelectionSend { readonly type: 'send-selection'; readonly paneSessionId: string; readonly draftSeq: number; readonly docVersion: number; readonly selectedText: string; }
```

**Call sites:**
- `vscode-plugin/src/panels/scratch-panels.ts`
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/chat/scratch-host.ts`

### 4.3 `DocumentWebviewProtocol` — field-remove

Retire legacy textarea renderer and save/dirty/ready/content protocol, generation state and obsolete methods/callbacks/tests atomically. Keep browse/list protocol, capUtf8 and six chat intents. Add the typed rich-editor bridge, unified async delete and save notification refresh. Preserve direct explicit selected-text insertion; cited attachments remain s8.

**Call sites:**
- `vscode-plugin/src/panels/scratch-panels.ts`
- `vscode-plugin/src/chat/scratch-host.ts`
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts`
- `vscode-plugin/src/chat/__tests__/scratch-host.test.ts`
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts`

## 5. Diagrams

- [Sequence diagram](./sequence-diagram.html)
- [Component dependencies](./component-dependency.html)

## 6. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Export shared identity and read-only resolver now. Pre-s7 home/basename mapping stays deterministic across panes and windows; s7 owns persisted association and lifecycle migration. No sc2/sc3 or adjacent story feature is designed here. |

## 7. Error paths

**Error cases**

- **Unsafe or missing target** (recoverable)
  - Detection: resolveScratch/runtime message validation rejects basename/root/type/session mismatch.
  - Response: Report refusal/not-found; no fallback opening of a refused target or arbitrary command/path.
  - User impact: Original remains untouched.
- **Stale base or concurrent external edit** (recoverable)
  - Detection: Queued base version/digest or identified parent no longer matches authoritative TextDocument.
  - Response: Reject, stop automatic mutation, preserve recovery draft and canonical source; never overwrite/merge heuristically.
  - User impact: User retains both versions for deliberate recovery.
- **Unsupported Markdown or serializer loss** (recoverable)
  - Detection: Parse/serialize/parse or required raw-syntax fingerprints differ, or a node has no exact-preservation handler.
  - Response: Refuse unsafe mutation, keep original and draft; display limitation in the same pane. Opening alone never writes.
  - User impact: No silent content loss; qualification failure blocks acceptance.
- **applyEdit/save/undo failure or pane closes during pending edit** (recoverable)
  - Detection: Awaited operation fails, document version changes unexpectedly, or session disposes with pending drafts.
  - Response: Retain bounded recovery record, reject stale acknowledgements, let already accepted safe edits finish, and report actual operation state. Never falsely mark local-only text saved.
  - User impact: Pending text remains recoverable; no duplicate history.
- **Rich-editor initialization or note-size admission failure** (recoverable)
  - Detection: create rejects, assets cannot load, or note exceeds 1 MiB UTF-8.
  - Response: Keep file intact, report reason and offer explicit same-file plain text fallback; never truncate or silently no-op.
  - User impact: Source remains accessible without a normal two-view flow.
- **Dirty/pending/cancelled deletion** (recoverable)
  - Detection: Exact-URI inspection finds dirty/recovery/pending state or awaited close returns false.
  - Response: Cancel before unlink. On filesystem failure after clean close, attempt reopening and report failure.
  - User impact: Draft/file retained; unrelated tabs untouched.
- **Asset failure or invalid Send** (recoverable)
  - Detection: Image type/size/path action rejects; selected snapshot is stale/oversized; chat disposed before ready.
  - Response: No broken asset reference is inserted on failed upload. Reject invalid source snapshot; preserve captured selection. Use existing bounded insertion and disposed-chat handling; no auto-submit.
  - User impact: Failures are visible and no different text is silently sent.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Locked pane with non-empty selection. | Independent Send tooltip remains available, mutation controls hidden; only click inserts. |
| New pane after a prior pane changed lock state. | Use insrc remembered preference, initially locked; do not change already-open panes. |
| Host ack arrives after newer local typing. | Advance base/ack sequence without replacing the newer draft; latest received draft is retained for recovery. |
| Same document in several editor groups. | One host queue/authority, independent pane sessions/selection; broadcasts have no echo and inactive panes cannot send another pane's selection. |
| Save/autosave/close before the last edit is applied. | Pane Save explicitly drains. Native autosave may save an earlier canonical version; pending drafts remain recoverable, and no receipt alone claims saved state. Close/reload pending tests must pass. |
| No edits, just open/select/lock. | Zero WorkspaceEdits and file writes, including initialization/trailing/normalization transactions. |

**Invariants to preserve**

- Existing .md paths, IDs and source files remain; store-managed operations retain their guards. Normal native TextDocument I/O has the explicitly accepted host boundary. [[c2]]
- Browse webview and six chat intents remain; all old document protocol consumers migrate together. [[c3]]
- Explicit selected text is capped and inserted after chat reveal/readiness without submitting; save/create/delete refresh existing menus and browse. [[c17]]

## 8. Test strategy

**Test framework:** `node:test/assert for existing host/store/panel suites; browser tests for the packaged Milkdown webview and real VS Code extension-host tests for lifecycle behavior. No implementation tests have been run for this design.`

**Test levels**

- **unit** — Exercise host contract decisions and existing invariants.
  - Subjects: `Deterministic identity, URI/type/symlink refusal, note/image/message bounds and no-op-on-open guards.`, `One-in-flight/queued-descendant behavior, duplicate/stale/cross-pane messages, self echo versus external change and late acknowledgements.`, `Dirty/recovery/cancelled/failed deletion, created-but-open-failed reporting, save refresh/disposal and bounded composer insertion.`
  - Fixtures: `Existing fakeScratchFs/panel/chat seams extended with deterministic document queue and tab operations.`
- **integration** — Prove production wiring and actual library behavior together.
  - Subjects: `Published 7.23.0 local bundle under production CSP, setReadonly/mode preference and independent Send tooltip with keyboard focus preservation.`, `Remove Milkdown history provider/commands/keymap; bind host-targeted undo/redo, drain and broadcast without loops.`, `Parse/serialize/edit corpus: headings, tight/loose lists, tables, links/images, escaping, front matter, HTML/comments, Unicode, CRLF, fenced code/diagrams and literal custom links. Assert original unchanged on open and no unknown-content loss on supported edits.`, `Asset onUpload/proxyDomURL keeps portable relative source paths; failures never insert transient/broken URLs.`, `Static/typecheck migration: no legacy document protocol/method consumers; six chat intents remain.`
  - Fixtures: `Pinned library package and a browser runner; exact real-note fixtures plus adversarial/unsupported syntax cases.`
- **live** — Required VS Code qualification; do not substitute fake evidence or mark skipped checks passed.
  - Subjects: `Real .md open/edit/save/dirty/undo/redo/revert, native autosave and external edits in same and second windows.`, `Close/reload while draft receipt/apply/ack is delayed; prove recovery without false saved state or draft loss.`, `Multiple groups/panes, remembered lock, locked selection, select->click Send with chat closed/ready/disposed, and no automatic submission.`, `Real image paste/drop, URL paste, workspace link/image insertion, CSP/offline operation and error paths.`, `Budget: 1 MiB UTF-8 note and boundaries; responsiveness target <=150 ms median keystroke-to-render and <=1 s p95 host acknowledgement on a recorded reference host, with a smaller supported bound or explicit design revision if unmet.`
  - Fixtures: `Real VS Code host at the supported engine floor and current 1.146.0 where available; capture versions and unavailable coverage honestly.`, `Disposable note/asset roots and second window; never destructive probes on user notes.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Browser/live: one Milkdown pane, rich authoring, TextDocument authority, version/recovery/undo/save/conflict matrix and note-size qualification.` |
| `ac2` | `Browser/live: remembered default initially locked, pencil/lock in the same pane, mutation disabled while locked and independent selection Send retained.` |
| `ac3` | `Migration/typecheck: retired textarea/save channel absent; store and existing .md format remain.`, `Corpus/browser/live: zero writes on open and refused unsafe serialization preserves original/draft.` |
| `ac4` | `Browser/live: non-empty selection reveals Send; mouse and keyboard click capture exact text, cap and insert once without submit; locked, stale, cross-pane and disposed-chat cases.` |

## 9. Migration

**State before:** The analyzer/direct reads show a singleton custom textarea document view in vscode-plugin/src/panels/scratch-panels.ts, save/dirty/ready/content messages, generation state, and chat-host persistence/refresh callbacks. DEF7/HLD5 now approve the library-backed single-pane replacement; current production scratchpad code is unchanged and no S001 PLAN/BUILD exists.

**State after:** One Milkdown/Crepe CustomTextEditorProvider pane on the existing .md TextDocument, versioned host synchronization/recovery and host undo/save authority. Insrc-owned remembered locks and click-only selected-text Send replace the unavailable built-in-editor hook. Browse/new/delete, identity and recency are preserved; legacy document channel is removed.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Introduce shared identity/resolver and typed private editor/host protocol with runtime bounds, version checks and recovery ownership; preserve all files and sibling story scope. — ↩ rollbackable
2. Package pinned Milkdown 7.23.0 browser assets locally; register the custom editor through activation seams and configure lock, independent Send tooltip, host-backed images and removal/rebinding of independent history. — ↩ rollbackable
3. Integrate the per-document edit queue, receipts/acks/broadcasts, host commands, recovery and save notifications. Route both deletion entry points through one asynchronous safe operation; catch every event rejection. — ↩ rollbackable
4. Switch open/new to the new editor under insrc.scratchpad.richEditor (default true); flag-off is explicit same-file text fallback. Atomically remove old document renderer/protocol/types/callbacks/methods and update all fakes/tests. — ↩ rollbackable _(needs: `insrc.scratchpad.richEditor`)_
5. Run mapped host/store/browser suites, production bundle/CSP checks and the mandatory live/corpus/performance qualification. Any missing/failed required check blocks validation; retain data/drafts on all failures. Present BUILD only after validation passes. — ↩ rollbackable

**Backward compat:** No upfront data rewrite or rename; .md files, existing basename IDs, list UI and six chat intents stay. New edits may use the qualified supported Markdown serialization, but no write on open or silent unknown-content loss is allowed. Internal openDocument return type, deletion method, refreshList and private protocol require atomic caller migration. Legacy nativeEditor flag was design-only; use richEditor for the revised implementation. Normal VS Code file save behavior applies; no claim of store O_NOFOLLOW on native saves. Existing stored artifact history remains readable; old LLD native-editor blockers are superseded by approved upstream changes.

## 10. Alternatives considered

### 10.1 a1: Versioned minimal-edit bridge — **CHOSEN**

Keep TextDocument authoritative and send coalesced, versioned renderer proposals that become minimal text edits.

Milkdown maintains the transient rendered draft while the extension host serializes changes per TextDocument. Each pane has one in-flight proposal and coalesces later local changes. The host validates URI, pane session, base document version and content digest, derives a minimal contiguous text replacement against the accepted base, and uses WorkspaceEdit. Host snapshots acknowledge edits and synchronize all panes.

Only acknowledged state is canonical. Host updates never echo into new proposals. Independent Milkdown history is removed; explicit undo/redo drains the pending queue then invokes the host stack for the intended resource. Stale proposals preserve recovery drafts instead of overwriting new content. Rich editing is admitted only when the supported syntax round-trips without semantic/opaque-content loss.

### 10.2 a2: Versioned whole-document checkpoint bridge

Use the same authoritative TextDocument but apply an acknowledged full-buffer replacement per coalesced checkpoint.

The renderer emits a full Markdown snapshot after a short coalescing interval. The host validates base version/digest and applies a whole-document WorkspaceEdit, then broadcasts authoritative state. Selection Send, lock control, input validation and syntax admission are identical to a1.

This reduces mapping logic but entire-buffer edits disturb ranges and undo granularity and can produce large replacements for small edits. It still cannot bypass stale-version rejection, fidelity checks or normal save/conflict behavior.

**Rejected because:** No benefit to ac2/ac3/ac4 or sc1; full replacements weaken ac1's document interaction behavior.

## 11. UX

- [UX mock](./ux-mock.html)

## 12. References

- **[[c2]]** `code` `vscode-plugin/src/chat/scratch-store.ts` — "Flat ~/.insrc/scratches/*.md store, basename IDs, guarded read/write."
- **[[c3]]** `code` `vscode-plugin/src/panels/scratch-panels.ts` — "Custom webview document view (documentBodyHtml/documentBootstrap, scratch-save/scratch-saved); unbounded browse list (browseHtml/renderBrowse/openBrowse) with per-row open/delete icons."
- **[[c17]]** `code` `vscode-plugin/src/chat/scratch-host.ts` — "createScratchHost's onMessage is the primary driver of the functions this Story touches: case 'scratch-open' calls deps.panels.openDocument(msg.id) (line 150); case 'scratch-new' awaits deps.panels.op"
- **[[c31]]** `code` `vscode-plugin/src/extension.ts:1023` — "Activation supplies store and document send/save/dirty callbacks to createScratchPanels."
- **[[c32]]** `doc` `docs/reqs/enhanced-scratchpad-prd.html#requirements` — "SP-5 retains existing Send to chat; SP-4 requires preserved committed data and drafts on failure/conflict."
- **[[c40]]** `stakeholder` `User chat — Milkdown direction selected, 2026-11-27` — "User rejected clipboard/two views, requested embeddable JS Markdown libraries, checked Milkdown and said it looks good. Normal VS Code save behavior accepted; Send requires a click and only inserts in"
- **[[c41]]** `doc` `https://milkdown.dev/docs/api/crepe` — "Crepe has a configurable floating selection toolbar; library controls and plugins are owned by the embedding application. Source confirms editable control and customizable tooltip; no integration/roun"
- **[[c42]]** `doc` `https://code.visualstudio.com/api/extension-guides/custom-editors` — "CustomTextEditorProvider renders an owned webview over a VS Code TextDocument; changes must synchronize to that document."
- **[[c50]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/DEF.md` — "Approved DEF7; S001 single-pane Milkdown editor, remembered lock, explicit Send click."
- **[[c51]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/HLD.md` — "Approved HLD5; shared sc1 ownership and sibling boundaries preserved."
- **[[c52]]** `doc` `/tmp/.insrc/scratchpad-s001-capability-check/milkdown-7.23.0/` — "Published 7.23.0 package metadata/types inspected without installing: Crepe.setReadonly, Editor.remove, history plugin array and image upload/display callbacks. Integration still untested."
- **[[c53]]** `doc` `https://raw.githubusercontent.com/Milkdown/milkdown/main/packages/crepe/src/feature/toolbar/index.ts` — "Default formatting tooltip requires editable view; a separate owned selection Send tooltip is required."

## Citations

- **[[c2]]** `code` `vscode-plugin/src/chat/scratch-store.ts` — "Flat ~/.insrc/scratches/*.md store, basename IDs, guarded read/write."
- **[[c3]]** `code` `vscode-plugin/src/panels/scratch-panels.ts` — "Custom webview document view (documentBodyHtml/documentBootstrap, scratch-save/scratch-saved); unbounded browse list (browseHtml/renderBrowse/openBrowse) with per-row open/delete icons."
- **[[c17]]** `code` `vscode-plugin/src/chat/scratch-host.ts` — "createScratchHost's onMessage is the primary driver of the functions this Story touches: case 'scratch-open' calls deps.panels.openDocument(msg.id) (line 150); case 'scratch-new' awaits deps.panels.op"
- **[[c31]]** `code` `vscode-plugin/src/extension.ts:1023` — "Activation supplies store and document send/save/dirty callbacks to createScratchPanels."
- **[[c32]]** `doc` `docs/reqs/enhanced-scratchpad-prd.html#requirements` — "SP-5 retains existing Send to chat; SP-4 requires preserved committed data and drafts on failure/conflict."
- **[[c40]]** `stakeholder` `User chat — Milkdown direction selected, 2026-11-27` — "User rejected clipboard/two views, requested embeddable JS Markdown libraries, checked Milkdown and said it looks good. Normal VS Code save behavior accepted; Send requires a click and only inserts in"
- **[[c41]]** `doc` `https://milkdown.dev/docs/api/crepe` — "Crepe has a configurable floating selection toolbar; library controls and plugins are owned by the embedding application. Source confirms editable control and customizable tooltip; no integration/roun"
- **[[c42]]** `doc` `https://code.visualstudio.com/api/extension-guides/custom-editors` — "CustomTextEditorProvider renders an owned webview over a VS Code TextDocument; changes must synchronize to that document."
- **[[c50]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/DEF.md` — "Approved DEF7; S001 single-pane Milkdown editor, remembered lock, explicit Send click."
- **[[c51]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/HLD.md` — "Approved HLD5; shared sc1 ownership and sibling boundaries preserved."
- **[[c52]]** `doc` `/tmp/.insrc/scratchpad-s001-capability-check/milkdown-7.23.0/` — "Published 7.23.0 package metadata/types inspected without installing: Crepe.setReadonly, Editor.remove, history plugin array and image upload/display callbacks. Integration still untested."
- **[[c53]]** `doc` `https://raw.githubusercontent.com/Milkdown/milkdown/main/packages/crepe/src/feature/toolbar/index.ts` — "Default formatting tooltip requires editable view; a separate owned selection Send tooltip is required."
