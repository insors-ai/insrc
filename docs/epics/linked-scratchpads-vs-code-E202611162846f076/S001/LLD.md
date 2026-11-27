<!-- insrc:artifact LLD-2846f076fd5f785f-s1 -->

# LLD: STORY-2846f076fd5f785f-s1 — Native Markdown Editor pad surface

## Summary

**Epic:** `linked-scratchpads-vs-code`
**HLD base run:** `wf-1794821904095-ndy0d1`
**HLD effective hash:** `a1e1d0dc0f84...`
**Tracker:** [insors-ai/insrc#194](https://github.com/insors-ai/insrc/issues/194)

S001 replaces the custom scratchpad document webview with the host's native Markdown editor while preserving existing opening, deletion, text-to-chat and recency behavior. The revised contract makes identity, file resolution, native tab operations, save notifications and error ownership explicit; flag-off uses the plain text fallback. Native release remains blocked until initial-lock control, rendered selection and native save-boundary guarantees are proved or the affected upstream requirements are explicitly amended; the installed editor's toggle and remembered mode are insufficient evidence.

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
11. [References](#11-references)
12. [Open questions](#12-open-questions)

## 1. Epic impact analysis

**Does not apply**: First Epic story; no approved sibling BUILD.

## 2. HLD context

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

## 3. Contract details

**Surface level:** internal-shared

### 3.1 `createScratchPanels`

```typescript
createScratchPanels(deps: ScratchPanelsDeps): ScratchPanels
```

**Parameters:**
- `deps: ScratchPanelsDeps` — Existing dependencies plus injected native open/close, capability admission, settings and notification operations. Only extension activation imports vscode.

**Returns:** `ScratchPanels` — Browse controller and asynchronous native-document actions with one disposal owner.

**Preconditions:**
- Activation supplies typed host seams; capability admission cannot be inferred from getExtension alone.

**Postconditions:**
- HostEnv.getExtension remains the first inexpensive availability check. Native mode additionally requires a host-version-qualified implementation of idempotent initial lock establishment and state verification. A toggle command or remembered default is insufficient. No private webview RPC, extension-global-state edits, guessed command arguments or user setting mutation.
- insrc.scratchpad.nativeEditor defaults true. Off selects the same plain text fallback as absent editor; open/new never silently no-op. Available-but-unqualified native hosts report the blocker and can open a clearly identified text fallback, which is degraded access and never an ac1 pass.
- Only the browse webview remains. Remove documentBodyHtml/documentBootstrap, document protocol types/arrays, replySaved, onDocMessage and document-only callbacks, dirty/title state, generations, epochs, invalidateId and showingId; migrate all production and test callers atomically.
- Native operations use validated file URIs produced by the store seam. Native save/undo/conflict belong to VS Code only after the save-boundary qualification described under ScratchStore. No automatic second write through updateScratch.

### 3.2 `ScratchStore`

```typescript
interface ScratchStore { listScratches(limit?: number): Promise<ScratchEntry[]>; createScratch(title: string, body?: string): Promise<ScratchEntry>; readScratch(id: string): Promise<{ entry: ScratchEntry; content: string }>; updateScratch(id: string, text: string): Promise<void>; deleteScratch(id: string): Promise<void>; resolveScratch(id: string): Promise<{ ref: ScratchpadRef; filePath: string }>; }
```

**Returns:** `ScratchStore` — Existing guarded store plus a new validated identity/path resolver; resolution does not imply safe future native I/O.

**Errors:**
- `ScratchRefused` when Malformed/traversal ID, non-regular or symlink target, or target outside canonical store root.
- `ScratchNotFound` when Required source file missing.
- `ScratchStoreError` when I/O or permissions failure.

**Preconditions:**
- resolveScratch reuses the store's basename validation, canonical root containment and guarded regular-file validation. Activation converts its absolute filePath with vscode.Uri.file; no raw ID concatenation elsewhere.
- All current legacy pads are unassigned. The active workspace never changes their identity.

**Postconditions:**
- Define ScratchpadRef and HOME_SCRATCHPAD_SCOPE = 'insrc:scratchpads:home' in proposed vscode-plugin/src/chat/scratch-identity.ts; export it for later consumers. Until s7 adds persisted association/lifecycle mapping, ref is exactly {repo: HOME_SCRATCHPAD_SCOPE, stableId: existing validated basename including .md}. resolveScratch is read-only, repeatable across windows and usable without opening a pad.
- StableId is not a mutable display title. S001 supports no rename/move/archive. S007 must persist and migrate identity before enabling those operations, retain this legacy mapping, and explicitly associate notes rather than infer repo from active window. No s7 persistence/index is implemented here.
- File naming, existing contents and format are unchanged. Existing store operations retain their guards. Native file reads/writes are a separate boundary: a preflight resolve/read cannot enforce O_NOFOLLOW on later host saves and is not claimed to do so.
- Build blocker B2: qualify native save failure, stale-window conflict, deleted/replaced/symlink targets and any required no-follow protection against the approved file contract. The current native-on-real-file design has no demonstrated equivalence to guarded store writes. If equivalence cannot be achieved with supported host APIs, stop and obtain an explicit upstream requirement/design amendment; do not add a bespoke editor, intercepted duplicate save or custom URI scheme silently.

### 3.3 `ScratchPanels`

```typescript
interface ScratchPanels { openBrowse(): Promise<ScratchPanelHandle | undefined>; openDocument(id: string): Promise<void>; refreshBrowse(): Promise<void>; deleteDocument(id: string): Promise<'deleted' | 'cancelled'>; dispose(): void; }
```

**Returns:** `ScratchPanels` — One document action boundary used by chat and browse; asynchronous completion/cancellation is explicit.

**Errors:**
- `ScratchRefused | ScratchNotFound | ScratchStoreError` when Store resolution/deletion refused or failed.
- `Error` when Native/fallback open or tab operation fails.

**Preconditions:**
- Every entry point catches returned promises; no void promise without an attached catch. Controller operations propagate errors; boundary handlers show one actionable message and log the cause.
- Host tab matching uses the resolved canonical URI, across all tab groups, including text and custom-editor inputs. Never close whichever unrelated tab happens to be active.

**Postconditions:**
- openDocument validates the source first, then attempts qualified native open. Missing/refused input is not retried in a different editor. Genuine provider unavailability/open failure permits one text fallback and distinct notice; fallback failure is reported once. scratch-new reports created-but-open-failed separately and still refreshes lists.
- deleteDocument serializes against opens/deletes for the same ID in this window. It revalidates immediately before unlink. Chat and browse both call it; neither separately invokes deleteScratch or a removed invalidateId.
- Safe minimal dirty policy: if any matching native/text document has unsaved changes, leave file and tabs intact, return cancelled and tell the user to save or revert first. Do not prompt to discard, force-close or call Save As. Close matching clean tabs via awaited targeted host operation; on refusal/cancellation leave file intact. Recheck dirty state and matching tabs before unlink; if they changed, cancel. After successful unlink refresh both lists. If unlink fails after clean tabs closed, attempt to reopen the still-existing pad and report the failure. Cross-window exclusion is not promised; dirty buffers in other windows must survive external deletion and cannot silently recreate a deleted note via insrc.
- Native save lifecycle: activation subscribes once to workspace.onDidSaveTextDocument for validated scratch-root file URIs, queues/coalesces refreshBrowse and a new ScratchHost.refreshList operation, and catches each refresh failure independently. New/create/delete and fallback saves use the same refresh path. Dispose subscriptions on deactivation and drop pending UI work. No daemon index or s2 read-model is added.
- Preserve Send to chat as an explicit native-editor-context command. Required contract: obtain the actual selected text, source URI and document version from the focused native editor, apply existing capUtf8 and route through ScratchHost.onMessage({type:'send-to-chat',text}); reveal chat, wait ready, insert without submitting. Never use a stale activeTextEditor from another tab or silently copy the whole document. Build blocker B3: rendered selection extraction must be demonstrated on the qualified host. Supported manual alternative: native Copy followed by an explicit insrc command that reads the clipboard once and inserts into chat, with no automatic clipboard monitoring; whether this replaces the direct existing action requires explicit product acceptance, so it is not treated as an automatic waiver. Text fallback can use its actual TextEditor.selection.

## 4. Data model changes

### 4.1 `ScratchpadRef` — new

One pad resolves to exactly one reference; its repo field denotes the explicit home scope until s7 owns persisted association. Many windows may resolve the same pad; they must return identical references. No graph/entity/daemon registry rows are allocated. Resolution is available to later consumers without opening the document.

```
export const HOME_SCRATCHPAD_SCOPE = 'insrc:scratchpads:home';
export interface ScratchpadRef { readonly repo: string; readonly stableId: string; }
// New shared definitions proposed for vscode-plugin/src/chat/scratch-identity.ts.
```

**Call sites:**
- `vscode-plugin/src/chat/scratch-store.ts`
- `vscode-plugin/src/panels/scratch-panels.ts`

### 4.2 `ScratchPanelsDeps` — field-add

Inject host operations in extension activation, not vscode imports into the controller. Provide validated native/text open, exact-URI tab enumeration/close with cancellation result, current dirty state, capability admission and notification callbacks. Proposed capability seam is an application contract, not a claim of an existing supported VS Code lock or selection API. Host implementation must identify actual supported APIs and live evidence before build admission.

**Call sites:**
- `vscode-plugin/src/panels/scratch-panels.ts`
- `vscode-plugin/src/extension.ts`

### 4.3 `DocumentWebviewProtocol` — field-remove

Remove scratch-save, scratch-saved, scratch-dirty, scratch-ready, scratch-content and their document-only types/constants, callbacks and tests together. Remove replySaved, showingId, invalidateId and ScratchHost.onDocMessage; retain capUtf8 and the six chat intents. Rewire chat and browse delete to deleteDocument, preserve native selection-to-chat, and replace save-driven refresh with an explicitly disposed host save subscription. Do not remove list webview protocol or S008's independent future attachment work.

**Call sites:**
- `vscode-plugin/src/panels/scratch-panels.ts`
- `vscode-plugin/src/chat/scratch-host.ts`
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts`
- `vscode-plugin/src/chat/__tests__/scratch-host.test.ts`
- `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts`

## 5. Diagrams

- [Sequence diagram](./sequence-diagram.html)

## 6. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Define one exported reference and deterministic resolver now. All pre-s7 pads use the explicit home scope and existing basename stableId. S007 later owns persisted repo association and identity-preserving rename/move/archive; it must migrate this mapping, not regenerate identities from an active workspace or renamed filename. No sc2/sc3 or adjacent UI features are implemented. |

## 7. Error paths

**Error cases**

- **Native lock control or rendered selection capability is unqualified.** (terminal)
  - Detection: A host-version admission record lacks supported API evidence and passing live tests; extension presence/toggle alone never qualifies.
  - Response: Report B1/B3 and block native build/validation completion; retain explicit degraded text access. Do not claim full acceptance or fabricate a capability.
  - User impact: Notes remain accessible through text fallback; native release cannot be signed off.
- **ID/path invalid, missing or replaced by a symlink/non-file.** (recoverable)
  - Detection: resolveScratch rejects before URI creation/open; revalidation before delete rejects changed targets.
  - Response: Handle ScratchRefused/ScratchNotFound distinctly at every caller. No fallback open for refused/missing files. B2 remains open for replacements occurring after preflight during native I/O.
  - User impact: Clear refusal/not-found message; no unintended file opens.
- **Native open fails or the editor is genuinely unavailable.** (recoverable)
  - Detection: Probe absence or rejected open command after source validation.
  - Response: Attempt one plain text fallback with reason-specific notice. Catch a second failure at chat and browse boundaries; scratch-new identifies that creation succeeded even if opening failed.
  - User impact: Text access when possible; one actionable error otherwise.
- **Delete encounters dirty documents or close cancellation.** (recoverable)
  - Detection: Host enumerates all URI-matching text/custom tabs and live document dirtiness; awaited targeted close returns false or matching state changes.
  - Response: Return cancelled without unlink. Ask user to save/revert first; preserve dirty buffers. Serialize same-ID operations locally; no global lock claim.
  - User impact: Existing draft and source remain intact.
- **Deletion fails after clean tabs close.** (recoverable)
  - Detection: deleteScratch rejects after pre-unlink validation.
  - Response: Report failure, refresh list truthfully, and best-effort reopen the existing source; a reopen failure is also caught.
  - User impact: No successful-deletion message; note remains listed if present.
- **Native save, external edit or concurrent-window conflict cannot meet the required file contract.** (terminal)
  - Detection: Qualification matrix exercises save failure, conflicts, replacement, symlinks and external deletion; absence of proof is B2, not pass.
  - Response: Keep prior committed data and drafts as required; if supported host behavior cannot guarantee it, block build and require explicit upstream amendment.
  - User impact: No silent loss or falsely qualified native release.
- **Refresh or chat insertion fails/disposes while awaiting readiness.** (recoverable)
  - Detection: Save subscription/refresh promise rejects or chat seam reports disposed after ready.
  - Response: Log refresh failures independently; don't turn successful saves into failed saves. Preserve the existing disposed-chat drop and catch behavior. Dispose event subscriptions and pending work on deactivation.
  - User impact: Persisted file remains valid; UI failure is observable without duplicate submission.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Flag disabled, editor absent or workspace-free legacy note. | Validated source opens in text fallback; identity remains {repo:'insrc:scratchpads:home',stableId:basename}. No no-op or inferred repo association. |
| Another Markdown tab was unlocked before opening a scratchpad; same pad already open editable. | Mandatory qualification proves targeted, idempotent locked initial state; a toggle/default assumption fails B1. |
| Two pads open concurrently in different groups. | Independent canonical-URI targets, no reliance on active editor when closing/locking/transferring selection; no false singleton assumption. |
| Same ID opened/deleted concurrently in this window. | Per-ID serialized sequence preserves intentional operation order. Delete barrier/cancellation prevents a queued stale open from silently reopening a removed note. No generation protocol for webview content remains. |
| Rendered editor selected text while a different text editor was previously active. | Only actual selected rendered source is inserted; stale activeTextEditor is rejected. B3 requires host proof, never whole-note substitution. |
| Save occurs while browse or chat is closed, or extension deactivates. | Refresh uses existing instances only; no UI opens as a side effect. Later menu/list reads see saved mtime. Disposed listeners cannot post. |

**Invariants to preserve**

- Existing .md basename naming and content format remain readable; store operations retain guarded read/write/delete. Native I/O equivalence is explicitly unverified and build-blocking, rather than falsely attributed to preflight. [[c2]]
- Browse/list webview and its six chat-side intents remain, with open/new/delete migrated deliberately. Preserve selection Send to chat and save-driven list refresh through replacement seams. [[c3]]
- Explicit selection inserts bounded text into the composer after reveal/ready and never automatically submits; no implicit note evidence is added. [[c17]]

## 8. Test strategy

**Test framework:** `node:test and node:assert, extending existing scratch-panel.test.ts, scratch-host.test.ts, scratch-store.test.ts and extension-chat-wiring.test.ts; real host qualification recorded separately and required for native acceptance.`

**Test levels**

- **unit** — Verify controller/store contracts independently of private native editor behavior.
  - Subjects: `Deterministic home-scope identity without opening; multiple windows/workspace choices resolve the same existing ID identically.`, `Validated URI resolution refuses traversal, symlinks and non-files; missing sources never reach native/fallback open.`, `Flag false selects text fallback; native failure selects one fallback; both-fail and missing/refused errors are caught on chat open, browse open and new.`, `Async delete: dirty, multi-group, cancellation, failed-close, unlink failure, changed state and per-ID open/delete ordering.`, `Save notification coalescing, independent refresh failures and disposal; explicit bounded text insertion without auto-submit.`
  - Fixtures: `Existing fakeScratchFs and fakePanels updated to new contracts.`, `Injected fake native host with explicit URI/tab/dirty/close/capability operations; command success alone never marks lock capability supported.`
- **integration** — Prove all production routes use the new contracts and retired protocol has no callers.
  - Subjects: `Activation supplies seams and one scoped save listener; chat and browse share deleteDocument; every async event entry has an error sink.`, `Native and fallback saves refresh open browse and menu without opening closed UI; listener disposal prevents late posts.`, `Remove document protocol/types/constants/callbacks/replySaved/showingId/invalidateId/onDocMessage atomically while preserving capUtf8 and six chat intents.`
  - Fixtures: `Existing extension-chat-wiring test harness and scratch-host fakes.`
- **live** — Mandatory release qualification on each supported host/version; presently NOT RUN. Missing APIs/evidence fail admission and block acceptance.
  - Subjects: `B1: open after another Markdown editor unlocked, reopen editable pad, empty pad, simultaneous opens and lock/pencil focus targeting; assert initial locked state without editing private extension storage or global settings.`, `B3: select rendered text with unsaved edits while another text tab is active; transfer exact selection once and only insert into composer. Manual clipboard flow is not acceptance-equivalent without explicit product decision.`, `B2: native/fallback save failure, stale-window conflict, delete/recreate, symlink replacement before open and before save, external edits/deletion; demonstrate retained committed data/drafts and required guard semantics.`, `Native rich authoring: image paste/drop, URL link paste, insert workspace link/image, undo/redo and save on actual scratch-root files.`, `Dirty/multi-group deletion cancel/success/failure; ensure unrelated tabs and dirty drafts survive.`
  - Fixtures: `VS Code 1.146.0 / markdown-language-features 10.0.0 baseline plus any claimed supported forks.`, `Disposable scratch root and controlled second window; no real user notes in destructive probes.`, `Evidence identifies exact supported APIs, versions, steps and observed results; static manifests or mocks cannot satisfy B1/B2/B3.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Unit/integration: validated URI, true/off/absent/failure branches, error ownership and save-refresh wiring.`, `MANDATORY LIVE B1/B2: locked initial state and safe native document lifecycle; richer authoring matrix. Current status BLOCKED/UNVERIFIED, not a passing result.` |
| `ac2` | `MANDATORY LIVE: pencil/lock controls target the intended native pad and preserve unrelated editor state; baseline includes globally remembered unlocked state.` |
| `ac3` | `Integration/typecheck: no retired document protocol/API callers, list UI still functions, native editor used without a bespoke replacement webview.`, `Existing store tests plus MANDATORY LIVE B2: names/content format retained, real save/conflict boundary matches approved guarantees; otherwise upstream amendment required.` |

## 9. Migration

**State before:** Analyzer passes and direct reads identify createScratchPanels in vscode-plugin/src/panels/scratch-panels.ts as owner of a custom document singleton, generation/epoch state, documentBootstrap, selection-to-chat and document save callbacks. vscode-plugin/src/chat/scratch-host.ts receives chat open/new/delete and document saves; saves update the guarded ScratchStore then refresh browse/menu. Activation in vscode-plugin/src/extension.ts wires those callbacks. Store naming/content and guards are covered in vscode-plugin/src/chat/__tests__/scratch-store.test.ts. Existing source-pinned tests must migrate with the protocol.

**State after:** Qualified hosts open the same file in the native Markdown editor; flag-off/absent hosts use explicit text fallback. One shared resolver supplies home-scoped identity and validated file paths. One asynchronous deletion flow owns local open/delete ordering and dirty/cancellation policy. Native save events replace document save messages for list refresh, and explicit selection Send to chat remains. No native release/build completion is allowed while B1 initial lock, B2 native save-boundary equivalence or B3 rendered selection evidence is missing. This design does not claim private host operations already exist.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Before implementation, resolve B1/B2/B3 by proving supported native APIs and live behaviors, or obtain explicit upstream approval for an alternative requirement/design. Record exact host versions and evidence. A toggle alone, raw URI preflight or successful mock cannot clear these blockers. — ↩ rollbackable
2. Add shared identity definitions and resolveScratch with canonical home scope and existing basename mapping. Do not rewrite files, enroll the home store, infer workspace association or implement s7 lifecycle persistence. — ↩ rollbackable
3. Introduce tested injected native operations and boundary error handling; replace both deletion routes with awaited dirty-aware deleteDocument, update every removed-method consumer, and preserve explicit selection-to-chat. Keep runtime behavior unchanged until the replacement is complete. — ↩ rollbackable
4. Add one scoped/disposable host save subscription and ScratchHost.refreshList; cover text fallback and native saves. Define insrc.scratchpad.nativeEditor default true and off -> plain text fallback. Add no no-op path and no revival of legacy viewer. — ↩ rollbackable _(needs: `insrc.scratchpad.nativeEditor`)_
5. In one atomic change, activate the qualified native/text opener and remove document renderer/bootstrap, protocol types/arrays, onDocMessage, save/dirty callbacks, replySaved/showingId/invalidateId and generation state. Update activation, chat host, browse callbacks and all fakes/tests together. Native editor owns document buffers; insrc still owns asynchronous action ordering. — ↩ rollbackable
6. Run targeted behavioral suites, plugin typecheck/build through the supported test harness, static retired-reference checks and the mandatory live acceptance matrix. Attach evidence and stop for human approval. If qualification fails, do not mark complete or ship a partial native guarantee. — ↩ rollbackable

**Backward compat:** Existing Markdown files and IDs remain unchanged and no data rewrite is needed. ScratchPanels/ScratchHost internal API changes are breaking and all call sites migrate atomically: openDocument resolves void, deleteDocument returns deleted/cancelled, invalidation/generation/save-reply/onDocMessage APIs disappear, and refreshList replaces save-channel list pushes. The six chat intents and explicit Send to chat semantics remain. Text fallback is available when native flag is off. Reverting the complete source change is possible because data format is unchanged; the old viewer must not remain reachable in the shipped replacement. S007 owns future persisted identity association and migration. Native I/O preservation is blocked until proved or upstream-amended, never described as unchanged merely because store tests pass.

## 10. Alternatives considered

### 10.1 a1: Extend existing injected panel dependencies with qualified native operations — **CHOSEN**

Keep the existing controller and store; inject native opening, targeted closing, selection transfer and save notifications.

Extend ScratchPanelsDeps rather than importing vscode into the controller. Share ScratchpadRef through a small identity module and expose deterministic validated resolution through ScratchStore. Extension activation supplies native operations, event subscriptions and a capability admission result. Native mode is not shippable until lock establishment, selection transfer and file/save guarantees are qualified against a concrete host; unsupported assumptions are explicit build blockers. Flag-off and genuinely absent-editor hosts use the documented text fallback. Existing deletion and Send to chat remain accessible.

### 10.2 a2: Dedicated native scratchpad controller with the same qualified boundary

Move document operations to a new controller while the existing controller owns only the browse panel.

Introduce a native-document controller injected into the scratch host and browse controller, consuming the same shared identity resolver. Activation owns subscriptions and host capability checks. This is the same native editor framework and unchanged acceptance requirements; lock, selection and save qualification remain mandatory. All routes delegate to one asynchronous delete/open flow.

**Rejected because:** No improvement to unknown ac1/k3 or partial ac3; adds another controller and routing. Both respect lc1 native-editor ownership and lc2 reuse of the initial extension probe, but neither is qualified until B1/B2/B3 clear.

## 11. References

- **[[c2]]** `code` `vscode-plugin/src/chat/scratch-store.ts` — "Flat ~/.insrc/scratches/*.md store, basename IDs, guarded read/write."
- **[[c3]]** `code` `vscode-plugin/src/panels/scratch-panels.ts` — "Custom webview document view (documentBodyHtml/documentBootstrap, scratch-save/scratch-saved); unbounded browse list (browseHtml/renderBrowse/openBrowse) with per-row open/delete icons."
- **[[c8]]** `stakeholder` `user (VS Code host inspection, 2026-11-15)` — "Confirmed on the user's VS Code install: code --list-extensions --show-versions lists markdown-language-features@10.0.0; its manifest registers customEditors vscode.markdown.preview.editor and vscode."
- **[[c12]]** `code` `vscode-plugin/src/hosts/specs.ts:23` — "env.getExtension(detection.extensionId) is an existing, reusable by-extension host-capability check (HostEnv.getExtension, vscode-plugin/src/hosts/types.ts:33; wired via vscode.extensions.getExtension"
- **[[c17]]** `code` `vscode-plugin/src/chat/scratch-host.ts` — "createScratchHost's onMessage is the primary driver of the functions this Story touches: case 'scratch-open' calls deps.panels.openDocument(msg.id) (line 150); case 'scratch-new' awaits deps.panels.op"
- **[[c30]]** `analyze-bundle` `S001 revision context.assemble; five deterministic probes and prior panel-profile pass` — "Existing ScratchStore and ScratchPanels located; no ScratchpadRef returned; graph incomplete and source reads supplement caller coverage."
- **[[c31]]** `code` `vscode-plugin/src/extension.ts:1023` — "Activation supplies store and document send/save/dirty callbacks to createScratchPanels."
- **[[c32]]** `doc` `docs/reqs/enhanced-scratchpad-prd.html#requirements` — "SP-5 retains existing Send to chat; SP-4 requires preserved committed data and drafts on failure/conflict."
- **[[c33]]** `code` `/usr/share/code/resources/app/extensions/markdown-language-features/dist/extension.js` — "Installed VS Code 1.146.0 initializes native readonly from markdown.editor.readonly global state; not a per-open locked guarantee."
- **[[c34]]** `code` `/usr/share/code/resources/app/extensions/markdown-language-features/package.json` — "Bundled version 10.0.0 registers vscode.markdown.editor and markdown.editor.toggleLocked; no live behavior qualification performed."
- **[[c35]]** `step-output` `design.story/s4-s8` — "Proposed contract and migration address eight review findings; B1/B2/B3 explicitly block native build admission. Local lc1/lc2 stay intact; adjacent work deferred."

## 12. Open questions

- BUILD BLOCKER B1 — The installed native editor remembers global lock state. Identify and prove a supported idempotent per-target lock setter/readback that satisfies ac1 after other tabs are unlocked and on editable reopens. No such API is verified. If unavailable, obtain an explicit upstream acceptance/design amendment; toggling blindly is forbidden.
- BUILD BLOCKER B2 — Opening a validated file URI does not retain guarded store I/O on later native reads/writes. Prove the approved failure/conflict/no-follow requirements through supported host behavior, or obtain an explicit upstream amendment defining the accepted native-file boundary. Unchanged file format is not unchanged write guarantees.
- BUILD BLOCKER B3 — Preserve direct selected-text Send to chat from the rendered editor through a supported host selection mechanism. No rendered selection API is verified. A manual Copy → explicit Insert clipboard action is a concrete alternative but requires explicit product acceptance; never substitute a stale TextEditor or the whole note.
- Native operations are typed application requirements, not invented VS Code APIs. Before plan/build, replace the capability evidence gaps with exact API/version/evidence or revise the upstream design with human approval. No live host behavior or visual rendering has been verified in this amendment.
- Scope decisions: all existing pre-s7 pads remain in the explicit home scope; s7 must persist association and migrate stable IDs before rename/move/archive. The current resolver is read-only and no s7 metadata persistence is implemented.
- Visual relevance: identity has only a one-reference-per-note value relationship with no DB/entity changes, so prose suffices without an ERD. Native layout is host-owned; no bespoke UX mock is proposed. The sequence companion documents asynchronous deletion ordering, not proof of live UI.

## Resolved questions

- `qb5f0cbbd` — BUILD BLOCKER B1 — The installed native editor remembers global lock state. Identify and prove a supported idempotent per-target lock setter/readback that satisfies ac1 after other tabs are unlocked and on editable reopens. No such API is verified. If unavailable, obtain an explicit upstream acceptance/design amendment; toggling blindly is forbidden.
  - **resolved**: Upstream acceptance / design amendment — honor the native editor's remembered mode — User explicitly accepted this change in chat: S001 opens scratchpads in vscode.markdown.editor using its remembered native reading/editing mode and retains native pencil/lock controls. Remove the forced-locked-on-every-open guarantee; no blind toggle, private state edits, or global setting mutations. This records the approved product decision; propagate it into the upstream acceptance/design artifacts and tests before build, rather than claiming a supported lock setter exists. B2 and B3 remain unresolved. _(2026-11-27T17:04:19.136Z)_
- `q2fedb6b0` — BUILD BLOCKER B2 — Opening a validated file URI does not retain guarded store I/O on later native reads/writes. Prove the approved failure/conflict/no-follow requirements through supported host behavior, or obtain an explicit upstream amendment defining the accepted native-file boundary. Unchanged file format is not unchanged write guarantees.
  - **resolved**: Accept normal VS Code native save/conflict behavior — User explicitly accepted normal VS Code behavior in chat. Native and fallback editors delegate subsequent file reads/saves, conflicts, undo and backups to VS Code. Insrc still validates basename/root/regular-file status and refuses symlinks at open; existing store-managed operations retain their guards. Do not claim ongoing O_NOFOLLOW or guarded-publication protection for native saves, or attempt an unenforceable pre-save shim. Propagate this accepted boundary into upstream requirements, LLD and acceptance tests before build. B3 remains unresolved. _(2026-11-27T17:08:25.137Z)_
- `q5ee29197` — BUILD BLOCKER B3 — Preserve direct selected-text Send to chat from the rendered editor through a supported host selection mechanism. No rendered selection API is verified. A manual Copy → explicit Insert clipboard action is a concrete alternative but requires explicit product acceptance; never substitute a stale TextEditor or the whole note.
  - **resolved**: Use Milkdown + Crepe in one insrc-owned CustomTextEditorProvider pane — User rejected manual clipboard and separate reader/editor views, asked about embeddable JS Markdown libraries, then checked Milkdown and said it looks good. Selected design direction is Milkdown + Crepe in one normal VS Code custom text-editor pane backed by the existing .md TextDocument. Insrc owns selection popup, explicit Send click and lock controls; selection alone never sends and clicking inserts into composer without submitting. This removes the built-in-editor selection-API dependency by an upstream design change, not by claiming such an API exists. Requires synchronized DEF/HLD/LLD amendments and human artifact approval before plan/build; no implementation approval or completed host/round-trip validation is implied. _(2026-11-27T18:05:22.936Z)_

## Citations

- **[[c2]]** `code` `vscode-plugin/src/chat/scratch-store.ts` — "Flat ~/.insrc/scratches/*.md store, basename IDs, guarded read/write."
- **[[c3]]** `code` `vscode-plugin/src/panels/scratch-panels.ts` — "Custom webview document view (documentBodyHtml/documentBootstrap, scratch-save/scratch-saved); unbounded browse list (browseHtml/renderBrowse/openBrowse) with per-row open/delete icons."
- **[[c8]]** `stakeholder` `user (VS Code host inspection, 2026-11-15)` — "Confirmed on the user's VS Code install: code --list-extensions --show-versions lists markdown-language-features@10.0.0; its manifest registers customEditors vscode.markdown.preview.editor and vscode."
- **[[c12]]** `code` `vscode-plugin/src/hosts/specs.ts:23` — "env.getExtension(detection.extensionId) is an existing, reusable by-extension host-capability check (HostEnv.getExtension, vscode-plugin/src/hosts/types.ts:33; wired via vscode.extensions.getExtension"
- **[[c17]]** `code` `vscode-plugin/src/chat/scratch-host.ts` — "createScratchHost's onMessage is the primary driver of the functions this Story touches: case 'scratch-open' calls deps.panels.openDocument(msg.id) (line 150); case 'scratch-new' awaits deps.panels.op"
- **[[c30]]** `analyze-bundle` `S001 revision context.assemble; five deterministic probes and prior panel-profile pass` — "Existing ScratchStore and ScratchPanels located; no ScratchpadRef returned; graph incomplete and source reads supplement caller coverage."
- **[[c31]]** `code` `vscode-plugin/src/extension.ts:1023` — "Activation supplies store and document send/save/dirty callbacks to createScratchPanels."
- **[[c32]]** `doc` `docs/reqs/enhanced-scratchpad-prd.html#requirements` — "SP-5 retains existing Send to chat; SP-4 requires preserved committed data and drafts on failure/conflict."
- **[[c33]]** `code` `/usr/share/code/resources/app/extensions/markdown-language-features/dist/extension.js` — "Installed VS Code 1.146.0 initializes native readonly from markdown.editor.readonly global state; not a per-open locked guarantee."
- **[[c34]]** `code` `/usr/share/code/resources/app/extensions/markdown-language-features/package.json` — "Bundled version 10.0.0 registers vscode.markdown.editor and markdown.editor.toggleLocked; no live behavior qualification performed."
- **[[c35]]** `step-output` `design.story/s4-s8` — "Proposed contract and migration address eight review findings; B1/B2/B3 explicitly block native build admission. Local lc1/lc2 stay intact; adjacent work deferred."
