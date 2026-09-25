<!-- insrc:artifact LLD-edb76e2e4d41217d-s1 -->

# LLD: E20260925edb76e2e:S001

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790343836936-uhegob`
**HLD effective hash:** `f394a9ecb688...`

## HLD context

**Framework:** Layered extension-host core + a thin terminal-styled webview (alternative a1). All chat logic lives in vscode-free, deps-injected host modules that mirror the repo's existing createWebviewPanelHost(deps) factory idiom, so streaming, session, edit-governance and docs-review logic are unit-testable without a webview harness. The webview holds no business logic — it paints terminal-styled surfaces and emits user intents over a single typed, versioned message protocol. Each agentic CLI's native structured stream is normalized to ONE event union by a per-provider stream adapter, quarantining the still-to-spike claude/codex stream/resume contract at that boundary so no downstream surface is provider-specific. Grounding + tracked-workflow behaviour come through the CLI's own insrc MCP (the extension observes, never orchestrates — k8).
**Rollout phase:** Phase A — foundational contracts (design system + CLI bridge)
**Owns:** `sc1` (Terminal-UX design tokens + component vocabulary)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: The subprocess spawn mechanics, the per-provider parsing of each CLI's NATIVE stream format, the exact claude/codex flags (the stream/resume spike), backpressure/cancellation handling, and error normalization stay private to S002; consumers see only the normalized TurnEvent union (sc2) and the StreamAdapter/ProviderRegistry interface (sc5). — owns `sc2`, `sc5`
- `s3`: The terminal renderer internals (how TurnEvents paint as terminal output), the input box, the panel/webview lifecycle and single-active-panel management, and the CSP/webview bootstrap are private to S003; other stories consume only the message protocol (sc3) and the session-store shape (sc4). — owns `sc3`, `sc4`
- `s4`: How status/tool-call TurnEvents are mapped to terminal-style marker lines, and how observed insrc MCP tool-calls are named/enriched into markers, are private to S004; it adds no new shared contract — it renders sc2 events as sc1-styled markers over sc3.
- `s5`: The provider-selector and history-dropdown UI, the new-chat vs open-chat flows, and the wiring of the StreamAdapter's native session-resume handle into a restored session are private to S005; it persists through sc4 and drives turns through sc5, adding no new shared contract.
- `s6`: The inline-diff renderer, the EditGovernor that applies the per-session auto/review toggle, and (review mode) the interception of the CLI's edit/write before the write reaches disk are private to S006; it consumes file-edit TurnEvents (sc2), the edit-mode field on the session (sc4), and the edit-prompt/edit-decision messages (sc3).
- `s7`: The docs-review pane and its DocsReviewClient over the existing daemon IPC (the exact pendingApproval listing + insrc_workflow_approve method names/payloads, pinned at the S007 LLD) and the mirroring of the JetBrains review/comment/accept-reject panel are private to S007; it consumes only the message protocol (sc3) and the terminal tokens (sc1) and adds no new shared contract to the Epic.

## Contract details

**Surface level:** internal-shared

### `renderTerminalStyle`

```typescript
renderTerminalStyle(theme: TerminalTheme): string
```

**Parameters:**
- `theme: TerminalTheme` — The terminal token set to render (defaults to the exported frozen terminalTheme; a caller may pass a variant such as a light-theme token set).

**Returns:** `string` — A complete inlined style-element string. Every TerminalTheme token surfaces as a CSS rule or custom property using the repo idiom var(--vscode-<token>, <fallback>) so the terminal palette layers over the user's VS Code theme with the tui.css literals as fallbacks. Deterministic for a given theme (same input -> byte-identical output), which is what the mock round-trip test asserts.

**Preconditions:**
- Every TerminalTheme token string is non-empty (a caller passing the exported frozen terminalTheme trivially satisfies this).

**Postconditions:**
- Return value opens with <style> and closes with </style>.
- Every color/font/chrome/marker token in the passed theme appears at least once in the output.
- No remote origins or asWebviewUri references are emitted (CSP-safe, k2); output is self-contained CSS text.
- Pure: no I/O, no vscode import, no global state read/written.

### `surfaceClass`

```typescript
surfaceClass(kind: SurfaceKind): string
```

**Parameters:**
- `kind: SurfaceKind` — Which terminal surface (chat | provider-dropdown | history-dropdown | inline-diff | docs-review) the caller is rendering, so it gets the matching documented root class name.

**Returns:** `string` — The stable root CSS class name for that surface (the class whose rules renderTerminalStyle emits), so downstream surfaces target the vocabulary by a typed accessor rather than a string literal.

**Preconditions:**
- kind is a member of the SurfaceKind union (enforced by the type system).

**Postconditions:**
- Returned class name is one for which renderTerminalStyle emits at least one rule.
- Total function over SurfaceKind (every member maps to a class).

## Data model changes

### `TerminalTheme` — new

The sc1 token interface, verbatim from the HLD interfaceSketch: readonly font { mono; sizePx; linePx }, color { bg; fg; dim; accent; warn; err; sel }, chrome { border; boxChars { h,v,tl,tr,bl,br } }, marker { pending; toolCall; edit; done; error }. Type-only; vscode-free. Lives in the new module vscode-plugin/src/chat/design-tokens.ts.

```
+ export interface TerminalTheme { readonly font: {mono:string;sizePx:number;linePx:number}; readonly color: {bg:string;fg:string;dim:string;accent:string;warn:string;err:string;sel:string}; readonly chrome: {border:string; boxChars:{h:string;v:string;tl:string;tr:string;bl:string;br:string}}; readonly marker: {pending:string;toolCall:string;edit:string;done:string;error:string}; }
```

**Call sites:**
- `vscode-plugin/src/chat/design-tokens.ts (definition; consumed by S003 webview bootstrap at vscode-plugin/src/panels/webview-host.ts:420 in a later phase)`

### `SurfaceKind` — new

The sc1 surface enumeration, verbatim from the HLD sketch: 'chat' | 'provider-dropdown' | 'history-dropdown' | 'inline-diff' | 'docs-review'. Drives surfaceClass and names the five mock deliverables.

```
+ export type SurfaceKind = 'chat' | 'provider-dropdown' | 'history-dropdown' | 'inline-diff' | 'docs-review';
```

**Call sites:**
- `vscode-plugin/src/chat/design-tokens.ts (definition)`

### `terminalTheme` — new

The frozen default TerminalTheme carrying the tui.css values (mono stack; bg #0b0e14, fg #c6cdd8, dim #4a5464, accent #4ade80, warn #fbbf24, err #f87171, sel rgba(74,222,128,0.22); chrome border #222a36 + Unicode box-drawing chars; marker glyphs). The single default every surface consumes.

```
+ export const terminalTheme: TerminalTheme = Object.freeze({ ... tui.css values ... });
```

**Call sites:**
- `vscode-plugin/src/chat/design-tokens.ts (definition; default arg to renderTerminalStyle)`

### `TERMINAL_SURFACE_CLASS` — new

A Record<SurfaceKind, string> mapping each surface to its documented root class name; the data behind surfaceClass, so the class vocabulary is a typed, single-sourced map rather than scattered string literals.

```
+ export const TERMINAL_SURFACE_CLASS: Record<SurfaceKind, string> = { 'chat': 'insrc-term-chat', ... };
```

**Call sites:**
- `vscode-plugin/src/chat/design-tokens.ts (definition; read by surfaceClass and by the mock HTML files)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | s1 OWNS sc1 and implements it as vscode-plugin/src/chat/design-tokens.ts: the TerminalTheme interface + SurfaceKind union (verbatim from the HLD sketch), the frozen terminalTheme default, the TERMINAL_SURFACE_CLASS vocabulary, and the two pure functions renderTerminalStyle (token->inlined <style> string; the methodAdd amendment) and surfaceClass. Downstream stories consume this module: S003 calls renderTerminalStyle to build the webview <style> and targets surfaceClass('chat'); S004/S005/S006/S007 target their surfaceClass and reuse the marker/chrome tokens. s1 does NOT touch webview-host.ts or any sc2/sc3/sc4/sc5 surface -- those stay owned by S002/S003. |

## Error paths

### Error cases

- **A caller passes a TerminalTheme variant with an empty or whitespace-only token value (e.g. color.accent === '').** (recoverable)
  - Detection: renderTerminalStyle iterates the required token keys and checks each resolved value is a non-empty, trimmed string before assembling the <style>; an empty value fails that guard.
  - Response: Throw a descriptive TerminalThemeError naming the offending token path (e.g. 'color.accent'); do not emit a half-built <style>. This is a dev-time contract violation surfaced loudly, never a silent empty rule.
  - User impact: None at runtime for the shipped default (the frozen terminalTheme is complete); a developer authoring a bad theme variant gets an immediate, named failure in tests/build rather than an invisible unstyled surface.
- **A token value contains a style-breaking substring (e.g. '</style>' or an angle-bracket sequence) that could terminate the inlined <style> block early or inject markup.** (recoverable)
  - Detection: renderTerminalStyle scans each token value for the closing-style sequence and angle brackets before interpolation; a match trips the guard.
  - Response: Throw a TerminalThemeError identifying the token; refuse to emit. Tokens are developer-controlled CSS-literal values, so this is a contract guard that keeps the inlined-<style> output CSP-safe and un-injectable (k2).
  - User impact: None for the shipped tokens; prevents a malformed theme from breaking out of the <style> element or the webview CSP.
- **A mock HTML deliverable's embedded <style> block has drifted from renderTerminalStyle(terminalTheme) (someone hand-edited a mock or changed a token without regenerating).** (recoverable)
  - Detection: The round-trip test extracts each mock file's <style> block and asserts byte-equality with renderTerminalStyle(terminalTheme); a mismatch fails.
  - Response: The test fails in the local/CI sweep, naming the drifted mock; the fix is to regenerate the mock from the renderer. The drift never reaches a consumer.
  - User impact: None shipped — drift is caught before merge, keeping the mockups a faithful executable spec of the tokens (ac1).

### Edge cases

| Input | Expected |
| :--- | :--- |
| renderTerminalStyle called with a light-theme TerminalTheme variant (the data-theme=light palette from tui.css). | Emits a valid, self-contained <style> string deterministically, with the light values in the var() fallbacks; identical structure to the dark render, only values differ. |
| A boxChars/marker token that is a multi-byte Unicode glyph (e.g. box-drawing chars or a marker symbol). | The glyph is emitted verbatim (UTF-8), unescaped, since it appears in CSS content/pseudo-element context; renderTerminalStyle does not mangle non-ASCII. |
| surfaceClass called for each of the five SurfaceKind members. | Returns a defined, non-empty class name for every member (total function; no undefined under noUncheckedIndexedAccess) and every returned class has at least one matching rule in renderTerminalStyle output. |
| renderTerminalStyle called twice with the same theme. | Byte-identical output both times (pure, deterministic; no timestamp/nonce/ordering nondeterminism) — the property the round-trip test relies on. |

### Invariants to preserve

- Styling reaches the webview ONLY as inlined CSS text assigned via panel.webview.html; there is no asWebviewUri / external-stylesheet / cspSource pipeline under vscode-plugin/src (s1 code bundle: webview-host.ts:420 constructs the inline <style>, extension.ts:316 assigns it). renderTerminalStyle must therefore return a complete self-contained <style> string with no external references, so S003 can drop it straight into the existing delivery path without inventing an asset pipeline. [[c2]]
- The webview styling idiom is var(--vscode-<token>, <literal fallback>) — theme variable first, hard-coded fallback second (s1 code bundle: webview-host.ts:421-427). renderTerminalStyle preserves this layering (tui.css literals as the fallbacks) so the terminal palette coexists with the user's VS Code theme rather than overriding it. [[c2]]
- The terminal aesthetic is the insrc docs-site TUI: monospace stack, near-black bg (#0b0e14), phosphor-green primary accent (#4ade80), box-drawing chrome — explicitly not chat-bubble (s1 asset bundle: site/css/tui.css :root). The sc1 tokens must codify these exact values so every consuming surface renders k6's terminal look. [[c5]]

## Test strategy

**Test framework:** `node:test (tsx --test) + node:assert/strict, mirroring vscode-plugin/src/panels/__tests__/webview-host.test.ts (pure generated-string assertions, no webview runtime).`

### Test levels

- **unit** — Prove the pure sc1 functions and token defaults behave per the s4 contract and s5 postconditions/edge cases.
  - Subjects: `renderTerminalStyle(terminalTheme): output opens with <style>/closes with </style>; every color/font/chrome/marker token value appears in the output; contains the var(--vscode-*, <fallback>) layering; no asWebviewUri/http(s):// substring (CSP-safe, k2)`, `renderTerminalStyle determinism: two calls with the same theme are byte-identical`, `renderTerminalStyle guards: a theme with an empty token throws TerminalThemeError naming the token path; a token containing '</style>' or angle brackets throws`, `renderTerminalStyle with a light-theme variant emits a valid deterministic <style> with the light values`, `surfaceClass: total over all five SurfaceKind members, each returns a non-empty class present in the rendered output (no undefined under noUncheckedIndexedAccess)`, `terminalTheme: carries the exact tui.css values (mono stack, bg #0b0e14, accent #4ade80, warn #fbbf24, err #f87171) and is frozen (Object.isFrozen)`
  - Fixtures: `A light-theme TerminalTheme variant literal`, `A deliberately-malformed TerminalTheme (empty token + a '</style>'-bearing token) for the guard tests`
- **contract** — Lock the five mock deliverables to the shipped tokens so the mockups stay a faithful executable spec (the drift error path), and prove the module boundary invariants.
  - Subjects: `Mock round-trip: for each SurfaceKind mock HTML file (chat, provider-dropdown, history-dropdown, inline-diff, docs-review), the embedded <style> block equals renderTerminalStyle(terminalTheme) byte-for-byte`, `Mock coverage: exactly the five SurfaceKind surfaces have a mock file, and each references its TERMINAL_SURFACE_CLASS root class`, `Source-scan: design-tokens.ts imports nothing from 'vscode' (vscode-free) and the mock files reference no remote origin / asWebviewUri (VS-Code-webview-only, ac2)`, `Anti-chat-bubble scan: mock markup uses the terminal vocabulary (box-drawing chrome / monospace / marker glyphs) and contains no chat-bubble constructs`
  - Fixtures: `The five mock HTML files under vscode-plugin/src/chat/mocks/ (or a docs mocks dir) as the round-trip fixtures`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `renderTerminalStyle output contains the tui.css terminal palette + monospace + box-drawing/marker tokens (terminal look, not chat-bubble)`, `Mock round-trip: all five surfaces (chat, provider+history dropdowns, inline-diff, docs-review) are mocked and their <style> matches the shipped tokens`, `Anti-chat-bubble scan over the mock markup (box-drawing/monospace vocabulary present; no bubble constructs)` |
| `ac2` | `Source-scan: mock files reference no remote origin / asWebviewUri and design-tokens.ts is vscode-free (VS Code webview surface only)`, `Mock coverage asserts exactly the five VS Code surfaces exist with no JetBrains artifacts` |

## Migration

**State before:** vscode-plugin has no chat/ design-token module: the only webview styling is the hard-coded inline <style> literal inside the createWebviewPanelHost template at webview-host.ts:420-427, using the var(--vscode-<token>, <fallback>) idiom for a status/repo-config panel (s1 code bundle). The terminal aesthetic exists only as the docs-site CSS at site/css/tui.css :root (s1 asset bundle); nothing in the extension codifies it. No TerminalTheme / SurfaceKind / renderTerminalStyle / mock surfaces exist. sc1 is declared in the HLD but unimplemented.

**State after:** A new, purely-additive, vscode-free module vscode-plugin/src/chat/design-tokens.ts implements sc1: the TerminalTheme interface + SurfaceKind union, the frozen terminalTheme default (tui.css values), TERMINAL_SURFACE_CLASS, and the pure functions renderTerminalStyle + surfaceClass. Five terminal-styled mock HTML deliverables (one per SurfaceKind) live under vscode-plugin/src/chat/mocks/ and are locked to renderTerminalStyle(terminalTheme) by a round-trip test. Unit + contract test suites are added under vscode-plugin/src/chat/__tests__/. webview-host.ts, extension.ts and every existing surface are UNCHANGED; the sc1 methodAdd amendment is stamped on the HLD. Nothing is wired into activation (Phase A) — S003 will consume the module later.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new vscode-free module vscode-plugin/src/chat/design-tokens.ts exporting the sc1 types (TerminalTheme, SurfaceKind), the frozen terminalTheme default, TERMINAL_SURFACE_CLASS, and the pure functions renderTerminalStyle + surfaceClass. No existing file is edited. — ↩ rollbackable
2. Add the five terminal-styled mock HTML deliverables (chat, provider-dropdown, history-dropdown, inline-diff, docs-review) under vscode-plugin/src/chat/mocks/, each inlining renderTerminalStyle(terminalTheme) and targeting its TERMINAL_SURFACE_CLASS root class. — ↩ rollbackable
3. Add the unit + contract test suites under vscode-plugin/src/chat/__tests__/ (renderTerminalStyle/surfaceClass unit tests, the mock round-trip drift-lock, the vscode-free + no-remote-origin source scans). Run tsc + the plugin sweep to confirm green. — ↩ rollbackable
4. Stamp the sc1 sharedContract.methodAdd amendment (renderTerminalStyle) on the HLD via the approval flow; no code consumes the new method yet (S003 consumes it in Phase B). — ↩ rollbackable

**Backward compat:** No existing public API is affected. Every change is purely additive: a new module, new mock files, new tests, and an additive (non-breaking) methodAdd on the sc1 contract. webview-host.ts / createWebviewPanelHost and its inline <style> are untouched, so the existing status/repo-config panel behaves identically. No consumer imports design-tokens.ts until S003, so there is no compatibility surface to break.

## Alternatives considered

### a1: Typed TerminalTheme object + pure renderTerminalStyle(theme): string, with drift-locked mock HTML — **CHOSEN**

sc1 = the HLD's TerminalTheme/SurfaceKind types + a frozen default theme + a pure vscode-free renderer that emits an inlined <style> string; mockups are static HTML that inline that same rendered CSS so mock and shipped tokens cannot drift.

A single vscode-free, dependency-free module (design-tokens.ts) exports the sc1 contract verbatim from the HLD interfaceSketch: the TerminalTheme interface, the SurfaceKind union, and a frozen `terminalTheme: TerminalTheme` default carrying the tui.css values (mono stack; bg #0b0e14, fg #c6cdd8; accent #4ade80 phosphor green, accent2 #38bdf8 cyan, amber #fbbf24, red #f87171; sel rgba(74,222,128,.22); box-drawing chars; marker glyphs). A sibling pure function `renderTerminalStyle(theme): string` produces an inlined <style> string reusing the repo idiom `var(--vscode-<token>, <fallback>)` so the terminal palette layers over the user's VS Code theme (fallbacks = the tui.css literals). A small documented class-name vocabulary (one class per SurfaceKind + chrome/marker classes) is the stable API downstream surfaces target. Mock deliverables are self-contained static HTML files (one per SurfaceKind: chat, provider-dropdown, history-dropdown, inline-diff, docs-review) that inline the SAME renderTerminalStyle output; a round-trip test asserts each mock's embedded <style> equals renderTerminalStyle(terminalTheme), locking mock<->token parity. Delivery into the live panel (the webview-host <style>/CSP path) stays owned by S003, which CONSUMES renderTerminalStyle.

### a2: CSS-custom-property theme (:root{--insrc-*}) + thin TS class-name map

sc1 ships primarily as a CSS :root{--insrc-*} variable block mirroring tui.css, with only a thin TS map of class names; surfaces reference tokens via var(--insrc-*).

Express the tokens the way tui.css itself does: a canonical CSS string exposing a `:root{ --insrc-bg; --insrc-fg; --insrc-accent; ... }` custom-property block (plus a data-theme=light variant), shipped as the inlined <style> base. The TS side is thin: a SurfaceKind union and a map of documented class names, but the token VALUES live in CSS, not a typed object. Downstream surfaces consume tokens as `var(--insrc-accent)` etc. and the class vocabulary. Runtime re-theming is possible by overriding the custom properties.

**Rejected because:** Aesthetically closest to tui.css and runtime-overridable, but it VIOLATES sc1 by reshaping the owned contract away from its declared TS-interface form and weakening type-safety/testability. Ranked last because a contract-shape violation on the very contract this Story owns outweighs the re-theming convenience.

### a3: Tokens-only data contract; CSS rendering deferred to S003

sc1 is purely the typed TerminalTheme object + SurfaceKind + a documented class vocabulary + the mockups; turning tokens into the inlined <style> is left to S003's webview bootstrap.

Keep sc1 minimal and pure-data: export the TerminalTheme interface, the frozen default theme (tui.css values), the SurfaceKind union, and a documented class-name vocabulary, plus the static mock HTML deliverables. Do NOT ship a renderTerminalStyle function; S003 (which owns sc3 renderer + the webview <style>/CSP bootstrap) is responsible for mapping the theme object to the inlined CSS string as part of painting the panel. The mockups are authored directly against the intended CSS but the canonical token->CSS mapping is not part of sc1.

**Rejected because:** Tightest scope, but its sc1 verdict is only partial: without a canonical renderer sc1 is data-only and the 'single source every surface consumes' guarantee weakens, and mock<->implementation drift becomes unpreventable. Loses to a1 precisely on the sc1 constraint a1 satisfies.

## Citations

- **[[c1]]** `analyze-bundle` `s1 code bundle: vscode-plugin/src/panels/webview-host.ts:420-427 inline <style> + extension.ts:316 delivery; var(--vscode-*,<fallback>) idiom`
- **[[c2]]** `analyze-bundle` `s1 asset bundle: site/css/tui.css :root terminal palette (mono stack, #0b0e14 bg, #4ade80 accent, box-drawing chrome)`
- **[[c3]]** `analyze-bundle` `s1 test bundle: vscode-plugin/src/panels/__tests__/webview-host.test.ts generated-string assertion idiom`
- **[[c4]]** `prior-artifact` `HLD sharedContract sc1 (TerminalTheme + SurfaceKind), ownedByStory=s1`
- **[[c5]]** `stakeholder` `k6 terminal look & feel (c5) — anti-chat-bubble requirement`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-25T15:13:28.546Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | createWebviewPanelHost is the sole webview factory in the vscode-plugin, defined in vscode-plugin/src/panels/webview-host.ts. | grep 'export function createWebviewPanelHost' matched vscode-plugin/src/panels/webview-host.ts:111; read of that anchor found=true. The factory exists exactly where cited. | none — verified sound |
| cl2 | citation | LOW | manual | The panel document is built as a template literal containing an inline <style> block in webview-host.ts and delivered by assigning panel.webview.html in extension.ts (no external stylesheet/asWebviewUri pipeline). | read webview-host.ts:420 found=true and read extension.ts:316 found=true; grep 'panel\\.webview\\.html' matched extension.ts:316. The only asWebviewUri hits are inside docs/ artifacts (this LLD/HLD text), none under vscode-plugin/src — confirming the inline-<style>-via-panel.webview.html delivery with no asset-URI pipeline. | none — verified sound |
| cl3 | citation | LOW | manual | The existing webview styling idiom is var(--vscode-<token>, <literal fallback>) — a VS Code theme variable with a hard-coded fallback — as used in the webview-host.ts inline <style> rules. | read webview-host.ts:421 found=true; grep 'var\\(--vscode-<token>,' matched 28 times across the plugin/templates, confirming var(--vscode-*, <fallback>) is an established repo idiom the sc1 renderer can reuse. | none — verified sound |
| cl4 | citation | LOW | manual | The repo's webview-output test idiom is a pure generated-string assertion suite (no webview runtime) in vscode-plugin/src/panels/__tests__/webview-host.test.ts, e.g. a Content-Security-Policy regex assertion. | read vscode-plugin/src/panels/__tests__/webview-host.test.ts:1 found=true; grep 'Content-Security-Policy' + 'node:test' + 'node:assert/strict' confirm the generated-string assertion idiom exists and is the repo-wide test convention. | none — verified sound |
| cl5 | semantic | LOW | manual | The sc1 module vscode-plugin/src/chat/design-tokens.ts is net-new (does not yet exist) and the LLD's scope is purely additive: it does NOT modify webview-host.ts or any existing surface. | grep 'renderTerminalStyle', 'TERMINAL_SURFACE_CLASS' and 'chat/design-tokens' matched ONLY inside docs/ artifacts (this LLD) and nowhere under vscode-plugin/src, confirming the sc1 module is genuinely net-new and the change is additive (webview-host.ts untouched). | none — verified sound |
| cl6 | closed-union | LOW | manual | SurfaceKind is a five-member union (chat \| provider-dropdown \| history-dropdown \| inline-diff \| docs-review), matching the five mock deliverables and the HLD sc1 sketch. | The five SurfaceKind members ('provider-dropdown','inline-diff','docs-review', plus chat/history-dropdown) appear consistently only in the artifact (net-new), matching the HLD sc1 sketch and the five named mock deliverables; internally consistent, no open/extra member. | none — verified sound |
| cl7 | citation | LOW | manual | The terminal aesthetic values codified by sc1 (near-black bg #0b0e14, phosphor-green accent #4ade80, monospace stack) come from the docs-site TUI stylesheet site/css/tui.css :root. | reads of site/css/tui.css:17 and :28 both found=true, confirming the docs-site TUI :root palette (near-black bg / phosphor-green accent) that sc1 codifies exists at the cited anchors. | none — verified sound |
