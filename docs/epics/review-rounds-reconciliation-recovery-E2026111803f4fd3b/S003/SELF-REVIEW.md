# S3 manual self-review

Reviewed 2026-11-20 by the implementation author (controller). Automated design/code review is retired and unavailable (CLAUDE.md); this is the substitute self-check evidence, with the explicit limitation that author and reviewer are the same party.

**Result: both Tasks (t1, t2) pass the daemon's build-validation gate, and five externally-reported P2 defects, across two review rounds against the pinned `0cc9dad29` and `e7b2ac7bb` revisions, have since been fixed and re-validated. No remaining blocking finding identified within s3's scope.** This report does not constitute an independent daemon review.

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

### Externally reported, after pinning `0cc9dad29`: three P2 defects, all fixed in `4f251a0da`

1. **Path traversal via `reviewId`.** `auditTrailPath` joined `reviewId` into a filesystem path with no validation; `../../../private` read a sibling directory's `audit-trail.json`. Fixed with `requireValidReviewId`, a literal-identifier check (`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$`) matching the established `designCheckpointPath` convention, called first in `reconcileRound`.
2. **Category+severity match ≠ recurrence.** `isUnambiguous` treated any current finding sharing category and severity as an unambiguous recurrence, but two independent findings can coincidentally share both — the gate's own reproduction showed zero audit-trail reads for that case. Fixed by requiring a matching `Finding.id` (the field sc2/HLD rev4 added specifically for stable cross-round identity) instead of content coincidence.
3. **`process.cwd()` instead of the reviewed repository.** Both the audit-trail path and the classify role-router call resolved against the daemon process's own cwd, which can differ from the reviewed repo when the supervisor launches the daemon from its installation directory — reproduced as a silently-omitted existing audit trail. Fixed with `reconciliationRepoRoot()`, preferring `INSRC_REPO` (the project's own established headless-fallback repo pin) over cwd, used consistently for both operations.

Each fix has its own regression test (`reconciliation.test.ts`); each was verified by reverting the fix and confirming the new test then fails with the exact reported symptom, before restoring clean and reconfirming the full 195-test sweep green. Both Tasks were re-submitted to `insrc_build_step` (phase=validate) after the fix and passed.

### Externally reported, after pinning `e7b2ac7bb`: two more P2 defects, both fixed in `adaf71762`

4. **`reconciliationRepoRoot` used the process-wide `INSRC_REPO`/cwd, not the active request's own repo.** The fix in #3 above pinned a process-wide `INSRC_REPO` as a stand-in for "the reviewed repository," but that is a headless-caller fallback, not the repository of every daemon request — a request bound to a different repo through `runInStepContext({cwd, envRepo})` was ignored entirely, and with no global pin the function still fell through to the daemon's own cwd. Fixed by switching to `stepEnvRepo()`/`stepCwd()` (`src/shared/step-context.ts`), the established per-request readers already used by `src/daemon/steps/resolve-repo.ts` and `src/analyze/context/scope.ts` — the caller's own values inside a bound step call, falling back to the process's only when no request is bound.
5. **Valid `reviewId`s could still reach outside content through a symlink.** `requireValidReviewId` blocks a *lexical* escape (`../../../private`), but `existsSync`/`readFileSync` follow symlinks regardless of the lexical path they're given — a symlinked `.insrc/tmp/<reviewId>` directory, or a symlinked `audit-trail.json` inside a genuine one, could still resolve to content outside the review's own temp directory. Fixed by adding `isContainedAuditPath`, which re-resolves the real (symlink-followed) path with `realpathSync` and checks it is genuinely inside the real `.insrc/tmp` directory before either `existsSync` or `readFileSync` ever runs.

Each fix has its own regression tests (two per defect: the per-request case and the no-global-pin case for #4; a symlinked directory and a symlinked file for #5); each was verified by reverting the fix and confirming the new tests then fail with the exact reported symptom, before restoring clean and reconfirming the full 199-test sweep green. Both Tasks were re-submitted to `insrc_build_step` (phase=validate) after the fix and passed.

## Source review

| Area inspected | Invariant and assessment |
| --- | --- |
| `reconciliation.ts` | `ReconciliationVerdict` is exactly the four fixed values. `ReconciliationResult {priorFindingRef, verdict}` keys off the prior finding's own `id` (sc2/HLD rev4), never a caller-assigned opaque ref, and never echoes the model's own output back as the key. `reconcileRound`'s only parameters are `reviewId` and the two finding sets — no re-grounding input exists; `reviewId` is validated against a literal-identifier pattern before any path use. Exactly one `classify()` call per invocation; the audit trail is read at most once, only when `findingSetsResolveClassification` says the two sets alone leave an entry ambiguous (by matching `Finding.id`, not category+severity coincidence), and only when a file exists under the ACTIVE REQUEST's own repository's `.insrc/tmp/<reviewId>/` (`stepEnvRepo()`/`stepCwd()`, never a process-wide pin or the daemon's own cwd) AND that path, once every symlink in it is resolved, is genuinely still inside that repo's `.insrc/tmp` (`isContainedAuditPath`). A finding-count mismatch from `classify()` throws rather than silently truncating or padding. |
| `__type-tests__/reconciliation-result.typecheck.ts` | Exact-keys, exact-union, field-matches-alias, and (added in t2's gate round 1) exact-parameter-tuple proofs, plus per-field required/readonly/no-extra-field `@ts-expect-error` assertions. |
| `__tests__/reconciliation.test.ts` | All 8 named subjects exist as individual `it()` cases with titles matching the LLD verbatim; `ac1`/`ac2`'s `provingTests` pass. The audit-trail-read test exercises the real default filesystem path (`.insrc/tmp/<reviewId>/audit-trail.json` under the actual repo root) rather than a fully mocked seam, so it proves the real default implementation reads from the documented location, not just that an injected stub is reachable. |

## Verification

- `npx tsc --noEmit`: clean, 0 errors.
- `npx tsx --test src/workflow/review-round/__tests__/reconciliation.test.ts`: **15 passed, 0 failed** (8 LLD-named + 3 P2-regression tests from the first external round + 4 P2-regression tests from the second).
- `npx tsx --test 'src/workflow/review-round/**/*.test.ts' 'src/workflow/artifact-core/__tests__/*.test.ts'` (broader sweep): **199 passed, 0 failed.**
- `insrc_build_step` (phase=validate): t1 passed on its 5th round after 4 rounds of real fixes, then re-validated clean after each of the two external P2 rounds; t2 passed on its 2nd round after one real fix, then re-validated clean after each of the two external P2 rounds — final verdict `passed: true` for both Tasks, with `typecheckClean: true` and `testsPassed: true`.

## Limits and continuation

This is a manual self-review substituting for the retired automated design/code review; author and reviewer are the same party. No independent party inspected this diff ahead of time, though five P2 defects, across two review rounds (path traversal, category/severity-as-recurrence, and cwd-vs-reviewed-repo after pinning `0cc9dad29`; then per-request-vs-process-wide repo resolution and symlink-unsafe containment after pinning `e7b2ac7bb`), were caught by an external reviewer, and are recorded above, not omitted. The build-validation gate's own six rejections across both Tasks, plus those two external catches, are the closest available substitute for adversarial review in this session. The second round's findings (per-request context, symlink containment) are each more specific instances of the same underlying theme as the first round's #3 (don't trust an ambient global for a value that is actually per-request, and don't trust a lexical check for a filesystem operation that can be redirected after validation) — worth keeping in mind for any future module in this codebase that resolves a repo path or reads from a caller-named identifier-keyed directory.

s3 is Phase B's reconciliation Story; s4 (review-report docgen) and s5 (checkpoint lifecycle) are not yet built.
