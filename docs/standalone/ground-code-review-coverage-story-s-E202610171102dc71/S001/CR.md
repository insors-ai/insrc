<!-- insrc:artifact CR-1102dc7125ad0c07-s1 -->

# Code review: 1102dc7125ad0c07:S001

⛔ **BLOCK** — HIGH 24 · MED 0 · LOW 5 · model `codex:gpt-6-astra`

**Changed files:** 24

## adherence — 0 finding(s)

_No findings._

## conventions — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/mcp/daemon-stream.ts:unknown | approveWorkflow declares artifactPath?, epicHash?, and overrideReview? without explicit `\| undefined`. Add the union to each optional property. Line numbers were not supplied. |
| LOW | src/shared/review-stream.ts:unknown | groundingFromReply declares optional properties ok, grounding, reason, and error without explicit `\| undefined`. Add the union to each. Line numbers were not supplied. |
| LOW | src/workflow/code-review/__tests__/freshness.test.ts:unknown | deps declares optional properties watermark, mtime, repo, processing, and onReindex without explicit `\| undefined`. Add the union to each, parenthesizing the callback type. Line numbers were not supplied. |
| LOW | src/workflow/code-review/dimensions/coverage.ts:unknown | promisedTestsOf returns objects declaring `level?: string` without the required explicit `\| undefined`. Line numbers were not supplied. |
| LOW | src/workflow/code-review/grounding.ts:unknown | excludeInput returns an object declaring `exclude?: string[]` without the required explicit `\| undefined`. Line numbers were not supplied. |

## coverage — 24 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/daemon/__tests__/code-review-rpc-fallback.test.ts:1 | These changed symbols have empty testsReaching edges and therefore are not exercised under the required coverage rule. The file's two promised tests are present and passing; that does not supply missing symbol-reaching edges. |
| HIGH | src/daemon/__tests__/queue-code-index-work.test.ts:1 | These changed symbols have empty testsReaching edges. The promised test is present and passing, but the supplied grounding establishes no test reaching these symbols. |
| HIGH | src/daemon/code-review-rpc.ts:1 | Every listed changed symbol in this file has empty testsReaching edges, leaving their coverage unestablished under the required rule. |
| HIGH | src/daemon/index.ts:1 | These supplied changed symbols have empty testsReaching edges and are not exercised according to the grounding. |
| HIGH | src/daemon/queue.ts:1 | These changed symbols have empty testsReaching edges. Passing queue tests do not establish symbol coverage without the required reaching edges. |
| HIGH | src/daemon/steps/__tests__/in-daemon-client.test.ts:1 | These changed symbols have empty testsReaching edges despite this test file's passing state. Symbols with nonempty reaching edges in this file are covered and excluded from this finding. |
| HIGH | src/daemon/steps/code-review-step/__tests__/handler.test.ts:1 | These changed symbols have empty testsReaching edges. Both promised tests are present and passing, but the grounding supplies no reaching edges for these symbols. |
| HIGH | src/daemon/steps/code-review-step/handler.ts:1 | These changed symbols have empty testsReaching edges, including the fallback, judgement persistence and daemon-review paths. Passing test titles cannot replace the required symbol-reaching evidence. |
| HIGH | src/daemon/steps/code-review-step/types.ts:1 | All supplied changed symbols in this file have empty testsReaching edges; the stipulated rule identifies them as not-exercised gaps. |
| HIGH | src/mcp/daemon-stream.ts:1 | All supplied changed symbols in this file have empty testsReaching edges, so the grounding establishes no test coverage for them. |
| HIGH | src/shared/__tests__/review-stream-freshness.test.ts:1 | The changed file symbol has empty testsReaching edges. Its promised test is present and passing, but no reaching edge is supplied for the file symbol. |
| HIGH | src/shared/__tests__/review-stream.test.ts:1 | These changed symbols have empty testsReaching edges. The promised serialization test is present and passing; these symbol-level gaps remain under the stipulated rule. |
| HIGH | src/shared/review-stream.ts:1 | All supplied changed symbols have empty testsReaching edges, including freshness reply mapping and fallbackReason serialization. Passing corresponding test records do not supply the missing edges. |
| HIGH | src/workflow/code-review/__tests__/freshness.test.ts:1 | These changed symbols have empty testsReaching edges. The promised test is present and passing; deps has a reaching edge from this passing file and is excluded. |
| HIGH | src/workflow/code-review/__tests__/grounding.test.ts:1 | These changed symbols have empty testsReaching edges despite the file's passing test record. |
| HIGH | src/workflow/code-review/__tests__/subject.test.ts:1 | These changed symbols have empty testsReaching edges. The promised subject-record test is present and passing; git and put have reaching edges from the passing file and are excluded. |
| HIGH | src/workflow/code-review/dimensions/__tests__/coverage.test.ts:1 | These changed symbols have empty testsReaching edges. The complete promised coverage-prompt test is present and passing; symbols with reaching edges from this passing file are excluded. |
| HIGH | src/workflow/code-review/dimensions/coverage.ts:1 | These changed symbols have empty testsReaching edges, so the supplied grounding establishes no exercise of the coverage prompt or judgement implementation. |
| HIGH | src/workflow/code-review/dimensions/test-record-view.ts:1 | These changed symbols have empty testsReaching edges, including latest-run selection, malformed-record handling and BUILD task rendering. |
| HIGH | src/workflow/code-review/freshness.ts:1 | These changed symbols have empty testsReaching edges. The promised freshness test passes, but no supplied edge links a test to these symbols. |
| HIGH | src/workflow/code-review/grounding.ts:1 | Every supplied changed symbol in this file has empty testsReaching edges, leaving graph and diff grounding behaviour without the required symbol-level coverage evidence. |
| HIGH | src/workflow/code-review/runner.ts:1 | These supplied changed symbols have empty testsReaching edges, including review execution, fallback metadata persistence and markdown rendering. |
| HIGH | src/workflow/code-review/subject.ts:1 | These changed symbols have empty testsReaching edges. The promised BUILD/TESTS record test is present and passing, but symbol-reaching evidence is absent. |
| HIGH | src/workflow/code-review/types.ts:1 | All supplied changed symbols in this file have empty testsReaching edges; the stipulated rule identifies them as not-exercised gaps. |

## quality — 0 finding(s)

_No findings._

