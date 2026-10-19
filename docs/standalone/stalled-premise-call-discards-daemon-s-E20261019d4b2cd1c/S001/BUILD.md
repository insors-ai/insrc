<!-- insrc:artifact BUILD-d4b2cd1c2c1ba649-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-19T05:22:15.680Z  ·  **Updated:** 2026-10-19T05:35:21.040Z

**Commit:** 2aaa3221

## Scope

Fix ISSUE-d4b2cd1c: a design review survives a stalled or failed model call. A call that has produced no model output is recognised as stalled well before the 10-minute limit and retried once as a fresh call; premises already judged are kept; a premise whose call still fails after its retry is recorded as not judged (naming the cause), never as a pass, and the rest of the review is stamped; the log names the codex session of every stalled call.

## Triage rationale

bugfix (small): the serial per-premise loop in src/workflow/review/review.ts awaits verifyClaim with no per-claim handling; one CliProvider call killed at its 600,000 ms timeout ends the whole review.

## Summary

Both review paths survive a stalled model call. A codex run that prints no model event within 5 minutes (CODEX_FIRST_OUTPUT_MS) is killed by a stall watchdog in the process runner and raised as CliStallError carrying its codex session id read from the run's own output. Design (HLD/LLD) template reviews: runReviewSession retries a stall once inside the remaining deadline. Premise (DEF/plan) reviews: each judgement also has a 3-minute call limit, a failed call is retried once, and one failing again is recorded as a MED 'not judged' finding with its cause, keeping every other premise. Left out: diagnosing why codex's model goes silent (outside insrc); claude stalls are only caught by the call limit, since claude --print streams nothing to watch.

## Tasks validated

- ✗ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-d4b2cd1c2c1ba649.json` — **insrc-build** (2026-10-19T05:35:21.040Z)
- `docs/standalone/stalled-premise-call-discards-daemon-s-E20261019d4b2cd1c/ISSUE.md` — **insrc-build** (2026-10-19T05:35:21.040Z)
- `src/agent/providers/__tests__/cli-review-session.test.ts` — **insrc-build** (2026-10-19T05:35:21.040Z)
- `src/agent/providers/__tests__/cli-subprocess.test.ts` — **insrc-build** (2026-10-19T05:35:21.040Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-19T05:35:21.040Z)
- `src/shared/process-group.ts` — **insrc-build** (2026-10-19T05:35:21.040Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-19T05:35:21.040Z)
- `src/workflow/review/__tests__/review.test.ts` — **insrc-build** (2026-10-19T05:35:21.040Z)
- `src/workflow/review/review.ts` — **insrc-build** (2026-10-19T05:35:21.040Z)
- `src/workflow/review/verify.ts` — **insrc-build** (2026-10-19T05:35:21.040Z)
