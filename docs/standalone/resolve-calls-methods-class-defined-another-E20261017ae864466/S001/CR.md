<!-- insrc:artifact CR-ae864466e7f1f4ea-S001 -->

# Code review: ae864466e7f1f4ea:S001

⛔ **BLOCK** — HIGH 10 · MED 3 · LOW 0 · model `codex:gpt-6-astra`

**Changed files:** 10

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 13 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | AGENTS.md | The supplied changed file and section symbols all have empty testsReaching edges; none is exercised under the specified coverage criterion. |
| HIGH | CLAUDE.md | The supplied changed file and section symbols all have empty testsReaching edges; none is exercised under the specified coverage criterion. |
| HIGH | src/daemon/queue.ts | All listed changed symbols have empty testsReaching edges. The test records provide no reaching coverage for these symbols. |
| HIGH | src/indexer/doc-summary-sweep.ts | All listed changed symbols have empty testsReaching edges, including runDocSummarySweep and its outcome helpers. |
| HIGH | src/indexer/index.ts | All supplied changed symbols have empty testsReaching edges. No passing-test coverage is established for them by the supplied graph. |
| HIGH | src/indexer/parser/typescript.ts | All listed changed symbols have empty testsReaching edges. Although method-calls-cross-file.test.ts passed, no supplied edge connects that test file to these symbols. |
| HIGH | src/daemon/__tests__/queue-lanes.test.ts | The changed file symbol has empty testsReaching edges. |
| MED | src/daemon/__tests__/queue-lanes.test.ts | Reaching tests for gate, tick, until and label are present but failing/unverified: their test file is absent from the test record, so its pass-state is unverified. |
| HIGH | src/indexer/__tests__/doc-summary-sweep.test.ts | The changed file symbol has empty testsReaching edges. |
| MED | src/indexer/__tests__/doc-summary-sweep.test.ts | Reaching tests for entity and world are present but failing/unverified: their test file is absent from the test record, so its pass-state is unverified. |
| HIGH | src/indexer/__tests__/method-calls-cross-file.test.ts | The changed file symbol has empty testsReaching edges. The file's passing result confirms coverage of callersIn through its supplied edge, but does not supply a reaching edge for the file symbol itself. |
| HIGH | src/indexer/__tests__/summary-sweep-progress.test.ts | These supplied changed symbols have empty testsReaching edges. |
| MED | src/indexer/__tests__/summary-sweep-progress.test.ts | Reaching tests for sweep, gate, tick and until are present but failing/unverified: their test file is absent from the test record, so its pass-state is unverified. |

## quality — 0 finding(s)

_No findings._

