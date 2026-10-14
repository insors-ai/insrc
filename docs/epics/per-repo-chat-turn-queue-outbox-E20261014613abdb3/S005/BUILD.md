<!-- insrc:artifact BUILD-613abdb351c2c738-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-14T18:51:21.474Z  ·  **Updated:** 2026-10-14T19:07:10.268Z

**Commit:** 405099fc

## Summary

S005 closing (t4). LIVE HAND CHECK: NOT RUN - it needs the installed plugin driven by a person (a review-pane decision while a turn runs, with the chat panel closed, and a window whose queue cannot open), which the build session cannot do; it is reported as 'fail' = unverified, never as a pass. The plugin (0.5.14 vsix, with S005) was built and installed for the check. EVIDENCE (labelled: automated, not the live check): chat-queue-outbox-host.test.ts runs the real chat host, the real worker and a real SQLite queue file over a SCRIPTED fake adapter (not a real provider, not a real webview). It shows: a review-pane decision sent while a turn runs becomes an origin 'review-pane' row in the outbox, leaves the running turn and its waiting approval card alone (no decision sent to the adapter) and runs when the turn ends; with the panel closed submitExternal opens it, saves the chat, queues, and two decisions run in order once the webview is ready; a decision is still in the queue file after the host is disposed; no CLI, blank text, a full queue and a busy queue each return unavailable with their own note and queue nothing; a queued message's attachment stays on its row and is sent in the prompt when it runs. extension.ts imports vscode and cannot run in tests, so the gating (chat command, chat-ready context, chat tab serializer, review host's notifyChat all only with a queue; package.json commandPalette entry when insrc.chat.ready) is pinned by SOURCE-SCAN tests plus a unit test of the vscode-free gating function and the three notices; it has never been exercised in a real extension host. Mutation checks done: removing the draft save, or changing the origin to 'typed', or building the sweep's keep set without the store's sessions, each fails its test. EPIC CONSTRAINTS (scored from code and tests, not a live run): k1 the plugin reaches the daemon only over IPC and never opens its stores - held: this Story adds no reader of the queue files and only the worker writes them (the cross-repository reader the HLD sketched was dropped by owner decision). k2 stakeholder targets - held: a pane decision is an ordinary row in the one per-repository queue, strict order, no interrupt; the lease, retry and 500-record bound rules are untouched and a full queue refuses the decision with its own note. k3 UI follows the VS Code theme in the chat panel's style - held: no new UI; only the pane's result line wording changed. k4 the turn lifecycle stays free of vscode - held: turn-lifecycle.ts is untouched and the new gating function lives in the vscode-free chat-queue-setup.ts. k5 minimum VS Code version and a plain unsupported message - held, and tightened: engines.vscode ^1.141.0 is unchanged, and a window whose queue cannot open now disables the chat with a notice naming the cause (no direct path), where S001 had said messages run as before. CROSSWALK: c3 and c12 -> read:current-behaviour (how a pane decision reaches the chat, recorded before the chat is told, waits its turn); c11 -> read:queue-surface (only the worker writes the queue). DEFERRED HLD ADDITIONS for the Epic-end batch (not filed): from S005 - the HLD's s5 boundary text still describes a cross-repository liveSessionIds keep set and a keep predicate on the session store, both DROPPED by owner decision (hard 200-session cap, the start-up sweep's existing keep set); the HLD/S001 text that the chat stays on a direct path without node:sqlite is replaced by 'the chat is disabled'; submitExternal's result is 'queued' | { kind: 'unavailable', note } with no 'sent'. From S004 - sc1 retryNow; sc4 retry-now action; sc5 outbox-retry-now completion. From S003 - sc1 markNotDeliveredIfHead; sc2 presenceOf, takeOver holderGone and the same-windowKey takeOver rule; the HLD 'flush' wording. KNOWN GAPS: the host's internal no-queue branches (sendTyped's direct runTurn, supersedeQueuedApprovals) are left in place, unreachable from the extension; removing them rewrites hundreds of host tests and is a separate cleanup. A session evicted at the hard 200-session cap loses its waiting message (it fails with 'the chat no longer exists' and can be resent).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✗ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-613abdb351c2c738-s5.json` — **insrc-build** (2026-10-14T19:07:10.268Z)
- `docs/epics/per-repo-chat-turn-queue-outbox-E20261014613abdb3/S005/CR.md` — **insrc-build** (2026-10-14T19:07:10.268Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-14T19:07:10.268Z)
- `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` — **insrc-build** (2026-10-14T19:07:10.268Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-14T19:07:10.268Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` — **insrc-build** (2026-10-14T19:07:10.268Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-setup.test.ts` — **insrc-build** (2026-10-14T19:07:10.268Z)
- `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` — **insrc-build** (2026-10-14T19:07:10.268Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-14T19:07:10.268Z)
- `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` — **insrc-build** (2026-10-14T19:07:10.268Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-14T19:07:10.268Z)
- `vscode-plugin/src/chat/chat-queue-setup.ts` — **insrc-build** (2026-10-14T19:07:10.268Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-14T19:07:10.268Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-14T19:07:10.268Z)
