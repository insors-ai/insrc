<!-- insrc:artifact BUILD-1f74c81f507dbe78-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T16:14:59.110Z  ·  **Updated:** 2026-10-13T16:16:02.329Z

**Commit:** 727006f3

## Summary

DocsArtifactSummary (protocol.ts) gains optional openQuestions and workItemId. The client maps them from the daemon's pending artifact: openQuestionCount when it is a number (0 included), workItemId when it is a non-empty string; otherwise the key is absent. The host already forwards the summaries unchanged; a test now pins that. The existing client test that deep-equals the mapped list was updated to expect the count its fixture carries.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/media/insrc-review-icon-dark.svg` — **insrc-build** (2026-10-13T16:16:02.329Z)
- `vscode-plugin/media/insrc-review-icon.svg` — **insrc-build** (2026-10-13T16:16:02.329Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-13T16:16:02.329Z)
- `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — **insrc-build** (2026-10-13T16:16:02.329Z)
- `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` — **insrc-build** (2026-10-13T16:16:02.329Z)
- `vscode-plugin/src/chat/__tests__/review-icon.test.ts` — **insrc-build** (2026-10-13T16:16:02.329Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-10-13T16:16:02.329Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T16:16:02.329Z)
