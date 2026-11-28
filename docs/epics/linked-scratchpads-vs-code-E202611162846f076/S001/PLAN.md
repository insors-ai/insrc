<!-- insrc:artifact PLAN-2846f076fd5f785f-s1 -->

# Plan: STORY-2846f076fd5f785f-s1

## Summary

**Epic:** `linked-scratchpads-vs-code`
**LLD run:** `wf-1795852408886-e5rxdv`
**LLD effective hash:** `6a3ff5cbf2ff...`

Preserve the completed S001 single-pane editor and its t1–t14 history while correcting the failed typing-performance gate. Six new tasks qualify the configured background codec, separate recoverable pending drafts from admission, add idle scheduling and independent host validation, and integrate captured-version action barriers. Requalification precedes the existing final t15 gate, retaining the 1 MiB bound and original render/acknowledgement targets; no new idle implementation has yet been validated.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Does not apply**: First Epic story; no approved sibling BUILD according to workflow handoff.

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Stable scratchpad identity and validated editor protocol | M | approved r1 | — | unit: Stable home/basename identity, refused paths and closed protocol bounds | [[c1]] [[c2]] |
| 2 | **`t2`** Package pinned Milkdown browser assets | M | approved r1 | `t1` | integration: Pinned Milkdown browser JS/CSS, local CSP and VSIX assets | [[c2]] [[c5]] |
| 3 | **`t3`** Markdown fidelity admission and source preservation | L | approved r1 | `t2` | integration: Markdown corpus: zero writes on open, supported edit preservation and unsafe-edit refusal | [[c2]] [[c3]] [[c4]] |
| 4 | **`t4`** Serialize versioned minimal TextDocument edits | L | approved r1 | `t1`, `t3` | unit: Delayed apply/coalesced descendant/stale duplicate/self-echo queue matrix; integration: Renderer older-ack/newer-draft preservation | [[c2]] [[c3]] |
| 5 | **`t5`** Persist pending drafts and handle editor recovery | M | approved r1 | `t4` | unit: Recovery persisted before receipt, failure/dispose/clear rules; integration: Reload recovery preserves draft and canonical source | [[c2]] [[c3]] |
| 6 | **`t6`** Build the single-pane renderer and remembered lock controls | M | approved r1 | `t2`, `t3`, `t4`, `t5` | integration: Actual Crepe remembered lock and locked-mode selection Send tooltip | [[c2]] [[c3]] |
| 7 | **`t7`** Bind the custom editor to native document lifecycle | L | approved r1 | `t6` | unit: Correct-target save/undo/redo drain and provider disposal; live: Native TextDocument undo/save/autosave and host change propagation | [[c2]] [[c3]] [[c4]] |
| 8 | **`t8`** Route explicit selection Send into the chat composer | M | approved r1 | `t7` | unit: Exact captured selection, UTF-8 cap, stale source and chat readiness/disposal; integration: Pointer/keyboard Send selection preservation and no submission | [[c2]] [[c3]] [[c4]] |
| 9 | **`t9`** Support portable image and workspace link authoring | M | approved r1 | `t7` | unit: Asset root/type/size/exclusive names and upload failures; integration: Crepe image callbacks preserve relative Markdown URLs | [[c2]] [[c3]] [[c4]] |
| 10 | **`t10`** Coordinate safe deletion and list refresh | M | approved r1 | `t7` | unit: Exact-URI delete dirty/pending/cancel/close/unlink matrix and independent refresh failures | [[c2]] [[c3]] [[c5]] |
| 11 | **`t11`** Switch all consumers and retire the legacy document channel | M | approved r1 | `t8`, `t9`, `t10` | integration: Atomic legacy channel removal and six chat intents; unit: Store/panel/host and creation/open error regressions | [[c2]] [[c5]] |
| 12 | **`t12`** Prove browser behavior and Markdown preservation | M | approved r1 | `t11` | integration: Packaged-browser Markdown corpus, lock/Send/assets and bridge race matrix | [[c3]] [[c4]] |
| 13 | **`t13`** Qualify VS Code document lifecycle and recovery | L | approved r1 | `t12` | live: Supported-floor/current host save/revert/undo/autosave/external-edit multipane and cross-window matrix; live: Close/reload with delayed receipt/apply/ack retains drafts | [[c3]] [[c4]] |
| 14 | **`t14`** Qualify real rich authoring, Send and note actions | M | approved r1 | `t13` | live: Real paste/drop/pickers and locked/editable Send with closed/ready/disposed chat; live: Deletion and menu/browse refresh across groups | [[c3]] [[c4]] |
| 15 | **`t16`** Factor and qualify the exact configured codec for background execution | M | — | `t14` | integration: Live configured-codec versus background-worker parity and packaged CSP lifecycle; unit: Bounded worker startup timeout cancellation epoch and data-transfer contract | [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] |
| 16 | **`t17`** Separate durable staging from validated authorization | M | — | `t16` | unit: Pending staging versus refusal and exact-generation authorization protocol matrix; integration: Durable pending recovery, stale acknowledgement and deletion cancellation | [[c2]] [[c3]] [[c5]] |
| 17 | **`t18`** Move full-document checks off the typing path | M | — | `t17` | unit: Trailing-gap scheduler continuous typing supersession and disposal; integration: Actual Milkdown immediate render and resumed typing during delayed validation | [[c2]] [[c3]] [[c4]] |
| 18 | **`t19`** Run independent host admission in a bounded background executor | M | — | `t18` | unit: Independent background host admission verified-base cache and stale apply recheck; integration: Host executor fidelity corpus parity and failure recovery | [[c2]] [[c3]] [[c4]] [[c5]] |
| 19 | **`t20`** Flush captured generations for explicit and native lifecycle actions | L | — | `t19` | unit: Captured Save Send Undo Redo lock barriers and native Save reentrancy; integration: Later typing retained through action flush failure and pane disposal | [[c2]] [[c3]] [[c4]] [[c5]] |
| 20 | **`t21`** Requalify idle scheduling, resumed typing and native recovery | L | — | `t20` | integration: Packaged idle admission corpus CSP and affected scratch editor regressions; live: Supported-floor/current idle lifecycle authoring and pre-validation interrupted recovery | [[c3]] [[c4]] [[c5]] |
| 21 | **`t15`** Record performance, packaging and final acceptance evidence | M | approved r1 | `t14`, `t21` | live: Recorded-host 1 MiB render/ack performance and bounds; integration: Production VSIX browser/CJS packaging and ac1-ac4 evidence completeness | [[c4]] [[c5]] |

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

### 2.15 TASK-2846f076fd5f785f-s1-t16 — Factor and qualify the exact configured codec for background execution

Extract the actual live configured Milkdown schema/serializer and equivalent actual-document intent fingerprint into a worker-compatible boundary; preserve all comparator semantics, including only the established heading-id exception. Expected intent comes from the immutable editor document, never from parsing the candidate itself. Package fixed local single-bundle pane codec and host grammar executor entrypoints. Browser loading uses trusted bundled bytes and blob/data-compatible worker loading with minimal worker-src; retain connect-src none, no eval/document-controlled code, no AI/remote calls. Workers have no file/chat/command authority. Before changing observation, prove exact live/worker parse/serialize/intent parity across supported/refusal corpus and packaged CSP startup/disposal. Worker failure retains source/draft and blocks admission; unavailable parity/CSP evidence blocks dependent work.

**Acceptance checks:**
- Extract the actual live configured Milkdown schema/serializer and equivalent actual-document intent fingerprint into a worker-compatible boundary; preserve all comparator semantics, including only the established heading-id exception. Expected intent comes from the immutable editor document, never from parsing the candidate itself.
- Package fixed local single-bundle pane codec and host grammar executor entrypoints. Browser loading uses trusted bundled bytes and blob/data-compatible worker loading with minimal worker-src; retain connect-src none, no eval/document-controlled code, no AI/remote calls. Workers have no file/chat/command authority.
- Before changing observation, prove exact live/worker parse/serialize/intent parity across supported/refusal corpus and packaged CSP startup/disposal. Worker failure retains source/draft and blocks admission; unavailable parity/CSP evidence blocks dependent work.
- Qualify startup, timeout, cancellation/disposal and exact executor-epoch rejection; bound ownership to one active plus latest queued job and separate bounded base/candidate transfers. Fixed code only; do not retain an unbounded cache or block input while an obsolete worker finishes.

### 2.16 TASK-2846f076fd5f785f-s1-t17 — Separate durable staging from validated authorization

Atomically migrate closed protocol, renderer state, controller and all producers/consumers so recovery-only apply:false means pending validation rather than refusal; only explicit exact-sequence/base authorization may apply. Preserve 1MiB note and 2MiB ordinary-message caps using separate bounded transfers. Track waiting-idle/validating/authorized/applied/conflict distinctly. Old acknowledgement may update base but cannot replace newer typing or automatically authorize it; own-parent base changes require fresh admission, external incompatible changes freeze with both texts retained. Persist before durable receipt, clear recovery only after delivered acknowledgement to attached pane, preserve accepted apply on disposal and unconfirmed drafts on errors/restart. Pending validation counts as pending for deletion, which cancels without authorizing or hanging.

**Acceptance checks:**
- Atomically migrate closed protocol, renderer state, controller and all producers/consumers so recovery-only apply:false means pending validation rather than refusal; only explicit exact-sequence/base authorization may apply. Preserve 1MiB note and 2MiB ordinary-message caps using separate bounded transfers.
- Track waiting-idle/validating/authorized/applied/conflict distinctly. Old acknowledgement may update base but cannot replace newer typing or automatically authorize it; own-parent base changes require fresh admission, external incompatible changes freeze with both texts retained.
- Persist before durable receipt, clear recovery only after delivered acknowledgement to attached pane, preserve accepted apply on disposal and unconfirmed drafts on errors/restart. Pending validation counts as pending for deletion, which cancels without authorizing or hanging.

### 2.17 TASK-2846f076fd5f785f-s1-t18 — Move full-document checks off the typing path

Replace synchronous appendTransaction admission with immediate immutable intent capture and at most one serialization for bounded recovery staging. No full grammar/round-trip/inventory checks run in input dispatch; initialization/host echoes/selection do not stage or reset timer. Use a 300ms trailing-edge content-edit gap, no periodic max-wait validation during continuous typing. Dispatch latest immutable candidate to the pane codec executor with exact pane/session/epoch/sequence/base/configured-codec identity. Bound each executor to one active plus latest queued job; newer typing invalidates results without blocking rendering. Discard stale/failed results, schedule newest after its own gap and cancel timers/jobs/waiters on disposal while retaining recovery. Measure serialization/intent capture as well as validation; moving checks must actually improve full-bound render responsiveness, not merely reschedule the same renderer-thread freeze.

**Acceptance checks:**
- Replace synchronous appendTransaction admission with immediate immutable intent capture and at most one serialization for bounded recovery staging. No full grammar/round-trip/inventory checks run in input dispatch; initialization/host echoes/selection do not stage or reset timer.
- Use a 300ms trailing-edge content-edit gap, no periodic max-wait validation during continuous typing. Dispatch latest immutable candidate to the pane codec executor with exact pane/session/epoch/sequence/base/configured-codec identity.
- Bound each executor to one active plus latest queued job; newer typing invalidates results without blocking rendering. Discard stale/failed results, schedule newest after its own gap and cancel timers/jobs/waiters on disposal while retaining recovery.
- Measure serialization/intent capture as well as validation; moving checks must actually improve full-bound render responsiveness, not merely reschedule the same renderer-thread freeze.

### 2.18 TASK-2846f076fd5f785f-s1-t19 — Run independent host admission in a bounded background executor

Move host semantic/raw-syntax admission to its independent owned executor and retain every existing fidelity assertion. Parse each unique input once per job and share semantic/inventory products; do not remove checks for speed. Reuse only fully verified immutable bases keyed by exact source/version/digest and codec/executor epoch; invalidate on external changes, reload and executor replacement. Keep bounded memory and one running plus latest queued work. After asynchronous validation recheck exact live source/version/digest immediately before the one minimal WorkspaceEdit. Superseded validation cannot start apply; already accepted apply may complete without overwriting newer visible drafts. Worker errors/timeouts retain recovery and reject barriers visibly.

**Acceptance checks:**
- Move host semantic/raw-syntax admission to its independent owned executor and retain every existing fidelity assertion. Parse each unique input once per job and share semantic/inventory products; do not remove checks for speed.
- Reuse only fully verified immutable bases keyed by exact source/version/digest and codec/executor epoch; invalidate on external changes, reload and executor replacement. Keep bounded memory and one running plus latest queued work.
- After asynchronous validation recheck exact live source/version/digest immediately before the one minimal WorkspaceEdit. Superseded validation cannot start apply; already accepted apply may complete without overwriting newer visible drafts. Worker errors/timeouts retain recovery and reject barriers visibly.

### 2.19 TASK-2846f076fd5f785f-s1-t20 — Flush captured generations for explicit and native lifecycle actions

Save/Send/Undo/Redo explicitly cancel idle delay and flush their captured immutable generation through validation and canonical acknowledgement before acting. Later typing cannot silently extend or replace capture; Send preserves exact captured selection and inserts once without submission. Lock blocks new editing immediately, completes captured validation/application while still permitted, then commits lock; refusal/failure retains draft and shows actual state. Do not leave a partially locked pane silently losing edits. Native Save requests bounded renderer flush without command-queue reentrancy/deadlock; onWillSave remains best effort, can save earlier canonical text with pending recovery, and never reports local-only text saved. Dispose/close cancels waiters safely and pending deletion cancels. Preserve all existing same-pane authoring, remembered lock, scoped activation, asset/CSP, browse/create/delete/refresh and text-fallback behavior; no legacy document channels or sibling feature additions.

**Acceptance checks:**
- Save/Send/Undo/Redo explicitly cancel idle delay and flush their captured immutable generation through validation and canonical acknowledgement before acting. Later typing cannot silently extend or replace capture; Send preserves exact captured selection and inserts once without submission.
- Lock blocks new editing immediately, completes captured validation/application while still permitted, then commits lock; refusal/failure retains draft and shows actual state. Do not leave a partially locked pane silently losing edits.
- Native Save requests bounded renderer flush without command-queue reentrancy/deadlock; onWillSave remains best effort, can save earlier canonical text with pending recovery, and never reports local-only text saved. Dispose/close cancels waiters safely and pending deletion cancels.
- Preserve all existing same-pane authoring, remembered lock, scoped activation, asset/CSP, browse/create/delete/refresh and text-fallback behavior; no legacy document channels or sibling feature additions.

### 2.20 TASK-2846f076fd5f785f-s1-t21 — Requalify idle scheduling, resumed typing and native recovery

Add deterministic timer/race coverage for continuous typing, resumed input during long validation, stale session/epoch/sequence/base, explicit captured action flush, pending-vs-refusal, cache invalidation, worker timeout/disposal and bounded queue behavior. Run actual packaged browser codec parity/CSP and full fidelity corpus; prove input renders before full checks and while validators are busy. Preserve every original supported/refused syntax outcome. On private-display supported-floor/current real VS Code hosts, re-run affected save/undo/revert/autosave, multipane/cross-window, real rich authoring/Send/delete/refresh, and process interruption before idle/validation/result/ack. Missing/failed required evidence blocks completion; prior t1–t14 passes remain historical rather than proof of changed behavior. Retain detailed evidence per scenario and refresh affected existing task test mappings without erasing failures. Hand off original full-bound latency qualification to final t15; no reduced note bound or changed clock counts as passing.

**Acceptance checks:**
- Add deterministic timer/race coverage for continuous typing, resumed input during long validation, stale session/epoch/sequence/base, explicit captured action flush, pending-vs-refusal, cache invalidation, worker timeout/disposal and bounded queue behavior.
- Run actual packaged browser codec parity/CSP and full fidelity corpus; prove input renders before full checks and while validators are busy. Preserve every original supported/refused syntax outcome.
- On private-display supported-floor/current real VS Code hosts, re-run affected save/undo/revert/autosave, multipane/cross-window, real rich authoring/Send/delete/refresh, and process interruption before idle/validation/result/ack. Missing/failed required evidence blocks completion; prior t1–t14 passes remain historical rather than proof of changed behavior.
- Retain detailed evidence per scenario and refresh affected existing task test mappings without erasing failures. Hand off original full-bound latency qualification to final t15; no reduced note bound or changed clock counts as passing.

### 2.21 TASK-2846f076fd5f785f-s1-t15 — Record performance, packaging and final acceptance evidence

Measure 1 MiB UTF-8 note/boundaries and 2 MiB bridge limits on a recorded reference host: <=150 ms median keystroke-to-render and <=1 s p95 host ack. If unmet, validation fails; a reduced support bound needs a tracked design revision and fresh approval before acceptance. Verify production VSIX includes browser JS/CSS and retains Node/CJS activation/uninstall packaging; no remote assets/AI calls or accidental Markdown-wide takeover. Map actual evidence to ac1-ac4 and every task; preserve failures/unavailable tests honestly, do not mark BUILD valid until mandatory checks pass; update relevant design visuals if implementation changes interactions.

**Acceptance checks:**
- Measure 1 MiB UTF-8 note/boundaries and 2 MiB bridge limits on a recorded reference host: <=150 ms median keystroke-to-render and <=1 s p95 host ack. If unmet, validation fails; a reduced support bound needs a tracked design revision and fresh approval before acceptance.
- Verify production VSIX includes browser JS/CSS and retains Node/CJS activation/uninstall packaging; no remote assets/AI calls or accidental Markdown-wide takeover.
- Map actual evidence to ac1-ac4 and every task; preserve failures/unavailable tests honestly, do not mark BUILD valid until mandatory checks pass; update relevant design visuals if implementation changes interactions.
- At full 1MiB, record 20 trusted edits on supported-floor/current reference hosts plus sustained, burst and resumed-during-validation scenarios. Preserve <=150ms median keystroke-to-render and <=1s p95 canonical acknowledgement. Latest-burst acknowledgement starts at its final content edit and includes the 300ms idle delay; separately report superseded edits and explicit action flush timing without omitting slow/missing results.

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Deterministic identity, URI/type/symlink refusal, note/image/message bounds and no-op-on-open guards. | `t1`, `t3`, `t9`, `t12`, `t17`, `t21` |
| One-in-flight/queued-descendant behavior, duplicate/stale/cross-pane messages, self echo versus external change and late acknowledgements. | `t4`, `t5`, `t12`, `t17`, `t19`, `t21` |
| Dirty/recovery/cancelled/failed deletion, created-but-open-failed reporting, save refresh/disposal and bounded composer insertion. | `t8`, `t10`, `t11`, `t20`, `t21` |
| Deterministic fake clock: 300ms trailing gap, continuous typing no validation, explicit flush bypasses delay, stale epoch/sequence/base discarded, exact captured action sequence and cancellation; pending is not conflict and acknowledgement never auto-authorizes newer typing. | `t17`, `t18`, `t20` |
| Independent host background admission retains every fidelity assertion; verified immutable-base cache invalidation and one running/latest queued bound; timeout/failure/reentrancy cannot hang Save/delete/disposal. | `t16`, `t19`, `t20`, `t21` |
| Published 7.23.0 local bundle under production CSP, setReadonly/mode preference and independent Send tooltip with keyboard focus preservation. | `t2`, `t6`, `t12`, `t16`, `t21` |
| Remove Milkdown history provider/commands/keymap; bind host-targeted undo/redo, drain and broadcast without loops. | `t7`, `t12`, `t13`, `t20`, `t21` |
| Parse/serialize/edit corpus: headings, tight/loose lists, tables, links/images, escaping, front matter, HTML/comments, Unicode, CRLF, fenced code/diagrams and literal custom links. Assert original unchanged on open and no unknown-content loss on supported edits. | `t3`, `t12`, `t16`, `t19`, `t21` |
| Asset onUpload/proxyDomURL keeps portable relative source paths; failures never insert transient/broken URLs. | `t9`, `t12`, `t14`, `t21` |
| Static/typecheck migration: no legacy document protocol/method consumers; six chat intents remain. | `t11`, `t12`, `t21` |
| Early gate: factor exactly the live configured schema/serializer into a pure worker-compatible module; prove production codec and actual-document fingerprint parity over the entire supported/refusal corpus. Worker loading under actual packaged CSP with connect-src none, no dynamic imports or document-controlled code. | `t16`, `t21` |
| Prove appendTransaction performs no full validation and at most one serialization; real browser typing resumes during a deliberately delayed validator without render blocking. Stage recovery immediately, apply only current admitted generation; stale results and old acknowledgements never replace latest text. | `t17`, `t18`, `t19`, `t21` |
| Real .md open/edit/save/dirty/undo/redo/revert, native autosave and external edits in same and second windows. | `t7`, `t13`, `t20`, `t21` |
| Close/reload while draft receipt/apply/ack is delayed; prove recovery without false saved state or draft loss. | `t5`, `t13`, `t17`, `t21` |
| Multiple groups/panes, remembered lock, locked selection, select->click Send with chat closed/ready/disposed, and no automatic submission. | `t6`, `t8`, `t13`, `t14`, `t20`, `t21` |
| Real image paste/drop, URL paste, workspace link/image insertion, CSP/offline operation and error paths. | `t9`, `t14`, `t21` |
| Budget: 1 MiB UTF-8 note and boundaries; responsiveness target <=150 ms median keystroke-to-render and <=1 s p95 host acknowledgement on a recorded reference host, with a smaller supported bound or explicit design revision if unmet. | `t15` |
| Repeat full 1MiB 20-trusted-edit qualification on recorded floor/current VS Code private display. Preserve <=150ms median keystroke-to-render and <=1s p95 host ack targets; ordinary latest-burst clock starts at final content edit and includes the 300ms idle delay. Explicit flush starts at action. Report superseded edits separately, no missing slow acknowledgements hidden. | `t15` |
| Add sustained typing, bursts, resumed typing during long validation, Save/Send/Undo/Redo/lock/native autosave while pending and process interruption before idle/result/ack. Measure rendering, staging and job/application separately; immediate serialization or intent capture that still misses render budget blocks acceptance. | `t18`, `t20`, `t21`, `t15` |
| Re-run affected existing authoring/lifecycle/recovery/corpus/packaging mapping; no skip, reduced note bound or revised latency clock counts as success. | `t21`, `t15` |

## 4. References

- **[[c1]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md` — "Approved LLD6 summary/HLD slice: preserve S001 one-pane editor, sc1 identity, completed scope and sibling boundaries."
- **[[c2]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md#3-contract-details` — "Contract details/data model: immediate bounded recoverable staging, 300ms idle background admission, exact-generation authorization, independent host checks, captured action barriers; retain existing "
- **[[c3]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md#7-error-paths` — "Detect worker failure, supersession, source conflict and refusal; retain canonical/draft/recovery with bounded explicit-action errors."
- **[[c4]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md#8-test-strategy` — "All 20 test subjects: codec parity, idle/races, lifecycle/authoring/corpus and original 1MiB render<=150ms median/ack<=1s p95, with idle delay included."
- **[[c5]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md#9-migration` — "In-progress S001 t1–t14 evidence preserved, failed t15 correction tracked; qualify codec before atomic private protocol/observer migration; no data rewrite or bound reduction."
- **[[c6]]** `prior-artifact` `docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/LLD.md` — "Background validation lifetime and source c62: trusted fixed single-bundle worker loading compatible with actual VS Code CSP; same configured codec, no native/cloud authority; early parity/startup qua"
