<!-- insrc:artifact LLD-1bd72813bfa795f4-S001 -->

# LLD: E202611031bd72813:S001

## Summary

**Epic:** `multiple-concurrent-chats-chat-panel-active`
**HLD base run:** `wf-1793722967234-8apdy1`
**HLD effective hash:** `1bd72813bfa7...`

The chat panel tab header gains a second dropdown next to the history control listing active chats — agent working (yellow) or waiting for user input (red), plus done chats (green) until purged from the list after 30 minutes of inactivity. Status is extension-local, derived from the turn lifecycle and stream events, persisted in the existing session store, and reconciled for detached sessions by a 60 s observer; selecting an entry posts the existing `open-chat { chatId }` message, exactly like the history dropdown. History is untouched. Separately, every insrc_present declaration opens the artifact in a NEW presentation/editor panel (panel key = presentKey = artifactId#hostPresentSeq) instead of replacing the content of the already-open panel — the presentation panel component itself is unchanged; only its multiplicity changes.

## Contents

1. [HLD context](#1-hld-context)
2. [Current behaviour (ground truth)](#2-current-behaviour-ground-truth)
3. [Contract details](#3-contract-details)
4. [Data model changes](#4-data-model-changes)
5. [Error paths and reconciliation](#5-error-paths-and-reconciliation)
6. [UX definition (chat panel active-chats dropdown)](#6-ux-definition-chat-panel-active-chats-dropdown)
7. [Test strategy](#7-test-strategy)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone
**Upstream intent:** triage classified this request as a `feature` routed to standalone design.story (run log `~/.insrc/workflow-runs/1bd72813bfa795f4/`, epicHash `1bd72813bfa795f4`); the four acceptance criteria in s7 are the authoritative statement of that intent, reconciled here against the original request: (ac1) active-chat dropdown in the chat panel tab header with red/yellow/green indicators, selecting opens that chat like history; (ac2) done chats purged from the active list after 30 min inactivity, history untouched; (ac3) each insrc_present opens a NEW tab per presented artifact, never overwrites an existing one; (ac4) history dropdown behavior unchanged.

## 2. Current behaviour (ground truth)

Two separate limitations, two separate owners:

**Chat attachment** belongs to the chat panel, not the docs-review host: `createChatPanelHost` holds `let session: ChatSession | undefined` and its own `TurnLifecycle`; the `open-chat` handler calls `turns.detach()`, `turns.invalidate()`, then `session = s` (`chat-panel.ts`, `turn-lifecycle.ts`). The docs-review singleton governs artifact display only — it does not decide which chat is attached or followed.

**Artifact overwrite** comes from the docs-review host keeping **exactly one shown document**, not a tab set:

- `DocsDocumentTab` (`vscode-plugin/src/chat/protocol.ts:46`) represents the markdown/HTML documents **within one artifact**; it has **no artifactId field**.
- The host (`docs-review-panel.ts`, `createDocsReviewHost` ~:1275, `show()` ~:2450) is a singleton holding ONE webview channel: `show()` reveals the existing panel when one exists, and within it `let opened: OpenDocument | undefined` plus a global `openSeq` mean `openDoc` replaces the shown document (`if (mySeq !== openSeq) return` discards earlier loads). So opening a new artifact via insrc_present replaces the current presentation panel's content — there is exactly one presentation panel.
- The presenter (`review-presenter.ts` ~:83-130) dedups opens per turn via `state.opened` keyed by artifactId; this *suppresses* duplicate opens, it does not implement tab replacement.
- Chat selection already has the exact message needed: the webview posts `{ type: 'open-chat', chatId }` (`protocol.ts`), and the panel handler starts with `if (typeof msg.chatId !== 'string') return`. History posts the same message (`chat-panel.ts:565-566` `postHistory` → `history-list`).

## 3. Contract details

**Surface level:** public

### 3.1 `session-store status tracking`

```typescript
SessionStore += { status: 'working'|'waiting-input'|'done', lastActivityAt: number } per chat;
SessionStore += pendingRequests: PersistedRequest[] per chat (full payload: QueuedApproval fields + batch decisions/grants, or selection options + pending handle; each with requestId, kind, resolved);
setStatus(id, status) called from the turn lifecycle and stream-event handlers:
  runTurn start                                       -> working
  approval/selection-request event arrives (mid-turn)-> waiting-input (any unresolved request)
  request resolved (decide / follow-up runTurn)       -> re-evaluate precedence (s5)
  terminal: finish / onError / stop, zero unresolved  -> done (always sets lastActivityAt)
  failed-resume                                       -> keeps last known active status (s5)
```

**Parameters:**
- `id: string` — Chat session id.
- `status: enum` — working | waiting-input | done.

**Returns:** `void` — Persisted with the session row (best-effort; save failure keeps in-memory status and retries on next transition) so a restored panel rebuilds the list.

**Preconditions:** session exists.
**Postconditions:** status + lastActivityAt persisted.

### 3.2 `activeChats()`

```typescript
store.activeChats(): { id, title, status, lastActivityAt }[]
  — working + waiting-input always included
  — done included only if (now - lastActivityAt) < 30 min
  — purge is computed at render time and by a 60 s panel timer; never destructive (list-level only)
```

**Returns:** `list` — Drives the dropdown. Done chats older than 30 min drop out of the list but remain in history.

**Postconditions:** pure read.

### 3.3 `active-chat dropdown (webview)`

```typescript
chrome gains #insrc-active segsel LEFT-aligned at the start of .chrome;
#insrc-history stays RIGHT-aligned in .chrome .right (margin-left:auto) — active chats left, history right;
active dropdown fed by `active-list` posts (same pattern as history-list);
options show a colored dot (red=waiting-input, yellow=working, green=done) + title;
selecting posts the EXISTING `open-chat { chatId }` message — handled by the same handler as history selection.
```

**Parameters:**
- `chatId: string` — Chat to open.

**Returns:** `void` — Identical open behavior to the history dropdown.

**Preconditions:** panel open.
**Postconditions:** chat window opened/switched.

### 3.4 `present -> new presentation/editor panel`

The presentation panel component is already built — nothing new is built inside it. What changes is multiplicity: today the host holds exactly one panel, so a new present replaces its content.

```typescript
review-presenter declared(): presentKey = `${artifactId}#${hostPresentSeq}` per unique matched doc, where
  `hostPresentSeq` is a monotonic counter on the SHARED presenter instance — uniqueness is required for the
  entire docs-review host lifetime, not per chat session (extension.ts builds one shared presenter whose opener
  calls docsReviewHost.openArtifact, and switching chats replaces `session = s` without replacing that host);
  deps.open({ artifactId, mdPath, presentKey });
docs-review host openArtifact({ ..., presentKey }): panels: Map<presentKey, channel> —
  a NEW presentKey always creates a NEW webview panel via deps.createPanel
  (viewType VIEW_TYPE, title `insrc docs review — <artifactId> #<hostPresentSeq>`,
   viewColumn per reviewColumn(), quiet per the caller, panel icon as today);
  an already-seen presentKey REVEALS its existing panel (preserveFocus when quiet).
  Panel dispose removes its map entry. Callers that omit presentKey keep the legacy single-panel show() path.
dedup is WITHIN one insrc_present declaration by resolved artifact identity (same doc twice in one call -> one panel). The old cross-declaration per-turn dedup (`state.opened.has(doc.id)` across all declared() calls in a turn, and its test 'the same document declared twice in a turn opens once') is REPLACED: each declaration now opens a new panel, so two declarations of the same doc in one turn open two panels.
```

**Parameters:**
- `presentKey: string` — Panel identity of this presentation.

**Returns:** `new presentation/editor panel per presented artifact per insrc_present call` — re-presenting the same artifact opens another panel; already-open panels keep their content and are never overwritten.

**Errors:** `notPending` (unchanged) when the declared name is ambiguous/unmatched.

**Preconditions:** doc pending + unique match.
**Postconditions:** one new panel per unique presented artifact per call; existing panels untouched.

### 3.5 `protocol additions`

```typescript
HostToWebview  += active-list { chats: ActiveChatEntry[] }
WebviewToHost  += (no new message) — open-chat { chatId } is reused for active-chat selection
ActiveChatEntry { id, title, status, lastActivityAt }
// presentKey is PANEL-level context (set at panel creation), NOT a protocol field:
// DocsDocumentTab / open-doc / docs-content / docs-decision / open-companion are UNCHANGED.
```

**Returns:** additive protocol messages (`active-list` only); history paths and all in-panel messages unchanged.
**Postconditions:** webview renders dots with theme CSS vars.

### 3.6 `presentKey plumbing — complete chain`

With panel-per-presentation, the change lands at PANEL CREATION, not inside the panel. The in-panel machinery (single `opened` + `openSeq`, `openDoc`, `renderContent`, the `rvPresented` strip, `rvTabs`) is reused UNCHANGED inside each panel, because each panel shows exactly one presentation:

1. `review-presenter.ts` `declared()`/`open()` — computes presentKey, passes it in `deps.open({ artifactId, mdPath, presentKey })`; dedup within one declaration by resolved artifact identity only (the cross-declaration per-turn `state.opened` dedup is removed; its unit test is updated to expect one panel per declaration).
2. `extension.ts` wiring — `DocsReviewHost.openArtifact` / `openArtifactFrom` gain an optional `presentKey` and forward it (openArtifactFrom currently forwards only kind/path/readOnly/reveal — presentKey is added to that list). The presenter opener at extension.ts:697 (`open: (target) => docsReviewHost?.openArtifact({ ...target, quiet: true })`) passes it through. All existing callers that omit presentKey compile and behave unchanged (legacy single-panel path).
3. `docs-review-panel.ts` host — `panels: Map<presentKey, channel>` replaces the singleton `channel` for presented docs: `openArtifact({ ..., presentKey })` creates a new panel per new presentKey (see 3.4) and opens the document in THAT panel; a repeated presentKey reveals the existing panel. `onDidDispose` removes the entry. No in-panel presentations map, no in-panel `selectedPresentKey`, no render-only-selected rule — there is nothing to conflict, since each panel renders only its own artifact. (This supersedes the earlier in-panel instance design from review rounds 1–9; per user direction the panel component stays as built and multiplicity moves to panel creation.)
4. `protocol.ts` — `open-doc` / `docs-content` / `docs-decision` / `open-companion` / `presented[]` are UNCHANGED: each panel is its own webview with its own `shown` document, so the existing per-panel comparisons are correct as-is.
5. `approval-queue.ts` — ADDED to the change inventory: it privately owns waiting/batches/ended/grants with no snapshot/restore (clear() returns only waiting requests). New contracts: `snapshot(): ApprovalQueueSnapshot` (queue order, per-request decisions, ended-turn membership, grants, already-consumed batches) and `restore(snapshot)`; round-trip tests. The persisted `pendingRequests` in the session store are written from this snapshot before `approvals.clear()` on chat switch, and restored into the queue on attach (keyed by original requestId).
6. `docs-review-comments.ts` — persisted drafts (`rvStored`/`rvSave`/`rvLoad`, keyed `all[shown.artifactId]` today) are keyed by the COMPOSITE `${presentKey}:${artifactId}` (presentKey = panel-level context set at panel creation): the existing panel has a 'Back to the list' control and open-doc accepts any listed artifact, so one panel can show different artifacts — a constant presentKey alone would load artifact A's drafts when artifact B opens in the same panel. In-memory per-webview state isolates sibling panels. Test: A->B->A navigation within one panel keeps drafts per artifact. `delivery/details-memory.ts` is NOT a change site.
7. Decision correlation: each panel's `docs-decision` round-trips within its own webview (unchanged); the approval itself is daemon-side per artifact, so sibling panels of the same artifact observe the same artifact state through the normal pending refresh.

**Per-panel behavior:** each presentation panel has its own channel, async load + `openSeq` guard, file watcher, reload, and decision behavior — all the existing code, instantiated per presentKey. Closing a panel (webview dispose) ends that presentation only; sibling panels are untouched.

## 4. Data model changes

### 4.1 `Session record (session-store)` — field-add

```typescript
session += { status?: 'working'|'waiting-input'|'done', lastActivityAt?: number, pendingRequests?: PersistedRequest[], observerCheckpoint?: ObserverCheckpoint }
```

Additive; old rows without them are not-active until a turn sets status. Save is best-effort (`trySaveSession` logs and keeps in-memory state on failure).

**Call sites:** `vscode-plugin/src/chat/session-store.ts`, `vscode-plugin/src/chat/session-file-store.ts`

### 4.2 `Docs-review host panels map (docs-review-panel)` — new field

```typescript
// host: panels: Map<presentKey, channel>   (presented docs; created per presentKey via deps.createPanel)
//       channel: channel | undefined       (legacy single-panel path for callers without presentKey — unchanged)
// panel title carries presentKey: `insrc docs review — <artifactId> #<hostPresentSeq>`
// panel-level context presentKey is handed to docs-review-comments for draft keying
tab (DocsDocumentTab) — UNCHANGED (no presentKey field needed; each panel has its own webview + shown doc)
```

**Call sites:** `vscode-plugin/src/chat/docs-review-panel.ts` (`createDocsReviewHost` ~:1275, `show()` ~:2450), `vscode-plugin/src/chat/docs-review-comments.ts`, `vscode-plugin/src/chat/approval-queue.ts`, `vscode-plugin/src/chat/session-output.ts`, `vscode-plugin/src/chat/review-presenter.ts`, `vscode-plugin/src/extension.ts`
### 4.3 `webview protocol + chrome CSS` — field-add

`active-list` / `ActiveChatEntry` only (open-doc / docs-content / docs-decision / open-companion unchanged — presentKey is panel-level, not message-level); `#insrc-active` segsel left-aligned at .chrome start, `#insrc-history` right-aligned in `.chrome .right`; `.status-dot.red/.yellow/.green` with theme CSS vars.

**Call sites:** `vscode-plugin/src/chat/protocol.ts`, `vscode-plugin/src/chat/chat-panel.ts:1086`, `vscode-plugin/src/chat/chat-panel.ts:1173`

## 5. Error paths and reconciliation

**Status precedence** (evaluated top-down on every event; the host retains multiple pending approval requests and selections, so any single resolution does not clear the state):

1. `waiting-input` (red) if **any** approval/selection request is unresolved — set immediately on request arrival (mid-turn), not at turn end;
2. else `working` (yellow) if a turn is running **or** a queued continuation exists (a turn-ended approval starts a follow-up `runTurn`; a selection decision likewise starts `runTurn('Selected: ...')` rather than `adapter.decide`);
3. else `done` (green) on an observed terminal event **with zero unresolved requests** — a terminal event with pending cards/selections does not flip to done.

- **Turn starts** — runTurn begin -> `working`.
- **Agent waits for user input (mid-turn)** — approval-request / selection-request stream events (`stream-events.ts` enqueueApproval / selection-request handlers update the waiting card on event arrival; in-turn resolution means the provider waits inside the running turn for `decide()`). Response: `waiting-input` **immediately on event arrival**. Each resolution (decide, or the follow-up runTurn for turn-ended approvals) re-evaluates the precedence: back to `working` only if another turn/continuation is live, `waiting-input` if other requests remain unresolved, else `done` at terminal. Ordinary conversational questions do NOT set waiting-input; only explicit approval/selection requests do.
- **Turn completes** — terminal event, nothing pending -> `done` + `lastActivityAt`; purged from the active list after 30 min inactivity.
- **Failure exits** — `reportError`/`sink.onError` (adapter/setup/lock failures, no onTerminal required) and `stop` (clears live refs, cancels iterator) -> `done` + `lastActivityAt`. **Failed resume/follow is NOT done**: the FollowSink cursor stays saved so a later follow retries; status keeps the last known active value and reconciliation (below) is what may later move it. `trySaveSession` failure -> log, keep in-memory status, retry on next transition. Status writes are last-writer-wins guarded by a monotonic `lastActivityAt` so an older observer tick cannot resurrect a stale status.
- **Panel restored** — store read on attach rebuilds the list from persisted fields, then one immediate reconciliation pass (below); purged entries stay out.
- **Request retention (data-compatibility)** — the persisted per-chat request record is the **full actionable payload**, not a bare id: for approvals, the complete `QueuedApproval` fields (`requestId`, `turnId`, `title`, `detail`, `blockKind`, `toolName`/`command` when present) plus batch decisions/grants; for selections, the complete normalized `SelectionRequestEvent` — `turnId`, `requestId`, `prompt`, `options`, `multi?` — plus resolution state (today `pendingSelections` keeps only `options`, and the renderer reads `meta.prompt` and `meta.multi` to choose checkbox vs radio, so dropping them loses the question and silently converts multi-select into single-select). It is persisted in the session store BEFORE `approvals.clear()` runs on chat switch (today the queue, batches and grants are dropped without outcome rows) and restored on attach — including terminal requests whose `LiveTurn` has been deleted, so an unresolved waiting chat shows its resolvable card again, not just a red dot. Supersession, rejection and timeout cleanup mark the request `resolved` with its outcome rather than deleting it mid-flight. Restored requests re-enter the approval queue keyed by their original `requestId`, so a decision answers the same request. **Restored decision transport:** `relayDecision` today bails when `turns.live === undefined` (detach clears live references and `follow` never reassigns `activeProvider`/`activeTurnId`), `adapter.resume` does not register resumed requests in `pendingByTurn`, and `adapter.decide` rejects unregistered requests and needs a live stdin. Change sites `chat-panel.ts` / `turn-lifecycle.ts` / `cli-adapter.ts`: on reattach or panel reload, restored requests are re-registered in `pendingByTurn`; a decision on a request whose original process stdin is gone is delivered as a **follow-up `runTurn` carrying the decision** (the same path turn-ended approvals already use) instead of writing to the dead stdin; if that delivery fails, the request is marked `resolved` with outcome `delivery-failed` and the observer's precedence keeps the chat accurate. **Observable delivery results:** today `StreamAdapter.decide` returns void, consumes the pending request before delivery, and silently no-ops on missing stdin, and the spawner's write also returns void while swallowing write errors — a lost stdin is indistinguishable from success. Change sites add a delivery result through the boundaries: spawner write returns success/failure (write errors propagate), `adapter.decide` returns `{ delivered: boolean }` (or throws on write failure) instead of consuming-then-silent-return, and `relayDecision` correlates that result onto the persisted request — a silent no-op after transport inspection persists `delivery-failed`, never a successful resolution. Races after transport inspection are covered by the monotonic lastActivityAt guard. Process state is triaged before choosing the transport: **live writable** -> existing in-turn `decide()`; **exited** (pid verified dead) -> follow-up `runTurn` resuming the same native session context with the persisted decision; **live unwritable** (the resume handle exposes kill/stop but no write transport, and the CLI may still be alive holding the session lease — `start()` would then wait behind that lease up to the 600 s default and kill the very process waiting for its decision) -> explicit recovery sequence: **first capture the native session handle durably before requests become actionable** — `keepNativeSession` today assigns `ChatSession.nativeSessionId` only on a `done` event, and a first turn awaiting an in-turn request may never have emitted one, so the continuation would silently start a fresh session; the native id is therefore persisted from the provider output/checkpoint (validated against the segment) before the process is stopped, then fed into the follow-up `runTurn`'s `resume`; if the handle cannot be recovered, that failure is recorded on the persisted request (`resolved` + outcome `session-lost`) and the chat reconciles via the observer. Stop the original process and verify exit, then start the continuation carrying the decision, and correlate delivery success/failure back onto the persisted request (`resolved` + outcome).
- **Detached sessions (lossless background observation)** — chat switching calls `turns.detach()` + `turns.invalidate()`; for file-backed turns detach stops event consumption while the CLI keeps writing the session file, and session output is native CLI lines normalized through a stateful mapper (`mapLine`, with `selectionBuffer` spanning chunks and `selectionSeq`-generated ids) — a fixed-size tail is lossy: a request can precede the window and markers can split across chunks. The observer therefore does NOT tail-scan; it follows the session-output file with its **own independent cursor** (separate from the transcript-follow cursor and from the turn/generation identity carried by `LiveTurn`), ingesting every unread line through the same provider-normalized mapper each tick, bounded by a per-tick line budget that pauses (never discards) at the limit. Requests are ingested and persisted **before** any completion/death transition is applied in the same tick, so a request arriving with the terminal event still flips the chat to `waiting-input`. Transitions per tick, in order: (1) ingest new events -> update `pendingRequests`; (2) any request unresolved -> `waiting-input` (a turn-ended approval stays red even if the provider process has exited — process death alone never overrides an unresolved request); (3) else if the ingestion is **caught up** (end-of-segment reached — the own-cursor has consumed all currently written output; the reader drains available chunks even after `finished()`) AND (terminal event ingested or pid verified dead) -> `done` + `lastActivityAt`; budget exhaustion (more unread output than the per-tick line budget) retains a NON-terminal status and continues next tick — it never reaches the death transition, so a dead process with an unresolved request beyond the first tick's budget stays non-terminal until the cursor reaches it; (4) observer read/ingest failure -> skip the tick, keep last known status (never guess). The extension runs this **60 s observer** (same timer as the purge recompute) plus one pass on attach. `done` is reserved for observed completion or verified process death with zero unresolved requests; verified underlying activity recovers the entry to `working`/`waiting-input`. **Retention tied to unread cursors:** `session-output` keeps only current + previous generations (`beginTurn` renames current->previous; older throws `SegmentGone`). The observer/follow cursors therefore register with the output writer, and rollover discards a generation only when NO registered cursor points into it — retention is tied to unread checkpoints, so a budget-limited or reloaded observer can lag but never loses request lines. **SegmentGone recovery:** a cursor that hits `SegmentGone` resets to the oldest retained generation and replays, deduping against persisted `pendingRequests` by requestId (already-resolved requests are skipped). Test: multiple rollovers before the observer catches up.

**Decoder recovery for BOTH cursors:** request identity must not depend on a reader-local counter. Each cursor — the observer's independent cursor AND the normal transcript-follow cursor — is paired with its own decoder state; both persist a checkpoint (segment identity + cursor offset + `selectionBuffer` fragments + `selectionSeq`, because `mapLine` is stateful and generates `sel-${turnId}-${seq}` ids and `resume` today starts with an empty `TurnState`, which reuses `sel-t-0` on reattach). On init each cursor restores its checkpoint or replays from the segment start with deterministic request ids and dedup of already-resolved requests, so the follow cursor and the observer always agree on request identity. Resuming an offset without its parser state could split a selection marker or reuse a selection id; `pendingRequests` alone cannot reconstruct an unfinished marker (resume today starts with an empty `TurnState`). Tests: reload between marker fragments, and reload after a prior selection. The daemon's `SessionInfo.idleSeconds` is not used — daemon sessions are its own randomUUID records with no mapping to extension chat sessions.
- **Observation failure vs real terminal (provider normalization)** — `cli-adapter.resume` currently catches ordinary output-read failures and yields an `error` event, which `turn-lifecycle.follow` treats as terminal (`onEnd('ended')`, cursor cleared); only a thrown exception reaches `onEnd('failed')`, and `SegmentGone` returns normally. Change site: `cli-adapter.ts` normalizes output-read failures into a distinct **observation-failure** outcome through the FollowSink boundary (alongside `ended`/`failed`), which keeps the saved cursor (retryable) and the last known active status — explicitly NOT `done` — distinguishing it from provider completion or verified process death.
- **Detached-chat presentations** — today `presentDeclared` is only called from the live/follow event sinks in chat-panel.ts; after `detach` the run loop breaks, and `handleInsrcPresent` only reads pending artifacts without dispatching ("changes nothing"). So a detached chat's insrc_present would never open its panel. Fix: the 60 s observer that already ingests detached session output ALSO dispatches presentation declarations to the shared presenter (same `deps.open({ artifactId, mdPath, presentKey })` path). Each declaration carries a persisted `declarationId` (checkpointed with the observer checkpoint), so observer ingestion and later transcript replay dedup by declarationId — each declaration opens exactly one panel, separate declarations open separate panels. Integration test: detached chat presents an artifact -> exactly one new panel; replay after reattach does not re-open it.
- **Concurrent chats** — multiple working/waiting sessions all listed with their own dots; selecting one posts `open-chat { chatId }` (history path reused).
- **Same artifact presented twice** — presentKey differs per declaration -> a NEW presentation panel each time; already-open panels keep their content.
- **Ambiguous/notPending name** — matches != 1 -> notPending, no panel (unchanged).
- **Session-cap eviction protection** — the file store caps at `maxSessions: 200` and `evictBeyondCap` removes head/rows AND output files via onEvict -> chatOutput.remove(id) without checking active status or unread cursors. Eviction must EXCLUDE sessions whose persisted status is working/waiting-input, that have unresolved pendingRequests, or that have registered unread observer/follow cursors — an active or waiting chat never disappears with its unread requests; done chats are evictable in savedAt order as today, and the active-list purge stays list-level only. Regression test: capped store with an active session at the cap.
- **Purge timer fires** — 60 s recompute of age; done > 30 min leaves the list on next render; history unaffected.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| old session rows without status | excluded from active list until a turn sets status; history intact |
| same doc twice in ONE insrc_present call | deduped within the declaration; one panel |
| same doc in TWO insrc_present calls (same turn) | two panels — the old cross-declaration per-turn dedup is replaced |
| same artifact presented from two different chat sessions | distinct presentKeys (host-wide counter); two separate panels, no collision |
| done chat gets a new turn | reappears as working/waiting; purge timer resets |
| panel closed mid-turn, reopened | status from store reflected, then reconciliation pass |
| chat detached while agent runs | observer own-cursor ingest (requests before transitions; death->done only when caught up): unresolved -> waiting-input; caught-up terminal/dead pid with zero unresolved -> done; budget exhaustion -> non-terminal, continue next tick; read failure -> keep last status |
| approval request arrives mid-turn | red immediately; resolve -> re-evaluate precedence (working if a continuation runs, waiting-input if other requests pending, done only at terminal with none pending) |
| failed resume/follow | keeps last known active status (cursor retained for retry); only observed completion or verified process death sets done |

**Invariants to preserve**

- History dropdown byte-identical; active dropdown additive. [[c1]]
- Purge is list-level only; session rows/history never deleted by it. [[c2]]
- Existing presentation panels never overwritten by a present. [[c3]]
- Presenter unique-match/notPending semantics unchanged; dedup is per-declaration by resolved artifact identity (the cross-declaration per-turn dedup is deliberately replaced — ac3 requires a new panel per insrc_present call). [[c3]]
- Callers that omit presentKey keep the exact legacy single-document behavior. [[c4]]

## 6. UX definition (chat panel active-chats dropdown)

**Artifact-to-panel cardinality and ownership:** one artifact maps to N presentation/editor panels (N = number of insrc_present declarations that matched it). Identity scope: `presentKey = artifactId#hostPresentSeq`, unique for the entire docs-review host lifetime via the shared presenter's host-wide monotonic counter (NOT per chat session — the host outlives chat switches). Ownership/lifetime: each panel is a VS Code webview panel in the editor area, titled `insrc docs review — <artifactId> #<n>`, owned by the docs-review host's `panels` map; closing a panel (webview dispose) removes only that entry. Re-presenting the same artifact with a new presentKey opens a sibling panel; it never replaces an open one. Inside each panel the existing single-document machinery (presented strip, "documents of this artifact" companion tablist) works unchanged, scoped to that panel's artifact.



The Adaptive Cards UX definition is persisted as `uxDefinition` in this artifact's JSON body (`.insrc/artifacts/LLD-1bd72813bfa795f4-S001.json`), rendered as its companion page via `renderUxCompanion` and linked from `body.companions` (never inlined). The presentations panel needed no mock — the panel component is reused as built and only its multiplicity changes — so the single mock covers the chat panel:
- [ux-mock-chat-panel.html](ux-mock-chat-panel.html) — **component mock 1: the full chat panel webview, matching the current layout** (`renderShell`, chat-panel.ts:1545 — `body.insrc-term > .box` filling the pane edge-to-edge: `.chrome` header → `#insrc-older` pager → `#insrc-term` transcript (single scroll region, marker rows) → `#insrc-progress` live band → `.inputbar` (❯ send/stop + 2-line textarea) → `.statusbar` (attach, `edits` mode segsel, bottom-right `.runctl` provider·model + effort gauge)). The only addition: the NEW `#insrc-active` chip LEFT-aligned at the start of `.chrome` (`.histchip`-style chip, status-dot glyph, segsel fed by `active-list`, entries with red/yellow/green dots + "[provider] title", selecting posts the same `open-chat { chatId }`); the unchanged `#insrc-history` chip stays RIGHT-aligned in `.chrome .right`.

The definition uses only the supported element subset (TextBlock / Container / ColumnSet / Column / Input.Text / Input.ChoiceSet), with a `narrative` and a `description` on every element.

## 7. Test strategy

**Test framework:** `vscode-plugin existing harness (tsx node:test + webview mocks); fake timers for purge and the 60 s observer. Criterion source: triage storySpec (run log `~/.insrc/workflow-runs/1bd72813bfa795f4/`); ac1-ac4 inline in s1 are authoritative.`

**Test levels**

- **unit** — status precedence (multiple unresolved requests keep waiting-input; turn-ended approval follow-up -> working; terminal with pending cards stays not-done); mid-turn waiting-input on approval/selection events; pendingRequests persistence + restoration with requestId/resolved (incl. chats whose LiveTurn cleared); failure exits (onError/stop -> done + lastActivityAt; failed-resume keeps last active status); observation-failure outcome via cli-adapter normalization (cursor retained, not terminal, not done); trySaveSession failure keeps in-memory status; monotonic lastActivityAt guard; observer follows session-output with its own independent cursor (lossless, not a fixed tail), requests ingested before completion/death transitions, caught-up required before death->done (dead process with unresolved request beyond first budget stays non-terminal), budget exhaustion non-terminal; restored decision transport: re-register restored requests in pendingByTurn on reattach/reload, dead-stdin decision delivered as follow-up runTurn, delivery failure -> resolved with outcome delivery-failed; delivery tests after detach/reattach and reload; multi-select restoration after LiveTurn cleared (prompt + multi preserved); observer + follow decoder checkpoints restored independently (identity agrees after a resolved selection and between marker fragments); native-session id captured before first-turn request, reload, then live-unwritable recovery with no preceding done event (continuation reuses the native session; unrecoverable handle -> session-lost outcome); activeChats filter + 30-min purge; presentKey host-wide uniqueness (shared presenter counter; two chat sessions presenting the same artifact get distinct keys) + per-declaration dedup (two declarations of one doc in a turn -> two panels; old cross-declaration dedup test updated); host panels map (new panel per presentKey via deps.createPanel with presentKey in the title, reveal on repeat presentKey, dispose removes the entry, legacy single-panel path unchanged when presentKey omitted); full presentKey chain (presenter -> extension.ts openArtifact/openArtifactFrom -> host panels map); docs-review-comments persisted drafts keyed by composite presentKey:artifactId (panel navigation can switch artifacts within a panel; A->B->A draft isolation test); in-panel protocol asserted UNCHANGED (DocsDocumentTab keeps title/type/relPath — no presentKey; open-doc/docs-content shapes unchanged); active-list/ActiveChatEntry shapes only; presentKey is tested on presenter/openArtifact/panel creation (title + panels map), not on protocol messages.
  - Subjects: `vscode-plugin/src/chat/session-store.ts`, `vscode-plugin/src/chat/stream-events.ts`, `vscode-plugin/src/chat/turn-lifecycle.ts`, `vscode-plugin/src/chat/session-output.ts`, `vscode-plugin/src/chat/cli-adapter.ts`, `vscode-plugin/src/chat/review-presenter.ts`, `vscode-plugin/src/chat/docs-review-panel.ts`, `vscode-plugin/src/chat/docs-review-comments.ts`, `vscode-plugin/src/chat/protocol.ts`, `vscode-plugin/src/extension.ts`
  - Fixtures: `session-store fake`, `pending-doc list fake`, `stream-event fake`, `LiveTurn record fake with pid`"
- **contract** — active-list/ActiveChatEntry shapes; open-chat { chatId } reused for active selection; in-panel document protocol asserted UNCHANGED (DocsDocumentTab keeps title/type/relPath — no presentKey); presentKey asserted on presenter/openArtifact/panel creation (panel title + panels map); presenter declared() outcome otherwise unchanged + presentKey plumbed end-to-end; dropdown render with dots.
  - Subjects: `vscode-plugin/src/chat/protocol.ts`, `vscode-plugin/src/chat/chat-panel.ts`, `vscode-plugin/src/chat/review-presenter.ts`
  - Fixtures: `extend existing chat-panel/presenter tests`
- **integration** — webview-level: both dropdowns render; active-list updates on status change and on mid-turn approval request; selecting an active chat opens it like history; double present -> two editor panels with the first panel's content unchanged; closing one panel disposes only its own map entry; fake-clock purge removes from list, keeps history; 60 s observer with fake LiveTurn/session-output reconciles a detached session (terminal tail -> done, new request -> waiting-input, dead pid -> done, read failure -> unchanged).
  - Subjects: `vscode-plugin/src/chat/chat-panel.ts`, `vscode-plugin/src/chat/docs-review-panel.ts`
  - Fixtures: `webview harness with fake store + fake timers`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | active-chat dropdown in tab header with red/yellow/green dots; selecting posts open-chat { chatId } and opens that chat like history. Tests: unit activeChats + transitions; contract; integration render+open. |
| `ac2` | done chats purged from active list after 30 min inactivity; history untouched. Tests: unit purge with fake clock; integration timer + observer. |
| `ac3` | each insrc_present opens a NEW presentation/editor panel per artifact, never overwrites an open panel. Tests: unit panels map + chain; integration double-present -> two panels. |
| `ac4` | history dropdown unchanged. Tests: existing history tests unmodified; open-chat handler untouched. |

## 8. Alternatives considered

### 8.1 a1: Daemon-tracked status

Daemon tracks status per session; plugin lists from daemon. Extend SessionInfo; plugin polls. **Rejected:** over-scoped; daemon already exposes idleSeconds, used only for reconciliation.

### 8.2 a2: Extension-local status only

Plugin derives status from turn lifecycle in session-store. **Rejected alone:** needed the panel-multiplicity fix too.

### 8.3 a3: Extension-local status + panel-per-presentation (presentKey-keyed panels map) — **CHOSEN**

a2 plus one new webview panel per presentKey at the docs-review host; the panel component itself is unchanged and non-present callers keep the legacy single-panel path.

## 9. References

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:565-566` — "postHistory posts history-list from deps.store.list(); postSelection posts open-chat { chatId } — the message the active dropdown reuses."
- **[[c2]]** `code` `vscode-plugin/src/chat/session-store.ts` — "Session store backs history; gains status/lastActivityAt; purge is list-level only."
- **[[c3]]** `code` `vscode-plugin/src/chat/review-presenter.ts:83-130` — "declared()/open() dedup per turn via state.opened and call deps.open({ artifactId, mdPath }) — suppression, not tab replacement."
- **[[c4]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:1495` — "openDoc with single `opened` + global openSeq (`if (mySeq !== openSeq) return`); DocsDocumentTab has no artifactId — the real overwrite seam."
- **[[c5]]** `code` `vscode-plugin/src/chat/protocol.ts` — "open-chat { chatId } already exists and is reused; active-list/ActiveChatEntry are the only protocol additions; DocsDocumentTab is unchanged (presentKey is panel-level)."
- **[[c6]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts` — "LiveTurn carries cursor, ownerHostPid, pid, startedAt; detach() stops event consumption while the CLI keeps writing; failed resume retains the cursor — the reconciliation and failed-follow evidence."
- **[[c7]]** `code` `vscode-plugin/src/chat/session-output.ts` — "session file tail read by the 60 s observer for terminal and approval/selection events of detached chats."
- **[[c8]]** `code` `vscode-plugin/src/chat/stream-events.ts` — "enqueueApproval / selection-request update waiting-card state on event arrival; turn-ended approvals start a follow-up runTurn — the mid-turn waiting-input trigger and precedence input."
- **[[c9]]** `code` `vscode-plugin/src/chat/docs-review-comments.ts:254-260` — "rvSave/rvLoad key drafts by shown.artifactId today — rekeyed by composite presentKey:artifactId (panel-level presentKey + shown artifact)."
- **[[c10]]** `code` `vscode-plugin/src/chat/protocol.ts:211-272` — "presented[]/rvPresented and docs-decision/open-companion message shapes — asserted UNCHANGED; presentKey is panel-level (presenter/openArtifact/panel creation), not a message field."

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 2 could not be verified · 10 hold** · template `design-spec` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-11-03T19:38:21.749Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| coverage-of-intent | The four inline acceptance criteria completely reproduce upstream intent and non-goals. | The cited workflow JSONL contains step execution events, but no original request or storySpec. Artifact metadata confirms standalone feature routing. The analyzer returned no upstream evidence. Coverage of omitted upstream requirements therefore cannot be established. [files: /Users/subhagho/.insrc/workflow-runs/1bd72813bfa795f4/design.story-wf-1793722967234-8apdy1.jsonl, .insrc/artifacts/LLD-1bd72813bfa795f4-S001.json] | Include or link the original request and triage storySpec, including non-goals. |
| coverage-of-intent | The generated UX companion renders consistently with the proposed chat-panel layout. | The companion reference resolves to generated HTML containing the active/history columns, three status-color classes and existing chat regions. Browser inspection failed with 'The browser access host is unavailable'; rendered alignment, clipping and readability were not verified. [files: .insrc/artifacts/LLD-1bd72813bfa795f4-S001.json, docs/standalone/multiple-concurrent-chats-chat-panel-active-E202611031bd72813/S001/ux-mock-chat-panel.html, vscode-plugin/src/chat/chat-panel.ts] | Visually verify the generated companion at representative chat-panel widths and correct/regenerate any inconsistent layout. |
