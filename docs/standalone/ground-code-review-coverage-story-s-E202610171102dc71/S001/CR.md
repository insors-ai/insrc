<!-- insrc:artifact CR-1102dc7125ad0c07-S001 -->

# Code review: 1102dc7125ad0c07:S001

⛔ **BLOCK** — HIGH 22 · MED 6 · LOW 6 · model `codex:gpt-6-astra`

**Changed files:** 22

## adherence — 0 finding(s)

_No findings._

## conventions — 6 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/mcp/daemon-stream.ts:0 | approveWorkflow declares optional properties artifactPath, epicHash, and overrideReview without explicit `\| undefined`. Line numbers were not supplied; 0 denotes an unavailable line. |
| LOW | src/shared/review-stream.ts:0 | groundingFromReply declares optional properties ok, grounding, reason, and error without explicit `\| undefined`. Line numbers were not supplied; 0 denotes an unavailable line. |
| LOW | src/shared/review-stream.ts:0 | freshnessFromReply declares optional properties isProcessing, inFlight, pendingCodeIndexJobs, staleFiles, and error without explicit `\| undefined`. Line numbers were not supplied; 0 denotes an unavailable line. |
| LOW | src/workflow/code-review/__tests__/freshness.test.ts:0 | deps declares optional properties watermark, mtime, repo, processing, and onReindex without explicit `\| undefined`. Line numbers were not supplied; 0 denotes an unavailable line. |
| LOW | src/workflow/code-review/dimensions/__tests__/coverage.test.ts:0 | viewOf declares the optional reason property without explicit `\| undefined`. Line numbers were not supplied; 0 denotes an unavailable line. |
| LOW | src/workflow/code-review/dimensions/coverage.ts:0 | promisedTestsOf declares the optional level property without explicit `\| undefined`. Line numbers were not supplied; 0 denotes an unavailable line. |

## coverage — 28 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/daemon/__tests__/code-review-rpc-fallback.test.ts:1 | These changed symbols each have empty testsReaching and are not exercised according to the supplied grounding. Both promised tests are present and passing, but their results do not establish the missing reachability edges. |
| HIGH | src/daemon/__tests__/queue-code-index-work.test.ts:1 | These changed symbols each have empty testsReaching. The promised test is present and passing, but the supplied grounding records no test reaching these symbols. |
| HIGH | src/daemon/code-review-rpc.ts:1 | Each listed changed symbol has empty testsReaching, constituting a not-exercised gap under the supplied coverage rule. |
| HIGH | src/daemon/index.ts:1 | Each listed changed symbol has empty testsReaching, constituting a not-exercised gap under the supplied coverage rule. |
| HIGH | src/daemon/queue.ts:1 | Each listed changed symbol has empty testsReaching. Passing queue tests do not establish reachability absent from the supplied edges. |
| HIGH | src/daemon/steps/__tests__/in-daemon-client.test.ts:1 | Each listed changed symbol has empty testsReaching, despite the recorded passing tests in this file. |
| HIGH | src/daemon/steps/code-review-step/__tests__/handler.test.ts:1 | Each listed changed symbol has empty testsReaching. Both promised handler tests are present and passing, but the grounding records no test reaching these symbols. |
| HIGH | src/daemon/steps/code-review-step/handler.ts:1 | Each listed changed symbol has empty testsReaching, constituting a not-exercised gap under the supplied coverage rule. |
| HIGH | src/daemon/steps/code-review-step/types.ts:1 | Each listed changed symbol has empty testsReaching, constituting a not-exercised gap under the supplied coverage rule. |
| HIGH | src/mcp/daemon-stream.ts:1 | Each listed changed symbol has empty testsReaching, constituting a not-exercised gap under the supplied coverage rule. |
| HIGH | src/shared/__tests__/review-stream-freshness.test.ts:1 | The changed file symbol has empty testsReaching. Its promised test is present and passing, but the grounding supplies no reaching edge. |
| HIGH | src/shared/__tests__/review-stream.test.ts:1 | Each listed changed symbol has empty testsReaching. The promised serialization test is present and passing, but the grounding supplies no reaching edges for these symbols. |
| HIGH | src/shared/review-stream.ts:1 | Each listed changed symbol has empty testsReaching, constituting a not-exercised gap under the supplied coverage rule. |
| HIGH | src/workflow/code-review/__tests__/freshness.test.ts:1 | These changed symbols have empty testsReaching. The promised freshness test is present and passing, but the supplied grounding records no reaching edges for these symbols. |
| HIGH | src/workflow/code-review/__tests__/subject.test.ts:1 | Each listed changed symbol has empty testsReaching. The promised record-loading test is present and passing, but the supplied grounding records no reaching edges for these symbols. |
| HIGH | src/workflow/code-review/dimensions/__tests__/coverage.test.ts:1 | Each listed changed symbol has empty testsReaching. The promised latest-run and malformed-record test is present and passing, but the supplied grounding records no reaching edges for these symbols. |
| HIGH | src/workflow/code-review/dimensions/coverage.ts:1 | Each listed changed symbol has empty testsReaching, constituting a not-exercised gap under the supplied coverage rule. |
| HIGH | src/workflow/code-review/dimensions/test-record-view.ts:1 | Each listed changed symbol has empty testsReaching, constituting a not-exercised gap under the supplied coverage rule. |
| HIGH | src/workflow/code-review/freshness.ts:1 | Each listed changed symbol has empty testsReaching, constituting a not-exercised gap under the supplied coverage rule. |
| HIGH | src/workflow/code-review/runner.ts:1 | Each listed changed symbol has empty testsReaching, constituting a not-exercised gap under the supplied coverage rule. |
| HIGH | src/workflow/code-review/subject.ts:1 | Each listed changed symbol has empty testsReaching, constituting a not-exercised gap under the supplied coverage rule. |
| HIGH | src/workflow/code-review/types.ts:1 | Each listed changed symbol has empty testsReaching, constituting a not-exercised gap under the supplied coverage rule. |
| MED | src/daemon/__tests__/code-review-rpc-fallback.test.ts:1 | subjectFor has a reaching entry named rpcDeps, but that name is not covered as a test title in the record: present but failing/unverified, specifically unverified. The two promised test titles are independently confirmed passing. |
| MED | src/daemon/steps/__tests__/in-daemon-client.test.ts:1 | These symbols have reaching entries, but their names are not covered as test titles in the record: present but failing/unverified, specifically unverified. A passing file does not confirm the pass-state of these unmatched entries. |
| MED | src/daemon/steps/code-review-step/__tests__/handler.test.ts:1 | These symbols have reaching entries, but their names are not covered as test titles in the record: present but failing/unverified, specifically unverified. Both promised handler tests are separately present and passing. |
| MED | src/workflow/code-review/__tests__/freshness.test.ts:1 | deps has a reaching entry named at, which is not covered as a test title in the record: present but failing/unverified, specifically unverified. |
| MED | src/workflow/code-review/__tests__/subject.test.ts:1 | git and put have a reaching entry named mkStoryRepo, which is not covered as a test title in the record: present but failing/unverified, specifically unverified. |
| MED | src/workflow/code-review/dimensions/__tests__/coverage.test.ts:1 | These symbols have reaching entries, but their names are not covered as test titles in the record: present but failing/unverified, specifically unverified. The promised coverage test is separately present and passing. |

## quality — 0 finding(s)

_No findings._

