<!-- insrc:artifact ISSUE-11e4fa8831105a05 -->

# Code-review findings outside the changed set are discarded without a word

## Reproduction

Run a controller code review on a Story whose code was committed before the review, then compare what you submitted against what the record holds.

Steps:
1. Pick a Story whose implementation landed in earlier commits — any back-filled or previously-shipped Story will do.
2. Run `insrc_code_review_step` through to `phase: 'judgements'`, submitting findings whose `location` points at the Story's real source files.
3. Read the persisted CR record's per-dimension findings.

EXPECTED: the findings you submitted are in the record, or you are told which were not and why.

OBSERVED: findings whose file is outside the Story's changed set are gone, with nothing said. Measured live on 93081bff S001 (2026-10-04), a Story back-filled two days after its code shipped, whose last commit touched only two ledger files. Seven findings were submitted — adherence 3, coverage 3, quality 2. ONE survived: the single finding whose location pointed inside those two files. Both MED adherence findings were discarded, and three of the four dimensions persisted zero findings.

Note that step 3 is the only way to observe this from outside, and a reader who did not keep their submission cannot reproduce it at all — which is part of why the silence matters.

What the record says about itself is accurate, and that is worth stating plainly rather than overclaiming: the reported counts were `{high: 0, med: 0, low: 1}`, which matches the one finding kept. There is no count-versus-content mismatch. The defect is the SILENCE — a reader of that record, including the gate that consumes its verdict, cannot distinguish "the reviewer examined this and found nothing" from "the reviewer's findings were thrown away before they were written down". A review that reports a clean adherence dimension because its adherence findings were filtered out is reporting the opposite of what happened.

## Root cause

One branch in the judgement-folding path drops out-of-scope findings and keeps no record of having done so. For each submitted finding the fold loop evaluates `if (changed.has(fileOf((f as DimensionFinding).location))) kept.push(f as DimensionFinding);` — a finding whose file is not in the changed set simply falls off the end of the iteration. Nothing is logged, nothing is counted, and nothing is attached to the dimension to say that a finding was considered and rejected on scope. The surrounding code is otherwise careful: a malformed finding returns an explicit error message, and a missing dimension is reported by name. Scope rejection is the one failure mode handled by omission.

The filter itself is intentional — the comment calls it 'scope-drop' and cites daemon-path parity — and it is defensible: a finding about a file the Story did not touch is usually noise. What is not defensible is that the decision is invisible.

The severity depends entirely on what the changed set contains, and that is where it goes wrong in practice. The set is resolved once when the subject is built, via `changedFiles = await deps.changedFiles(repoPath);`, wired to the build runner's `changedFiles` implementation. That derivation reads the working tree, so for a Story whose work is already committed the set collapses to the last commit. On the live run the last commit was the BUILD-record back-fill — two ledger files — so the filter was comparing findings about seventeen source files against a two-file set and rejecting almost all of them.

That second half is NOT this defect and must not be folded into it. Which commits the changed set should span is a separate decision already filed as ISSUE-5f7a7cb9, whose own fix intent frames the choice (base at approval time versus at build time). This issue is only that the drop happens in silence — which would still be worth correcting even if the changed set were always perfect, because a dropped finding is a reviewer's judgement being discarded.

## Fix intent

Make a scope-dropped finding visible, so that a quiet dimension means the reviewer found nothing rather than that their findings were filtered away.

The minimum is that the discard stops being inferable only by comparing what you submitted against what was stored. Whoever reads the outcome — a human, or the completion gate that acts on the verdict — should be able to see that findings were rejected on scope, how many, and against what set, without re-running anything.

The filter should KEEP filtering. This is not a request to widen the scope rule or to admit out-of-scope findings into the verdict: the parity rationale for dropping them stands, and a review that counted findings about untouched files toward a block verdict would be worse than the current behaviour. Only the silence changes.

DELIBERATELY NOT DECIDED HERE — for the fix stage:
  - WHERE the disclosure lands. A count on the response, a per-dimension note on the persisted record, a log line, or some combination differ in who actually sees it; the gate consumes the record while the operator reads the response, and those are not the same audience.
  - WHETHER a drop should be able to change the outcome — for instance, whether a review that discarded most of its findings should decline rather than return a verdict, as a hollow pass is arguably worse than no review. That is a policy question about review validity, not part of making the drop visible.
  - Nothing about the changed-set derivation, which belongs to ISSUE-5f7a7cb9.

## Citations

- **[[c1]]** `code` `src/mcp/code-review-step/handler.ts:547` — "if (changed.has(fileOf((f as DimensionFinding).location))) kept.push(f as DimensionFinding);"
- **[[c2]]** `code` `src/mcp/code-review-step/handler.ts:545` — "// scope-drop: keep only findings whose file is in the changed set"
- **[[c3]]** `code` `src/mcp/code-review-step/handler.ts:515` — "then scope-drop each dimension's findings to the Story's changed set (the"
- **[[c4]]** `code` `src/mcp/code-review-step/handler.ts:18` — "out-of-changedFiles findings (daemon-path parity), then drive the SAME"
- **[[c5]]** `code` `src/workflow/code-review/subject.ts:97` — "changedFiles = await deps.changedFiles(repoPath);"
- **[[c6]]** `code` `src/workflow/code-review/subject.ts:37` — "import { changedFiles as realChangedFiles, NoBuildChangesError } from '../runners/build/changed-files.js';"
- **[[c7]]** `prior-artifact` `CR-93081bff91ae5108-S001 — the live measurement` — "counts {high: 0, med: 0, low: 1}; adherence 0, conventions 0, coverage 1, quality 0 — against seven findings submitted"
- **[[c8]]** `prior-artifact` `ISSUE-5f7a7cb95b643ae5 — the separate changed-set/range decision` — "Sibling Stories approved together share one range base, so a later build reports its siblings' commits as its own changes"
