<!-- insrc:artifact BUILD-d3ca1368b1f4cccd-s1 -->

# Build (standalone bugfix) — Story s1

**Size class:** bugfix  ·  **Standalone:** yes  ·  **Created:** 2026-11-27T10:50:05.933Z  ·  **Updated:** 2026-11-27T10:51:22.799Z

**Commit:** 8a26ef27d

## Triage rationale

Single-module UI defect in chat-panel.ts; fix = webview change-gating per approved LLD.

## Summary

Implemented LLD a1 in vscode-plugin/src/chat/chat-panel.ts: lastLabelKey/lastPickKey gate rlabel()/updatePickers() DOM writes so duplicate run-config/run-catalog echoes no longer rebuild an open popup or the status-bar button; rb/gb onclick skip requestCatalog() when the catalog is already ready (and stamp lastPickKey on open); pickModel and the provider-item onclick close the popup on a different-provider (new-chat) pick. 4 behavioral tests run the shell's real inline script in a vm over a mini-DOM (ac1-ac4); gate ran them: 4/4 pass, file 289/289 exit 0. plugin tsc clean. Full plugin sweep has 21 pre-existing failures at HEAD (verified identical without this change), none in the touched files.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-27T10:51:22.799Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-27T10:51:22.799Z)
