<!-- insrc:artifact LLD-f52996c2709dba81-S001 -->

# LLD: E20261016f52996c2:S001

## Summary

**Epic:** `make-code-references-docgen-companion-html`
**HLD base run:** `wf-1792141097950-4yoc59`
**HLD effective hash:** `f52996c2709d...`

A code reference that shows in a diagram or a description table of a companion page, or in a docgen page, opens its file at the line when you click it in the review pane, as references in the chat and the document body already do. The docgen call-sequence diagram now labels each frame with its repo-relative path and line, so there is a reference to click. The page's script marks the elements that hold a reference and posts the clicked reference to the pane, and the pane forwards it only when the message comes from its own companion frame. The host's check of the target is unchanged.

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

### 2.1 `buildCallSequenceIR`

```typescript
buildCallSequenceIR(walk: CallWalk, revision: string, scopeDescription: string, repoRoot?: string): DocumentIR
```

**Parameters:**
- `walk: CallWalk` — The completed call walk whose frames become the diagram's nodes
- `revision: string` — The pinned index revision, unchanged
- `scopeDescription: string` — The scope text, unchanged
- `repoRoot: string | undefined` _(optional)_ — The scope's repo root. When given, a frame is labelled with its path relative to the root and the line

**Returns:** `DocumentIR` — The call-sequence IR; each call-frame node label reads 'name (path:line)' with the path relative to the repo root

**Preconditions:**
- The frames' files are absolute paths from the index

**Postconditions:**
- Without repoRoot, or for a file outside the root, the label keeps its present form
- The label's path uses forward slashes on every platform
- Node ids, edges and citations are unchanged

### 2.2 `frameLabel`

```typescript
frameLabel(f: CallFrameRef, repoRoot?: string): string
```

**Parameters:**
- `f: CallFrameRef` — The frame to label
- `repoRoot: string | undefined` _(optional)_ — The repo root to make the file relative to

**Returns:** `string` — 'name (relative/path.ts:line)'; the base name form when there is no root or the file is outside it

**Postconditions:**
- With a root, the text between the parentheses is a path with a directory part and a line, so the page script finds it
- The base-name fallback (no root, or a file outside it) has no directory part, so the page script does not mark it and it is not clickable

### 2.3 `CODE_REF_SCRIPT (new)`

```typescript
export const CODE_REF_SCRIPT: string
```

**Returns:** `string` — The inline script for a docgen or companion page: after the page is drawn it marks each element whose own text holds a code reference, and when a plain click lands on a marked element posts { type: 'insrc-open-code-ref', path, line? } to the parent window. It is defined in a standalone module, src/docgen/render/code-ref-script.ts, that imports from neither page shell, and the companion shell and both docgen shells import it, so there is no import cycle

**Preconditions:**
- It runs after Mermaid has drawn the diagram, and once at load for a page with no Mermaid run (a page with no Mermaid visual, and the docgen subprocess fallback whose SVG is already in the page)
- The companion's pan/zoom viewport captures the pointer on pointerdown (src/assets/artifacts/companion/panzoom.js), so a click's target is the viewport and not the element under the pointer

**Postconditions:**
- It reads the page and posts one message; it opens nothing itself and changes no text
- It marks an element, never splits a text node, so Mermaid's layout and the pan/zoom script are not disturbed
- It finds the clicked element at pointerdown (a capture-phase listener on the document runs before the viewport captures the pointer), not from the click event's target, so a box inside the pan/zoom viewport is clickable
- A click counts only when the pointer moved at most 4 pixels between pointerdown and click; a press-move-release beyond that is a pan and posts nothing
- It stops no event and does not touch pointer capture, so pan, wheel zoom and double-click zoom work as before
- A reference needs a directory part (a '/'), so a bare file name is never marked; otherwise it uses the chat page's reference grammar, and a test pins the two copies together

### 2.4 `rvFrameMessage (new)`

```typescript
rvFrameMessage(e: MessageEvent): void
```

**Parameters:**
- `e: MessageEvent` — A window message, from the host or from the companion frame

**Returns:** `void` — Posts the existing open-code-ref payload to the host when the message is a valid reference from the pane's own companion frame; otherwise does nothing

**Preconditions:**
- rvCompanion has created the frame whose window is compared with e.source

**Postconditions:**
- A message whose source is not the current companion frame's window is ignored
- path must be a non-empty string of bounded length and line, when present, a positive integer; anything else is ignored
- It posts { type: 'open-code-ref', path, line } and nothing else, so the host's openCodeRef check applies unchanged

## 3. Data model changes

### 3.1 `CallFrame node label (DocumentIR)` — field-modify

The label of a call-frame node changes from 'name (base.ts:line)' to 'name (relative/path.ts:line)' when the scope's repo root is known. Node ids, edge ids and citations do not change, so a record that cites a frame is unaffected. Existing generated documents keep the old label until regenerated. The only production caller of the builder is makeExtract in src/docgen/extract/call-sequence.ts, which has the scope and passes scope.repoRoot; src/docgen/extract/call-graph-reader.ts only builds the frame references and does not change. The existing tests in src/docgen/extract/__tests__/call-sequence.test.ts call the builder with three arguments and are unaffected, since the fourth is optional.

**Call sites:**
- `src/docgen/extract/call-sequence.ts`

### 3.2 `FrameCodeRef message` — new

The message the page posts to the parent: { type: 'insrc-open-code-ref', path: string, line?: number }. It carries a repo-relative path and a 1-based line and nothing else. The pane turns it into the existing open-code-ref message, whose path and line fields are what the host already validates. The docgen tool has two page shells, the Mermaid one (src/docgen/render/shell.ts) and the subprocess fallback (assembleFallbackShell in src/docgen/render/fallback.ts, which inlines an already drawn SVG), and both carry the script; the fallback runs it once at load because it has no Mermaid run.

**Call sites:**
- `src/docgen/render/code-ref-script.ts`
- `src/workflow/artifacts/companion/shell.ts`
- `src/docgen/render/shell.ts`
- `src/docgen/render/fallback.ts`
- `vscode-plugin/src/chat/docs-review-panel.ts`
- `vscode-plugin/src/chat/link-opener.ts`

## 4. Error paths

**Error cases**

- **A page in the frame posts a message with a path that is not a plain relative path (an absolute path, a .. segment, a non-string, or a very long string).** (recoverable)
  - Detection: rvFrameMessage checks the type, that path is a non-empty string of bounded length and that line, when present, is a positive integer, and drops the message when any check fails; the host's openCodeRef then checks the target again before opening.
  - Response: The message is ignored: nothing is posted to the host and nothing is shown.
  - User impact: None: a malformed click does nothing. A valid but outside-the-workspace path reaches the host, whose check refuses it as it does for the chat.
- **A window other than the pane's current companion frame posts a message of the same shape.** (recoverable)
  - Detection: rvFrameMessage compares e.source with the current frame's contentWindow and ignores the message when they differ.
  - Response: The message is ignored.
  - User impact: None: only the companion the pane itself created can ask for a file to be opened.
- **The script runs before Mermaid has drawn the diagram, so it finds no text to mark.** (recoverable)
  - Detection: The script marks references in a step that runs after mermaid.run resolves (and once at load for a page with no Mermaid visual); a test drives both orders against the page builder.
  - Response: References are marked after the diagram is drawn; if Mermaid fails to draw, the page's existing failure note is shown and nothing is marked.
  - User impact: A diagram that fails to draw has no clickable references, as it has nothing else either.
- **A reference in a diagram is a well-formed path to a file that does not exist in the workspace.** (recoverable)
  - Detection: The host's link opener cannot resolve the file inside the workspace and logs a warning (link-opener.ts).
  - Response: The host logs 'a code reference was not opened' and does nothing else; the page does nothing more.
  - User impact: Nothing visible happens and the log has a warning, exactly as for a dead reference in the chat.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A call-sequence frame whose file is outside the repo root, or a document built with no repoRoot | The label keeps its present base-name form, 'name (base.ts:12)'. It has no directory part, so the page script does not mark it: it is not clickable and nothing opens a same-named file at the workspace root. |
| A label with one reference, such as 'validate (src/workflow/synthesizer.ts:207)' | The element holding that text is marked and a click opens src/workflow/synthesizer.ts at line 207. |
| An element whose text holds two references | The first reference in the text is the one a click opens; the element is marked once. |
| A description-table cell holding a path with no line, such as a component's repo path | The cell is marked and a click opens the file at its top. |
| A component box labelled with only a file name, such as 'shell.ts' | Not marked, because the page script requires a directory part; its full path is clickable in the description table. |
| A path on Windows, where the index holds backslashes | The label's path is written with forward slashes, so it matches the grammar and the host receives a forward-slash path. |
| A text that looks like a file but is prose, such as 'e.g. foo.ts' in a narrative | It matches the grammar and is marked like any other reference; the host refuses it if no such file exists in the workspace. |
| A plain click on a marked box inside the pan/zoom viewport, which captures the pointer on pointerdown | The element recorded at pointerdown is the marked box, the pointer moved at most 4 pixels, and the reference is posted. |
| A press on a marked box, a move of more than 4 pixels and a release (a pan) | The viewport pans as before and no reference is posted. |
| A double-click on a marked box | The viewport zooms as before, and each of the two clicks posts the reference, so the host is asked to open the same file twice; opening an already open file again changes nothing. |
| A bare file name or a root-level file such as 'package.json' in text | Not marked, because it has no directory part; the chat page, whose grammar allows it, would link it, so this is the one difference between the two grammars. |

**Invariants to preserve**

- The host's openCodeRef check (workspace root, no .. segments) is unchanged; the pane forwards the existing open-code-ref payload and nothing else. [[c3]]
- The companion frame keeps sandbox='allow-scripts' only and the page's CSP, so the frame still cannot navigate, submit forms, share an origin or reach the network. [[c3]]
- The call-sequence node ids, edge ids and citations do not change; only the label text does. [[c1]]
- The chat page's reference grammar is the single definition of a reference; the copy in the page script is pinned to it by a test. [[c4]]
- The script marks elements and does not split or rewrite text nodes, so Mermaid's layout and the pan/zoom script are not disturbed. [[c2]]
- The companion's pan/zoom behaviour (drag to pan, wheel and double-click to zoom, pointer capture) is unchanged; the script only listens, in the capture phase, and stops no event. [[c2]]

## 5. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), tests under __tests__ beside the code; the plugin's tests run with npm test in vscode-plugin; the page script's tests run the CODE_REF_SCRIPT string in node:vm against a hand-rolled fake document (capture-phase listeners, element text, a pointer-capturing viewport, a stubbed mermaid.run promise), as the plugin's link-markup tests do, since there is no DOM library`

**Test levels**

- **unit** — The call-sequence label carries the repo-relative path and line, and keeps its old form when it cannot.
  - Subjects: `src/docgen/extract/__tests__/call-sequence-label.test.ts: a call frame is labelled with its path relative to the repo root and its line`, `src/docgen/extract/__tests__/call-sequence-label.test.ts: a frame outside the root, or a build with no root, keeps the base-name label`, `src/docgen/extract/__tests__/call-sequence-label.test.ts: node ids, edge ids and citations do not change with the label`
- **unit** — The page script marks the elements that hold a reference and posts the clicked reference, without changing the page's text.
  - Subjects: `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: an element holding a path and line is marked, and a click posts that path and line to the parent`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a table cell holding a path with no line is marked and posts the path alone`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: text with no reference is not marked and a click on it posts nothing`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: marking changes no text node`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the companion page and the docgen page carry the script, after the diagram is drawn`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a click on a marked box inside the pan/zoom viewport, which captures the pointer, posts the reference`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a press, a move past the drag threshold and a release posts nothing`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a bare file name is not marked`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the docgen fallback shell carries the script and marks references at load`
- **unit** — The pane forwards a reference only from its own companion frame and only when the fields are valid.
  - Subjects: `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from the companion frame is posted to the host as an open-code-ref message`, `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from any other window is ignored`, `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a message with a missing, non-string or oversized path, or a line that is not a positive integer, is ignored`, `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: the frame keeps sandbox allow-scripts only`
- **contract** — The page script and the chat page share one definition of a code reference.
  - Subjects: `src/docgen/__tests__/code-ref-grammar-pin.test.ts: the page script's reference grammar equals the chat page's CREF_EXT and CREF_CORE except that it requires a directory part`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/docgen/extract/__tests__/call-sequence-label.test.ts: a call frame is labelled with its path relative to the repo root and its line`, `src/docgen/extract/__tests__/call-sequence-label.test.ts: a frame outside the root, or a build with no root, keeps the base-name label`, `src/docgen/extract/__tests__/call-sequence-label.test.ts: node ids, edge ids and citations do not change with the label` |
| `ac2` | `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: an element holding a path and line is marked, and a click posts that path and line to the parent`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a table cell holding a path with no line is marked and posts the path alone`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: text with no reference is not marked and a click on it posts nothing`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: marking changes no text node`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the companion page and the docgen page carry the script, after the diagram is drawn`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a click on a marked box inside the pan/zoom viewport, which captures the pointer, posts the reference`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a press, a move past the drag threshold and a release posts nothing`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a bare file name is not marked`, `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the docgen fallback shell carries the script and marks references at load` |
| `ac3` | `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from the companion frame is posted to the host as an open-code-ref message`, `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from any other window is ignored`, `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a message with a missing, non-string or oversized path, or a line that is not a positive integer, is ignored`, `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: the frame keeps sandbox allow-scripts only` |
| `ac4` | `src/docgen/__tests__/code-ref-grammar-pin.test.ts: the page script's reference grammar equals the chat page's CREF_EXT and CREF_CORE except that it requires a directory part` |

## 6. Migration

**State before:** A docgen call-sequence label shows only the base name of a frame's file (frameLabel in src/docgen/extract/call-sequence.ts), the companion and docgen pages carry no script that reports a click, and the review pane's companion frame is sandboxed with allow-scripts only, so a click inside it never reaches the pane's own link handler (vscode-plugin/src/chat/docs-review-panel.ts, s1 bundles 1 to 3).

**State after:** A call-sequence label shows the repo-relative path and line when the repo root is known. The companion page and both docgen page shells carry CODE_REF_SCRIPT, which marks elements holding a code reference and posts the clicked reference to the parent. The pane's rvFrameMessage accepts that message only from its own companion frame and posts the existing open-code-ref message to the host. Documents already generated keep their old labels and scripts until regenerated.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Pass the scope's repo root into the call-sequence IR builder and label each frame with its root-relative path and line, keeping the old label when there is no root. — ↩ rollbackable
2. Add the page script that marks reference elements and posts a click to the parent, and include it in the companion page shell and in both docgen page shells (the Mermaid one after the diagram is drawn, the subprocess fallback once at load). — ↩ rollbackable
3. Add the pane's message rule that accepts a reference only from its own companion frame, validates the fields, and forwards the existing open-code-ref message to the host. — ↩ rollbackable
4. Add the test that pins the page script's reference grammar to the chat page's grammar. — ↩ rollbackable

**Backward compat:** No stored record changes. A call-frame node keeps its id, edges and citation, so anything that cites a frame still resolves; only the label text changes, and only for a build made with a repo root. A companion or docgen page already written has no script and no marked references until it is regenerated, and it still opens as before. The host's open-code-ref handler and its validation are unchanged, so the chat and the document body are unaffected. A page that posts the new message to a pane that does not know it (an older installed extension) is ignored by that pane.

## 7. Alternatives considered

### 7.1 a1: One scanning script in the page, one forwarding rule in the pane — **CHOSEN**

The page's script finds code references in its text and posts a click to the pane, which accepts it only from its own frame and forwards it as the existing open-code-ref message.

Add one inline script to the page shells (the companion shell, and the docgen shell if it is opened in the pane). It reads the rendered page for text that matches the code-reference grammar the chat page already uses (a relative path with an optional :N, :N-M or :N:C), marks each match as a reference, and on a click posts one message to the parent window carrying only the path and the line. The pane adds one window message rule: it takes the message only when its source is the companion frame it created, checks the two fields are a string and a positive integer, and posts the existing open-code-ref payload to the host, whose check (the workspace root, no .. segments) is unchanged. Separately, the call-sequence label is changed to the repo-relative path with the line, so the diagram text holds a reference to find.

### 7.2 a2: Builders emit references as data; the page script only wires clicks

Each builder marks its references (path and line) in the page, as data attributes on description-table cells and a map from diagram node id to reference, and the script wires clicks from that.

Extend the companion builders and the docgen IR so a reference is a typed field, not text to be found: a description-table cell can carry {path, line}, and a Mermaid node's id maps to {path, line} in a JSON block embedded in the page. The shell renders a table reference as an element with data-path and data-line, and the script, after Mermaid has drawn the SVG, looks up each node by id and makes it a click target. The click posts the same message to the pane, which forwards it as in a1. The call-sequence label is changed to the repo-relative path with the line, and the IR node carries the same reference as its citation.

**Rejected because:** The most exact, since the builder says what the reference is, and it can link a box labelled with only a file name. But it changes every companion kind and the docgen IR plus a node-id map, which is far more than the stated scope needs, and existing companions do not gain links.

### 7.3 a3: Description tables only, plus the repo-relative label

Make the references in the description tables clickable and fix the call-sequence label, leaving diagram nodes as they are.

The companion shell renders a path in a description table as a link-like element and posts the click to the pane, which forwards it as in a1. The call-sequence label becomes the repo-relative path with the line. Nothing reads the SVG, so Mermaid's output is untouched and there is no text matching in the diagram.

**Rejected because:** Smallest, but it leaves the diagram boxes unclickable, so a docgen call-sequence diagram would still open nothing, which is the point of the Story.

## 8. References

- **[[c1]]** `analyze-bundle` `How docgen labels a call frame and where the path comes from`
- **[[c2]]** `analyze-bundle` `The companion page that the review pane shows in a frame`
- **[[c3]]** `analyze-bundle` `How the review pane shows a companion and handles clicks`
- **[[c4]]** `analyze-bundle` `The reference grammar and the host check that already exist`
- **[[c5]]** `code` `src/docgen/extract/call-sequence.ts:87` — "return `${f.name} (${basename(f.file)}:${f.startLine})`;"
- **[[c6]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:2078` — "f.className='rv-frame';f.setAttribute('sandbox','allow-scripts');"

## 9. Open questions

- Open: is the docgen tool's own page (src/docgen/render/shell.ts) ever shown inside the review pane's frame, or only opened as a file or in a browser? The page script is added to both shells so a reference works wherever the page is shown in the pane; if the docgen page is never shown there, its inclusion can be dropped.
- Open: the pane's frame inherits the page's CSP (script-src with a nonce), so the new inline script must carry the nonce the host gives the other inline scripts. Confirm that the host adds the nonce to every inline script tag of a companion page, and not only to the scripts it knows.
- Open: rvFrameMessage checks the type, length and line of a message but does not itself reject an absolute path or a .. segment; it leaves those to the host's openCodeRef check, which refuses them. Decide whether the pane should also refuse them.
- Acceptance criteria are derived from the Story's user value (the Story has none): ac1 the call-sequence label shows the repo-relative path and line; ac2 the page script marks references and posts a click; ac3 the pane forwards only from its own frame and with valid fields; ac4 the script's grammar is the chat page's.
- Audit partial (cd1): CODE_REF_SCRIPT and rvFrameMessage are new symbols this Story creates, so they are not in an s1 bundle.
- Audit partial (dm2): the call-frame label change states the invariant it must keep, which s5 cites, but the data model entry carries no citation id of its own.
- Audit partial (ts2): the node:test framework comes from the files in an s1 bundle and the project's documented test command; test.locate was not run.

## Resolved questions

- `qb192f323` — Open: is the docgen tool's own page (src/docgen/render/shell.ts) ever shown inside the review pane's frame, or only opened as a file or in a browser? The page script is added to both shells so a reference works wherever the page is shown in the pane; if the docgen page is never shown there, its inclusion can be dropped.
  - **resolved**: Keep the script in both shells — The LLD as approved includes both docgen shells and the companion shell. _(2026-10-16T09:13:52.707Z)_
- `q704fbe07` — Open: the pane's frame inherits the page's CSP (script-src with a nonce), so the new inline script must carry the nonce the host gives the other inline scripts. Confirm that the host adds the nonce to every inline script tag of a companion page, and not only to the scripts it knows.
  - **resolved**: Verify host nonces all inline scripts — Verified: stampScriptNonce in vscode-plugin/src/chat/docs-review-panel.ts (line 2437) gives every script tag without a nonce the pane's nonce, so the new inline script needs no special handling. _(2026-10-16T09:15:00.740Z)_
- `qf0569a95` — Open: rvFrameMessage checks the type, length and line of a message but does not itself reject an absolute path or a .. segment; it leaves those to the host's openCodeRef check, which refuses them. Decide whether the pane should also refuse them.
  - **resolved**: Leave it to the host — The LLD as approved leaves absolute and .. paths to the host's openCodeRef check, the trust boundary. _(2026-10-16T09:15:52.326Z)_

## Citations

- **[[c1]]** `analyze-bundle` `How docgen labels a call frame and where the path comes from`
- **[[c2]]** `analyze-bundle` `The companion page that the review pane shows in a frame`
- **[[c3]]** `analyze-bundle` `How the review pane shows a companion and handles clicks`
- **[[c4]]** `analyze-bundle` `The reference grammar and the host check that already exist`
- **[[c5]]** `code` `src/docgen/extract/call-sequence.ts:87` — "return `${f.name} (${basename(f.file)}:${f.startLine})`;"
- **[[c6]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:2078` — "f.className='rv-frame';f.setAttribute('sandbox','allow-scripts');"
