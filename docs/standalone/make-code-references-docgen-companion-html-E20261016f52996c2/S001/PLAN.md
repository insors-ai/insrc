<!-- insrc:artifact PLAN-f52996c2709dba81-s1 -->

# Plan: E20261016f52996c2:S001

## Summary

**Epic:** `make-code-references-docgen-companion-html`
**LLD run:** `wf-1792141097950-4yoc59`
**LLD effective hash:** `f52996c2709d...`

The build changes the call-sequence label first, then writes the page script that finds code references and posts a click, then adds the pane's rule for taking such a click from its own companion frame, then puts the script into the three page shells, and last pins the script's reference grammar to the chat page's. The pane rule and the page script are built and tested on their own, so the feature only works end to end once both are in; the host's check of the file is not touched. Pages already written are not changed.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Label a call frame with its repo-relative path and line | S | — | unit: src/docgen/extract/__tests__/call-sequence-label.test.ts: a call frame is labelled with its path relative to the repo root and its line; unit: src/docgen/extract/__tests__/call-sequence-label.test.ts: a frame outside the root, or a build with no root, keeps the base-name label; unit: src/docgen/extract/__tests__/call-sequence-label.test.ts: node ids, edge ids and citations do not change with the label | [[c1]] [[c2]] [[c5]] |
| 2 | **`t2`** Write the code-reference page script | M | — | unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: an element holding a path and line is marked, and a click posts that path and line to the parent; unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a table cell holding a path with no line is marked and posts the path alone; unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: text with no reference is not marked and a click on it posts nothing; unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: marking changes no text node; unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a click on a marked box inside the pan/zoom viewport, which captures the pointer, posts the reference; unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a press, a move past the drag threshold and a release posts nothing; unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a bare file name is not marked | [[c1]] [[c3]] [[c4]] |
| 3 | **`t3`** Add the pane's rule for a reference posted by its companion frame | M | — | unit: vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from the companion frame is posted to the host as an open-code-ref message; unit: vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from any other window is ignored; unit: vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a message with a missing, non-string or oversized path, or a line that is not a positive integer, is ignored; unit: vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: the frame keeps sandbox allow-scripts only | [[c1]] [[c3]] [[c5]] |
| 4 | **`t4`** Carry the script in the three page shells | M | `t2` | unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the companion page and the docgen page carry the script, after the diagram is drawn; unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the docgen fallback shell carries the script and marks references at load | [[c1]] [[c2]] [[c5]] |
| 5 | **`t5`** Pin the script's grammar to the chat page's | S | `t2` | unit: src/docgen/__tests__/code-ref-grammar-pin.test.ts: the page script's reference grammar equals the chat page's CREF_EXT and CREF_CORE except that it requires a directory part | [[c4]] [[c5]] |

### 1.1 E20261016f52996c2:S001:T001 — Label a call frame with its repo-relative path and line

Give frameLabel and buildCallSequenceIR an optional repoRoot. With a root, a frame's label reads 'name (path:line)' where path is the file relative to the root with forward slashes; without a root, or for a file outside it, the label keeps the base-name form. Pass scope.repoRoot from makeExtract, the builder's only production caller. Node ids, edge ids and citations are not touched.

**Acceptance checks:**
- A frame inside the root is labelled 'name (relative/path.ts:line)' with forward slashes on every platform
- A frame outside the root, or a build with no root, keeps the 'name (base.ts:line)' label
- Node ids, edge ids and citations are unchanged, and the existing three-argument callers of the builder still compile and pass

### 1.2 E20261016f52996c2:S001:T002 — Write the code-reference page script

Create src/docgen/render/code-ref-script.ts, which imports from neither page shell and exports CODE_REF_SCRIPT. The script marks each element whose own text holds a code reference (a path with a directory part, an optional :N, :N-M or :N:C), records the marked element and position at pointerdown in a capture-phase listener, and on a click that moved at most 4 pixels posts { type: 'insrc-open-code-ref', path, line? } to the parent. It marks elements without splitting text nodes, stops no event, leaves pointer capture alone, and runs once on load and again when asked after a diagram is drawn.

**Acceptance checks:**
- An element whose text holds a path and line is marked and a click posts that path and line; a path with no line posts the path alone
- Text with no reference, and a bare file name, are not marked and post nothing
- Marking changes no text node, and the script stops no event and does not touch pointer capture
- A click on a marked box inside a viewport that captures the pointer posts the reference, and a press, a move past 4 pixels and a release posts nothing

### 1.3 E20261016f52996c2:S001:T003 — Add the pane's rule for a reference posted by its companion frame

In vscode-plugin/src/chat/docs-review-panel.ts, add rvFrameMessage and register it as a window message handler: it acts only when the message's source is the current companion frame's contentWindow, the type is 'insrc-open-code-ref', the path is a non-empty string of bounded length and the line, when present, is a positive integer. It then posts the existing open-code-ref payload to the host. The frame keeps sandbox allow-scripts only; the host's check is untouched. The pane rule stands on its own: it is exercised by posting the frame message straight to the window handler, not through a page.

**Acceptance checks:**
- A test that posts the frame message directly to the pane's window handler, from the companion frame's window, with a valid path and line sees the same path and line posted to the host as an open-code-ref message
- A message from any other window, or with a missing, non-string or oversized path, or a line that is not a positive integer, is ignored
- The frame is still created with sandbox 'allow-scripts' only, and the existing docs-companion, docs-content and decision messages are handled as before

### 1.4 E20261016f52996c2:S001:T004 — Carry the script in the three page shells

Import CODE_REF_SCRIPT into the companion page shell (src/workflow/artifacts/companion/shell.ts), the docgen Mermaid shell (src/docgen/render/shell.ts) and the docgen subprocess fallback (assembleFallbackShell in src/docgen/render/fallback.ts) and inline it. The two Mermaid shells run the marking after mermaid.run resolves, and a page with no Mermaid visual and the fallback run it once at load. A marked element gets a pointer cursor from the page's own style.

**Acceptance checks:**
- The companion shell, the docgen Mermaid shell and the docgen fallback shell each carry CODE_REF_SCRIPT, imported from the one module, with no import cycle between the shells and the module
- In the two Mermaid shells the marking runs after the diagram is drawn; a page with no Mermaid visual and the fallback mark references at load
- A marked element is styled as clickable (a pointer cursor) in the companion shell and in both docgen shells
- A page built without any reference is otherwise unchanged and still renders its header, narrative, view and description tables

### 1.5 E20261016f52996c2:S001:T005 — Pin the script's grammar to the chat page's

Add a contract test that reads the chat page's CREF_EXT and CREF_CORE from vscode-plugin/src/chat/link-markup.ts and checks that the page script's grammar equals them except for the directory group, which the script requires to be non-empty.

**Acceptance checks:**
- The test fails when the page script's extension list or line forms differ from the chat page's
- The only allowed difference is the required directory part, and the test says so

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/docgen/extract/__tests__/call-sequence-label.test.ts: a call frame is labelled with its path relative to the repo root and its line | `t1` |
| src/docgen/extract/__tests__/call-sequence-label.test.ts: a frame outside the root, or a build with no root, keeps the base-name label | `t1` |
| src/docgen/extract/__tests__/call-sequence-label.test.ts: node ids, edge ids and citations do not change with the label | `t1` |
| src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: an element holding a path and line is marked, and a click posts that path and line to the parent | `t2` |
| src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a table cell holding a path with no line is marked and posts the path alone | `t2` |
| src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: text with no reference is not marked and a click on it posts nothing | `t2` |
| src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: marking changes no text node | `t2` |
| src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the companion page and the docgen page carry the script, after the diagram is drawn | `t4` |
| src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a click on a marked box inside the pan/zoom viewport, which captures the pointer, posts the reference | `t2` |
| src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a press, a move past the drag threshold and a release posts nothing | `t2` |
| src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a bare file name is not marked | `t2` |
| src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the docgen fallback shell carries the script and marks references at load | `t4` |
| vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from the companion frame is posted to the host as an open-code-ref message | `t3` |
| vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from any other window is ignored | `t3` |
| vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a message with a missing, non-string or oversized path, or a line that is not a positive integer, is ignored | `t3` |
| vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: the frame keeps sandbox allow-scripts only | `t3` |
| src/docgen/__tests__/code-ref-grammar-pin.test.ts: the page script's reference grammar equals the chat page's CREF_EXT and CREF_CORE except that it requires a directory part | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails: buildCallSequenceIR, frameLabel, CODE_REF_SCRIPT (new), rvFrameMessage (new)`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges: CallFrame node label, FrameCodeRef message`
- **[[c3]]** `prior-artifact` `LLD S001 errorPaths: foreign or malformed message, script timing, missing file, pan and double-click edge cases`
- **[[c4]]** `prior-artifact` `LLD S001 testStrategy: label, page script, pane and grammar-pin subjects and acceptance mapping ac1-ac4`
- **[[c5]]** `prior-artifact` `LLD S001 migration: four rollbackable steps (label, page script and shells, pane rule, grammar pin)`
