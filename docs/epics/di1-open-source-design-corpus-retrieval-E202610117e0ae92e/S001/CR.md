<!-- insrc:artifact CR-7e0ae92e8f3d3c3e-s1 -->

# Code review: 7e0ae92e8f3d3c3e:s1

⚠️ **WARN** — HIGH 0 · MED 4 · LOW 4 · model `claude:opus`

**Changed files:** 39

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/design/corpus/__tests__/acceptance-coverage.test.ts:1 | All nine promised test files exist: contracts, canonical, digest-chain, record-validation, record-roundtrip, manifest-validation, publication-check, module-isolation and acceptance-coverage (confirmed by listing src/design/corpus/__tests__/). There is no build record, and the sandbox would not let me run the suite, so whether they pass is unconfirmed. Treat them as present but unconfirmed, not as passing. |
| MED | src/design/corpus/__tests__/module-isolation.test.ts:1 | The promised smoke step 'npm run build — strict NodeNext compilation' has no test file, by design. Nothing in the grounding shows that it passed, and no build record was supplied. The compiled-import isolation check depends on that compile, so both are present but unconfirmed. |
| MED | src/design/corpus/canonical.ts:1 | canonical.ts, contracts.ts, validate.ts and index.ts appear with no hunk text and an empty testsReaching. That matches hollow graph grounding on newly created files, not a real coverage gap: the promised test files that import these modules are present. However, with no hunk text I cannot confirm from the grounding that the digest-correction behaviour (complete-manifest candidateContentDigest, noncomputable identity for missing or duplicate coverage entries, stale role/metadata assessments) is reached by a specific test. I am not reporting a HIGH not-exercised breach; this needs a scoped re-run against the digest-correction commits. |
| LOW | src/cli/services/maintenance.ts:1 | The changed set includes files outside this Story: src/cli/services/maintenance.ts, plus test and helper files under src/analyze/explore, src/cli/services, src/db/graph and src/workflow/review. Their empty testsReaching and missing hunk text cannot be judged against S001's plan. This looks like contamination of the review scope (the BUILD record notes unrelated tracked edits), not S001 behaviour, so I have not reported it as an S001 coverage gap. Re-scope the review to the S001 commit range. |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | plans/design-intelligence-implementation.md:107 | The tracking table in the program roadmap is out of date and contradicts the rest of the file. It still says DI1 is at 'DEF, HLD and S001 LLD approved; S001 PLAN ready for approval'. Later sections in the same file record that PLAN was approved, all six tasks were built, and the HLD and LLD were revised. The last paragraph also says 'the new candidate hash formula is still pending HLD/LLD/PLAN approval and implementation'. That is false: plans/design-intelligence-di1-s1-build.md and the digest amendment both record it as implemented in cb78619d, 839b36d5 and 4f03c64e. Anyone who reads this roadmap to choose the next step will get the wrong state. Update the table row and the closing status line. |
| LOW | docs/plans/design-intelligence-prd.html:1 | The HTML PRD is a hand-maintained second copy of the same content, written out in full alongside the Markdown source. Nothing generates one from the other or checks that they match. Any edit to one copy can silently drift from the other, and the roadmap's claim that the two are 'synchronized' was only checked by hand. Generate the HTML from the Markdown, or add a parity check. |
| LOW | plans/design-intelligence-di1-s1-build.md:22 | Several pieces of verification evidence point at logs under /tmp: /tmp/di1-s1-full-final.log, /tmp/di1-s1-baseline-recheck.log, /tmp/di1-digest-final.log and /tmp/di1-digest-full.log. These files are not durable and are not committed. Other logs are saved under plans/reviews/. Once /tmp is cleared, the full-suite and digest-correction claims can no longer be checked. Save those logs alongside the others or summarise their key lines inline. |
| LOW | plans/design-intelligence-di1-s1-build.md:51 | The build record mixes historical test counts without marking which ones are superseded: 27 passed, then 'All 24 corpus tests' after 65e82b7f, then 27 again, then 33 at the end. The 24 is lower than the earlier 27 and no reason is given. A reader can't tell whether tests were removed or the number is a typo, which weakens this file as a record of coverage. |

