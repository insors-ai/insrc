<!-- insrc:artifact PLAN-8e8859ca0ca83612-s3 -->

# Plan: E202609298e8859ca:S003

## Summary

**Epic:** `vs-code-dev-chat-ux-polish`
**LLD run:** `wf-1790687538424-20kgi6`
**LLD effective hash:** `f5c70630aa71...`

Building S003 threads one additive P1 'permission-outcome' row through the dev-chat render pipeline (RowKind + view + TranscriptEntry + toViewModel + renderer + markerFor, including the eval'd webview parity copy), makes the live approval card settle into a green/red resolved state that drops its buttons on decision, and gives runTurn an optional suppress-echo flag the two synthesized grant re-runs pass so the confusing fake 'Approved…' user line disappears while the resume turn + grant stay byte-identical. The permission-decision handler records the decided outcome (approve or deny) so it survives reload. Pure vscode-plugin/src/chat/ work verified through the eval'd *WebviewSource + session-store round-trip tests.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** P1 persisted permission-outcome row scaffold (RowKind + view + TranscriptEntry + toViewModel + renderer + markerFor) | M | — | unit: register('permission-outcome') draws a resolved chip (green approved / red rejected + tool name) reusing the __btn--approve/--deny tints; textContent/className only; unit: toViewModel maps BOTH a {kind:'permission-outcome'} TranscriptEntry (replay) and the host-emitted live outcome to the same PermissionOutcomeRowView; unit: markerFor returns the persisted permission-outcome mapping and STILL returns null for the pending approval-request (never-default preserved); unit: the renderRegistryWebviewSource parity test admits a permission-outcome sample and stays green | [[c1]] [[c2]] |
| 2 | **`t2`** Approval card settles into a resolved state on decision (ac1) | S | — | unit: the approval renderer's decision path: on approve/deny click the card gains a resolved (approved/rejected) class and its .insrc-approval__actions buttons are removed (ac1) | [[c1]] |
| 3 | **`t3`** runTurn gains an optional suppressEcho flag gating the user-row echo (ac2/k1) | S | — | unit: a NORMAL user turn still posts its user-row echo (suppressEcho off by default) | [[c1]] |
| 4 | **`t4`** permission-decision handler records the outcome + suppresses the grant echo (ac2/ac3/ac4/k4) | S | `t1`, `t3` | unit: approve WITH command: host pushes permission-outcome(approved) AND the grant re-run posts NO user-row echo (suppressEcho) while still issuing the resume turn with [toolName]; unit: tool-name fallback grant (no command): records approved + suppresses echo + still resumes; unit: deny: records permission-outcome(rejected), no resume turn, no echo; unit: unknown/stale requestId records no outcome and falls through to the codex decide() relay unchanged; unit: dir-block approve still posts its informational message unchanged and records an approved outcome without a grant | [[c1]] [[c2]] |
| 5 | **`t5`** Tests: resolved card, persisted-outcome round-trip + replay, echo suppression + grant preserved | M | `t1`, `t2`, `t3`, `t4` | unit: A {kind:'permission-outcome',toolName,decision} TranscriptEntry round-trips createInMemoryChatSessionStore AND createMementoChatSessionStore intact; unit: A session-restored replay containing a permission-outcome renders a non-actionable resolved chip; the pending card does NOT reappear; unit: An older transcript with no permission-outcome entries replays unchanged | [[c1]] [[c2]] |

### 1.1 E202609298e8859ca:S003:T001 — P1 persisted permission-outcome row scaffold (RowKind + view + TranscriptEntry + toViewModel + renderer + markerFor)

Add the additive P1 seams for the resolved-outcome row: extend RowKind with 'permission-outcome' + the PermissionOutcomeRowView payload (render-registry.ts); add the plain-serialisable { kind:'permission-outcome'; toolName; decision } TranscriptEntry variant (session-store.ts); add the toViewModel branch mapping BOTH the replayed entry and the host-emitted live outcome to the view AND register the 'permission-outcome' renderer chip (green approved / red rejected, reusing the __btn--approve/--deny tints) in BOTH the module copy and the eval'd renderRegistryWebviewSource (keep the parity test green); add the markers.ts markerFor case for the persisted outcome, leaving the pending approval-request unmapped (-> null, never-default preserved).

**Acceptance checks:**
- RowKind gains 'permission-outcome' and a PermissionOutcomeRowView { kind; toolName; decision:'approved'|'rejected' } exists; existing kinds unchanged.
- TranscriptEntry gains the plain-serialisable permission-outcome variant; both stores accept it with no migration.
- toViewModel maps a {kind:'permission-outcome'} TranscriptEntry AND a host-emitted live outcome to the same PermissionOutcomeRowView, in both the module and the eval'd webview source (parity test green).
- register('permission-outcome') draws a resolved non-actionable chip via textContent/className only.
- markers.ts markerFor returns the persisted permission-outcome mapping and STILL returns null for the pending approval-request (exhaustive-switch never-default intact).

### 1.2 E202609298e8859ca:S003:T002 — Approval card settles into a resolved state on decision (ac1)

Extend the register('approval') click path (render-registry.ts:315-330): on the approve/deny click, set a resolved (approved/rejected) class on the .insrc-approval card and remove its .insrc-approval__actions before/as it calls DEC(rid,decision). The pending card stays live-only (un-keyed, never persisted). Add the resolved-state CSS reusing the existing approve/deny tints.

**Acceptance checks:**
- Clicking approve or deny sets a resolved (approved/rejected) class on the card and removes the .insrc-approval__actions buttons.
- The DEC(rid,decision) post still fires (decision relay unchanged).
- The pending card is still appended un-keyed (never persisted).

### 1.3 E202609298e8859ca:S003:T003 — runTurn gains an optional suppressEcho flag gating the user-row echo (ac2/k1)

Add the optional third parameter opts?: { readonly suppressEcho?: boolean } to runTurn (chat-panel.ts:527) and gate the user-row echo post (chat-panel.ts:543) on it (default off = today's behaviour). The resume turn + tool grant are otherwise unchanged.

**Acceptance checks:**
- runTurn's signature gains an optional opts.suppressEcho; existing call-sites compile unchanged (backward-compatible).
- When suppressEcho is true the user-row echo post at :543 is skipped; when absent/false it posts exactly as today.
- The resume turn + [toolName] grant behaviour is unchanged regardless of suppressEcho.

### 1.4 E202609298e8859ca:S003:T004 — permission-decision handler records the outcome + suppresses the grant echo (ac2/ac3/ac4/k4)

In the permission-decision handler (chat-panel.ts:745-796), on approve AND deny of a pending tool-gate push the { kind:'permission-outcome', toolName, decision } TranscriptEntry (persist it and emit it live via the same toViewModel/renderer t1 adds — no bespoke render), and pass { suppressEcho: true } to the two grant re-runs at :779/:782. Leave the dir-block informational branch (:764-775), the codex decide() relay (:787-794), pendingPerms, and the approval-request/permission-decision messages UNCHANGED.

**Acceptance checks:**
- On approve (command or tool-name fallback) the host records permission-outcome(approved) and both grant re-runs pass { suppressEcho: true } (no user-row echo) while still running the resume turn with [toolName].
- On deny the host records permission-outcome(rejected); no resume turn, no echo.
- An unknown/stale requestId records no outcome and falls through to the codex decide() relay unchanged; the dir-block branch still posts its informational message and records approved without a grant.
- The grant/resume path, pendingPerms correlation, and permission-decision message are byte-identical to today (k4).

### 1.5 E202609298e8859ca:S003:T005 — Tests: resolved card, persisted-outcome round-trip + replay, echo suppression + grant preserved

Add/extend the eval'd *WebviewSource + fakeChannel/scriptedAdapter chat-panel tests, the session-store round-trip tests, and the markers/render-registry unit tests per the LLD test strategy — covering the resolved-card DOM change, the chip render, the dual-input toViewModel + markerFor mapping, the both-stores round-trip + reload replay (pending card does not reappear), and the host record-outcome + suppress-echo-while-preserving-grant behaviours (approve/deny/dir-block/unknown-requestId, and a normal user turn still echoing).

**Acceptance checks:**
- Unit tests cover ac1 (resolved card + chip), ac2 (echo suppressed for grants, preserved for normal turns), ac3 (grant/resume + dir-block/codex relay unchanged), ac4 (round-trip both stores + reload replay + markerFor->null pending).
- The renderRegistryWebviewSource parity test is extended with a permission-outcome sample and stays green.
- tsc clean and the full vscode-plugin suite passes (live tests skip under no INSRC_LIVE_TESTS).

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| The approval renderer's decision path: on approve/deny click the card gains a resolved (approved/rejected) class and its .insrc-approval__actions buttons are removed (ac1). | `t2` |
| register('permission-outcome') draws a resolved chip (green approved / red rejected + tool name) reusing the __btn--approve/--deny tints; textContent/className only. | `t1` |
| toViewModel maps BOTH a {kind:'permission-outcome'} TranscriptEntry (replay) and the host-emitted live outcome to the same PermissionOutcomeRowView. | `t1` |
| markerFor returns the persisted permission-outcome mapping and STILL returns null for the pending approval-request (never-default preserved). | `t1` |
| A {kind:'permission-outcome',toolName,decision} TranscriptEntry round-trips createInMemoryChatSessionStore AND createMementoChatSessionStore intact. | `t5` |
| A session-restored replay containing a permission-outcome renders a non-actionable resolved chip; the pending card does NOT reappear. | `t5` |
| An older transcript with no permission-outcome entries replays unchanged. | `t5` |
| approve WITH command: host pushes permission-outcome(approved) AND the grant re-run posts NO user-row echo (suppressEcho) while still issuing the resume turn with [toolName]. | `t4` |
| tool-name fallback grant (no command): records approved + suppresses echo + still resumes. | `t4` |
| deny: records permission-outcome(rejected), no resume turn, no echo. | `t4` |
| a NORMAL user turn still posts its user-row echo (suppressEcho off by default). | `t3` |
| unknown/stale requestId records no outcome and falls through to the codex decide() relay unchanged. | `t4` |
| dir-block approve still posts its informational message unchanged and records an approved outcome without a grant. | `t4` |

## 3. References

- **[[c1]]** `analyze-bundle` `s1 capability-discovery bundle — the S003 change surface in vscode-plugin/src/chat/: RowKind/RowViewModel/toViewModel/renderer (render-registry.ts), markerFor (markers.ts:43-85), TranscriptEntry union (session-store.ts:26), approval renderer (render-registry.ts:315-330) + live append (chat-panel.ts:412), runTurn (:527) + user-row echo (:543), the two grant re-runs (:779/:782), the permission-decision handler (:745-796) with pendingPerms (:138), dir-block (:764-775) + codex decide() relay (:787-794).`
- **[[c2]]** `prior-artifact` `LLD s3 — sc2 interfaceSketch (the P2->P1 instantiation over the existing approval-request) + the interactionWithShared entry: additive RowKind 'permission-outcome' + PermissionOutcomeRowView + plain-serialisable TranscriptEntry variant + toViewModel branch + markerFor case; approval-request stays markerFor->null; grant/resume path consumed UNCHANGED (k4).`
