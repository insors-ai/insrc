<!-- insrc:artifact PLAN-1bd72813bfa795f4-S001 -->

# Plan: E202611031bd72813:S001

## Summary

**Epic:** `multiple-concurrent-chats-chat-panel-active`
**LLD run:** `wf-1793722967234-8apdy1`
**LLD effective hash:** `1bd72813bfa7...`

Build adds an active-chats dropdown (left-aligned in the chat chrome, reusing open-chat) with red/yellow/green status driven by turn lifecycle + persisted request state and a lossless 60s observer for detached chats, and makes every insrc_present open a new docs-review editor panel (presentKey-keyed) instead of replacing the open one, with per-panel draft isolation.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Session record fields | S | — | unit: session-store status/pendingRequests persistence + old-row compat (vscode-plugin/src/chat/session-store.ts, session-file-store.ts) | [[c2]] |
| 2 | **`t2`** Status precedence + transitions + observation-failure | L | `t1` | unit: status precedence + failure/observation-failure transitions (turn-lifecycle.ts, stream-events.ts, cli-adapter.ts) | [[c7]] [[c8]] |
| 3 | **`t3`** activeChats + purge + eviction protection | M | `t1` | unit: activeChats filter + purge fake clock + capped-store eviction regression (session-store.ts, session-file-store.ts) | [[c2]] [[c6]] |
| 4 | **`t4`** Active-chats dropdown | M | `t1`, `t2` | unit: active-list/ActiveChatEntry + open-doc/docs-content protocol shapes (protocol.ts); integration: webview dropdown render + open (chat-panel.ts) | [[c1]] [[c5]] |
| 5 | **`t5`** 60s lossless observer core | L | `t1`, `t2` | unit: observer own-cursor + retention + SegmentGone + decoder checkpoints (session-output.ts, cli-adapter.ts, turn-lifecycle.ts); integration: fake session-output detached reconciliation | [[c6]] [[c7]] |
| 6 | **`t6`** Approval queue snapshot/restore + decision transport | L | `t1`, `t2` | unit: approval-queue snapshot/restore round-trip + delivery result correlation (approval-queue.ts, cli-adapter.ts); integration: detach/reattach + reload request restoration (chat-panel.ts) | [[c7]] [[c8]] |
| 7 | **`t7`** presentKey + dedup + forwarding | M | — | unit: presentKey uniqueness + per-declaration dedup, old test updated (review-presenter.ts, extension.ts) | [[c3]] |
| 8 | **`t8`** Panels map + detached presentation dispatch | L | `t5`, `t7` | unit: panels map create/reveal/dispose + title (docs-review-panel.ts); integration: double-present two panels; detached present one panel (docs-review-panel.ts, extension.ts) | [[c4]] |
| 9 | **`t9`** Composite draft key | S | `t8` | unit: docs-review-comments composite key A->B->A (docs-review-comments.ts) | [[c9]] |
| 10 | **`t10`** Full test suite | L | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8`, `t9` | unit: all unit subjects incl. protocol shapes unchanged (protocol.ts); integration: webview-level end-to-end (chat-panel.ts) | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] [[c7]] [[c8]] [[c9]] [[c10]] |

### 1.1 E202611031bd72813:S001:T001 — Session record fields

status/lastActivityAt/pendingRequests/observerCheckpoint additive fields

**Acceptance checks:**
- old rows load; persisted with monotonic guard

### 1.2 E202611031bd72813:S001:T002 — Status precedence + transitions + observation-failure

setStatus wiring + cli-adapter observation-failure outcome

**Acceptance checks:**
- precedence; failure exits; observation-failure not terminal

### 1.3 E202611031bd72813:S001:T003 — activeChats + purge + eviction protection

list filter + 60s timer + eviction exclusions

**Acceptance checks:**
- purge list-level; cap eviction excludes active

### 1.4 E202611031bd72813:S001:T004 — Active-chats dropdown

active-list protocol + #insrc-active chip left + open-chat reuse

**Acceptance checks:**
- dropdowns render; selection opens like history

### 1.5 E202611031bd72813:S001:T005 — 60s lossless observer core

own-cursor ingestion, retention, checkpoints, SegmentGone recovery, pid liveness

**Acceptance checks:**
- reconciliation correct; rollovers lossless; caught-up rule

### 1.6 E202611031bd72813:S001:T006 — Approval queue snapshot/restore + decision transport

snapshot/restore + pendingRequests + process triage + delivery results

**Acceptance checks:**
- round-trip; restore by requestId; delivery-failed on silent no-op

### 1.7 E202611031bd72813:S001:T007 — presentKey + dedup + forwarding

hostPresentSeq counter, per-declaration dedup, openArtifact forwarding

**Acceptance checks:**
- host-wide uniqueness; per-declaration dedup

### 1.8 E202611031bd72813:S001:T008 — Panels map + detached presentation dispatch

panel per presentKey + observer declaration dispatch with declarationId

**Acceptance checks:**
- two panels on double present; detached present exactly once

### 1.9 E202611031bd72813:S001:T009 — Composite draft key

presentKey:artifactId draft keying

**Acceptance checks:**
- A->B->A isolation; sibling panels isolated

### 1.10 E202611031bd72813:S001:T010 — Full test suite

unit + contract + integration per LLD s7

**Acceptance checks:**
- ac1-ac4 proven

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| vscode-plugin/src/chat/session-store.ts | `t1`, `t3`, `t10` |
| vscode-plugin/src/chat/session-file-store.ts | `t1`, `t3` |
| vscode-plugin/src/chat/stream-events.ts | `t2`, `t6` |
| vscode-plugin/src/chat/turn-lifecycle.ts | `t2`, `t5` |
| vscode-plugin/src/chat/session-output.ts | `t5` |
| vscode-plugin/src/chat/cli-adapter.ts | `t2`, `t5`, `t6` |
| vscode-plugin/src/chat/review-presenter.ts | `t7` |
| vscode-plugin/src/chat/docs-review-panel.ts | `t8` |
| vscode-plugin/src/chat/docs-review-comments.ts | `t9` |
| vscode-plugin/src/chat/protocol.ts | `t4`, `t10` |
| vscode-plugin/src/extension.ts | `t7`, `t8` |
| vscode-plugin/src/chat/approval-queue.ts | `t6` |
| vscode-plugin/src/chat/chat-panel.ts | `t2`, `t4`, `t6`, `t10` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 handoff — chat-panel history/open-chat pattern (chat-panel.ts:565-566, :1510)`
- **[[c2]]** `prior-artifact` `LLD S001 handoff — session-store as history backing; gains status/lastActivityAt (session-store.ts)`
- **[[c3]]** `prior-artifact` `LLD S001 handoff — review-presenter declared()/open() dedup + deps.open (review-presenter.ts:83-130)`
- **[[c4]]** `prior-artifact` `LLD S001 handoff — docs-review host singleton channel + show() (docs-review-panel.ts:1275, :2450); panel-per-presentKey`
- **[[c5]]** `prior-artifact` `LLD S001 handoff — protocol.ts open-chat { chatId } reuse; active-list addition`
- **[[c6]]** `prior-artifact` `LLD S001 handoff — LiveTurn + session-output observer grounding (turn-lifecycle.ts, session-output.ts)`
- **[[c7]]** `prior-artifact` `LLD S001 handoff — detach/follow, failure exits, failed-resume (turn-lifecycle.ts)`
- **[[c8]]** `prior-artifact` `LLD S001 handoff — approval/selection events mid-turn waiting-input (stream-events.ts)`
- **[[c9]]** `prior-artifact` `LLD S001 handoff — docs-review-comments draft keying (docs-review-comments.ts:254-260)`
- **[[c10]]** `prior-artifact` `LLD S001 handoff — protocol message shapes unchanged (protocol.ts:211-272)`
