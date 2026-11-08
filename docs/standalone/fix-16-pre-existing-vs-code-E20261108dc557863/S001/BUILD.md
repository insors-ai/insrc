<!-- insrc:artifact BUILD-dc557863fa52ecf5-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-08T10:28:38.306Z  ·  **Updated:** 2026-11-08T11:53:32.753Z

**Commit:** 8217afd2d

## Summary

The daemon routes approval subscriptions and answers outside the session FIFO. The running daemon reproduced Tracker timing out only while the subscription was open. The regression test checks Tracker reads and approval answers while the subscription remains open. All 41 focused tests and TypeScript passed.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✗ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/panels/__tests__/webview-host.test.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/panels/repo-config.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/panels/types.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/panels/webview-host.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/workspace/__tests__/activation.test.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/chat/approval-subscribe.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/__tests__/activation.test.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/chat/__tests__/exec-path-scan.test.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/panels/__tests__/repo-config.test.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `src/workflow/config/github-names.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `src/shared/__tests__/ipc-client-timeout.test.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `src/shared/ipc-client.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/config/gateway.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/config/types.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `vscode-plugin/src/panels/daemon-gateway.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `src/daemon/threads/__tests__/router-session.test.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-08T11:53:32.753Z)
