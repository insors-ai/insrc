# Code-review evidence — measured coverage of the delivery module

The first code review's coverage findings came from hollow graph grounding: the new code had no test edges indexed,
so functions such as `showMore`, `unknownStages`, `taskResultTone`, `buildBoardViewModel`, `buildEpicRollup`,
`reduceBoardState` and `parseBoardUpMessage` showed an empty testsReaching. Coverage was measured by running the
suite instead.

[coverage.txt](coverage.txt): `node --import tsx --test --experimental-test-coverage
--test-coverage-include='src/delivery/*.ts' src/delivery/__tests__/*.test.ts` in `vscode-plugin`. the delivery tests
pass and the module's measured coverage is in the file (re-run after every review round). Every function named in the findings is
reached:

- `showMore`: board-model.test.ts ("with an epic scope and a search, …"), board-host.test.ts ("show-more reveals the
  next page of one stage, …").
- `unknownStages`: board-model.test.ts ("unknownStages counts every stage id outside the six, …"), board-host.test.ts
  ("an item with an unknown stage is left off the board and logged once per refresh").
- `taskResultTone`: board-details.test.ts ("kicker, chips and TaskRowView.resultTone").
- `buildBoardViewModel`, `buildEpicRollup`, `buildIssueView`, `epicRowOf`: board-model.test.ts and board-views.test.ts.
- `reduceBoardState` and the trail: board-state.test.ts (five navigation tests).
- `parseBoardUpMessage`: board-protocol.test.ts (five tests).
- `createDeliveryBoardHost`, `renderBoardDocument` and the webview script: board-host.test.ts (31 tests over the real
  host and the real script on the fake DOM).

The webview script is a string, so line coverage does not count it; board-host.test.ts boots it on the fake DOM.

[full-plugin-suite.txt](full-plugin-suite.txt): the full plugin suite after the last review round, at its baseline
(only the known manifest-catalog failure, 4 live skips).
