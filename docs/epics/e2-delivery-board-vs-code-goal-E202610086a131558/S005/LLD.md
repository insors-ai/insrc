<!-- insrc:artifact LLD-6a1315585c38c41c-s5 -->

# LLD: E202610096a131558:S005

## Summary

**Epic:** `e2-delivery-board-vs-code-goal`
**HLD base run:** `wf-1791485029499-gnjvqz`
**HLD effective hash:** `d362668c917b...`

This Story makes the delivery board usable in every way a reader works. In a narrow pane, the six columns stack into one list grouped by stage, with nothing hidden. A keyboard user can reach every card and control with a visible focus ring, open an item's details, and close them back to the same card. A screen reader hears each selection and each refresh result exactly once. Compact and comfortable density change only spacing, and the board stays fast for a 500-item workspace, measured by a timing test.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-6a1315585c38c41c** § 2. Framework summary

**Rollout phase:** Phase D — narrow pane, accessibility, density and performance
**Consumes:** `sc1` (Delivery client), `sc2` (Board state: load status and selection), `sc3` (Board webview message protocol), `sc4` (Display labels), `sc5` (Board view model), `sc6` (Item details view model and evidence opening)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The open-board command and its entry in the plugin's command list, the webview panel creation in an editor tab with its CSP and nonce, the refresh sequencing (request numbers and dropping superseded responses), the mapping of client failures to load states, and the status bar of the board (taken-at time, stale and partial notices, the empty, unavailable and failed messages). s1 also records the editor-tab versus sidebar placement check. It renders a minimal list of item titles until s2 supplies columns. s1 also extends vscode-plugin/src/delivery/delivery-contract.ts additively with the stage, attention, notice, task-result, approval and review-verdict types sc4 needs. Its LLD maps every acceptance criterion to a named test, including ac4 (an earlier response arriving after a later one is dropped, with fake out-of-order responses) and ac6 (repeated open and refresh against a temporary git repository leave the store, docs and git untouched). — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s2`: The pure functions that filter the snapshot by scope, search and attention, group the matches into the six columns in the daemon's order, count over the whole selection, page each column behind show-more, and build each card's badges and accessible label from the snapshot's published fields; and the board view's rendering in the webview script, text-only. Its LLD maps every acceptance criterion to a named test, including ac6 (a title and a notice containing markup and script render as literal text). — owns `sc5`
- `s3`: The epic rollup view model (per-epic completion counts that name their denominator, stories grouped by stage, a separate standalone group) and the issue view model (each issue with its fix stories as children and its parent relationship or unresolved-parent notice), both built from the same filtered selection as sc5, and their rendering. Its LLD maps every acceptance criterion to a named test.
- `s4`: Building item details from the snapshot item, reading the story's PLAN through the delivery client and caching it per snapshot, joining the plan's dependencies and acceptance checks to the snapshot's task results, fetching an evidence-read record and showing it as preformatted text, routing a review-view entry to the review pane's openArtifact, the change inside the review pane that implements openArtifact without altering its list, rendering or approval behaviour, and the details rendering. Its LLD maps every acceptance criterion to a named test, including ac5 for both paths: a review-view record opens through openArtifact, and when the review pane is unavailable or the record is evidence-read the record is shown read-only from workflow.deliveryEvidence; the review pane's existing tests run unchanged. — owns `sc6`, `sc7`

## 2. Contract details

**Surface level:** internal

### 2.1 `renderBoardDocument`

```typescript
function renderBoardDocument(nonce: string): string
```

**Parameters:**
- `nonce: string` — The script nonce, as today.

**Returns:** `string` — The board document, now with one inline <style>, a density control and one announcement live region.

**Preconditions:**
- The CSP stays default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-<nonce>'. It is not widened.

**Postconditions:**
- The one <style> uses only VS Code theme variables (--vscode-*). Wide panes lay the board view's six columns out side by side. Below 600 px, a media query stacks them as one list grouped by stage, with each column's h2 as its group heading.
- No rule hides content: the stylesheet has no display:none, visibility:hidden or clipping on cards, badges, notices or labels. Only the [hidden] details pane is hidden, and only while no item is selected.
- body[data-density=compact] and body[data-density=comfortable] change only padding, gaps and font size.
- :focus-visible gives every focusable element a 2 px outline in var(--vscode-focusBorder).
- #status keeps role=status but drops aria-live, so status changes are no longer announced. A new #announce element (aria-live=polite, aria-atomic=true) is the single announcer.
- The header gains a density control: two buttons, #density-compact and #density-comfortable, each with aria-pressed.

### 2.2 `BOARD_WEBVIEW_SCRIPT`

```typescript
const BOARD_WEBVIEW_SCRIPT: string
```

**Returns:** `string` — The one webview script, extended for keyboard use, focus return, announcements and density.

**Preconditions:**
- acquireVsCodeApi() provides getState and setState.

**Postconditions:**
- Every card, in all three views, has tabindex=0 and keeps its aria-label (accessibleLabel). Enter or Space (keydown, e.key, with preventDefault) posts select-item for it, as a click does. ArrowDown and ArrowUp move focus to the next or previous card in document order, found with #board.querySelectorAll('li.card').
- When a details message names a different item than the last one, the script remembers that itemId and moves focus to the details heading (tabindex=-1). Escape inside the details posts close-details.
- When a details message has model null after an item was shown, focus returns to the li.card inside #board whose data-item-id is the remembered item (other elements carry data-item-id too: issue sections, link buttons, the details pane and task rows, so the lookup is restricted to li.card). If no such card exists, focus goes to the tab of the shown view.
- An 'announce' message clears #announce and then sets its textContent, once per message.
- On boot, the script reads density from getState() (default 'comfortable'), applies it as body[data-density], marks the matching button aria-pressed=true, and posts set-density with it. A density button applies and saves (setState) its density, then posts set-density.
- Everything is still set with textContent and nothing touches innerHTML. The script posts only BoardUpMessage envelopes.

### 2.3 `createDeliveryBoardHost`

```typescript
function createDeliveryBoardHost(deps: DeliveryBoardHostDeps): DeliveryBoardHost
```

**Parameters:**
- `deps: DeliveryBoardHostDeps` — Unchanged.

**Returns:** `DeliveryBoardHost` — The host, which now posts sc3 'announce' messages.

**Postconditions:**
- An accepted select-item that changes the selected item posts one { type: 'announce', text } after the view and details messages. The text is 'Selected: <title>', followed by ' · <stage label>' when the item has a stage. A select-item for the already-selected item posts no announce. It is posted inside the existing handle() path after apply() has kept the state, so a post failure is caught by the onMessage catch and only logged; the kept state stands.
- A refresh that settles posts one announce after its status and view messages, outside the refresh's apply try block (as logUnknownStages is), in its own try that only logs through error(). ready: 'Board refreshed: N items, M needing attention', both counted over the whole applied snapshot on one basis: N = placeableCount(snapshot) and M = the placeable items whose needsAttention is true. This is deliberately independent of the reader's filters, which the on-screen totals line reflects. empty, unavailable or failed: the status message text. A superseded or closed-panel answer posts none, and 'refresh-requested' (loading) posts none.
- close-details, set-view, set-search, set-scope, set-attention, set-density and show-more post no announce.
- set-density keeps mirroring into selection.density and posts the derived messages, as today.

### 2.4 `BoardDownMessage`

```typescript
{ readonly type: 'announce'; readonly text: string }
```

**Returns:** `BoardDownMessage` — The sc3 variant, already declared, now sent.

**Postconditions:**
- The variant is unchanged; s5 is its first sender.

## 3. Data model changes

### 3.1 `Webview state (acquireVsCodeApi getState/setState)` — new

{ density: 'compact' | 'comfortable' }. Written by the webview's density control, read on boot, and kept by VS Code for the panel's life, across the webview reloads that happen without retainContextWhenHidden. Nothing is written to disk or workspace state.

**Call sites:**
- `vscode-plugin/src/delivery/board-host.ts`

### 3.2 `BoardSelection.density` — invariant-change

Becomes a mirror of the webview's density. The webview posts set-density on boot and on every change. No view model reads it, and none needs to.

**Call sites:**
- `vscode-plugin/src/delivery/board-state.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.3 `Board performance fixture (test helper)` — new

A deterministic builder for a snapshot of 500 work items formed from 1,000 records: 20 epics, 400 stories with 2 evidence entries each across the six stages, and 80 issues, with a fixed share needing attention. recordCount is 1000. The timing test measures through it.

**Call sites:**
- `vscode-plugin/src/delivery/__tests__/board-fixtures.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Unchanged. The performance fixture stands in for the client's snapshot. |
| `sc2` | consumes | selection.density is mirrored through the existing set-density path. The selection and load status decide when an announcement is due. |
| `sc3` | consumes | Sends the declared 'announce' down-message and receives the declared 'set-density' up-message. No variant or field changes. |
| `sc4` | consumes | The selection announcement names the stage by its sc4 label. |
| `sc5` | consumes | The narrow layout restyles its columns without changing the model. The refresh announcement uses placeableCount and attentionCount from board-model.ts. |
| `sc6` | consumes | Focus moves to the details heading on open and back to the card on close. The selection announcement uses the selected item's title. |

## 5. Error paths

**Error cases**

- **The webview's saved state is missing or not one of the two densities, for example from an older build or a cleared state.** (recoverable)
  - Detection: On boot the script checks getState()?.density for 'compact' or 'comfortable'. Anything else, including a throw from getState, is treated as absent.
  - Response: Use 'comfortable', apply it, and post set-density 'comfortable'.
  - User impact: The board opens at the default density, and nothing breaks.
- **The card that opened the details is gone when they close, because a refresh removed it or a filter now hides it.** (recoverable)
  - Detection: After a null details model, the script finds no card element whose data-item-id is the remembered item.
  - Response: Focus the tab of the shown view (the pressed tab) instead, and forget the remembered item.
  - User impact: Focus lands on a known, visible control, never on the document body.
- **The announcement text cannot be built because the selected item is missing from the shown snapshot.** (recoverable)
  - Detection: The host looks the item up in the shown snapshot after keeping the state and does not find it.
  - Response: Post no announce. The select-item guard (onBoard) already rejects ids that are not on the board.
  - User impact: No stray or empty announcement.
- **Posting an announce message throws.** (recoverable)
  - Detection: channel.postMessage throws inside the host. In practice webviewChannel.postMessage already swallows rejections (chat/webview-channel.ts), so this is defensive.
  - Response: The selection announce is posted after apply() kept the state, inside handle(); the onMessage catch logs the throw through error(). The refresh announce is posted after the refresh's apply try block, in its own try that only logs, so a post failure can never turn a rendered board into a failed refresh.
  - User impact: The board stays as it was kept; only the spoken announcement is lost.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The reader presses Enter on the already-selected card. | select-item is posted. The host keeps the same selection and posts no announce, so nothing is said twice. |
| A refresh is requested again before the first one settles, so the first is superseded. | Only the refresh that is applied announces. The dropped answer posts no announce. |
| The webview reloads (the tab is hidden and shown) and sends 'ready'. | The host re-posts status, view and details but no announce, so nothing is announced again. The webview restores its density from its saved state and posts set-density. |
| ArrowDown on the last card, or ArrowUp on the first. | Focus stays where it is; there is no wrap-around. |
| A narrow pane showing the epic rollup or the issue view. | Those views are already lists. The narrow rules change only their spacing, and every card, badge and notice stays. |
| Compact density with long titles, many badges and notices. | Text wraps rather than being truncated or clipped. Every badge and accessible label is still rendered. |
| The 500-item fixture with every column holding more than the 50-card page. | The first board renders the first page of each column plus show-more. The timing covers building and rendering that board. |

**Invariants to preserve**

- The webview builds DOM with textContent only, posts only BoardUpMessage envelopes, and keeps the CSP unwidened (k4, k8). [[c7]]
- No navigation, density change or refresh writes any artifact, approval, file or Git state; density lives only in the webview's own state (k3). [[c6]]
- Every colour-coded state also has a text label, and no density or width hides a card, badge, warning or label (k11). [[c23]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx (npx tsx --test), as in vscode-plugin/src/delivery/__tests__`

**Test levels**

- **unit** — The board document's stylesheet and regions: narrow layout, density, focus ring, no hiding rules, and a single live region.
  - Subjects: `renderBoardDocument`
- **integration** — The real webview script on the fake DOM, driven by models built by the real host: card focus and keys, focus into the details and back to the card, the announce region, and density restore and persistence.
  - Subjects: `BOARD_WEBVIEW_SCRIPT`, `createDeliveryBoardHost`
  - Fixtures: `board-host.test.ts runScript/makeEl extended with: document.body, document.activeElement, focus() on elements, listener events carrying key and preventDefault, querySelectorAll over the fake tree for 'li.card', and an acquireVsCodeApi with getState/setState`, `board-fixtures.ts item/snapshot/evidence`
- **integration** — Host announcements: one per selection change and one per settled refresh. None for loading, a superseded answer, a webview reload or the other intents.
  - Subjects: `createDeliveryBoardHost`
  - Fixtures: `board-host.test.ts detailsSetup/openOn`
- **integration** — The measured performance fixture (ac5): the host's derive and post plus the real script's DOM build on the fake DOM, for the first board and for each filter change, best of three. Timings are always reported through the test's diagnostics. The default run asserts a regression tripwire of five times each target, so a loaded machine cannot fail unrelated builds; INSRC_PERF=1 asserts the exact targets (1 s, 150 ms). The fake DOM has no layout or paint, so the real-webview render on the reference environment is a separate manual measurement, recorded in the BUILD record when it is taken.
  - Subjects: `createDeliveryBoardHost`, `BOARD_WEBVIEW_SCRIPT`
  - Fixtures: `board-fixtures.ts largeSnapshot(): 500 items from 1,000 records`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `board-host.test.ts: 'a narrow pane stacks the columns into one list grouped by stage, and no rule hides a card, badge or warning'` |
| `ac2` | `board-host.test.ts: 'every card is focusable and opens with Enter or Space, arrows move between cards, and closing the details returns focus to the card'`, `board-host.test.ts: 'when the card that opened the details is gone, closing them focuses the shown view's tab'` |
| `ac3` | `board-host.test.ts: 'a selection and a settled refresh are each announced once, and loading, superseded answers, reloads and other intents announce nothing'`, `board-host.test.ts: 'the announce region is the only live region and is set once per message'` |
| `ac4` | `board-host.test.ts: 'density is restored from the webview state, saved on change and mirrored to the host, and both densities render every badge, warning and label'` |
| `ac5` | `board-perf.test.ts: 'a 500-item, 1,000-record board renders within one second and each filter change within 150 ms, best of three'`, `Manual: the real webview on the reference environment, measured and recorded in the BUILD record` |

## 7. Alternatives considered

### 7.1 a1: Webview presentation, host announcements, webview-kept density — **CHOSEN**

One inline stylesheet (narrow layout and density), focusable cards with focus return, host-posted 'announce' messages to a single live region, and density kept in the webview's own state and mirrored to the host with set-density.

renderBoardDocument gains one <style> under the existing style-src 'unsafe-inline' CSP. It uses VS Code theme variables only. A narrow media query stacks the six column sections into one stage-grouped list, and nothing is set to display:none. Density is a data-density attribute on the board root that changes only spacing and font size. The script makes every card a focusable element: tabindex 0, Enter and Space post select-item, and arrow keys move between cards. It records the element that opened the details and refocuses that item's card (by data-item-id) after close-details, falling back to the shown view's tab. :focus-visible gets a visible outline. The host posts the already-declared 'announce' down-message once per selection change ('Selected: <title>') and once per settled refresh ('Board refreshed: N items' or the failure), never for loading. The webview writes it into one #announce region (aria-live polite, cleared then set). The status paragraph keeps role=status, but its aria-live is removed so a result is not announced twice. A density control (two buttons, aria-pressed) applies the attribute, saves it with acquireVsCodeApi().setState, restores it on boot, and posts set-density so the host's selection matches. The 500-item, 1,000-record fixture is a test helper. A timing test measures building and rendering the first board, and each filter change through the real host and the real script, best of three.

### 7.2 a2: Host-owned density carried down on the status

Same as a1, except the host is the density's single source of truth and posts it on every status message.

As a1 for the stylesheet, keyboard and announcements. StatusView (sc3, owned by s1) gains a density field through an HLD fieldAdd amendment. The webview applies the density it is sent and never stores it; set-density round-trips through the host, and a reload is answered with the host's density on 'ready'.

**Rejected because:** Works, but amends an s1 contract and adds a round trip for a purely visual change (sc3 partial, ac4 partial).

### 7.3 a3: Webview-composed announcements

As a1, but the webview derives announcements itself by comparing successive status and details messages, and 'announce' stays unsent.

The script remembers the last status state and the last details itemId. When a details message names a new item it announces the selection; when the status goes from loading to ready, empty, unavailable or failed it announces the result. The host posts no 'announce'.

**Rejected because:** Violates ac3's 'announced once' on every webview reload.

## 8. References

- **[[c3]]** `prior-artifact` `docs/epics/e1-delivery-read-model-daemon-from-E202610072ff0dfda/HLD.md` — "Fix sc7 in this HLD, version it with schemaVersion, and allow only additive optional fields after approval; any breaking change goes through an HLD amendment before E2 consumes it."
- **[[c4]]** `code` `src/workflow/delivery/types.ts` — "readonly tasks:            readonly TaskValidation[];"
- **[[c10]]** `doc` `docs/insrc-delivery-board-prd.html` — "Refresh strategy: manual refresh is sufficient for the first increment; confirm whether existing daemon events can support later automatic updates."
- **[[c11]]** `doc` `docs/plans/delivery-board-epics.md` — "| Completion wording | Keep "Complete"; test it in E2's usability session | E2 S2 |"
- **[[c17]]** `code` `src/workflow/delivery/types.ts` — "readonly openWith:       'review-view' | 'evidence-read';"
- **[[c24]]** `stakeholder` `Stakeholder decision in chat, 2026-10-09: option A, add an open-this-artifact entry to the review pane` — "go with A"
- **[[c6]]** `doc` `docs/insrc-delivery-board-prd.html` — "FR-09Keep the MVP read-only: all navigation and filtering leave artifacts, approvals, code, and Git state unchanged."
- **[[c7]]** `doc` `docs/insrc-delivery-board-prd.html` — "Safe rendering: render artifact text as data. Never execute embedded HTML/scripts or follow arbitrary file paths from artifact content. File navigation must use the host’s existing authorized viewer."
- **[[c13]]** `doc` `docs/insrc-delivery-board-prd.html` — "The initial board renders within one second of data arrival; each local filter change responds within 150 ms."
- **[[c14]]** `code` `vscode-plugin/src/panels/webview-host.ts` — "<meta http-equiv="Content-Security-Policy" content="${csp}">"
- **[[c23]]** `doc` `docs/insrc-delivery-board-prd.html` — "Accessibility: keyboard navigation, visible focus, screen-reader labels, and text labels for every color-coded state. Card selection and refresh results are announced without excessive chatter."
- **[[c21]]** `analyze-bundle` `s1: vscode-plugin/src/delivery/board-host.ts (BOARD_WEBVIEW_SCRIPT, renderBoardDocument: no stylesheet, cards without tabindex, status aria-live)`
- **[[c22]]** `analyze-bundle` `s1: vscode-plugin/src/delivery/board-state.ts and board-protocol.ts (selection.density, the declared announce and set-density messages)`
- **[[c25]]** `analyze-bundle` `s1: vscode-plugin/src/delivery/board-wiring.ts and extension.ts (panel options without retainContextWhenHidden; no getState/setState in the plugin)`
- **[[c26]]** `analyze-bundle` `s1: vscode-plugin/src/delivery/__tests__ (fake-DOM harness, fixtures; no timing test exists)`

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**5 do not hold · 0 could not be verified · 9 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-09T12:11:49.075Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| new-versus-reuse | MED | The refresh announcement reuses placeableCount and attentionCount from board-model.ts as 'N = the snapshot's placeable count and M = the attention count'. | board-model.ts:199 `placeableCount(snapshot: DeliverySnapshot)` counts the whole snapshot whatever the selection. board-model.ts:228 `attentionCount(matches: readonly MatchedCard[])` takes the selection's matches, not a snapshot. So M depends on the selection's filters while N does not. 'Board refreshed: N items, M needing attention' then mixes an unfiltered total with a filtered count, and it disagrees with the totals line the board renders (`totals: { items, needsAttention }` from the filtered matches, 248-251). [files: vscode-plugin/src/delivery/board-model.ts] | State one basis for both numbers. Either use the shown view model's totals (filtered, as on screen) or compute M as snapshot.items.filter(isPlaceable).filter(i=>i.needsAttention). Name the function used. |
| change-sites | MED | Restoring focus to 'the card whose data-item-id is the remembered item' identifies a card unambiguously. | data-item-id is also set on non-card elements: the issue <section> (board-host.ts:123 `sec.setAttribute('data-item-id',e.card.itemId)`), link buttons (111), the details <aside> itself (149) and task rows (157). A lookup by attribute alone can therefore match the issue section or the details aside before the li.card. The LLD's postconditions do not restrict the lookup to elements with class 'card'. [files: vscode-plugin/src/delivery/board-host.ts] | Specify the lookup as the li.card element (class 'card') with that data-item-id, inside #board. |
| change-sites | MED | The test harness extension named in §6 (focus(), document.activeElement, getState/setState) is enough to drive the new script. | The fake DOM (board-host.test.ts:224-252) has no document.body, no querySelector/querySelectorAll, no keydown event object (listeners are `() => void` with no event), and acquireVsCodeApi returns only postMessage. The script as designed needs body[data-density] (2.1/2.2), key handlers that read e.key and preventDefault, and a way to find the next or previous card and the card by data-item-id. The harness inventory in §6 leaves these out. [files: vscode-plugin/src/delivery/__tests__/board-host.test.ts] | Add to the fixture list: document.body, listener events carrying key, and either a tree query or querySelector over the fake tree. |
| error-paths | MED | If posting the announce throws, 'a throw is caught by the existing handle catch or by the refresh catch and logged through error(), and the board state stays as it was kept'. | The refresh catch (board-host.ts:306-320) does not just log. When anything inside `dispatch({type:'snapshot-arrived',...})` throws, it dispatches a second 'snapshot-arrived' with `{ ok:false, failure:{kind:'read-failed', message} }`, which turns a board that rendered into a failed refresh. If the announce is posted inside that try (for example inside apply/dispatch), a post throw yields a 'The refresh failed' status rather than 'board stays as kept'. Also, webviewChannel.postMessage (chat/webview-channel.ts:31-35) already swallows rejections, so the throw path is mostly hypothetical, and the stated handling does not match the code. [files: vscode-plugin/src/delivery/board-host.ts, vscode-plugin/src/chat/webview-channel.ts] | Post the refresh announce after the `applied` try block (as logUnknownStages is), in its own try that only logs. Restate the error path accordingly. |
| tests | MED | ac5 is proven by board-perf.test.ts, which measures the first render within 1 s and each filter change within 150 ms 'through the real host and script'. | The only script harness is the fake DOM in board-host.test.ts:224-252 (makeEl records children; it has no layout or paint). A timing through it measures view-model building plus fake-node creation, not a webview render 'on the reference environment' (DEF.md:188, HLD.md:372). The vscode-plugin test script `tsx --test 'src/**/__tests__/*.test.ts'` (package.json:775) will also pick up board-perf.test.ts, so a hard wall-clock assertion runs in every suite run and can be flaky on a loaded machine. [files: vscode-plugin/src/delivery/__tests__/board-host.test.ts, vscode-plugin/package.json, docs/epics/e2-delivery-board-vs-code-goal-E202610086a131558/DEF.md] | State what the test measures (host derive plus fake-DOM build) and record that the real-webview render on the reference environment is a manual measurement. Alternatively, gate the timing assertion behind an env var and only report timings in the default run. |

#### Could not verify (does not block)

_None._
