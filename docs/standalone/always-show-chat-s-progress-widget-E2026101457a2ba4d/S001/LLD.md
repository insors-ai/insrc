<!-- insrc:artifact LLD-57a2ba4d5f18c356-s1 -->

# LLD: E2026101457a2ba4d:S001

## Summary

**Epic:** `always-show-chat-s-progress-widget`
**HLD base run:** `wf-1792006603311-6a0p2w`
**HLD effective hash:** `57a2ba4d5f18...`

The bar above the chat input is now always there. When no turn is running it shows a calm, slow idle animation and the word 'idle' instead of disappearing; when a turn runs it shows the working animation, label and elapsed time exactly as it does today. Nothing about when a turn starts or ends changes.

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

### 2.1 `setProgress`

```typescript
setProgress(text: string): void   // webview script function in chat-panel.ts
```

**Parameters:**
- `text: string` — The label to show, for example 'working…' or the status label.

**Returns:** `void` — Puts the widget in its running state.

**Postconditions:**
- the widget shows the label, is not idle and the elapsed timer runs (started once per turn)
- the widget was never hidden, so there is nothing to un-hide

### 2.2 `hideProgress`

```typescript
hideProgress(): void   // renamed setIdle(): void
```

**Returns:** `void` — Puts the widget in its idle state; it is no longer ever hidden.

**Postconditions:**
- the widget stays visible with the idle class and the idle label ('idle')
- the elapsed timer is stopped and its text is empty
- called on the same events as hideProgress is today: a turn-event done or error, session-restored, and Stop

## 3. Data model changes

### 3.1 `#insrc-progress markup, CSS and idle state (chat-panel.ts renderShell)` — invariant-change

Today the widget is rendered with the hidden attribute and `#insrc-progress[hidden]{display:none;}` hides it, so it is absent when nothing runs. After the change it is rendered without hidden, starting in the idle state (an idle class and the label 'idle'), and the [hidden] rule is removed. An .idle variant draws the same three dots with a slow, gentle breathing animation (a longer cycle than the working blink and no vertical movement) in the muted colour; the reduced-motion rule stops it as it stops the working animation. The widget is still exactly one element, above the input and never persisted.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/__tests__/chat-theme.test.ts (selector baseline)`
- `vscode-plugin/src/chat/__tests__/chat-theme-before.json`

### 3.2 `hideProgress call sites in the webview script` — invariant-change

hideProgress becomes setIdle at its call sites: the turn-event done or error handler, the session-restored handler and the Stop click. setProgress is unchanged apart from removing the idle class instead of removing hidden. The elapsed timer starts and stops exactly as now.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

## 4. Error paths

**Error cases**

- **The widget element is missing from the page (the shell was rendered without it)** (recoverable)
  - Detection: the script's lookup document.getElementById('insrc-progress') returns null, so prog is null, as the existing guards already check (`if(prog)`)
  - Response: setProgress and setIdle do nothing, as they do today
  - User impact: No widget; no error is thrown into the page

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The chat is opened with no turn running | The widget is visible in the idle state with the idle animation and the label 'idle', and no elapsed time |
| A turn starts ('turn-running' or a status event while running) | The idle class is removed and the working animation, label and elapsed timer show as today |
| A turn ends (done or error), or Stop is clicked | The widget goes idle: the timer stops, the elapsed text is empty, the idle animation shows; it does not disappear |
| A chat is switched (session-restored) | The widget goes idle with the restored view, as it did hide before |
| A done event of an informational line (a retry or sign-in note) arrives while a turn runs | The widget goes idle although a turn is running, which is what hide did before (the page treats any done as the end); this Story does not change that. A separate fix would make the page react only to the running turn's own done |
| prefers-reduced-motion is set | The idle animation is off and the dots are static, as the working animation is |
| The chat has no session or no provider is installed | The widget is still shown, in the idle state |

**Invariants to preserve**

- There is exactly one #insrc-progress widget, above the input bar, and it is never written to the transcript. [[c3]]
- The working state is unchanged: the label from status events (only while running), the three blinking dots and the elapsed m:ss timer started once per turn and cleared when the turn ends. [[c2]]
- The widget keeps its theme colours (the inset background, the lit border-top, the progress colour on the dots). [[c3]]
- setRunning, the Stop button and the input placeholder behave as before; only what the widget shows when nothing runs changes. [[c2]]

## 5. Test strategy

**Test framework:** `node:test (node:assert/strict) run through tsx: npx tsx --test; the chat shell, panel and theme tests under src/chat/__tests__`

**Test levels**

- **unit** — The widget's markup and style, and the page's state changes, over the shell test harness that runs the webview script.
  - Subjects: `chat-panel.test.ts: renderShell embeds one #insrc-progress widget above the input that is not hidden and starts idle (an idle class and the label 'idle'), and the [hidden] rule is gone`, `chat-panel.test.ts: the done/error handler, the Stop click and session-restored call setIdle, and no script path sets the widget hidden`, `chat-shell.test.ts: driving the page, a turn-running message makes the widget working (no idle class, label 'working…'), a done event makes it idle with the timer stopped and the elapsed text empty, and the widget is never hidden at any step`, `chat-theme.test.ts: the widget keeps its background, border and dot colour, and the idle variant and its slower animation exist, with reduced motion stopping both`, `chat-theme.test.ts compares the shell's selectors with chat-theme-before.json (it fails on any removed or renamed selector and pins the exact list of added ones): the removal of `#insrc-progress[hidden]` is made an intended removal (its entry in chat-theme-before.json is updated or exempted) and the new `#insrc-progress.idle` selectors and any new keyframes are added to the added-selector list`
  - Fixtures: `the shell test harness in chat-shell.test.ts (the webview script over fake elements), EXTENDED for this Story: its element stub makes classList inert and returns a new span from every querySelector, so the page's label and idle class cannot be read. For #insrc-progress the harness gives a recording classList and a querySelector that returns the same .plabel stub each time; setIdle and setProgress may instead set className, as setRunning does for the send button, so the state is a plain value the test reads`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `chat-shell.test.ts: the progress widget is never hidden: idle at the start, working after turn-running, idle after done, error, Stop and session-restored` |
| `ac2` | `chat-theme.test.ts: the idle variant has its own slow animation and reduced motion stops it` |
| `ac3` | `chat-panel.test.ts: exactly one #insrc-progress widget above the input, not hidden, starting idle; and the working state's script is unchanged` |

## 6. Migration

**State before:** The progress widget is rendered with the hidden attribute, hidden by a [hidden] CSS rule, shown by setProgress on turn-running and status events, and hidden again by hideProgress on done or error, session-restored and Stop (bundles read:widget-markup-and-style and read:widget-script). So it is absent whenever nothing runs, and also whenever the page treats any done as the end of the turn.

**State after:** The widget is always visible. It starts idle, setIdle replaces hideProgress at the same call sites, setProgress takes it out of idle, and an idle style shows a slow breathing animation and the label 'idle'. The hidden rule is gone.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Change the markup to render the widget without hidden, in the idle state with the idle label; remove the [hidden] rule; add the idle style and its reduced-motion rule — ↩ rollbackable
2. In the webview script replace hideProgress with setIdle (idle class, idle label, timer stopped, elapsed text empty) and make setProgress remove the idle class; update the three call sites — ↩ rollbackable
3. Rewrite the existing assertions that pin 'hidden at rest' and hideProgress (chat-panel.test.ts about :1621, :1807-1825; chat-shell.test.ts about :503 stays) and add the shell test that drives the widget through its states and the theme test for the idle style; update the selector baseline the theme test compares against (chat-theme-before.json and the added-selector list in chat-theme.test.ts) for the removed #insrc-progress[hidden] rule and the new idle selectors and keyframes; extend the shell test harness so the widget's idle class and label can be read — ↩ rollbackable

**Backward compat:** No stored data and no message changes: only what the page shows above the input when no turn runs. A page opened before the update keeps the old behaviour until it is reloaded.

## 7. Alternatives considered

### 7.1 a1: One widget with an idle state, switched by a class — **CHOSEN**

The single widget starts visible in an idle state; hideProgress becomes setIdle, which adds an idle class, clears the timer and elapsed text and sets an idle label; setProgress removes the class.

The markup loses the hidden attribute and starts with the idle class and an idle label ('idle'). The CSS drops the [hidden] rule and adds an .idle variant: the same three dots, a slow breathing animation (a longer, gentler cycle than the working blink, no vertical movement) and the muted colour; reduced motion stops it as for the working state. In the script hideProgress is replaced by setIdle (same calls: done or error, session-restored, Stop), setProgress removes the idle class as today, and the elapsed timer behaves as now (empty when idle). The existing assertions that pin 'hidden' and hideProgress are rewritten.

### 7.2 a2: Keep the function names and make hide mean idle

Leave setProgress and hideProgress and their call sites, and make hideProgress put the widget in an idle look instead of hiding it.

Remove only the hidden attribute and the [hidden] rule, and change the body of hideProgress to add an idle class, clear the timer and set the idle label. All call sites and most assertions stay.

**Rejected because:** Same behaviour with a smaller diff, but leaves a misleading name where the state is decided.

### 7.3 a3: A separate idle element shown when the progress element is not

Add a second element for idle and toggle between the two.

Keep #insrc-progress as it is and add a second bar for idle, toggled opposite to it.

**Rejected because:** Breaks the one-widget invariant and doubles the state to keep in step.

## 8. References

- **[[c1]]** `analyze-bundle` `read:widget-markup-and-style: the widget's markup and CSS in chat-panel.ts renderShell`
- **[[c2]]** `analyze-bundle` `read:widget-script: setProgress, hideProgress and the events that call them in the webview script`
- **[[c3]]** `analyze-bundle` `read:tests: the tests that pin the widget (chat-panel.test.ts, chat-theme.test.ts, chat-shell.test.ts)`

## 9. Open questions

- cd1 (partial): setIdle is the new name hideProgress takes in this change; it is stated as a rename, not an existing symbol.
- ts1 (partial): the Story has no acceptance criteria; ac1-ac3 are derived from the request, not stated by the owner.
- alt2 (partial): the alternatives are scored against the request, the one-widget invariant and clarity only; the Story has no formal constraints, HLD contracts or Epic constraints.
- OWNER DECISION: the idle look is a choice made here: the same three dots breathing slowly, and the label 'idle'. Change the label or the animation?
- KNOWN LIMIT (not fixed here): the page treats any done event as the end of the running turn, so an informational line's done shows the idle look while a turn runs. A separate fix would react only to the running turn's own done.

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 12 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-14T19:40:20.341Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
