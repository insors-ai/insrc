<!-- insrc:artifact BUILD-70276d53b0e62378-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-28T05:26:10.920Z  ·  **Updated:** 2026-11-28T05:48:15.157Z

**Commit:** 0510d84b4

## Scope

ISSUE-70276d53b0e62378 (approved): Update chat theme tests for the current shell structure. Reproduction: 9 chat-theme.test.ts assertions (lines 96,147,165,212,308,328,479,498,528) fail because the tests identify stylesheet ownership by historical position (expect 2 style blocks; the shell now has 3) and freeze pre-change history-chip markup (new-chat button intentionally added before the chip). Root cause: structural assumptions no longer match the rendered shell; no visual regression established. Fix: rebuild the snapshots against the current shell — restore accurate coverage of stylesheet ownership, token-only colors, selectors, CSP and history/new-chat behavior; fix any real visual discrepancy within the existing design rather than weakening snapshots. Acceptance: all 9 affected tests plus the positive/negative theme controls pass.

## Summary

Round 2 after judge feedback: (1) body.insrc-term now carries margin:0;padding:0;display:flex so the shared shell sheet's later plain body{padding:12px} loses on specificity — full-bleed layout restored; a test pins this. (2) Added positive/negative theme controls: a valid theme variant renders a deterministic token sheet carrying the variant; invalid tokens (sizePx 0, empty colour, '<style>' marker glyph) throw TerminalThemeError naming the path. Earlier round (1def96435) rebuilt the guard for the 3-block shell and removed the nested <style> wrapper around headExtra. All 12 chat-theme tests pass; chat-shell 43/43; tsc clean. Commit 0510d84b4.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-theme-before.json` — **insrc-build** (2026-11-28T05:48:15.157Z)
- `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` — **insrc-build** (2026-11-28T05:48:15.157Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-28T05:48:15.157Z)
