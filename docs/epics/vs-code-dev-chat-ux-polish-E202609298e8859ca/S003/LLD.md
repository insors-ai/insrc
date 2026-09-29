<!-- insrc:artifact LLD-8e8859ca0ca83612-s3 -->

# LLD: E202609298e8859ca:S003

## Summary

**Epic:** `vs-code-dev-chat-ux-polish`
**HLD base run:** `wf-1790676258005-32feqt`
**HLD effective hash:** `f5c70630aa71...`

S003 makes the in-chat permission card settle into a decided state: once the user approves or rejects, the card shows the outcome (green approved / red rejected) and drops its approve/reject buttons, the host records a persisted permission-outcome row so the decision survives reload, and the synthesized 'Approved: please proceed…' grant prompt no longer appears as a fake user line — while the underlying resume turn that actually conveys the grant runs exactly as today. All additive within the one dev-chat render pipeline (P2 over the existing approval-request, instantiated via a P1 persisted row), behind insrc.chat.enabled.

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

## 1. HLD context

> See **HLD-8e8859ca0ca83612** § 2. Framework summary

**Rollout phase:** Phase B — Approval-card resolved outcome
**Owns:** `undefined` (undefined)
**Consumes:** `undefined` (undefined)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: tool-output row (S001) — out of scope. — owns `sc1`
- `s2`: input row + width (S002) — out of scope.
- `s4`: selection widget (S004) — out of scope. — owns `sc3`

## 2. Contract details

**Surface level:** internal

### 2.1 `RowKind (render-registry.ts) — additive member 'permission-outcome'`

```typescript
type RowKind = /* existing */ | 'permission-outcome'
```

**Returns:** `type` — The discriminator gains a 'permission-outcome' member for the persisted resolved-outcome row (P1). Existing members unchanged (k1).

**Postconditions:**
- A row can be typed as the resolved permission outcome without reshaping any existing kind.

### 2.2 `PermissionOutcomeRowView (render-registry.ts RowViewModel) — additive view`

```typescript
interface PermissionOutcomeRowView { readonly kind: 'permission-outcome'; readonly toolName: string; readonly decision: 'approved' | 'rejected' }
```

**Returns:** `type` — The view payload the 'permission-outcome' renderer draws (resolved chip: green approved / red rejected, tool name).

**Postconditions:**
- toViewModel can map both the host-emitted live outcome and the replayed TranscriptEntry to this one view.

### 2.3 `toViewModel (render-registry.ts) — additive branch`

```typescript
toViewModel(entry: TranscriptEntry | TurnEvent): RowViewModel
```

**Returns:** `RowViewModel` — A new branch maps a {kind:'permission-outcome'} TranscriptEntry (replay) AND the host-emitted live outcome to the same PermissionOutcomeRowView. Existing branches unchanged.

**Postconditions:**
- Live outcome and its reloaded twin render identically.

### 2.4 `register('permission-outcome') (render-registry.ts) — additive renderer`

```typescript
register(kind: 'permission-outcome', r: RowRenderer): void
```

**Returns:** `void` — Draws the resolved outcome chip (green approved / red rejected) reusing the existing .insrc-approval__btn--approve/--deny tints; textContent/className only (k1/k3).

**Postconditions:**
- A decided permission renders as a non-actionable resolved chip.

### 2.5 `register('approval') decision path (render-registry.ts:315-330) — resolved-state extension`

```typescript
// approve/deny click handler: mark card resolved + remove .insrc-approval__actions, then DEC(rid,decision)
```

**Returns:** `void` — On click, the live card gains a resolved (approved/rejected) class and its action buttons are removed before/as it posts the decision via DEC — ac1. The card stays live-only (never persisted).

**Preconditions:**
- A pending approval card is rendered (chat-panel.ts:412).

**Postconditions:**
- ac1: the decided card shows the outcome and offers no buttons; the pending card never persists (ac4).

### 2.6 `runTurn (chat-panel.ts:527) — optional suppress-echo flag`

```typescript
async function runTurn(text: unknown, allowedTools?: readonly string[], opts?: { readonly suppressEcho?: boolean }): Promise<void>
```

**Parameters:**
- `opts.suppressEcho: boolean | undefined` _(optional)_ — When true, runTurn skips the visible user-row echo (chat-panel.ts:543) while still running the resume turn + conveying the grant. Passed only by the synthesized grant re-runs; absent (default) for every real user turn.

**Returns:** `Promise<void>` — Runs the turn exactly as today; only the user-row echo post is gated by suppressEcho. Signature is backward-compatible (k1).

**Postconditions:**
- ac2: the synthesized grant prompt posts no user-row; ac3/k4: the resume turn + tool grant are byte-identical.

### 2.7 `permission-decision handler (chat-panel.ts:745-796) — record outcome + suppress echo`

```typescript
case 'permission-decision': { /* record permission-outcome entry; grant re-runs pass {suppressEcho:true} */ }
```

**Returns:** `void` — On approve/deny of a pending tool-gate, the host pushes a {kind:'permission-outcome',toolName,decision} TranscriptEntry (persisted, and emitted live), and the grant re-runs at :779/:782 call runTurn(..., { suppressEcho: true }). The dir-block informational branch, the codex in-turn decide() relay, pendingPerms, and the approval-request/permission-decision messages are UNCHANGED.

**Preconditions:**
- A pending permission decision arrives for a known requestId.

**Postconditions:**
- The decided outcome is persisted (ac4/k2) and the grant echo is suppressed (ac2) without altering the grant (ac3/k4).

## 3. Data model changes

### 3.1 `TranscriptEntry (session-store.ts)` — field-add

Add a plain-serialisable discriminated-union variant { kind: 'permission-outcome'; toolName: string; decision: 'approved' | 'rejected' } (mirroring S001's tool-result variant). It round-trips createInMemoryChatSessionStore + createMementoChatSessionStore unchanged. The pending approval-request event is NOT persisted (markerFor stays null); only the decided outcome enters the durable transcript.

```
TranscriptEntry = /* existing */ | { kind: 'permission-outcome'; toolName: string; decision: 'approved' | 'rejected' }
```

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/markers.ts`
- `vscode-plugin/src/chat/render-registry.ts`

### 3.2 `markerFor (markers.ts:43-85)` — field-add

Add a case mapping the host-emitted permission-outcome to its persisted marker/entry (explicit persistence mapping, k2). The pending approval-request stays UNMAPPED -> default null (live-only). Preserve the exhaustive-switch never-default.

```
markerFor(event): MarkerLine | null  // + permission-outcome case; approval-request stays -> null
```

**Call sites:**
- `vscode-plugin/src/chat/markers.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | S003 owns sc2 and instantiates it exactly per its interfaceSketch: additive RowKind 'permission-outcome' + PermissionOutcomeRowView + a plain-serialisable TranscriptEntry variant + a toViewModel branch + a markerFor case; the pending approval-request TurnEvent stays markerFor->null (live-only), and the existing permission-decision WebviewToHost message + the shipped resume/grant path are consumed UNCHANGED (k4). The resolved-card DOM state + the runTurn suppress-echo flag realize the 'show the decided state without altering the underlying action' half of the contract. |

## 5. Error paths

**Error cases**

- **A permission-decision arrives for a requestId that has no pending entry (already decided, stale, or unknown).** (recoverable)
  - Detection: The permission-decision handler looks up pendingPerms.get(msg.requestId) and finds undefined (chat-panel.ts:754).
  - Response: It falls through to the existing codex/in-turn decide() relay (chat-panel.ts:787-794), which no-ops on an unknown/stale/dead requestId. No permission-outcome entry is recorded for a decision with no matching pending gate.
  - User impact: A late or duplicate click is a safe no-op; no spurious outcome row and no double grant.
- **The persisted transcript is loaded from an older (pre-S003) session with no permission-outcome entries.** (recoverable)
  - Detection: The store's schema validation accepts the union without the new variant (additive/optional); replay encounters no permission-outcome entries.
  - Response: toViewModel + the renderer are never invoked for the new kind; the transcript replays exactly as before (no migration needed).
  - User impact: Older chats load unchanged; no error.
- **A permission-outcome is recorded but its renderer/toViewModel branch is somehow unmatched (defensive: a malformed decision value).** (recoverable)
  - Detection: renderRow falls back to the 'fallback' renderer for any kind with no registered renderer (render-registry.ts:90/168); toViewModel's default path handles an unrecognised shape.
  - Response: The row renders via the fallback (plain text) rather than throwing; the exhaustive markerFor never-default is preserved by adding the explicit case.
  - User impact: Worst case a decided outcome shows as a plain line instead of a chip; never a crash or a lost grant.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A dir-block permission decision is approved (blockKind === 'dir-block'). | The existing informational-message branch (chat-panel.ts:764-775) runs UNCHANGED (no runTurn, no grant); S003 records the permission-outcome (approved) but suppresses no echo there because that branch never posted a user-row echo. The informational assistant message still appears. |
| A permission request is DENIED. | No resume turn runs today (deny drops); S003 records a permission-outcome with decision:'rejected' and the card resolves red with buttons removed. No grant, no echo. |
| A tool-gate approve with a concrete command vs the tool-name fallback (chat-panel.ts:779 vs :782). | Both grant re-runs pass { suppressEcho: true } so neither posts a user-row echo, while both still run the resume turn + grant. The recorded outcome is identical (approved). |
| The live approval card is decided, then the session is reloaded. | The pending card (live-only, markerFor->null) does not reappear; the persisted permission-outcome replays as a non-actionable resolved chip (ac4). |
| The same requestId is clicked twice quickly. | pendingPerms.delete on the first decision (chat-panel.ts:756) means the second click finds no pending entry -> the stale-relay no-op path; exactly one outcome recorded, one grant. |

**Invariants to preserve**

- The pending approval-request TurnEvent stays LIVE-ONLY: never persisted (markerFor->null default), appended un-keyed (chat-panel.ts:412), so it never enters the durable transcript (k2/ac4). [[c1]]
- The shipped Approve grant path is byte-identical: the resume turn (runTurn at chat-panel.ts:779/:782), the pendingPerms correlation, the [toolName] allow, and the permission-decision message are UNCHANGED; only the user-row echo post (chat-panel.ts:543) is gated by the new optional suppressEcho flag (k4/lc1/ac3). [[c7]]
- The existing codex/in-turn decide() relay (chat-panel.ts:787-794) and the dir-block informational branch (chat-panel.ts:764-775) are preserved unchanged for requests with no pending tool-gate entry. [[c1]]
- The persisted permission-outcome TranscriptEntry is plain-serialisable and round-trips both stores, mirroring S001's tool-result variant. [[c1]]

## 6. Test strategy

**Test framework:** `node:test (tsx --test) — colocated vscode-plugin/src/chat/__tests__/chat-panel.test.ts (eval'd *WebviewSource + fakeChannel/scriptedAdapter harness), session-store.test.ts (TranscriptEntry round-trip), and markers/render-registry unit tests; live provider turns gated behind INSRC_LIVE_TESTS.`

**Test levels**

- **unit** — Prove the resolved-card render + the persisted-outcome row (P1) render/replay correctly.
  - Subjects: `The approval renderer's decision path: on approve/deny click the card gains a resolved (approved/rejected) class and its .insrc-approval__actions buttons are removed (ac1).`, `register('permission-outcome') draws a resolved chip (green approved / red rejected + tool name) reusing the __btn--approve/--deny tints; textContent/className only.`, `toViewModel maps BOTH a {kind:'permission-outcome'} TranscriptEntry (replay) and the host-emitted live outcome to the same PermissionOutcomeRowView.`, `markerFor returns the persisted permission-outcome mapping and STILL returns null for the pending approval-request (never-default preserved).`
- **unit** — Prove the persisted outcome round-trips both stores and the pending card never persists (ac4/k2).
  - Subjects: `A {kind:'permission-outcome',toolName,decision} TranscriptEntry round-trips createInMemoryChatSessionStore AND createMementoChatSessionStore intact.`, `A session-restored replay containing a permission-outcome renders a non-actionable resolved chip; the pending card does NOT reappear.`, `An older transcript with no permission-outcome entries replays unchanged.`
- **unit** — Prove the host records the outcome and suppresses the grant echo while preserving the grant (ac2/ac3/k4).
  - Subjects: `approve WITH command: host pushes permission-outcome(approved) AND the grant re-run posts NO user-row echo (suppressEcho) while still issuing the resume turn with [toolName].`, `tool-name fallback grant (no command): records approved + suppresses echo + still resumes.`, `deny: records permission-outcome(rejected), no resume turn, no echo.`, `a NORMAL user turn still posts its user-row echo (suppressEcho off by default).`, `unknown/stale requestId records no outcome and falls through to the codex decide() relay unchanged.`, `dir-block approve still posts its informational message unchanged and records an approved outcome without a grant.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `approval renderer marks the card resolved (green/red) and removes .insrc-approval__actions`, `register('permission-outcome') draws the resolved non-actionable chip` |
| `ac2` | `approve WITH command posts zero user-row echoes (suppressEcho)`, `tool-name fallback grant posts no echo`, `a normal user turn still posts its echo` |
| `ac3` | `approve WITH command still runs the resume turn with [toolName]`, `dir-block + codex decide() relay unchanged` |
| `ac4` | `permission-outcome round-trips both stores`, `session-restored replay shows the resolved chip; the pending card does not reappear`, `markerFor keeps the pending approval-request -> null` |

## 7. Migration

**State before:** A pending permission request renders a LIVE-ONLY .insrc-approval card (render-registry.ts:315-330) whose approve/deny buttons post {type:'permission-decision'} (chat-panel.ts:361); the card is appended un-keyed on approval-request (chat-panel.ts:412) and never persists. On Approve of a pending tool-gate the host re-runs via runTurn (chat-panel.ts:779/:782); runTurn posts a VISIBLE user-row echo for EVERY turn (chat-panel.ts:543). So today the card leaves its live buttons after a decision, the decision is not recorded, and the synthesized grant prompt shows as a fake user line.

**State after:** On approve/deny the live card resolves (approved/rejected class, actions removed, ac1); the host records a plain-serialisable permission-outcome TranscriptEntry (persisted + emitted live) that replays as a non-actionable chip while the pending card never reappears (ac4/k2); the two grant re-runs pass runTurn { suppressEcho: true } so no user-row echo is posted (ac2) while the resume turn + grant run byte-identically (ac3/k4). Additive throughout.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the 'permission-outcome' member to RowKind and the PermissionOutcomeRowView payload in render-registry.ts. — ↩ rollbackable
2. Add the plain-serialisable { kind:'permission-outcome'; toolName; decision } variant to the TranscriptEntry union in session-store.ts. — ↩ rollbackable
3. Add the toViewModel branch and register the 'permission-outcome' renderer in both the module copy and the eval'd renderRegistryWebviewSource, keeping the parity test green. — ↩ rollbackable
4. Add the markers.ts markerFor case for the persisted permission-outcome; leave the pending approval-request unmapped (-> null). — ↩ rollbackable
5. Extend the approval renderer's click path to set a resolved class + remove .insrc-approval__actions before/as it calls DEC (ac1). — ↩ rollbackable
6. Add the optional { suppressEcho?: boolean } parameter to runTurn and gate the user-row echo post on it (default off). — ↩ rollbackable
7. In the permission-decision handler, on approve AND deny push the permission-outcome TranscriptEntry (emit live) and pass { suppressEcho: true } to the two grant re-runs. Leave the dir-block + codex relay unchanged. — ↩ rollbackable
8. Add/extend the *WebviewSource + session-store + markers tests per the test strategy. — ↩ rollbackable

**Backward compat:** runTurn's new third parameter is optional and defaults to today's behaviour, so its existing call-sites + signature stay backward-compatible (k1). The TranscriptEntry, RowKind, and markerFor changes are purely additive: older transcripts replay unchanged (no data rewrite), and consumers ignoring the new kind are unaffected. The approval-request event, permission-decision message, pendingPerms, resume/grant path, dir-block branch, and codex decide() relay are all unchanged, so the shipped Approve behaviour (k4) is preserved — only the visible echo and the added resolved-state/outcome rendering change.

## 8. Alternatives considered

### 8.1 a1: P1 persisted permission-outcome row + webview-resolved card + runTurn suppress-echo flag — **CHOSEN**

Add a plain-serialisable 'permission-outcome' row (P1) recorded on decision; mark the live card resolved (green/red, buttons removed); give runTurn an explicit suppress-echo flag the two grant re-runs pass.

Additive P1 (RowKind + view + TranscriptEntry + toViewModel + markerFor) for the persisted outcome; webview-local resolved-card DOM state in the approval renderer's click path; an explicit optional runTurn suppressEcho flag passed only by the two synthesized grant re-runs, so the resume turn + grant run unchanged while the user-row echo is skipped. approval-request event, permission-decision message, and grant path all UNCHANGED.

### 8.2 a2: Suppress the echo by detecting the synthesized grant prompt text in runTurn

Same as a1 but suppress the echo by string-matching the known grant phrasings instead of an explicit flag.

Identical persisted-outcome + resolved-card moves; ac2 achieved by testing the prompt text against the two synthesized grant phrasings in runTurn (chat-panel.ts:543) and skipping the user-row post on a match.

**Rejected because:** Partial on ac2/k3: string-coupling to the grant phrasings is fragile and risks false-positive suppression of genuine user input — the explicit flag avoids both.

### 8.3 a3: Webview-only resolved card; no persisted outcome row

Mark the card resolved + suppress the echo via the a1 flag, but do NOT persist any outcome.

Do the resolved-card DOM change (ac1) + the runTurn suppress-echo flag (ac2/ac3), but skip the P1 persisted permission-outcome row entirely — the decided state lives only in live DOM.

**Rejected because:** Violates sc2 and only partially meets ac4/k2 — it drops the persisted outcome the HLD contract and the story's user value both require.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 code-map / approval-card-render / persistence-surface bundles — render-registry.ts:315-330 (approval renderer + DEC), chat-panel.ts:412 (live card append), :745-796 (permission-decision handler), :527/:543 (runTurn + user-row echo), :138 (pendingPerms); session-store.ts:26 (TranscriptEntry union); markers.ts:43-85 (markerFor).`
- **[[c7]]** `prior-artifact` `Dev-chat Approve bugfix (791f692) — the shipped resume-grant: runTurn('Approved — run exactly this now: ${command}',[toolName]) / tool-name fallback at chat-panel.ts:779/:782; the invariant that only the visible echo may change (k4/lc1).`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 12 LOW** · model `client` · reviewed 2026-09-29T13:22:13.086Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 2.5 | citation | LOW | auto | render-registry.ts registers an 'approval' renderer whose approve/deny buttons call a decision sink DEC(rid,decision), around lines 315-330. | reads render-registry.ts:315 = register('approval',function(vm){ (found:true); greps confirm register('approval'), DEC(rid, and insrc-approval__actions exist in source. | Confirmed — no change. |
| 2.5 | citation | LOW | auto | chat-panel.ts appends the live approval card on ev.kind==='approval-request' (around line 412), un-keyed (never persisted). | reads chat-panel.ts:412 = the ev.kind==='approval-request' live render that appends the card via reg.renderRow({kind:'approval',...}) (found:true). | Confirmed — no change. |
| 2.6 | citation | LOW | auto | runTurn is defined in chat-panel.ts around line 527 as an async function taking (text, allowedTools?). | reads chat-panel.ts:527 = async function runTurn(text: unknown, allowedTools?: readonly string[]): Promise<void> (found:true); current signature has no opts — S003 adds the optional third param as designed. | Confirmed — no change. |
| 2.6 | citation | LOW | auto | runTurn posts the visible user-row echo via post({type:'user-row', text: prompt, key: ...}) around chat-panel.ts:543 — the single echo site S003 gates with suppressEcho. | reads chat-panel.ts:543 = post({ type: 'user-row', text: prompt, key: r${s.transcript.length - 1} }) (found:true); this is the single echo site the suppressEcho flag gates. | Confirmed — no change. |
| 2.7 | citation | LOW | auto | chat-panel.ts has a permission-decision message handler (case 'permission-decision') around lines 745-796. | reads chat-panel.ts:745 = case 'permission-decision': { (found:true). | Confirmed — no change. |
| 2.7 | citation | LOW | auto | The two synthesized grant re-runs call runTurn with 'Approved — run exactly this now: ${command}' (chat-panel.ts:779) and the tool-name fallback 'Approved: please proceed with the ${...}' (:782), each passing [toolName]. | reads chat-panel.ts:779 = runTurn(Approved — run exactly this now: ${pending.command},[pending.toolName]) and :782 = the tool-name fallback (both found:true). | Confirmed — no change. |
| 5 | citation | LOW | auto | chat-panel.ts maintains a pendingPerms map (declared ~line 138) and the permission-decision handler does pendingPerms.get(requestId) (~:754) then pendingPerms.delete (~:756). | reads chat-panel.ts:138 = const pendingPerms = new Map<string, { toolName; command?; blockKind }>() (found:true); get/delete greps confirm usage. | Confirmed — no change. |
| 5 | citation | LOW | auto | The permission-decision handler has a dir-block informational branch (~:764-775) and falls through to the codex/in-turn decide() relay (~:787-794) for requests with no pending tool-gate entry. | reads chat-panel.ts:787 = the codex/in-turn decide() relay comment (found:true); the dir-block branch + .decide(activeTurnId exist in the handler as designed. | Confirmed — no change. |
| 3.1 | semantic | LOW | auto | TranscriptEntry in session-store.ts is a discriminated union that already carries a plain-serialisable S001 tool-result variant, round-tripping createInMemoryChatSessionStore + createMementoChatSessionStore; S003 adds a permission-outcome variant in the same shape. | reads session-store.ts:26 = export type TranscriptEntry = (found:true); greps confirm the S001 tool-result variant + both store constructors, so the additive permission-outcome variant is consistent. | Confirmed — no change. |
| 3.2 | closed-union | LOW | auto | markers.ts markerFor is an exhaustive switch (default null) over TurnEvent kinds around lines 43-85; approval-request is not a case, so it maps to null (live-only). S003 adds a permission-outcome mapping without changing that. | reads markers.ts:43 = export function markerFor(event: TurnEvent): MarkerLine \| null { (found:true); the DEF's own c6 verification corroborates the :43-85 exhaustive mapper. | Confirmed — no change. |
| 5 | citation | LOW | auto | render-registry.ts routes any RowKind with no registered renderer to a 'fallback' renderer (around lines 90/168), so an unmatched permission-outcome degrades to plain text rather than throwing. | reads render-registry.ts:90 = the comment 'entry maps to kind:fallback so renderRow always resolves a renderer' (found:true), confirming the defensive fallback path. | Confirmed — no change. |
| 2.1 | semantic | LOW | auto | RowKind in render-registry.ts is a string-union discriminator that S001 already extended (tool-result); S003 adds a 'permission-outcome' member additively. | reads render-registry.ts:37 = export type RowKind = (found:true); HLD sc1/P1 verification corroborates the five P1 seams, so the additive 'permission-outcome' member is consistent. | Confirmed — no change. |
