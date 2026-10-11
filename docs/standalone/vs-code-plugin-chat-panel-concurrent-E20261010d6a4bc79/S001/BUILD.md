<!-- insrc:artifact BUILD-d6a4bc79bece9d1f-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-10T15:41:15.706Z  ·  **Updated:** 2026-10-10T16:38:46.117Z

**Commit:** 4bc44744

## Summary

package.json declares insrc.chat.turnLockTimeoutMs (number, default 600000, minimum 1000); extension.ts passes createFileSessionLocks on ~/.insrc/chat-locks and a live read of the setting into createChatPanelHost. The plugin's typechecks and full suite (984 tests, 979 pass, 4 skipped, 1 known manifest-catalog failure) are recorded in docs/standalone/vs-code-plugin-chat-panel-concurrent-E20261010d6a4bc79/S001/evidence/t6/, since the gate's root typecheck excludes vscode-plugin.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/standalone/vs-code-plugin-chat-panel-concurrent-E20261010d6a4bc79/S001/evidence/code-review/README.md` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `docs/standalone/vs-code-plugin-chat-panel-concurrent-E20261010d6a4bc79/S001/evidence/code-review/plugin-suite.txt` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `docs/standalone/vs-code-plugin-chat-panel-concurrent-E20261010d6a4bc79/S001/evidence/t6/README.md` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `docs/standalone/vs-code-plugin-chat-panel-concurrent-E20261010d6a4bc79/S001/evidence/t6/plugin-suite.txt` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `vscode-plugin/src/chat/__tests__/fixtures.ts` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `vscode-plugin/src/chat/__tests__/markers.test.ts` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `vscode-plugin/src/chat/__tests__/session-lock.test.ts` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `vscode-plugin/src/chat/markers.ts` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `vscode-plugin/src/chat/session-lock.ts` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `vscode-plugin/src/chat/stream-events.ts` — **insrc-build** (2026-10-10T16:38:46.117Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-10T16:38:46.117Z)
