<!-- insrc:artifact BUILD-3183af2a005db14f-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-14T12:24:44.000Z  ·  **Updated:** 2026-11-14T12:52:00.130Z

**Commit:** c83844958

## Scope

Fix two defects in the shipped VS Code scratchpads popup (ISSUE-3183af2a005db14f): (1) clicking "New scratchpad" in the chat status-bar popup must open the created scratchpad document — audit the scratch-new chain (vscode-plugin/src/chat/chat-panel.ts:2531 webview post → vscode-plugin/src/extension.ts:792 SCRATCH_INTENT_TYPES intercept → vscode-plugin/src/chat/scratch-host.ts case 'scratch-new' (promptTitle → createScratch → refreshBrowse → openDocument) → vscode-plugin/src/panels/scratch-panels.ts openDocument/openSingleton) so the insrc.scratchpad panel is reliably created/revealed after createScratch succeeds, and content delivery is not lost to the webview ready-handshake race (extension.ts postMessage swallow at :987-989, scratch-ready generation binding in scratch-panels.ts); (2) render the popup's "New scratchpad" and "Browse all" entries as icon-only rows (SVG icon + title/aria-label, consistent with the icon-only #insrc-scratch button at chat-panel.ts:2865-2867) at the top of the popup instead of text mitem rows at the bottom (chat-panel.ts:2528-2532). Update the chat-panel tests that pin the current text rows.

## Triage rationale

bugfix small: both defects localized inside the shipped scratchpads feature (epic 4642d49ab0593787); 3-4 files in vscode-plugin/src/chat+panels, all reuse of existing paths; no new contract.

## Summary

ISSUE-3183af2a fix shipped @94de6d114 + @c83844958: scratch-new always attempts openDocument (browse-refresh failure no longer skips it; failed open logged), fresh scratch document panels reveal with preserveFocus, the popup's New/Browse entries are icon-only SVG rows in a top-right .scratchacts strip with chatRows descending into it, the scratch factory postMessage logs dropped posts (false delivery / rejection) instead of swallowing them, and tests pin the generation-tagged ready-replay race (pre-ready content replayed exactly once, consumed on duplicate ready). Focused tests 432 pass + tsc clean.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-3183af2a005db14f.json` — **insrc-build** (2026-11-14T12:52:00.130Z)
- `.insrc/artifacts/ISSUE-3183af2a005db14f.log.jsonl` — **insrc-build** (2026-11-14T12:52:00.130Z)
- `docs/standalone/scratchpad-popup-new-scratchpad-does-not-E202611143183af2a/ISSUE.md` — **insrc-build** (2026-11-14T12:52:00.130Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-14T12:52:00.130Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-11-14T12:52:00.130Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-14T12:52:00.130Z)
- `vscode-plugin/src/chat/scratch-host.ts` — **insrc-build** (2026-11-14T12:52:00.130Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-11-14T12:52:00.130Z)
- `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` — **insrc-build** (2026-11-14T12:52:00.130Z)
- `vscode-plugin/src/panels/scratch-panels.ts` — **insrc-build** (2026-11-14T12:52:00.130Z)
- `vscode-plugin/src/panels/types.ts` — **insrc-build** (2026-11-14T12:52:00.130Z)
