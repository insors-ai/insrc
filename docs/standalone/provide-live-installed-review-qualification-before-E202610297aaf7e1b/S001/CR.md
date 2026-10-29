<!-- insrc:artifact CR-7aaf7e1b4a54e86f-s1 -->

# Code review: 7aaf7e1b4a54e86f:s1

⛔ **BLOCK** — HIGH 5 · MED 3 · LOW 0 · model `claude:claude-sonnet-5`

**Changed files:** 31

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/daemon/review-investigation-repository.ts | Promised integration test 'Affected native/adoption/repository/MCP/routing regressions preserve legacy and design behavior' has no corresponding test in any Story test file (adoption, repository, probe, gateway, provider-lane or recovery suites) and is not listed in reportedTests. |
| HIGH | src/agent/providers/native-investigation-probe.ts | Promised live test 'Actual installed probe per authorized provider/mode produces supported observation evidence or explicit unsupported' is absent from the test record and not present in reportedTests (only the compiled-protocol smoke test is reported there). |
| HIGH | src/daemon/review-investigation-repository.ts | Promised live test 'Post-approval exact commit-scoped acceptance validates progress/cancel/recovery/CR receipt and truthful accounting' is absent from the test record and not present in reportedTests. |
| HIGH | scripts/review-investigation-probe.mjs | Promised smoke test 'Acceptance report distinguishes pending prerequisites, software completion and explicit activation signoff' is absent from the test record and not present in reportedTests. |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/agent/providers/investigation-probe-grant.ts | consumeInvestigationProbeGrant(grant, signal) has an empty callee list — it calls none of the verification helpers (digestValue/freezeValue/snapshotValue) that issueInvestigationProbeGrant used to produce the grant's digest, and does not appear to check the passed AbortSignal before returning a ProbeGrantContext. |
| MED | src/daemon/review-investigation-repository.ts | InvestigationRepository.sources() calls assertFresh(), and assertFresh() calls sources() back — a direct two-method call cycle within the same class, which is hard to reason about and risks unbounded recursion if either side's guard condition doesn't terminate the loop for some manifest/descriptor state. |
| MED | src/daemon/review-investigation-repository.ts | InvestigationRepository.prepare() fans out to 16 distinct callees (isLldBody, isPlanBody, computeExpectedDimensions, authorPartyOf, otherParty, refresh, productionRunId, scopedReviewCatalogDigest, createInvestigationPolicy, digestValue, buildLedgerBasis, appendImpactRequirements, initializeReviewLedger, prepareReviewSubject, request, sources) in one method body, mixing classification, policy creation, ledger bootstrap and subject preparation into a single god-method. |
| MED | src/agent/providers/claude-investigation-probe.ts | collectClaudeProbeObservations defines local missing(detail) and add(check, detail) helpers that duplicate the identically-signatured missing/add helpers inside collectCodexProbeObservations, re-implementing the same InvestigationProbeObservation-accumulation logic twice instead of sharing one helper. |

## diagram — 0 finding(s)

_No findings._

