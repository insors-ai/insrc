<!-- insrc:artifact ISSUE-1102dc7125ad0c07 -->

# Ground code-review coverage on the Story's test record and wait only for the Story's own indexing

## Reproduction

Run insrc_code_review_step on any built Story whose BUILD and TESTS records are committed. Observed on 2026-10-17: (a) CR-e48e33ae6af03720-s1 raised 4 MED coverage findings saying "no build record is available" and the tests' pass-state is unverified, although BUILD-e48e33ae6af03720-s1 and the Story's TESTS record, with the gate's per-test pass results, were committed. (b) Two reviews (CR-ae2d83c6ab06c595-s1 and CR-91640defac1b5816-s1) asked to wait for a fresh index; the freshness check answered isProcessing true with no stale files, because the daemon's queue held about 45 jobs of which 6 were for this repository; after 120 s the review fell back to the diff-only degraded review, and its result said only groundingMode degraded, not that the wait had timed out. Waiting about 35 minutes for the queue to drain gave a full review. Expected: coverage judges pass-state from the Story's records, and the wait ends as soon as the Story's own files are indexed, saying so if it does fall back.

## Root cause

(1) The review's subject reads the Story's build record through an optional dependency (src/workflow/code-review/subject.ts:66) that is used at src/workflow/code-review/subject.ts:140 and that no production caller supplies, so the subject's build record is always null. The coverage dimension then tells the judge that no build record is available and to treat every test's pass-state as unverified (src/workflow/code-review/dimensions/coverage.ts:99-102). The per-test results the gate records are in the Story's TESTS record, which the subject has no field for. (2) The daemon's freshness answer takes isProcessing from the whole queue (src/daemon/index.ts:820), not from work on the Story's changed files, so jobs for other repositories and for document summaries keep it busy while the Story's files are already indexed. The step's wait (src/daemon/steps/code-review-step/handler.ts:294-311) then reaches codeReview.freshnessTimeoutMs and falls back to the degraded diff review without recording why.

## Fix intent

The code review reads the Story's build and test records and the coverage dimension judges each test's pass-state from them, treating a test as unverified only when no record says it passed. The freshness wait considers only pending work that affects the Story's changed files, so unrelated queue jobs no longer hold a review, and a review that does fall back to the diff says that it timed out waiting for the index, and on what.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/subject.ts:66` — "readonly readBuildRecord?: (repoPath: string, epicHash: string, storyId: string) => StandaloneBuildRecord | null;"
- **[[c2]]** `code` `src/workflow/code-review/subject.ts:140` — "const buildRecord = deps.readBuildRecord?.(repoPath, epicHash, storyId) ?? null;"
- **[[c3]]** `code` `src/workflow/code-review/dimensions/coverage.ts:99-102` — "? 'No build record is available — treat every test\'s pass-state as UNVERIFIED (never assert a green).'"
- **[[c4]]** `code` `src/daemon/index.ts:820` — "isProcessing: () => queue.isProcessing,"
- **[[c5]]** `code` `src/daemon/steps/code-review-step/handler.ts:294-311` — "const deadline = deps.now() + deps.freshnessTimeoutMs();"
