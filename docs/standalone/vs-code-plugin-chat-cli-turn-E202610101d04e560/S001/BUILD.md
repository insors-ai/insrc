<!-- insrc:artifact BUILD-1d04e56057b3daba-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-10T17:37:33.094Z  ·  **Updated:** 2026-10-10T18:11:36.248Z

**Commit:** 1383a421

## Summary

extension.ts builds the session output on ~/.insrc/chat-output, passes it to the provider registry, removes an evicted session's files via onEvict and sweeps stale files at start. The plugin's typechecks and full suite (1012 tests, 1007 pass, 4 skipped, 1 known manifest-catalog failure) are recorded in docs/standalone/vs-code-plugin-chat-cli-turn-E202610101d04e560/S001/evidence/t10/.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/standalone/vs-code-plugin-chat-cli-turn-E202610101d04e560/S001/evidence/t10/README.md` — **insrc-build** (2026-10-10T18:11:36.248Z)
- `docs/standalone/vs-code-plugin-chat-cli-turn-E202610101d04e560/S001/evidence/t10/plugin-suite.txt` — **insrc-build** (2026-10-10T18:11:36.248Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-10T18:11:36.248Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-10T18:11:36.248Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-10T18:11:36.248Z)
- `vscode-plugin/src/chat/__tests__/session-lock.test.ts` — **insrc-build** (2026-10-10T18:11:36.248Z)
- `vscode-plugin/src/chat/__tests__/session-output.test.ts` — **insrc-build** (2026-10-10T18:11:36.248Z)
- `vscode-plugin/src/chat/__tests__/session-store.test.ts` — **insrc-build** (2026-10-10T18:11:36.248Z)
- `vscode-plugin/src/chat/async-util.ts` — **insrc-build** (2026-10-10T18:11:36.248Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-10T18:11:36.248Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-10T18:11:36.248Z)
- `vscode-plugin/src/chat/session-lock.ts` — **insrc-build** (2026-10-10T18:11:36.248Z)
- `vscode-plugin/src/chat/session-output.ts` — **insrc-build** (2026-10-10T18:11:36.248Z)
- `vscode-plugin/src/chat/session-store.ts` — **insrc-build** (2026-10-10T18:11:36.248Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-10T18:11:36.248Z)
