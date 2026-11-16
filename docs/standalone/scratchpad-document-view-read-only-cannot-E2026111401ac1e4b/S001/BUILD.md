<!-- insrc:artifact BUILD-01ac1e4b6a6c9c2f-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-15T05:06:15.905Z  ·  **Updated:** 2026-11-15T07:56:54.770Z

**Commit:** 81f96b057

## Summary

t4 landed in 81f96b057: createScratchHost gains onDocMessage with a 'scratch-save' case (validates string id/text + finite numeric gen, warns+drops malformed), persists via store.updateScratch, answers through panels.replySaved(gen, {scratch-saved, id, gen, ok}) with the same gen, refreshes browse + re-pushes the chat scratch-list on both success and failure (ok:false + error + warn on store failure); 'scratch-dirty' validated and accepted without persisting. extension.ts wires onScratchSave/onScratchDirty to scratchHost.onDocMessage exactly like onSendToChat (document-channel messages bypass the chat SCRATCH_INTENT_TYPES interception). New scratch-host.test.ts drives ok/failure/malformed over fakes; extension-chat-wiring.test.ts regex-pins the textarea, save button, protocol strings, replySaved, selectionStart and the onScratchSave wiring. 130/130 tests pass across the five scratch-related files; tsc clean.

## Tasks validated

- ✗ `t1`
- ✓ `t2`
- ✗ `t3`
- ✗ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/fake-scratch-fs.ts` — **insrc-build** (2026-11-15T07:56:54.770Z)
- `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` — **insrc-build** (2026-11-15T07:56:54.770Z)
- `vscode-plugin/src/chat/scratch-store.ts` — **insrc-build** (2026-11-15T07:56:54.770Z)
- `docs/standalone/scratchpad-document-view-read-only-cannot-E2026111401ac1e4b/ISSUE.md` — **insrc-build** (2026-11-15T07:56:54.770Z)
- `docs/standalone/scratchpad-document-view-read-only-cannot-E2026111401ac1e4b/S001/LLD-SELF-REVIEW.md` — **insrc-build** (2026-11-15T07:56:54.770Z)
- `docs/standalone/scratchpad-document-view-read-only-cannot-E2026111401ac1e4b/S001/sequence-diagram.html` — **insrc-build** (2026-11-15T07:56:54.770Z)
- `docs/standalone/scratchpad-document-view-read-only-cannot-E2026111401ac1e4b/S001/ux-mock.html` — **insrc-build** (2026-11-15T07:56:54.770Z)
- `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` — **insrc-build** (2026-11-15T07:56:54.770Z)
- `vscode-plugin/src/panels/scratch-panels.ts` — **insrc-build** (2026-11-15T07:56:54.770Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-11-15T07:56:54.770Z)
- `vscode-plugin/src/chat/__tests__/scratch-host.test.ts` — **insrc-build** (2026-11-15T07:56:54.770Z)
- `vscode-plugin/src/chat/scratch-host.ts` — **insrc-build** (2026-11-15T07:56:54.770Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-11-15T07:56:54.770Z)
