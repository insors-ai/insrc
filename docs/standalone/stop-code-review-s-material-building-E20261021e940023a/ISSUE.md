<!-- insrc:artifact ISSUE-e940023a6962ede9 -->

# Stop the code review's material building from freezing the daemon

## Reproduction

Run the code review of a Story with a large change set on the daemon, for example Epic c2ba6fa6 Story s1 (141 files) through codeReview.run. Observed on 2026-10-21: between the subject resolving (09:20:42) and the adherence review being divided (09:30:33) the daemon logged nothing, held 100% CPU and refused socket connections (ECONNREFUSED: the accept queue fills while the event loop is blocked). Another session's daemon-ctl judged it stale and killed it mid-review at 14:48. Expected: preparing a review takes seconds and the daemon keeps answering.

## Root cause

A CPU profile of the live daemon during that review put about 160 of 200 seconds in src/workflow/review-pipeline/adapters/code-review-material.ts. (1) neighbourSummary (line 86) rebuilds a name map by JSON-parsing every atom's full text on each call (line 88) and filters every relation twice on each call (lines 93-95); the pipeline calls it once per neighbour atom (src/workflow/review-pipeline/job.ts:133, src/workflow/review-pipeline/adapters/code-review-gather.ts:221), so its cost grows with the square of the atom count times the row size: a synthetic benchmark gives 87 ms, 358 ms and 1.6 s for 250, 500 and 1000 atoms, and this review has more than 2000. (2) codeReviewMaterial (lines 65-71) compares every pair of atoms to find same-file and same-directory relations, though only pairs in the same directory can relate. All of it is synchronous, so the daemon's event loop is blocked throughout.

## Fix intent

Make building and summarising the review material scale with the size of the material rather than its square, with byte-for-byte identical output: the name map and each atom's callers and callees are computed once per material instead of on every summary, and atoms are paired only within their own directory group, keeping today's relation order. The two functions keep their signatures, so no caller changes. A test pins the identical output, and another bounds the time on a large synthetic material.

## Citations

- **[[c1]]** `code` `src/workflow/review-pipeline/adapters/code-review-material.ts:86-96` — "const nameOf = new Map(material.atoms.map(a => [a.id, (JSON.parse(a.text) as { name: string }).name] as const));"
- **[[c2]]** `code` `src/workflow/review-pipeline/adapters/code-review-material.ts:65-71` — "for (let i = 0; i < atoms.length; i++) { for (let j = i + 1; j < atoms.length; j++) {"
- **[[c3]]** `code` `src/workflow/review-pipeline/job.ts:133` — "summaryOf: atom => adapter.neighbourSummary?.(atom, material) ?? atom.label,"
- **[[c4]]** `code` `src/workflow/review-pipeline/adapters/code-review-gather.ts:221`
- **[[c5]]** `stakeholder` `Subho Ghosh, 2026-10-21: 'daemon seems to be crashing after the latest changes, check why' / 'yes, do this fix first.'`
