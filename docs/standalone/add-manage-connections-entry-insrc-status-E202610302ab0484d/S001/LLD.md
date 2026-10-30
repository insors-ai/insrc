<!-- insrc:artifact LLD-2ab0484d51a0556c-S001 -->

# LLD: E202610302ab0484d:S001

## Summary

**Epic:** `add-manage-connections-entry-insrc-status`
**HLD base run:** `wf-1793378277755-da5451`
**HLD effective hash:** `2ab0484d51a0...`

Adds a fourth entry, "Manage Connections", to the insrc status-bar click menu, alongside Detailed Status / Repo Configuration / Model Tiers. Choosing it opens the extension's existing, already-shipped Connections panel — the same panel the Command Palette's "Manage Connections" command and the Repo Configuration settings link already open. No new panel, UI, or backend capability is introduced; this Story only adds one more doorway into what already exists.

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

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `WebviewPanelHost.openConnections`

```typescript
openConnections(): void
```

**Returns:** `void` — No return value; this is a fire-and-forget dispatch, matching openDetailedStatus/openRepoConfiguration/openModelTiers.

**Preconditions:**
- The host has been constructed via createWebviewPanelHost (vscode-plugin/src/panels/webview-host.ts), the same lifecycle every other open* method assumes.

**Postconditions:**
- If WebviewPanelHostDeps.onOpenConnections is wired, it is invoked inside a try/catch, matching the module's established "a sink throw must not surface (never-throw)" precedent already used by onDetailAction (webview-host.ts:298-303), onRepoConfigWrite, onRepoRegisterProviders and onModelTiersWrite — NOT the open* methods, which take no deps-callback and so set no precedent for this call.
- A synchronous throw from deps.onOpenConnections is caught and logged via deps.logger.warn; it never propagates out of openConnections() or showStatusMenu()'s dispatch.
- If it is NOT wired, deps.logger.warn is called once and nothing else happens — there is no placeholder body to render for an externally-owned panel, unlike repoRenderer/modelTiersRenderer which fall back to an in-host placeholder.

### 2.2 `WebviewPanelHost.showStatusMenu`

```typescript
showStatusMenu(): Promise<void>
```

**Returns:** `Promise<void>` — Resolves once the user's QuickPick choice has been routed to the matching open method, or settles immediately on dismiss (Esc).

**Preconditions:**
- deps.pickMenu is wired (unconditional dependency, unchanged from today).

**Postconditions:**
- MENU_ITEMS now carries 4 entries; a chosen.action === 'connections' routes to this.openConnections().
- The existing three branches (detailed/repoConfig/modelTiers, vscode-plugin/src/panels/webview-host.ts:527-541) are unchanged in behavior and order.

## 3. Data model changes

### 3.1 `MenuItem` — field-modify

The action union gains a 4th literal member 'connections', alongside the existing 'detailed' | 'repoConfig' | 'modelTiers'. No other field of MenuItem (label) changes.

**Call sites:**
- `vscode-plugin/src/panels/types.ts:224-228`
- `vscode-plugin/src/panels/webview-host.ts:52-56`
- `vscode-plugin/src/panels/webview-host.ts:527-541`

### 3.2 `WebviewPanelHostDeps` — field-add

New OPTIONAL onOpenConnections?: () => void field. Its INVOCATION in openConnections() follows the module's "a sink throw must not surface (never-throw)" precedent (try/catch + logger.warn, matching onDetailAction/onRepoConfigWrite/onRepoRegisterProviders/onModelTiersWrite), not the open*-method fallback-to-placeholder style: there is no placeholder body for an externally-owned panel, so an unwired dep logs a warning and opens nothing.

**Call sites:**
- `vscode-plugin/src/panels/types.ts:249-310`
- `vscode-plugin/src/extension.ts:104-927`

### 3.3 `MENU_ITEMS` — field-add

The module-level MENU_ITEMS array gains a 4th row { label: 'Manage Connections', action: 'connections' }, appended after the existing Model Tiers row.

**Call sites:**
- `vscode-plugin/src/panels/webview-host.ts:52-56`

## 4. Error paths

**Error cases**

- **The host is constructed without WebviewPanelHostDeps.onOpenConnections wired (e.g. an older extension.ts build, or a test fake that omits it) and the user picks 'Manage Connections' from the menu.** (recoverable)
  - Detection: openConnections() checks deps.onOpenConnections via optional chaining (deps.onOpenConnections?.()); the call resolves to undefined when unwired.
  - Response: deps.logger.warn(...) is called once with a message naming the missing wiring; no panel opens and no exception is thrown.
  - User impact: The menu item is selectable but silently does nothing beyond the warning (visible only in the extension's own output channel, not a user-facing toast) — identical degrade style to how repoRenderer/modelTiersRenderer being unwired falls back to a placeholder instead of crashing.
- **deps.onOpenConnections, when wired, throws synchronously (a host-level contract case, provable with a throwing test fake) — OR, separately, its real production binding (connectionManager.open(), an async method) returns a promise that rejects. host.ts:93-113 shows open()'s body has synchronous calls (createPanel(), panel.setHtml(...), panel.reveal(), this.#bindTest()) that run BEFORE its one internal try/catch; because open() is declared async, a throw from any of them is converted into a REJECTED promise, not a synchronous exception — so open() is not proven never to reject.** (recoverable)
  - Detection: openConnections() wraps deps.onOpenConnections?.() in try/catch (matching the sink precedent) and catches a SYNCHRONOUS throw there. That try/catch cannot catch an asynchronous rejection from a promise the callback fires-and-forgets (JS try/catch does not catch rejections of an unawaited promise) — so the real production wiring additionally attaches its own .catch to connectionManager.open()'s returned promise in extension.ts, independent of openConnections()'s try/catch.
  - Response: A synchronous throw is caught by openConnections()'s try/catch and logged via deps.logger.warn, exactly like the other deps-callback sinks. A rejected connectionManager.open() promise is caught by extension.ts's own .catch on the wiring and logged there — neither path leaves an unhandled exception or an unhandled promise rejection.
  - User impact: No surfaced error in either case: the panel simply fails to open, with a warning logged (host-side logger.warn for a sync throw, or the extension.ts wiring's own warn for an async rejection).

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The user opens the status-bar menu and picks 'Manage Connections' while the Connections panel is already open. | connectionManager.open() is the SAME existing method the Command Palette command already calls today, so this Story inherits its existing create-or-reveal semantics unchanged — this Story adds no new logic to decide that behavior. |
| The user dismisses the QuickPick (Esc) without choosing any of the 4 items, including the new one. | showStatusMenu() returns immediately (chosen === undefined check at vscode-plugin/src/panels/webview-host.ts, unchanged) — no open* method, including openConnections(), is called. |
| A test constructs createWebviewPanelHost with a fakes object that has every OTHER optional dep (repoRenderer, modelTiersRenderer, etc.) wired but omits onOpenConnections specifically. | Only the Connections menu item degrades (warn + no-op); Detailed Status / Repo Configuration / Model Tiers continue to open normally — the four open* methods are independent, matching the existing pattern where modelTiersRenderer being unwired does not affect repoRenderer. |

**Invariants to preserve**

- MenuItem.action is a closed union with no default/fallthrough case in showStatusMenu's dispatch (today: if/else-if/else over 'detailed'/'repoConfig'/'modelTiers', the final else implicitly catching 'modelTiers') — adding 'connections' must keep every branch an explicit check, not silently fall into an existing branch's final else. [[c1]]
- Every optional WebviewPanelHostDeps field added after the S004 shell (repoRenderer, onRepoConfigWrite, onRepoRegisterProviders, modelTiersRenderer, onModelTiersWrite) degrades gracefully when unwired rather than throwing — onOpenConnections must follow the same contract. [[c1]]
- The panels module (vscode-plugin/src/panels) imports nothing from connections/* today — this Story must not introduce that import (a1's design already avoids it). [[c1]]
- Every existing optional deps-callback SINK in webview-host.ts (onDetailAction, onRepoConfigWrite, onRepoRegisterProviders, onModelTiersWrite) wraps its invocation in try/catch with the documented rule "a sink throw must not surface (never-throw)" (webview-host.ts:298-303 et al.) — onOpenConnections must follow this SAME precedent, not the unguarded open*-method dispatch style this LLD originally (incorrectly) cited. [[c1]]

## 5. Test strategy

**Test framework:** `node:test (tsx --test)`

**Test levels**

- **unit** — Verify MENU_ITEMS/showStatusMenu dispatch and openConnections() in isolation over fakes, matching the existing webview-host.test.ts pattern used for the detailed/repoConfig/modelTiers entries.
  - Subjects: `webview-host.ts MENU_ITEMS`, `webview-host.ts showStatusMenu`, `webview-host.ts openConnections`
  - Fixtures: `a fake WebviewPanelHostDeps with onOpenConnections wired`, `a fake WebviewPanelHostDeps with onOpenConnections omitted`, `a fake pickMenu resolving to each of the 4 MenuItem choices in turn`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `webview-host.test.ts: MENU_ITEMS carries a 4th 'Manage Connections' entry with action 'connections', after the existing 3` |
| `ac2` | `webview-host.test.ts: showStatusMenu routes a chosen.action === 'connections' pick to openConnections(), leaving the other 3 branches unchanged` |
| `ac3` | `webview-host.test.ts: openConnections() invokes deps.onOpenConnections exactly once when wired; when unwired it calls deps.logger.warn once and opens nothing (no throw)` |
| `ac4` | `webview-host.test.ts: the existing 'showStatusMenu offers EXACTLY three items...' test is RENAMED and extended to expect the 4-item list ['Detailed Status','Repo Configuration','Model Tiers','Manage Connections'], and still verifies routing for all 4 choices (this test is AMENDED, not left unmodified)` |
| `ac5` | `webview-host.test.ts: openConnections() catches a synchronous throw from a wired onOpenConnections fake and logs it via deps.logger.warn, matching the onDetailAction/onRepoConfigWrite/onRepoRegisterProviders/onModelTiersWrite sink precedent — the throw never propagates out of openConnections() or showStatusMenu()` |

## 6. Migration

**State before:** MENU_ITEMS (vscode-plugin/src/panels/webview-host.ts:52-56) carries 3 entries; MenuItem.action (vscode-plugin/src/panels/types.ts:224-228) is 'detailed' | 'repoConfig' | 'modelTiers'; showStatusMenu (webview-host.ts:527-541) dispatches via if/else-if/else over those 3; WebviewPanelHostDeps (types.ts:249-310) has no connections-related field; extension.ts wires the Connections panel independently via registerConnectionCommands (connections/wiring.ts:12-20) directly to connectionManager.open(), with no path through WebviewPanelHost.

**State after:** MENU_ITEMS carries 4 entries; MenuItem.action is 'detailed' | 'repoConfig' | 'modelTiers' | 'connections'; showStatusMenu dispatches to a new openConnections() on a 4th explicit branch; WebviewPanelHostDeps carries an optional onOpenConnections?: () => void field; extension.ts additionally wires onOpenConnections: () => void connectionManager.open() when constructing the panel host, alongside its existing registerConnectionCommands wiring (which is left untouched).

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the 'connections' literal to MenuItem.action's union (types.ts) and add onOpenConnections?: () => void to WebviewPanelHostDeps (types.ts), plus an openConnections(): void member on WebviewPanelHost (types.ts). — ↩ rollbackable
2. Add a 4th MENU_ITEMS row ({ label: 'Manage Connections', action: 'connections' }), an openConnections() implementation that invokes deps.onOpenConnections?.() inside a try/catch + logger.warn (matching the onDetailAction/onRepoConfigWrite/onRepoRegisterProviders/onModelTiersWrite sink precedent), and a 4th showStatusMenu dispatch branch to webview-host.ts. Also rename and extend the existing 'showStatusMenu offers EXACTLY three items...' test to the 4-item list. — ↩ rollbackable
3. In extension.ts, pass onOpenConnections: () => { connectionManager.open().catch((err) => logger.warn(...)); } into the panelHost construction — attaching its own .catch to the promise connectionManager.open() returns (defense-in-depth against a rejection; host.ts's open() is not proven never to reject, see errorPaths) — reusing the connectionManager instance already constructed for registerConnectionCommands. — ↩ rollbackable

**Backward compat:** Purely additive: a 4th union member and a new optional dependency field are both additive TypeScript changes with no removed/renamed members, so any existing caller or test fake that omits onOpenConnections keeps compiling and behaves exactly as it does today (openConnections() degrades to a warn, not a throw). No existing command id, panel, or IPC shape changes.

## 7. Alternatives considered

### 7.1 a1: Plain injected open callback — **CHOSEN**

Add a bare onOpenConnections?: () => void dependency; a new openConnections() method calls it.



### 7.2 a2: Typed Pick<ConnectionsManagerHost,'open'> dependency

Inject the connections host's own open()-only slice, typed via Pick<ConnectionsManagerHost,'open'>, exactly mirroring registerConnectionCommands' own parameter type.



**Rejected because:** Functionally equivalent to a1 but trades a clean module boundary for type precision the Story does not need — requires types.ts's first import from connections/host.ts, coupling two module families s1 found wired independently today.

### 7.3 a3: Generic command-execute passthrough

Inject a generic executeCommand(id: string): void dependency; openConnections() calls it with the literal 'insrc.openDataSources' command id.



**Rejected because:** Introduces a stringly-typed, broader-than-needed capability and breaks the module's established narrow-callback idiom — no other WebviewPanelHostDeps field is a generic command-id executor.

## 8. References

- **[[c1]]** `analyze-bundle` `s1 symbol.locate+module.profile: WebviewPanelHost/MenuItem/WebviewPanelHostDeps/MENU_ITEMS/showStatusMenu (vscode-plugin/src/panels/types.ts:35-44,224-228,249-310; vscode-plugin/src/panels/webview-host.ts:52-56,466,489,508,527-541) and ConnectionsManagerHost/registerConnectionCommands (vscode-plugin/src/connections/host.ts:31-260; vscode-plugin/src/connections/wiring.ts:12-20; vscode-plugin/src/extension.ts:104-927)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 11 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T16:50:15.658Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
