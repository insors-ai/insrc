<!-- insrc:artifact PLAN-edb76e2e4d41217d-s1 -->

# Plan: E20260925edb76e2e:S001

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790348278962-jxcfuz`
**LLD effective hash:** `f394a9ecb688...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc1 design-tokens.ts module (types + tokens + renderer) | M | — | unit: renderTerminalStyle(terminalTheme) opens/closes <style>, contains every token + var(--vscode-*,<fallback>), no asWebviewUri/http(s) (CSP-safe); unit: renderTerminalStyle determinism: two calls byte-identical; unit: renderTerminalStyle guards throw TerminalThemeError on empty token and on '</style>'/angle-bracket token; unit: renderTerminalStyle light-theme variant emits a valid deterministic <style>; unit: surfaceClass total over all five SurfaceKind members (non-empty, present in output); unit: terminalTheme carries the tui.css values and is Object.isFrozen | [[c1]] [[c2]] [[c5]] |
| 2 | **`t2`** Five drift-locked terminal-styled mock HTML deliverables | M | `t1` | integration: Mock round-trip: each of the five mock files' <style> equals renderTerminalStyle(terminalTheme) byte-for-byte; integration: Mock coverage: exactly five SurfaceKind mock files exist, each referencing its TERMINAL_SURFACE_CLASS root class; integration: Mock files reference no remote origin / asWebviewUri (VS Code webview surface only); integration: Anti-chat-bubble scan: mock markup uses box-drawing/monospace/marker vocabulary, no chat-bubble constructs | [[c2]] [[c4]] |
| 3 | **`t3`** Unit + contract test suites | M | `t1`, `t2` | unit: design-tokens unit suite authored under src/chat/__tests__/ (all renderer/surfaceClass/terminalTheme cases green); integration: design-tokens contract suite authored (mock round-trip + coverage + vscode-free/no-remote-origin scans + anti-chat-bubble); integration: design-tokens.ts vscode-free source-scan (no import from 'vscode'); smoke: full vscode-plugin tsc + test sweep passes with no regressions | [[c3]] [[c5]] |

### E20260925edb76e2e:S001:T001 — sc1 design-tokens.ts module (types + tokens + renderer)

Add the new vscode-free, dependency-free module vscode-plugin/src/chat/design-tokens.ts implementing sc1: the TerminalTheme interface + SurfaceKind union (verbatim from the HLD sketch), the frozen terminalTheme default carrying the exact site/css/tui.css values, TERMINAL_SURFACE_CLASS (Record<SurfaceKind,string>), and the two pure functions renderTerminalStyle(theme) (token->inlined <style> string via the var(--vscode-*, <fallback>) idiom, with the empty-token and style-breaking guards throwing TerminalThemeError) and surfaceClass(kind). No existing file edited; not wired into activation.

**Acceptance checks:**
- design-tokens.ts exports TerminalTheme, SurfaceKind, terminalTheme (frozen), TERMINAL_SURFACE_CLASS, renderTerminalStyle, surfaceClass; imports nothing from 'vscode'; tsc --noEmit clean under the plugin tsconfig.
- renderTerminalStyle(terminalTheme) returns a string opening with <style> and closing with </style>, containing every color/font/chrome/marker token value and the var(--vscode-*, <fallback>) layering, with no asWebviewUri/http(s):// substring; deterministic (two calls byte-identical).
- renderTerminalStyle throws TerminalThemeError naming the token path on an empty/whitespace token and on a token containing '</style>' or angle brackets; surfaceClass is total over all five SurfaceKind members.
- terminalTheme carries the tui.css values (mono stack, bg #0b0e14, accent #4ade80, warn #fbbf24, err #f87171) and is Object.isFrozen.

### E20260925edb76e2e:S001:T002 — Five drift-locked terminal-styled mock HTML deliverables

Add the five per-surface mock HTML files under vscode-plugin/src/chat/mocks/ (one per SurfaceKind: chat, provider-dropdown, history-dropdown, inline-diff, docs-review), derived from the approved reference mock at docs/epics/.../S001/mocks.html. Per the s3 critique, each mock's <style> block is GENERATED programmatically from renderTerminalStyle(terminalTheme) (a small checked-in generator, e.g. vscode-plugin/src/chat/mocks/gen-mocks.ts, run to (re)produce the files) so the drift-lock passes by construction; only the per-surface body markup (targeting the surface's TERMINAL_SURFACE_CLASS root class, using the terminal vocabulary: box-drawing chrome, monospace, marker glyphs, not chat-bubble) is hand-authored.

**Acceptance checks:**
- Exactly five mock files exist, one per SurfaceKind, each referencing its TERMINAL_SURFACE_CLASS root class.
- Each mock's embedded <style> block is generated from renderTerminalStyle(terminalTheme) and equals it byte-for-byte (drift-lock holds by construction; regenerating produces no diff).
- Mock markup uses the terminal vocabulary (box-drawing/monospace/marker glyphs) and references no remote origin / asWebviewUri (VS Code webview surface only).

### E20260925edb76e2e:S001:T003 — Unit + contract test suites

Add node:test (tsx --test) + node:assert/strict suites under vscode-plugin/src/chat/__tests__/: a unit suite over renderTerminalStyle/surfaceClass/terminalTheme (postconditions, guards, determinism, light-variant, totality) and a contract suite (mock round-trip byte-equality, five-surface coverage, vscode-free + no-remote-origin source scans, anti-chat-bubble scan). Run the scoped src/chat suite first, then tsc + the full plugin sweep as the regression gate.

**Acceptance checks:**
- Unit suite proves every renderTerminalStyle postcondition + both guards + determinism + the light-theme variant + surfaceClass totality + terminalTheme frozenness.
- Contract suite proves the mock round-trip byte-equality for all five surfaces, exactly-five-surface coverage, the vscode-free + no-remote-origin/asWebviewUri source scans, and the anti-chat-bubble scan (mapping ac1 + ac2).
- npx tsc --noEmit clean; the scoped src/chat/__tests__ suite passes, and the full vscode-plugin test sweep passes with no regressions.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| renderTerminalStyle(terminalTheme): output opens with <style>/closes with </style>; every color/font/chrome/marker token value appears in the output; contains the var(--vscode-*, <fallback>) layering; no asWebviewUri/http(s):// substring (CSP-safe, k2) | `t1`, `t3` |
| renderTerminalStyle determinism: two calls with the same theme are byte-identical | `t1`, `t3` |
| renderTerminalStyle guards: a theme with an empty token throws TerminalThemeError naming the token path; a token containing '</style>' or angle brackets throws | `t1`, `t3` |
| renderTerminalStyle with a light-theme variant emits a valid deterministic <style> with the light values | `t1`, `t3` |
| surfaceClass: total over all five SurfaceKind members, each returns a non-empty class present in the rendered output (no undefined under noUncheckedIndexedAccess) | `t1`, `t3` |
| terminalTheme: carries the exact tui.css values (mono stack, bg #0b0e14, accent #4ade80, warn #fbbf24, err #f87171) and is frozen (Object.isFrozen) | `t1`, `t3` |
| Mock round-trip: for each SurfaceKind mock HTML file (chat, provider-dropdown, history-dropdown, inline-diff, docs-review), the embedded <style> block equals renderTerminalStyle(terminalTheme) byte-for-byte | `t2`, `t3` |
| Mock coverage: exactly the five SurfaceKind surfaces have a mock file, and each references its TERMINAL_SURFACE_CLASS root class | `t2`, `t3` |
| Source-scan: design-tokens.ts imports nothing from 'vscode' (vscode-free) and the mock files reference no remote origin / asWebviewUri (VS-Code-webview-only, ac2) | `t2`, `t3` |
| Anti-chat-bubble scan: mock markup uses the terminal vocabulary (box-drawing chrome / monospace / marker glyphs) and contains no chat-bubble constructs | `t2`, `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails.api (renderTerminalStyle + surfaceClass signatures/postconditions)`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges (TerminalTheme, SurfaceKind, terminalTheme, TERMINAL_SURFACE_CLASS)`
- **[[c3]]** `prior-artifact` `LLD s1 testStrategy (node:test unit + contract suites; acceptance mapping ac1/ac2)`
- **[[c4]]** `prior-artifact` `LLD s1 migration (five per-surface mock HTML deliverables under vscode-plugin/src/chat/mocks/)`
- **[[c5]]** `prior-artifact` `LLD s1 errorPaths (empty-token + style-breaking guards; mock drift-lock; invariants)`
