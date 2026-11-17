<!-- insrc:artifact BUILD-cf6cdc5c2154fc27-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-17T17:22:35.440Z  ·  **Updated:** 2026-11-17T19:14:35.109Z

**Commit:** a4ac9f749

## Scope

Bug: the VS Code plugin (vscode-plugin/) fails to build. Three files under vscode-plugin/src/chat/ import `ReviewWorkerStatus`, `isReviewWorkerStatus`, and `reviewProgressLabel` from `'../../../src/shared/review-worker-progress.js'` (vscode-plugin/src/chat/docs-review-panel.ts:1, vscode-plugin/src/chat/protocol.ts:158,176, and vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts:4-5) — but that backend module was deleted during the automated-review removal work. The equivalent exports now live at src/workflow/review-history/shared/worker-progress.ts (same symbol names). Fix: repoint all 5 import sites in vscode-plugin/src/chat/ from the deleted path to the relocated module's path '../../../src/workflow/review-history/shared/worker-progress.js' (adjusting the relative prefix for the deeper test-file location). No change to exported symbols' shape or the backend module itself. See ISSUE-cf6cdc5c2154fc27 for the full record.

## Triage rationale

A pure mechanical import-path fix confirmed against the real graph: exactly 5 import sites across 3 files reference the deleted module, and the replacement module exports the identical 3 symbol names with matching signatures. No symbol renames, no shape changes, no new contract.

## Summary

Repointed 5 import sites in vscode-plugin/src/chat/ (docs-review-panel.ts, protocol.ts x2, review-worker-progress.test.ts x2) from the deleted src/shared/review-worker-progress.js to its relocated path src/workflow/review-history/shared/worker-progress.js. No symbol/shape changes. Verified: vscode-plugin build (bundle+typecheck) is clean; review-worker-progress.test.ts and protocol.test.ts pass fully; docs-review-panel.test.ts passes 237/238 sub-tests (the 1 file-level marker is the repo's known dangling-promise-at-exit quirk, not an assertion failure).

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.
