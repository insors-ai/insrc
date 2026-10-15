<!-- insrc:artifact LLD-00d80121c593053c-S001 -->

# LLD: E2026101500d80121:S001

## Summary

**Epic:** `add-syntax-highlighting-chat-diff-widget`
**HLD base run:** `wf-1792052591189-36jgsd`
**HLD effective hash:** `00d80121c593...`

Added and removed lines in the chat's diff widget are coloured by syntax, in the language of the changed file, using the editor theme's colours. The page tokenises each side of a diff section with a bundled highlighter, so a comment or string that spans lines stays correct, and a file it does not know, or any failure, shows the plain text it shows today. The change stays inside the page: no new message, no stored data and no change to the CSP. Clicking a line of a diff section, or the file's path in its header, also opens that file in the editor at the relevant line, through the same message and host opener the chat's code-reference links use, so it opens in the same editor group.

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
10. [Feedback](#10-feedback)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `renderRegistryWebviewSource`

```typescript
function renderRegistryWebviewSource(): string  // the page script it returns gains: diffTokens(path: string, lines: readonly string[]): Array<Array<{ text: string; cls?: string | undefined }>> | undefined
```

**Parameters:**
- `path: string` — the changed file's path, whose extension picks the language
- `lines: readonly string[]` — the section's diff lines with their ' ', '+', '-' or '\' prefix

**Returns:** `Array<Array<{ text: string; cls?: string | undefined }>> | undefined` — for each diff line, its text as runs of plain text and classed tokens; undefined when the language is unknown or tokenising failed, and the widget then writes the line as plain text, as today. Token classes map to existing :root names in chat-panel.ts, which approximate the editor's token colours and do not reproduce them: keyword to --magenta, string to --accent, number to --amber, function and title to --user, type and built-in to --accent2, comment to --muted, and meta, attribute and tag to --link (each of those is already a VS Code theme variable)

**Errors:**
- `swallowed` when an unknown extension, a missing highlighter or any throw while tokenising returns undefined and is never shown as an error

**Preconditions:**
- the highlighter source has been evaluated in the page before the rows are rendered

**Postconditions:**
- each line's text span holds only text nodes and class-named spans built by DOM construction, never assigned markup
- the sign, the line number and the add/del background are unchanged
- the old side (context and removed lines) and the new side (context and added lines) are tokenised separately, so a removed line is never read as part of the added text
- the highlighter's output is turned into runs by a string scanner over its restricted markup (span open with a class, span close, and the five entities &amp; &lt; &gt; &quot; &#x27;); nested spans are flattened so the innermost class wins, a span that crosses a newline continues on the next line's runs, and any other tag or entity makes the scanner return undefined; a span whose class has no hljs- prefix (a sub-language wrapper) is read as classless text, not as a reason to reject

### 2.2 `open-code-ref`

```typescript
{ type: 'open-code-ref'; path: string; line?: number | undefined }  // sent by the diff widget on a click
```

**Parameters:**
- `path: string` — the section's path as git names it
- `line: number` _(optional)_ — 1-based line in the file as it is now: an added or context line's own new-side number; a removed line's is the new-side number the next line would have; the path in the header uses the section's first new-side line

**Returns:** `void` — the existing page-to-host message from the links story; the host validates the path inside the workspace and opens it at the line in the review pane's editor group, else beside the chat

**Errors:**
- `refused` when the host refuses a path that is absent, outside the workspace, or does not exist (a deleted file); it logs and the click does nothing

**Preconditions:**
- each diff line element carries its path and its new-side line as data attributes, written when the row is built
- a click on the header's collapse control keeps toggling the widget

**Postconditions:**
- a click on a line, or on the path in the header, posts one open-code-ref and does not toggle the widget
- the line number is never taken from the old side of a hunk

## 3. Data model changes

### 3.1 `DiffSection` — invariant-change

No field changes. The section's lines are tokenised in the page from the existing path and lines; nothing is added to the row message or the stored transcript, so rows already stored are highlighted the same way as new ones. The page also gains a bundled highlighter string and a small extension-to-language map, and the widget's stylesheet gains token classes whose colours come from VS Code theme variables. Token colours are not new --vscode-* names: the token rules in the widget's style (RENDER_REGISTRY_STYLE) name only the existing :root layer in chat-panel.ts, so the tests that forbid a --vscode- name in the widget rules and keep the exhaustive list of referenced theme variables stay valid. The added selectors are added to the inline added-selector list in chat-theme.test.ts; chat-theme-before.json is the frozen before-fixture and is not edited. diff-sections.ts is read, not changed: the section's path and lines are the input. The new generated highlighter module is produced by vscode-plugin/gen-webview-libs.mjs. The highlighter goes into its own generated module (webview-hljs.ts), imported only by chat-panel.ts; webview-marked.ts is not changed, and docs-review-panel.ts, which also inlines the marked string, is unchanged and gets no highlighter, so its single-script test is untouched. Existing tests that read a diff line's text span are affected differently by suite. chat-shell.test.ts runs the whole page script over the shared fake DOM, and its diff rows use a path in the language map, so its text-span assertions would read an empty textContent once the span is built from children: the shared fake's textContent getter is made to join the text of its children when it has any, as the real DOM does, and createTextNode is wired into that suite's document stub; the assertions are unchanged. render-registry.test.ts has its own local fake node and document, sets no highlighter global, so its existing diff assertions stay on the plain-text path and are unchanged; the new tokenising unit tests use the shared fake DOM with a highlighter global injected. Other suites that use the shared fake are re-run to confirm the join changes none of them. A diff line element also gains two data attributes, its path and its new-side line, written while the row is built; a delegated click handler in the registry posts the existing open-code-ref message through the registry's link-open sink. The row message and stored rows are still unchanged.

**Call sites:**
- `vscode-plugin/src/chat/render-registry.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/package.json`
- `vscode-plugin/src/chat/__tests__/chat-theme.test.ts`
- `vscode-plugin/gen-webview-libs.mjs`
- `vscode-plugin/src/chat/docs-review-panel.ts`
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts`
- `vscode-plugin/src/chat/__tests__/render-registry.test.ts`
- `vscode-plugin/src/chat/__tests__/fake-dom.ts`

## 4. Error paths

**Error cases**

- **The highlighter throws or is missing in the page** (recoverable)
  - Detection: diffTokens wraps the whole tokenising call in try/catch and checks that the highlighter global is defined before using it
  - Response: diffTokens returns undefined and the widget writes every line as plain text, as today
  - User impact: The diff shows without colours
- **The file's extension has no language in the map** (recoverable)
  - Detection: The extension-to-language lookup finds no entry (or the language is not in the bundled subset)
  - Response: diffTokens returns undefined; no guessing from the content
  - User impact: The diff shows without colours
- **The highlighter returns markup that is not the expected spans and text** (recoverable)
  - Detection: The string scanner over the highlighter's output accepts only a span open with a class attribute, a span close and the five entities, and returns undefined at anything else
  - Response: The whole section falls back to plain text
  - User impact: The diff shows without colours
- **A section is large (up to the saved line limit) and tokenising is slow** (recoverable)
  - Detection: The page tokenises each side only when its widget row is built, and a section is at most the saved line limit
  - Response: The row is built once and not re-tokenised when the widget is opened or closed
  - User impact: A short delay when a large diff first appears
- **The bundled highlighter text contains <script or </script (for example the HTML grammar's own regex)** (recoverable)
  - Detection: The generator scans the bundled string and escapes every '<' that starts '<script' or '</script' as \x3c, and the build fails if the check still finds one
  - Response: The module cannot be emitted with a literal script tag in it, so the shell's single-script check and the browser's inline script both stay valid
  - User impact: None at run time; a developer sees the failed generation
- **A clicked section's file cannot be opened (a deleted file, or the chat's folder is not the workspace folder the host resolves from)** (recoverable)
  - Detection: The host's link opener refuses the path (it is missing, or does not resolve inside the workspace folder) and logs
  - Response: Nothing opens and the widget does not change
  - User impact: The click does nothing

**Edge cases**

| Input | Expected |
| :--- | :--- |
| a TypeScript section where a block comment opens on a context line and closes on an added line | The added line is coloured as comment, because the new side is tokenised as one text |
| a removed line and an added line that make different tokens at the same place | Each is coloured from its own side, never from the other |
| a section that starts in the middle of a string or template | Tokenising starts from the section's first line, so the colouring may be wrong until the string closes; the text is always correct |
| a line starting with a backslash (no newline at end of file) | Shown as the note it is today, not tokenised |
| a file with an extension of mixed case, such as .TS, or a name like Dockerfile or Makefile | The extension is matched without regard to case, and a few well-known file names have their own entries |
| a binary file or an empty section | No lines, nothing to tokenise, the widget shows what it shows today |
| a new file or a deleted file | Only one side has lines; that side is tokenised and the other is empty |
| a click on a removed line | Opens the file at the new-side line the removed text sat before, never an old-side number |
| a click on the file path in the widget header | Opens the file at the section's first new-side line; a click elsewhere on the header still collapses or expands the widget |
| a click while text is being selected in a line | A non-empty text selection is left alone and nothing opens |

**Invariants to preserve**

- The chat page keeps one nonce'd inline script under the unchanged CSP (default-src 'none'; scripts nonce-only), and no markup is assigned for a diff line: its text span is built from text nodes and class-named spans [[c1]]
- The diff widget's structure, sign, line numbers, add/del backgrounds, collapse behaviour and 'more lines' control are unchanged; only the text span's content gains token spans, and a line gains click-to-open [[c2]]
- Stored transcript rows and the row message are unchanged, so highlighting is derived in the page and works for rows already stored [[c3]]

## 5. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), as the existing chat tests`

**Test levels**

- **unit** — The language choice, the side-by-side tokenising and the DOM building, run on the page source against the fake DOM
  - Subjects: `a TypeScript diff line is split into keyword, string and comment tokens carrying their classes`, `a block comment opened on a context line colours an added line as comment`, `a removed line and an added line are each tokenised from their own side`, `an unknown extension and a failing highlighter leave every line as plain text`, `the extension is matched without regard to case and a Dockerfile has a language`, `highlighter output that is not plain spans and text falls back to plain text`, `a diff line's text span holds no assigned markup`, `nested spans and a span that crosses a newline are flattened per line with the innermost class`, `the scanner accepts a multi-class span such as hljs-title function_ and uses its first hljs class`, `a span with no hljs- class is read as classless text and does not reject the section`, `a click on an added or context line posts open-code-ref with its path and new-side line`, `a click on a removed line posts the new-side line it sat before`, `a click on the header's path posts the section's first new-side line, and a click on the rest of the header still toggles the widget`
  - Fixtures: `the shared fake DOM's existing text node, with createTextNode wired into the page's document stub in the tests`
- **integration** — The widget keeps its structure and the page carries the highlighter without widening the CSP
  - Subjects: `the diff widget keeps its signs, line numbers, add and del classes and collapse behaviour with highlighting on`, `the shell inlines the highlighter source once, holds no script tag in it, and the CSP is unchanged`, `the token classes take their colours from existing :root names with no new --vscode- name in the widget rules, and the added selectors are listed exactly`, `a clicked diff line is opened by the host in the editor group the review pane uses, and a deleted file is refused`
  - Fixtures: `the rendered chat shell`, `the selector baseline in chat-theme-before.json`
- **live** — What only a running VS Code shows
  - Subjects: `a diff in the chat is coloured by syntax, readable in a light and a dark theme, and a file of an unknown type stays plain`, `clicking a diff line opens the file at that line beside or in the editor group the review pane uses`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a TypeScript diff line is split into keyword, string and comment tokens carrying their classes`, `a block comment opened on a context line colours an added line as comment`, `a removed line and an added line are each tokenised from their own side`, `the extension is matched without regard to case and a Dockerfile has a language`, `nested spans and a span that crosses a newline are flattened per line with the innermost class`, `the scanner accepts a multi-class span such as hljs-title function_ and uses its first hljs class`, `a span with no hljs- class is read as classless text and does not reject the section` |
| `ac2` | `the token classes take their colours from existing :root names with no new --vscode- name in the widget rules, and the added selectors are listed exactly`, `a diff in the chat is coloured by syntax, readable in a light and a dark theme, and a file of an unknown type stays plain` |
| `ac3` | `the shell inlines the highlighter source once, holds no script tag in it, and the CSP is unchanged`, `a diff line's text span holds no assigned markup`, `highlighter output that is not plain spans and text falls back to plain text` |
| `ac4` | `an unknown extension and a failing highlighter leave every line as plain text`, `the diff widget keeps its signs, line numbers, add and del classes and collapse behaviour with highlighting on` |
| `ac5` | `a click on an added or context line posts open-code-ref with its path and new-side line`, `a click on a removed line posts the new-side line it sat before`, `a click on the header's path posts the section's first new-side line, and a click on the rest of the header still toggles the widget`, `a clicked diff line is opened by the host in the editor group the review pane uses, and a deleted file is refused`, `clicking a diff line opens the file at that line beside or in the editor group the review pane uses` |

## 6. Migration

**State before:** Each diff line in the widget is a div holding a line-number span, a sign span and one text span set from the line as plain text, with add and del backgrounds; no highlighter is bundled and the page's only library is marked, evaluated from a generated string inside the one nonce'd script (render-registry.ts, webview-marked.ts and chat-panel.ts, from the s1 bundles).

**State after:** The page also evaluates a generated highlighter string with a fixed language subset. For each diff section the widget tokenises the old side and the new side separately, maps the tokens back to their lines and builds each line's text span from text nodes and class-named spans. Token classes take their colours from VS Code theme variables. An unknown language or any failure leaves the plain text. The row message, stored rows and CSP are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the highlighter as its own generated webview module (webview-hljs.ts) produced by gen-webview-libs.mjs, bundling highlight.js core and the language subset into one self-contained string (built with esbuild, already a devDependency), escaping any script tag text in it, and record the added size; webview-marked.ts is not touched — ↩ rollbackable
2. Add the extension-to-language map and the tokenising of each section side, with the string scanner that turns the highlighter's output into per-line runs and the plain-text fallback, to the widget's renderer in the page script — ↩ rollbackable
3. Evaluate the highlighter string in the chat shell next to marked (chat-panel.ts only; the review pane's page is unchanged), and add the token class rules, using only the existing :root colour names, to the widget's stylesheet, adding the new selectors to the inline list in chat-theme.test.ts in the same commit — ↩ rollbackable
4. Write each diff line's path and new-side line as data attributes when the row is built, add the delegated click handler that posts the existing open-code-ref message, and make the header's path open the file while the rest of the header still toggles the widget — ↩ rollbackable

**Backward compat:** Additive and page-only: no message, stored data or CSP change, and stored diff rows are highlighted the same way as new ones. A page that cannot run the highlighter shows the plain diff it shows today.

## 7. Alternatives considered

### 7.1 a1: Bundle highlight.js core with a language subset, tokenise each side of a section — **CHOSEN**

A bundled highlight.js subset tokenises each side of a diff section; token classes take the theme's colours.

Generate a webview string for highlight.js core plus a fixed set of common languages (selected by file extension through a small extension-to-language map), exactly as marked is bundled, and evaluate it in the one nonce'd script. For a section, rebuild the old side (context and removed lines) and the new side (context and added lines) as two texts and tokenise each, so a comment or string that spans lines is carried across them; then turn the result into per-line runs with a string scanner over its restricted span markup and build each line's text span from text nodes and class-named spans, never inline colours or assigned markup. Token classes map to theme variables in the widget's rules. An unknown extension, a missing library or a thrown error leaves the plain text.

### 7.2 a2: A small hand-written tokeniser in the page

A compact in-house tokeniser covers the common languages with no new dependency.

Write a compact tokeniser of our own for the families the repo mostly changes (TypeScript and JavaScript, JSON, Python, shell, Markdown, YAML, CSS, HTML): comments, strings, numbers and keywords from short per-language lists. It runs per section side like a1 and builds token spans by DOM construction with textContent, so it never assigns markup. The language comes from a small extension map and anything else stays plain.

**Rejected because:** No dependency and no markup, but it trades accuracy for size, and accuracy is the project's first principle; its edge cases would keep producing wrong colours.

### 7.3 a3: Tokenise in the extension host with a TextMate grammar engine

The host tokenises with TextMate grammars and sends token lists to the page.

Do the tokenising in the extension host with a TextMate engine and grammars, and send the tokens with each diff row, so the page only paints spans. The row message gains a per-line token list.

**Rejected because:** The most accurate result, but a heavy dependency, a changed row message and old rows left unhighlighted make it disproportionate for a colouring feature.

## 8. References

- **[[c1]]** `analyze-bundle` `s1: How a library reaches the page under the strict CSP (webview-marked.ts, chat-panel.ts, package.json)`
- **[[c2]]** `analyze-bundle` `s1: The diff widget renderer and its sections (render-registry.ts, diff-sections.ts)`
- **[[c3]]** `analyze-bundle` `s1: Colours and the theme, and test patterns (chat-panel.ts, chat-theme.test.ts)`

## 9. Open questions

- The contract entry names the existing symbol renderRegistryWebviewSource while describing the new page function diffTokens (a schema workaround); diffTokens, the highlighter string and the language map are new.
- The Story has no acceptance criteria; ac1-ac4 were derived from its stated needs.
- Whether fenced code blocks in assistant replies share the highlighter is left out of this Story and is a candidate follow-up.
- Which languages the bundled subset holds, and the size it adds to the one inline script, are settled and recorded at build; the generator builds the core plus subset with esbuild, a different step from marked's prebuilt-file copy.
- The section's path is relative to the folder the diff ran in, and the host resolves a clicked path from the first workspace folder; if the chat's folder is not that workspace folder, the click is refused and logged. Carrying the folder with the click is left for a follow-up.

## 10. Feedback

- **Subho Ghosh** (2026-10-15T08:57:01.200Z) `comment` `feedback` — `docs/standalone/add-syntax-highlighting-chat-diff-widget-E2026101500d80121/S001/LLD.md`: user should be able to click a diff section and the file should open and navigate to the relevant line

## Resolved questions

- `qe2ebfc79` — The contract entry names the existing symbol renderRegistryWebviewSource while describing the new page function diffTokens (a schema workaround); diffTokens, the highlighter string and the language map are new.
  - **resolved**: Keep workaround, document alias — As decided for the links story: no schema work; tasks and tests use the real new names. _(2026-10-15T09:01:26.748Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1: How a library reaches the page under the strict CSP (webview-marked.ts, chat-panel.ts, package.json)`
- **[[c2]]** `analyze-bundle` `s1: The diff widget renderer and its sections (render-registry.ts, diff-sections.ts)`
- **[[c3]]** `analyze-bundle` `s1: Colours and the theme, and test patterns (chat-panel.ts, chat-theme.test.ts)`
