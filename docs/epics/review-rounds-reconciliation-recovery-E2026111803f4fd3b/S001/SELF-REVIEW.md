# S1 manual self-review

Reviewed 2026-11-19 by the implementation author (controller). Automated design/code review is retired and unavailable (CLAUDE.md); this is the substitute self-check evidence, with the explicit limitation that author and reviewer are the same party.

**Result: both Tasks (t1, t2) pass the daemon's build-validation gate. No remaining blocking finding identified within s1's scope.** This report does not constitute an independent daemon review.

## Scope

s1 adds the one shared round-driver (HLD sc1): `ReviewKind`, `RoundDriverHooks`, `RoundResult` (`src/workflow/review-round/types.ts`), and `runReviewRound` (`src/workflow/review-round/driver.ts`), plus a 14-case unit suite (`src/workflow/review-round/__tests__/driver.test.ts`). New code only — no existing file was modified.

| File | Lines | Purpose |
| --- | --- | --- |
| `src/workflow/review-round/types.ts` | 31 | `ReviewKind`, `RoundDriverHooks<F>`, `RoundResult<F>` |
| `src/workflow/review-round/driver.ts` | 53 | `runReviewRound` — one process per round (Initial Review and Correction-and-Re-review share the identical code path) |
| `src/workflow/review-round/__tests__/driver.test.ts` | 205 | the full named test suite, one `it()` per `testStrategy.testLevels[0].subjects` |

## Gate rounds and fixes

The daemon's `insrc_build_step` validate gate judges by evidence against real source and test runs, not self-report. It rejected the submission three times before passing; each rejection named a genuine gap, which was fixed for real rather than reworded:

1. **t1, round 1** — `runReviewRound` was `async`, so an invalid round's `RangeError` surfaced as a rejected Promise instead of throwing synchronously (contract: "an invalid round must throw synchronously, before the caller even receives a Promise"). Fixed by splitting into a non-async entry point that validates and throws synchronously, delegating to an async `runRound` helper. Also: ac1's test only destructured `hooks.ground`'s declared parameters, so a hidden third argument would have passed undetected — fixed by capturing `args.length` via a rest-args spy.
2. **t2, round 1** — two findings on the full 14-test suite:
   - the "unmodified targets" test compared the captured reference against itself (same mutable object), so in-place stripping would still have passed. Fixed with `Object.freeze()` on the input plus a `structuredClone()` snapshot taken *before* the call, asserted via `deepEqual` after — proving content fidelity against an independent copy, not reference identity.
   - the reviewId test asserted only that a caller-local `const` string stayed unchanged (meaningless — JS strings are immutable) and never inspected `hooks.security`'s own arguments. Fixed by capturing `hooks.security`'s argument count the same way the existing `spyGround` helper does for `hooks.ground`.
3. **t2, round 2** — the reviewId test still only checked argument *counts*, not actual values, so a substituted `targets`/`round` would still have passed; and the invalid-round tests never asserted a supplied `hooks.security` is skipped too. Fixed by asserting the actual captured `[targets, round]` tuples via `deepEqual`, and extending the three invalid-round tests to also assert `securityCalls === 0`.
4. **t2, round 3 — wording defect, not a code gap.** The gate kept reading `testStrategy` subject #14's title ("reviewId is passed unchanged into hooks.ground/hooks.security's own arguments...") as requiring reviewId to be *forwarded* into the hooks' own arguments. That contradicts the approved contract: HLD sc1's `RoundDriverHooks` and this Story's own `ground(targets, round)` signature carry no `reviewId` parameter, and `driver.ts`'s own doc comment says reviewId is deliberately `void`'d so it stays free for the caller to thread onto the sc4/sc5 calls instead. Rather than writing a test that asserts the opposite of the approved design, the ambiguous title itself was clarified — with the user's explicit approval — in `LLD-03f4fd3b9102aab8-s1` (rev2→3), and the identical wording propagated to the already-approved `PLAN-03f4fd3b9102aab8-s1` (rev1→2) and `TASK-03f4fd3b9102aab8-s1-t2` (rev1→2), since the gate validates a submitted test name against the Task's own stored name, not the LLD. No behavior, task scope, or acceptance criterion changed — only the English wording of one named-test title, applied identically to the LLD, PLAN, TASK, and the matching `it()` title. All three hand-edits were self-stamped approved with an override reason (automated design review unavailable); the user approved the fix explicitly in chat before it was made.

## Source review

| Area inspected | Invariant and assessment |
| --- | --- |
| `types.ts` | `RoundDriverHooks<F>` matches HLD sc1 (`reviewKind`, `checkpointGranularity`) plus this Story's own `ground`/optional `security` hooks; `F` is left generic so this Story does not own `Finding`'s shape (s2's contract). `RoundResult<F>` merges any nested security findings into one array — never a separate channel, never a third `reviewKind`. |
| `driver.ts` | `runReviewRound` is a plain (non-async) function so round validation throws synchronously before any Promise is returned; it delegates to an async `runRound` for the actual hook calls. `reviewId` is accepted and `void`'d — read by nothing in this function, left unchanged for the caller. `opts.runSecurityPass` defaults to running `hooks.security` when supplied; `false` or an absent `hooks.security` skips it as a no-op, never a thrown error. A rejecting `hooks.ground` propagates without calling `hooks.security`; a rejecting `hooks.security` propagates rather than silently returning `hooks.ground`'s findings. |
| `__tests__/driver.test.ts` | All 14 named subjects exist as individual `it()` cases with matching titles; ac1/ac2/ac3's `provingTests` pass. Argument-count and actual-argument-value assertions (via rest-args spies and `deepEqual` against captured `[targets, round]` tuples) prove no hidden third argument and no value substitution, for both `hooks.ground` and `hooks.security`, across round 1, round 2, and round 50. The "unmodified targets" case uses a frozen input plus a pre-call `structuredClone` snapshot, so in-place mutation would throw and content drift would fail the comparison. |

## Verification

- `npx tsc --noEmit`: clean, 0 errors.
- `npx tsx --test 'src/workflow/review-round/**/*.test.ts'`: **14 passed, 0 failed, 0 skipped, 0 cancelled.**
- `npx tsx --test 'src/workflow/review-round/**/*.test.ts' 'src/workflow/artifact-core/__tests__/*.test.ts'` (broader sweep): **177 passed, 0 failed.**
- `insrc_build_step` (phase=validate): t1 passed after 1 gate round of real fixes; t2 passed after 3 gate rounds (2 real test-adequacy fixes, 1 wording-only LLD/PLAN/TASK clarification) — final verdict `passed: true` for both Tasks, with `typecheckClean: true` and `testsPassed: true`.

## Limits and continuation

This is a manual self-review substituting for the retired automated design/code review; author and reviewer are the same party. No independent party inspected this diff. The build-validation gate's own repeated (and ultimately evidence-grounded) rejections across 4 rounds are the closest available substitute for adversarial review in this session, and are recorded above rather than omitted.

s1 is Phase A of the Epic (the shared round-driver only); wiring this driver into `insrc_review_step`/`insrc_code_review_step` is explicitly deferred (Epic Non-Goals). s2 (finding taxonomy/severity), s3 (reconciliation), s4 (review-report docgen), and s5 (checkpoint + `.insrc/tmp/<reviewId>/` lifecycle) are not yet built.
