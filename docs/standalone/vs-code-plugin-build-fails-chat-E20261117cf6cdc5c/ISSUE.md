<!-- insrc:artifact ISSUE-cf6cdc5c2154fc27 -->

# VS Code plugin build fails: chat imports reference the deleted review-worker-progress module

## Reproduction

1. In vscode-plugin/, run `npm run build` (or `tsc -p tsconfig.json` directly). Observed: TypeScript fails with `error TS2307: Cannot find module '../../../src/shared/review-worker-progress.js' or its corresponding type declarations.` at vscode-plugin/src/chat/docs-review-panel.ts:1, vscode-plugin/src/chat/protocol.ts:158, and vscode-plugin/src/chat/protocol.ts:176 (the same stale path is also imported in vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts:4-5). Expected: the build completes cleanly.

## Root cause

Three production files and one test file under vscode-plugin/src/chat/ import `ReviewWorkerStatus`, `isReviewWorkerStatus`, and `reviewProgressLabel` from the relative path `../../../src/shared/review-worker-progress.js` (5 import sites total: docs-review-panel.ts:1, protocol.ts:158, protocol.ts:176, and the test file's lines 4 and 5). That backend module `src/shared/review-worker-progress.ts` no longer exists in the repo — it was deleted as part of the automated-review removal work. The equivalent exports (ReviewWorkerStatus, isReviewWorkerStatus, reviewProgressLabel, with identical names and signatures) now live at src/workflow/review-history/shared/worker-progress.ts:19-36, but none of the vscode-plugin import sites were ever updated to the new path, so every one of them fails to resolve.

## Fix intent

Repoint all 5 import sites in vscode-plugin/src/chat/ (docs-review-panel.ts, protocol.ts, and the test file) from the deleted path `../../../src/shared/review-worker-progress.js` to the relocated module's actual path `../../../src/workflow/review-history/shared/worker-progress.js` (adjusting the relative prefix for the deeper test-file location). No change to the exported symbols' names, shapes, or to the backend module itself — purely an import-path correction so the existing code compiles again.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:1` — "import { reviewProgressLabel } from '../../../src/shared/review-worker-progress.js';"
- **[[c2]]** `code` `vscode-plugin/src/chat/protocol.ts:158`
- **[[c3]]** `code` `vscode-plugin/src/chat/protocol.ts:176`
- **[[c4]]** `code` `vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts:4`
- **[[c5]]** `code` `vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts:5`
- **[[c6]]** `code` `src/workflow/review-history/shared/worker-progress.ts:19-36`
