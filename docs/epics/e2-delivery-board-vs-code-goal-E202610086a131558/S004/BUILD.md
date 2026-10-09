<!-- insrc:artifact BUILD-6a1315585c38c41c-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-09T09:57:32.537Z  ·  **Updated:** 2026-10-09T12:04:52.965Z

**Commit:** 99a59377

## Summary

t6 done (commit f191c154).

**board-wiring.ts:** DeliveryBoardWiringDeps gains reviewPane?, typed as DeliveryBoardHostDeps['reviewPane']. registerDeliveryBoard passes it to createDeliveryBoardHost.

**extension.ts:**
- `let docsReviewHost: DocsReviewHost | undefined;` is declared before the `if (chatEnabled)` gate.
- Inside the gate, the pane is created as `reviewHost`. The insrc.chat.docsReview command still opens it, and `docsReviewHost = reviewHost` is assigned there.
- After the gate, registerDeliveryBoard receives `reviewPane: docsReviewHost`.

**Tests:**
- New: board-wiring.test.ts, 'the board receives the review pane when the chat setting creates one, and reads evidence itself when it does not'. It checks the declaration, assignment and call placement in extension.ts against the chat-gate span. It also runs the registered command over a fake panel and rpc, posting select-item then open-evidence for a review-view LLD:
  - With a pane: the pane gets {artifactId, mdPath} and the board makes no evidence rpc.
  - Without one: the board calls workflow.deliveryEvidence {repo, artifactId} and shows the record as openedRecord.
- The existing chat wiring tests (extension-chat-wiring, group-lock, packaging) pass, 44/44 together with the wiring file.
- Plugin suite: 889 pass, plus the known manifest-catalog failure.
- All typechecks are clean, including the strict test check.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

## Changes

- `.insrc/artifacts/BUILD-2f07f59c76f70149-S001.json` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `.insrc/artifacts/CR-2f07f59c76f70149-S001.json` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `.insrc/artifacts/ISSUE-2f07f59c76f70149.json` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `.insrc/build-start/2f07f59c76f70149-S001.json` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `docs/standalone/bug-test-t1-no-file-under-E202610092f07f59c/ISSUE.md` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `docs/standalone/bug-test-t1-no-file-under-E202610092f07f59c/S001/BUILD.md` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `docs/standalone/bug-test-t1-no-file-under-E202610092f07f59c/S001/CR.md` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/delivery/__tests__/board-details.test.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/delivery/__tests__/board-fixtures.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/delivery/__tests__/board-host.test.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/delivery/__tests__/board-wiring.test.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/delivery/__tests__/details-memory.test.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/delivery/board-details.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/delivery/board-host.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/delivery/board-protocol.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/delivery/board-wiring.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/delivery/delivery-contract.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/delivery/details-memory.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-09T12:04:52.965Z)
