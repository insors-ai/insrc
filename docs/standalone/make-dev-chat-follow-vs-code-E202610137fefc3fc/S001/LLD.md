<!-- insrc:artifact LLD-7fefc3fc5c51793e-S001 -->

# LLD: E202610137fefc3fc:S001

## Summary

**Epic:** `make-dev-chat-follow-vs-code`
**HLD base run:** `wf-1791872516326-o5v763`
**HLD effective hash:** `7fefc3fc5c51...`
**Seeded from:** `SPEC-3d2161bcef24cecf`

The dev chat's colours are chosen in one list of named values at the top of its style. Today that list holds fixed dark colours; this Story points each name at a VS Code theme variable, adds names for the surfaces the approved mapping needs, and replaces every remaining fixed colour, tint and gradient in the chat's three style sources with one of those names. The chat then follows light, dark and high-contrast themes. Layout, shapes and glyphs stay as they are, and the docs-review panel is not touched.

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

### 2.1 `RENDER_REGISTRY_STYLE`

```typescript
export const RENDER_REGISTRY_STYLE: string  // existing constant in render-registry.ts; same selectors, colour values changed
```

**Returns:** `string` — The row renderer's rules. Every colour is `var(--<name>)` from the shell's named layer; there is no hex, rgb/rgba, hsl, color-mix or gradient, and no `var(--name, literal)` fallback. Approval card: warning ground and border. Approve button: button ground and text; deny button: secondary button ground and text; hover uses the theme's hover grounds in place of a brightness filter. Approved and rejected card states: border in the passed or failed colour on the code-block ground. Permission-outcome chip, resolved selection card and selection-outcome chip: code-block ground with the widget border. Decided badge: passed or failed colour for text and border on a transparent ground, given by the more specific selectors `.insrc-permoutcome__badge.insrc-approval__btn--approve` and `--deny`, so the renderer's class names do not change. Selection card: widget ground and border; option rows: checkbox ground and border; chosen option: focus border; control glyph: checkbox foreground; confirm: button ground and text.

**Preconditions:**
- The document that embeds it defines the named layer (the chat shell does).

**Postconditions:**
- Selectors, box model, spacing, radii and class names are unchanged.

### 2.2 `CHAT_MARKDOWN_TOKENS`

```typescript
export const CHAT_MARKDOWN_TOKENS: MarkdownStyleTokens  // existing token set in markdown-style.ts; values changed, type unchanged
```

**Returns:** `MarkdownStyleTokens` — Each field holds a name from the shell's layer: text and headings the editor foreground, borders the panel border, muted the description foreground, `accent` (inline code text) the preformat foreground, `codeBg` the code-block ground in place of the fixed '#0a0d14', `fontMono` the editor font. `fontSans` (the assistant's prose) stays `var(--sans)`; what `--sans` holds is the open question. renderMarkdownStyle and DOCS_REVIEW_MARKDOWN_TOKENS are not changed; rules the token set has no field for (block quote ground and border, horizontal rule, link colour) are added by the chat shell after the markdown rules.

**Postconditions:**
- The docs-review panel's markdown is byte-identical to today.

## 3. Data model changes

### 3.1 `the chat shell's named colour layer (the `:root` rule of layoutStyle in renderShell, chat-panel.ts)` — field-modify

The one place the chat's colours are chosen. `color-scheme:dark` is removed; the colour scheme follows the theme-kind class VS Code puts on the body (light for vscode-light and vscode-high-contrast-light, dark for vscode-dark and vscode-high-contrast). Every existing name is kept and now holds a theme variable; names are added for the roles the mapping needs. A fallback is always another theme variable, never a literal. Every border name starts with the high-contrast border so high-contrast themes get their outline.

```
--font: var(--vscode-editor-font-family)
--sans: OPEN QUESTION (default: var(--vscode-font-family))
--bg, --panel: var(--vscode-editor-background)
--bg-inset (header, input, progress, status and attachment bars): var(--vscode-editorWidget-background)
--bg-alt: var(--vscode-dropdown-background)
--code-bg (new): var(--vscode-textCodeBlock-background)
--fg, --fg-strong: var(--vscode-editor-foreground)
--muted, --dim: var(--vscode-descriptionForeground)
--placeholder (new): var(--vscode-input-placeholderForeground)
--input-fg (new): var(--vscode-input-foreground)
--border: var(--vscode-contrastBorder, var(--vscode-panel-border))
--border-lit (bars, bubbles, tool rows, chips): var(--vscode-contrastBorder, var(--vscode-editorWidget-border, var(--vscode-panel-border)))
--link (new): var(--vscode-textLink-foreground)
--sel: var(--vscode-editor-selectionBackground)
--accent (send control, tool prompt, done marker): var(--vscode-terminal-ansiGreen)
--accent2 (tool marker and label): var(--vscode-terminal-ansiCyan)
--amber (edit marker): var(--vscode-terminal-ansiYellow)
--magenta (pending marker, assistant label): var(--vscode-terminal-ansiMagenta)
--user (user label): var(--vscode-terminal-ansiBlue)
--red (error marker, stop, remove, error line): var(--vscode-errorForeground)
--warn (new; approval title, auto-approve pill): var(--vscode-editorWarning-foreground)
--warn-bg, --warn-border (new): var(--vscode-inputValidation-warningBackground), var(--vscode-contrastBorder, var(--vscode-inputValidation-warningBorder))
--user-bg (new): var(--vscode-chat-requestBackground, var(--vscode-editor-inactiveSelectionBackground))
--user-border (new): var(--vscode-contrastBorder, var(--vscode-chat-requestBorder, var(--vscode-editorWidget-border, var(--vscode-panel-border))))
--btn-bg, --btn-fg, --btn-hover (new): var(--vscode-button-background), var(--vscode-button-foreground), var(--vscode-button-hoverBackground)
--btn2-bg, --btn2-fg, --btn2-hover (new): var(--vscode-button-secondaryBackground), var(--vscode-button-secondaryForeground), var(--vscode-button-secondaryHoverBackground)
--pass, --fail (new): var(--vscode-testing-iconPassed), var(--vscode-testing-iconFailed)
--add-bg, --del-bg (new): var(--vscode-diffEditor-insertedLineBackground, var(--vscode-diffEditor-insertedTextBackground)), var(--vscode-diffEditor-removedLineBackground, var(--vscode-diffEditor-removedTextBackground))
--focus (new): var(--vscode-focusBorder)
--dropdown-bg, --dropdown-fg, --dropdown-border (new): var(--vscode-dropdown-background), var(--vscode-dropdown-foreground), var(--vscode-contrastBorder, var(--vscode-dropdown-border))
--check-bg, --check-fg, --check-border (new): var(--vscode-checkbox-background), var(--vscode-checkbox-foreground), var(--vscode-contrastBorder, var(--vscode-checkbox-border))
--progress (new): var(--vscode-progressBar-background)
--quote-bg, --quote-border, --sep (new): var(--vscode-textBlockQuote-background), var(--vscode-textBlockQuote-border), var(--vscode-textSeparator-foreground)
--pre-fg (new): var(--vscode-textPreformat-foreground)
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/render-registry.ts`
- `vscode-plugin/src/chat/markdown-style.ts`

### 3.2 `the shell's own rules (layoutStyle in renderShell, chat-panel.ts)` — field-modify

Every fixed colour outside `:root` is replaced by a name. Removed: the two radial gradients on body and the one on #insrc-term (flat grounds), and the header dot's glow (the dot stays, in --accent). The auto-approve pill's border and text use --warn. The diff's added and removed lines use --add-bg and --del-bg; its buttons use the secondary button names. The user bubble uses --user-bg and --user-border; the assistant bubble uses --panel with --border-lit. .insrc-toolrow and .insrc-json use --code-bg with --border-lit. Links use --link. The input's text uses --input-fg and its placeholder --placeholder. The progress dots use --progress. The status bar selects' option lists use the dropdown names. Focusable controls get a --focus outline on :focus-visible. Rules for block quotes, horizontal rules and links inside the assistant's markdown are added after the markdown rules. The select arrows stay two linear gradients built from --muted and `transparent`: they draw a shape, not a tint.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.3 `the history chip in the header (markup and rule in renderShell, chat-panel.ts)` — field-modify

Today the chip is the select itself: a faint fixed fill, and the clock icon painted as an SVG data URI whose stroke is a fixed colour, which a theme variable cannot reach. The select is wrapped in one span that carries the chip's border, radius and ground (the dropdown ground) and draws the icon in its ::before as a mask filled with the current text colour, so the icon follows the theme. The select keeps its id, options, arrow and behaviour; the icon's shape and position are unchanged. The mask is a data URI, which the existing `img-src data:` allows; the content security policy is not changed.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

## 4. Error paths

**Error cases**

- **A theme does not define a variable the chat uses (an optional colour the theme leaves unset, or a variable an older VS Code does not have, such as the chat request ground).** (recoverable)
  - Detection: Nothing in code can see it at run time: the browser treats a declaration whose var() has no value as unset. It is prevented by construction: every name whose theme variable is optional carries a fallback to a variable every theme defines, and a test checks that each such name has one.
  - Response: The fallback variable is used: the user message falls back to the inactive selection ground, widget and request borders fall back to the panel border, diff line grounds fall back to the diff text grounds.
  - User impact: The element is drawn in a neighbouring theme colour instead of losing its ground or taking the text colour as its border.
- **A rule refers to a name the layer does not define (a typo, or a name removed from the list).** (recoverable)
  - Detection: A test collects every `var(--name)` used in the shell's style, the row renderer's style and the chat's markdown rules and fails when a name that is not a --vscode-* variable is missing from the layer.
  - Response: The build fails before release.
  - User impact: None: it cannot ship.
- **A fixed colour is reintroduced later (a hex, an rgb/rgba or hsl value, a color-mix, a tint gradient, or a `var(--x, literal)` fallback).** (recoverable)
  - Detection: A test scans the chat's own style in the rendered shell (everything except the shared token sheet, which is out of scope) and fails on any of those forms; linear-gradient is allowed only when built from names and `transparent`.
  - Response: The build fails before release.
  - User impact: None: it cannot ship.
- **A theme variable name is misspelt, so the element silently loses its colour.** (recoverable)
  - Detection: A test compares the set of --vscode-* variables the layer refers to with the list in the approved mapping; a variable outside that list fails.
  - Response: The build fails before release.
  - User impact: None: it cannot ship. A name that is spelt as approved but does not exist in VS Code can only be seen in the panel, which the smoke check covers.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A light theme. | Light grounds and dark text everywhere, including the status bar selects' option lists and the scrollbars, because the colour scheme follows the theme kind; no dark panel remains. |
| A high-contrast theme (dark or light). | Every bordered element is outlined with the theme's contrast border; user and assistant messages are told apart by their outlines, labels and alignment even where their grounds are the same. |
| The user switches theme while the chat is open. | The chat repaints at once with no reload, since every colour is a variable VS Code updates in place. |
| A theme whose terminal colours are close to its background. | Markers are less distinct in that theme; this follows the user's decision to take marker colours from the theme's terminal palette. |
| A theme whose warning ground is opaque and strong. | The approval card is drawn in it with the editor's text colour; the card's title uses the warning foreground. Whether that pair reads well is a property of the theme. |
| A restored chat with every kind of row (messages, tool rows and results, diff, approval outcomes, selection outcomes, attachments, markdown with code, quote, table and rule). | Every row is drawn from theme colours; nothing shows a leftover dark ground. |
| The docs-review panel. | Unchanged: its document is byte-identical to today. |
| The chat host built with a custom renderStyle or theme (as tests and mocks do). | Unchanged behaviour: the shell's own layer does not depend on the injected sheet. |

**Invariants to preserve**

- The shell stays one nonce'd inline script and one content security policy, `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-...'`; every image source the shell declares is a data URI. [[c1]]
- Selectors, class names, element ids, the box model, spacing, radii, glyphs and the markup the tests address stay as they are, apart from the one wrapper around the history select. [[c1]]
- The row renderer's class names and structure are unchanged; only RENDER_REGISTRY_STYLE's colour values change. [[c2]]
- renderMarkdownStyle, DOCS_REVIEW_MARKDOWN_TOKENS and design-tokens.ts are not changed, so the docs-review panel and the generated mocks are byte-identical. [[c3]]
- The shared token sheet keeps supplying the marker glyphs to the chat; the chat only re-tones them. [[c4]]

## 5. Test strategy

**Test framework:** `node:test run through tsx, with node:assert/strict; the shell is rendered through createChatPanelHost with a fake channel, as chat-panel.test.ts and chat-shell.test.ts do`

**Test levels**

- **unit** — The chat's own style, read from the rendered shell, holds no fixed colour and only names it defines.
  - Subjects: `chat theme: the chat's own style has no hex, rgb, rgba, hsl or color-mix value, no radial gradient, no var() with a literal fallback, and no forced colour scheme; a linear gradient is built only from names and transparent`, `chat theme: every name used in the shell style, the row renderer style and the chat's markdown rules is defined in the named layer`, `chat theme: the named layer refers only to the theme variables of the approved mapping, and every optional one falls back to another theme variable`, `chat theme: each component uses the name the mapping gives it (bars, transcript, user and assistant bubbles, tool row, markers, diff lines, approval card and buttons, decided badge, selection card, input, selects, pill, attachment chips, progress, markdown)`
- **integration** — The shell around the style is otherwise unchanged, and the docs-review panel is untouched.
  - Subjects: `chat theme: the history chip is one wrapper around the select with a masked icon in the current text colour; the select keeps its id and options, and every image source the shell declares is allowed by its content security policy`, `chat theme: selectors, class names and element ids of the shell and the row renderer are the same as before the change, and the shell is still one nonce'd inline script under the same policy`, `chat theme: the docs-review panel's rendered document, the shared token sheet and the docs-review markdown rules are byte-identical to before the change`
  - Fixtures: `the list of selectors, class names and ids, and the docs-review document, captured from the code before the change`
- **smoke** — What only eyes can judge: the panel in real themes.
  - Subjects: `in VS Code: with a dark, a light and a high-contrast theme the chat follows the theme with no leftover dark panel, user and assistant messages are told apart, markers are distinct, the approval and selection cards, diff, tool rows, attachment chips, selects and markdown read well, and switching theme repaints the open chat`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `chat theme: the chat's own style has no hex, rgb, rgba, hsl or color-mix value, no radial gradient, no var() with a literal fallback, and no forced colour scheme; a linear gradient is built only from names and transparent`, `chat theme: the named layer refers only to the theme variables of the approved mapping, and every optional one falls back to another theme variable`, `in VS Code: with a dark, a light and a high-contrast theme the chat follows the theme with no leftover dark panel, user and assistant messages are told apart, markers are distinct, the approval and selection cards, diff, tool rows, attachment chips, selects and markdown read well, and switching theme repaints the open chat` |
| `ac2` | `chat theme: each component uses the name the mapping gives it (bars, transcript, user and assistant bubbles, tool row, markers, diff lines, approval card and buttons, decided badge, selection card, input, selects, pill, attachment chips, progress, markdown)` |
| `ac3` | `chat theme: selectors, class names and element ids of the shell and the row renderer are the same as before the change, and the shell is still one nonce'd inline script under the same policy`, `chat theme: the docs-review panel's rendered document, the shared token sheet and the docs-review markdown rules are byte-identical to before the change` |

## 6. Migration

**State before:** The chat shell forces a dark colour scheme and chooses its colours from 19 named variables holding fixed values, with further fixed tints, gradients and three fixed code grounds in its rules, in the row renderer's style and in the chat's markdown tokens (s1: the chat shell's palette; s1: the row renderer's style and the chat's markdown tokens). The docs-review panel uses a separate shared sheet and its own markdown tokens (s1: what is shared with the docs-review panel).

**State after:** The same names hold VS Code theme variables, new names cover the roles of the approved mapping, no fixed colour, tint or decorative gradient remains in the chat's three style sources, and the colour scheme follows the theme kind. The history chip's icon is a mask in the text colour inside one wrapper. The docs-review panel and the shared sheet are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Point the existing names in the shell's layer at theme variables, add the new names, remove the forced dark colour scheme and add the theme-kind colour scheme rules. Rules that already use names follow at once. — ↩ rollbackable
2. Replace the fixed colours, tints and gradients in the shell's own rules with names, add the block quote, rule and link rules for the assistant's markdown, and move the history chip to the wrapper with the masked icon. — ↩ rollbackable
3. Replace the fixed colours, tints, gradients and literal fallbacks in the row renderer's style with names, and give the decided badge its own passed and failed colours. — ↩ rollbackable
4. Point the chat's markdown tokens at names, replacing the fixed code ground. — ↩ rollbackable
5. Add the tests that keep fixed colours out and names defined, and update the four assertions that pinned the history chip's old fill and icon stroke. — ↩ rollbackable

**Backward compat:** No public interface changes. The exported names RENDER_REGISTRY_STYLE, CHAT_MARKDOWN_TOKENS and renderMarkdownStyle keep their types; no message, stored row or setting changes. A user sees the chat in their theme's colours from the next window reload after the update; there is no setting to keep the old dark palette.

## 7. Alternatives considered

### 7.1 a1: One named layer in the shell, pointed at theme variables — **CHOSEN**

Keep the shell's named variables as the single place colours are chosen, point each at a --vscode-* variable, and replace every remaining literal with one of those names.

The shell's `:root` rule stays the one place where the chat's colours are chosen, but each name now holds a theme variable (for example the panel ground holds the editor background) and new names are added for the surfaces the mapping needs (widget surface, code-block ground, user-message ground and border, warning ground and border, button and secondary button, passed and failed, the four terminal colours, focus, dropdown, checkbox, progress, block quote, separator). The rules in the shell, in the row renderer's style and in the chat's markdown tokens keep referring to names; every hex, rgba and gradient outside `:root` is replaced by a name, and the forced dark colour scheme is removed. A test reads the rendered shell and fails on any fixed colour.

### 7.2 a2: Theme variables written directly in every rule

Remove the shell's named variables and write the --vscode-* variable in each rule that needs a colour.

The `:root` palette is deleted. Every rule in the shell's style, the row renderer's style and the chat's markdown tokens is rewritten to name the theme variable it uses directly, with the two-step fallbacks (user message, high-contrast border) repeated wherever they apply. The same test guards against fixed colours.

**Rejected because:** Meets the constraints but rewrites about 130 uses and repeats the fallback chains, so two elements of the same role can drift apart.

### 7.3 a3: Extend the shared token sheet and use it for the chat

Grow design-tokens.ts to cover every role the chat needs and make the chat use those --it-* tokens.

The shared terminal token set, which already maps nine roles to theme variables with literal fallbacks, is extended with the roles the chat needs, and the chat shell, row renderer and chat markdown tokens are changed to use the --it-* names instead of the shell's own. The docs-review panel, which uses the same sheet, receives the new tokens too.

**Rejected because:** Breaks two of the approved constraints: it changes a sheet the docs-review panel uses, and that sheet's pattern is a fixed literal fallback.

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:585` — "const csp = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;"
- **[[c2]]** `code` `vscode-plugin/src/chat/render-registry.ts:189` — "export const RENDER_REGISTRY_STYLE ="
- **[[c3]]** `code` `vscode-plugin/src/chat/markdown-style.ts:120` — "export const DOCS_REVIEW_MARKDOWN_TOKENS: MarkdownStyleTokens = {"
- **[[c4]]** `code` `vscode-plugin/src/chat/design-tokens.ts:174` — "export function renderTerminalStyle(theme: TerminalTheme = terminalTheme): string {"

## 9. Open questions

- Which font should the assistant's markdown prose use? Today it is the one place in the chat that is not monospace: it uses a fixed sans stack ('Inter', system-ui, ...), while the approved spec says fonts are the theme's monospace editor font. Options: the VS Code interface font (--vscode-font-family), which keeps prose proportional as it is today and follows the user's settings (the design's default); or the editor's monospace font for prose too, as the spec's wording says.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**2 do not hold · 2 could not be verified · 10 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-13T06:26:55.196Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | MED | Every element of the approved mapping in SPEC-3d2161bcef24cecf has a name in the layer, including the markdown group 'textPreformat.*, textCodeBlock.background, textBlockQuote.* and textSeparator.foreground'. | The spec maps markdown to 'textPreformat.*' (foreground and background). The layer defines only `--pre-fg: var(--vscode-textPreformat-foreground)`; there is no name for textPreformat.background. The cause is the token set: markdown-style.ts:88-89 uses the single `codeBg` field for both inline code (`.insrc-md code{...background:${t.codeBg}`) and fenced blocks (`.insrc-md pre{background:${t.codeBg}`), and the design points `codeBg` at the code-block ground, so inline code chips get textCodeBlock.background instead of textPreformat.background. Every other mapping entry I compared (bars, bubbles, tool row, markers, diff, approval, buttons, decided chips, selection card, input, selects, pill, attachment chips, progress, quote, separator, focus) has a name. [files: docs/standalone/dev-chat-follows-vs-code-theme-E202610133d2161bc/SPEC.md, vscode-plugin/src/chat/markdown-style.ts] | Add a `--pre-bg: var(--vscode-textPreformat-background)` name and an override rule for inline code (`.insrc-md code{background:var(--pre-bg)}` with `.insrc-md pre code` kept at none) among the rules the shell adds after the markdown rules, or record explicitly that inline code takes the code-block ground and why. |
| change-sites | MED | The existing tests that need changing are 'the four assertions that pinned the history chip's old fill and icon stroke'. | Only two assertions pin the fill and stroke (1463 `background-color:rgba\\(255,255,255,\\.045\\)`, 1477 `stroke='%23c6cdd8'`). Moving the border, radius, ground and icon from the select to a wrapper with a ::before mask breaks more, in two tests. Test at 1119 ('...the rest of the chip is untouched') asserts on the `.chrome #insrc-history{...}` rule: 1127 `border:1px solid var\\(--border\\)`, 1128 `border-radius:6px`, 1129 `padding:3px 16px 3px 22px`, 1130 `background-position:left 6px center`. Test at 1449 asserts on the same rule: 1455 `background-image:url\\("data:image\\/svg\\+xml,`, 1456 `background-repeat:no-repeat,no-repeat,no-repeat` (three layers), 1461 border, 1462 radius, 1466-1475 the padding and `background-position:left (\\d+)px center` relationship. Roughly ten assertions across two tests pin where the chip's border, radius and icon live, not four. [files: vscode-plugin/src/chat/__tests__/chat-panel.test.ts] | Replace the migration step's count with the real inventory: both tests (chat-panel.test.ts:1119-1131 and 1449-1483) must be rewritten to assert the border, radius and ground on the wrapper, the icon as a mask in its ::before placed inside the left padding, and the select's own rule reduced to max-width, padding and the two arrow layers. Keep the intent of each (one control, icon inside the padding, 36ch cap). |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| error-paths | Every optional theme variable falls back to a variable every theme defines, so no element loses its ground or border when a theme leaves one unset. | VS Code's colour registry is not in this repository, so I could not check which variables are always emitted. The fallback chains as written are well formed. One case to confirm: as far as I recall, high-contrast themes leave both diffEditor.insertedLineBackground and diffEditor.insertedTextBackground unset (they use borders instead), and likewise for the removed pair. If so `--add-bg` and `--del-bg` have no value there and the diff's added and removed lines are drawn with no ground at all (chat-panel.ts:691-692 give them nothing else to tell them apart). The result is a transparent line, not a broken one, but the design's statement that the fallback is 'a variable every theme defines' would be untrue for these two names. | Check the diff line grounds in a high-contrast theme during the smoke test. If they are unset, state the expected high-contrast look for diff lines in the edge cases (for example a contrast-border edge), and narrow the test's claim about fallbacks accordingly. |
| error-paths | The colour scheme can follow the theme-kind class on the body: light for vscode-light and vscode-high-contrast-light, dark for vscode-dark and vscode-high-contrast. | The classes are added by VS Code at run time, not by this repository: the shell emits only `<body class="insrc-term">` (chat-panel.ts:935, pinned by chat-panel.test.ts:1243), and no file under vscode-plugin/src mentions the vscode-light or vscode-dark classes. From memory, a high-contrast light webview body carries both `vscode-high-contrast-light` and `vscode-high-contrast` (kept for compatibility). If that is right, a `body.vscode-high-contrast{color-scheme:dark}` rule also matches high-contrast light, and the result depends on rule order. | Write the light high-contrast rule after the dark high-contrast rule (or exclude it with `:not(.vscode-high-contrast-light)`), say so in the design, and have the unit test assert that order. Confirm in the smoke check with a high-contrast light theme, which the smoke subject should name explicitly. |
