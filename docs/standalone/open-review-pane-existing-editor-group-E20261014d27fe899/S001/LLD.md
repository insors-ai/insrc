<!-- insrc:artifact LLD-d27fe8996fc3a2db-s1 -->

# LLD: E20261014d27fe899:S001

## Summary

**Epic:** `open-review-pane-existing-editor-group`
**HLD base run:** `wf-1792005723169-abi49h`
**HLD effective hash:** `d27fe8996fc3...`

When the review pane opens, it now goes into an editor group you already have open, as long as that group is not the one holding the chat, instead of opening beside or over the chat. If there is no other group open, it opens exactly where it does today: a new group beside the chat when the chat opened it for a document it presents, and the active group when you opened it yourself from the command or the delivery board. A pane the chat opens on a presented document still does not take your cursor.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `createPanel`

```typescript
createPanel(opts: { viewType: string; title: string; quiet?: boolean | undefined }): ChatPanelChannel   // the review host's dependency, bound in extension.ts
```

**Parameters:**
- `opts: { viewType; title; quiet? }` — What to create; quiet means without taking keyboard focus (a document the chat presents).

**Returns:** `ChatPanelChannel` — The new review pane's channel; unchanged.

**Errors:**
- `never thrown by the choice` when if reading the tab groups throws, the pane opens where it does today (beside the chat when quiet, the active group otherwise)

**Preconditions:**
- the review host has no live pane (it only calls createPanel then)

**Postconditions:**
- the pane is a tab in an open editor group that holds no chat tab, when there is one; otherwise exactly where it opens today: beside the chat when quiet, the active group when not
- a quiet open keeps preserveFocus
- the tab icon and channel wrapping are unchanged

### 2.2 `isChatTabInput`

```typescript
isChatTabInput(input: unknown, viewType: string): boolean
```

**Parameters:**
- `input: unknown` — A tab's raw input.
- `viewType: string` — The chat panel's view type (CHAT_VIEW_TYPE).

**Returns:** `boolean` — Whether the tab is the chat webview.

**Postconditions:**
- unchanged: consumed as the one rule for 'this is the chat tab'

## 3. Data model changes

### 3.1 `chooseReviewColumn (new vscode-free function in vscode-plugin/src/chat/review-column.ts, beside group-lock.ts)` — new

chooseReviewColumn(groups: readonly { readonly viewColumn: number; readonly isActive: boolean; readonly tabs: readonly { readonly input: unknown }[] }[], chatViewType: string): number | undefined. It leaves out every group with a tab satisfying isChatTabInput(input, chatViewType). Among the rest it returns the active group's viewColumn when the active group is one of them, otherwise the lowest viewColumn; it returns undefined when no group is left. It reads nothing from vscode and never throws.

```
none
```

**Call sites:**
- `vscode-plugin/src/extension.ts (the review host's createPanel callback reads vscode.window.tabGroups.all into the plain list and uses the result)`
- `vscode-plugin/src/chat/review-column.ts (the new file)`

### 3.2 `createPanel (review host, extension.ts)` — invariant-change

Today the pane is created at ViewColumn.Beside with preserveFocus (quiet, a document the chat presents) or ViewColumn.Active (the command and the board), which puts it beside the chat's group or in the active group, which may be the chat's. After the change both paths first use the column chooseReviewColumn returns (a group holding no chat tab); when it returns undefined or reading the groups fails, each path keeps today's placement: ViewColumn.Beside with preserveFocus when quiet, ViewColumn.Active otherwise. Two source-scan tests in review-wiring.test.ts that pin the current calls are rewritten with it.

**Call sites:**
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/chat/docs-review-panel.ts`
- `vscode-plugin/src/vscode.d.ts (the compile-only shim)`
- `vscode-plugin/src/chat/__tests__/review-wiring.test.ts`

### 3.3 `vscode.d.ts shim: TabGroups and TabGroup` — field-add

The plugin builds against a local compile-only shim of the vscode module, which today declares only TabGroup.activeTab and TabGroups.activeTabGroup, onDidChangeTabs and onDidChangeTabGroups. The change needs TabGroups to gain `readonly all: readonly TabGroup[]` and TabGroup to gain `readonly viewColumn: ViewColumn`, `readonly isActive: boolean` and `readonly tabs: readonly Tab[]`, matching the real vscode API, so extension.ts typechecks.

```
TabGroups.all; TabGroup.viewColumn, TabGroup.isActive, TabGroup.tabs
```

**Call sites:**
- `vscode-plugin/src/vscode.d.ts`
- `vscode-plugin/src/extension.ts`

## 4. Error paths

**Error cases**

- **Reading the tab groups fails (an editor without the tab model, or a call that throws)** (recoverable)
  - Detection: the createPanel callback wraps the read of vscode.window.tabGroups.all in a try and catches an exception
  - Response: Log it and open the pane where it opens today: beside the chat (ViewColumn.Beside, preserveFocus) when quiet, the active group (ViewColumn.Active) otherwise
  - User impact: The pane opens in a new group instead of an existing one; nothing is lost
- **A tab's input is not an object, or has no viewType (a text editor tab, a diff, a terminal)** (recoverable)
  - Detection: isChatTabInput returns false for it, so the tab does not mark its group as the chat's
  - Response: The group is treated as a normal group and can be chosen
  - User impact: None

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Only the chat's group is open | chooseReviewColumn returns undefined and the pane opens where it does today: beside the chat when quiet, the active group otherwise |
| Two groups other than the chat's are open and the active group is one of them | The pane goes into the active group |
| Two groups other than the chat's are open and the chat's group is the active one | The pane goes into the one with the lowest view column |
| A group holds the chat tab and other tabs | It is left out as a whole: a group with any chat tab is the chat's group |
| The pane is already open | Nothing changes: the host reveals it and does not call createPanel |
| A quiet open (the chat presents a document) into an existing group | The pane opens with preserveFocus, so the cursor stays in the chat |
| An open that is not quiet (the command, the delivery board) | The pane opens in the chosen group and takes focus, as it did |
| A group holds only an empty editor or only other webviews | It is a qualifying group and is reused: the pane becomes one more tab there |

**Invariants to preserve**

- An open review pane is revealed, never created a second time: createPanel is called only when the host has no live pane. [[c1]]
- A pane the chat opens on a presented document opens without taking keyboard focus (preserveFocus), and the command and the board take focus. [[c1]]
- The chat panel's own group, its lock and its tab are not touched: isChatTabInput stays the one rule for what is the chat's tab. [[c2]]
- The pane's tab icon and its channel wrapping are unchanged by where it opens. [[c1]]

## 5. Test strategy

**Test framework:** `node:test (node:assert/strict) run through tsx: npx tsx --test; co-located *.test.ts under src/chat/__tests__, with plain fakes as in group-lock.test.ts`

**Test levels**

- **unit** — The placement rule with fake tab groups, and the wiring of createPanel by source scan.
  - Subjects: `chooseReviewColumn: groups other than the chat's are chosen (the active one first, else the lowest view column), a group with any chat tab is left out whole, and undefined is returned when only the chat's group is open or there are no groups`, `chooseReviewColumn: a tab whose input is not an object or has no viewType does not mark its group as the chat's`, `extension.ts's review host createPanel reads vscode.window.tabGroups.all through a try, passes the chosen column (or, when there is none or reading fails, today's placement: ViewColumn.Beside with preserveFocus when quiet, ViewColumn.Active otherwise), and keeps preserveFocus for a quiet open (source scan)`, `review-wiring.test.ts: TWO existing source scans pin the current createPanel calls and are rewritten: 'review wiring: extension.ts sets the review panel's iconPath...' (about :128, asserts the ViewColumn.Active call) and 'extension wiring: the chat host's presenter opens a document...' (about :175, asserts the quiet Beside/preserveFocus ternary, and its title states the old placement). The new createPanel body keeps the `createPanel: ({ viewType, title, quiet }) => {` block shape their extractor regex expects; the createPanel wiring scan lives in review-wiring.test.ts`
  - Fixtures: `plain fake tab-group lists (as group-lock.test.ts builds them)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `review-column.test.ts: chooseReviewColumn picks a group without the chat tab, the active one first` |
| `ac2` | `review-column.test.ts: chooseReviewColumn returns undefined when only the chat's group is open, and review-wiring.test.ts: extension.ts falls back to today's placement (Beside when quiet, Active otherwise) (source scan)` |
| `ac3` | `review-wiring.test.ts: the review host's createPanel keeps preserveFocus for a quiet open and takes focus otherwise (source scan)` |

## 6. Migration

**State before:** A new review pane is created by the review host's createPanel in extension.ts at ViewColumn.Beside (quiet, the chat presenting a document) or ViewColumn.Active (the command and the delivery board's open), so it lands in or beside the chat's group wherever other groups are already open (bundle read:current-behaviour). An already open pane is only revealed.

**State after:** A new review pane is created in an open editor group that holds no chat tab (the active one when it qualifies, else the lowest column); when there is none it opens as it does today (beside the chat when quiet, the active group otherwise). A quiet open keeps preserveFocus. An already open pane is revealed as before.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the vscode-free placement function in a new file, vscode-plugin/src/chat/review-column.ts, beside group-lock.ts and reusing its isChatTabInput, with its tests in __tests__/review-column.test.ts over fake tab groups — ↩ rollbackable
2. Extend the compile-only vscode.d.ts shim with the tab-group fields the placement needs (TabGroups.all; TabGroup.viewColumn, isActive, tabs); change the review host's createPanel in extension.ts to read the tab groups into the plain list (in a try), call the function, and use the column, or today's placement when there is none or reading fails (ViewColumn.Beside with preserveFocus when quiet, ViewColumn.Active otherwise) — ↩ rollbackable
3. Rewrite the two source scans in review-wiring.test.ts that pin the current createPanel calls (the iconPath test and the presenter-wiring test, including its title), so they pin the new wiring — ↩ rollbackable

**Backward compat:** No stored data and no message changes: only where a new review pane opens. A user who has no other editor group open sees exactly today's placement on both paths. The other panels (the delivery board, the status panel) keep ViewColumn.Active.

## 7. Alternatives considered

### 7.1 a1: A vscode-free placement function over the tab groups — **CHOSEN**

A small pure function takes the open tab groups and the chat's view type and returns the column to use, or none; extension.ts passes the result to createWebviewPanel.

A new vscode-free function in the plugin (next to group-lock.ts, reusing its isChatTabInput rule) takes a plain list of groups { viewColumn, isActive, tabs[].input } and the chat view type. It leaves out every group that holds a tab satisfying isChatTabInput. Among the rest it picks the active group when it is one of them, otherwise the first by column; with no such group it returns undefined. The review host's createPanel in extension.ts reads vscode.window.tabGroups.all into that plain list, and uses the returned column, or, when the function returns undefined, today's placement (ViewColumn.Beside when quiet, ViewColumn.Active otherwise). A quiet open (the chat's presenter) keeps preserveFocus. Only the review pane is changed.

### 7.2 a2: The same rule written inline in extension.ts

extension.ts scans tabGroups and picks a column in the createPanel callback, with no separate module.

The createPanel callback reads vscode.window.tabGroups.all, finds the groups without a chat tab (using isChatTabInput), picks the active one or the first, and passes its viewColumn to createWebviewPanel, falling back to today's placement (Beside when quiet, Active otherwise).

**Rejected because:** Same behaviour at lower cost, but the rule that is the whole change cannot be tested: only a source scan could pin it.

### 7.3 a3: A fixed column or a remembered column

Open the pane in a fixed column (for example Two) or in the column the previous review pane used.

Use ViewColumn.Two always, or remember the column of the last review pane and reuse it when its group still exists and is not the chat's.

**Rejected because:** Does not meet the request: it ignores the user's layout.

## 8. References

- **[[c1]]** `analyze-bundle` `read:current-behaviour: the review host's createPanel in extension.ts and show(quiet) in docs-review-panel.ts`
- **[[c2]]** `analyze-bundle` `read:chat-group: group-lock.ts isChatTabInput, the chat group lock and extension.ts's use of tabGroups`
- **[[c3]]** `analyze-bundle` `read:other-panels: the delivery board and status panel are created at ViewColumn.Active and are out of scope`
- **[[c4]]** `analyze-bundle` `read:tests: extension.ts is tested by source scan; group-lock.ts by fakes`

## 9. Open questions

- cd1 (partial): chooseReviewColumn is a new function this Story introduces; it is labelled new in dataModel and is not an existing symbol.
- ts1 (partial): the Story carries no acceptance criteria; ac1-ac3 in the test mapping are derived from the request, not stated by the owner.
- alt2 (partial): the alternatives are scored against the request and testability only; the Story has no formal constraints, HLD contracts or Epic constraints.
- OWNER DECISION: when several groups other than the chat's are open, which one should the pane use? This LLD's choice: the active group if it is not the chat's, otherwise the one with the lowest column. Alternative: always the group that held the most recently active non-chat editor. Recommendation: keep the choice as written.
- DECIDED IN THE LLD (change to confirm): when no other group is open, the non-quiet path (the command and the delivery board) keeps ViewColumn.Active, as today; only a quiet open falls back to Beside, as today. No fallback changes.

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 11 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-14T19:30:06.468Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
