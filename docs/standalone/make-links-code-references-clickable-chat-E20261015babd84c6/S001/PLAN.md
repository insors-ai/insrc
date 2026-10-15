<!-- insrc:artifact PLAN-babd84c6e2fb480a-S001 -->

# Plan: E20261015babd84c6:S001

## Summary

**Epic:** `make-links-code-references-clickable-chat`
**LLD run:** `wf-1792040975761-1c69sj`
**LLD effective hash:** `babd84c6e2fb...`

The build adds two new page-to-host messages and the host code that validates and opens them, extracts one shared path-containment helper, and adds one shared link step that both the chat page and the review pane inline after guardMd. A final reported live check in a running VS Code confirms what no automated test can: a single browser open, the line reached, and the editor group chosen.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the open-link and open-code-ref messages to the protocol and the shim | S | — | integration: protocol allowlist includes open-link and open-code-ref | [[c1]] [[c2]] [[c5]] |
| 2 | **`t2`** Extract resolveWithin from companion-reader | S | — | integration: companion-reader behaves as before after the containment helper is extracted; unit: resolveWithin refuses .. escapes, absolute paths, missing files and a symlink that points outside the root | [[c2]] [[c3]] [[c5]] |
| 3 | **`t3`** Host handlers for open-link and open-code-ref, injected from extension.ts | M | `t1`, `t2` | integration: the host opens a valid http url externally and refuses a non-http url; integration: the host opens an existing in-workspace path with the line selected; integration: the host refuses an absolute path, a .. path, a missing file and a path with no workspace folder; integration: the host refuses a symlink inside the workspace that points outside it; integration: the host logs and survives an open that rejects or resolves false; integration: the host opens a clicked code reference in the column chooseReviewColumn picks, and Beside when it picks none | [[c1]] [[c3]] [[c4]] [[c5]] |
| 4 | **`t4`** Linkify and click handling in the chat page | M | `t1` | unit: a code reference with a line in running text becomes a link carrying its path and line; unit: text inside code and pre and existing anchors is not wrapped; unit: a version number is not treated as a path; unit: a click on an http link posts open-link and prevents the default; unit: a click on a code reference posts open-code-ref with path and line; unit: guardMd still drops a non-http href; unit: an http link keeps its target in data-url and has no href, so it cannot open by itself; unit: inline code whose whole text is a code reference becomes a link | [[c1]] [[c4]] [[c5]] |
| 5 | **`t5`** Linkify and click handling in the review pane | M | `t4` | unit: the review pane renderer source, run against a stub DOM, links a code reference, strips the href of an http link, and posts open-code-ref and open-link on click; integration: the chat page and the review pane both include the linkify and click wiring | [[c1]] [[c2]] [[c4]] [[c5]] |
| 6 | **`t6`** Live checks in a running VS Code | S | `t3`, `t4`, `t5` | live: an http link opens in the browser exactly once, in the chat and in the review pane; live: a code reference opens at its line, in the chosen editor group, and Beside when only the chat group exists | [[c3]] [[c4]] |

### 1.1 E20261015babd84c6:S001:T001 — Add the open-link and open-code-ref messages to the protocol and the shim

Add the two webview-to-host message variants and their allowlist entries in protocol.ts, and add env.openExternal, Range and Position to the vscode.d.ts shim.

**Acceptance checks:**
- protocol.ts accepts open-link {url} and open-code-ref {path, line?} and rejects other shapes
- the shim compiles a call to env.openExternal and a Range selection

### 1.2 E20261015babd84c6:S001:T002 — Extract resolveWithin from companion-reader

Move the realpath, containment and regular-file check out of companion-reader.ts into an exported resolveWithin(root, relPath, fs) helper, and rewire createCompanionReader onto it with its docs/ root, .html rule and size cap unchanged.

**Acceptance checks:**
- the existing companion reader tests pass unchanged
- resolveWithin refuses .. escapes, absolute paths, missing files and a symlink that points outside the root

### 1.3 E20261015babd84c6:S001:T003 — Host handlers for open-link and open-code-ref, injected from extension.ts

Add the validating handlers to the chat host and the review-pane host, and inject the open-external and open-file-at-line dependencies and the workspace folder from extension.ts. The open-file-at-line dependency takes its viewColumn from the reviewColumn closure and falls back to Beside.

**Acceptance checks:**
- a valid http(s) url is opened externally and any other scheme is refused
- an existing in-workspace file opens with the line selected in the column chooseReviewColumn picks, and Beside when it picks none
- an absolute path, a .. path, a missing file, a symlink escape and a missing workspace folder are refused and logged
- an open that rejects or resolves false is logged and does not throw

### 1.4 E20261015babd84c6:S001:T004 — Linkify and click handling in the chat page

Define the linkify and click source as one exported string in its own module. In render-registry.ts, inline it after guardMd: wrap code references (including inline code that is wholly a path) in anchors carrying data-path and data-line, strip the href from http(s) anchors and keep data-url, style the handled anchors as links, and add one delegated click handler that prevents the default and posts the message. Keep the innerHTML-then-guardMd pairing. Extend the chat-shell stub DOM with text nodes that support splitting and replacing, and confirm it before writing the linkify tests.

**Acceptance checks:**
- a code reference with a line becomes a link carrying its path and line, in running text and in whole-path inline code
- pre blocks, partial inline code, existing anchors and version numbers are not wrapped
- an http link has no href and carries data-url, and a click posts open-link with the default prevented
- a non-http href is still dropped
- render-registry.test.ts guardMd assertions pass

### 1.5 E20261015babd84c6:S001:T005 — Linkify and click handling in the review pane

Inline the same exported linkify string once into the review shell inside DOCS_BODY_RENDERER_SOURCE, add the click handler posting through the pane's message channel, rewrite docs-review-panel.test.ts t4 for the new scrub, extend its stub DOM, and update the SHELL_BASELINE pins as the last step, once the shell source has stopped changing.

**Acceptance checks:**
- the renderer source run against a stub DOM links a code reference, strips the href of an http link and posts open-code-ref and open-link on click
- t4 asserts no href, a data-url and the unchanged non-http and image scrub
- the shell-baseline tests hold with the new pins and the inlines-once test still passes
- open-companion handling is unchanged

### 1.6 E20261015babd84c6:S001:T006 — Live checks in a running VS Code

Click an http link, a code reference with a line and a code reference while the chat group is the only group, in both the chat and the review pane, and record the results as reported evidence at validate. The gate cannot run these, so the result is the builder's own record and maps to no test file.

**Acceptance checks:**
- an http link opens in the browser exactly once
- a code reference opens at its line
- the file opens in the chosen editor group, and Beside when only the chat group exists

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a code reference with a line in running text becomes a link carrying its path and line | `t4` |
| text inside code and pre and existing anchors is not wrapped | `t4` |
| a version number is not treated as a path | `t4` |
| a click on an http link posts open-link and prevents the default | `t4` |
| a click on a code reference posts open-code-ref with path and line | `t4` |
| guardMd still drops a non-http href | `t4` |
| an http link keeps its target in data-url and has no href, so it cannot open by itself | `t4` |
| inline code whose whole text is a code reference becomes a link | `t4` |
| the review pane renderer source, run against a stub DOM, links a code reference, strips the href of an http link, and posts open-code-ref and open-link on click | `t5` |
| the host opens a valid http url externally and refuses a non-http url | `t3` |
| the host opens an existing in-workspace path with the line selected | `t3` |
| the host refuses an absolute path, a .. path, a missing file and a path with no workspace folder | `t3` |
| the chat page and the review pane both include the linkify and click wiring | `t4`, `t5` |
| protocol allowlist includes open-link and open-code-ref | `t1` |
| the host refuses a symlink inside the workspace that points outside it | `t3` |
| the host logs and survives an open that rejects or resolves false | `t3` |
| companion-reader behaves as before after the containment helper is extracted | `t2` |
| the host opens a clicked code reference in the column chooseReviewColumn picks, and Beside when it picks none | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contract details (guardMd and the open-link / open-code-ref messages; the open-attachment contract entry is an alias for them)`
- **[[c2]]** `prior-artifact` `LLD S001 data model changes (protocol messages, shim, render-registry, docs-review-panel and their pinned tests)`
- **[[c3]]** `prior-artifact` `LLD S001 error paths (refused urls and paths, symlink escape, open failures, placement fallback)`
- **[[c4]]** `prior-artifact` `LLD S001 test strategy and acceptance mapping (ac1-ac3 derived from the three user-value points)`
- **[[c5]]** `prior-artifact` `LLD S001 migration steps 1-3`
