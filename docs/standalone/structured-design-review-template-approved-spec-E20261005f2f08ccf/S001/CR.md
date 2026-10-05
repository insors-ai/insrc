<!-- insrc:artifact CR-f2f08ccf89f8ab25-S001 -->

# Code review: f2f08ccf89f8ab25:S001

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 8 · model `claude:opus`

**Changed files:** 28

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/review/template.ts:181 | buildTemplateReviewPrompt orders the reviewer prompt as instructions (system) -> checklist/template -> design. The approved order is template first, then the instructions, then the design last. The design is still last, but the template and the instructions are swapped (the function's own doc comment states 'the instructions come first, then the template'). The validation-repeat prompt in template-review.ts inherits the same order (`${system}\n\n${correction}\n\n${user}`). |
| LOW | src/agent/providers/cli-provider.ts:358 | The 'at most one transient retry' budget is scoped to a single runReviewSession call (attempt counter local to the call), and runTemplateReview's `ask` invokes runReviewSession afresh for the validation repeat. A single design review can therefore retry a transient CLI error twice (once in the first session, once in the validation repeat) — up to four CLI runs — rather than at most once for the review. All runs do stay inside the single shared deadline, so the time bound is honoured; only the retry count departs. |

## conventions — 0 finding(s)

_No findings._

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/agent/providers/__tests__/cli-review-session.live.test.ts:41 | Present but unverified. T14 exists for both claude and codex (reads a file, calls insrc analyze, cannot write, schema-checked answer), but it is gated behind INSRC_LIVE_TESTS=1 and skips in the default sweep, so a green suite does not show it ran. The only evidence of a run is prose in BUILD.md (live on 2026-10-05, 14 s and 42 s); no build-record signal was supplied to this review and I could not run it. |
| LOW | src/agent/providers/__tests__/cli-review-session.live.test.ts:41 | Present only as a one-off recorded run, not as a separate repeatable test. The promised CLI probe has no test of its own; the T14 live test carries the same four assertions, and BUILD.md records the probe outcome (both CLIs answered in one run). Pass-state is unverified by this review. |
| LOW | src/workflow/review/__tests__/template-review.test.ts:268 | Present only as a recorded manual run, not as an automated test. The smoke of two real design reviews is recorded in BUILD.md (ISSUE design 153 s against a 4 minute limit, SPEC design 166 s against a 6 minute limit). The nearest automated tests (lines 268 and 293) use a fake provider and assert template and limit selection only, so the real timings cannot be re-checked from the suite. |
| LOW | src/workflow/review/__tests__/template-review.test.ts:86 | All 19 promised unit and integration tests are present by title in the changed test files (T1–T13, T15–T17, the session-arguments and same-arguments tests in cli-review-session.test.ts, and the `findings` phase entry at schema-registry.test.ts:48). Their pass-state is unverified: no build-record signal was supplied, and my attempt to run the seven non-live files was blocked by the permission mode. BUILD.md claims no failures, which I did not confirm. The empty `testsReaching` edges across the changed symbols are not reported as gaps: the test files import the production modules directly (`../index.js`, `../template.js`, `../cli-provider.js`, `../../gates.js`), so the graph has simply not linked the just-created test files. |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/mcp/review-step/phases/findings.ts:107 | Duplication: `stripReviewSection` (and the `REVIEW_SECTION` marker it depends on) is a byte-identical copy of the helper in `src/workflow/review/run-artifact.ts:57`, and a third identical private copy sits in `phases/verdicts.ts:113`. The doc comment itself says "Mirrors run-artifact.ts". This Story exported the findings.ts copy so `phases/start.ts` could import it, which was the moment to single-source it instead. If the marker or the trimming rule changes in one copy, re-runs will stack review sections or the start phase will hand the reviewer a design that still contains the previous review. Export one helper from `workflow/review` and import it at all three sites. |
| MED | src/workflow/review/template-review.ts:77 | Unhandled cancellation path: `opts.signal` is only checked before a session starts. It is not passed to `runReviewSession` (whose `ReviewSessionOpts` carries only `cwd` and `deadlineMs`), and it is not re-checked after `ask` returns. An abort raised during a reviewer session therefore leaves the CLI subprocess running until the review deadline, and if that session answers validly the function still returns a report, which the caller then stamps onto the artifact as if the review had not been cancelled. Re-check the signal after each `ask`, and ideally let the session kill its subprocess on abort. |
| LOW | src/agent/providers/cli-provider.ts:366 | Correctness risk from string coupling: a timeout is recognised by matching `/exited with -9\b/` against the error text that `runClaude` / `runCodex` build from `spawnOnce`'s `exitCode: -9` sentinel. A wording change in either runner's error message would silently turn a deadline kill into a generic error, so the caller's "passed its time limit" path would never fire. Carrying the timed-out fact as a typed field or error class out of the subprocess runner would remove the dependency on message text. |
| LOW | src/agent/providers/cli-provider.ts:367 | Avoidable second retry loop: `runReviewSession` hand-rolls its own transient-retry loop next to `withTransientRetry`, using the same `isTransientCliError` classification but with no backoff. The divergence is deliberate and documented (one retry, bounded by the remaining deadline), but the immediate retry means a rate-limit or 5xx transient is re-attempted with no delay and will most likely fail the same way. A short backoff capped by the remaining time, or a deadline-aware option on `withTransientRetry`, would keep one retry policy. |

