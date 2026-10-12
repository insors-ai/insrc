<!-- insrc:artifact CR-7e0ae92e8f3d3c3e-s2 -->

# Code review: 7e0ae92e8f3d3c3e:s2

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 4 · model `claude:opus`

**Changed files:** 40

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | plans/reviews/design-intelligence-di1-s2-closure-verification.txt:1 | Present but unverified. All 25 promised node:test cases exist verbatim as test titles in the changed test files. contracts.test.ts has source-schema and validation-parity. eligibility.test.ts has the 3 mixed-eligibility cases. git-reader.test.ts has the 2 pinned-reader cases and 3 reader-safety cases. reader-limits.test.ts has 3 reader-safety cases. lineage.test.ts has 3 lineage-closure cases. notices.test.ts has 3 notice-closure cases. assessment.test.ts has the 2 eligibility-binding cases and acyclic-staging. acceptance.test.ts has the 2 candidate-roundtrip cases. isolation.test.ts has pure-boundary. The committed TAP log for the latest correction records 58/58 corpus tests passing under Node 22.23.2. No build record was supplied in this grounding, so I cannot confirm the pass-state. These tests are present, not missing; this finding does not assert that they pass. |
| LOW | plans/reviews/design-intelligence-di1-s2-closure-verification.txt:360 | The promised smoke test 'strict-build compiles source eligibility and passes the full corpus regression suite' is not a node:test case. Its only evidence is the logged `npm run build` output plus the 58-test corpus TAP run. Both are recorded as passing, but neither can be verified without a build record. The promise covers the corpus suite, not the whole repository. The documented failures in the full-repository sweep are disclosed separately: the SQLite overflow, the SIGABRT test files and the DaemonSection timing failure. So this is a caveat on the evidence, not a missing test. |
| LOW | src/design/corpus/sources/assessment.ts:1 | Every changed symbol has an empty testsReaching list. The grounding here is diff-only: file-level 'diff:' entities, and hollow hunks for index.ts, lineage.ts, notices.ts, policy.ts, stage.ts and validation-primitives.ts. Empty edges on newly created files are therefore not evidence of an exercise gap, and no HIGH breach is raised. The changed test files visibly import and call the production entry points: assessEligibility, prepareEligibilityCandidate, evaluateSourceImports, stageSources, requiredSourcePaths, readPinnedSources, createGitRunner, runGitBinary, gitEnvironment, the lineage functions, assembleSourceMetadata, stageLocalSources, decode*, sourceIdentity, isCanonicalRepositoryUrl, isUtcDate, pathCollisionKey and isPortablePath. The latest corrections are also exercised directly. notices.test.ts asserts that assembleSourceMetadata rejects an unused admitted source, using an empty lineage. acceptance.test.ts covers the batch deadline, including external-listener cleanup. lineage.test.ts covers lineage role, record and output collisions and duplicate inventory. reader-limits.test.ts covers the pre-aborted and invalid-bounds runner cases. contracts.test.ts covers the SSH, credential, query, fragment and percent-encoded URL rejections. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/design/corpus/sources/eligibility.ts:77 | stageSources runs decodeSourcePolicy on the whole policy every time it is called. evaluateReviewedImports (assessment.ts:53) has already decoded that policy, and assessEligibility decodes it once more at assessment.ts:87, yet stageSources is still called once per import. reviewSnapshot allows up to CORPUS_LIMITS.files imports, and an import with empty paths and no blobs passes the budget. So a review with 10,000 imports and 10,000 profiles re-runs snapshotJson, the ajv check and the identities/pathIssues work about 10^8 times. That happens in both assessEligibility and prepareEligibilityCandidate, which calls assessEligibility again. The earlier review's fix only removed the review/blob re-snapshotting; the policy is still decoded again for each import. Fix: add an internal stageSources variant that takes an already-decoded SourcePolicy and call it from evaluateReviewedImports. |
| LOW | src/design/corpus/sources/assessment.ts:116 | assessEligibility wraps the whole reconstruction (validateRelease, evaluateReviewedImports, assembleSourceMetadata, classifyPackageFiles, validatePackagedLineage) in one catch-all. The catch turns any exception into passed:false with the generic issue 'schema.invalid /eligibility: Expected bounded candidate and reviewed source inputs.' A defect inside one of those helpers, such as a TypeError from a missed undefined, therefore looks like bad caller input, and the real cause is discarded. Because this fails closed, it is safe, but it makes regressions in the pure helpers hard to diagnose. Fix: catch only the typed CorpusInputError/SourceReaderError cases, or keep a distinct internal-error diagnostic code. |

