<!-- insrc:artifact CR-a832f5b2560d917f-s1 -->

# Code review: a832f5b2560d917f:s1

⛔ **BLOCK** — HIGH 1 · MED 0 · LOW 11 · model `claude:claude-sonnet-5`

**Changed files:** 6

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 12 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/daemon/__tests__/review-investigation-adoption.test.ts | Promised integration test "Qualification still rejects incomplete isolation evidence, changed runtime pins and stale canonical authority" has no corresponding test title in any Story test file and is not among the reportedTests entries. |
| LOW | src/daemon/review-investigation-adoption.ts | No test-reaching edge recorded for refuse(); the Story's test files pass overall, so the graph may simply have missed the edge rather than this being an uncovered path. |
| LOW | src/daemon/review-investigation-adoption.ts | No test-reaching edge recorded for readPredecessorHld(); Story test files pass, so the graph may have missed the edge. |
| LOW | src/daemon/review-investigation-adoption.ts | No test-reaching edge recorded for issueData(); Story test files pass, so the graph may have missed the edge. |
| LOW | src/daemon/review-investigation-adoption.ts | No test-reaching edge recorded for investigationSourceDigest(); Story test files pass, so the graph may have missed the edge. |
| LOW | src/daemon/review-investigation-adoption.ts | No test-reaching edge recorded for walk(); Story test files pass, so the graph may have missed the edge. |
| LOW | src/daemon/review-investigation-adoption.ts | No test-reaching edge recorded for readInvestigationSelection(); Story test files pass, so the graph may have missed the edge. |
| LOW | src/daemon/review-investigation-adoption.ts | No test-reaching edge recorded for the InvestigationAdoptionPolicy class; Story test files pass, so the graph may have missed the edge. |
| LOW | src/daemon/review-investigation-adoption.ts | No test-reaching edge recorded for assertSelected(); Story test files pass, so the graph may have missed the edge. |
| LOW | src/daemon/review-investigation-adoption.ts | No test-reaching edge recorded for productionInvestigationAdmission(); Story test files pass, so the graph may have missed the edge. |
| LOW | src/daemon/review-investigation-adoption.ts | No test-reaching edge recorded for policyFor(); Story test files pass, so the graph may have missed the edge. |
| LOW | scripts/review-investigation-probe.mjs | No test-reaching edge recorded for runProbeOperator(); it is only exercised via the builder-reported smoke test, which the gate did not run itself, so the graph may have missed a direct edge. |

## quality — 0 finding(s)

_No findings._

