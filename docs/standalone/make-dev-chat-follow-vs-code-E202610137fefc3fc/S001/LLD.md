<!-- insrc:artifact LLD-7fefc3fc5c51793e-s1 -->

# LLD: E202610137fefc3fc:S001

## Summary

**Epic:** `make-dev-chat-follow-vs-code`
**HLD base run:** `wf-1791874898820-48801z`
**HLD effective hash:** `3cb2092a51aa...`
**Seeded from:** `SPEC-3d2161bcef24cecf`

The dev chat's colours are chosen in one list of named values at the top of its style. Each name now holds a VS Code theme variable, and every fixed colour, tint and decorative gradient in the chat's three style sources is replaced by a name, so the chat follows light, dark and high-contrast themes. There is exactly one derived colour, decided by the user on seeing the result in their own theme: the assistant's message sits on the editor background mixed with 10% black. Both message bubbles take VS Code's chat request border, and the whole chat uses the editor's monospace font. Layout, shapes and glyphs stay as they are, and the docs-review panel is not touched.

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

### 2.1 `RENDER_REGISTRY_STYLE`

```typescript
export const RENDER_REGISTRY_STYLE: string  // existing constant in render-registry.ts; colour values changed
```

**Returns:** `string` — The row renderer's rules. Every colour is `var(--<name>)` from the shell's named layer; there is no hex, rgb/rgba, hsl, color-mix or gradient, no `var(--name, literal)` fallback, and no --vscode-* variable named directly. Approval card: warning ground and border; its title the warning foreground. Buttons: the secondary button ground and text by default, the primary button ground and text for approve; hover uses the theme's hover grounds in place of a brightness filter. Approved and rejected card states: border in the passed or failed colour on the code-block ground. Permission-outcome chip, resolved selection card and selection-outcome chip: code-block ground with the widget border. Decided badge: passed or failed colour for text and border on a transparent ground, given by the more specific selectors `.insrc-permoutcome__badge.insrc-approval__btn--approve` and `--deny`, so the renderer's class names do not change. Selection card: widget ground and border; option rows: checkbox ground and border; chosen option: focus border; control glyph: checkbox foreground; confirm: primary button ground and text. Attachment chips on a message: widget border, muted glyph and size.

**Preconditions:**
- The document that embeds it defines the named layer (the chat shell does).

**Postconditions:**
- Every selector that existed before is still present; four are added (two decided-badge selectors and two hover selectors). Box model, spacing, radii and class names are unchanged.

### 2.2 `CHAT_MARKDOWN_TOKENS`

```typescript
export const CHAT_MARKDOWN_TOKENS: MarkdownStyleTokens  // existing token set in markdown-style.ts; two values changed, type unchanged
```

**Returns:** `MarkdownStyleTokens` — Each field holds a name from the shell's layer. Changed: `accent` (inline code text, and the links' default) is `var(--pre-fg)`, and `codeBg` is `var(--code-bg)` in place of the fixed '#0a0d14'. `fontSans` stays `var(--sans)`, which the layer now points at the editor's monospace font (question q5dfbc717, decided by the user). renderMarkdownStyle and DOCS_REVIEW_MARKDOWN_TOKENS are not changed. What the token set has no field for is added by the chat shell after the markdown rules: inline code's own ground (the preformat ground; a fenced block keeps the code-block ground), block quote ground and border, the rule's colour and the link colour.

**Postconditions:**
- The docs-review panel's markdown rules are byte-identical to before.

## 3. Data model changes

### 3.1 `the chat shell's named colour layer (the `:root` rule of layoutStyle in renderShell, chat-panel.ts)` — field-modify

The one place the chat's colours are chosen. `color-scheme:dark` is removed from it; four rules after it set the colour scheme by the theme-kind class VS Code puts on the body, in this order: vscode-light light, vscode-dark dark, vscode-high-contrast dark, vscode-high-contrast-light light (last, because a high-contrast light body also carries the plain high-contrast class). Every name holds a theme variable; a fallback is always another theme variable, except `transparent` for the two diff outlines. Every border name starts with the high-contrast border. ONE name is a derived colour, by the user's decision of 2026-10-13: --assistant-bg, the editor background mixed with 10% black, because a theme may give its borders no contrast (the user's theme: 1.06 to 1) and the assistant message then had no visible edge. No other color-mix, tint or fixed colour is allowed. Of the 19 old names, 18 are kept; --bg-alt is removed because nothing uses it any more.

```
--font, --sans: var(--vscode-editor-font-family)
--bg, --panel: var(--vscode-editor-background)
--bg-inset (header, input, progress, status and attachment bars; selection card): var(--vscode-editorWidget-background)
--assistant-bg (new; the ONE derived colour): color-mix(in srgb, var(--vscode-editor-background) 90%, black)
--code-bg (new): var(--vscode-textCodeBlock-background)
--pre-bg (new; inline code): var(--vscode-textPreformat-background, var(--vscode-textCodeBlock-background))
--user-bg (new): var(--vscode-chat-requestBackground, var(--vscode-editor-inactiveSelectionBackground))
--warn-bg (new): var(--vscode-inputValidation-warningBackground)
--add-bg, --del-bg (new): var(--vscode-diffEditor-insertedLineBackground, var(--vscode-diffEditor-insertedTextBackground)), var(--vscode-diffEditor-removedLineBackground, var(--vscode-diffEditor-removedTextBackground))
--add-border, --del-border (new; a diff line's outline): var(--vscode-diffEditor-insertedTextBorder, transparent), var(--vscode-diffEditor-removedTextBorder, transparent)
--quote-bg (new), --sel: var(--vscode-textBlockQuote-background), var(--vscode-editor-selectionBackground)
--fg, --fg-strong: var(--vscode-editor-foreground)
--muted, --dim: var(--vscode-descriptionForeground)
--input-fg, --placeholder, --link, --pre-fg (new): var(--vscode-input-foreground), var(--vscode-input-placeholderForeground), var(--vscode-textLink-foreground), var(--vscode-textPreformat-foreground)
--border: var(--vscode-contrastBorder, var(--vscode-panel-border))
--border-lit (bars, tool rows, cards, chips): var(--vscode-contrastBorder, var(--vscode-editorWidget-border, var(--vscode-panel-border)))
--msg-border (new; BOTH message bubbles): var(--vscode-contrastBorder, var(--vscode-chat-requestBorder, var(--vscode-editorWidget-border, var(--vscode-panel-border))))
--warn-border, --quote-border, --sep (new): var(--vscode-contrastBorder, var(--vscode-inputValidation-warningBorder)), var(--vscode-textBlockQuote-border), var(--vscode-textSeparator-foreground)
--focus (new): var(--vscode-focusBorder)
--accent (send control, tool prompt, done marker), --accent2 (tool marker and label), --amber (edit marker), --magenta (pending marker, assistant label), --user (user label): var(--vscode-terminal-ansiGreen), -ansiCyan, -ansiYellow, -ansiMagenta, -ansiBlue
--red, --warn (new), --pass (new), --fail (new), --progress (new): var(--vscode-errorForeground), var(--vscode-editorWarning-foreground), var(--vscode-testing-iconPassed), var(--vscode-testing-iconFailed), var(--vscode-progressBar-background)
--btn-bg, --btn-fg, --btn-hover (new): var(--vscode-button-background), var(--vscode-button-foreground), var(--vscode-button-hoverBackground)
--btn2-bg, --btn2-fg, --btn2-hover (new): var(--vscode-button-secondaryBackground), var(--vscode-button-secondaryForeground), var(--vscode-button-secondaryHoverBackground)
--dropdown-bg, --dropdown-fg, --dropdown-border (new): var(--vscode-dropdown-background), var(--vscode-dropdown-foreground), var(--vscode-contrastBorder, var(--vscode-dropdown-border))
--check-bg, --check-fg, --check-border (new): var(--vscode-checkbox-background), var(--vscode-checkbox-foreground), var(--vscode-contrastBorder, var(--vscode-checkbox-border))
removed: --bg-alt
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/render-registry.ts`
- `vscode-plugin/src/chat/markdown-style.ts`

### 3.2 `the shell's own rules (layoutStyle in renderShell, chat-panel.ts)` — field-modify

Every fixed colour outside `:root` is replaced by a name, and no rule outside `:root` names a --vscode-* variable. Removed: the radial gradients on body and #insrc-term (flat grounds) and the header dot's glow. The four bars use --bg-inset with --border-lit. The user bubble uses --user-bg and the assistant bubble --assistant-bg; both use --msg-border, the chat request border, which VS Code gives a visible default even where a theme's widget and panel borders have no contrast. .insrc-toolrow and .insrc-json use --code-bg with --border-lit. Diff lines use --add-bg and --del-bg, with an outline in --add-border and --del-border that is transparent unless the theme defines a diff text border (high-contrast themes do, and may define no line ground); the diff's buttons use the secondary button names. The auto-approve pill uses --warn. Links use --link, the input --input-fg and --placeholder, the progress dots --progress, the selects' option lists the dropdown names. Focusable controls get a --focus outline on :focus-visible, in one rule placed last. After the markdown rules the shell adds inline code's ground (--pre-bg, with a fenced block's code reset to none), block quote ground and border, the rule's colour and the link colour. The select arrows stay two linear gradients built from --muted and `transparent`: they draw a shape, not a tint.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.3 `the history chip in the header (markup and rules in renderShell, chat-panel.ts)` — field-modify

Before, the chip was the select itself: a faint fixed fill and a clock icon painted as an SVG data URI with a fixed stroke colour, which a theme variable cannot reach. The select is wrapped in one span, `.histchip`, which carries the 36ch cap, the padding, the border (--dropdown-border), the radius and the ground (--dropdown-bg), and draws the icon in its ::before as a mask filled with the current text colour, 12px wide at 6px from the left, inside the 22px left padding. The select keeps its id, options, behaviour and the two arrow layers every .segsel has; its own rule is reduced to filling the chip. The mask is a data URI, which the existing `img-src data:` allows; the content security policy is not changed. The two tests in chat-panel.test.ts that pinned the old rule (about ten assertions) are rewritten to assert the same intent on the wrapper: one control, icon inside the padding, 36ch cap.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts`

## 4. Error paths

**Error cases**

- **A theme does not define a variable the chat uses (an optional colour the theme leaves unset, or one an older VS Code does not have, such as the chat request ground or border).** (recoverable)
  - Detection: Nothing in code can see it at run time: the browser treats a declaration whose var() has no value as unset. It is prevented by construction: each name whose theme variable is known to be optional (the chat request ground and border, the widget border, the diff line grounds, the preformat ground, the diff text borders) carries a fallback, and a test pins each of those chains.
  - Response: The fallback is used: the user message falls back to the inactive selection ground, message and widget borders to the panel border, diff line grounds to the diff text grounds, inline code to the code-block ground, and a diff outline to transparent.
  - User impact: The element is drawn in a neighbouring theme colour instead of losing its ground or taking the text colour as its border. A variable that has no fallback and that some theme leaves unset would lose its colour in that theme; that can only be seen in the panel.
- **A theme defines its borders with almost no contrast against the editor background (the user's theme: widget and panel borders at 1.06 to 1).** (recoverable)
  - Detection: Not detectable in code; it was seen by the user in the panel and confirmed by reading the theme file.
  - Response: The two message bubbles do not depend on those borders: both take the chat request border, which such a theme leaves at VS Code's visible default, and the assistant message also sits on a slightly darker ground. Tool rows, cards and chips keep the widget border and may show a faint outline in such a theme; their grounds still set them apart.
  - User impact: Messages keep a visible edge; other outlines are as faint as the theme makes them.
- **A rule refers to a name the layer does not define (a typo, or a name removed from the list).** (recoverable)
  - Detection: A test collects every `var(--name)` used in the shell's style, the row renderer's style and the chat's markdown rules and fails when a name that is not a --vscode-* variable is missing from the layer; it also fails when a name in the layer is never used.
  - Response: The build fails before release.
  - User impact: None: it cannot ship.
- **A fixed colour or a second derived colour is introduced later (a hex, an rgb/rgba or hsl value, another color-mix, a tint gradient, or a `var(--x, literal)` fallback).** (recoverable)
  - Detection: A test scans the chat's own style in the rendered shell (everything except the shared token sheet, which is out of scope). It requires the one allowed declaration, `--assistant-bg:color-mix(in srgb,var(--vscode-editor-background) 90%,black)`, to appear exactly once and to be the only color-mix, and fails on any other of those forms; a linear gradient is allowed only when built from names and `transparent`.
  - Response: The build fails before release.
  - User impact: None: it cannot ship.
- **A theme variable name is misspelt, so the element silently loses its colour.** (recoverable)
  - Detection: A test compares the set of --vscode-* variables the layer refers to with the list of this design's mapping, in both directions.
  - Response: The build fails before release.
  - User impact: None: it cannot ship. A name spelt as designed that VS Code does not define can only be seen in the panel.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A light theme. | Light grounds and dark text everywhere, including the selects' option lists and the scrollbars, because the colour scheme follows the theme kind. The assistant message's ground is the light editor background mixed with 10% black: a light grey. |
| A high-contrast theme, dark or light. | Every bordered element is outlined with the theme's contrast border, which leads every border name. A diff line with no ground of its own is outlined with the theme's diff text border. High-contrast light gets the light colour scheme because its rule comes after the plain high-contrast rule. In high-contrast light the assistant message's ground is a light grey; in high-contrast dark, where the editor background is black, it stays black. |
| The user switches theme while the chat is open. | The chat repaints at once with no reload, since every colour is a variable VS Code updates in place, the derived one included. |
| A theme whose terminal colours are close to its background. | Markers are less distinct in that theme; this follows the user's decision to take marker colours from the theme's terminal palette. |
| A theme whose warning ground is opaque and strong. | The approval card is drawn in it with the editor's text colour and the warning foreground for its title. Whether that pair reads well is a property of the theme. |
| A restored chat with every kind of row. | Every row is drawn from theme colours; nothing shows a leftover fixed dark ground. |
| The docs-review panel. | Unchanged: the shared token sheet and its markdown rules are byte-identical to before. |
| The chat host built with a custom renderStyle or theme (as tests and mocks do). | Unchanged behaviour: the shell's own layer does not depend on the injected sheet. |

**Invariants to preserve**

- The shell stays one nonce'd inline script and one content security policy, `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-...'`; every image source the shell declares is a data URI. [[c1]]
- Every selector, class name and element id that existed before is still present, and the box model, spacing, radii and glyphs are unchanged; the only markup change is the one wrapper around the history select. [[c1]]
- The row renderer's class names and structure are unchanged; only RENDER_REGISTRY_STYLE's colour values change. [[c2]]
- renderMarkdownStyle, DOCS_REVIEW_MARKDOWN_TOKENS and design-tokens.ts are not changed, so the docs-review panel's styles and the generated mocks are byte-identical. [[c3]]
- The shared token sheet keeps supplying the marker glyphs to the chat; the chat only re-tones them. [[c4]]

## 5. Test strategy

**Test framework:** `node:test run through tsx, with node:assert/strict; the shell is rendered through createChatPanelHost with a fake channel, as chat-panel.test.ts and chat-shell.test.ts do`

**Test levels**

- **unit** — The chat's own style, read from the rendered shell, holds no fixed colour, one recorded derived colour, and only names it defines.
  - Subjects: `chat theme: the chat's own style has no hex, rgb, rgba or hsl value, no radial gradient and no var() with a literal fallback; its only color-mix is the assistant message's ground, declared once; the colour scheme follows the theme kind; a linear gradient is built only from names and transparent`, `chat theme: every name used in the shell style, the row renderer style and the chat's markdown rules is defined in the named layer`, `chat theme: every name but the one derived ground holds a theme variable of this design's mapping, and every optional one falls back to another theme variable`, `chat theme: each component uses the name the mapping gives it (bars, transcript, user and assistant bubbles, tool row, markers, diff lines, approval card and buttons, decided badge, selection card, input, selects, pill, attachment chips, progress, markdown)`
- **integration** — The shell around the style is otherwise unchanged, and the docs-review panel's styles are untouched.
  - Subjects: `chat theme: the history chip is one wrapper around the select with a masked icon in the current text colour; the select keeps its id and options, and every image source the shell declares is allowed by its content security policy`, `chat theme: every selector and element id of the shell and the row renderer from before the change is still present, the added selectors are exactly the listed ones, and the shell is still one nonce'd inline script under the same policy`, `chat theme: the shared token sheet and the docs-review markdown rules are byte-identical to before the change, and the docs-review panel uses none of the chat's three style sources`
  - Fixtures: `the selectors and element ids of the shell, and fingerprints of the shared token sheet and the docs-review markdown rules, captured from the code before the change (chat-theme-before.json)`
- **smoke** — What only eyes can judge: the panel in real themes. High-contrast behaviour is covered by the unit tests on the style, not required by eye.
  - Subjects: `in VS Code: in the user's own theme and the other themes the user tries, the chat follows the theme with no leftover dark panel, both message bubbles have a visible edge, and the rows, cards and controls read well`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `chat theme: the chat's own style has no hex, rgb, rgba or hsl value, no radial gradient and no var() with a literal fallback; its only color-mix is the assistant message's ground, declared once; the colour scheme follows the theme kind; a linear gradient is built only from names and transparent`, `chat theme: every name but the one derived ground holds a theme variable of this design's mapping, and every optional one falls back to another theme variable`, `in VS Code: in the user's own theme and the other themes the user tries, the chat follows the theme with no leftover dark panel, both message bubbles have a visible edge, and the rows, cards and controls read well` |
| `ac2` | `chat theme: each component uses the name the mapping gives it (bars, transcript, user and assistant bubbles, tool row, markers, diff lines, approval card and buttons, decided badge, selection card, input, selects, pill, attachment chips, progress, markdown)`, `chat theme: every name used in the shell style, the row renderer style and the chat's markdown rules is defined in the named layer` |
| `ac3` | `chat theme: the history chip is one wrapper around the select with a masked icon in the current text colour; the select keeps its id and options, and every image source the shell declares is allowed by its content security policy`, `chat theme: every selector and element id of the shell and the row renderer from before the change is still present, the added selectors are exactly the listed ones, and the shell is still one nonce'd inline script under the same policy`, `chat theme: the shared token sheet and the docs-review markdown rules are byte-identical to before the change, and the docs-review panel uses none of the chat's three style sources` |

## 6. Migration

**State before:** The chat shell forces a dark colour scheme and chooses its colours from 19 named variables holding fixed values, with further fixed tints, gradients and fixed code grounds in its rules, in the row renderer's style and in the chat's markdown tokens; the assistant's prose is in a fixed sans stack (s1: the chat's three style sources before this Story). The docs-review panel uses a separate shared sheet and its own markdown tokens (s1: what is shared with the docs-review panel).

**State after:** The names hold VS Code theme variables, new names cover the roles of the mapping, and no fixed colour, tint or decorative gradient remains in the chat's three style sources. One derived colour exists, the assistant message's ground. Both message bubbles take the chat request border. The colour scheme follows the theme kind, the whole chat is in the editor's monospace font, and the history chip's icon is a mask in the text colour inside one wrapper. The docs-review panel's styles and the shared sheet are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Point the names in the shell's layer at theme variables, add the new names (including the one derived ground), remove the unused name, remove the forced dark colour scheme and add the four theme-kind colour scheme rules. Rules that already use names follow at once. — ↩ rollbackable
2. Replace the fixed colours, tints and gradients in the shell's own rules with names; give both message bubbles the chat request border and the assistant bubble the derived ground; add the diff outlines, the focus rule and the markdown rules the token set has no field for; move the history chip to the wrapper with the masked icon. — ↩ rollbackable
3. Replace the fixed colours, tints, gradients and literal fallbacks in the row renderer's style with names, and give the decided badge its own passed and failed colours. — ↩ rollbackable
4. Point the chat's markdown tokens at names, replacing the fixed code ground. — ↩ rollbackable
5. Add the theme tests with the fixture captured before the change, and rewrite the two history-chip tests for the wrapper. — ↩ rollbackable

**Backward compat:** No public interface changes. RENDER_REGISTRY_STYLE, CHAT_MARKDOWN_TOKENS and renderMarkdownStyle keep their types; no message, stored row or setting changes. A user sees the chat in their theme's colours, and the assistant's prose in monospace, from the next window reload after the update; there is no setting to keep the old dark palette or the old prose font.

## 7. Alternatives considered

### 7.1 a1: One named layer in the shell, pointed at theme variables — **CHOSEN**

Keep the shell's named variables as the single place colours are chosen, point each at a --vscode-* variable, and replace every remaining literal with a name; the one derived colour the user asked for is one more name in that list.

The shell's `:root` rule stays the one place where the chat's colours are chosen. Each name holds a theme variable, new names cover the roles the mapping needs, and the single derived colour (the assistant message's ground) is declared there too, so it is visible as the exception it is. The rules in the shell, the row renderer's style and the chat's markdown tokens refer only to names. Tests read the rendered shell and fail on any fixed colour or any derived colour other than that one.

### 7.2 a2: Theme variables written directly in every rule

Remove the named variables and write the --vscode-* variable, or the derived colour, in each rule.

The `:root` palette is deleted and every rule in the three sources names its theme variable directly, repeating the fallback chains and writing the derived ground inline in the assistant bubble's rule.

**Rejected because:** Meets the constraints but rewrites about 130 uses, repeats the fallback chains and hides the exception inside one rule.

### 7.3 a3: Extend the shared token sheet and use it for the chat

Grow design-tokens.ts to cover the chat's roles and make the chat use those --it-* tokens.

The shared terminal token set, which maps nine roles to theme variables with literal fallbacks and is also used by the docs-review panel, is extended with the roles the chat needs, and the chat's three sources switch to the --it-* names.

**Rejected because:** Changes a sheet the docs-review panel uses and relies on fixed literal fallbacks.

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:585` — "const csp = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;"
- **[[c2]]** `code` `vscode-plugin/src/chat/render-registry.ts:189` — "export const RENDER_REGISTRY_STYLE ="
- **[[c3]]** `code` `vscode-plugin/src/chat/markdown-style.ts:121` — "export const DOCS_REVIEW_MARKDOWN_TOKENS: MarkdownStyleTokens = {"
- **[[c4]]** `code` `vscode-plugin/src/chat/design-tokens.ts:174` — "export function renderTerminalStyle(theme: TerminalTheme = terminalTheme): string {"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**1 do not hold · 2 could not be verified · 11 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-13T07:05:32.151Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| change-sites | MED | The shell's `:root` layer is the one place the chat's colours are chosen: every colour the chat shows comes from a name in that layer, with no literal fallback. | The chat document also embeds the shared sheet, and two of its rules out-rank or supplement the shell. The body is `<body class="insrc-term">` (chat-panel.ts:980), and design-tokens.ts:183-203 gives `.insrc-term { ... font-family: var(--it-font); font-size: var(--it-size); line-height: var(--it-line); background: var(--it-bg); color: var(--it-fg); }`. A class selector beats the shell's element rule `body{...background:var(--bg);color:var(--fg);font-family:var(--font);...}` (line 634), so the body's ground, text colour and font are the sheet's `--it-*` values, e.g. `--it-bg: var(--vscode-editor-background, #0b0e14)`, each with a fixed literal fallback. The diff container carries `.insrc-term-diff`, which design-tokens.ts:207 paints with `background: var(--it-bg); color: var(--it-fg)`; the shell's own `.insrc-term-diff` rule (line 727) sets only border, radius, margin and overflow. The code comment at chat-panel.ts:974-979 describes this same class-over-`body` mechanism. In VS Code the result is the same theme variables, so nothing looks wrong, but the design's inventory misses it, and the test `has('body', 'background:var(--bg)', ...)` checks that the declaration is present, not that it wins. [files: vscode-plugin/src/chat/design-tokens.ts, vscode-plugin/src/chat/chat-panel.ts, vscode-plugin/src/chat/__tests__/chat-theme.test.ts] | Either state the exception in the design (the body and the diff container are painted by the shared sheet's `.insrc-term` and `.insrc-term-diff` rules, which resolve to the same theme variables), or have the shell out-rank them (for example a `body.insrc-term` rule and a ground and colour on the shell's `.insrc-term-diff` rule) and add a test that the winning declaration is a name. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| coverage-of-intent | The two departures from the approved SPEC (one color-mix for the assistant ground, and the assistant bubble taking chat.requestBorder instead of editorWidget.border) rest on a user decision of 2026-10-13 that overrides the SPEC. | The SPEC still lists as a non-goal "Fixed or fallback hex/rgb colours, and color-mix derived tints" and maps "assistant message editor.background with editorWidget.border"; its `decisions` array is empty. The override is asserted only by the design itself, by a code comment at chat-panel.ts:606-608 ("The one derived colour, asked for by the user on 2026-10-13") and by commit subjects (f2289cf0, 5744d9e3, 157634e5 "revise the dev chat theme design with the user's decisions made during the build"). No approved artifact I could read records the user's decision itself. [files: .insrc/artifacts/SPEC-3d2161bcef24cecf.json, vscode-plugin/src/chat/chat-panel.ts] | Confirm with the user that both departures are theirs, and record them where the SPEC is read (amend the SPEC's non-goal and assistant-message mapping, or add the decisions to it) so the design no longer contradicts its upstream. |
| error-paths | The facts about VS Code and the browser the error handling rests on are true: every `--vscode-*` name in the mapping exists, a high-contrast light body also carries the plain `vscode-high-contrast` class, and a CSS mask data URI is governed by `img-src`. | These are properties of VS Code and the browser, not of this repository; nothing in the repo (no VS Code source, no theme dump) lets me confirm them. The tests only compare the names with the design's own list, so a name spelt as designed that VS Code does not define would pass. The design says the same: "can only be seen in the panel". [files: vscode-plugin/src/chat/chat-panel.ts] | Keep the smoke test in VS Code as the proof, including one high-contrast light theme to confirm the colour-scheme rule order. |
