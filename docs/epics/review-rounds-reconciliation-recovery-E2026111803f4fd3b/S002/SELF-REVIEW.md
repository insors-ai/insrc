# S2 manual self-review

Reviewed 2026-11-20 by the implementation author (controller). Automated design/code review is retired and unavailable (CLAUDE.md); this is the substitute self-check evidence, with the explicit limitation that author and reviewer are the same party.

**Result: both Tasks (t1, t2) pass the daemon's build-validation gate. No remaining blocking finding identified within s2's scope.** This report does not constitute an independent daemon review.

## Scope

s2 adds the fixed finding taxonomy and severity scale (HLD sc2): `FindingCategory`, `Finding`, `DEFAULT_SEVERITY_SCALE` (`src/workflow/review-round/finding.ts`), plus a 6-case unit suite and a compile-time typecheck fixture (now with four type-level assertions, not two — see the externally-caught P2 below). New code only — no existing file was modified.

| File | Purpose |
| --- | --- |
| `src/workflow/review-round/finding.ts` | `FindingCategory` (fixed 5-value union), `Finding {id, category, severity}`, `DEFAULT_SEVERITY_SCALE` |
| `src/workflow/review-round/__type-tests__/finding.typecheck.ts` | Compile-time exact-keys, exact-union, unconstrained-severity, and field-required/readonly proofs |
| `src/workflow/review-round/__tests__/finding.test.ts` | The full named test suite, one `it()` per `testStrategy.testLevels[0].subjects` |

## Gate rounds and fixes

The build-validation gate rejected the submission twice before passing; both rejections named genuine gaps:

1. **t2, round 1** — the first test's `it()` title relied on its `describe()` wrapper ("Finding and FindingCategory") to supply the leading words, but the gate checks the individual `it()` title against the LLD's named subject verbatim. Fixed by renaming the title to the full subject text.
2. **t2, round 2** — the severity and category-rejection tests only asserted two runtime example strings and one rejected literal; since `tsx` does not typecheck, this didn't substantiate "accepts any string value" or "exactly the five fixed categories" at the type level — a narrower type would still pass the runtime suite. Fixed by adding two type-level assertions to the fixture (`Equal<FindingCategory, '...'>` and `Equal<Finding['severity'], string>`), matching the existing exact-keys pattern. Verified by temporarily narrowing `severity` to `'HIGH'|'MED'` and widening `FindingCategory` with an extra member, confirming the fixture fails to compile for each, before restoring clean.
3. **Externally reported (P2), after pinning `4199c00d2`.** The exact-union assertion (`Equal<FindingCategory, '...'>`) verified the standalone `FindingCategory` alias in isolation but never checked that `Finding.category` actually uses that alias — `Finding.category` could be independently narrowed (e.g. to `'correctness' | 'security'`) or widened (an extra member not in `FindingCategory`) and every test would still pass. Reproduced both mutations directly on `Finding.category` and confirmed all six finding tests still passed before the fix. Fixed by adding `Equal<Finding['category'], FindingCategory> = true`, then re-confirming both mutations now fail to compile, before restoring clean.

## Source review

| Area inspected | Invariant and assessment |
| --- | --- |
| `finding.ts` | `FindingCategory` is exactly sc2's fixed 5-member union. `Finding` carries `id` (HLD rev4 addition for cross-round identity), `category`, `severity` — no extra field. `severity` is deliberately an unconstrained `string`: no abstract review-type class hierarchy exists in the codebase (confirmed via `insrc_analyze_step` grounding during LLD authoring) to type-check it against. `DEFAULT_SEVERITY_SCALE` documents the HIGH/MED fallback without enforcing it structurally, matching the LLD's chosen alternative a1. |
| `__type-tests__/finding.typecheck.ts` | Exact-keys (`Equal<keyof Finding, 'id'\|'category'\|'severity'>`), exact-union (`Equal<FindingCategory, '...'>`), field-matches-alias (`Equal<Finding['category'], FindingCategory>`), and unconstrained-severity (`Equal<Finding['severity'], string>`) type-level proofs, plus per-field required/readonly `@ts-expect-error` assertions and three "no other field" rejections (`verdict`, `dimension`, `artifactId`). |
| `__tests__/finding.test.ts` | All 6 named subjects exist as individual `it()` cases with titles matching the LLD verbatim; `ac1`/`ac2`'s `provingTests` pass. The first case compiles the typecheck fixture via a throwaway tsconfig (matching the `comment-entry.typecheck.ts` convention), proving the fixture's assertions actually ran. |

## Verification

- `npx tsc --noEmit`: clean, 0 errors.
- `npx tsx --test src/workflow/review-round/__tests__/finding.test.ts`: **6 passed, 0 failed.**
- `npx tsx --test 'src/workflow/review-round/**/*.test.ts' 'src/workflow/artifact-core/__tests__/*.test.ts'` (broader sweep): **184 passed, 0 failed.**
- `insrc_build_step` (phase=validate): t1 passed on the first round; t2 passed after 2 gate rounds of real fixes, then again after the field-matches-alias fix — final verdict `passed: true` for both Tasks, with `typecheckClean: true` and `testsPassed: true`.

## Limits and continuation

This is a manual self-review substituting for the retired automated design/code review; author and reviewer are the same party. No independent party inspected this diff ahead of time, though one P2 defect (the missing field-matches-alias proof) was caught by an external reviewer after this packet first pinned `4199c00d2` and is recorded above, not omitted. The build-validation gate's own rejections across 2 rounds, plus that external catch, are the closest available substitute for adversarial review in this session.

s2 is Phase B's taxonomy Story; s3 (reconciliation), s4 (review-report docgen) and s5 (checkpoint lifecycle) are not yet built. The HLD's lc2 wording defect (an assumed "Feedback abstract base type" that doesn't exist in the codebase) remains an open, non-blocking flag for the HLD owner, carried over from the LLD's own open question.
