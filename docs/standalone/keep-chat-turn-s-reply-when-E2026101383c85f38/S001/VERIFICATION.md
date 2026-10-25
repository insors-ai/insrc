# ISSUE-83c85f38afad7843 verification

The original adapter stopped on an earlier empty result, producing no assistant text. The deterministic regression failed before the change and passes with UUID correlation.

- Affected adapter, retained-output, UTF-8, lifecycle and queue suites: **150 passed**, no failures/skips.
- Full plugin suite: **1,430 passed, 7 failed, 8 skipped**. All seven failures reproduce on baseline commit `3752402643a200109864ca67b5281f7d3c7ce613`: three approval subscription ownership mocks, two missing-ledger-fixture checks, and two manifest/catalog checks. These files are outside this fix; the full suite is not green.
- Plugin TypeScript check passed. A prior check run concurrently with the full suite saw a temporary negative-typecheck probe created by that suite; the check after suite cleanup passes.
- Installed Claude 2.1.310: actual adapter returned ACK on a new turn and ACK2 on a resumed turn in the same native session, with matching request UUIDs. Tools/MCP were disabled; calls ran serially with bounded cleanup. The [reproducible harness](native-smoke.ts) uses a 60,000 ms timeout per turn and records confirmed process exits/signals and cleanup timestamps in [native evidence](adapter-native-smoke.json).
- Installed Codex 0.164.0: exec help plus native fixtures establish its one-prompt exec transport. A regression preserves item output and ends at turn.completed while the process stays alive. No live Codex model call was made.

Legacy reloads reconstruct result state from the retained prefix without re-emitting content. New correlated reloads also recover a result checkpointed immediately before reload. Stdin writes may return a promise so asynchronous input failures surface; permission decisions catch write failures without throwing into the UI.

No daemon restart or extension installation was performed. Source commits carry `Insrc-Story: 83c85f38afad7843/s1`. See [machine-readable verification](verification.json) for baseline failure names and counts.
