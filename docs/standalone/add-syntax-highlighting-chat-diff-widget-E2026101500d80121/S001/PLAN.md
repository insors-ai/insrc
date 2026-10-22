<!-- insrc:artifact PLAN-00d80121c593053c-s1 -->

# Plan: E2026101500d80121:S001

## Summary

**Epic:** `add-syntax-highlighting-chat-diff-widget`
**LLD run:** `wf-1792052591189-36jgsd`
**LLD effective hash:** `00d80121c593...`

The build bundles a highlighter into the chat page as its own generated module, adds the language map and a markup scanner, and uses them to colour each side of every diff section, falling back to plain text on any problem. It then loads the module in the chat shell with token colours taken from the chat's existing theme variables, and makes a diff line or its header path open the file at the right line through the links story's message and host opener. A last live check in a running VS Code confirms the colours in both themes and the click. One deliberate departure from the LLD's wording: the shared fake DOM gains a textOf helper instead of a children-joining textContent getter, because the getter change broke 11 unrelated UX-card tests.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Generate the highlighter module with a language subset and a size budget | M | — | unit: evaluating the highlighter module highlights TypeScript, JSON and Python text as span markup; integration: the highlighter module holds no script tag and its byte length stays under 250 KB | [[c1]] [[c3]] [[c5]] |
| 2 | **`t2`** Give the shared fake DOM a textOf helper that reads descendants' text | S | — | unit: the shared fake DOM's textOf joins descendants' text while textContent stays its own text and still clears children when set | [[c2]] [[c3]] |
| 3 | **`t3`** Language map and the span-markup scanner | M | — | unit: the extension is matched without regard to case and a Dockerfile has a language; unit: nested spans and a span that crosses a newline are flattened per line with the innermost class; unit: the scanner accepts a multi-class span such as hljs-title function_ and uses its first hljs class; unit: a span with no hljs- class is read as classless text and does not reject the section; unit: highlighter output that is not plain spans and text falls back to plain text | [[c1]] [[c3]] |
| 4 | **`t4`** Tokenise each side of a diff section and build highlighted lines | M | `t1`, `t2`, `t3` | unit: a TypeScript diff line is split into keyword, string and comment tokens carrying their classes; unit: a block comment opened on a context line colours an added line as comment; unit: a removed line and an added line are each tokenised from their own side; unit: an unknown extension and a failing highlighter leave every line as plain text; unit: a diff line's text span holds no assigned markup; integration: the diff widget keeps its signs, line numbers, add and del classes and collapse behaviour with highlighting on | [[c1]] [[c2]] [[c3]] [[c4]] |
| 5 | **`t5`** Load the highlighter in the chat shell and colour the token classes | S | `t4` | integration: the shell inlines the highlighter source once, holds no script tag in it, and the CSP is unchanged; integration: the token classes take their colours from existing :root names with no new --vscode- name in the widget rules, and the added selectors are listed exactly | [[c1]] [[c3]] [[c4]] |
| 6 | **`t6`** Click a diff line or its path to open the file at the line | M | `t4` | unit: a click on an added or context line posts open-code-ref with its path and new-side line; unit: a click on a removed line posts the new-side line it sat before; unit: a click on the header's path posts the section's first new-side line, and a click on the rest of the header still toggles the widget; integration: a clicked diff line is opened by the host in the editor group the review pane uses, and a deleted file is refused | [[c2]] [[c3]] [[c5]] |
| 7 | **`t7`** Live checks in a running VS Code | S | `t5`, `t6` | live: a diff in the chat is coloured by syntax, readable in a light and a dark theme, and a file of an unknown type stays plain; live: clicking a diff line opens the file at that line beside or in the editor group the review pane uses | [[c3]] [[c4]] |

### 1.1 E2026101500d80121:S001:T001 — Generate the highlighter module with a language subset and a size budget

Add highlight.js as a dev dependency and extend gen-webview-libs.mjs to bundle highlight.js core plus typescript/javascript, json, python, go, java, scala, bash, yaml, css, xml/html and markdown into one self-contained string with esbuild, escape any script-tag text in it, and write it to src/chat/webview-hljs.ts (HLJS_SRC). webview-marked.ts is not touched.

**Acceptance checks:**
- npm run gen:webview-libs writes webview-hljs.ts exporting HLJS_SRC and still writes webview-marked.ts unchanged
- evaluating HLJS_SRC defines a highlighter global that highlights TypeScript, JSON and Python text and returns span markup
- the string holds no <script or </script text, and the generator fails if it finds one
- the byte length of HLJS_SRC alone is under 250 KB and a test fails above that

### 1.2 E2026101500d80121:S001:T002 — Give the shared fake DOM a textOf helper that reads descendants' text

Add an exported textOf(node) helper to fake-dom.ts that joins the text of a node's descendants as the real textContent does, and wire createTextNode into the chat-shell document stub. The fake's own textContent getter is NOT changed: making it join children changed 11 docs-review-panel tests, which collect textContent over every element and rely on it being a node's own text. Tests that read a highlighted diff line's text read it through textOf. This replaces the LLD's wording that the getter joins children.

**Acceptance checks:**
- textOf joins the text of a node's text-node and element descendants, and returns a childless node's own text
- an element's textContent is still its own text, and setting textContent still clears the children as fake-dom.test.ts asserts
- every suite that uses fake-dom.ts passes unchanged

### 1.3 E2026101500d80121:S001:T003 — Language map and the span-markup scanner

In the registry's page script add the extension-to-language map (case-insensitive, with Dockerfile and Makefile by name) and the string scanner that turns the highlighter's span markup into per-line runs: innermost class wins, a span crossing a newline continues on the next line, a multi-class span uses its first hljs class, a class with no hljs- prefix is classless, and any other tag or entity makes it return undefined. Both are pure and written as a reusable unit.

**Acceptance checks:**
- the extension is matched without regard to case and a Dockerfile and a Makefile have a language
- nested spans and a span that crosses a newline are flattened per line with the innermost class
- a multi-class span such as hljs-title function_ uses its first hljs class, and a span with no hljs- class is classless text
- markup other than a span with a class, a span close and the five entities makes the scanner return undefined

### 1.4 E2026101500d80121:S001:T004 — Tokenise each side of a diff section and build highlighted lines

Add diffTokens, which rebuilds the old side (context and removed lines) and the new side (context and added lines) as two texts, tokenises each with the highlighter and maps the runs back to their lines, and build each diff line's text span from text nodes and class-named spans, falling back to plain text for an unknown language, a missing highlighter, a throw or a scanner refusal. A backslash note line is not tokenised.

**Acceptance checks:**
- a TypeScript line is split into keyword, string and comment runs carrying their classes
- a block comment opened on a context line colours an added line as comment, and a removed line is tokenised from its own side
- an unknown extension, a missing highlighter or a thrown highlight leave every line as plain text
- a diff line's text span holds only text nodes and class-named spans, never assigned markup
- the existing chat-shell and render-registry diff assertions pass unchanged

### 1.5 E2026101500d80121:S001:T005 — Load the highlighter in the chat shell and colour the token classes

Evaluate HLJS_SRC in the chat shell next to marked in chat-panel.ts only, add the token class rules to the widget's stylesheet using only existing :root names (keyword magenta, string accent, number amber, function and title user, type and built-in accent2, comment muted, meta/attribute/tag link), and list the added selectors exactly in chat-theme.test.ts.

**Acceptance checks:**
- the shell inlines the highlighter source exactly once, holds one script tag, and the CSP is unchanged
- the widget rules name no --vscode- variable and the added selectors match the inline list exactly
- docs-review-panel.ts and webview-marked.ts are unchanged and the review pane's single-script test passes

### 1.6 E2026101500d80121:S001:T006 — Click a diff line or its path to open the file at the line

Write each diff line's path and new-side line as data attributes when the row is built, add the delegated click handler that posts the existing open-code-ref message through the registry's link-open sink (a removed line uses the new-side line it sat before, a non-empty text selection is left alone), and make the header's path open the file at the section's first new-side line while the rest of the header still toggles the widget.

**Acceptance checks:**
- a click on an added or context line posts open-code-ref with its path and its new-side line
- a click on a removed line posts the new-side line it sat before, never an old-side number
- a click on the header's path posts the section's first new-side line and a click on the rest of the header still toggles the widget
- a click during a text selection posts nothing
- the host opens a clicked line in the editor group the review pane uses and refuses a deleted file

### 1.7 E2026101500d80121:S001:T007 — Live checks in a running VS Code

In the installed plugin, look at a diff in the chat in a light and a dark theme and a file of an unknown type, and click a diff line and the header path. The gate cannot run these, so the results are the builder's own record and map to no test file.

**Acceptance checks:**
- a diff is coloured by syntax and readable in a light and a dark theme, and an unknown file type stays plain
- clicking a diff line opens the file at that line in the right editor group, and the header path opens at the section's first line

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a TypeScript diff line is split into keyword, string and comment tokens carrying their classes | `t4` |
| a block comment opened on a context line colours an added line as comment | `t4` |
| a removed line and an added line are each tokenised from their own side | `t4` |
| an unknown extension and a failing highlighter leave every line as plain text | `t4` |
| the extension is matched without regard to case and a Dockerfile has a language | `t3` |
| highlighter output that is not plain spans and text falls back to plain text | `t3` |
| a diff line's text span holds no assigned markup | `t4` |
| nested spans and a span that crosses a newline are flattened per line with the innermost class | `t3` |
| the scanner accepts a multi-class span such as hljs-title function_ and uses its first hljs class | `t3` |
| a span with no hljs- class is read as classless text and does not reject the section | `t3` |
| a click on an added or context line posts open-code-ref with its path and new-side line | `t6` |
| a click on a removed line posts the new-side line it sat before | `t6` |
| a click on the header's path posts the section's first new-side line, and a click on the rest of the header still toggles the widget | `t6` |
| the diff widget keeps its signs, line numbers, add and del classes and collapse behaviour with highlighting on | `t4` |
| the shell inlines the highlighter source once, holds no script tag in it, and the CSP is unchanged | `t5` |
| the token classes take their colours from existing :root names with no new --vscode- name in the widget rules, and the added selectors are listed exactly | `t5` |
| a clicked diff line is opened by the host in the editor group the review pane uses, and a deleted file is refused | `t6` |
| a diff in the chat is coloured by syntax, readable in a light and a dark theme, and a file of an unknown type stays plain | `t7` |
| clicking a diff line opens the file at that line beside or in the editor group the review pane uses | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contract details (diffTokens and the scanner, the highlighter module, and the open-code-ref click; the renderRegistryWebviewSource entry is an alias for the new diffTokens)`
- **[[c2]]** `prior-artifact` `LLD S001 data model changes (the diff line's data attributes, the shared fake DOM and the existing tests that read a diff text span)`
- **[[c3]]** `prior-artifact` `LLD S001 error paths and invariants (the fallbacks, the script-tag escape, the unchanged CSP, row message and stored rows)`
- **[[c4]]** `prior-artifact` `LLD S001 test strategy and acceptance mapping (ac1-ac5, derived; ac5 from the user's review comment)`
- **[[c5]]** `prior-artifact` `LLD S001 migration steps 1-4`
