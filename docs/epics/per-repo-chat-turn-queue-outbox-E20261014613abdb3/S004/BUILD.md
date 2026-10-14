<!-- insrc:artifact BUILD-613abdb351c2c738-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-14T17:28:09.450Z  ·  **Updated:** 2026-10-14T18:15:05.939Z

**Commit:** af771a88

## Summary

S004 closing (t8). LIVE HAND CHECK: NOT RUN - no real provider failure could be produced from the build session (it needs the updated plugin installed and a real overload or rate limit from claude or codex), so it is reported as 'fail' = unverified, never as a pass. FAULT-INJECTION EVIDENCE (labelled as such; not the live check): vscode-plugin/src/chat/__tests__/chat-queue-fault-injection.test.ts runs the REAL claude adapter over a scripted fake CLI that prints an is_error overload result, through the real chat host, worker and SQLite queue. It shows: an overload before any tool call is held as retrying (attempts 1, error kept) and not run again before due; when due it runs again and ends done with ONE user row and the stored line 'the turn failed with overloaded; retrying (attempt 1 of 3)'; retry-now runs a retrying row at once; an overload after an Edit tool call ends failed with attempts 0 and is never run again (mutation check: clearing the acted flag makes this test fail). CLASSIFIER vs LOGGED TEXTS: no real failure text has been logged yet (the '[chat-queue] message ... failed: cause ...' line is new in this Story and ~/.insrc/logs holds none), so no comparison with real text was possible; the only texts checked are the seeded and injected ones ('API Error: 529 overloaded_error' classifies overloaded). Any miss against a real provider is unknown until the live check logs one; an unmatched text is 'other' and never retried, so a miss costs a resend, not a repeat. EPIC CONSTRAINTS (scored from the code, not a live run): k1 accuracy over cost - a turn that acted is never retried and unmatched text is never retried: held. k2 no direct cloud REST - only CLI text is classified: held. k3 no Promise.all on LLM providers - none added: held. k4 stored transcript shape unchanged - retry and sign-in lines are ordinary assistant rows, skipUserRow keeps one user row: held. k5 queue writes only through ChatQueueStore - finish and retryNow; the worker only retries them: held. CROSSWALK: c11 and c12 -> read:store-retry-surface; c13 and c3 -> read:worker-and-outbox. DEFERRED HLD ADDITIONS for the Epic-end batch (not filed): sc1 retryNow; sc4 retry-now action; sc5 outbox-retry-now completion; S003's markNotDeliveredIfHead, presenceOf, takeOver holderGone and the same-windowKey takeOver rule. KNOWN GAP: the countdown and retry-now button are covered by a stub-DOM shell test only, never seen in a real webview.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✗ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-613abdb351c2c738-s4.json` — **insrc-build** (2026-10-14T18:15:05.939Z)
- `vscode-plugin/src/chat/__tests__/chat-failure.test.ts` — **insrc-build** (2026-10-14T18:15:05.939Z)
- `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` — **insrc-build** (2026-10-14T18:15:05.939Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-fault-injection.test.ts` — **insrc-build** (2026-10-14T18:15:05.939Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` — **insrc-build** (2026-10-14T18:15:05.939Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` — **insrc-build** (2026-10-14T18:15:05.939Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` — **insrc-build** (2026-10-14T18:15:05.939Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-10-14T18:15:05.939Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-14T18:15:05.939Z)
- `vscode-plugin/src/chat/chat-failure.ts` — **insrc-build** (2026-10-14T18:15:05.939Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-14T18:15:05.939Z)
- `vscode-plugin/src/chat/chat-queue-store.ts` — **insrc-build** (2026-10-14T18:15:05.939Z)
- `vscode-plugin/src/chat/chat-queue-worker.ts` — **insrc-build** (2026-10-14T18:15:05.939Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-14T18:15:05.939Z)
- `vscode-plugin/src/chat/stream-events.ts` — **insrc-build** (2026-10-14T18:15:05.939Z)
