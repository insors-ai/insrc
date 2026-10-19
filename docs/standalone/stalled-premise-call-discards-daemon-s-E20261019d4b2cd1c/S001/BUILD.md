<!-- insrc:artifact BUILD-d4b2cd1c2c1ba649-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-19T05:22:15.680Z  ·  **Updated:** 2026-10-19T05:53:32.259Z

**Commit:** 9f0d2bfe

## Scope

Fix ISSUE-d4b2cd1c: a design review survives a stalled or failed model call. A call that has produced no model output is recognised as stalled well before the 10-minute limit and retried once as a fresh call; premises already judged are kept; a premise whose call still fails after its retry is recorded as not judged (naming the cause), never as a pass, and the rest of the review is stamped; the log names the codex session of every stalled call.

## Triage rationale

bugfix (small): the serial per-premise loop in src/workflow/review/review.ts awaits verifyClaim with no per-claim handling; one CliProvider call killed at its 600,000 ms timeout ends the whole review.

## Summary

Both review paths survive a stalled model call; nothing outside review calls changes. Premise reviews (DEF/plan): each judgement has a 3-minute call limit (optional StructuredCompletionOpts.timeoutMs, honoured by CliProvider structured calls only when a caller passes it), a failed or stalled call is retried once as a fresh call, and one failing again becomes a MED 'not judged' finding with its cause and codex session, keeping every other premise. Template reviews (HLD/LLD): runReviewSession alone runs with a first-output watchdog (5 min) that kills a codex run showing no model event and raises CliStallError with the session id read from the run's own output; the stall is retried once inside the remaining deadline. Deliberate, unchanged behaviours: transient CLI errors keep their existing up-to-3 attempts inside one call (a stall or timeout is never transient, so it is not multiplied); a template review is ONE answer, so one stalled twice fails with the cause named rather than inventing a partial report; the premise path is caught by its 3-minute limit before the 5-minute watchdog would fire, which is why the watchdog is not applied there. Left out: why codex's model goes silent (outside insrc); claude --print streams nothing to watch, so a claude stall is caught only by the call limit.

## Tasks validated

- ✗ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-d4b2cd1c2c1ba649.json` — **insrc-build** (2026-10-19T05:53:32.259Z)
- `docs/standalone/stalled-premise-call-discards-daemon-s-E20261019d4b2cd1c/ISSUE.md` — **insrc-build** (2026-10-19T05:53:32.259Z)
- `src/agent/providers/__tests__/cli-review-session.test.ts` — **insrc-build** (2026-10-19T05:53:32.259Z)
- `src/agent/providers/__tests__/cli-subprocess.test.ts` — **insrc-build** (2026-10-19T05:53:32.259Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-19T05:53:32.259Z)
- `src/shared/process-group.ts` — **insrc-build** (2026-10-19T05:53:32.259Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-19T05:53:32.259Z)
- `src/workflow/review/__tests__/review.test.ts` — **insrc-build** (2026-10-19T05:53:32.259Z)
- `src/workflow/review/review.ts` — **insrc-build** (2026-10-19T05:53:32.259Z)
- `src/workflow/review/verify.ts` — **insrc-build** (2026-10-19T05:53:32.259Z)
