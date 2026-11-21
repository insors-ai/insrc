# S4 manual self-review

Reviewed 2026-11-21 by the implementation author (controller). Automated design/code review is retired and unavailable (CLAUDE.md); this is the substitute self-check evidence, with the explicit limitation that author and reviewer are the same party.

**Result: both Tasks (t1, t2) pass the daemon's build-validation gate, and one externally-reported P2 defect against the pinned `5b475b286` revision has since been fixed and re-validated (with one further gate-caught refinement of that same fix). A second externally-reported P2 — that the returned report path cannot actually be opened via `insrc_present` — is real and verified, but is NOT fixable within this Story's own module; see "Known limitation" below.** This report does not constitute an independent daemon review.

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

### Externally reported, after pinning `5b475b286`: a symlink-safety P2, fixed in `105dc6868` then refined in `ee41a4118`

1. **Report writes could escape the review directory through symlinks.** `requireValidReviewId` blocks a lexical traversal, but `mkdirSync`/`writeFileSync` still follow an existing symlink regardless of the lexical path given to them. The external report reproduced both: a symlinked review directory redirecting the write outside the repository, and a symlinked report file causing an unrelated external file to be truncated and overwritten. Fixed by adding `requireNoSymlinkInPath`, which walks every path segment from `repoRoot` to the write target and rejects if any existing segment is itself a symlink (`lstat`, not `stat`) — called before `mkdirSync` and re-checked immediately before `writeFileSync` to close the window between the two.
2. **Self-caught refinement, same gate submission.** The first version of `requireNoSymlinkInPath` gated `lstatSync` behind `existsSync`, but `existsSync` itself follows symlinks and reports a **dangling** one (whose target doesn't exist yet) as nonexistent — skipping the `lstatSync` check entirely, letting `writeFileSync` follow the symlink and create the file at its resolved location outside the repository. Fixed by switching to `lstatSync` directly (which sees a dangling symlink too, since it never follows), with a try/catch treating a genuinely nonexistent segment as safe to create.

Four regression tests cover both: a symlinked review directory, a symlinked report file (with a real external target), a *dangling* symlinked report file (no target yet), and a sibling-review directory alias. Each was verified by reverting its specific fix and confirming the matching test then fails with the exact reported symptom, before restoring clean and reconfirming the full 215-test sweep green. Both Tasks were re-submitted to `insrc_build_step` (phase=validate) after each fix and passed.

## Known limitation (not fixed — out of this Story's scope)

**The externally-reported P2 that `renderReviewReport`'s returned path cannot be opened via `insrc_present` is real and was reproduced against the actual presentation handler and pending-list implementation (`presented: []`, the report in `notPending`).** `insrc_present`'s matching is scoped to pending governance-workflow artifacts (DEF/HLD/LLD/PLAN/BUILD/ISSUE/EXT under `docs/epics/.../S0XX/`); a plain file under `.insrc/tmp/<reviewId>/` that is not itself a tracked artifact does not match, regardless of whether it exists and is readable. This means my own t2 test "the path renderReviewReport returns points to a file that exists and is readable... so insrc_present can open it" overstates what it actually proves — filesystem readability is not presentability, exactly as the external report states.

This is not a defect in `review-report.ts` itself: `renderReviewReport` correctly implements sc4/k6 (render + persist, explicit and agent-invoked). The actual *calling* of `insrc_present` with the returned path is s1's round-driver responsibility ("render+present... stays private to s1" — HLD boundary), deferred Epic-level follow-on work; and `insrc_present`'s own matching logic lives entirely outside `src/workflow/review-round/`, in the broader pending-artifact/workflow-approval framework, which is not owned by this Story, this Epic, or even this Story's adjacent boundaries. Fixing it would mean modifying a shared capability used by every other workflow in this codebase (including the one driving this very build), which is squarely out of scope to patch unilaterally here. This is flagged to the user for a decision on how to track it (e.g. a separate triaged defect against `insrc_present`, or an HLD amendment to ac3's own wording) rather than silently built around.

## Source review

| Area inspected | Invariant and assessment |
| --- | --- |
| `review-report.ts` | `ReviewReportDocgenCall{reviewId, round}` is exactly sc4's interfaceSketch. `renderReviewReport`'s signature carries the corrected four parameters (`call, findings, reconciliation, priorFindings`) per the LLD's own resolved open question — `ReconciliationResult` alone cannot name a prior finding's category/severity. `reviewId` is validated against the same literal-identifier pattern `reconciliation.ts` already established; `round` is validated with the same `RangeError` `runReviewRound` already throws. The repository is resolved once per call through the canonical `resolveRepoPath` chain (never the daemon's own cwd), matching the fix `reconciliation.ts` needed across three external review rounds. Before every write, `requireNoSymlinkInPath` walks every path segment from `repoRoot` to the target via `lstatSync` (never following a link, so a dangling one is caught too) and rejects if any segment is itself a symlink — a symlinked review directory, a symlinked report file, or a symlinked ancestor. Exactly one file is written, at `.insrc/tmp/<reviewId>/review-report-round-<round>.md`; a write failure propagates unchanged. The reconciliation section is omitted entirely for round 1 (not rendered empty), and for round>1 it renders only the findings reconciliation actually classified. |
| `__type-tests__/review-report.typecheck.ts` | Exact-keys and exact-parameter-tuple proofs, plus per-field required/readonly/no-extra-field `@ts-expect-error` assertions — the same pattern `reconciliation-result.typecheck.ts` established for `reconcileRound`'s own parameter-shape proof. |
| `__tests__/review-report.test.ts` | All 10 named subjects exist as individual `it()` cases with titles matching the LLD verbatim; `ac1`/`ac2`/`ac3`'s `provingTests` pass, including the round-2 test's exclusion (`p3`) and unmatched-ref (`p4`) cases added in the gate's round-1 fix, plus 4 symlink-safety regression tests added for the externally-reported P2. |

## Verification

- `npx tsc --noEmit`: clean, 0 errors.
- `npx tsx --test src/workflow/review-round/__tests__/review-report.test.ts`: **14 passed, 0 failed** (10 LLD-named + 4 symlink-safety regression tests).
- `npx tsx --test 'src/workflow/review-round/**/*.test.ts' 'src/workflow/artifact-core/__tests__/*.test.ts'` (broader sweep): **215 passed, 0 failed.**
- `insrc_build_step` (phase=validate): t1 passed on its first round, then re-validated clean after each of the two symlink-safety fixes; t2 passed on its second round after one real test-coverage fix, then re-validated clean after each of the two symlink-safety fixes — final verdict `passed: true` for both Tasks, with `typecheckClean: true` and `testsPassed: true`.

## Limits and continuation

This is a manual self-review substituting for the retired automated design/code review; author and reviewer are the same party. No independent party inspected this diff ahead of time, though two P2 defects were caught by an external reviewer after this packet first pinned `5b475b286`: the symlink-safety gap (fixed, with a further gate-caught refinement of that same fix) and the `insrc_present` presentability gap (real, verified, but out of this Story's own scope to fix — see "Known limitation" above). Both are recorded here, not omitted. The build-validation gate's own rejection, plus these two external catches, are the closest available substitute for adversarial review in this session.

s4 is Phase B's review-report rendering Story; s5 (checkpoint lifecycle) is not yet built.
