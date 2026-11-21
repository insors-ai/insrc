# S4 manual self-review

Reviewed 2026-11-21 by the implementation author (controller). Automated design/code review is retired and unavailable (CLAUDE.md); this is the substitute self-check evidence, with the explicit limitation that author and reviewer are the same party.

**Result: both Tasks (t1, t2) pass the daemon's build-validation gate. No remaining blocking finding identified within s4's scope.** This report does not constitute an independent daemon review.

## Scope

s4 adds the review-report docgen call (HLD sc4, owned by this Story): `renderReviewReport(call, findings, reconciliation, priorFindings)` composes a round's own findings (plus, for round>1, s3's reconciliation verdicts against the prior round) into a persisted Markdown artifact under the review's own `.insrc/tmp/<reviewId>/` directory, and returns the written path. Deliberately NOT wired into `src/docgen/`'s diagram registry — confirmed by direct reading that that framework renders self-contained HTML/SVG, never Markdown, and its own handler never persists to disk, which would have violated ac1's literal "persisted MD artifact" requirement. New code only — no existing file was modified.

| File | Purpose |
| --- | --- |
| `src/workflow/review-round/review-report.ts` | `ReviewReportDocgenCall`, `renderReviewReport`, `_setReviewReportDepsForTests` |
| `src/workflow/review-round/__type-tests__/review-report.typecheck.ts` | Compile-time exact-keys and exact-parameter-tuple proofs |
| `src/workflow/review-round/__tests__/review-report.test.ts` | The full named test suite, one `it()` per `testStrategy.testLevels[0].subjects` (10 total) |

## Design decision: not a docgen docType registration

Before implementing, the LLD's own `design.story` phase found a real mismatch between the HLD's wording ("review-report docgen docType") and the existing `src/docgen/` registry it could have been read as pointing at: that framework's `DocTypeRegistration` contract always produces a `DocumentIR` → `RenderedDocumentShell` — a self-contained offline **HTML** file with an inlined SVG viewer (`diagramFormat: 'svg'` is a literal field) — and `handleDocgen` never persists its own output to disk. Registering into it would have produced an HTML shell with an empty, meaningless diagram section, violating ac1's repeated, literal "persisted MD artifact" wording. This was recorded as alternative a2 in the LLD, scored and rejected in favor of a1 (a standalone render function), with the evidence (exact file paths and type shapes) cited directly rather than asserted.

Mid-design, the user corrected two more framings that had drifted during the conversation: (1) the "attached artifacts" idea belongs on the review's *input* side (already handled by s1's existing `hooks.ground(targets, round)`, confirmed directly in `driver.ts`), not s4's output; (2) no per-review-type templates are needed, since `Finding`/`ReconciliationResult` are already uniform across review types. Both corrections left the LLD as originally designed — no rework was needed once traced back to the actual code.

## Gate rounds and fixes

The build-validation gate rejected one submission (t2) before passing; the rejection named a genuine gap:

1. **t2, round 1** — the test proving ac2 ("reconciliation inlines each verdict, limited to only the findings this round's own reconciliation classified") only showed the happy path: every supplied prior finding was reconciled. It never proved the *exclusion* half of the claim (a real prior finding the reconciliation did NOT classify must not appear — lc3's "never a running audit of all history"), and never exercised the LLD's own required fixture (a reconciliation entry whose `priorFindingRef` has no matching `priorFindings` entry). Fixed by adding `p3` (a prior finding absent from `reconciliation` — asserted absent from the rendered output) and `p4` (a reconciliation entry with no matching `priorFindings` entry — asserted to still render, with its bare ref and verdict alone) to the same test.
2. **t2, round 2** — passed.

The fix was verified by confirming the new assertions actually exercise paths the implementation already handled correctly (`renderReconciliation` only ever iterates `reconciliation`, never `priorFindings`, so an unclassified prior was already structurally excluded) — this was a genuine test-coverage gap, not an implementation defect, and the gate's catch was still a real and correct one: the claim had been asserted without being proven.

## Source review

| Area inspected | Invariant and assessment |
| --- | --- |
| `review-report.ts` | `ReviewReportDocgenCall{reviewId, round}` is exactly sc4's interfaceSketch. `renderReviewReport`'s signature carries the corrected four parameters (`call, findings, reconciliation, priorFindings`) per the LLD's own resolved open question — `ReconciliationResult` alone cannot name a prior finding's category/severity. `reviewId` is validated against the same literal-identifier pattern `reconciliation.ts` already established; `round` is validated with the same `RangeError` `runReviewRound` already throws. The repository is resolved once per call through the canonical `resolveRepoPath` chain (never the daemon's own cwd), matching the fix `reconciliation.ts` needed across three external review rounds. Exactly one file is written, at `.insrc/tmp/<reviewId>/review-report-round-<round>.md`; a write failure propagates unchanged. The reconciliation section is omitted entirely for round 1 (not rendered empty), and for round>1 it renders only the findings reconciliation actually classified. |
| `__type-tests__/review-report.typecheck.ts` | Exact-keys and exact-parameter-tuple proofs, plus per-field required/readonly/no-extra-field `@ts-expect-error` assertions — the same pattern `reconciliation-result.typecheck.ts` established for `reconcileRound`'s own parameter-shape proof. |
| `__tests__/review-report.test.ts` | All 10 named subjects exist as individual `it()` cases with titles matching the LLD verbatim; `ac1`/`ac2`/`ac3`'s `provingTests` pass, including the round-2 test's exclusion (`p3`) and unmatched-ref (`p4`) cases added in the gate's round-1 fix. |

## Verification

- `npx tsc --noEmit`: clean, 0 errors.
- `npx tsx --test src/workflow/review-round/__tests__/review-report.test.ts`: **10 passed, 0 failed.**
- `npx tsx --test 'src/workflow/review-round/**/*.test.ts' 'src/workflow/artifact-core/__tests__/*.test.ts'` (broader sweep): **211 passed, 0 failed.**
- `insrc_build_step` (phase=validate): t1 passed on its first round; t2 passed on its second round after one real test-coverage fix — final verdict `passed: true` for both Tasks, with `typecheckClean: true` and `testsPassed: true`.

## Limits and continuation

This is a manual self-review substituting for the retired automated design/code review; author and reviewer are the same party. No independent party inspected this diff. The build-validation gate's own rejection — a genuine test-coverage gap, not an implementation defect — is the closest available substitute for adversarial review in this session.

s4 is Phase B's review-report rendering Story; s5 (checkpoint lifecycle) is not yet built.
