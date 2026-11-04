<!-- insrc:artifact LLD-7c5a1921cb45a8d8-s1 -->

# LLD: STORY-7c5a1921cb45a8d8-s1

## Summary

**Epic:** `apply-artifact-page-theme-whole-document`
**HLD base run:** `wf-1793818069922-rslrd4`
**HLD effective hash:** `580476a5054e...`

Generated mock, UML and ER pages and the docgen pages now apply the light or dark mode to the whole browser document, including the margin and the area below short content, open in light unless the reader has chosen otherwise, and no longer show the font data as text at the top. The theme switch becomes a small floating button fixed at the top right of the page, with room reserved above the content so it never covers the header at the top of the page. The companion page puts its theme root on the body as the docgen pages already do, so one set of page rules serves all three shells; the degraded docgen page keeps its own small script.

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

### 2.1 `pageStyleTags`

```typescript
export function pageStyleTags(structuralCss: string): string
```

**Parameters:**
- `structuralCss: string` — The shell's own layout CSS, appended to both mode style tags.

**Returns:** `string` — The page's style markup: the packaged font-face rules inside a <style> tag, one <style data-iv-mode> per mode and the diagram overrides.

**Postconditions:**
- The font-face rules are inside a <style> element, so they are never rendered as text
- Both mode style tags are still present and the dark one is still disabled by default

### 2.2 `pageCssFor`

```typescript
export function pageCssFor(mode: ThemeMode): string
```

**Parameters:**
- `mode: ThemeMode` — The surface mode, light or dark.

**Returns:** `string` — The page surface CSS for the mode.

**Postconditions:**
- '.insrc-viewer' (the body in every shell) carries the surface background and colour, 'box-sizing:border-box', 'min-height:100vh' and 'padding-top:56px', so it fills the viewport with room above the content for the floating switch
- No rule gives html a background of its own, so the body background propagates to the whole canvas (core CSS canvas propagation, no :has() or other newer selector) and no white strip shows below short content or in the overscroll area
- Contains a rule that makes '.insrc-viewer #iv-theme' a fixed-position 32px control at top:12px and right:12px with a z-index above the page content, readable in both modes
- Every rule is still scoped under .insrc-viewer

### 2.3 `viewerBootScript`

```typescript
export function viewerBootScript(opts: ViewerBootOpts): string
```

**Parameters:**
- `opts: ViewerBootOpts` — Initial mode and the Mermaid config per mode.

**Returns:** `string` — The inline boot script that selects and applies the mode.

**Preconditions:**
- The page has an element with class insrc-viewer that is the theme root

**Postconditions:**
- The mode is the stored insrc-theme-mode when it is light or dark, otherwise opts.initialMode; the operating system's colour-scheme preference is not consulted
- A throwing localStorage is caught in each of the two try blocks (the read and the write in applyMode) and the mode falls back to opts.initialMode
- The mode is applied to the .insrc-viewer root, which in every shell is the body, and a missing #iv-theme element is tolerated

### 2.4 `renderCompanionPage`

```typescript
export function renderCompanionPage(header: CompanionHeader, page: CompanionPageContent, runtime: CompanionRuntime): string
```

**Parameters:**
- `header: CompanionHeader` — Page header fields.
- `page: CompanionPageContent` — Title, narrative, visual and description tables.
- `runtime: CompanionRuntime` — The inlined pan/zoom and Mermaid runtimes.

**Returns:** `string` — The companion page HTML.

**Postconditions:**
- <body> carries class insrc-viewer, data-theme and the export CSS attribute; the existing div.page sits inside it, so the '.insrc-viewer .page' layout rule matches
- #iv-theme is a direct child of the body, outside the pan/zoom bar
- Its structural CSS has a 'max-width:480px' media rule that stacks header.hdr and sets table.ref to min-width:0 and width:100%, so the header table fits a 360px viewport without horizontal scrolling

### 2.5 `assembleShell`

```typescript
export async function assembleShell(...): Promise<string>
```

**Parameters:**
- `args: the existing assembleShell parameters` — Unchanged.

**Returns:** `string` — The docgen primary page HTML.

**Postconditions:**
- #iv-theme is a direct child of the body, outside .iv-bar
- The never-matching '.insrc-viewer html,.insrc-viewer body' rule is removed from docgenPageStyle; the canvas and the viewport fill come from the shared '.insrc-viewer' rule of pageCssFor

### 2.6 `assembleFallbackShell`

```typescript
export function assembleFallbackShell(...): string
```

**Parameters:**
- `args: the existing assembleFallbackShell parameters` — Unchanged.

**Returns:** `string` — The degraded docgen page HTML.

**Postconditions:**
- Its own inline script (it does not call viewerBootScript) defaults to light and does not consult the colour-scheme preference; because two mode-selection scripts now exist, a fallback test pins its default and storage key to the shared script's
- #iv-theme is a direct child of the body, outside .iv-bar

## 3. Data model changes

### 3.1 `Stored theme choice (localStorage insrc-theme-mode)` — invariant-change

The key and its two values are unchanged. The invariant that changes: with no stored value the page opens in light, where before it opened in the operating system's preferred mode. A stored value still wins. No new entity and no relationship change, so no ER definition is needed; the floating control is a single fixed-position button, so no UX mock is needed.

**Call sites:**
- `src/artifact-theme/theme.ts:361-461`
- `src/docgen/render/fallback.ts:240-252`

## 4. Error paths

**Error cases**

- **localStorage is unavailable or throws (a file page in a locked-down browser)** (recoverable)
  - Detection: Two independent try blocks in the boot script catch the exception: the one around the initial localStorage.getItem read and the one around localStorage.setItem inside applyMode
  - Response: The read falls back to the initial mode, light; the write is skipped; the toggle still works for the session
  - User impact: The page opens in light and the choice is not remembered
- **The stored value is neither light nor dark** (recoverable)
  - Detection: The boot script checks the stored value against the two allowed values before using it
  - Response: It is ignored and the page opens in light
  - User impact: None; the page opens in the default
- **The page has no #iv-theme element (a page built without the control)** (recoverable)
  - Detection: applyMode and the click wiring test the element before using it, as the existing code does
  - Response: The mode still applies from storage or the default; there is simply no button
  - User impact: No switch on that page

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A reader whose operating system prefers dark and who has never used the switch | The page opens in light |
| A reader who chose dark earlier | The page opens in dark and the whole document, including the outer margin and the area below short content, is dark |
| A short page in dark mode | The body fills the viewport and its background propagates to the canvas, so no white strip shows below the content |
| The page at scroll position zero | The body's 56px top padding keeps the 32px floating switch clear of the header and its table |
| A long page scrolled down, or a wide diagram | The switch stays fixed at the top right above the content and may float over content, which is acceptable for a floating control |
| A narrow window of 360px | The switch stays inside the viewport at the top right, the header stacks and its table fits the width without horizontal scrolling |
| Exporting the diagram as SVG in either mode | The export still embeds its own background and font style as before |

**Invariants to preserve**

- A stored insrc-theme-mode of light or dark still wins over the default, and the switch still stores the choice under the same key [[c2]]
- Every page rule stays scoped under .insrc-viewer and both per-mode style tags remain, the dark one disabled until chosen [[c1]]
- The toggle still re-renders the Mermaid diagram with the other mode's config (doRender, theme.ts:411-426, triggered by the click wiring at theme.ts:437-440) and keeps the diagram source verbatim [[c2]]

## 5. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), the existing artifact-theme, companion and docgen test files`

**Test levels**

- **unit** — ac1: the mode applies to the whole document. In every shell the body is the .insrc-viewer theme root carrying data-theme and the export CSS. pageCssFor, in both modes, gives '.insrc-viewer' the surface background, 'min-height:100vh', 'box-sizing:border-box' and 'padding-top:56px', no rule gives html a background of its own, and docgenPageStyle no longer holds the never-matching '.insrc-viewer html,.insrc-viewer body' rule. ac2: with no stored choice the page opens in light and the colour-scheme preference is not consulted, in the boot script and in the fallback shell's own script, and the fallback script uses the same storage key and default as the shared one; a stored light or dark value still wins. The boot script is also run against a stub DOM for a throwing localStorage read, a throwing write, an invalid stored value and a missing #iv-theme. ac3: the font-face rules are inside a <style> element and the companion layout rule '.insrc-viewer .page' can match. ac4: #iv-theme is a direct child of the body, outside the toolbars, in the companion, docgen and fallback pages, and the page CSS makes it a fixed 32px top-right control above the content; the companion CSS has the max-width:480px rule that stacks the header and lets table.ref shrink.
  - Subjects: `pageStyleTags and pageCssFor in src/artifact-theme/theme.ts`, `viewerBootScript in src/artifact-theme/theme.ts`, `renderCompanionPage in src/workflow/artifacts/companion/shell.ts`, `assembleShell in src/docgen/render/shell.ts`, `assembleFallbackShell in src/docgen/render/fallback.ts`
  - Fixtures: `the rendered page strings produced by the existing test fixtures of theme.test.ts and of the three shell tests`, `a minimal stub document and localStorage for running the boot script in viewer-script.test.ts`
- **live** — A browser test renders a real ER companion page and a docgen page and opens them in headless Chrome (google-chrome) at desktop and 360px widths: light by default, dark on the switch with a dark canvas and no white rim or strip below short content, the switch fixed at the top right while scrolling and clear of the header table at scroll zero, the header table fitting the width at 360px without horizontal scrolling, and no font text at the top. It follows the repo's live-test convention: it runs only when INSRC_LIVE_TESTS=1 and the google-chrome binary is present and skips cleanly otherwise, like src/workflow/__tests__/companion-browser.live.test.ts. Screenshots are kept with the build record.
  - Subjects: `A generated ER companion page opened in headless Chrome at desktop and 360px widths`, `A generated docgen page opened in headless Chrome`
  - Fixtures: `a page rendered with renderCompanionPage from the ER definition used in er-page.test.ts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `theme.test.ts: pageCssFor gives .insrc-viewer the surface background, min-height:100vh, box-sizing:border-box and padding-top:56px in light and dark, and no rule gives html a background`, `companion/__tests__/shell.test.ts: the companion page carries class insrc-viewer, data-theme and the export CSS on the body`, `docgen/render/__tests__/shell.test.ts: the docgen page keeps the theme root on the body and docgenPageStyle has no '.insrc-viewer html' rule`, `live: dark mode shows a dark canvas with no white rim or strip below a short page` |
| `ac2` | `viewer-script.test.ts: the boot script defaults to light and does not consult prefers-color-scheme, and a stored mode still wins`, `viewer-script.test.ts: run in a stub DOM, a throwing localStorage read and a throwing write fall back without error, an invalid stored value is ignored, and a missing #iv-theme is tolerated`, `docgen/render/__tests__/fallback.test.ts: the fallback script defaults to light, does not consult prefers-color-scheme and uses the same storage key as the shared script` |
| `ac3` | `theme.test.ts: pageStyleTags puts the font-face rules inside a style element`, `companion/__tests__/shell.test.ts: the companion layout rule targets the page inside the theme root`, `live: no font text at the top of the page` |
| `ac4` | `theme.test.ts: pageCssFor makes the theme switch a fixed 32px top-right control with a z-index in both modes`, `companion/__tests__/shell.test.ts: the theme switch is a direct child of the body in the companion page, and the companion CSS has the max-width:480px rule for header.hdr and table.ref`, `docgen/render/__tests__/shell.test.ts: the theme switch is a direct child of the body in the docgen page`, `docgen/render/__tests__/fallback.test.ts: the theme switch is a direct child of the body in the fallback page`, `live: the switch stays fixed at the top right while scrolling, clear of the header table at scroll zero, and the header table fits at 360px` |

## 6. Migration

**State before:** A companion page puts the mode on a div inside the body, so html and body have no background and show white around dark pages and below short content; no rule makes the theme root fill the viewport or reserves room for a floating control; every page opens in dark when the operating system prefers dark and no choice is stored; every page shows the packaged font-face CSS as text because pageStyleTags adds it without a style tag; the companion layout rule '.insrc-viewer .page' never matches; the companion header table has a 380px minimum width; the docgen shell carries a '.insrc-viewer html,.insrc-viewer body' rule that can never match; and the theme button sits inside the toolbar of each shell (src/artifact-theme/theme.ts:271-316, src/artifact-theme/theme.ts:361-461, src/workflow/artifacts/companion/shell.ts:166-269, src/docgen/render/shell.ts:203-273, src/docgen/render/fallback.ts:240-287).

**State after:** In every shell the body is the theme root, fills the viewport, reserves 56px above the content and paints the whole canvas through background propagation, so the mode reaches the whole document; with no stored choice a page opens in light; the font-face rules sit inside a style element; the companion layout rule matches and its header table fits a 360px viewport; the dead docgen rule is gone; and the theme button is a fixed 32px top-right control that is a direct child of the body.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Wrap the font-face rules in a style element, drop the operating-system preference from the boot script and from the fallback shell's own script, and add to the shared page CSS the body fill and top clearance and the fixed top-right rule for the theme switch; update the shared theme tests, including the stub-DOM boot script tests; commit. — ↩ rollbackable
2. Move the theme root to the body in the companion shell, add its narrow-width media rule for the header and the header table, move the theme button out of the toolbar to the top of the body in the companion, docgen and fallback shells, and remove the docgen rule that cannot match; update the three shell tests; commit. — ↩ rollbackable
3. Add the live browser test, gated by INSRC_LIVE_TESTS=1 and the google-chrome binary, that renders a real ER companion page and a docgen page and checks them at desktop and 360px widths: light by default, a dark canvas with no white rim or strip after the switch, the switch fixed top right and clear of the header table at scroll zero, the header table fitting at 360px, and no font text at the top; keep the screenshots with the build record. — ↩ rollbackable

**Backward compat:** Pages already generated are static files and keep their old behaviour until regenerated; nothing reads them. The stored choice key and values are unchanged, so a reader's earlier choice still applies. The exported functions keep their signatures. The generated markup changes in five ways: the font-face rules now sit inside a style element in the head of every shell, the docgen shell's never-matching rule is removed, the companion page's theme root moves from a div to the body, the theme button moves to a direct child of the body, and the companion style gains a narrow-width media rule.

## 7. Alternatives considered

### 7.1 a1: Theme root moves to <body>; canvas by propagation; shared floating switch in pageCssFor — **CHOSEN**

Put class insrc-viewer and data-theme on <body> in the companion shell so its background propagates to the canvas, give the root a viewport-filling box with top clearance, wrap the font-face rules in a style tag, default to light, and float #iv-theme top right.

In the companion shell render <body class="insrc-viewer" data-theme="light" data-iv-export-css=...> with the existing div.page inside. Because the theme root is then the body and html has no background of its own, the body background propagates to the canvas, so no html rule and no :has() are needed. pageCssFor gives '.insrc-viewer' the surface background, box-sizing:border-box, min-height:100vh and padding-top:56px, and a '.insrc-viewer #iv-theme' rule: fixed, top:12px, right:12px, 32px round, with a z-index above the content. The companion structural CSS gets a max-width:480px media rule that stacks header.hdr and sets table.ref min-width:0 and width:100%. Wrap fontFaceCssForArtifacts() in a <style> tag inside pageStyleTags, drop the prefers-color-scheme fallback from viewerBootScript and the fallback shell's own script, and move #iv-theme to a direct child of the body in all three shells. Remove the docgen shell's never-matching '.insrc-viewer html,.insrc-viewer body' rule.

### 7.2 a2: Keep the theme root; mirror the mode onto <html> and <body>

Leave the companion div as the theme root and have applyMode also set data-theme on documentElement, with html/body background rules.

Keep div.page.insrc-viewer as it is. Add page CSS keyed on html[data-theme] that sets the html and body background and colour from the same tokens, and have applyMode set data-theme on document.documentElement as well as the root. Fix the font-face tag, the default and the button as in a1.

**Rejected because:** Works but keeps two holders of the mode and repeats the tokens for html.

### 7.3 a3: Fix only the default, the font text and the button

Skip the whole-document change and fix only the light default, the leaked font CSS and the floating switch.

Leave the companion div as the theme root, wrap the font-face rules, remove the prefers-color-scheme fallback and make #iv-theme a fixed top-right button, without touching which element carries the theme.

**Rejected because:** Leaves the white rim in dark mode, the main complaint.

## 8. References

- **[[c1]]** `code` `src/artifact-theme/theme.ts:271-316`
- **[[c2]]** `code` `src/artifact-theme/theme.ts:361-461`
- **[[c3]]** `code` `src/workflow/artifacts/companion/shell.ts:221-269`
- **[[c4]]** `code` `src/docgen/render/shell.ts:215-273`
- **[[c5]]** `code` `src/docgen/render/fallback.ts:240-287`
