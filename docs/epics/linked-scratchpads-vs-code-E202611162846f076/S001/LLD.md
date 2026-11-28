<!-- insrc:artifact LLD-2846f076fd5f785f-s1 -->

# LLD: STORY-2846f076fd5f785f-s1 — Single-pane Milkdown Markdown editor

## Summary

**Epic:** `linked-scratchpads-vs-code`
**HLD base run:** `wf-1795803141296-eodyo2`
**HLD effective hash:** `6a3ff5cbf2ff...`
**Tracker:** [insors-ai/insrc#194](https://github.com/insors-ai/insrc/issues/194)

S001 now renders a full 1MiB note in75-79ms on both native reference hosts, but its serial fidelity path still misses the1s acknowledgement target. This revision overlaps independent read-only checks after the unchanged300ms gap and adopts only fully checked immutable candidate proofs on exact canonical confirmation. Native application still requires current configured-codec authorization, independent host success and a final native version/digest match; all prior one-pane, recovery and action behavior remains. Performance is unqualified until the original native gate passes.

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

**Does not apply**: First Story; no other approved BUILD to analyse.

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

### 3.1 `ScratchpadRef`

```typescript
interface ScratchpadRef { readonly repo: string; readonly stableId: string; }
```

**Returns:** `ScratchpadRef` — Unchanged shared home/basename identity; no s7 metadata or workspace inference.

**Preconditions:**
- Existing guarded resolver validates the file and basename.

**Postconditions:**
- sc1 identity, ownership and consumers are unchanged.

### 3.2 `observeScratchMarkdown`

```typescript
observeScratchMarkdown(editor: Editor, options: ScratchObservationOptions & { prepare(sequence: number, base: ScratchSnapshot): void }, onDraft: (draft: ScratchObservedDraft) => void): Promise<{ activate(): void; deactivate(): void; refresh(): void; expedite(sequence: number): boolean }>
```

**Parameters:**
- `editor: Editor` — Existing live Milkdown editor.
- `options: ScratchObservationOptions & { prepare(sequence: number, base: ScratchSnapshot): void }` — Existing source/stage/eligible/validator/failed callbacks plus required proposed prepare callback at the same exact idle/expedite dispatch. It posts identity-only host validation intent for that staged sequence/base; no host apply authority.
- `onDraft: (draft: ScratchObservedDraft) => void` — Existing configured proposal/refusal result callback, still current-generation gated.

**Returns:** `Promise<{ activate(): void; deactivate(): void; refresh(): void; expedite(sequence: number): boolean }>` — Keep implemented observer lifecycle and exact-sequence expedite. Existing ScratchActionFlush/pane owns capture and waits for canonical acknowledgement; observer does not add a second flush owner.

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
- After the same trailing gap, start configured validation and send one closed validate-draft intent for the already-staged exact generation; explicit captured actions expedite both checks. No validation is performed during continuous normal typing.
- The identity-only validate-draft message names paneSessionId,draftSeq,editId,baseVersion,baseDigest; the host resolves the immutable staged bytes rather than trusting a second payload. It confers no apply authority.

### 3.3 `ScratchRendererState`

```typescript
class ScratchRendererState { stage(markdown: string): number; authorize(draftSeq: number, baseVersion: number, baseDigest: string): boolean; refuse(draftSeq: number, reason: string): void; receive(message: unknown): ScratchViewUpdate; }
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

### 3.4 `ScratchDocumentController`

```typescript
class ScratchDocumentController { receive(paneSessionId: string, draft: ScratchDraftProposal): Promise<void>; validate(paneSessionId: string, draftSeq: number, editId: string, baseVersion: number, baseDigest: string): Promise<void>; waitForSequence(paneSessionId: string, draftSeq: number): Promise<ScratchSnapshot>; flush(): Promise<void>; documentChanged(): void; dispose(): Promise<void>; }
```

**Returns:** `ScratchDocumentController` — Existing one-per-document native apply lane, with recoverable staging separated from validated application.

**Errors:**
- `StaleDraft` when Authorization no longer matches the latest accepted draft/base.
- `RecoveryFailure` when Durable staging failed; no receipt or canonical apply is allowed.

**Preconditions:**
- Retain all URI, session, sequence, duplicate, UTF-8 and encoded-byte checks.
- Recovery-only staging performs bounds/identity/storage checks, not full fidelity admission.
- A validate intent matches the newest durably staged draft in this live pane, including exact editId/sequence/base; the native source/version/digest still matches. Reject absent, mismatched, superseded, cross-pane or disposed identities.

**Postconditions:**
- Persist recovery before receipt. Keep received-but-unapplied text through idle waits, worker failure, pane disposal and restart.
- Independently verify authorized source/draft in a background host executor, then recheck native version/digest immediately before minimal WorkspaceEdit.
- Reuse only fully verified immutable bases keyed by exact source/version/digest and executor/schema epoch. Parse a unique source once per job and share its semantic/inventory products; preserve every existing semantic/raw-syntax/intended-document assertion.
- Only one canonical apply runs per document. Already accepted applies may finish; stale validation cannot initiate a new apply.
- Clear recovery only after successful acknowledgement delivery to an attached pane; retain unconfirmed data otherwise.
- Pending state includes staged drafts awaiting authorization. Deletion cancels on that state rather than waiting indefinitely or authorizing it.
- validate is read-only proof preparation, outside the canonical apply lane. Keep at most one active/latest queued host job per document and one prepared exact-generation result; do not block staging behind full verification.
- apply:true from the current configured-success generation joins the exact independent host result. If missing, start/join that same bounded read-only check; never bypass it or accept a renderer proof as a host proof. Only both successes plus unchanged native source immediately before WorkspaceEdit permit apply.
- A newer stage invalidates any not-yet-accepted older prepared apply/result, including a running result. One native apply already accepted may finish under existing semantics; never overwrite newer renderer text or auto-authorize its descendant.

### 3.5 `registerScratchEditor`

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

### 3.6 `ScratchMarkdownVerifier`

```typescript
class ScratchMarkdownVerifier<Document> { invalidate(): void; job(source: string, key: string): { readonly validation: ScratchMarkdownValidationJob<Document>; retainBase(): void }; }
```

**Returns:** `Executor-local validation/proof state` — Preserve current parser/check implementation; add private fully checked candidate adoption machinery without exporting AST or application authority.

**Errors:**
- `ProofMismatch` when Candidate bytes, native canonical version/digest, codec version, executor epoch or current invalidation token do not match.

**Preconditions:**
- An allowed job completed every existing independent source, candidate, serialization, semantics, raw fingerprints, protected spans, EOL and intent check required by its executor.
- The candidate proof is immutable source/inventory only, not parser AST, renderer document or raw allowed boolean.

**Postconditions:**
- Retain at most one current immutable base proof plus one bounded candidate handoff record associated with the active/latest generation. Canonical confirmation atomically replaces the old base with that exact candidate under the actual observed new version:digest and exact bytes.
- Each executor adopts only its own completed fully checked candidate. Adoption is an optimization of source rechecking, never authorization to apply or skip fresh candidate/intent/unchanged-span checks.
- Reconcile matching own canonical changes with a successful candidate before unconditional invalidation. Unrelated bytes/version change, missing/timed-out/failed proof, epoch or codec replacement, conflict, reload/disposal invalidates the handoff and falls back to full source verification. A changed version/digest alone cannot transplant a proof; exact canonical bytes and identity confirmation are required.
- An invalidation revision blocks active jobs from repopulating a cleared cache; no stale completed result may adopt later.

## 4. Data model changes

### 4.1 `ScratchRendererState` — invariant-change

Add explicit staged/waiting-idle/validating/authorized/applied/conflict distinctions. Pending admission is not a conflict. Track latest immutable intent and exact base, keep one apply in flight, never auto-authorize newer unvalidated typing.

**Call sites:**
- `vscode-plugin/src/panels/scratch-editor-webview.ts`
- `vscode-plugin/src/panels/__tests__/fixtures/scratch-editor-state-browser.ts`

### 4.2 `ScratchDraftProposal` — invariant-change

Existing bounded draft identity is staged with apply:false and later authorized for the same content/sequence. Durable receipt does not authorize native application. Atomically migrate all producer/parser/controller/test consumers; no permissive arbitrary-command fields.

**Call sites:**
- `vscode-plugin/src/panels/scratch-editor-state.ts`
- `vscode-plugin/src/panels/scratch-editor-provider.ts`
- `vscode-plugin/src/panels/scratch-editor-native.ts`

### 4.3 `IdleValidationJob` — new

Proposed private immutable job keyed by executor epoch, pane session, draftSeq, base version/digest and configured-codec identity, carrying bounded source references/draft and an actual-document intent fingerprint. Fingerprint semantics match the existing document comparator, including its sole heading-id exception. A parsed copy of the draft cannot serve as its own expected intent. A failed or superseded job never mutates the TextDocument.

**Call sites:**
- `vscode-plugin/src/panels/scratch-markdown-milkdown.ts`
- `vscode-plugin/src/panels/scratch-editor-webview.ts`

### 4.4 `Background validation lifetime` — new

New private executor modules are proposed, not current APIs. Keep 1 MiB text and 2 MiB ordinary message limits. Base transfer and candidate jobs use separate bounded messages; do not combine several full snapshots into an oversized message. Worker has no native file/chat/command access. Browser worker is a single local bundled script loaded from trusted fixed code via blob/data-compatible VS Code loading; document content is data only. Retain connect-src 'none', add only the required worker-src policy, terminate/revoke on disposal. Worker codec parity/CSP/native loading are an early qualification gate. Host grammar worker is extension-owned and independently verifies source admission.

**Call sites:**
- `vscode-plugin/src/panels/scratch-editor-native.ts`
- `vscode-plugin/src/panels/scratch-editor-webview.ts`

### 4.5 `ScratchDraftProposal` — invariant-change

Closed identity-only validate-draft intent references one already staged immutable recovery draft. One pane owns many successive generations; document controller owns one active/latest host job and at most one prepared current proof. Configured and host checks run concurrently after the same gap, join by exact pane/epoch/sequence/edit/base identity, and neither receipt nor prepared host proof authorizes native mutation. No persistent DB/entity relationship or sc1 change.

**Call sites:**
- `vscode-plugin/src/panels/scratch-editor-provider.ts`
- `vscode-plugin/src/panels/scratch-editor-native.ts`
- `vscode-plugin/src/panels/scratch-editor-webview.ts`

### 4.6 `ScratchMarkdownVerifier` — invariant-change

Executor owns one current verified immutable base and at most one fully checked candidate handoff; no AST. Only exact canonical bytes and actual version/digest confirmation in the same codec/epoch adopts the candidate as next base. Replacement is atomic; unrelated change clears it. Worker proof ownership never crosses executors.

**Call sites:**
- `vscode-plugin/src/panels/scratch-markdown.ts`
- `vscode-plugin/src/panels/scratch-validation-engine.ts`

## 5. Diagrams

- [Sequence diagram](./sequence-diagram.html)
- [Component dependencies](./component-dependency.html)

## 6. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Unchanged home scope and validated basename identity; no persisted s7 identity, repo inference, backlinks, ranking, search, attachments or other adjacent-story work. |

## 7. Error paths

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
- **Validation intent has no durably staged matching draft** (recoverable)
  - Detection: Closed identity validation cannot find the same live pane/sequence/edit/base bytes, or persistence is not complete.
  - Response: Keep at most one pending latest intent awaiting its matching durable stage; reject mismatch/supersession. Never validate arbitrary unstaged bytes or create native permission.
  - User impact: Draft remains recoverable; action waits boundedly or reports failure.
- **One concurrent executor refuses, fails or returns an obsolete identity** (recoverable)
  - Detection: Exact generation/base/epoch/codec comparison fails or either result is refused/error/timeout.
  - Response: Do not apply. Ignore stale outcomes without freezing newer input; a current refusal/failure retains the visible and durable draft and fails captured actions explicitly. Cancel or retire the obsolete peer work without adding an unbounded queue.
  - User impact: Typing continues; canonical document is not overwritten.
- **Canonical confirmation does not match a fully checked candidate** (recoverable)
  - Detection: Exact candidate bytes and accepted generation provenance fail to match the actual observed native source/version/digest, or invalidation revision/worker epoch changed.
  - Response: Invalidate candidate/base reuse and run complete source verification. Never infer apply authority from a matching digest or prepared proof alone. Own document-state arriving before apply-ack may hold a bounded untrusted handoff, but may adopt only after exact accepted-identity canonical confirmation; an unrelated change clears it.
  - User impact: Possible slower next validation, no fidelity loss or unsafe application.
- **Revised architecture still exceeds original full-bound latency target** (recoverable)
  - Detection: All ordinary native samples and latest burst/resumed acknowledgements are timed on the original clocks; original150msmedian/1000msp95 gates fail on either required host.
  - Response: Keep t15 and BUILD failed, preserve every sample/failure and seek another tracked design decision. Do not reduce bounds, omit slow edits, reinterpret receipt as ack or weaken checks.
  - User impact: No false completed-build claim.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Continuous typing beyond several timer intervals | No full validation during typing; reset 300ms trailing timer; one active/latest queued bounded job, no repeated snapshots accumulating. |
| Typing resumes while a long validation runs | Rendering remains responsive; result stale and cannot apply; latest generation validates after its own gap. |
| Save/Send followed by newer typing | Capture exact action generation and selection; later typing remains visible/recoverable and cannot silently change the action. Explicit flush bypasses idle delay. |
| Selection-only, initialization or host echo | No draft, timer reset, validation or file write. |
| Close/reload/delete during pending admission | Disposal cancels timers/jobs/waiters; recovery persists and accepted apply finishes safely. Delete cancels when pending rather than authorizing or hanging. |
| Multiple panes, locked selection, Unicode and CRLF | Preserve existing per-pane selection/lock and host queue, UTF8 bounds, EOL fidelity and click-only bounded composer insertion. |
| Prepared host success arrives before renderer authorization, or authorization arrives before host success | Join only the same current staged generation/base; either arrival alone is read-only. Joining cannot stall durable staging or unrelated panes. |
| Already accepted canonical apply finishes while newer typing is staged | Keep existing accepted-apply semantics; acknowledgement updates base but never replaces newer visible text or authorizes it. Adopt an exact successful accepted candidate only under that canonical identity; freshly validate newer typing against the new base. |
| Newer stage arrives during configured or host work; many panes request verification | No max-wait during continuous typing. Each executor remains one active/latest queued job; global document host queue coalesces fairly without per-pane unbounded workers. Superseded waiters settle explicitly and cannot reopen native apply. |
| Save/Send/Undo/Redo/lock or native autosave captures pending work | Expedite both exact captured checks; all existing current-only action failure, one-second best-effort native Save, lock-confirmation and preference rollback semantics remain. Do not silently recapture later typing. |

**Invariants to preserve**

- s1 analyze bundle Existing scratch editor pipeline and reuse plus measured-evidence bundle ground unchanged guarded .md home/basename identity and durable canonical TextDocument lifecycle; no open-time write. [[c2]]
- s1 source/usage bundle and completed t1–t14 evidence ground browse/new/delete, all six chat intents and refresh; no legacy channel returns. [[c3]]
- s1 measured-evidence and source bundle ground explicit bounded selected-text insertion with no submit, one pane, local CSP assets, fidelity and recovery. Performance remains unaccepted until original full-bound budgets pass. [[c17]]

## 8. Test strategy

**Test framework:** `Existing node:test/assert, actual packaged Milkdown/Blob workers, independent Node host worker, and private-display real VSCode native coordinator suites. t16-t21 are passed history; QUALIFICATION.json records current render pass and canonical-ack failure. This proposed concurrent/proof-adoption revision has no implementation or performance qualification yet.`

**Test levels**

- **unit** — Exercise host contract decisions and existing invariants.
  - Subjects: `Deterministic identity, URI/type/symlink refusal, note/image/message bounds and no-op-on-open guards.`, `One-in-flight/queued-descendant behavior, duplicate/stale/cross-pane messages, self echo versus external change and late acknowledgements.`, `Dirty/recovery/cancelled/failed deletion, created-but-open-failed reporting, save refresh/disposal and bounded composer insertion.`, `Deterministic fake clock: 300ms trailing gap, continuous typing no validation, explicit flush bypasses delay, stale epoch/sequence/base discarded, exact captured action sequence and cancellation; pending is not conflict and acknowledgement never auto-authorizes newer typing.`, `Independent host background admission retains every fidelity assertion; verified immutable-base cache invalidation and one running/latest queued bound; timeout/failure/reentrancy cannot hang Save/delete/disposal.`, `Concurrent join permutations: host-before-configured, configured-before-host, stage durability pending, missing intent/proof, stale/cross-pane/session/epoch/seq/edit/base results, rejected peer, timeout/disposal, newer typing and native source changes. Assert no native application until both exact proofs and current authorization.`, `Verified candidate adoption hits on exact canonical confirmation and misses on byte/version/digest/codec/epoch mismatch, stale invalidation token, unrelated source, refused check, forged proof or replay. Assert all previous semantic/raw/EOL/intent checks remain; only executor-local deeply immutable source/inventory persists.`, `Document-state before apply-ack, accepted older apply with newer staged input, cancellation while joining, explicit action flush and source conflicts preserve current-only application and one active/latest queued memory bound.`
  - Fixtures: `Existing fakeScratchFs/panel/chat seams extended with deterministic document queue and tab operations.`
- **integration** — Prove production wiring and actual library behavior together.
  - Subjects: `Published 7.23.0 local bundle under production CSP, setReadonly/mode preference and independent Send tooltip with keyboard focus preservation.`, `Remove Milkdown history provider/commands/keymap; bind host-targeted undo/redo, drain and broadcast without loops.`, `Parse/serialize/edit corpus: headings, tight/loose lists, tables, links/images, escaping, front matter, HTML/comments, Unicode, CRLF, fenced code/diagrams and literal custom links. Assert original unchanged on open and no unknown-content loss on supported edits.`, `Asset onUpload/proxyDomURL keeps portable relative source paths; failures never insert transient/broken URLs.`, `Static/typecheck migration: no legacy document protocol/method consumers; six chat intents remain.`, `Early gate: factor exactly the live configured schema/serializer into a pure worker-compatible module; prove production codec and actual-document fingerprint parity over the entire supported/refusal corpus. Worker loading under actual packaged CSP with connect-src none, no dynamic imports or document-controlled code.`, `Prove appendTransaction performs no full validation and at most one serialization; real browser typing resumes during a deliberately delayed validator without render blocking. Stage recovery immediately, apply only current admitted generation; stale results and old acknowledgements never replace latest text.`, `Real configured and host workers execute concurrently after the same gap (controlled independent barriers, not merely mocked resolved promises); no full validation during continuous input and no result alone mutates canonical text. Parse/cache counters prove fully checked candidate adoption avoids source rechecks without skipping fresh candidate, intent or unchanged-span checks.`, `Direct tracked QUALIFICATION.json completeness test accounts for all tasks/ac1-ac4, every native sample and superseded edit, versions/bounds/clocks and failed budget honesty. Historical t15 failures remain alongside refreshed task mappings.`
  - Fixtures: `Pinned library package and a browser runner; exact real-note fixtures plus adversarial/unsupported syntax cases.`
- **live** — Required VS Code qualification; do not substitute fake evidence or mark skipped checks passed.
  - Subjects: `Real .md open/edit/save/dirty/undo/redo/revert, native autosave and external edits in same and second windows.`, `Close/reload while draft receipt/apply/ack is delayed; prove recovery without false saved state or draft loss.`, `Multiple groups/panes, remembered lock, locked selection, select->click Send with chat closed/ready/disposed, and no automatic submission.`, `Real image paste/drop, URL paste, workspace link/image insertion, CSP/offline operation and error paths.`, `Budget: 1 MiB UTF-8 note and boundaries; responsiveness target <=150 ms median keystroke-to-render and <=1 s p95 host acknowledgement on a recorded reference host, with a smaller supported bound or explicit design revision if unmet.`, `Repeat full 1MiB 20-trusted-edit qualification on recorded floor/current VS Code private display. Preserve <=150ms median keystroke-to-render and <=1s p95 host ack targets; ordinary latest-burst clock starts at final content edit and includes the 300ms idle delay. Explicit flush starts at action. Report superseded edits separately, no missing slow acknowledgements hidden.`, `Add sustained typing, bursts, resumed typing during long validation, Save/Send/Undo/Redo/lock/native autosave while pending and process interruption before idle/result/ack. Measure rendering, staging and job/application separately; immediate serialization or intent capture that still misses render budget blocks acceptance.`, `Re-run affected existing authoring/lifecycle/recovery/corpus/packaging mapping; no skip, reduced note bound or revised latency clock counts as success.`, `Re-run original 1MiB 20 ordinary trusted edits plus12sustained/5burst/2resumed/1explicitSave on each supported-floor/current native host. Preserve <=150msmedian render and <=1sp95canonical ack including300msgap; latest burst/resumed results also meet1s. Include cold first job and all slow/missing results, report superseded edits without claiming their missing ack is success.`, `Repeat all t21 native save/undo/revert/autosave, rich authoring/explicitSend, lock/preference failure, multipane/cross-window and six process-interruption phases after scheduling/proof changes. Missing/skipped required evidence blocks BUILD.`
  - Fixtures: `Real VS Code host at the supported engine floor and current 1.146.0 where available; capture versions and unavailable coverage honestly.`, `Disposable note/asset roots and second window; never destructive probes on user notes.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Browser/live: one Milkdown pane, rich authoring, TextDocument authority, version/recovery/undo/save/conflict matrix and note-size qualification.` |
| `ac2` | `Browser/live: remembered default initially locked, pencil/lock in the same pane, mutation disabled while locked and independent selection Send retained.` |
| `ac3` | `Migration/typecheck: retired textarea/save channel absent; store and existing .md format remain.`, `Corpus/browser/live: zero writes on open and refused unsafe serialization preserves original/draft.` |
| `ac4` | `Browser/live: non-empty selection reveals Send; mouse and keyboard click capture exact text, cap and insert once without submit; locked, stale, cross-pane and disposed-chat cases.` |

## 9. Migration

**State before:** s1 context bundles Native qualification reuse and Current validation/native canonical boundaries, plus committed QUALIFICATION.json, show implemented and passed t16-t21, retained single pane/current-only durable staging, and full-bound render75-79ms versus failed canonical p95ack2.43-2.52s. Existing serial checks and own-revision cache invalidation remain in production; this revision is proposed only.

**State after:** Same one-pane .md/native lifecycle and all original bounds/checks; bounded configured and host checks overlap after the same gap, with exact canonical adoption of executor-local fully checked candidate source proofs. Native mutation still joins both current successes and exact native guards. Completion remains conditional on unchanged native latency and regression gates.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. After fresh human LLD approval, revise PLAN with tracked proof-adoption and concurrent-join tasks plus requalification dependencies; preserve t1-t21 history and failed t15. No implementation starts under the old plan. — ↩ rollbackable
2. Implement and qualify executor-local immutable candidate handoff/adoption with exact canonical confirmation and invalidation. Keep complete source verification as fallback and prove every original fidelity assertion remains. — ↩ rollbackable
3. Implement closed exact-stage validation-intent and concurrent independent host preparation/join without putting staging behind validation or granting apply authority. Update both bridge consumers atomically in the same extension package; qualify races and captured actions. — ↩ rollbackable
4. Requalify packaged CSP/corpus, affected task mappings and floor/current native lifecycle/authoring/interruption; then rerun original full-bound latency. BUILD stays failed on any required skip/missing/failure. Preserve prior measurements. — ↩ rollbackable

**Backward compat:** sc1 and all daemon/public IPC contracts are unchanged; canonical .md files and apply:false recovery records remain readable. Private bridge/worker protocol changes ship atomically with host and renderer; reject unknown or mismatched protocol/epoch rather than allowing an old pane to bypass checks. Reloading falls back to full verification; no recovery record implicitly resumes or authorizes validation/application.

## 10. Alternatives considered

### 10.1 a1: Preserve serial validation and adopt exact verified candidates

Reuse successful candidate source proofs after canonical confirmation, keeping serial verification.

Extend existing immutable verifier cache lifetime across an exact own canonical acknowledgement. Reuse only fully checked candidate inventory at matching canonical bytes/version/digest in the same codec epoch; retain independent host checks and the existing serialized configured-then-host contract.

**Rejected because:** Small cache-only change does not remove serial warm checks.

### 10.2 a2: Concurrent independent validation with exact canonical proof adoption — **CHOSEN**

Start both bounded read-only checks after the gap and join their exact-current results before native application.

Reuse the existing pane scheduler, two independent executors, durable staging and canonical controller. Add a closed bounded validation-intent operation for an already staged exact generation; it can compute host proof but never authorizes apply. Only current apply:true authorization plus successful exact-base host proof permits canonical mutation. Each executor may adopt its own fully checked immutable candidate inventory as next-base proof only upon exact canonical bytes/version/digest confirmation; no cross-executor proof, mutable AST, renderer assertion or receipt becomes native authority.

### 10.3 a3: Concurrent checks without next-base reuse

Overlap independent passes while invalidating every proof on each canonical revision.

Add the same bounded read-only validation-intent/join while retaining unconditional cache invalidation after own canonical changes. Keep all source checks cold for each edit and require both exact successful checks before application.

**Rejected because:** Cold configured check alone exceeds the target before host latency.

## 11. UX

- [UX mock](./ux-mock.html)

## 12. References

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
- **[[c65]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/QUALIFICATION.json` — "40 native samples each on1.141.0/1.146.0; render78.7/75.3ms passes, canonical p95ack2516.5/2429.8ms fails. t16-t21 passed; no completed BUILD."
- **[[c66]]** `step-output` `s4 contract.detail; s5 error.paths; s6 test.strategy` — "Proposed bounded concurrent independent checks, exact-current join and executor-local canonical candidate proof adoption; unchanged checks/bounds/clocks; unqualified until original native gate passes."
- **[[c67]]** `code` `vscode-plugin/src/panels/scratch-markdown.ts` — "Current job checks source and candidate; verified(source) returns frozen source/inventory only. Proposed adoption must reuse only that complete executor-local proof, never AST or native authority."

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
- **[[c65]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/QUALIFICATION.json` — "40 native samples each on1.141.0/1.146.0; render78.7/75.3ms passes, canonical p95ack2516.5/2429.8ms fails. t16-t21 passed; no completed BUILD."
- **[[c66]]** `step-output` `s4 contract.detail; s5 error.paths; s6 test.strategy` — "Proposed bounded concurrent independent checks, exact-current join and executor-local canonical candidate proof adoption; unchanged checks/bounds/clocks; unqualified until original native gate passes."
- **[[c67]]** `code` `vscode-plugin/src/panels/scratch-markdown.ts` — "Current job checks source and candidate; verified(source) returns frozen source/inventory only. Proposed adoption must reuse only that complete executor-local proof, never AST or native authority."
