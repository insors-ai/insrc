<!-- insrc:artifact LLD-babd84c6e2fb480a-S001 -->

# LLD: E20261015babd84c6:S001

## Summary

**Epic:** `make-links-code-references-clickable-chat`
**HLD base run:** `wf-1792040975761-1c69sj`
**HLD effective hash:** `babd84c6e2fb...`

Links in assistant replies and in review-pane documents become clickable. http and https links open in the browser, and a repository file path with an optional line, such as src/foo.ts:42, becomes a link that opens that file at that line in the editor. The page only reports what was clicked; the extension host validates the target and does the opening, so the strict CSP and the guardMd scrub stay as they are.

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

### 2.1 `guardMd`

```typescript
function guardMd(el: HTMLElement): void
```

**Parameters:**
- `el: HTMLElement` — the rendered markdown container to scrub and linkify

**Returns:** `void` — the container is scrubbed as today (non-http(s) hrefs dropped); afterwards code references in text outside code, pre and anchors, and inline code elements (not under pre) whose whole text is a code reference, are wrapped in anchors carrying data-path and data-line, and http(s) anchors lose their href and keep only data-url, so VS Code's own link handling has nothing to open and the click handler is the single path

**Errors:**
- `swallowed` when any failure inside the scrub is caught, as today, and leaves the rendered text unlinked

**Preconditions:**
- el holds the output of marked.parse

**Postconditions:**
- no anchor keeps an href
- every http(s) anchor carries data-url and every code reference carries data-path
- text inside pre elements and inside inline code that is not wholly a code reference is never wrapped

### 2.2 `open-attachment`

```typescript
{ type: 'open-link'; url: string } | { type: 'open-code-ref'; path: string; line?: number | undefined }
```

**Parameters:**
- `url: string` _(optional)_ — the clicked http or https address
- `path: string` _(optional)_ — the clicked repository-relative file path
- `line: number` _(optional)_ — 1-based line to reveal

**Returns:** `void` — two new page-to-host messages added beside open-attachment and open-companion in protocol.ts and its allowlist. The file opens in the column chosen by chooseReviewColumn (review-column.ts), the same rule that places the review pane

**Errors:**
- `refused` when the host drops a url that is not http or https, and a path that is absolute, contains .. segments, resolves outside the workspace folder, or does not exist; each is logged, never thrown

**Preconditions:**
- sent by the delegated click handler after preventDefault

**Postconditions:**
- a valid url opens in the browser; a valid path opens in the editor with the line selected, in the editor group the review pane placement chooses (an existing group that holds no chat tab, else the active group), never in the chat group

## 3. Data model changes

### 3.1 `WebviewToHost protocol messages` — field-add

Two new message variants, open-link and open-code-ref, added to the webview-to-host union and its allowlist. No stored data changes. The hosts receive their open dependencies from extension.ts, since chat-panel.ts and docs-review-panel.ts do not import vscode; the vscode.d.ts shim gains env.openExternal, Range and Position. On the chat surface the linkify step and the guardMd href change land in render-registry.ts, keeping the innerHTML-then-guardMd pairing that render-registry.test.ts asserts. Existing tests that pin the old scrub change with it: docs-review-panel.test.ts t4 (guardMd strips a non-http href and an image src) asserts that an https href survives with rel and target, and is rewritten to assert no href, a data-url and the same non-http and image scrub; its stub DOM is extended so the linkify step can run. render-registry.test.ts string assertions on guardMd are checked and updated the same way. The review-pane shell is pinned byte-for-byte: the SHELL_BASELINE chars, bytes and sha256 constants (the t1 shell-baseline test and its matching pin) are updated in the same commit that changes the shell, and the linkify fragment is inlined once into the review shell (inside the renderer source), so the 'inlines each source string verbatim and exactly once' test keeps holding. Clicked files are placed by the existing chooseReviewColumn rule; that function is reused as is, not changed.

**Call sites:**
- `vscode-plugin/src/chat/protocol.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/docs-review-panel.ts`
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/vscode.d.ts`
- `vscode-plugin/src/chat/companion-reader.ts`
- `vscode-plugin/src/chat/render-registry.ts`
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts`
- `vscode-plugin/src/chat/__tests__/render-registry.test.ts`
- `vscode-plugin/src/chat/review-column.ts`

## 4. Error paths

**Error cases**

- **Clicked url is not http or https (a crafted href that survived rendering)** (recoverable)
  - Detection: The host checks the parsed URL protocol against http: and https: before opening
  - Response: Dropped and logged; nothing opens
  - User impact: The click does nothing
- **Clicked path escapes the workspace (absolute, .. segments, or resolves outside the workspace folder)** (recoverable)
  - Detection: The host rejects absolute paths and .. segments, then compares the realpath of the target with the realpath of the workspace folder, so a symlink inside the workspace that points outside is refused
  - Response: Dropped and logged; nothing opens
  - User impact: The click does nothing
- **Clicked path does not exist (the text only looked like a path)** (recoverable)
  - Detection: The host stats the resolved file and finds no regular file
  - Response: Logged; nothing opens
  - User impact: The click does nothing
- **No workspace folder is open** (recoverable)
  - Detection: The host finds no workspace folders
  - Response: Code references are not opened; logged
  - User impact: The click does nothing
- **The editor fails to open the file** (recoverable)
  - Detection: The vscode.open call rejects
  - Response: Caught and logged, never thrown into the message handler
  - User impact: The click does nothing
- **The browser open fails (openExternal rejects or resolves false)** (recoverable)
  - Detection: The open dependency's result is checked: a rejection is caught by a rejection handler as with the attachment open, and a false result is read as a failure
  - Response: Logged; nothing else happens
  - User impact: The click does nothing

**Edge cases**

| Input | Expected |
| :--- | :--- |
| src/foo.ts:42 in running text | Wrapped as a link to src/foo.ts line 42 |
| src/foo.ts:10-20 | Linked to line 10 |
| src/foo.ts with no line | Linked, opens at the top of the file |
| a path inside a fenced block, or inline code that holds more than just the path | Left as plain code, not wrapped |
| text already inside an anchor | Not wrapped again |
| a version like 1.2.3 or a word with a dot but no known extension | Not treated as a path |
| a path split across two assistant-delta rows | Each row is rendered on its own, so the split path stays unlinked |
| a markdown link in a review-pane document whose href is not http(s) | guardMd removes the href as today and the anchor text stays plain |
| inline code whose whole text is a path, such as `src/foo.ts:42` | Linked, because assistant replies and documents write paths in backticks |
| a code reference is clicked while the only open editor group holds the chat tab | No column is chosen, so the file opens Beside, as the quiet review pane does, and not in the chat group |

**Invariants to preserve**

- guardMd keeps dropping every non-http(s) href (and now every href on handled anchors), and the CSP stays default-src 'none' with nonce-only scripts [[c1]]
- The review pane keeps handling open-companion and its artifact-membership check unchanged [[c2]]
- The page never opens anything itself; it only posts a message and the host does the opening, as with open-attachment [[c3]]

## 5. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), as the existing chat tests`

**Test levels**

- **unit** — Page script behaviour on the stub DOM: linkify rules and the delegated click
  - Subjects: `a code reference with a line in running text becomes a link carrying its path and line`, `text inside code and pre and existing anchors is not wrapped`, `a version number is not treated as a path`, `a click on an http link posts open-link and prevents the default`, `a click on a code reference posts open-code-ref with path and line`, `guardMd still drops a non-http href`, `an http link keeps its target in data-url and has no href, so it cannot open by itself`, `inline code whose whole text is a code reference becomes a link`, `the review pane renderer source, run against a stub DOM, links a code reference, strips the href of an http link, and posts open-code-ref and open-link on click`
  - Fixtures: `the stub DOM in chat-shell.test.ts extended with anchors and text nodes`, `a stub DOM with text nodes that support splitting and replacing, confirmed before the linkify tests are written`
- **integration** — Host handlers validate and open, and both surfaces carry the wiring
  - Subjects: `the host opens a valid http url externally and refuses a non-http url`, `the host opens an existing in-workspace path with the line selected`, `the host refuses an absolute path, a .. path, a missing file and a path with no workspace folder`, `the chat page and the review pane both include the linkify and click wiring`, `protocol allowlist includes open-link and open-code-ref`, `the host refuses a symlink inside the workspace that points outside it`, `the host logs and survives an open that rejects or resolves false`, `companion-reader behaves as before after the containment helper is extracted`, `the host opens a clicked code reference in the column chooseReviewColumn picks, and Beside when it picks none`
  - Fixtures: `a temporary workspace folder with a file`, `a recording stub for the open calls`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a click on an http link posts open-link and prevents the default`, `the host opens a valid http url externally and refuses a non-http url`, `the host logs and survives an open that rejects or resolves false`, `an http link keeps its target in data-url and has no href, so it cannot open by itself` |
| `ac2` | `a code reference with a line in running text becomes a link carrying its path and line`, `the host opens an existing in-workspace path with the line selected`, `the host refuses an absolute path, a .. path, a missing file and a path with no workspace folder`, `the host refuses a symlink inside the workspace that points outside it`, `inline code whose whole text is a code reference becomes a link`, `the host opens a clicked code reference in the column chooseReviewColumn picks, and Beside when it picks none` |
| `ac3` | `the review pane renderer source, run against a stub DOM, links a code reference, strips the href of an http link, and posts open-code-ref and open-link on click`, `the chat page and the review pane both include the linkify and click wiring`, `guardMd still drops a non-http href`, `companion-reader behaves as before after the containment helper is extracted` |

## 6. Migration

**State before:** Chat and review-pane markdown is rendered by marked and scrubbed by guardMd. guardMd keeps http(s) hrefs and sets rel=noopener noreferrer and target=_blank on them, so VS Code's own webview link handling may already open them; it drops every other href (removing the href but leaving the anchor), and no click handler of ours exists (render-registry.ts and docs-review-panel.ts, from the s1 bundles).

**State after:** http(s) links and repository file references are clickable on both surfaces. guardMd strips the href from handled anchors and keeps the target in a data attribute, so VS Code's own link handling has nothing to open; one delegated click handler posts open-link or open-code-ref and the host validates and opens the target. The CSP is unchanged and guardMd still never leaves a non-http(s) href.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the open-link and open-code-ref message variants and allowlist entries to the protocol — ↩ rollbackable
2. Add the host handlers to the chat host and the review-pane host: open-link opens an http(s) url externally, open-code-ref validates the path with a new exported helper (resolveWithin(root, relPath, fs) returning the real path or undefined) extracted from companion-reader.ts; createCompanionReader is rewired onto it unchanged (docs/ root, .html, size cap) and its existing tests stay green; the host then opens the path at the line. Inject the open-external and open-file-at-line dependencies and the workspace folder from extension.ts into both hosts, and add env.openExternal, Range and Position to the vscode.d.ts shim so a real Range selects the line. The open-file-at-line dependency in extension.ts takes its viewColumn from the existing reviewColumn closure (chooseReviewColumn over the tab groups), so a clicked code reference opens in the same group the review pane would; if the closure yields no column the file opens Beside, as the quiet review pane does, so it never lands in the chat group — ↩ rollbackable
3. Extend the page scripts of both surfaces with the linkify step after guardMd, a rule that styles the handled anchors as links, and the delegated click handler, updating the review-pane SHELL_BASELINE pins in the same commit — ↩ rollbackable

**Backward compat:** Additive: no stored data, no existing message changes meaning; an older page that does not send the new messages is unaffected.

## 7. Alternatives considered

### 7.1 a1: Page-side linkify + host-side validated open — **CHOSEN**

After marked + guardMd, the page script wraps code references in links and one delegated click handler posts the target to the host, which validates and opens it.

A shared page-script fragment (used by both render-registry.ts and docs-review-panel.ts) runs after guardMd: it walks text nodes outside code/pre/a, wraps path[:line[-line]] matches in anchors carrying data attributes, and keeps http(s) hrefs. A single delegated click listener on the container preventDefaults and posts {type:'open-link', url} or {type:'open-code-ref', path, line}. The host validates (http/https only for url; path resolved under the workspace folder, must exist, no escape) and opens via vscode.env.openExternal or vscode.open with a selection.

### 7.2 a2: Pure recognizer module + host resolves

A pure TS recognizer is inlined into the page script by stringification; host does the same validated open.

Write the code-reference recognizer as a pure function in its own module (unit-testable), embed its source into the page script via Function.prototype.toString, and use the same delegated click + host open-link/open-code-ref messages as a1.

**Rejected because:** Same runtime behaviour as a1 with better unit-testability, but function stringification is fragile and adds indirection for a small rule set.

### 7.3 a3: Host-side rewrite before render

The host rewrites markdown to add links before it reaches the page.

The host preprocesses assistant markdown, replacing code references with markdown links using a custom scheme, and guardMd is widened to allow that scheme; clicks post the scheme target back.

**Rejected because:** Does not cover streamed rendering and requires weakening guardMd.

## 8. References

- **[[c1]]** `analyze-bundle` `s1: Markdown rendering and the guardMd scrub in the chat page (render-registry.ts)`
- **[[c2]]** `analyze-bundle` `s1: Review pane markdown scrub (docs-review-panel.ts, open-companion)`
- **[[c3]]** `analyze-bundle` `s1: Page-to-host open messages and host handlers (protocol.ts, chat-panel.ts, extension.ts)`

## 9. Open questions

- The Story has no acceptance criteria; ac1-ac3 were derived from its three user-value points.
- The contract entry for the two new messages is named open-attachment (an existing message) as a schema workaround; they are the new open-link and open-code-ref messages.
- A live click must confirm an http link opens in the browser exactly once and a code reference opens at its line; no automated test can prove VS Code's own behaviour.
- Whether VS Code places a clicked file in the chosen group is checked live, as the review pane placement is.

## 10. Feedback

- **Subho Ghosh** (2026-10-15T05:27:07.278Z) `comment` `feedback` — `docs/standalone/make-links-code-references-clickable-chat-E20261015babd84c6/S001/LLD.md`: The placement of the links opened should follow the same as the placement issue just fixed.

## Resolved questions

- `q6aed0048` — The Story has no acceptance criteria; ac1-ac3 were derived from its three user-value points.
  - **resolved**: Accept derived ac1-ac3 as-is — User approved the LLD with the derivation disclosed; PLAN notes they were derived. _(2026-10-15T05:32:51.759Z)_
- `qdf0d2c9a` — The contract entry for the two new messages is named open-attachment (an existing message) as a schema workaround; they are the new open-link and open-code-ref messages.
  - **resolved**: Keep the workaround, document the alias — User chose no schema work for a naming quirk; plan and tests use open-link and open-code-ref. _(2026-10-15T05:33:23.411Z)_
- `qa6f82020` — A live click must confirm an http link opens in the browser exactly once and a code reference opens at its line; no automated test can prove VS Code's own behaviour.
  - **resolved**: Automated seam test plus live check _(2026-10-15T05:33:44.919Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1: Markdown rendering and the guardMd scrub in the chat page (render-registry.ts)`
- **[[c2]]** `analyze-bundle` `s1: Review pane markdown scrub (docs-review-panel.ts, open-companion)`
- **[[c3]]** `analyze-bundle` `s1: Page-to-host open messages and host handlers (protocol.ts, chat-panel.ts, extension.ts)`
