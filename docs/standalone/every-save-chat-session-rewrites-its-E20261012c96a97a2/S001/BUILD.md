<!-- insrc:artifact BUILD-c96a97a204fac22b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T09:10:47.854Z  ·  **Updated:** 2026-10-12T09:50:22.245Z

**Commit:** 5ef06e69

## Summary

Three integration tests: the file store over a real temporary directory with two store instances on one session; the chat panel run over the file store; and the start-up sweep keeping the output files of a session the migration left in globalState. Two code review findings were fixed in this task's scope (commit 5ef06e69): a failed whole-file write no longer leaves its temporary file behind, and the head carries every session field except the transcript. Whole plugin suite on 5ef06e69, run by the builder with `npx tsx --test --test-force-exit --test-isolation=none --test-timeout=20000 --test-reporter=tap 'src/**/__tests__/*.test.ts'` in vscode-plugin: 1135 tests, 1129 pass, 4 skipped, 2 fail, the two being the manifest-catalog tests that failed before this Story; the full TAP output is /tmp/insrc-validate-output/plugin-full-suite-5ef06e69.tap. The real migration ran on the user's machine at 15:06 on 2026-10-12 after a reload; the check's script output is /tmp/insrc-validate-output/chat-migration-check.txt. A dry run on a copy of the state beforehand took about 0.75 s, a first read 29 to 45 ms and a save of one row 0.2 to 0.35 ms.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c96a97a204fac22b-S001.json` — **insrc-build** (2026-10-12T09:50:22.245Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-12T09:50:22.245Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-12T09:50:22.245Z)
- `vscode-plugin/src/chat/__tests__/fake-session-fs.ts` — **insrc-build** (2026-10-12T09:50:22.245Z)
- `vscode-plugin/src/chat/__tests__/session-file-store.integration.test.ts` — **insrc-build** (2026-10-12T09:50:22.245Z)
- `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` — **insrc-build** (2026-10-12T09:50:22.245Z)
- `vscode-plugin/src/chat/__tests__/session-store.test.ts` — **insrc-build** (2026-10-12T09:50:22.245Z)
- `vscode-plugin/src/chat/session-file-store.ts` — **insrc-build** (2026-10-12T09:50:22.245Z)
- `vscode-plugin/src/chat/session-store.ts` — **insrc-build** (2026-10-12T09:50:22.245Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-12T09:50:22.245Z)
