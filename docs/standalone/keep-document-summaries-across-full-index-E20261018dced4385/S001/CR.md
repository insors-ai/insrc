<!-- insrc:artifact CR-dced43851723554f-s1 -->

# Code review: dced43851723554f:S001

⛔ **BLOCK** — HIGH 16 · MED 6 · LOW 5 · model `codex:gpt-6-astra`

**Changed files:** 15

## adherence — 0 finding(s)

_No findings._

## conventions — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/db/__tests__/doc-summary-carry.test.ts:unknown | inTxn declares onlyIfAbsent?: boolean without the required explicit \| undefined. Line numbers were not provided. |
| LOW | src/db/__tests__/doc-summary-carry.test.ts:unknown | inTxn declares keepGoodSummary?: boolean without the required explicit \| undefined. Line numbers were not provided. |
| LOW | src/db/graph/store.ts:unknown | open_ declares dupSort?: boolean without the required explicit \| undefined. Line numbers were not provided. |
| LOW | src/db/graph/store.ts:unknown | backupGraphStore declares compact?: boolean without the required explicit \| undefined. Line numbers were not provided. |

## coverage — 22 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/analyze/summariser/__tests__/summarise-doc-current.test.ts | The listed file symbol and helpers have empty testsReaching edges. Under the supplied coverage rule, each is a not-exercised gap despite this test file's passing result. |
| HIGH | src/analyze/summariser/driver.ts | Each named symbol has empty testsReaching edges. Passing tests reaching summariseDoc do not establish coverage for these symbols under the supplied rule. |
| HIGH | src/daemon/__tests__/doc-summary-restore-ipc.test.ts | The file symbol has empty testsReaching edges, constituting a not-exercised gap under the supplied rule. Its promised IPC test is present and passing. |
| HIGH | src/daemon/index.ts | Each named symbol has empty testsReaching edges; the passing IPC test supplies no reaching edge for these symbols. |
| HIGH | src/db/__tests__/doc-summary-carry.test.ts | The file symbol has empty testsReaching edges, constituting a not-exercised gap under the supplied rule. All eight promised tests in this file are present and passing. |
| HIGH | src/db/__tests__/doc-summary-restore.test.ts | The file symbol and BackupRow have empty testsReaching edges. All three promised tests in this file are present and passing. |
| HIGH | src/db/__tests__/entities-return-to-pending.test.ts | The file symbol has empty testsReaching edges, constituting a not-exercised gap under the supplied rule. The promised existing test file is present and passing. |
| HIGH | src/db/doc-summaries.ts | Each named symbol has empty testsReaching edges and therefore a not-exercised gap. Coverage cannot be inferred through callers with passing tests. |
| MED | src/db/doc-summaries.ts | Coverage is present but failing/unverified: the only reaching test file for these symbols is doc-summaries-lmdb.test.ts, which has no supplied test-record result. Their pass-state is unverified. |
| HIGH | src/db/entities.ts | Each named symbol has empty testsReaching edges and therefore a not-exercised gap under the supplied rule. |
| MED | src/db/entities.ts | Coverage is present but failing/unverified: none of these symbols' reaching test files appears in the supplied test-record results. Their pass-states are unverified. |
| HIGH | src/db/graph/store.ts | Each named symbol has empty testsReaching edges and therefore a not-exercised gap under the supplied rule. |
| MED | src/db/graph/store.ts | Coverage is present but failing/unverified: none of these symbols' reaching test or fixture files has a supplied test-record result. Their pass-states are unverified. |
| HIGH | src/db/index-state.ts | Each named symbol has empty testsReaching edges and therefore a not-exercised gap under the supplied rule. |
| MED | src/db/index-state.ts | Coverage is present but failing/unverified: the reaching files for these symbols are absent from the supplied test-record results. Their pass-states are unverified. |
| HIGH | src/indexer/__tests__/doc-summary-sweep.test.ts | The file symbol has empty testsReaching edges, constituting a not-exercised gap under the supplied rule. The promised kept-good classification test is present and passing. |
| HIGH | src/indexer/__tests__/full-index-rebuild.test.ts | Each named symbol has empty testsReaching edges. All five promised integration tests in this file are present and passing, but that does not replace the missing symbol-reaching edges. |
| HIGH | src/indexer/index.ts | Each named symbol has empty testsReaching edges and therefore a not-exercised gap. Passing tests reaching processJob do not establish these symbols' coverage under the supplied rule. |
| MED | src/indexer/index.ts | Coverage is present but failing/unverified: the reaching files for these symbols—reconcile.test.ts, cross-file-modes.test.ts, index-run-record.test.ts and summary-sweep-progress.test.ts—have no supplied test-record results. Their pass-states are unverified. |
| HIGH | src/understanding/__tests__/storage.test.ts | The file symbol has empty testsReaching edges, constituting a not-exercised gap under the supplied rule. |
| MED | src/understanding/__tests__/storage.test.ts | Coverage is present but failing/unverified: record is reached by storage.test.ts, but that file has no supplied test-record result. Its pass-state is unverified. |
| HIGH | src/indexer/__tests__/full-index-rebuild.test.ts | The promised smoke test has no corresponding artifact or test result in the supplied grounding. The passing BUILD task flags do not identify this smoke test or establish its presence. |

## quality — 0 finding(s)

_No findings._

## diagram — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | erDefinition:classes.DocSummary | class 'DocSummary' declares no identifier slot (identifier:true) — the entity has no primary key |

