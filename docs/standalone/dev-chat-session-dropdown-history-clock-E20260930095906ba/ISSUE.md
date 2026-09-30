<!-- insrc:artifact ISSUE-095906bac5bbacaf -->

# Dev-chat session dropdown shows only a bare down-arrow — the history glyph is blocked by the webview CSP

## Reproduction

Steps: (1) Install the insrc VS Code extension at 0.5.2 or later (0.5.3 is current) and open the insrc dev-chat view in the Activity Bar sidebar. (2) Look at the session switcher in the panel header (the `#insrc-history` select, the only control in the header).

Observed: the control renders as a bare down-arrow with no leading icon, and there is a ~20px empty gap at its left edge where the icon should sit. Expected (per the change shipped at b030feb / 0.5.2): a small muted clock/history glyph immediately left of the session name, signalling that the dropdown selects a chat session.

The defect is not intermittent and does not depend on theme, session count, or whether a session is selected — the icon never paints in any state. Opening the webview developer tools shows the browser refusing to load the `data:` image because it violates the page's Content-Security-Policy directive.

## Root cause

The glyph CSS is present and correct in the shipped build; the page's security policy forbids loading it.

`renderShell` builds the chat webview's CSP as `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-<nonce>';`. It declares no `img-src` directive, so `img-src` inherits the `default-src 'none'` fallback and every image fetch on the page is blocked.

The `.chrome #insrc-history` rule paints three stacked background layers: first a `url("data:image/svg+xml,…")` clock/history icon, then the two `linear-gradient(...)` layers that draw the down-arrow. A CSS `background-image: url(...)` — including a `data:` URI — is fetched under `img-src`, so the icon layer is blocked, while the two gradient layers are not fetches at all and paint normally. The result is exactly the reported symptom: the arrow survives, the icon does not, and the rule's `padding-left:20px` leaves a visible empty gutter where the blocked icon was reserved space.

The defect shipped green because the regression test for the glyph only asserts the CSS declaration text — that the rule contains a `data:image/svg+xml` background-image, `padding-left:20px`, and three `no-repeat` layers. It never asserts that the declared image is loadable under the shell's own CSP, so the test cannot distinguish a rendering glyph from an inert one. The sibling webviews declare the same `img-src`-less CSP but use no `data:` images, so they show no symptom and are not part of this defect.

## Fix intent

Make the chat webview's content-security policy permit the inline `data:` image the header glyph already declares, so the shipped icon actually paints, and close the test gap that let an unrenderable feature pass.

The correction must stay narrow: it relaxes a security boundary only as far as inline `data:` images, and must leave the rest of the policy untouched — `default-src` stays `'none'`, scripts stay nonce-only, styles stay as they are, and no remote origin becomes loadable. The existing shell assertions that pin the single nonced script and forbid any remote `http(s)` resource must continue to hold unchanged.

Coverage must tie the two facts together rather than testing them apart: the glyph's declared image source and the policy that governs image loading have to be asserted as one invariant, so that removing the allowance or reintroducing an unloadable image source fails the suite. No new asset, symbol, or style rule is introduced — the glyph markup and CSS already ship as-is.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:250` — "const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;"
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts:322` — "`.chrome #insrc-history{max-width:16ch;padding-left:20px;` +"
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts:323` — "`background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%236b7688' …%3E%3C/svg%3E"),linear-gradient(45deg,tra"
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts:324` — "`background-position:left 2px center,calc(100% - 6px) 55%,calc(100% - 3px) 55%;background-size:12px 12px,3px 3px,3px 3px;background-repeat:no-repeat,no-repeat,no-repeat;}` +"
- **[[c5]]** `code` `vscode-plugin/src/chat/chat-panel.ts:493` — "`<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">` +"
- **[[c6]]** `code` `vscode-plugin/src/chat/chat-panel.ts:509` — "`<span class="right"><select id="insrc-history" class="segsel ${histCls}" aria-label="session"><option value="">new…</option></select></span>` +"
- **[[c7]]** `code` `vscode-plugin/src/chat/__tests__/chat-panel.test.ts:1358` — "test('UI: the #insrc-history session dropdown carries a leading history/clock glyph so its purpose reads', () => {"
- **[[c8]]** `code` `vscode-plugin/src/chat/__tests__/chat-panel.test.ts:1364` — "assert.match(decl, /background-image:url\("data:image\/svg\+xml,/, 'the history dropdown has an inline SVG icon background');"
- **[[c9]]** `code` `vscode-plugin/src/chat/__tests__/chat-panel.test.ts:317` — "const csp = /Content-Security-Policy" content="([^"]*)"/.exec(html);"
- **[[c10]]** `code` `vscode-plugin/src/chat/__tests__/chat-panel.test.ts:323` — "assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?https?:\/\//i, 'no remote resource is loaded (embedded marked ships URLs only in warning strings)');"
- **[[c11]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:166` — "const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;"
- **[[c12]]** `code` `vscode-plugin/src/panels/webview-host.ts:418` — "const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;"
