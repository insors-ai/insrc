<!-- insrc:artifact LLD-e4ce70ad1ae43d31-s1 -->

# LLD: STORY-e4ce70ad1ae43d31-s1 — Show a human-readable timestamp in the dev-chat who-row (user left, provider right, smaller font)

## Summary

**Epic:** `show-human-readable-timestamp-dev-chat`
**HLD base run:** `wf-1794371848631-1ts897`
**HLD effective hash:** `e4ce70ad1ae4...`

The dev-chat who-row (the 'you ❯' / '◆ claude' label above each message bubble) gains a small, muted, human-readable time at the opposite end of the label: left side on the right-aligned user row, right side on the left-aligned assistant row. The timestamp is NOT new data — every persisted TranscriptEntry already carries `at` (ISO) — so this story is render-only: thread `at` through BOTH toViewModel mirrors (host `render-registry.ts:116-194` and the webview inline copy `:464-490`), give live rows their `at` at the post site (user-row post `chat-panel.ts:2898-2905`; assistant-delta render path `chat-panel.ts:2651-2663`/`:2659` via a render-time `at`), and let the webview whoRow format it with an explicit weekday-3 + ', ' + dd/MM + ' ' + HH:mm formatter (e.g. 'Wed, 11/11 04:18') into a span on the SAME single who-row line, smaller than the 11px label, at the opposite end of it.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [UX](#8-ux)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `toViewModel` — BOTH mirrors

```typescript
toViewModel(entry: TranscriptEntry | TurnEvent): RowViewModel — host export vscode-plugin/src/chat/render-registry.ts:116-194 AND the webview inline copy :464-490 (parity-pinned by render-registry.test.ts:236)
```

**Parameters:**
- `entry: TranscriptEntry | TurnEvent` — being rendered. For a persisted TranscriptEntry, `at` rides on the entry; for a LIVE user row the webview handler builds `{role:'user', text, attachments, at: m.at}` (chat-panel.ts:2677 — the user-row post at :2898-2905 now carries `at`); for a LIVE assistant-delta TurnEvent (no `at` field — stream-events.ts:31) the delta branch stamps `at = new Date().toISOString()` at render time (:155-157 host / :480 webview)

**Returns:** `RowViewModel` — RowViewModel for the transcript row; user/assistant variants gain meta.at

**Preconditions:**
- persisted entry with entry.role 'user' | 'assistant': pass entry.at through
- live user-row: the posted user-row message carries `at` (chat-panel.ts:2898-2905) and the webview builds the entry with it (chat-panel.ts:2677)
- live assistant-delta TurnEvent: no `at` on the event (stream-events.ts:31) — the delta branch stamps at=now() at render time

**Postconditions:**
- User and assistant-text RowViewModels carry meta.at = the row's ISO string (persisted `at` verbatim, or the live post/render-time stamp); all other row kinds unchanged
- host and webview mirrors stay byte-equivalent (parity test render-registry.test.ts:236)

### 2.2 `whoRow (webview renderer string)`

```typescript
whoRow(role, glyph, label, at?) — inside the webview renderer string, vscode-plugin/src/chat/render-registry.ts:406-411, called from msgRow:416-439 at the call site :419
```

**Parameters:**
- `role: ChatRole` — ChatRole 'user' | 'assistant' selecting glyph, label and time placement
- `glyph: string` — ❯ for user, ◆ for assistant
- `label: string` — 'you' / 'claude' (the actual assistant label literal at render-registry.ts:419)
- `at: string | undefined` _(optional)_ — ISO timestamp from the row's meta.at; when absent/invalid/out-of-window no time span is rendered

**Returns:** `HTMLElement (fake-DOM in tests)` — The .insrc-who div for the message row

**Preconditions:**
- msgRow built the row for a user/assistant message

**Postconditions:**
- who-row stays ONE line: a span.insrc-when with the explicit format '<3-letter weekday>, dd/MM HH:mm' (e.g. 'Wed, 11/11 04:18') of `at`, PREPENDED for user (label row is right-aligned via .insrc-msg--user{align-items:flex-end;} chat-panel.ts:2376) and APPENDED with margin-left:auto for assistant (label row is left-aligned) — the label/glyph keep their current end of the same line, the time goes to the opposite end
- Row with missing/invalid/far-future at renders exactly as before (no span, no throw)

## 3. Data model changes

### 3.1 `RowViewModel (meta) / TranscriptEntry.at (consumed, unmodified)` — field-add

RowViewModel user/assistant variants gain `meta.at?: string` (interface at render-registry.ts:61-68) carrying the row's ISO `at`: verbatim from a persisted TranscriptEntry (session-store.ts:31-103 — UNCHANGED), from the live user-row post (chat-panel.ts:2898-2905 → webview consume :2677), or stamped at render time for live assistant-delta events (toViewModel delta branch :155-157 host / :480 webview, because TurnEvent has no `at` — stream-events.ts:31). Both toViewModel mirrors (host :116-194, webview :464-490) must gain the same plumbing. session-file-store persistence untouched; old rows render their real historical time.

**Call sites:**
- `vscode-plugin/src/chat/render-registry.ts:116-194` (host toViewModel)
- `vscode-plugin/src/chat/render-registry.ts:464-490` (webview inline toViewModel mirror — parity-pinned by render-registry.test.ts:236)
- `vscode-plugin/src/chat/render-registry.ts:155-157` and `:480` (assistant-delta branch stamps at=now() for live events)
- `vscode-plugin/src/chat/chat-panel.ts:2677` (webview user-row consume builds entry with at)
- `vscode-plugin/src/chat/chat-panel.ts:2898-2905` (live user-row post carries at)
- `vscode-plugin/src/chat/chat-panel.ts:2651-2663` (:2659 live turn-event render reg.renderRow(reg.toViewModel(ev)))
- `vscode-plugin/src/chat/chat-panel.ts:2889` (persisted user row creation, at:now() — unchanged)
- `vscode-plugin/src/chat/chat-panel.ts:3178` (persisted assistant row creation, at:now() — unchanged)
- `vscode-plugin/src/chat/render-registry.ts:406-411` (whoRow gains at?)
- `vscode-plugin/src/chat/render-registry.ts:416-439` (:419 whoRow call site passes vm.meta.at)

### 3.2 `.insrc-when (webview CSS class + whoRow span)` — field-add

New CSS class .insrc-when{font-size:10px;opacity:.65;margin:0 6px;align-self:center;} added inside the RENDER_REGISTRY_STYLE constant (render-registry.ts:202-315; chat-panel.ts only injects that string at :2368 — the CSS edit location is render-registry.ts, not chat-panel.ts), placed beside .insrc-who (11px, chat-panel.ts:2374). Placement rule — the who-row stays a SINGLE line, the time span goes at the OPPOSITE end of the label on that same line: user row prepends the span (left end of the right-aligned user who-row — alignment rule .insrc-msg--user{align-items:flex-end;} at chat-panel.ts:2376), assistant row appends with margin-left:auto (right end of the left-aligned assistant who-row). Time text format: '<3-letter weekday>, dd/MM HH:mm' (e.g. 'Wed, 11/11 04:18') via an explicit formatter in whoRow (not toLocaleTimeString).

**Call sites:**
- `vscode-plugin/src/chat/render-registry.ts:406-411` (whoRow signature + span)
- `vscode-plugin/src/chat/render-registry.ts:202-315` (RENDER_REGISTRY_STYLE constant — the .insrc-when rule is added HERE, injected into the webview by chat-panel.ts:2368)

## 4. Error paths

**Error cases**

- **A row with missing, invalid, or far-future `at` reaches the webview whoRow (old session file, hand-edited store, clock skew)** (recoverable)
  - Detection: In whoRow, `at` is parsed with `new Date(at)` and validated: the result must be a finite number (`isNaN(d.getTime())` check) AND within a sane window — not in the future beyond a small clock-skew allowance (e.g. `d.getTime() <= Date.now() + 60_000`). An absent, unparseable, or far-future `at` yields null and no span is created.
  - Response: Render no .insrc-when span; the who-row falls back to the exact pre-story markup. No throw — the renderer's existing try/catch fallback still applies on top.
  - User impact: No timestamp on that one row; everything else renders normally.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Persisted TranscriptEntry from an old session file lacking a parseable `at`, or with a far-future `at` (empty string, non-ISO, or e.g. year 9999) | No .insrc-when span is rendered; the who-row is identical to the pre-story markup (regression guard for old session files, hand-edited stores, and clock skew). The far-future case IS caught by the explicit future-window bound — `new Date('9999-12-31T00:00:00Z')` parses fine and isNaN is false, so the bound check (`d.getTime() <= Date.now()+60s`) is what suppresses it. |
| Live vs replayed rows — same renderer, different `at` source | A LIVE user row shows the time of the post (chat-panel.ts:2898-2905 now carries `at`: the row's persisted at from :2889; consumed at webview :2677). A LIVE assistant-delta row is rendered from the raw TurnEvent (chat-panel.ts:2651-2663 :2659 `reg.renderRow(reg.toViewModel(ev))`; TurnEvent has no `at` — stream-events.ts:31), so the toViewModel assistant-delta branch stamps at=now() at render time (:155-157 host / :480 webview) and shows the current time while streaming. Rows replayed from disk via transcript-pager show the stored historical time. chat-panel.ts:3178 (rowForEvent) builds only the DURABLE persisted row, not the live one. |
| role='user' who-row | Time span is prepended on the SAME single who-row line (left end of the right-aligned user who-row, insrc-msg--user); user label + glyph stay at the right in their existing order. Format '<3-letter weekday>, dd/MM HH:mm'. |
| role='assistant' who-row | Time span is appended on the SAME single who-row line (right end, margin-left:auto) after glyph+label; the assistant who-row stays left-aligned. Format '<3-letter weekday>, dd/MM HH:mm'. |
| Non-message row kinds (marker, tool-result, permission-outcome, selection-outcome, diff) | Tool-result, permission-outcome, selection-outcome, diff and marker rows never get a time span — whoRow is only called from the user/assistant msgRow path. |

**Invariants to preserve**

- TranscriptEntry already carries `at: string` on EVERY variant, set at creation (chat-panel.ts:2889 user, :3178 assistant) and persisted by session-file-store — this story must not add, rename, or reformat that field (s1 bundle: vscode-plugin/src/chat/session-store.ts:31-103). [[c1]]
- Host toViewModel (:116-194) and the webview inline toViewModel (:464-490) are mirrors pinned by the parity test (render-registry.test.ts:236, with transcript-pager.test.ts) — any at/whoRow change must land in BOTH copies and keep the parity tests green (s1 bundle: render-registry.ts:116-194, :464-490, :406-439). [[c1]]
- User message rows are right-aligned via the CSS rule .insrc-msg--user{align-items:flex-end;} (chat-panel.ts:2376; transcript-pager.ts:79 only DETECTS the insrc-msg--user class for pager bookkeeping) and assistant rows are left-aligned by default — the time span must go to the OPPOSITE end of each row's label without changing the row alignment itself (s1 bundle). [[c1]]

## 5. Test strategy

**Test framework:** `node:test via `npx tsx --test` — repo convention reported by convention.detect on vscode-plugin/src/chat: tests are `*.test.ts` under `__tests__/``

**Test levels**

- **unit** — Pin the who-row rendering in BOTH toViewModel mirrors: time span presence, placement (first vs last child), formatted text, absent/invalid/far-future-`at` fallback, non-message rows unaffected, and host/webview parity for meta.at (parity test :236 extended to the delta branch).
  - Subjects: `vscode-plugin/src/chat/render-registry.ts (host toViewModel :116-194 + webview inline mirror :464-490 + webview renderer string whoRow :406-411 / msgRow :416-439)`, `vscode-plugin/src/chat/__tests__/render-registry.test.ts`
  - Fixtures: `the fake-DOM harness in vscode-plugin/src/chat/__tests__/render-registry.test.ts — makeRegistry()/appended (lines 75-89), the shared line() closure, and findByClass (:92); note label() is a one-off local helper inside a single later diff-widget test (:1219), not a shared row fixture`, `a TranscriptEntry fixture with a fixed ISO `at`, e.g. '2026-11-11T04:18:13.568Z'`, `a far-future `at` fixture, e.g. '9999-12-31T00:00:00.000Z', to pin the future-window bound`
- **integration** — Replay path: a persisted row with `at` renders the time in the paged transcript. LIVE paths: a live user-row message carrying `at` (webview consume chat-panel.ts:2677) and a live assistant-delta TurnEvent (no `at`, stream-events.ts:31) both render the stamped time — a NAMED live-row test ('live user-row carries at and renders span.insrc-when'; 'live assistant-delta stamps at=now() and renders span.insrc-when') proves the feature during a live turn, not just after reload.
  - Subjects: `vscode-plugin/src/chat/transcript-pager.ts`, `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts`, `vscode-plugin/src/chat/chat-panel.ts:2898-2905 (live user-row post, now with at)`, `vscode-plugin/src/chat/chat-panel.ts:2677 (webview user-row consume with at)`, `vscode-plugin/src/chat/chat-panel.ts:2651-2663 (live turn-event render path)`, `vscode-plugin/src/chat/chat-panel.ts:2889`, `vscode-plugin/src/chat/chat-panel.ts:3178 (persisted creation sites, unchanged — regression only)`
  - Fixtures: `a restored session fixture with a stored transcript row (transcript-pager.test.ts already builds `restored(...)` views)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `vscode-plugin/src/chat/__tests__/render-registry.test.ts: who-row shows span.insrc-when with the '<3-letter weekday>, dd/MM HH:mm' formatted time (e.g. 'Wed, 11/11 04:18') for a user row (span is the FIRST child — left end of the same single line)`, `vscode-plugin/src/chat/__tests__/render-registry.test.ts: who-row shows span.insrc-when for an assistant row (span is the LAST child — right end via margin-left:auto)`, `vscode-plugin/src/chat/__tests__/render-registry.test.ts: NAMED live-row test — a live user-row entry ({role:'user',text,at}) via toViewModel renders span.insrc-when (webview :2677 path)`, `vscode-plugin/src/chat/__tests__/render-registry.test.ts: NAMED live-row test — a live assistant-delta TurnEvent (no at) through the delta branch (:155-157 host / :480 webview) stamps at=now() and renders span.insrc-when`, `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts: a replayed stored row keeps its `at` and renders the same span` |
| `ac2` | `vscode-plugin/src/chat/__tests__/render-registry.test.ts: invalid/empty `at` renders no span.insrc-when and the who-row markup is unchanged (fallback test)`, `vscode-plugin/src/chat/__tests__/render-registry.test.ts: far-future `at` (e.g. '9999-12-31T00:00:00.000Z') renders no span — the future-window bound (d <= now+60s) suppresses it`, `vscode-plugin/src/chat/__tests__/render-registry.test.ts: parity test (:236) — host toViewModel meta.at === webview toViewModel meta.at, including the delta branch` |
| `ac3` | `vscode-plugin/src/chat/__tests__/render-registry.test.ts: .insrc-when CSS present in RENDER_REGISTRY_STYLE (render-registry.ts:202-315) with font-size smaller than .insrc-who (10px vs 11px)`, `vscode-plugin/src/chat/__tests__/render-registry.test.ts: non-message rows (marker / tool-result / permission-outcome / diff) render no time span` |

## 6. Migration

**State before:** The who-row renders only glyph+label ('you ❯' / '◆ claude', render-registry.ts:419); TranscriptEntry rows already persist `at` (ISO) on every variant but it is never displayed (s1 bundle: session-store.ts:31-103, chat-panel.ts:2889/:3178, render-registry.ts:406-439). Live rows additionally carry no `at` into the webview: the user-row post (chat-panel.ts:2898-2905) and the raw assistant-delta TurnEvent (stream-events.ts:31) both lack it.

**State after:** User/assistant who-rows render a small muted .insrc-when time (formatted from the row's `at` — persisted verbatim, live-posted, or render-time-stamped) at the opposite end of the label — left on the right-aligned user row, right on the left-aligned assistant row. Non-message rows and rows without a parseable in-window `at` are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. No data migration: every persisted TranscriptEntry already has `at` (set at creation; s1 bundle c1 — session-store.ts:31-103, chat-panel.ts:2889/:3178), so no backfill of session files is needed. Renderers degrade to the old markup for any row whose `at` is missing/unparseable/far-future. — ↩ rollbackable
2. Ship the renderer + live-path change as one commit: BOTH toViewModel mirrors gain meta.at (host render-registry.ts:116-194 incl. delta branch :155-157; webview inline :464-490 incl. :480), the user-row post carries at (chat-panel.ts:2898-2905) and its webview consume passes it (chat-panel.ts:2677), whoRow gains the at? param and span.insrc-when (render-registry.ts:406-411, call site :419), and the .insrc-when rule goes into RENDER_REGISTRY_STYLE (render-registry.ts:202-315, injected at chat-panel.ts:2368). The edit set spans both mirrors + the live posting sites + one CSS rule. Rollback = revert that commit; old rows keep their `at` and nothing is rewritten. — ↩ rollbackable

**Backward compat:** Full. The change is render-only: no TranscriptEntry field is added, removed, or reformatted (the live user-row post's extra `at` field is a transient webview message, not persisted storage), so session files written by older versions load unchanged and simply render their stored `at` time, and a build without this change renders rows as before because nothing new is persisted. Rows with a missing/unparseable/far-future `at` render the old markup (no span), so hand-edited or skewed stores degrade gracefully. Rollback is reverting the single renderer commit; nothing is rewritten.

## 7. Alternatives considered

### 7.1 a1: Render existing `at` in the who-row (smallest, no data change) — **CHOSEN**

Format the already-persisted `at` ISO field in whoRow as a small muted span at the opposite end of the label; zero changes to TranscriptEntry, creation sites, or persistence. Live rows get their `at` without touching TurnEvent: the user-row post carries `at` (chat-panel.ts:2898-2905 → webview consume :2677), and the assistant-delta toViewModel branch stamps at=now() at render time (:155-157 host / :480 webview).

Reuse the existing `at: string` (ISO) on every TranscriptEntry (session-store.ts:31-103). BOTH toViewModel mirrors (host render-registry.ts:116-194; webview inline :464-490 — parity-pinned by render-registry.test.ts:236) pass `at` through on user/assistant RowViewModel meta; the webview whoRow (render-registry.ts:406-411, called from msgRow :416-439 at :419) takes an optional `at` and renders a `<span class='insrc-when'>` formatted with an explicit '<3-letter weekday>, dd/MM HH:mm' formatter (e.g. 'Wed, 11/11 04:18', not toLocaleTimeString). Single-line opposite-end placement: the user message row is right-aligned (.insrc-msg--user{align-items:flex-end;}, chat-panel.ts:2376), so the time span is PREPENDED on the same line (left end); the assistant row is left-aligned, so the span is APPENDED with margin-left:auto on the same line (right end). New CSS `.insrc-when{font-size:10px;opacity:.65;margin:0 6px;align-self:center;}` inside RENDER_REGISTRY_STYLE (render-registry.ts:202-315) beside `.insrc-who` (11px). Missing/invalid/far-future `at` (beyond now+60s) renders no span.

### 7.2 a2: New optional `ts` field on the row

Add `ts?: number` to TranscriptEntry + RowViewModel and render it in whoRow, defaulting to `at` when absent.

Add an optional `ts?: number` (epoch ms) to the user/assistant TranscriptEntry variant and to RowViewModel, populated with Date.now() at the same creation sites that set `at`; whoRow renders from `ts` when present, falling back to parsing `at`. This adds a second timestamp field purely for rendering convenience.

**Rejected because:** Meets the visible requirement but duplicates `at` as `ts`, adding type + creation-site + load-path surface for zero user-visible gain; only partially satisfies the no-protocol/storage-change, parity, and old-session constraints (s3 rank 2).

### 7.3 a3: Tooltip-only timestamp on the who-label

Put the formatted time in the label span's title attribute; nothing new is drawn.

Render the timestamp as a `title` tooltip on the existing who-label span (render-registry.ts:406-411): set `title = new Date(at).toLocaleString()`; no new DOM node, no CSS.

**Rejected because:** Cheapest (XS) but violates the core requirement — hover-only tooltip, the time is not shown in the who-row; also no opposite-end placement and no smaller-font element (s3 rank 4).

### 7.4 a4: Pre-format `when` in BOTH toViewModel mirrors, webview prints it

Host and webview toViewModel format `at` into a short `when` string in RowViewModel.meta; whoRow renders that string as the small opposite-end span.

Format once in the host: toViewModel emits a pre-formatted `when: string` (HH:MM via a fixed Intl.DateTimeFormat) in RowViewModel.meta; the webview whoRow prints `meta.when` verbatim and never calls Date/toLocale itself.

**Rejected because:** Ties a1 behaviorally on every acceptance axis but loses on diff size: formatter plus string-pinning test live in the host mirror, while a1 passes the raw ISO `at` through the view-model and keeps row data untouched end to end (s3 rank 2).

## 8. UX

Each who-row is modelled as a horizontal ColumnSet depicting ONE line per role (no two-line widget, no stacked TextBlocks): the label keeps its current end of the line and the small muted time (`<3-letter weekday>, dd/MM HH:mm`, e.g. `Wed, 11/11 04:18`) sits at the opposite end of the same line. The timestamp TextBlock is `size:'small'` + `isSubtle:true` so the smaller, dimmer contrast is visible against the bolder label.

- [UX mock](docs/standalone/show-human-readable-timestamp-dev-chat-E20261111e4ce70ad/S001/ux-mock.html)

## 9. References

- **[[c1]]** `step-output` `s1 context.assemble — analyzeBundles[0] (design.story e4ce70ad1ae43d31/s1)` — "Every TranscriptEntry variant already carries `readonly at: string`, set at creation (user rows chat-panel.ts:2889, assistant-delta rows chat-panel.ts:3178); rendering is dual (host toViewModel vs web"
- **[[c2]]** `code` `vscode-plugin/src/chat/session-store.ts:31-103`
- **[[c3]]** `code` `vscode-plugin/src/chat/render-registry.ts:61-68` (RowViewModel interface — cited in §3.1 for the meta.at field-add)
- **[[c4]]** `code` `vscode-plugin/src/chat/render-registry.ts:116-194` (host toViewModel)
- **[[c5]]** `code` `vscode-plugin/src/chat/render-registry.ts:416-439` (msgRow actual span; whoRow call site :419)
- **[[c6]]** `code` `vscode-plugin/src/chat/render-registry.ts:406-411` (whoRow actual span)
- **[[c7]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2889`
- **[[c8]]** `code` `vscode-plugin/src/chat/chat-panel.ts:3178`
- **[[c9]]** `code` `vscode-plugin/src/chat/transcript-pager.ts:79`
- **[[c10]]** `code` `vscode-plugin/src/chat/session-file-store.ts`
- **[[c11]]** `code` `vscode-plugin/src/chat/__tests__/render-registry.test.ts`
- **[[c12]]** `code` `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts`
- **[[c13]]** `step-output` `s2 alternatives.enumerate + s3 alternatives.judge — 4 alternatives a1-a4 scored against 6 constraints, winner a1`
- **[[c14]]** `step-output` `s8 checklist.verify — all 22 items passed, none missed/ambiguous`
- **[[c15]]** `code` `vscode-plugin/src/chat/render-registry.ts:464-490` (webview inline toViewModel mirror)
- **[[c16]]** `code` `vscode-plugin/src/chat/render-registry.ts:202-315` (RENDER_REGISTRY_STYLE — .insrc-when rule location)
- **[[c17]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2651-2663` (live turn-event render path, :2659)
- **[[c18]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2677` (webview user-row consume with at)
- **[[c19]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2898-2905` (live user-row post carries at)
- **[[c20]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2376` (.insrc-msg--user{align-items:flex-end;} — the actual alignment rule)
- **[[c21]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2368` (RENDER_REGISTRY_STYLE injection into the webview)
- **[[c22]]** `code` `vscode-plugin/src/chat/stream-events.ts:31` (TurnEvent assistant-delta has no `at`)
- **[[c23]]** `code` `vscode-plugin/src/chat/__tests__/render-registry.test.ts:236` (host/webview toViewModel parity test)
- **[[c24]]** file  — the controller self-review record for this LLD (daemon design reviewer broken per ISSUE-738d62b848fd173f; 3 rounds; approval override cites it)
