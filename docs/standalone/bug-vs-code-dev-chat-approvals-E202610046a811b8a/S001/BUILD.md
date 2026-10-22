<!-- insrc:artifact BUILD-6a811b8acca60ac5-s1 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T05:58:45.405Z  ·  **Updated:** 2026-10-12T06:57:09.310Z

**Commit:** 01ca9641

## Summary

The approval card shows '1 of N' beside its title when more requests are waiting behind it, and is unchanged otherwise. The registry keeps shown cards by requestId so the webview's approval-position handler updates the label in place; an unknown id is ignored. The card's meta carries position/total. postInitialState re-posts the queue head once, after session-restored, so a reloaded webview can still answer the queue. The protocol message itself landed in t3. Re-validated after ISSUE-7ba8cf15 fixed the gate's cut-off test report.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-7ba8cf154db36204-s1.json` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `.insrc/artifacts/CR-6a811b8acca60ac5-s1.json` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `.insrc/artifacts/CR-7ba8cf154db36204-s1.json` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `.insrc/artifacts/ISSUE-7ba8cf154db36204.json` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `.insrc/artifacts/PLAN-6a811b8acca60ac5-s1.json` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `.insrc/artifacts/TESTS-7ba8cf154db36204-s1.json` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `.insrc/build-start/7ba8cf154db36204-S001.json` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `docs/standalone/bug-vs-code-dev-chat-approvals-E202610046a811b8a/S001/CR.md` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `docs/standalone/build-gate-s-test-report-cut-E202610127ba8cf15/ISSUE.md` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `docs/standalone/build-gate-s-test-report-cut-E202610127ba8cf15/S001/BUILD.md` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `docs/standalone/build-gate-s-test-report-cut-E202610127ba8cf15/S001/CR.md` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `docs/standalone/build-gate-s-test-report-cut-E202610127ba8cf15/S001/TESTS.md` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `src/mcp/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `src/mcp/build-step/__tests__/validation-checks.test.ts` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `src/mcp/build-step/validation-checks.ts` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `vscode-plugin/src/chat/__tests__/render-registry.test.ts` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `vscode-plugin/src/chat/approval-queue.ts` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-10-12T06:57:09.310Z)
- `vscode-plugin/src/chat/stream-events.ts` — **insrc-build** (2026-10-12T06:57:09.310Z)
