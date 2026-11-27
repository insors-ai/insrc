<!-- insrc:artifact LLD-d3ca1368b1f4cccd-s1 -->

# LLD: STORY-d3ca1368b1f4cccd-s1 — vscode-plugin/src/chat/chat-panel.ts inline webview script (updatePickers/renderProvPane/renderModelPane/rlabel/pickModel/rb.onclick/gb.onclick) + its host-side call sites in the same file; tests in vscode-plugin/src/chat/__tests__/chat-panel.test.ts

## Summary

**Epic:** `chat-run-config-provider-model-popup`
**HLD base run:** `wf-1795774541118-7vt27v`
**HLD effective hash:** `1fb0f2d53407...`

Stop the insrc VS Code chat panel's run-config provider/model popup from flickering while open. Webview-side change-gating in chat-panel.ts: an open popup is rebuilt only when the provider/model/effort or catalog data it shows actually changed; opening the popup no longer forces a catalog refresh when the catalog is already ready; picking a different provider (which starts a new chat) closes the popup instead of leaving it open to be rebuilt by the host echo. Regression tests in chat-panel.test.ts prove each gate.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone small bugfix (ISSUE-d3ca1368b1f4cccd); no HLD shared contracts — the fix is confined to the chat panel webview module.
**Rollout phase:** single-step bugfix

## 2. Contract details

**Surface level:** internal

### 2.1 `updatePickers`

```typescript
function updatePickers(): void
```

**Returns:** `void` — Re-renders open run/effort popups only if shown data changed since last render

**Preconditions:**
- #insrc-runpop exists

**Postconditions:**
- open panes rebuilt iff lastRunKey/lastCatalogKey differ; otherwise DOM untouched

### 2.2 `rlabel`

```typescript
function rlabel(): void
```

**Returns:** `void` — Rewrites status-bar run button label only when provider/model changed

**Preconditions:**
- #insrc-runbtn exists

**Postconditions:**
- label rewritten iff run key changed

### 2.3 `renderProvPane`

```typescript
function renderProvPane(hover?: string): void
```

**Parameters:**
- `hover: string | undefined` _(optional)_ — provider id whose model pane to show

**Returns:** `void` — Builds provider + model panes

**Preconditions:**
- catalog state known

**Postconditions:**
- panes reflect catalog + selection; called on open and on real changes only

### 2.4 `pickModel`

```typescript
function pickModel(f, id): void
```

**Parameters:**
- `f: RunProviderView` — chosen provider
- `id: string` — model id (empty = CLI default)

**Returns:** `void` — Posts new-chat (different provider) or set-run-config (same provider)

**Preconditions:**
- popup open

**Postconditions:**
- both branches call closePops()

### 2.5 `rb.onclick`

```typescript
function (e: Event): void
```

**Parameters:**
- `e: Event` — click

**Returns:** `void` — Toggles the run popup open/closed

**Preconditions:**
- rb exists

**Postconditions:**
- on open: renderProvPane + open class; requestCatalog() only when catalogStatus is not ready

## 3. Data model changes

### 3.1 `lastRunKey (webview client state)` — new

`${provider}|${model}|${effort}` of the last applied run-config echo; gates updatePickers/rlabel DOM writes.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.2 `lastCatalogKey (webview client state)` — new

`${revision}|${status}` of the last applied run-catalog message; gates catalog label/pane updates.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.3 `catalogStatus gate in rb.onclick/gb.onclick` — field-modify

requestCatalog() skipped when catalogStatus === ready; recovery and manual refresh paths unchanged.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

## 4. Error paths

**Error cases**

- **run-config echo with identical values while popup open** (recoverable)
  - Detection: lastRunKey equals current echo key
  - Response: skip pane rebuild and label rewrite; DOM untouched
  - User impact: none — the flicker is gone
- **run-catalog with same revision/status while popup open** (recoverable)
  - Detection: lastCatalogKey equals current message key
  - Response: skip label/pane updates
  - User impact: none
- **popup opened while catalog already ready** (recoverable)
  - Detection: catalogStatus === ready in rb.onclick
  - Response: skip requestCatalog(); render once
  - User impact: no loading->ready double render
- **popup opened while catalog loading/unavailable** (recoverable)
  - Detection: catalogStatus !== ready
  - Response: requestCatalog() still fires; recovery loop unchanged
  - User impact: refresh/retry preserved
- **different-provider pick starts a new chat** (recoverable)
  - Detection: pickModel/provider onclick with f.id !== current provider
  - Response: post new-chat AND closePops(); host echo finds no open popup
  - User impact: popup closes as expected on new chat

**Edge cases**

| Input | Expected |
| :--- | :--- |
| catalog transitions ready -> loading -> ready across two opens | re-render once on the revision change, never on identical echoes |
| provider switch attempted mid-popup on a started chat | provider row is disabled (started), unchanged; on a draft, pick closes popup and posts new-chat |
| effort echo with identical effort while effort popup open | updatePickers skips renderEffortPop rebuild |

**Invariants to preserve**

- Message shapes (run-config, run-catalog, new-chat, set-run-config, open-run-picker) and host post sites (postRunConfig, publishCatalog, refreshRunCatalog) are unchanged. [[c1]]
- Popup open/close/hover/selection semantics unchanged except closing on a new-chat provider pick. [[c1]]
- Status-bar button still reflects the session provider/model/effort after every genuine change (restore, new-chat, set-run-config, catalog-ready reconcile). [[c1]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test, vscode-plugin/src/chat/__tests__/chat-panel.test.ts`

**Test levels**

- **unit** — Prove each gate via the existing fake-DOM/channel harness in chat-panel.test.ts: identical echoes do not rebuild open panes; open-with-ready skips requestCatalog; different-provider pick closes popup; genuine changes render exactly once.
  - Subjects: `chat-panel.ts updatePickers/renderProvPane/rlabel/pickModel/rb.onclick`
  - Fixtures: `existing fake webview DOM + message pump in vscode-plugin/src/chat/__tests__/chat-panel.test.ts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `identical run-config echo while popup open leaves pane DOM untouched` |
| `ac2` | `opening popup with ready catalog posts no open-run-picker and renders panes once` |
| `ac3` | `different-provider pick posts new-chat and calls closePops` |
| `ac4` | `genuine value changes update label and rebuild panes exactly once` |

## 6. Migration

**State before:** popup rebuilt on every echo; refresh on every open; new-chat pick leaves popup open

**State after:** same external behavior, rebuilt only on real data change

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. No migration: in-memory webview keys only, nothing persisted — ↩ rollbackable

**Backward compat:** Message shapes and host post sites unchanged

## 7. Alternatives considered

### 7.1 a1: Change-gated re-render in the webview (minimal) — **CHOSEN**

Remember the last-rendered run-config (provider/model/effort) and catalog (revision+status); skip pane rebuilds and label rewrites when an echo carries identical values; skip requestCatalog() on open when the catalog is ready; closePops() on a different-provider pick.

Add two small pieces of client state in the chat-panel.ts inline script (lastRunKey, lastCatalogKey). updatePickers()/rlabel() compare before touching the DOM; rb.onclick/gb.onclick only call requestCatalog() when catalogStatus is not ready; pickModel and the provider item onclick call closePops() in the different-provider branch exactly like the same-provider branch. Host side (postRunConfig/publishCatalog/refreshRunCatalog) unchanged.

### 7.2 a2: Host-side echo dedupe

Make the host omit run-config/run-catalog posts when the values are identical to what was last posted (postRunConfig/publishCatalog compare-and-skip).

In chat-panel.ts host side, keep lastPostedRunConfig/lastPostedCatalog and skip post() when unchanged; webview untouched.

**Rejected because:** Does not fix the webview-side rebuild or the open-popup-after-new-chat-pick case; changes shared host post behavior.

### 7.3 a3: Keyed DOM reconciliation of the popup panes

Rebuild panes via keyed diffing (reuse/move existing .item nodes) so hover and scroll survive any re-render.

Replace the innerHTML rebuilds in renderProvPane/renderModelPane with a small keyed reconciler over catalog entries.

**Rejected because:** Oversized: change-gating (a1) already eliminates spurious re-renders entirely.

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c2]]** `code` `vscode-plugin/src/extension.ts`
- **[[c3]]** `code` `vscode-plugin/src/chat/__tests__/chat-panel.test.ts`
