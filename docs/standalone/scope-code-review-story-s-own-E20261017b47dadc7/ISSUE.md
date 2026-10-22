<!-- insrc:artifact ISSUE-b47dadc7cf0cccb1 -->

# Scope the code review to the Story's own changes and code

## Reproduction

Three post-build code reviews on 2026-10-17/18 reported findings that were not about the reviewed Story.

1. Another Story's commits are reviewed. ISSUE-ae864466 (a parser fix) was built on main, then Story 0f0e4f45 (summary lane) was built on main, then ISSUE-ae864466 was code-reviewed. Its review covered 10 files; 8 of them were Story 0f0e4f45's (src/daemon/queue.ts, src/indexer/doc-summary-sweep.ts, src/indexer/index.ts, three of its test files, AGENTS.md, CLAUDE.md), and those produced 9 of the review's 10 HIGH findings and all 3 MED. ISSUE-ae864466's BUILD record also names commit 0e30e7e7, which is a Story 0f0e4f45 commit. Expected: the review covers only the commits that made ISSUE-ae864466's change, and the BUILD record names one of them.

2. Coverage is judged on files no test can reach. Story 0f0e4f45's review reported 'not exercised' HIGHs on AGENTS.md and CLAUDE.md (2 of 8 HIGH); ISSUE-487ad7a6's review reported them on package.json, package-lock.json and on its own test file (3 of 5 HIGH). Expected: coverage findings only for source code a test could exercise.

3. A missing call-graph edge is reported as missing tests. Every one of the three reviews was blocked by coverage HIGHs that said a changed symbol has an empty testsReaching, while the Story's test record showed the Story's test files passing (for example 42/42 for Story 0f0e4f45, 8/8 for ISSUE-487ad7a6, each test backed by a mutation that fails it). ISSUE-487ad7a6's review was a degraded diff review (the index wait timed out), and its HIGHs still treated the edges as current. Expected: a changed symbol with no graph edge but a passing Story test file is reported as unverified by the graph, not as a not-exercised breach.

## Root cause

1. The reviewed change set is everything on the first-parent line from the Story's range base to HEAD. resolveCodeReviewSubject (src/workflow/code-review/subject.ts:156) resolves the base and asks changedFiles for that range; changedFiles narrows it with storyChangeSet (src/workflow/runners/build/changed-files.ts:149), which removes code merged in from upstream but counts every ordinary commit on the first-parent line as Story work, a limit its own header records (src/workflow/runners/build/story-commits.ts:25-27). When two Stories commit directly on main in the same window, nothing distinguishes one Story's commits from the other's. The BUILD record's commit is HEAD read when the record is written (src/workflow/runners/build/standalone-record.ts:313), not the commit the build was validated at, so a record written after another Story's commits names one of them.

2. assembleCodeReviewGrounding builds a symbol summary for every entity of every changed file (src/workflow/code-review/grounding.ts:82), whatever the file is: Markdown sections, manifest entities and the entities of test files are all handed to the coverage judge as changed symbols to be covered. isTestFile (src/workflow/code-review/grounding.ts:62) is used only to pick the callers that count as reaching tests (src/workflow/code-review/grounding.ts:87), not to leave test files out of the subject.

3. The coverage prompt tells the judge that a changed symbol with an empty testsReaching is a not-exercised gap to report HIGH with confidence 'breach' (src/workflow/code-review/dimensions/coverage.ts:124). testsReaching is read from the call graph's direct callers, and the graph is known to miss test edges: only direct callers are counted, some method names such as parse are dropped as built-ins, a reindex does not re-parse unchanged files, and test files can be indexed before the modules they import. The prompt gives the test record no weight against an empty edge list, and a degraded diff review's grounding is used as if current.

## Fix intent

1. The reviewed change set holds only the Story's own commits: a commit made on main for another Story inside the Story's range is not reviewed as this Story's work, and the BUILD record names a commit of the Story. How a commit is attributed to its Story (for example a Story tag the build prompt requires in each commit message) and what happens when no commit carries it is decided in the design; today's derivation remains the fallback so a review never fails to start.

2. The coverage dimension judges only source-code entities a test could exercise: documentation, manifests and test files themselves are not reported as uncovered. Other dimensions keep seeing every changed file.

3. Coverage severity follows the evidence: a changed symbol with no graph edge but a passing Story test file is reported as unverified by the graph (an observation, not a HIGH breach); a HIGH not-exercised finding needs both no edge and no passing Story test file; a review grounded on the diff says that its edges may be stale.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/subject.ts:156` — "const base = (deps.resolveRangeBase ?? resolveStoryRangeBase)(repoPath, epicHash, storyId);"
- **[[c2]]** `code` `src/workflow/runners/build/changed-files.ts:149` — "const own = new Set(storyChangeSet(repoPath, opts.base).paths);"
- **[[c3]]** `code` `src/workflow/runners/build/story-commits.ts:25-27` — "Known limits: upstream brought in by a fast-forward or by a committed `git merge --squash` leaves only ordinary commits on the first-parent line, so those commits are counted as Story work."
- **[[c4]]** `code` `src/workflow/runners/build/standalone-record.ts:313` — "const commit = rec.body.commit ?? headShortSha(repoPath);"
- **[[c5]]** `code` `src/workflow/code-review/grounding.ts:82` — "for (const file of changedFiles) {"
- **[[c6]]** `code` `src/workflow/code-review/grounding.ts:87` — "const testsReaching = callers.filter(c => isTestFile(c.file));"
- **[[c7]]** `code` `src/workflow/code-review/dimensions/coverage.ts:124` — "a changed symbol with an EMPTY testsReaching is a not-exercised gap — report it HIGH with the symbol named in `expectationRef` and confidence:"breach"."
- **[[c8]]** `prior-artifact` `CR-ae864466e7f1f4ea-s1` — "changedFiles: AGENTS.md, CLAUDE.md, src/daemon/__tests__/queue-lanes.test.ts, src/daemon/queue.ts, src/indexer/__tests__/doc-summary-sweep.test.ts, src/indexer/__tests__/method-calls-cross-file.test.t"
- **[[c9]]** `prior-artifact` `CR-0f0e4f45f698aeb6-s1` — "HIGH | AGENTS.md | All supplied changed file and section symbols have empty testsReaching edges"
- **[[c10]]** `prior-artifact` `CR-487ad7a67474d321-s1` — "HIGH | package-lock.json:33 | The changed entity has empty testsReaching edges; groundingMode degraded (freshness-timeout)"
