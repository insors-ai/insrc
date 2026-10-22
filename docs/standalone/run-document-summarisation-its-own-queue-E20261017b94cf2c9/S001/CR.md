<!-- insrc:artifact CR-b94cf2c9058fd82a-s1 -->

# Code review: b94cf2c9058fd82a:S001

⛔ **BLOCK** — HIGH 8 · MED 0 · LOW 3 · model `codex:gpt-6-astra`

**Changed files:** 34

## adherence — 0 finding(s)

_No findings._

## conventions — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/db/graph/store.ts:unknown | open_ declares the optional property dupSort?: boolean without the required explicit \| undefined. Line numbers were not provided. |
| LOW | src/db/graph/store.ts:unknown | backupGraphStore declares the optional property compact?: boolean without the required explicit \| undefined. Line numbers were not provided. |
| LOW | src/indexer/__tests__/doc-summary-sweep.test.ts:unknown | world declares optional properties results, missing, edits, and stopAfterSummaries without the required explicit \| undefined. Line numbers were not provided. |

## coverage — 8 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/daemon/queue.ts | testsReaching is empty for the lane-routing symbols. Passing queue test files do not establish coverage under the supplied edge-based criterion. |
| HIGH | src/daemon/queue.ts | testsReaching is empty for the queue insertion and single-document extraction behaviour, despite the corresponding promised tests being present and passing. |
| HIGH | src/daemon/queue.ts | testsReaching is empty for the lane execution and shutdown symbols. The passing queue test records do not supply the missing reaching edges. |
| HIGH | src/daemon/queue.ts | testsReaching is empty for the queue accounting and lane-status symbols, despite corresponding tests being present and passing. |
| HIGH | src/db/doc-summaries.ts | The conditional-write helper has empty testsReaching. writeDocSummaryIfCurrent has passing test coverage, but its caller relationship cannot substitute for this helper's missing reaching edges. |
| HIGH | src/indexer/doc-summary-sweep.ts | The result classifier has empty testsReaching. The promised classification test is present and passing, but the supplied grounding does not establish that it reaches this symbol. |
| HIGH | src/indexer/index.ts | The sweep progress accessor has empty testsReaching. All promised progress tests are present and passing, but no reaching edge connects them to this symbol. |
| HIGH | src/indexer/index.ts | The document-summary integration symbols have empty testsReaching. Passing sweep and progress test files do not establish coverage of these symbols under the supplied criterion. |

## quality — 0 finding(s)

_No findings._

