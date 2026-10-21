<!-- insrc:artifact ISSUE-2f4cb54c0df2e9e0 -->

# Build each review adapter's material once, not on every call

## Reproduction

Run a code review large enough to be divided, for example Epic c2ba6fa6 Story s1 (141 files, more than 2000 atoms) through codeReview.run on the daemon, after ISSUE-e940023a. Observed on 2026-10-21: the daemon froze at 100% CPU and refused connections from 15:35 for over 10 minutes during the adherence review's chunk stage, with no model call running; another session could not use it. Expected: once the material is built, the review's calls cost almost no daemon CPU and the daemon keeps answering.

## Root cause

A 60-second CPU profile of the frozen daemon put 57 s in relationCall (src/workflow/review-pipeline/adapters/code-review-gather.ts:205) calling the adapter's material() factory (src/workflow/review-pipeline/code-review.ts:158-163), which rebuilds the whole review material through codeReviewMaterial, relations included, every time it is called. The factory is called per chunk call and per validation (src/workflow/review-pipeline/code-review.ts:186, :188), per relation and obligation call and validation in the gather stage (src/workflow/review-pipeline/adapters/code-review-gather.ts:158, :205, :246), per duplicate-stage call (src/workflow/review-pipeline/adapters/code-review-duplicates.ts:131, :198, :220, :233) and in the job (src/workflow/review-pipeline/job.ts:92, :664, :701). A divided review makes hundreds of those calls, so a 2000-atom material is rebuilt hundreds of times, synchronously, on the daemon's only thread.

## Fix intent

Each adapter builds its material once and every caller reads that same material, so a review's cost no longer multiplies by its number of calls. The material is derived only from the job's frozen snapshot and the saved subject, so the output is identical; no caller, signature or contract changes. A test pins that the material is built once per adapter however many calls read it, and that it is the same material as before.

## Citations

- **[[c1]]** `code` `src/workflow/review-pipeline/code-review.ts:158-163` — "const material = (): ReviewMaterial => { const base = codeReviewMaterial(spec.materialGrounding?.(grounding, groundingMode) ?? grounding);"
- **[[c2]]** `code` `src/workflow/review-pipeline/adapters/code-review-gather.ts:205` — "const material = args.material();"
- **[[c3]]** `code` `src/workflow/review-pipeline/adapters/code-review-duplicates.ts:131`
- **[[c4]]** `code` `src/workflow/review-pipeline/job.ts:701` — "const material = adapter.material();"
- **[[c5]]** `stakeholder` `Subho Ghosh, 2026-10-21: 'no, daemon is freezing again' / 'ok, 2 things to work on, one is debug the freeze, second design for a multi-threaded approach. daemon can't be a single blocking thread.'`
