<!-- insrc:artifact BUILD-48ffbec56130edb6-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-06T13:28:10.089Z  ·  **Updated:** 2026-11-06T13:35:13.686Z

**Commit:** 3038b53b8

## Summary

Re-ran the three real-CLI checks on 2026-11-06 and saved their verbatim output in LIVE-CHECKS.md (commit 3038b53b8). Mid-turn EOF: the turn completed at 15.6 s with a matching request id and the process exited 0 at 16.2 s. Stdin left open: the result arrived at 15.8 s and the process was still alive when killed at 75.1 s. Closing at the result with a 20 s background task: the correlated result at 3.5 s, then a second non-correlated result at 25.1 s, exit 0 at 25.7 s, and the background output file was written.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` — **insrc-build** (2026-11-06T13:35:13.686Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-11-06T13:35:13.686Z)
- `docs/standalone/end-correlated-claude-turn-s-stdin-E2026110648ffbec5/S001/LIVE-CHECKS.md` — **insrc-build** (2026-11-06T13:35:13.686Z)
