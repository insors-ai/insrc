# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Epic:** edb76e2e4d41217d  ·  **Commit:** dd9edea

Implements the approved S001 LLD + PLAN: the sc1 terminal-UX design system.

## Tasks validated

- ✓ `t1` — vscode-plugin/src/chat/design-tokens.ts (TerminalTheme/SurfaceKind, frozen terminalTheme, TERMINAL_SURFACE_CLASS, renderTerminalStyle + surfaceClass, allowlist guards)
- ✓ `t2` — five drift-locked mock HTML deliverables + gen-mocks.ts (styles generated from renderTerminalStyle)
- ✓ `t3` — node:test unit + contract suites (incl. non-angle-bracket injection negatives)

## Validation

- `tsc --noEmit` clean.
- 23 sc1 tests pass; full plugin sweep **310 pass / 0 fail / 2 live-skip**.
- Code review (CR-edb76e2e4d41217d-s1): **warn**, 0 HIGH / 0 MED / 0 LOW.
- Opposite-actor cold review: HIGH (anti-injection guard was a `<>`-only denylist, PoC-confirmed bypass via `"` `)` `;` `}`) fixed with per-role allowlist validation + negative tests before completion; LOW-1 (typed VSCODE_VAR) folded.
