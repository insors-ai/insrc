<!-- insrc:artifact LLD-c4c420c22b71651e-S001 -->

# LLD: E20261004c4c420c2:S001

## Summary

**Epic:** `vs-code-plugin-lock-insrc-chat`
**HLD base run:** `wf-1791092343566-1q6di1`
**HLD effective hash:** `1c633dd2bb5d...`

The insrc chat opens as a tab in an editor split, and today any file picked in the Explorer can open as another tab on top of it. This story makes the plugin lock the chat's editor group the first time the chat tab is the active tab, on a fresh open and after a window reload, so files open in a different group instead. A new setting, insrc.chat.lockGroup (on by default), turns the lock off for anyone who prefers tabs to stack on the chat; no user settings are written.

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

**Surface level:** public

### 2.1 `webviewPanelChannel`

```typescript
(panel: vscode.WebviewPanel) => ChatPanelChannel
```

**Parameters:**
- `panel: vscode.WebviewPanel` — The freshly created or VS-Code-restored chat panel to wrap.

**Returns:** `ChatPanelChannel` — Unchanged channel adapter over the panel.

**Preconditions:**
- Existing adapter in extension.ts, called for both the createPanel dep and the serializer restore callback, inside the chatEnabled block.

**Postconditions:**
- Signature and returned channel are unchanged.
- Additionally attaches the group lock to the panel once per panel object, so the fresh and the restored path are both covered by the single adapter.
- The group-lock factory and its seams are constructed inside the chatEnabled block, and the existing createPanel literal (createWebviewPanel(viewType, title, vscode.ViewColumn.Beside, ...)) is left intact, as the existing wiring test requires.

### 2.2 `isChatTabInput`

```typescript
(input: unknown, viewType: string) => boolean
```

**Parameters:**
- `input: unknown` — The raw `input` of the window's active tab (or undefined when there is no active tab); unknown because it is whatever VS Code reports and is narrowed structurally here.
- `viewType: string` — The chat panel's view type ('insrc.chatPanel', passed from chat-panel.ts's exported constant).

**Returns:** `boolean` — True only when input is a non-null object whose `viewType` property is a string that EQUALS viewType or ENDS WITH '-' + viewType (the 'mainThreadWebview-insrc.chatPanel' runtime form). False for undefined, non-objects, inputs without a string viewType, and any other view type (e.g. the docs-review panel).

**Preconditions:**
- New pure function exported from the new vscode-free module vscode-plugin/src/chat/group-lock.ts.

**Postconditions:**
- Pure and total: never throws, no side effects.
- This is the single definition of the view-type matching rule; extension.ts contains no comparison of its own.

### 2.3 `createChatGroupLock`

```typescript
(deps: ChatGroupLockDeps) => { attach(panel: LockablePanel): void }
```

**Parameters:**
- `deps.enabled: () => boolean` — Live read of insrc.chat.lockGroup (true unless explicitly false); read at each attempt.
- `deps.viewType: string` — The chat view type handed to isChatTabInput.
- `deps.activeTabInput: () => unknown` — Returns the raw input of the active tab group's active tab, or undefined; a thin seam with no logic.
- `deps.onTabsChanged: (listener: () => void) => { dispose(): void }` — Subscribes to tab-model changes (both tab changes and tab-group changes), the second retry trigger.
- `deps.lockActiveGroup: () => PromiseLike<unknown>` — Runs VS Code's workbench.action.lockEditorGroup on the active group; the result value is ignored.
- `deps.warn: (message: string) => void` — Reports a failed attempt without surfacing it to the user.

**Returns:** `{ attach(panel: LockablePanel): void }` — attach wires one panel. LockablePanel is the structural slice { readonly active: boolean; onDidChangeViewState(listener: () => unknown): { dispose(): void }; onDidDispose(listener: () => unknown): unknown }.

**Errors:**
- `Error (caught, never propagated)` when Any dep throws or the lock command rejects; the error message goes to deps.warn and attach never throws into the panel create/restore path.

**Preconditions:**
- New factory exported from vscode-plugin/src/chat/group-lock.ts; the module imports nothing from 'vscode'.

**Postconditions:**
- attach makes one attempt immediately, then one on every panel view-state change and every tab-model change, until the panel is finished.
- An attempt issues the lock command only when panel.active is true AND isChatTabInput(deps.activeTabInput(), deps.viewType) is true AND deps.enabled() is true.
- The lock command is issued at most once per attached panel; once issued (whether it resolves or rejects) the panel is finished.
- A panel is also finished when it is disposed. Finishing disposes both subscriptions.
- When deps.enabled() is false the panel is not finished, so turning the setting on later takes effect at the next attempt.
- Best-effort targeting: the check and the command are not atomic, so a focus change between them can lock a different group; the design narrows this to that window and does not claim to eliminate it.

## 3. Data model changes

### 3.1 `insrc.chat.lockGroup (contributed setting)` — new

New boolean in the 'Chat (preview)' configuration group of vscode-plugin/package.json, default true, scope machine (matching the sibling insrc.chat.* settings). Description states that the chat's editor group is locked so files opened from the Explorer do not open as tabs over the chat, and that the group is locked again the first time the chat is focused after each window reload. Read with the full dotted key via vscode.workspace.getConfiguration().get<boolean>('insrc.chat.lockGroup') !== false.

**Call sites:**
- `vscode-plugin/package.json`
- `vscode-plugin/src/extension.ts`

### 3.2 `chat view-type constant (chat-panel.ts VIEW_TYPE)` — field-modify

The module-private constant 'insrc.chatPanel' becomes an exported constant so extension.ts passes it to the group lock instead of introducing another copy of the literal. Its value and its use inside chat-panel.ts are unchanged; the existing invariant that chat-panel.ts stays vscode-free is unaffected.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/extension.ts`

### 3.3 `vscode shim (src/vscode.d.ts)` — field-add

Compile-only additions mirroring the real API: WebviewPanel.onDidChangeViewState(listener): Disposable; window.tabGroups with activeTabGroup.activeTab (possibly undefined) exposing `input: unknown`, plus onDidChangeTabs and onDidChangeTabGroups events. No TabInputWebview class is needed because the predicate narrows structurally. No runtime dependency is added.

**Call sites:**
- `vscode-plugin/src/vscode.d.ts`
- `vscode-plugin/src/extension.ts`

## 4. Error paths

**Error cases**

- **The lock command rejects or is unavailable (an editor fork without workbench.action.lockEditorGroup).** (recoverable)
  - Detection: The PromiseLike returned by deps.lockActiveGroup() rejects, or the call throws synchronously; both are caught inside the attempt.
  - Response: Send the message to deps.warn and finish the panel (no retry of a command that cannot succeed); both subscriptions are disposed. The chat keeps working unlocked.
  - User impact: Group is not locked; behaviour is as before this story. Nothing is shown to the user.
- **The tab-groups API is missing or shaped unexpectedly at runtime.** (recoverable)
  - Detection: deps.activeTabInput() throws (caught by the attempt's try/catch) or returns a value isChatTabInput rejects structurally.
  - Response: No lock at this attempt; a thrown error goes to deps.warn. The panel is not finished, so later events retry.
  - User impact: Group stays unlocked; nothing else is affected.
- **deps.enabled throws.** (recoverable)
  - Detection: The attempt body runs inside try/catch in group-lock.ts.
  - Response: deps.warn with the error; the panel is not finished so a later event retries.
  - User impact: Group stays unlocked for now.
- **Focus moves to another group between the guard check and the lock command executing.** (recoverable)
  - Detection: Not detectable from the extension host: the command takes no target and reports no group.
  - Response: None possible; the design accepts this as the residual best-effort window. The user can unlock the affected group from its menu.
  - User impact: Rarely, a group other than the chat's is locked.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Fresh open where the panel is active and the tab model already reports the chat as the active tab at attach time. | Locks once on the immediate attempt; both subscriptions are disposed. |
| Fresh open where the panel's view-state event arrives BEFORE the tab model reports the chat tab (the two channels have no ordering guarantee). | The view-state attempt does not lock; the following tab-model change triggers another attempt, which locks. |
| Fresh open where the tab model updates first and the panel becomes active afterwards. | The tab-change attempt does not lock (panel not active); the view-state change attempt locks. |
| Restored panel that is a background tab or in a non-active group after a window reload. | No lock and no focus change at restore; locks the first time the user focuses the chat. |
| insrc.chat.lockGroup is false. | Never locks while false. If set to true later, the next attempt on a still-unfinished panel locks. |
| User manually unlocks the group after the plugin locked it. | Not re-locked for that panel object. After a window reload the restored chat is a new panel object and locks again on first focus; the setting is the way to opt out permanently. |
| Panel is disposed before it was ever locked. | Both subscriptions disposed, no lock, no error. |
| View-state or tab events fire after the panel is finished. | Ignored; the lock command count for that panel stays at one (or zero). |
| Another insrc webview (docs review, view type insrc.docsReviewPanel) or a text editor is the active tab while the chat panel object reports active. | isChatTabInput is false, so no lock at that attempt. |
| ViewColumn.Beside reuses an existing side group that already holds the user's files (ordinary two-column layout). | The shared group is locked when the chat tab is active in it; existing tabs stay and can still be used, but new files open in another group. The lock stays on that group if the chat tab is closed while other tabs remain; the user unlocks it from the group menu. |
| chatHost.open() on a live panel (reveal) and chatHost.adopt() of a restored panel. | Reveal creates no panel, so nothing is attached twice; an adopted panel is a distinct object and gets its own single attach via the adapter. |

## 5. Test strategy

**Test framework:** `node:test via tsx (`npm test` in vscode-plugin: tsx --test 'src/**/__tests__/*.test.ts'), node:assert/strict, hand-rolled fakes`

**Test levels**

- **unit** — Prove the whole lock decision in the vscode-free module with a fake panel and counting deps, using the real isChatTabInput (never a stubbed predicate). The story defines four acceptance criteria: ac1 the lock is issued for the chat's tab on a fresh open regardless of event order; ac2 a restored panel locks on first focus through the same adapter; ac3 the insrc.chat.lockGroup setting gates it; ac4 it is issued at most once per panel and failures never propagate. Each test must be shown red under its named mutation before it is accepted.
  - Subjects: `vscode-plugin/src/chat/__tests__/group-lock.test.ts: isChatTabInput is true for { viewType: 'mainThreadWebview-insrc.chatPanel' } and for { viewType: 'insrc.chatPanel' }`, `group-lock.test.ts: isChatTabInput is false for { viewType: 'mainThreadWebview-insrc.docsReviewPanel' }, for a viewType that merely contains the chat type mid-string, for an input with no viewType (text editor), for a non-string viewType, for null and for undefined (mutations: always-true, always-false, strict-equality-only)`, `group-lock.test.ts: locks once on the immediate attempt when the panel is active and the active tab input is the chat`, `group-lock.test.ts: view-state event first with a non-chat tab input does not lock; a later tab-change event with the chat input locks (mutation: drop the onTabsChanged subscription)`, `group-lock.test.ts: tab-change event first while the panel is not active does not lock; a later view-state change to active locks (mutation: drop the panel.active check)`, `group-lock.test.ts: a non-active restored panel does not lock at attach and locks on its first activation`, `group-lock.test.ts: does not lock while the active tab input is the docs-review webview even though the panel reports active (mutation: drop the tab-input guard)`, `group-lock.test.ts: never locks while enabled() is false; locks at the next event after it flips to true (mutation: drop the enabled check)`, `group-lock.test.ts: further view-state and tab events after a lock do not issue the command again, and both subscriptions are disposed (mutation: drop the finished flag)`, `group-lock.test.ts: a panel disposed before locking disposes both subscriptions and never locks`, `group-lock.test.ts: a rejecting and a synchronously throwing lockActiveGroup are each reported via warn, attach does not throw, and no retry follows`, `group-lock.test.ts: a throwing enabled() or activeTabInput() is reported via warn and a later event retries and locks`
  - Fixtures: `a fake LockablePanel with a settable `active` flag and manual fire() for view-state and dispose`, `a fake tab source with a settable active input and manual fire() for tab changes, counting live subscriptions`
- **contract** — Pin the manifest contract and the presence of the wiring. These assertions do not claim behaviour: the manifest check parses package.json, and the source checks only establish that the seams exist and are thin (the predicate lives in the unit-tested module).
  - Subjects: `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts: package.json contributes insrc.chat.lockGroup (boolean, default true, scope machine)`, `extension-chat-wiring.test.ts: inside the chatEnabled block, createChatGroupLock is constructed with the exported chat view type, the lock seam executes 'workbench.action.lockEditorGroup', the setting is read with the full dotted key, both tab-change events are subscribed, and webviewPanelChannel calls attach(panel)`, `extension-chat-wiring.test.ts: extension.ts contains no view-type comparison of its own (no 'insrc.chatPanel' literal other than the serializer registration)`, `extension-chat-wiring.test.ts: group-lock.ts is vscode-free`, `existing extension-chat-wiring.test.ts assertions stay green unmodified (createPanel literal with ViewColumn.Beside, chatEnabled block extraction)`
- **smoke** — Manual check in a real VS Code window; this is the only check of the real editor-group service and of the runtime tab-input view type, so it is a required acceptance step, not optional. Steps: build the extension and run it in an Extension Development Host; (a) open the chat with one editor group open and confirm the lock icon appears on the chat's group and an Explorer click opens the file in the other group; (b) repeat starting from a two-column layout; (c) reload the window and confirm the restored chat locks on first focus; (d) set insrc.chat.lockGroup to false, open a fresh chat and confirm it is not locked. If (a) fails because the runtime view type differs from the expected prefixed form, record the observed value and correct isChatTabInput and its tests.
  - Subjects: `built extension in an Extension Development Host`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `group-lock.test.ts: locks once on the immediate attempt when the panel is active and the active tab input is the chat`, `group-lock.test.ts: view-state event first with a non-chat tab input does not lock; a later tab-change event with the chat input locks`, `group-lock.test.ts: tab-change event first while the panel is not active does not lock; a later view-state change to active locks`, `group-lock.test.ts: isChatTabInput true/false cases`, `smoke (a) and (b)` |
| `ac2` | `group-lock.test.ts: a non-active restored panel does not lock at attach and locks on its first activation`, `extension-chat-wiring.test.ts: webviewPanelChannel calls attach(panel)`, `smoke (c)` |
| `ac3` | `group-lock.test.ts: never locks while enabled() is false; locks at the next event after it flips to true`, `extension-chat-wiring.test.ts: package.json contributes insrc.chat.lockGroup (boolean, default true, scope machine)`, `smoke (d)` |
| `ac4` | `group-lock.test.ts: further view-state and tab events after a lock do not issue the command again, and both subscriptions are disposed`, `group-lock.test.ts: a rejecting and a synchronously throwing lockActiveGroup are each reported via warn, attach does not throw, and no retry follows`, `group-lock.test.ts: does not lock while the active tab input is the docs-review webview even though the panel reports active` |

## 6. Migration

**State before:** Per the s1 bundles: the chat opens as an editor-tab webview panel beside the active editor and is restored through the insrc.chatPanel serializer; both paths go through the single webviewPanelChannel adapter in extension.ts. Nothing locks the chat's editor group, there is no insrc.chat.lockGroup setting, the chat view type is a module-private constant, and the vscode shim has no view-state or tab-group surface. Files opened from the Explorer can open as tabs in the chat's group.

**State after:** A vscode-free group-lock module issues the lock command once per panel object, the first time the panel is active and the active tab is the chat, re-attempting on view-state and tab-model changes; this covers fresh and restored panels. A new insrc.chat.lockGroup setting (boolean, default true) turns it off. The chat view type is an exported constant. No user settings are written and no persisted data changes.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the insrc.chat.lockGroup boolean (default true, scope machine) to the Chat configuration group in the plugin manifest. — ↩ rollbackable
2. Export the existing chat view-type constant from the chat panel module (value unchanged). — ↩ rollbackable
3. Add the compile-only view-state and tab-group declarations to the vscode shim. — ↩ rollbackable
4. Add the vscode-free group-lock module (pure tab predicate plus the lock factory) with its unit tests. — ↩ rollbackable
5. Attach the group lock inside the webviewPanelChannel adapter with thin seams injected, keeping the wiring inside the chat-enabled block, and extend the wiring test. — ↩ rollbackable
6. Run the manual smoke check in an Extension Development Host, then bump the plugin version and rebuild. Existing users get the lock by default from the first chat opened or focused after updating. — ↩ rollbackable

**Backward compat:** The webviewPanelChannel signature and returned channel are unchanged, no existing setting changes meaning, and exporting the view-type constant does not change its value. The behaviour change for existing users is the default-on lock: new files no longer open in the chat's group, including when that group is a reused side group that already holds their files. Setting insrc.chat.lockGroup to false restores the previous behaviour. A manual unlock from the group menu holds only until the next window reload, after which the restored chat locks its group again on first focus; the setting is the permanent opt-out.

## 7. Alternatives considered

### 7.1 a1: Lock on first verified activation, retried on view-state AND tab-group events, predicate in the vscode-free module — **CHOSEN**

A deps-injected group-lock module locks once per panel when the panel is active and the active tab input is the chat webview, re-attempting on both panel view-state changes and tab-group changes; the tab predicate is a pure exported function.

Add vscode-plugin/src/chat/group-lock.ts with two exports. (1) A pure predicate `isChatTabInput(input, viewType)`: true only when input is an object carrying a string viewType that equals the chat view type or ends with '-' + the chat view type (covering the 'mainThreadWebview-' prefixed runtime form). (2) `createChatGroupLock(deps)` whose attach(panel) attempts the lock immediately and again on every panel view-state change and every tab-group change until it succeeds, the lock command fails, or the panel is disposed. An attempt locks only when panel.active, isChatTabInput(deps.activeTabInput(), deps.viewType) and deps.enabled() all hold. extension.ts injects thin seams only (raw active tab input, tab-change subscription, the command, the setting read) from the single webviewPanelChannel adapter; chat-panel.ts exports its view-type constant so no third literal is introduced. The shim gains onDidChangeViewState and the tabGroups slice with its two change events.

### 7.2 a2: Inline lock right after createWebviewPanel

Execute workbench.action.lockEditorGroup inline in extension.ts immediately after the panel is created or adopted.

In the createPanel dep and in the restore callback, read insrc.chat.lockGroup and, when true, execute the lock command straight after the panel exists (revealing the panel first on the restore path so the chat's group is active). No new module and no shim additions.

**Rejected because:** Meets the setting and both-paths intent with the smallest diff, but with no guard it can routinely lock the user's code group because activation is asynchronous, and the restore path must steal focus.

### 7.3 a3: Contribute an autoLockGroups default

Ship a configurationDefaults entry adding the chat webview's editor id to workbench.editor.autoLockGroups.

Add contributes.configurationDefaults in package.json so VS Code's own auto-lock handles the chat group; there would be no insrc.chat.lockGroup setting because a manifest default cannot be gated at runtime.

**Rejected because:** Cannot honour the opt-out setting, does not fire when Beside reuses an existing group, and rests on unverified default-merge behaviour.

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/extension.ts` — "const webviewPanelChannel = (panel: vscode.WebviewPanel): ChatPanelChannel => {"
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "const VIEW_TYPE = 'insrc.chatPanel';"
- **[[c3]]** `code` `vscode-plugin/package.json` — ""insrc.chat.diffView": {"
- **[[c4]]** `code` `vscode-plugin/src/vscode.d.ts` — "export interface WebviewPanel extends Disposable {"
- **[[c5]]** `code` `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — "const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);"
- **[[c6]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts` — "const VIEW_TYPE = 'insrc.docsReviewPanel';"
- **[[c7]]** `step-output` `s1`
- **[[c8]]** `step-output` `s3`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**0 HIGH · 3 MED · 10 LOW** · model `client` · reviewed 2026-10-04T05:45:15.345Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 2.2/7.1 | external-contract | MED | manual | At engines.vscode ^1.75.0 the runtime provides WebviewPanel.onDidChangeViewState, window.tabGroups.activeTabGroup.activeTab.input, tabGroups.onDidChangeTabs and onDidChangeTabGroups, and the active tab's input for the chat panel is an object whose string viewType is 'insrc.chatPanel' or 'mainThreadWebview-insrc.chatPanel'. | UNVERIFIABLE from the evidence: package.json:23 confirms `"vscode": "^1.75.0"`, but mainThreadWebview has no hit in plugin source and the repo ships only the hand-written shim, so nothing in-tree shows the runtime tab input's viewType form or the availability of the four API surfaces. The artifact handles this as well as a document can: the rule accepts both the bare and the prefixed form (section 2.2), unit tests pin both, and smoke step (a) is a required acceptance step with an explicit instruction to record the observed value and correct the predicate. Remaining gap: the artifact does not say where the observed runtime value is recorded, so the fact stays unproven after build unless someone writes it down. | Before or during build, observe the real value in an Extension Development Host and record it (BUILD record or a comment beside isChatTabInput); cite the VS Code version each surface was finalized in. |
| 2.3/4 | external-contract | MED | manual | workbench.action.lockEditorGroup locks (does not toggle) the active editor group, takes no target usable from an extension, and reports no group; targeting is therefore best-effort and the non-atomic check-then-command window is an accepted, documented residual risk. | UNVERIFIABLE from the evidence: lockEditorGroup has no hit in plugin source (4 hits, all documents). The earlier absolute is gone: section 2.3 now says best-effort and section 4 lists the focus-change window as an error case with 'rarely, a group other than the chat's is locked'. That part of the previous finding is resolved. What stays unproven in-tree is the command's semantics (lock, not toggle; acts on the active group). | Confirm in the smoke run that issuing the command on an already-locked group leaves it locked (relevant after reload, where the group lock may already be persisted) and note the result. |
| 2.3 postconditions | ordering | MED | assisted | The attach state machine issues the lock command at most once per panel and always disposes both subscriptions on finish: attach attempts immediately, then on every view-state and tab-model change, and the panel is finished once the command is issued (resolve or reject) or the panel is disposed. | No source exists yet (createChatGroupLock and onTabsChanged hit only documents), so this is judged on the specification, which leaves two points open. (1) When 'finished' is set: postcondition 3 says the panel is finished 'once issued (whether it resolves or rejects)', but the error path for a rejecting command says 'send the message to deps.warn and finish the panel', which reads as finishing at settlement. If finished is set at settlement, any view-state or tab event arriving while the command is in flight issues it a second time, and with two event sources firing around a fresh open that window is exactly when events arrive. The listed test ('further view-state and tab events after a lock do not issue the command again', mutation: drop the finished flag) does not say the events are fired before the promise settles, so a finish-on-settle implementation passes it. (2) Order of the immediate attempt and the subscriptions: 'attach makes one attempt immediately, then one on every … change'. If the attempt runs before the subscriptions are created and locks, finish has nothing to dispose and the subscriptions created afterwards stay live for the panel's life; the edge row 'locks once on the immediate attempt; both subscriptions are disposed' requires the opposite order but the contract does not state it. The fixture counts live subscriptions for the tab source only, not for the panel's view-state listener. | State that finished is set synchronously before the command is invoked and that rejection only adds a warn; state that both subscriptions (and onDidDispose) are registered before the immediate attempt, or that none are created when it locks. Add a test that fires both event kinds between issuing and settling and asserts a count of one, and count live view-state subscriptions in the fake panel. |
| 2.1/c1 | closed-union | LOW | manual | webviewPanelChannel in vscode-plugin/src/extension.ts is the single adapter used by both chat paths (the createPanel dep and the serializer restore callback); no other site creates or restores a chat panel, so one attach(panel) call in it covers both. | createWebviewPanel( in plugin source: extension.ts:323 (status host, ViewColumn.Active), :545 (chat, wrapped by webviewPanelChannel), :586 (docs review, ViewColumn.Active). registerWebviewPanelSerializer( only at extension.ts:567. webviewPanelChannel( called only at :545 and :570 (`chatHost.adopt(webviewPanelChannel(panel))`). chat-panel.ts:941 routes open() through deps.createPanel. Two chat paths, one adapter. | none — verified sound |
| 3.2/c2 | citation | LOW | manual | chat-panel.ts holds a module-private `const VIEW_TYPE = 'insrc.chatPanel';` that can be exported unchanged, and extension.ts already imports from ./chat/chat-panel.js, so the constant can be passed to the group lock without a new literal. | chat-panel.ts:102 `const VIEW_TYPE = 'insrc.chatPanel';` (module-private, used at :941); extension.ts:52 already imports `createChatPanelHost, type ChatPanelChannel` from './chat/chat-panel.js', so adding the exported constant to that import is mechanical. Note docs-review-panel.ts:44 also has a private VIEW_TYPE, so the LLD should name the export (it does not) to avoid an ambiguous identifier in extension.ts. | none — verified sound (optional: name the exported constant, e.g. CHAT_VIEW_TYPE) |
| 5/contract | inventory | LOW | manual | extension.ts contains exactly one 'insrc.chatPanel' literal today (the serializer registration), so the proposed wiring assertion 'no insrc.chatPanel literal other than the serializer registration' is satisfiable and establishes that extension.ts holds no view-type comparison of its own. | grep insrc\\.chatPanel in plugin source returns exactly chat-panel.ts:102 and extension.ts:567 (`registerWebviewPanelSerializer('insrc.chatPanel', {`), so extension.ts has one occurrence today and the assertion is satisfiable provided it is written as 'exactly one occurrence' (or excludes the serializer line) rather than as absence. It is a presence/count check only: a comparison written against the imported constant would pass it, which the LLD concedes ('these assertions do not claim behaviour'). The exception exists only because :567 keeps its own copy of the literal. | none — verified sound (optional: register the serializer with the exported constant at :567 and assert zero literals, which also removes the drift between the two copies) |
| c6/edge | citation | LOW | manual | The docs-review panel uses the distinct view type 'insrc.docsReviewPanel' (docs-review-panel.ts), which neither equals 'insrc.chatPanel' nor ends with '-insrc.chatPanel', so isChatTabInput rejects it. | docs-review-panel.ts:44 `const VIEW_TYPE = 'insrc.docsReviewPanel';`. Neither it nor its prefixed form equals 'insrc.chatPanel' or ends with '-insrc.chatPanel'. The other plugin view types seen in the VIEW_TYPE grep (webview-host.ts:43 'insrc.detailedStatus', :44 'insrc.repoConfiguration') are likewise rejected by the pinned rule. The '-' separator in the ends-with rule prevents a bare suffix match such as 'xinsrc.chatPanel'. | none — verified sound |
| 3.3/c4 | semantic | LOW | manual | The shim vscode-plugin/src/vscode.d.ts currently has no onDidChangeViewState, tabGroups, onDidChangeTabs or onDidChangeTabGroups, so the listed compile-only additions are required and sufficient for the thin seams (no TabInputWebview class needed because the predicate narrows structurally). | vscode.d.ts:82 `export interface WebviewPanel extends Disposable {`; greps for onDidChangeViewState, tabGroups and onDidChangeTabs\|onDidChangeTabGroups have zero hits under vscode-plugin/src, so all listed additions are absent today. Dropping TabInputWebview is consistent with the structural predicate in section 2.2. | none — verified sound |
| 2.1/c5 | citation | LOW | manual | The existing wiring test extracts the block with /if \\(chatEnabled\\) \\{([\\s\\S]*?)\\n  \\}/ and requires the createPanel literal with vscode.ViewColumn.Beside; constructing the lock inside the chatEnabled block and leaving that literal intact keeps the existing assertions green unmodified. | Wiring test :35 is `const block = /if \\(chatEnabled\\) \\{([\\s\\S]*?)\\n  \\}/.exec(src);` (citation c5 resolves verbatim) and :162 requires `createPanel:` … `vscode.window.createWebviewPanel(viewType, title, vscode.ViewColumn.Beside`. extension.ts:424 opens the block and :610 is the first two-space-indented closing brace. Section 2.1 now states both constraints (construct inside the block, leave the literal intact), which matches what these regexes enforce. | none — verified sound |
| 2.3/edge 153-154 | ordering | LOW | manual | Because attempts are re-run on BOTH panel view-state changes and tab-model changes, a fresh open locks regardless of which of the two channels updates first, without needing the user to leave and re-enter the chat. | The previous finding is resolved in the design: deps.onTabsChanged (section 2.3) adds a trigger on the stream the guard reads, and edge rows for both orders (view-state first, tab model first) are specified with matching unit tests and named mutations (drop the onTabsChanged subscription; drop the panel.active check). extension.ts:545 is the fresh-open site these cover. Whichever channel updates last now produces an attempt, so no user interaction is needed. The claim still rests on the real events existing (r7). | none — verified sound |
| 5 | semantic | LOW | manual | The test strategy proves ac1-ac4: unit tests drive the real isChatTabInput and the factory with fakes under named mutations, contract tests pin manifest and seam presence only, and a required manual smoke (a)-(d), cited in the acceptance mapping, is the sole check of the real editor-group service and runtime view type. | package.json:734 `"test": "tsx --test 'src/**/__tests__/*.test.ts'"` collects the new test file. The earlier vacuity is addressed: the predicate is a pure export tested with the prefixed value, the bare value, the docs-review type, a mid-string match, a missing/non-string viewType, null and undefined, with always-true / always-false / strict-equality mutations; the factory tests use the real predicate; the regex assertions are declared presence-only; smoke (a)-(d) is required and cited under ac1, ac2 and ac3. Residual, not blocking: the extension.ts seams remain regex-only, so a seam returning the tab instead of tab.input, or a composite onTabsChanged that disposes only one of its two subscriptions, is caught by smoke (a) or not at all; and the build stage cannot run the smoke itself, so its result depends on a person recording it. | none — verified sound (see r9 for the two missing unit tests; say where the smoke result is recorded) |
| 4/edge 157,161 + 6 | semantic | LOW | manual | The artifact documents, consistently across edge cases, backward compat and the setting description, that ViewColumn.Beside can reuse a side group holding the user's files (which is then locked) and that a manual unlock holds only until the next window reload because a restored chat is a new panel object attached via the serializer path. | extension.ts:543 (open BESIDE) and :570 (restore attaches via the adapter) are the two behaviours the artifact now documents: edge rows for the reused side group and for manual unlock, the backward-compat paragraph ('including when that group is a reused side group that already holds their files'; 'a manual unlock … holds only until the next window reload'), and section 3.1 requiring the setting description to mention re-locking after reload. The three places agree. Locking a populated group by default is now an explicit product choice rather than an undisclosed side effect. | none — verified sound |
| 3.1/c3 | citation | LOW | manual | insrc.chat.lockGroup does not exist today and the sibling insrc.chat.* settings sit in the 'Chat (preview)' configuration group of vscode-plugin/package.json. | insrc.chat.lockGroup has no hit in plugin source or manifest (all 15 hits are documents); package.json:116 is `"title": "Chat (preview)",`. | none — verified sound |

#### Proposed fixes

- **2.2/7.1** (manual) — External contract cannot be proven from this repo; the design is already defensive, what is missing is a recorded observation.
  - option: Add to migration step 6: record the observed activeTab.input.viewType in the BUILD record
  - option: Accept as-is on the strength of the dual-form rule plus required smoke

- **2.3/4** (manual) — Command semantics are an out-of-process contract; only a real window can confirm them.
  - option: Add a smoke step: reload with the chat group already locked and confirm it is still locked after first focus
  - option: Accept as-is

- **2.3 postconditions** (assisted) — Two orderings are left to the implementer and the listed tests do not distinguish the wrong choice from the right one.
  - option: Specify: set finished and dispose subscriptions synchronously at issue; subscribe before the immediate attempt; add the in-flight test and view-state subscription counting
  - option: Specify: perform the immediate attempt first and create subscriptions only if not finished; add the same tests
  - option: Leave to the build and require the two tests only
