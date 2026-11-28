<!-- insrc:artifact LLD-2846f076fd5f785f-s1 -->

# LLD: STORY-2846f076fd5f785f-s1 — Single-pane Milkdown Markdown editor

## Summary

**Epic:** `linked-scratchpads-vs-code`
**HLD base run:** `wf-1795803141296-eodyo2`
**HLD effective hash:** `6a3ff5cbf2ff...`
**Tracker:** [insors-ai/insrc#194](https://github.com/insors-ai/insrc/issues/194)

S001 keeps the existing single Milkdown pane and 1 MiB Markdown file contract, but removes full-document validation from typing. Edits render immediately and stage recoverable drafts; a 300 ms typing gap validates only the latest generation in background execution before native application. Explicit Save/Send and native lifecycle actions flush their captured generation, while stale work cannot overwrite newer typing.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [UX](#10-ux)
11. [References](#11-references)

## 1. HLD context

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

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ScratchpadRef`

```typescript
interface ScratchpadRef { readonly repo: string; readonly stableId: string; }
```

**Returns:** `ScratchpadRef` — Unchanged shared home/basename identity; no s7 metadata or workspace inference.

**Preconditions:**
- Existing guarded resolver validates the file and basename.

**Postconditions:**
- sc1 identity, ownership and consumers are unchanged.

### 2.2 `observeScratchMarkdown`

```typescript
observeScratchMarkdown(editor: Editor, source: () => ScratchSnapshot, onDraft: (draft: ScratchObservedDraft) => void, options: ScratchIdleValidationOptions): Promise<{ activate(): void; flush(reason: 'save' | 'send' | 'undo' | 'redo' | 'lock' | 'native-save'): Promise<{ draftSeq: number }>; deactivate(): void }>
```

**Parameters:**
- `editor: Editor` — Live configured Milkdown editor; native TextDocument remains canonical.
- `source: () => ScratchSnapshot` — Exact currently acknowledged source/version/digest.
- `onDraft: (draft: ScratchObservedDraft) => void` — Report completed validation/refusal only for its captured generation.
- `options: ScratchIdleValidationOptions` — Proposed injected stage/validator boundary and fixed 300 ms idle clock; private, not a user-facing configuration.

**Returns:** `ScratchIdleObserver` — Owned timer/job lifetime and captured-generation flush barrier.

**Errors:**
- `ValidationUnavailable` when Background executor fails, times out or cannot reproduce the configured codec; retain draft and refuse application.

**Preconditions:**
- Install before create, activate after initialization. Initial admission is separate from typing.
- Full parser/round-trip/inventory checks must never run in appendTransaction or input dispatch.

**Postconditions:**
- User doc-changing transactions capture the immutable intent, serialize at most once for immediate bounded recovery staging, and return without grammar validation. Initial/host/selection transactions do not stage or reset the timer.
- Each content edit resets a trailing-edge 300 ms timer; no max-wait validation runs during continuous typing. Only one job plus the latest queued generation is retained per executor.
- Idle validation is asynchronous and off the input thread. It uses the same factored configured schema/serializer, an intent fingerprint derived from the actual immutable ProseMirror document, and existing independent source-fidelity guards.
- A result is usable only for its exact pane session, worker epoch, draft sequence and base version/digest. Superseded results are ignored; the newest draft gets its own idle pass.
- Explicit flush cancels the timer and waits for validation plus canonical acknowledgement of the captured generation. Newer typing is retained and does not silently extend or replace that action's capture.
- Deactivation cancels timers/jobs and rejects pending flushes without deleting recovery or cancelling already accepted host work.

### 2.3 `ScratchRendererState`

```typescript
class ScratchRendererState { stage(markdown: string): number; authorize(draftSeq: number, baseVersion: number, baseDigest: string): void; refuse(draftSeq: number, reason: string): void; receive(message: unknown): ScratchViewUpdate; }
```

**Returns:** `ScratchRendererState` — Proposed split between local pending validation, authorization, canonical acknowledgement and true conflict.

**Errors:**
- `Conflict` when Unmatched source/session/base changes or failed current-generation fidelity proof.

**Preconditions:**
- Closed bounded protocol remains authoritative.
- Staging is distinct from refusal: apply:false must not itself freeze normal typing.

**Postconditions:**
- Stage immediately increments sequence and posts a recovery-only draft; receipt means recoverable, never validated/applied/saved.
- Only successful current-generation admission may authorize the same immutable draft identity for application.
- Older acknowledgements update the known base without replacing newer visible text. They never auto-promote an unvalidated latest draft.
- A base changed by a confirmed own parent requires fresh admission against the new exact base; unrelated changes freeze and retain the competing draft.
- Status distinguishes waiting for typing gap, validating, waiting for host, applied and conflict. Neither receipt nor apply-ack claims disk save.

### 2.4 `ScratchDocumentController`

```typescript
class ScratchDocumentController { receive(paneSessionId: string, draft: ScratchDraftProposal): Promise<void>; waitForSequence(paneSessionId: string, draftSeq: number): Promise<ScratchSnapshot>; flush(): Promise<void>; documentChanged(): void; dispose(): Promise<void>; }
```

**Returns:** `ScratchDocumentController` — Existing one-per-document native apply lane, with recoverable staging separated from validated application.

**Errors:**
- `StaleDraft` when Authorization no longer matches the latest accepted draft/base.
- `RecoveryFailure` when Durable staging failed; no receipt or canonical apply is allowed.

**Preconditions:**
- Retain all URI, session, sequence, duplicate, UTF-8 and encoded-byte checks.
- Recovery-only staging performs bounds/identity/storage checks, not full fidelity admission.

**Postconditions:**
- Persist recovery before receipt. Keep received-but-unapplied text through idle waits, worker failure, pane disposal and restart.
- Independently verify authorized source/draft in a background host executor, then recheck native version/digest immediately before minimal WorkspaceEdit.
- Reuse only fully verified immutable bases keyed by exact source/version/digest and executor/schema epoch. Parse a unique source once per job and share its semantic/inventory products; preserve every existing semantic/raw-syntax/intended-document assertion.
- Only one canonical apply runs per document. Already accepted applies may finish; stale validation cannot initiate a new apply.
- Clear recovery only after successful acknowledgement delivery to an attached pane; retain unconfirmed data otherwise.
- Pending state includes staged drafts awaiting authorization. Deletion cancels on that state rather than waiting indefinitely or authorizing it.

### 2.5 `registerScratchEditor`

```typescript
registerScratchEditor(deps: ScratchNativeDeps): { openDocument(id: string): Promise<void>; deleteDocument(id: string): Promise<'deleted' | 'cancelled'>; accepts(uri: VSCode.Uri): Promise<boolean>; dispose(): Promise<void>; }
```

**Parameters:**
- `deps: ScratchNativeDeps` — Existing injected public VS Code/store/recovery APIs plus owned background validator service.

**Returns:** `ScratchNativeEditor` — Unchanged external service and single-pane UX.

**Errors:**
- `FlushFailure` when Explicit action cannot confirm the captured current generation; preserve text and report failure.

**Preconditions:**
- Existing open readiness, explicit fallback, guarded assets/store and editor association rules remain unchanged.

**Postconditions:**
- Save, Send, Undo/Redo and locking explicitly flush the captured generation before their source-dependent action. Send never recaptures a different selection or submits.
- Native Save requests a bounded renderer flush; onWillSave remains best effort and can save an earlier canonical version with pending text recoverable, never falsely labelled saved.
- Dirty/pending/recovery deletion cancels; clean exact-URI closure/revalidation/unlink, failure reopening and shared independent refresh remain unchanged.
- All completed browse/create/error, lock, local asset/CSP, native undo and source-fidelity behaviors remain required; no legacy document channel returns.
- One document controller per URI per window owns canonical application. Pane owns timer/codec worker; native service owns host grammar executor. Each executor has at most one running job plus latest queued work, and cannot write files or invoke commands directly.

## 3. Data model changes

### 3.1 `ScratchRendererState` — invariant-change

Add explicit staged/waiting-idle/validating/authorized/applied/conflict distinctions. Pending admission is not a conflict. Track latest immutable intent and exact base, keep one apply in flight, never auto-authorize newer unvalidated typing.

**Call sites:**
- `vscode-plugin/src/panels/scratch-editor-webview.ts`
- `vscode-plugin/src/panels/__tests__/fixtures/scratch-editor-state-browser.ts`

### 3.2 `ScratchDraftProposal` — invariant-change

Existing bounded draft identity is staged with apply:false and later authorized for the same content/sequence. Durable receipt does not authorize native application. Atomically migrate all producer/parser/controller/test consumers; no permissive arbitrary-command fields.

**Call sites:**
- `vscode-plugin/src/panels/scratch-editor-state.ts`
- `vscode-plugin/src/panels/scratch-editor-provider.ts`
- `vscode-plugin/src/panels/scratch-editor-native.ts`

### 3.3 `IdleValidationJob` — new

Proposed private immutable job keyed by executor epoch, pane session, draftSeq, base version/digest and configured-codec identity, carrying bounded source references/draft and an actual-document intent fingerprint. Fingerprint semantics match the existing document comparator, including its sole heading-id exception. A parsed copy of the draft cannot serve as its own expected intent. A failed or superseded job never mutates the TextDocument.

**Call sites:**
- `vscode-plugin/src/panels/scratch-markdown-milkdown.ts`
- `vscode-plugin/src/panels/scratch-editor-webview.ts`

### 3.4 `Background validation lifetime` — new

New private executor modules are proposed, not current APIs. Keep 1 MiB text and 2 MiB ordinary message limits. Base transfer and candidate jobs use separate bounded messages; do not combine several full snapshots into an oversized message. Worker has no native file/chat/command access. Browser worker is a single local bundled script loaded from trusted fixed code via blob/data-compatible VS Code loading; document content is data only. Retain connect-src 'none', add only the required worker-src policy, terminate/revoke on disposal. Worker codec parity/CSP/native loading are an early qualification gate. Host grammar worker is extension-owned and independently verifies source admission.

**Call sites:**
- `vscode-plugin/src/panels/scratch-editor-native.ts`
- `vscode-plugin/src/panels/scratch-editor-webview.ts`

## 4. Diagrams

- [Sequence diagram](./sequence-diagram.html)
- [Component dependencies](./component-dependency.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Unchanged home scope and validated basename identity; no persisted s7 identity, repo inference, backlinks, ranking, search, attachments or other adjacent-story work. |

## 6. Error paths

**Error cases**

- **Validation fails, times out, or worker fails to initialize** (recoverable)
  - Detection: Executor error/timeout or configured-codec parity check fails.
  - Response: Do not authorize; retain durable draft, expose failure and explicit retry/fallback. Dispose failed executor and reject flush waiters.
  - User impact: Typing remains recoverable; canonical source unchanged.
- **New typing or source change supersedes a job** (recoverable)
  - Detection: Result session/epoch/sequence/base version/digest differs from current captured identity.
  - Response: Discard result; latest typing receives its own gap validation. Own-parent acknowledgement requires new exact-base admission; unrelated source change freezes with recovery.
  - User impact: No stale overwrite or automatic promotion.
- **Fidelity refusal** (recoverable)
  - Detection: Actual-document intent fingerprint, source syntax inventory or semantic round-trip comparison fails.
  - Response: Keep original and draft, show precise refusal; never weaken checks to pass performance.
  - User impact: Unsafe edit is recoverable rather than applied.
- **Recovery or native apply/ack fails** (recoverable)
  - Detection: Awaited durable write/applyEdit/ack delivery fails or pane detaches.
  - Response: No receipt before persistence; retain unconfirmed recovery, finish accepted work once, reject action barrier with actual status.
  - User impact: No false saved state or duplicate history.
- **Explicit action cannot flush** (recoverable)
  - Detection: Captured-generation barrier times out, refuses or is disposed.
  - Response: Pane Save/Send/Undo/Redo/lock reports failure without source-dependent action. Lock blocks input immediately while captured admission completes, commits lock only afterward; failure retains draft and visible state. Native save hook is bounded best effort and must avoid queue reentrancy/deadlock.
  - User impact: Selection is never replaced with later text; native save may contain earlier canonical source with pending recovery.
- **Invalid target, size, asset or delete** (recoverable)
  - Detection: Existing URI/session/bounds/asset checks reject or exact-URI dirty/pending/recovery inspection fails.
  - Response: Retain existing guarded refusal, explicit same-file fallback, failed-upload no-reference insertion, clean-close failure reopening and refresh behavior.
  - User impact: Original, drafts and unrelated tabs remain intact.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Continuous typing beyond several timer intervals | No full validation during typing; reset 300ms trailing timer; one active/latest queued bounded job, no repeated snapshots accumulating. |
| Typing resumes while a long validation runs | Rendering remains responsive; result stale and cannot apply; latest generation validates after its own gap. |
| Save/Send followed by newer typing | Capture exact action generation and selection; later typing remains visible/recoverable and cannot silently change the action. Explicit flush bypasses idle delay. |
| Selection-only, initialization or host echo | No draft, timer reset, validation or file write. |
| Close/reload/delete during pending admission | Disposal cancels timers/jobs/waiters; recovery persists and accepted apply finishes safely. Delete cancels when pending rather than authorizing or hanging. |
| Multiple panes, locked selection, Unicode and CRLF | Preserve existing per-pane selection/lock and host queue, UTF8 bounds, EOL fidelity and click-only bounded composer insertion. |

**Invariants to preserve**

- s1 analyze bundle Existing scratch editor pipeline and reuse plus measured-evidence bundle ground unchanged guarded .md home/basename identity and durable canonical TextDocument lifecycle; no open-time write. [[c2]]
- s1 source/usage bundle and completed t1–t14 evidence ground browse/new/delete, all six chat intents and refresh; no legacy channel returns. [[c3]]
- s1 measured-evidence and source bundle ground explicit bounded selected-text insertion with no submit, one pane, local CSP assets, fidelity and recovery. Performance remains unaccepted until original full-bound budgets pass. [[c17]]

## 7. Test strategy

**Test framework:** `Existing node:test/assert, browser production Milkdown fixtures and real VS Code native-host coordinator suites. Prior t1–t14 evidence exists; new idle/background behavior is proposed and has not yet passed validation.`

**Test levels**

- **unit** — Exercise host contract decisions and existing invariants.
  - Subjects: `Deterministic identity, URI/type/symlink refusal, note/image/message bounds and no-op-on-open guards.`, `One-in-flight/queued-descendant behavior, duplicate/stale/cross-pane messages, self echo versus external change and late acknowledgements.`, `Dirty/recovery/cancelled/failed deletion, created-but-open-failed reporting, save refresh/disposal and bounded composer insertion.`, `Deterministic fake clock: 300ms trailing gap, continuous typing no validation, explicit flush bypasses delay, stale epoch/sequence/base discarded, exact captured action sequence and cancellation; pending is not conflict and acknowledgement never auto-authorizes newer typing.`, `Independent host background admission retains every fidelity assertion; verified immutable-base cache invalidation and one running/latest queued bound; timeout/failure/reentrancy cannot hang Save/delete/disposal.`
  - Fixtures: `Existing fakeScratchFs/panel/chat seams extended with deterministic document queue and tab operations.`
- **integration** — Prove production wiring and actual library behavior together.
  - Subjects: `Published 7.23.0 local bundle under production CSP, setReadonly/mode preference and independent Send tooltip with keyboard focus preservation.`, `Remove Milkdown history provider/commands/keymap; bind host-targeted undo/redo, drain and broadcast without loops.`, `Parse/serialize/edit corpus: headings, tight/loose lists, tables, links/images, escaping, front matter, HTML/comments, Unicode, CRLF, fenced code/diagrams and literal custom links. Assert original unchanged on open and no unknown-content loss on supported edits.`, `Asset onUpload/proxyDomURL keeps portable relative source paths; failures never insert transient/broken URLs.`, `Static/typecheck migration: no legacy document protocol/method consumers; six chat intents remain.`, `Early gate: factor exactly the live configured schema/serializer into a pure worker-compatible module; prove production codec and actual-document fingerprint parity over the entire supported/refusal corpus. Worker loading under actual packaged CSP with connect-src none, no dynamic imports or document-controlled code.`, `Prove appendTransaction performs no full validation and at most one serialization; real browser typing resumes during a deliberately delayed validator without render blocking. Stage recovery immediately, apply only current admitted generation; stale results and old acknowledgements never replace latest text.`
  - Fixtures: `Pinned library package and a browser runner; exact real-note fixtures plus adversarial/unsupported syntax cases.`
- **live** — Required VS Code qualification; do not substitute fake evidence or mark skipped checks passed.
  - Subjects: `Real .md open/edit/save/dirty/undo/redo/revert, native autosave and external edits in same and second windows.`, `Close/reload while draft receipt/apply/ack is delayed; prove recovery without false saved state or draft loss.`, `Multiple groups/panes, remembered lock, locked selection, select->click Send with chat closed/ready/disposed, and no automatic submission.`, `Real image paste/drop, URL paste, workspace link/image insertion, CSP/offline operation and error paths.`, `Budget: 1 MiB UTF-8 note and boundaries; responsiveness target <=150 ms median keystroke-to-render and <=1 s p95 host acknowledgement on a recorded reference host, with a smaller supported bound or explicit design revision if unmet.`, `Repeat full 1MiB 20-trusted-edit qualification on recorded floor/current VS Code private display. Preserve <=150ms median keystroke-to-render and <=1s p95 host ack targets; ordinary latest-burst clock starts at final content edit and includes the 300ms idle delay. Explicit flush starts at action. Report superseded edits separately, no missing slow acknowledgements hidden.`, `Add sustained typing, bursts, resumed typing during long validation, Save/Send/Undo/Redo/lock/native autosave while pending and process interruption before idle/result/ack. Measure rendering, staging and job/application separately; immediate serialization or intent capture that still misses render budget blocks acceptance.`, `Re-run affected existing authoring/lifecycle/recovery/corpus/packaging mapping; no skip, reduced note bound or revised latency clock counts as success.`
  - Fixtures: `Real VS Code host at the supported engine floor and current 1.146.0 where available; capture versions and unavailable coverage honestly.`, `Disposable note/asset roots and second window; never destructive probes on user notes.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Browser/live: one Milkdown pane, rich authoring, TextDocument authority, version/recovery/undo/save/conflict matrix and note-size qualification.` |
| `ac2` | `Browser/live: remembered default initially locked, pencil/lock in the same pane, mutation disabled while locked and independent selection Send retained.` |
| `ac3` | `Migration/typecheck: retired textarea/save channel absent; store and existing .md format remain.`, `Corpus/browser/live: zero writes on open and refused unsafe serialization preserves original/draft.` |
| `ac4` | `Browser/live: non-empty selection reveals Send; mouse and keyboard click capture exact text, cap and insert once without submit; locked, stale, cross-pane and disposed-chat cases.` |

## 8. Migration

**State before:** s1 analyze bundle Existing scratch editor pipeline and reuse plus measured-evidence bundle: S001 t1–t14 built and validated, single Milkdown pane already replaces legacy textarea. Full validation runs synchronously inside appendTransaction and t15 failed at 4150.45ms median render /8240.20ms p95 ack for 1MiB. Existing LLD5/PLAN2 approved; BUILD draft with failed t15. This revision supersedes synchronous scheduling only, preserves completed functional scope.

**State after:** Immediate rendered/recovery-staged edits, 300ms trailing-gap background validation, independent background host admission and exact-generation action barriers; same canonical .md, one pane, original bounds/budgets and all completed behavior.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. After human approval revise PLAN, record outstanding t15 correction and preserve prior task evidence. Qualify shared configured codec/intent parity and real CSP-compatible bundled worker before replacing observation. — ↩ rollbackable
2. Split recovery staging/pending from admission/refusal; atomically update producer, closed parser, renderer state, controller and action consumers. Add bounded executors, exact-generation identities, verified-base caching and cancellation. — ↩ rollbackable
3. Replace synchronous observer validation with immediate bounded staging and 300ms idle dispatch; route explicit actions through captured-generation flush. Preserve native Save best effort, lock barrier, deletion cancellation and disposal recovery. — ↩ rollbackable
4. Validate focused deterministic/browser cases, full corpus and native lifecycle/authoring/recovery/CSP regressions, then full 1MiB performance including continuous/resumed typing. Failed or unavailable mandatory evidence blocks completion. Present BUILD only after gates pass. — ↩ rollbackable

**Backward compat:** No file rewrite, bound reduction or shared sc1/API/identity change. Existing documents/recovery retained. Private protocol participants migrate together with fresh pane session epochs so stale worker results cannot cross reload. Keep current richEditor setting and explicit same-file fallback; no legacy editor channel restoration. Rollback code cannot discard pending records or mislabel them saved.

## 9. Alternatives considered

### 9.1 a1: Idle timer on the renderer thread

Coalesce edits until a 300 ms gap, then perform the existing full validation on the renderer thread.

Keep the existing one-pane controller and add one trailing-edge timer. Lightweight draft capture runs per transaction; timer expiry runs current fidelity admission. Explicit commands flush. This is the smallest scheduling change, but the measured full pass still blocks resumed typing and cannot honestly meet the existing render target during validation.

**Rejected because:** Smallest code change, but fails the performance part of ac1.

### 9.2 a2: Idle-coalesced background admission — **CHOSEN**

Render and retain drafts immediately; validate only the latest idle generation in background execution before authorizing native application.

Reuse the existing draft/controller/recovery boundary, adding a non-conflicting pending-validation state and explicit generation-bound admission/flush. A 300 ms trailing-edge gap starts full fidelity verification outside the input thread; newer typing supersedes its result. Cache only fully verified immutable bases keyed by exact source/version/digest and codec version, and share a parse within a validation job without dropping checks. Background configured-codec validation must use the same factored schema/serializer as the live editor and pass the full corpus. Host admission remains independently verified and runs once per admitted generation. Preserve 1 MiB/2 MiB bounds, explicit native application, recovery receipts and source/session checks. Worker packaging and codec equivalence are qualification gates, not assumed existing capabilities.

### 9.3 a3: Validation only on explicit Save

Keep local editing fast and defer all validation until an explicit Save.

Retain local drafts and validate only on Save, with no idle canonical application. Keep existing source identity and UI. This removes per-keystroke validation but leaves native document synchronization and autosave dependent on an explicit action rather than the requested typing gap.

**Rejected because:** Weakens ac1 and complicates ac4 despite simple local typing.

## 10. UX

- [UX mock](./ux-mock.html)

## 11. References

- **[[c2]]** `code` `vscode-plugin/src/chat/scratch-store.ts` — "Flat ~/.insrc/scratches/*.md store, basename IDs, guarded read/write."
- **[[c3]]** `code` `vscode-plugin/src/panels/scratch-panels.ts` — "Historical legacy baseline; current browse preserved, document textarea/save removed by t11."
- **[[c17]]** `code` `vscode-plugin/src/chat/scratch-host.ts` — "Current host preserves six chat intents and bounded explicit composer insertion; native service handles .md open/delete."
- **[[c31]]** `code` `vscode-plugin/src/extension.ts` — "Activation registers native scratch editor and browse/chat integration."
- **[[c32]]** `doc` `docs/reqs/enhanced-scratchpad-prd.html#requirements` — "SP-5 retains existing Send to chat; SP-4 requires preserved committed data and drafts on failure/conflict."
- **[[c40]]** `stakeholder` `User chat — Milkdown direction selected, 2026-11-27` — "User rejected clipboard/two views, requested embeddable JS Markdown libraries, checked Milkdown and said it looks good. Normal VS Code save behavior accepted; Send requires a click and only inserts in"
- **[[c41]]** `doc` `https://milkdown.dev/docs/api/crepe` — "Crepe has a configurable floating selection toolbar; library controls and plugins are owned by the embedding application. Source confirms editable control and customizable tooltip; no integration/roun"
- **[[c42]]** `doc` `https://code.visualstudio.com/api/extension-guides/custom-editors` — "CustomTextEditorProvider renders an owned webview over a VS Code TextDocument; changes must synchronize to that document."
- **[[c50]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/DEF.md` — "Approved DEF7; S001 single-pane Milkdown editor, remembered lock, explicit Send click."
- **[[c51]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/HLD.md` — "Approved HLD5; shared sc1 ownership and sibling boundaries preserved."
- **[[c52]]** `doc` `/tmp/.insrc/scratchpad-s001-capability-check/milkdown-7.23.0/` — "Original package inspection; t1–t14 corpus/native evidence exists. Background worker parity remains proposed."
- **[[c53]]** `doc` `https://raw.githubusercontent.com/Milkdown/milkdown/main/packages/crepe/src/feature/toolbar/index.ts` — "Default formatting tooltip requires editable view; a separate owned selection Send tooltip is required."
- **[[c60]]** `stakeholder` `User chat — typing-gap correction, 2026-11-28` — "Full-document validation should follow a typing gap, not block each rendered edit."
- **[[c61]]** `analyze-bundle` `s1` — "Analyzer plus direct source inspection: synchronous appendTransaction admission blocks rendering; graph coverage incomplete."
- **[[c62]]** `doc` `https://code.visualstudio.com/api/extension-guides/webview#using-web-workers` — "Workers need blob/data loading and a single bundled script, without importScripts/dynamic import. Production qualification required."
- **[[c63]]** `doc` `/tmp/.insrc/scratchpad-t15-performance-full.json` — "20 edits,1MiB:4150.45ms median render,8240.20ms p95 ack; acceptance fails."
- **[[c64]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/BUILD.md` — "t1–t14 validated, t15 failed; no completed BUILD acceptance."

## Citations

- **[[c2]]** `code` `vscode-plugin/src/chat/scratch-store.ts` — "Flat ~/.insrc/scratches/*.md store, basename IDs, guarded read/write."
- **[[c3]]** `code` `vscode-plugin/src/panels/scratch-panels.ts` — "Historical legacy baseline; current browse preserved, document textarea/save removed by t11."
- **[[c17]]** `code` `vscode-plugin/src/chat/scratch-host.ts` — "Current host preserves six chat intents and bounded explicit composer insertion; native service handles .md open/delete."
- **[[c31]]** `code` `vscode-plugin/src/extension.ts` — "Activation registers native scratch editor and browse/chat integration."
- **[[c32]]** `doc` `docs/reqs/enhanced-scratchpad-prd.html#requirements` — "SP-5 retains existing Send to chat; SP-4 requires preserved committed data and drafts on failure/conflict."
- **[[c40]]** `stakeholder` `User chat — Milkdown direction selected, 2026-11-27` — "User rejected clipboard/two views, requested embeddable JS Markdown libraries, checked Milkdown and said it looks good. Normal VS Code save behavior accepted; Send requires a click and only inserts in"
- **[[c41]]** `doc` `https://milkdown.dev/docs/api/crepe` — "Crepe has a configurable floating selection toolbar; library controls and plugins are owned by the embedding application. Source confirms editable control and customizable tooltip; no integration/roun"
- **[[c42]]** `doc` `https://code.visualstudio.com/api/extension-guides/custom-editors` — "CustomTextEditorProvider renders an owned webview over a VS Code TextDocument; changes must synchronize to that document."
- **[[c50]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/DEF.md` — "Approved DEF7; S001 single-pane Milkdown editor, remembered lock, explicit Send click."
- **[[c51]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/HLD.md` — "Approved HLD5; shared sc1 ownership and sibling boundaries preserved."
- **[[c52]]** `doc` `/tmp/.insrc/scratchpad-s001-capability-check/milkdown-7.23.0/` — "Original package inspection; t1–t14 corpus/native evidence exists. Background worker parity remains proposed."
- **[[c53]]** `doc` `https://raw.githubusercontent.com/Milkdown/milkdown/main/packages/crepe/src/feature/toolbar/index.ts` — "Default formatting tooltip requires editable view; a separate owned selection Send tooltip is required."
- **[[c60]]** `stakeholder` `User chat — typing-gap correction, 2026-11-28` — "Full-document validation should follow a typing gap, not block each rendered edit."
- **[[c61]]** `analyze-bundle` `s1` — "Analyzer plus direct source inspection: synchronous appendTransaction admission blocks rendering; graph coverage incomplete."
- **[[c62]]** `doc` `https://code.visualstudio.com/api/extension-guides/webview#using-web-workers` — "Workers need blob/data loading and a single bundled script, without importScripts/dynamic import. Production qualification required."
- **[[c63]]** `doc` `/tmp/.insrc/scratchpad-t15-performance-full.json` — "20 edits,1MiB:4150.45ms median render,8240.20ms p95 ack; acceptance fails."
- **[[c64]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/BUILD.md` — "t1–t14 validated, t15 failed; no completed BUILD acceptance."
