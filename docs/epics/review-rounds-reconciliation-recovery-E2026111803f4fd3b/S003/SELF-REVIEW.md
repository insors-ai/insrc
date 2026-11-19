# S3 manual self-review

Reviewed 2026-11-20 by the implementation author (controller). Automated design/code review is retired and unavailable (CLAUDE.md); this is the substitute self-check evidence, with the explicit limitation that author and reviewer are the same party.

**Result: both Tasks (t1, t2) pass the daemon's build-validation gate. No remaining blocking finding identified within s3's scope.** This report does not constitute an independent daemon review.

## Scope

s3 adds the reconciliation pass (HLD sc3, owned by this Story): `reconcileRound(reviewId, priorFindings, currentFindings)` classifies each prior round's HIGH/MED finding against round N's own independent findings as `confirmed | still-open | contradicted | no-longer-surfaced`, purely informational and never consulted by the approval gate. A single classification call per round; the review's `.insrc/tmp/<reviewId>/` audit trail is read internally, only when the two finding sets alone leave an entry ambiguous. New code only — no existing file was modified (the role-taxonomy registry was briefly edited during t1, then reverted — see below).

| File | Purpose |
| --- | --- |
| `src/workflow/review-round/reconciliation.ts` | `ReconciliationVerdict`, `ReconciliationResult`, `reconcileRound`, `_setReconciliationDepsForTests` |
| `src/workflow/review-round/__type-tests__/reconciliation-result.typecheck.ts` | Compile-time exact-keys, exact-union, field-matches-alias, and exact-parameter-tuple proofs, plus per-field required/readonly/no-extra-field assertions |
| `src/workflow/review-round/__tests__/reconciliation.test.ts` | The full named test suite, one `it()` per `testStrategy.testLevels[0].subjects` (8 total) |

## Gate rounds and fixes

The build-validation gate rejected submissions six times across the two Tasks before passing; every rejection named a genuine gap:

1. **t1, round 1** — `reconcileRound` read the audit trail unconditionally before every classification call, contradicting the HLD's "only when needed" boundary. Fixed with a two-phase design (a first `classify()` call signaling whether a trail was needed).
2. **t1, round 2** — the two-phase design violated the hard "a single dedicated call per round" postcondition. Fixed by replacing it with a plain `existsSync`-backed `auditTrailExists(reviewId)` check before one single `classify()` call.
3. **t1, round 3** — pure file-existence gating never actually determined whether the two finding sets *alone* resolve classification, as the contract requires. Fixed by adding `findingSetsResolveClassification`/`isUnambiguous`. In the same round the gate also flagged `scopeRespected: false` for editing the shared, closed `src/config/role-taxonomy.ts` registry to add a new role for this one call site — reverted, and `analyze.narrow` (an existing peripheral/cheap role for "explore probes... narrow classification") reused instead.
4. **t1, round 4** — the first `isUnambiguous` heuristic treated "no finding shares this prior finding's category" as unambiguous no-longer-surfaced, which is trivially true for every prior finding when `currentFindings` is empty — silently foreclosing the audit trail on every round with zero new findings, exactly the case most likely to need it. Fixed by narrowing `isUnambiguous` to only the exact category+severity recurrence case; every other case (absence, category-only match, empty `currentFindings`) is ambiguous and triggers the audit-trail read.
5. **t1, round 5** — passed.
6. **t2, round 1** — the named test proving `reconcileRound`'s parameter shape (ac1) only asserted runtime arity (`reconcileRound.length === 3`), which cannot see a widened or retyped parameter (it stays 3 even if a parameter were loosened to accept a `ReviewTargets`-shaped object) — the compile-time fixture had no signature assertion at all. Fixed by adding an exact-tuple `Equal<Parameters<typeof reconcileRound>, [string, readonly Finding[], readonly Finding[]]>` proof to the fixture and wiring ac1's test to exercise it.
7. **t2, round 2** — passed.

Each fix was verified by temporarily reproducing the exact gap (reverting a line, narrowing/widening a type, adding a spurious parameter) and confirming the relevant test or typecheck then failed with the reported symptom, before restoring clean and reconfirming green — never cosmetic rewording of a gate complaint.

## Source review

| Area inspected | Invariant and assessment |
| --- | --- |
| `reconciliation.ts` | `ReconciliationVerdict` is exactly the four fixed values. `ReconciliationResult {priorFindingRef, verdict}` keys off the prior finding's own `id` (sc2/HLD rev4), never a caller-assigned opaque ref, and never echoes the model's own output back as the key. `reconcileRound`'s only parameters are `reviewId` and the two finding sets — no re-grounding input exists. Exactly one `classify()` call per invocation; the audit trail is read at most once, only when `findingSetsResolveClassification` says the two sets alone leave an entry ambiguous, and only when a file exists for that `reviewId`. A finding-count mismatch from `classify()` throws rather than silently truncating or padding. `isUnambiguous` is deliberately narrow: only a literal category+severity recurrence is treated as settled, because an absence is equally consistent with "fixed" and "was wrong to begin with," and a severity-only mismatch is equally consistent with "still open" and "contradicted." |
| `__type-tests__/reconciliation-result.typecheck.ts` | Exact-keys, exact-union, field-matches-alias, and (added in t2's gate round 1) exact-parameter-tuple proofs, plus per-field required/readonly/no-extra-field `@ts-expect-error` assertions. |
| `__tests__/reconciliation.test.ts` | All 8 named subjects exist as individual `it()` cases with titles matching the LLD verbatim; `ac1`/`ac2`'s `provingTests` pass. The audit-trail-read test exercises the real default filesystem path (`.insrc/tmp/<reviewId>/audit-trail.json` under the actual repo root) rather than a fully mocked seam, so it proves the real default implementation reads from the documented location, not just that an injected stub is reachable. |

## Verification

- `npx tsc --noEmit`: clean, 0 errors.
- `npx tsx --test src/workflow/review-round/__tests__/reconciliation.test.ts`: **8 passed, 0 failed.**
- `npx tsx --test 'src/workflow/review-round/**/*.test.ts' 'src/workflow/artifact-core/__tests__/*.test.ts'` (broader sweep): **192 passed, 0 failed.**
- `insrc_build_step` (phase=validate): t1 passed on its 5th round after 4 rounds of real fixes; t2 passed on its 2nd round after one real fix — final verdict `passed: true` for both Tasks, with `typecheckClean: true` and `testsPassed: true`.

## Limits and continuation

This is a manual self-review substituting for the retired automated design/code review; author and reviewer are the same party. No independent party inspected this diff. The build-validation gate's own six rejections across both Tasks — each a genuine logic, scope, or proof-strength defect, not a cosmetic complaint — are the closest available substitute for adversarial review in this session.

s3 is Phase B's reconciliation Story; s4 (review-report docgen) and s5 (checkpoint lifecycle) are not yet built.
