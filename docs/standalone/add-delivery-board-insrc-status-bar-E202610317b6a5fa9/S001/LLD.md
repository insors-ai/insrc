<!-- insrc:artifact LLD-7b6a5fa936278e5d-S001 -->

# LLD: E202610317b6a5fa9:S001

## Summary

**Epic:** `add-delivery-board-insrc-status-bar`
**HLD base run:** `wf-1793455544722-kt28ib`
**HLD effective hash:** `7b6a5fa93627...`

This Story adds a fifth entry, Delivery Board, to the VS Code plugin's status-bar click menu, alongside the existing Detailed Status, Repo Configuration, Model Tiers and Manage Connections items. Choosing it opens the same Delivery Board that is today only reachable via its own separate command. The new entry is wired through a new optional callback on the panel host's dependencies, structurally identical to the existing Manage Connections wiring, so the panel host stays free of any direct dependency on the delivery board's own module.

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

### 2.1 `MenuItem`

```typescript
interface MenuItem { readonly label: string; readonly action: 'detailed' | 'repoConfig' | 'modelTiers' | 'connections' | 'deliveryBoard'; }
```

**Returns:** `MenuItem` — A status-menu choice; action gains the new 'deliveryBoard' literal alongside the four existing ones.

**Preconditions:**
- Existing callers pattern-match or compare against the closed action union; adding a literal is additive and does not break existing exhaustive switches that have a default/else branch (showStatusMenu's own dispatch does).

**Postconditions:**
- MENU_ITEMS gains a 5th entry { label: 'Delivery Board', action: 'deliveryBoard' }.

### 2.2 `WebviewPanelHostDeps.onOpenDeliveryBoard`

```typescript
onOpenDeliveryBoard?: (() => void) | undefined
```

**Returns:** `void` — No return; a fire-and-forget sink the host invokes to open the Delivery Board.

**Preconditions:**
- Optional, mirroring onOpenConnections?: (() => void) | undefined exactly (vscode-plugin/src/panels/types.ts:319).

**Postconditions:**
- When undefined, the menu's Delivery Board choice logs a warning and opens nothing (no throw). When set, it is invoked inside the same try/catch-and-log shape as openConnections().

### 2.3 `showStatusMenu`

```typescript
showStatusMenu(): Promise<void>
```

**Returns:** `Promise<void>` — Resolves once the chosen menu action (now including Delivery Board) has been dispatched; unchanged resolution shape from today (vscode-plugin/src/panels/webview-host.ts:545-559).

**Preconditions:**
- chosen is undefined (Esc) remains a no-op, unchanged (ac1 precedent).

**Postconditions:**
- chosen.action === 'deliveryBoard' now routes to the new openDeliveryBoard() branch, alongside the unchanged detailed/repoConfig/modelTiers/connections branches.

### 2.4 `openDeliveryBoard`

```typescript
openDeliveryBoard(): void
```

**Returns:** `void` — No return; opens the Delivery Board via deps.onOpenDeliveryBoard when wired.

**Errors:**
- `caught-and-logged` when deps.onOpenDeliveryBoard() throws synchronously — caught in a try/catch and logged via the closure-captured `logger.warn(...)` (destructured from deps at webview-host.ts:147; there is no `logger` property on `this`), never surfaced (mirrors openConnections(), vscode-plugin/src/panels/webview-host.ts:538-542).

**Preconditions:**
- New method, structurally identical to the existing openConnections() (vscode-plugin/src/panels/webview-host.ts:528-543): same undefined-check + warn + no-op shape, same try/catch-and-log shape.

**Postconditions:**
- If deps.onOpenDeliveryBoard is undefined, logs a warning ('insrc: Delivery Board is unavailable — onOpenDeliveryBoard is not wired') and returns without opening anything.

### 2.5 `registerDeliveryBoard`

```typescript
registerDeliveryBoard(deps: DeliveryBoardWiringDeps): { open(): void }
```

**Returns:** `{ open(): void }` — Exposes the created board host's own `open()` so a caller elsewhere in extension.ts can invoke it; previously returned `void` with `host` kept entirely local (vscode-plugin/src/delivery/board-wiring.ts:54-76).

**Preconditions:**
- Same deps shape as today; this is a return-value change only, not a parameter change.

**Postconditions:**
- The returned object's `open()` calls the same `host.open()` the 'insrc.delivery.openBoard' command already calls (vscode-plugin/src/delivery/board-host.ts:64-65,726) — both paths open the identical board.

## 3. Data model changes

### 3.1 `MenuItem.action (vscode-plugin/src/panels/types.ts:226-230)` — field-modify

The closed string-literal union gains one new member: 'deliveryBoard', alongside the existing 'detailed' | 'repoConfig' | 'modelTiers' | 'connections'. No other field changes; label stays string.

**Call sites:**
- `vscode-plugin/src/panels/types.ts:226-230`
- `vscode-plugin/src/panels/webview-host.ts:52-56`

### 3.2 `WebviewPanelHostDeps (vscode-plugin/src/panels/types.ts)` — field-add

Adds one new optional field, onOpenDeliveryBoard?: (() => void) | undefined, directly beside the existing onOpenConnections?: (() => void) | undefined field (vscode-plugin/src/panels/types.ts:319). The CALLBACK ASSIGNED at extension.ts:500 is a closure (`() => { deliveryBoardOpen?.(); }`), not a direct reference to `host.open`, because `registerDeliveryBoard()` (extension.ts:897) runs ~500 lines after the panelHost deps object is constructed (extension.ts:398) — see 3.4.

**Call sites:**
- `vscode-plugin/src/panels/types.ts:319`
- `vscode-plugin/src/extension.ts:500`

### 3.3 `showStatusMenu dispatch (vscode-plugin/src/panels/webview-host.ts:545-559)` — invariant-change

The dispatch invariant widens from 'chosen.action is one of four known values, else Manage Connections' to 'chosen.action is one of five known values, with an explicit deliveryBoard branch before the Manage Connections else-fallthrough' — the else branch stays specific to 'connections' rather than becoming a catch-all for two actions.

**Call sites:**
- `vscode-plugin/src/panels/webview-host.ts:545-559`

### 3.4 `extension.ts module-scope binding` — new

A new module-scope mutable binding, `let deliveryBoardOpen: (() => void) | undefined;`, declared before the panelHost construction (extension.ts:398) so it is in scope for the `onOpenDeliveryBoard` closure assigned there. At extension.ts:897, the call is rewritten as `const deliveryBoard = registerDeliveryBoard({ ... });` (identical arguments, identical closing `});` line) with a NEW statement on the next line, `deliveryBoardOpen = deliveryBoard.open;` — the call itself is NOT chained (never `registerDeliveryBoard({...}).open`), so its own `registerDeliveryBoard({` … `\n  });` textual shape is preserved byte-for-byte. This is REQUIRED: `vscode-plugin/src/delivery/__tests__/board-icon.test.ts:42` regex-matches `/registerDeliveryBoard\(\{([\s\S]*?)\n  \}\);/` against extension.ts's raw source, and `vscode-plugin/src/delivery/__tests__/board-wiring.test.ts:75-77,144-145` does `EXT.indexOf('registerDeliveryBoard({')` then slices to `EXT.indexOf('\n  });', call)` — both break if the call's closing line becomes anything other than `  });` (e.g. a chained `.open;` would turn it into `}).open;`, breaking both). The closure captures `deliveryBoardOpen` by reference, so reading it after assignment resolves correctly even though the closure was created ~500 lines earlier; the binding is never read before a user actually opens the status menu, so the 500-line construction-order gap is harmless at runtime.

**Call sites:**
- `vscode-plugin/src/extension.ts:398` (declaration, before panelHost deps)
- `vscode-plugin/src/extension.ts:500` (closure reads it)
- `vscode-plugin/src/extension.ts:897` (the existing registerDeliveryBoard call, left textually unchanged; a new assignment statement follows it on the next line)
- `vscode-plugin/src/delivery/__tests__/board-icon.test.ts:42` (unmodified — its literal-text regex scan of the call continues to match because the call's own closing `});` is preserved)
- `vscode-plugin/src/delivery/__tests__/board-wiring.test.ts:75-77,144-145` (unmodified — its literal-text indexOf scan of the call continues to match for the same reason)

## 4. Error paths

**Error cases**

- **The Delivery Board menu item is chosen but the panel host was constructed without onOpenDeliveryBoard wired (extension.ts omitted it).** (recoverable)
  - Detection: openDeliveryBoard() checks `if (deps.onOpenDeliveryBoard === undefined)`.
  - Response: Logs a warning (e.g. 'insrc: Delivery Board is unavailable — onOpenDeliveryBoard is not wired') and returns; no panel opens, no throw.
  - User impact: The menu dismisses with no visible panel; the warning is only in the extension's output channel/logs, matching today's unwired-onOpenConnections behavior exactly.
- **deps.onOpenDeliveryBoard is wired but throws synchronously when invoked (e.g. the delivery board's open() call fails).** (recoverable)
  - Detection: openDeliveryBoard() wraps the call in a try/catch.
  - Response: The catch block logs the error via the closure-captured `logger.warn` and swallows it; showStatusMenu()'s returned Promise still resolves normally.
  - User impact: The menu dismisses with no visible panel; no unhandled rejection or crash reaches the user.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The status menu is dismissed (Esc) while Delivery Board is one of the five offered items. | chosen is undefined; showStatusMenu() returns without calling any open*() method, unchanged from today's ac1 no-op behavior for a dismissed menu. |
| A second rapid status-menu invocation picks Delivery Board again before the first board panel finishes opening. | Out of scope for this Story: openDeliveryBoard() simply re-invokes deps.onOpenDeliveryBoard() each time, exactly as openConnections() does today for Manage Connections; any single-instance/reveal-vs-duplicate behavior lives inside the delivery board's own host (board-host.ts), not in this Story's dispatch. |

**Invariants to preserve**

- A dismissed status menu (chosen === undefined) is a no-op: no open*() method is invoked, regardless of how many items the menu now offers. [[c1]]
- Every open*() sink method (openDetailedStatus/openRepoConfiguration/openModelTiers/openConnections, and now openDeliveryBoard) never throws out of showStatusMenu(): an unwired dep logs a warning and no-ops, a wired dep's throw is caught and logged — this never-throw contract is unchanged by adding a fifth sink. [[c1]]
- webview-host.ts stays free of any direct dependency on vscode or on delivery/board-wiring.ts; the new Delivery Board open behavior crosses the seam only through the optional callback field on WebviewPanelHostDeps, exactly like every other open*() sink. [[c1]]
- The registerDeliveryBoard() call site in extension.ts (line 897) keeps its exact textual shape — `registerDeliveryBoard({` … `\n  });` — byte-for-byte: `board-icon.test.ts:42`'s regex `/registerDeliveryBoard\(\{([\s\S]*?)\n  \}\);/` and `board-wiring.test.ts:75-77,144-145`'s `EXT.indexOf('registerDeliveryBoard({')` / `EXT.indexOf('\n  });', call)` both scan extension.ts's raw source text for this literal shape; the return-value capture is a separate next-line statement, never chained onto the call itself. [[c6]]

## 5. Test strategy

**Test framework:** `node:test (tsx --test), extending vscode-plugin/src/panels/__tests__/webview-host.test.ts's existing makeHost()/MenuItem test pattern`

**Test levels**

- **unit** — Verify the menu now offers five items including Delivery Board, and that choosing it dispatches to the new onOpenDeliveryBoard sink with the same never-throw/unwired-warns shape as every other sink.
  - Subjects: `vscode-plugin/src/panels/webview-host.ts showStatusMenu()`, `vscode-plugin/src/panels/webview-host.ts openDeliveryBoard()`, `vscode-plugin/src/panels/webview-host.ts MENU_ITEMS`
  - Fixtures: `makeHost() test helper extended with an onOpenDeliveryBoard opt, mirroring its existing onOpenConnections opt (vscode-plugin/src/panels/__tests__/webview-host.test.ts:73-116)`
- **unit** — Confirm the registerDeliveryBoard() call site's unchanged literal text shape (required by migration step 7) keeps two pre-existing, unmodified tests passing.
  - Subjects: `vscode-plugin/src/delivery/__tests__/board-icon.test.ts:42`, `vscode-plugin/src/delivery/__tests__/board-wiring.test.ts:75-77,144-145`
  - Fixtures: none — these tests are run unmodified against the post-migration extension.ts to prove the call site's `registerDeliveryBoard({` … `\n  });` shape survived.

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `webview-host.test.ts: showStatusMenu offers EXACTLY five items, including Delivery Board, updating the existing 'offers EXACTLY four items' assertion (webview-host.test.ts:122-129) to the five-item label list ['Detailed Status','Repo Configuration','Model Tiers','Manage Connections','Delivery Board']` |
| `ac2` | `webview-host.test.ts: choosing Delivery Board invokes the wired onOpenDeliveryBoard sink exactly once` |
| `ac3` | `webview-host.test.ts: openDeliveryBoard(): unwired onOpenDeliveryBoard logs a warning and opens nothing (no throw), mirroring webview-host.test.ts:154-159's onOpenConnections-unwired test` |
| `ac4` | `webview-host.test.ts: openDeliveryBoard(): a synchronous throw from a wired onOpenDeliveryBoard fake is caught and logged, mirroring webview-host.test.ts:161-171's onOpenConnections-throw test` |
| `ac5` | `board-icon.test.ts:42 and board-wiring.test.ts:75-77,144-145 (existing tests, unmodified) continue to pass after the migration, confirming the registerDeliveryBoard() call site's literal text shape was preserved` |

## 6. Migration

**State before:** MenuItem.action is a closed union of 'detailed' | 'repoConfig' | 'modelTiers' | 'connections' (vscode-plugin/src/panels/types.ts:226-230); MENU_ITEMS holds exactly four entries (vscode-plugin/src/panels/webview-host.ts:52-56); showStatusMenu() dispatches four ways, with 'connections' as the else-fallthrough (vscode-plugin/src/panels/webview-host.ts:545-559); WebviewPanelHostDeps has no onOpenDeliveryBoard field; the Delivery Board is opened only via its own independently-registered 'insrc.delivery.openBoard' command (registerDeliveryBoard, vscode-plugin/src/delivery/board-wiring.ts:54-76), unreachable from the status menu.

**State after:** MenuItem.action gains 'deliveryBoard'; MENU_ITEMS holds five entries, the new one labeled 'Delivery Board'; showStatusMenu() gains an explicit branch for 'deliveryBoard' calling the new openDeliveryBoard() method, with 'connections' remaining its own explicit branch (no longer the catch-all else); WebviewPanelHostDeps gains an optional onOpenDeliveryBoard?: (() => void) | undefined field; registerDeliveryBoard() now returns `{ open(): void }` instead of `void`; extension.ts declares a module-scope `deliveryBoardOpen` binding before the panelHost deps object, wires `onOpenDeliveryBoard: () => { deliveryBoardOpen?.(); }` into that deps object, and assigns `deliveryBoardOpen = registerDeliveryBoard({...}).open` once registerDeliveryBoard() runs later in the same function — so choosing Delivery Board from the status menu opens the same board the existing command opens.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add 'deliveryBoard' to MenuItem's action union in panels/types.ts. — ↩ rollbackable
2. Add onOpenDeliveryBoard?: (() => void) | undefined to WebviewPanelHostDeps in panels/types.ts, beside the existing onOpenConnections field. — ↩ rollbackable
3. Add { label: 'Delivery Board', action: 'deliveryBoard' } to MENU_ITEMS in webview-host.ts. — ↩ rollbackable
4. Add an openDeliveryBoard() method to the panel host, structurally identical to openConnections(): unwired warns + no-op, wired call caught-and-logged on throw. — ↩ rollbackable
5. Add a 'deliveryBoard' branch to showStatusMenu()'s dispatch calling this.openDeliveryBoard(), keeping the 'connections' branch explicit rather than the remaining else-fallthrough. — ↩ rollbackable
6. Change registerDeliveryBoard()'s return type from `void` to `{ open(): void }`, returning the created host's own `open` method. — ↩ rollbackable
7. In extension.ts, declare `let deliveryBoardOpen: (() => void) | undefined;` before the panelHost construction (line 398), wire `onOpenDeliveryBoard: () => { deliveryBoardOpen?.(); }` into panelHost's deps, and at the existing registerDeliveryBoard() call site (line 897) capture its return value into a new local const on the SAME call (`const deliveryBoard = registerDeliveryBoard({...});`, closing `});` unchanged) followed by a new next-line statement `deliveryBoardOpen = deliveryBoard.open;` — never chaining `.open` directly onto the call, so the call's own textual shape stays exactly what board-icon.test.ts:42 and board-wiring.test.ts:75-77,144-145 already regex/indexOf-scan for. — ↩ rollbackable

**Backward compat:** Purely additive: the action union gains one literal (existing exhaustive consumers with an else/default branch are unaffected), WebviewPanelHostDeps gains one optional field (existing callers that omit it are unaffected, matching every other optional sink field), and the existing 'insrc.delivery.openBoard' command plus its direct wiring in extension.ts are untouched — the Delivery Board remains reachable exactly as it is today, with the status menu now offering a second path to the same board.

## 7. Alternatives considered

### 7.1 a1: Mirror the existing onOpenConnections optional-callback pattern — **CHOSEN**

Add 'deliveryBoard' to MenuItem's action union, a 5th MENU_ITEMS entry, an onOpenDeliveryBoard?: (() => void) | undefined field on the deps interface, and an openDeliveryBoard() method structurally identical to openConnections().



### 7.2 a2: showStatusMenu calls vscode.commands.executeCommand('insrc.delivery.openBoard') directly

Skip the new callback; have the menu's 'deliveryBoard' branch invoke VS Code's command-execution API directly by the already-registered command id.



**Rejected because:** Violates webview-host.ts's documented and tested vscode-free boundary, and diverges from the established sink pattern used for every other menu action in the same dispatch.

### 7.3 a3: Generic 'custom action' extensibility hook on MenuItem

Replace the closed action union with an open-ended action id + a map of registered handlers.



**Rejected because:** Over-engineers a generic extensibility mechanism nobody asked for, forces migrating every existing menu action, and loses compile-time exhaustiveness checking — far exceeds the Story's one-item scope.

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/panels/types.ts:226-230`
- **[[c2]]** `code` `vscode-plugin/src/panels/types.ts:319`
- **[[c3]]** `code` `vscode-plugin/src/panels/webview-host.ts:528-559`
- **[[c4]]** `code` `vscode-plugin/src/extension.ts:500`
- **[[c5]]** `code` `vscode-plugin/src/delivery/board-wiring.ts:54-76`
- **[[c6]]** `code` `vscode-plugin/src/delivery/__tests__/board-icon.test.ts:42`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 11 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-31T14:35:01.690Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
