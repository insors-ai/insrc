<!-- insrc:artifact PLAN-2846f076fd5f785f-s1 -->

# Plan: STORY-2846f076fd5f785f-s1

## Summary

**Epic:** `linked-scratchpads-vs-code`
**LLD run:** `wf-1795804487811-vzqj5e`
**LLD effective hash:** `6a3ff5cbf2ff...`

Build one Milkdown scratchpad editor on the existing Markdown TextDocument, with remembered lock controls and an explicit selection Send action. The work adds a versioned synchronization and recovery bridge, integrates native save/undo and portable images, then replaces all legacy document-channel consumers together. Browser, Markdown-corpus and real VS Code qualification are required before validation can pass.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Does not apply**: First Epic story; workflow handoff confirms no approved sibling BUILD.

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Stable scratchpad identity and validated editor protocol | M | — | — | unit: Stable home/basename identity, refused paths and closed protocol bounds | [[c1]] [[c2]] |
| 2 | **`t2`** Package pinned Milkdown browser assets | M | — | `t1` | integration: Pinned Milkdown browser JS/CSS, local CSP and VSIX assets | [[c2]] [[c5]] |
| 3 | **`t3`** Markdown fidelity admission and source preservation | L | — | `t2` | integration: Markdown corpus: zero writes on open, supported edit preservation and unsafe-edit refusal | [[c2]] [[c3]] [[c4]] |
| 4 | **`t4`** Serialize versioned minimal TextDocument edits | L | — | `t1`, `t3` | unit: Delayed apply/coalesced descendant/stale duplicate/self-echo queue matrix; integration: Renderer older-ack/newer-draft preservation | [[c2]] [[c3]] |
| 5 | **`t5`** Persist pending drafts and handle editor recovery | M | — | `t4` | unit: Recovery persisted before receipt, failure/dispose/clear rules; integration: Reload recovery preserves draft and canonical source | [[c2]] [[c3]] |
| 6 | **`t6`** Build the single-pane renderer and remembered lock controls | M | — | `t2`, `t3`, `t4`, `t5` | integration: Actual Crepe remembered lock and locked-mode selection Send tooltip | [[c2]] [[c3]] |
| 7 | **`t7`** Bind the custom editor to native document lifecycle | L | — | `t6` | unit: Correct-target save/undo/redo drain and provider disposal; live: Native TextDocument undo/save/autosave and host change propagation | [[c2]] [[c3]] [[c4]] |
| 8 | **`t8`** Route explicit selection Send into the chat composer | M | — | `t7` | unit: Exact captured selection, UTF-8 cap, stale source and chat readiness/disposal; integration: Pointer/keyboard Send selection preservation and no submission | [[c2]] [[c3]] [[c4]] |
| 9 | **`t9`** Support portable image and workspace link authoring | M | — | `t7` | unit: Asset root/type/size/exclusive names and upload failures; integration: Crepe image callbacks preserve relative Markdown URLs | [[c2]] [[c3]] [[c4]] |
| 10 | **`t10`** Coordinate safe deletion and list refresh | M | — | `t7` | unit: Exact-URI delete dirty/pending/cancel/close/unlink matrix and independent refresh failures | [[c2]] [[c3]] [[c5]] |
| 11 | **`t11`** Switch all consumers and retire the legacy document channel | M | — | `t8`, `t9`, `t10` | integration: Atomic legacy channel removal and six chat intents; unit: Store/panel/host and creation/open error regressions | [[c2]] [[c5]] |
| 12 | **`t12`** Prove browser behavior and Markdown preservation | M | — | `t11` | integration: Packaged-browser Markdown corpus, lock/Send/assets and bridge race matrix | [[c3]] [[c4]] |
| 13 | **`t13`** Qualify VS Code document lifecycle and recovery | L | — | `t12` | live: Supported-floor/current host save/revert/undo/autosave/external-edit multipane and cross-window matrix; live: Close/reload with delayed receipt/apply/ack retains drafts | [[c3]] [[c4]] |
| 14 | **`t14`** Qualify real rich authoring, Send and note actions | M | — | `t13` | live: Real paste/drop/pickers and locked/editable Send with closed/ready/disposed chat; live: Deletion and menu/browse refresh across groups | [[c3]] [[c4]] |
| 15 | **`t15`** Record performance, packaging and final acceptance evidence | M | — | `t14` | live: Recorded-host 1 MiB render/ack performance and bounds; integration: Production VSIX browser/CJS packaging and ac1-ac4 evidence completeness | [[c4]] [[c5]] |

### 2.1 TASK-2846f076fd5f785f-s1-t1 — Stable scratchpad identity and validated editor protocol

Add shared sc1 home/basename identity and read-only store resolver without s7 metadata or workspace inference. Define closed runtime-validated session/sequence/base-version/digest/edit-parent, receipt/ack/conflict/command/asset unions; ordinary messages capped at 2 MiB and notes at 1 MiB UTF-8.

**Acceptance checks:**
- Add shared sc1 home/basename identity and read-only store resolver without s7 metadata or workspace inference.
- Define closed runtime-validated session/sequence/base-version/digest/edit-parent, receipt/ack/conflict/command/asset unions; ordinary messages capped at 2 MiB and notes at 1 MiB UTF-8.

### 2.2 TASK-2846f076fd5f785f-s1-t2 — Package pinned Milkdown browser assets

Pin compatible 7.23.0 library packages and lock a deduplicated graph; no AI or remote asset/provider calls. Add distinct browser JS/CSS esbuild output alongside existing Node/CJS bundles; include local assets in VSIX and enforce CSP.

**Acceptance checks:**
- Pin compatible 7.23.0 library packages and lock a deduplicated graph; no AI or remote asset/provider calls.
- Add distinct browser JS/CSS esbuild output alongside existing Node/CJS bundles; include local assets in VSIX and enforce CSP.

### 2.3 TASK-2846f076fd5f785f-s1-t3 — Markdown fidelity admission and source preservation

Opening/parsing/selecting/locking produces zero edits; retain original source bytes. Implement parse/serialize/parse semantic checks and raw fingerprints for front matter, HTML/comments, code/diagram fences and literal custom links. Unknown constructs require verified exact opaque preservation or refuse mutation with original/draft intact. Use corpus fixtures to distinguish intentional supported edits from unrelated loss; minimal diff alone is insufficient.

**Acceptance checks:**
- Opening/parsing/selecting/locking produces zero edits; retain original source bytes.
- Implement parse/serialize/parse semantic checks and raw fingerprints for front matter, HTML/comments, code/diagram fences and literal custom links. Unknown constructs require verified exact opaque preservation or refuse mutation with original/draft intact.
- Use corpus fixtures to distinguish intentional supported edits from unrelated loss; minimal diff alone is insufficient.

### 2.4 TASK-2846f076fd5f785f-s1-t4 — Serialize versioned minimal TextDocument edits

Implement one per-document queue shared across panes, one awaited apply at a time and minimal contiguous WorkspaceEdit. Every local change reports latest draft even while apply pending; coalesce superseded snapshots, validate accepted base/identified parents and match self-origin change events. Reject stale/cross-session/conflicting duplicate messages; suppress echo; old ack never overwrites newer typing, external unmatched change freezes mutation and retains competing text.

**Acceptance checks:**
- Implement one per-document queue shared across panes, one awaited apply at a time and minimal contiguous WorkspaceEdit.
- Every local change reports latest draft even while apply pending; coalesce superseded snapshots, validate accepted base/identified parents and match self-origin change events.
- Reject stale/cross-session/conflicting duplicate messages; suppress echo; old ack never overwrites newer typing, external unmatched change freezes mutation and retains competing text.

### 2.5 TASK-2846f076fd5f785f-s1-t5 — Persist pending drafts and handle editor recovery

Persist bounded latest received/unapplied per-document draft before receipt; clear only committed or explicitly discarded. Dispose must not cancel accepted safe edit or delete recovery; reopening/reload exposes recovery without automatic overwrite. Storage/apply/receipt failures remain visible and never falsely claim saved state; no s7 lifecycle metadata.

**Acceptance checks:**
- Persist bounded latest received/unapplied per-document draft before receipt; clear only committed or explicitly discarded.
- Dispose must not cancel accepted safe edit or delete recovery; reopening/reload exposes recovery without automatic overwrite.
- Storage/apply/receipt failures remain visible and never falsely claim saved state; no s7 lifecycle metadata.

### 2.6 TASK-2846f076fd5f785f-s1-t6 — Build the single-pane renderer and remembered lock controls

Create proposed Milkdown webview with explicit setReadonly, initial locked preference, pane-local toggle and remembered future-pane mode. Independent accessible Send-only selection tooltip remains usable locked; selection-only transactions emit no edits and hide mutation tools while locked. Renderer uses the new bridge and preserves newer draft on old ack; initialization/unsupported-size errors preserve source and offer explicit same-file text fallback.

**Acceptance checks:**
- Create proposed Milkdown webview with explicit setReadonly, initial locked preference, pane-local toggle and remembered future-pane mode.
- Independent accessible Send-only selection tooltip remains usable locked; selection-only transactions emit no edits and hide mutation tools while locked.
- Renderer uses the new bridge and preserves newer draft on old ack; initialization/unsupported-size errors preserve source and offer explicit same-file text fallback.

### 2.7 TASK-2846f076fd5f785f-s1-t7 — Bind the custom editor to native document lifecycle

Register scoped insrc.scratchpad.editor with CustomTextEditorProvider and inject host APIs through activation; reject unrelated or refused URIs. Remove library history plugin array before creation and rebind keys/actions to correct-document host undo/redo after draining. Standard Save drains; onWillSave is best effort only; autosave may save earlier canonical state while pending text remains recoverable. Broadcast host/undo/external changes without secondary history or echo. Dispose listeners/sessions cleanly and support multiple groups; no private native editor APIs or native-save O_NOFOLLOW claim.

**Acceptance checks:**
- Register scoped insrc.scratchpad.editor with CustomTextEditorProvider and inject host APIs through activation; reject unrelated or refused URIs.
- Remove library history plugin array before creation and rebind keys/actions to correct-document host undo/redo after draining.
- Standard Save drains; onWillSave is best effort only; autosave may save earlier canonical state while pending text remains recoverable. Broadcast host/undo/external changes without secondary history or echo.
- Dispose listeners/sessions cleanly and support multiple groups; no private native editor APIs or native-save O_NOFOLLOW claim.

### 2.8 TASK-2846f076fd5f785f-s1-t8 — Route explicit selection Send into the chat composer

Click/keyboard activation captures immutable pane/session/draft-sequence/document-version and exact plain selected text with paragraph boundaries before focus changes. Drain captured sequence, validate compatible source, cap at 65,536 UTF-8 bytes including ellipsis and use reveal/ready/disposed/insert route once without submission. Selection alone does nothing; incompatible stale source retains snapshot and reports retry, never silently recaptures.

**Acceptance checks:**
- Click/keyboard activation captures immutable pane/session/draft-sequence/document-version and exact plain selected text with paragraph boundaries before focus changes.
- Drain captured sequence, validate compatible source, cap at 65,536 UTF-8 bytes including ellipsis and use reveal/ready/disposed/insert route once without submission.
- Selection alone does nothing; incompatible stale source retains snapshot and reports retry, never silently recaptures.

### 2.9 TASK-2846f076fd5f785f-s1-t9 — Support portable image and workspace link authoring

Override Crepe inline/block upload for paste/drop and host-chosen image insertion; validate asset root/type, 10 MiB image bound and exclusive names. Persist relative Markdown paths; display through proxyDomURL/asWebviewUri only, never save blob:/vscode-webview: URLs. Provide workspace link/image pickers and URL-as-link paste in the same pane; failed/cancelled upload inserts no broken reference or remote call.

**Acceptance checks:**
- Override Crepe inline/block upload for paste/drop and host-chosen image insertion; validate asset root/type, 10 MiB image bound and exclusive names.
- Persist relative Markdown paths; display through proxyDomURL/asWebviewUri only, never save blob:/vscode-webview: URLs.
- Provide workspace link/image pickers and URL-as-link paste in the same pane; failed/cancelled upload inserts no broken reference or remote call.

### 2.10 TASK-2846f076fd5f785f-s1-t10 — Coordinate safe deletion and list refresh

Both browse/chat deletion use one async exact-URI operation: serialize/drain, inspect all groups, cancel dirty/pending/recovery, await clean targeted close and recheck/revalidate before guarded unlink. Close cancellation leaves file; unlink failure attempts reopen and reports failure; never close unrelated tabs or promise cross-window exclusion. One scoped disposable save listener coalesces browse/menu refresh, catches failures independently and never opens closed UI; creation/deletion refresh same boundary.

**Acceptance checks:**
- Both browse/chat deletion use one async exact-URI operation: serialize/drain, inspect all groups, cancel dirty/pending/recovery, await clean targeted close and recheck/revalidate before guarded unlink.
- Close cancellation leaves file; unlink failure attempts reopen and reports failure; never close unrelated tabs or promise cross-window exclusion.
- One scoped disposable save listener coalesces browse/menu refresh, catches failures independently and never opens closed UI; creation/deletion refresh same boundary.

### 2.11 TASK-2846f076fd5f785f-s1-t11 — Switch all consumers and retire the legacy document channel

Atomically wire open/new/async delete/refreshList in panels, scratch host and activation; creation versus open failures are reported separately. richEditor defaults true, off explicitly opens same file in text editor; preserve browse UI, capUtf8, six chat intents, names and guarded store APIs. Remove textarea renderer/bootstrap, old save/saved/dirty/readiness/content protocol, onDocMessage/replySaved/generation/showingId/invalidateId and obsolete callback/test consumers together; migrate fakes/type shims.

**Acceptance checks:**
- Atomically wire open/new/async delete/refreshList in panels, scratch host and activation; creation versus open failures are reported separately.
- richEditor defaults true, off explicitly opens same file in text editor; preserve browse UI, capUtf8, six chat intents, names and guarded store APIs.
- Remove textarea renderer/bootstrap, old save/saved/dirty/readiness/content protocol, onDocMessage/replySaved/generation/showingId/invalidateId and obsolete callback/test consumers together; migrate fakes/type shims.

### 2.12 TASK-2846f076fd5f785f-s1-t12 — Prove browser behavior and Markdown preservation

Run real packaged-browser tests with local CSP, editable/locked selection and keyboard Send focus, asset callbacks, update/ack ordering and no initialization write. Run full Markdown corpus including Unicode/CRLF/unknown syntax, supported edit preservation and unsafe-edit refusal. Keep original/draft on failure. Run scoped host/store/panel/wiring regressions, strict typecheck and legacy-channel absence checks; actual library behavior cannot be proven by fake DOM alone.

**Acceptance checks:**
- Run real packaged-browser tests with local CSP, editable/locked selection and keyboard Send focus, asset callbacks, update/ack ordering and no initialization write.
- Run full Markdown corpus including Unicode/CRLF/unknown syntax, supported edit preservation and unsafe-edit refusal. Keep original/draft on failure.
- Run scoped host/store/panel/wiring regressions, strict typecheck and legacy-channel absence checks; actual library behavior cannot be proven by fake DOM alone.

### 2.13 TASK-2846f076fd5f785f-s1-t13 — Qualify VS Code document lifecycle and recovery

Run required real host tests at supported floor 1.141.0 and current 1.146.0 where available, recording exact versions and unavailable coverage. Cover edit/save/dirty/undo/redo/revert/autosave, external edits and second-window conflicts, multiple groups, close/reload during delayed receipt/apply/ack, and bounded recovery without false saved state. Record failures and unavailable required host coverage as blocking, not skipped-success; retain all drafts/source on fault probes.

**Acceptance checks:**
- Run required real host tests at supported floor 1.141.0 and current 1.146.0 where available, recording exact versions and unavailable coverage.
- Cover edit/save/dirty/undo/redo/revert/autosave, external edits and second-window conflicts, multiple groups, close/reload during delayed receipt/apply/ack, and bounded recovery without false saved state.
- Record failures and unavailable required host coverage as blocking, not skipped-success; retain all drafts/source on fault probes.

### 2.14 TASK-2846f076fd5f785f-s1-t14 — Qualify real rich authoring, Send and note actions

Exercise actual editor interaction and chat routing after lifecycle qualification.

**Acceptance checks:**
- On supported-floor/current real VS Code hosts, exercise image paste/drop, URL paste and workspace link/image pickers under production CSP/offline operation.
- Verify remembered lock across new panes, locked/editable accessible selection Send, exact selected text/focus capture, size cap and chat closed/ready/disposed paths; selection never inserts and Send never submits.
- Exercise dirty/pending/recovery deletion cancellation, clean close/unlink failure, unrelated-tab isolation and menu/browse refresh with disposed UI. Record missing/failed required qualification as blocking.

### 2.15 TASK-2846f076fd5f785f-s1-t15 — Record performance, packaging and final acceptance evidence

Measure 1 MiB UTF-8 note/boundaries and 2 MiB bridge limits on a recorded reference host: <=150 ms median keystroke-to-render and <=1 s p95 host ack. If unmet, validation fails; a reduced support bound needs a tracked design revision and fresh approval before acceptance. Verify production VSIX includes browser JS/CSS and retains Node/CJS activation/uninstall packaging; no remote assets/AI calls or accidental Markdown-wide takeover. Map actual evidence to ac1-ac4 and every task; preserve failures/unavailable tests honestly, do not mark BUILD valid until mandatory checks pass; update relevant design visuals if implementation changes interactions.

**Acceptance checks:**
- Measure 1 MiB UTF-8 note/boundaries and 2 MiB bridge limits on a recorded reference host: <=150 ms median keystroke-to-render and <=1 s p95 host ack. If unmet, validation fails; a reduced support bound needs a tracked design revision and fresh approval before acceptance.
- Verify production VSIX includes browser JS/CSS and retains Node/CJS activation/uninstall packaging; no remote assets/AI calls or accidental Markdown-wide takeover.
- Map actual evidence to ac1-ac4 and every task; preserve failures/unavailable tests honestly, do not mark BUILD valid until mandatory checks pass; update relevant design visuals if implementation changes interactions.

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Deterministic identity, URI/type/symlink refusal, note/image/message bounds and no-op-on-open guards. | `t1`, `t3`, `t9`, `t12` |
| One-in-flight/queued-descendant behavior, duplicate/stale/cross-pane messages, self echo versus external change and late acknowledgements. | `t4`, `t5`, `t12` |
| Dirty/recovery/cancelled/failed deletion, created-but-open-failed reporting, save refresh/disposal and bounded composer insertion. | `t8`, `t10`, `t11` |
| Published 7.23.0 local bundle under production CSP, setReadonly/mode preference and independent Send tooltip with keyboard focus preservation. | `t2`, `t6`, `t12` |
| Remove Milkdown history provider/commands/keymap; bind host-targeted undo/redo, drain and broadcast without loops. | `t7`, `t12`, `t13` |
| Parse/serialize/edit corpus: headings, tight/loose lists, tables, links/images, escaping, front matter, HTML/comments, Unicode, CRLF, fenced code/diagrams and literal custom links. Assert original unchanged on open and no unknown-content loss on supported edits. | `t3`, `t12` |
| Asset onUpload/proxyDomURL keeps portable relative source paths; failures never insert transient/broken URLs. | `t9`, `t12`, `t14` |
| Static/typecheck migration: no legacy document protocol/method consumers; six chat intents remain. | `t11`, `t12` |
| Real .md open/edit/save/dirty/undo/redo/revert, native autosave and external edits in same and second windows. | `t7`, `t13` |
| Close/reload while draft receipt/apply/ack is delayed; prove recovery without false saved state or draft loss. | `t5`, `t13` |
| Multiple groups/panes, remembered lock, locked selection, select->click Send with chat closed/ready/disposed, and no automatic submission. | `t6`, `t8`, `t13`, `t14` |
| Real image paste/drop, URL paste, workspace link/image insertion, CSP/offline operation and error paths. | `t9`, `t14` |
| Budget: 1 MiB UTF-8 note and boundaries; responsiveness target <=150 ms median keystroke-to-render and <=1 s p95 host acknowledgement on a recorded reference host, with a smaller supported bound or explicit design revision if unmet. | `t15` |

## 4. References

- **[[c1]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md` — "Approved revision 5: summary, shared sc1 implementation and story-local boundaries."
- **[[c2]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md#3-contract-details` — "Milkdown packaging, identity, protocol, queue/recovery, locks, native lifecycle, explicit Send, assets, delete and refresh contracts; data-model changes."
- **[[c3]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md#7-error-paths` — "Preserve canonical source and drafts on stale state, unsupported syntax, failed operations or disposal; accepted native I/O boundary."
- **[[c4]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md#8-test-strategy` — "Required unit, integration/browser and live host/corpus/performance subjects; ac1-ac4 mappings."
- **[[c5]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md#9-migration` — "Atomic consumer switch and legacy document-channel retirement; no data rewrite or sibling features; qualification before BUILD approval."

## Citations

- **[[c1]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md` — "Approved revision 5: summary, shared sc1 implementation and story-local boundaries."
- **[[c2]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md#3-contract-details` — "Milkdown packaging, identity, protocol, queue/recovery, locks, native lifecycle, explicit Send, assets, delete and refresh contracts; data-model changes."
- **[[c3]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md#7-error-paths` — "Preserve canonical source and drafts on stale state, unsupported syntax, failed operations or disposal; accepted native I/O boundary."
- **[[c4]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md#8-test-strategy` — "Required unit, integration/browser and live host/corpus/performance subjects; ac1-ac4 mappings."
- **[[c5]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md#9-migration` — "Atomic consumer switch and legacy document-channel retirement; no data rewrite or sibling features; qualification before BUILD approval."
