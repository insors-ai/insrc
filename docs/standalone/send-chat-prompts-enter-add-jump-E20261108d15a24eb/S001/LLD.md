<!-- insrc:artifact LLD-d15a24eb41e0771c-s1 -->

# LLD: STORY-d15a24eb41e0771c-s1 — Send chat prompts with Enter and add a jump-to-latest button

## Summary

**Epic:** `send-chat-prompts-enter-add-jump`
**HLD base run:** `wf-1794167867692-ets35x`
**HLD effective hash:** `d15a24eb41e0...`

In the VS Code dev chat, pressing Enter now sends the prompt, and Ctrl+Enter starts a new line instead. Cmd+Enter behaves like Ctrl+Enter, and Shift+Enter keeps inserting a line. When you scroll up in the transcript, a small floating button appears over its lower edge; clicking it takes you to the latest output and it disappears once you are following the end again.

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

### 2.1 `doSubmit`

```typescript
function doSubmit(): void
```

**Returns:** `void` — Unchanged: posts submit-turn for a non-empty box. Only what triggers it changes.

**Preconditions:**
- The keydown is on the insrc-input textarea, and its key is Enter with no Ctrl, Cmd, Shift or Alt held, and it is not part of an IME composition.

**Postconditions:**
- The keydown's default is prevented, so a plain Enter never leaves a line break in the box, even when the box is empty and nothing is sent.
- Ctrl+Enter and Cmd+Enter insert one line break at the caret, replacing any selection, and do not submit.
- Shift+Enter and Alt+Enter keep the browser's behaviour and do not submit.
- An Enter that confirms an IME composition is left alone and does not submit.
- The '>' prompt control and its own Enter and Space handling are unchanged.
- IDLE_PLACEHOLDER and QUEUE_PLACEHOLDER state the new keys.

### 2.2 `transcriptPagerWebviewSource`

```typescript
function transcriptPagerWebviewSource(): string /* source of (term: HTMLElement, o?: { bar?: HTMLElement; jump?: HTMLElement; post?: (m: unknown) => void; setTimeout?: Function; clearTimeout?: Function }) => Pager */
```

**Parameters:**
- `o.jump: HTMLElement` _(optional)_ — The floating jump-to-latest button. The pager shows and hides it and handles its click.

**Returns:** `string` — The pager factory's source. The returned pager's surface is unchanged.

**Preconditions:**
- The jump element is not a child of the transcript element.

**Postconditions:**
- The jump element is shown exactly while the pager's following state is false, and is hidden otherwise.
- Its state is recomputed on scroll and after append, track, prepend and reset, so new output arriving with no scroll event still leaves it correct.
- A click moves the view to the end through toBottom, so following resumes and the button hides.
- Without a jump element the pager behaves as before.

## 3. Data model changes

### 3.1 `Chat shell DOM` — invariant-change

A new positioned wrapper, insrc-termwrap, takes the flex:1 place of insrc-term in the shell column and holds insrc-term and the new insrc-jump button. The button is a native button with an aria-label, hidden until the pager shows it. insrc-term stays the panel's single scroll region and every child of it stays a transcript row. Nothing is stored or sent to the host.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts:2102`
- `vscode-plugin/src/chat/chat-panel.ts:2420`
- `vscode-plugin/src/chat/chat-panel.ts:2660`

## 4. Error paths

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Enter in an empty box, or a box of only spaces, with no attachments | Nothing is sent and no line break is added. |
| Enter in an empty box with attachments shown | Sent, as doSubmit already allows. |
| Enter while a turn is running | The same as today's submit shortcut: doSubmit runs, and with the queue on the message waits. |
| Enter pressed to confirm an IME composition (isComposing true, or keyCode 229) | The composition is confirmed and nothing is sent. |
| Ctrl+Enter with text selected | The selection is replaced by one line break and the caret sits after it. |
| A long multi-line message | The box keeps its fixed two-line height and scrolls its own content; the transcript stays the panel's only scroll region. |
| A transcript too short to scroll | The view is at the end, so the button stays hidden. |
| The reader scrolls up while output is streaming | The button appears and stays, the view does not move, and new rows do not hide it. |
| A row is appended empty and filled while the view is following | The button stays hidden, because following is true throughout. |
| The reader scrolls back down to the end by hand | Following resumes and the button hides. |
| A page of older rows loads while the reader is near the top | The view keeps its place and the button stays shown. |
| The chat switches to another session | Reset moves the view to the end and the button hides. |
| The button is clicked | The view moves at once to the end, without an animation, the button hides, and keyboard focus returns to the prompt box. |

**Invariants to preserve**

- A reader who has scrolled up is left where they are when new rows arrive. [[c1]]
- Every child of the transcript element is a row the pager stamps and trims, and it stays the panel's single scroll region. [[c2]]
- Submit converges on the one doSubmit path, shared with the '>' prompt control. [[c3]]

## 5. Test strategy

**Test framework:** `node:test with the plugin's fake DOM, run under the default node`

**Test levels**

- **unit** — The pager's jump button against the pager's scroll stub.
  - Subjects: `jump: hidden while following and at the end`, `jump: shown when the reader scrolls up and stays shown as new rows arrive`, `jump: stays hidden while a row is appended empty and then filled`, `jump: a click moves to the end, resumes following and hides the button`, `jump: hides when the reader scrolls back to the end`, `jump: hidden after a session reset`
  - Fixtures: `The makeView stub in transcript-pager.test.ts, given a jump element`
- **integration** — The real shell script's key handling and button wiring on the shared fake DOM.
  - Subjects: `composer: Enter submits and prevents the line break`, `composer: Enter on an empty box sends nothing and adds no line break`, `composer: Ctrl+Enter inserts a line at the caret and does not submit`, `composer: Cmd+Enter inserts a line and does not submit`, `composer: Shift+Enter does not submit and leaves the browser's line break`, `composer: an Enter confirming an IME composition does not submit`, `composer: the placeholders state the new keys`, `shell: the jump button sits outside the transcript and a click returns focus to the prompt`
  - Fixtures: `The shell harness in chat-shell.test.ts`
- **smoke** — See the floating button on the real rendered shell.
  - Subjects: `visual: the jump button floats over the transcript's lower edge in light and dark themes`
  - Fixtures: `The fidelityHtml render with headless Chrome`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `composer: Enter submits and prevents the line break`, `composer: Ctrl+Enter inserts a line at the caret and does not submit`, `composer: the placeholders state the new keys` |
| `ac2` | `jump: shown when the reader scrolls up and stays shown as new rows arrive`, `jump: hidden while following and at the end`, `jump: a click moves to the end, resumes following and hides the button` |

## 6. Migration

**State before:** Cmd/Ctrl+Enter submits and a plain Enter inserts a line (vscode-plugin/src/chat/chat-panel.ts:2622). The placeholders state the old shortcut. The transcript has no control to return to the end.

**State after:** Enter submits, and Ctrl/Cmd+Enter inserts a line. The placeholders state this. A floating button returns to the end while the reader has scrolled up.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Ship the changed keys, placeholders and button in a new VS Code plugin build; there is no stored state to move. — ↩ rollbackable

**Backward compat:** Muscle memory changes: Cmd/Ctrl+Enter no longer sends, and a plain Enter no longer adds a line. Nothing else changes: no setting, message or stored format.

## 7. Alternatives considered

### 7.1 a1: Button state owned by the pager — **CHOSEN**

The transcript pager takes an optional jump element and shows it whenever the view has stopped following the end.

The composer's keydown listener handles Enter directly. The pager gains an optional `jump` element in its options, next to the existing `bar`. It recomputes the element's visibility wherever it already decides following (scroll, append, track, prepend, reset), and a click calls its existing toBottom. The shell wraps the transcript in a positioned element so the button can float over it without being a transcript row.

### 7.2 a2: Button state owned by the shell

The shell script listens to the transcript's scroll event and shows the button from the pager's atBottom.

The composer change is as in a1. The shell adds its own scroll listener and shows the button when atBottom is false, and exports toBottom from the pager for the click.

**Rejected because:** Keeps the pager smaller but duplicates a decision the pager already makes, and duplicates it less accurately.

### 7.3 a3: Sticky transcript child

The button is a sticky-positioned last child of the transcript, needing no wrapper.

The button is placed inside the transcript element with position sticky and moved after each append so it stays last.

**Rejected because:** Removes the wrapper but puts a non-row among the rows.

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/chat/transcript-pager.ts:58-62`
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2102`
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2622`
