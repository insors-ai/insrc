<!-- insrc:artifact CR-c2ba6fa62a148ed1-s4 -->

# Code review: c2ba6fa62a148ed1:s4

⚠️ **WARN** — HIGH 0 · MED 3 · LOW 7 · model `claude:opus`

**Changed files:** 144

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/design/corpus/sources/assessment.ts:1 | The changed set for Story s4 includes the whole design-intelligence corpus work: src/design/corpus/** (S001/S002 of Epic 7e0ae92e), plans/design-intelligence-*.md, plans/reviews/*, and docs/plans/design-intelligence-prd.{md,html}. None of t1–t12 plans these changes. They belong to a different Epic, which most likely means the review's diff range was scoped too widely, not that s4 built them. A spot check of the s4 code against the LLD and plan matched: the owner and permitted-reader declarations are each called exactly once (daemon index.ts:117, mcp/server.ts:1258); LmdbStoreNotOwnerError and LmdbStoreLocksLostError exist; the MDB_BAD_RSLOT correction is applied; the write probe uses a 10 s bound; the server, queue and status catch sites call recordStoreFailureIfLockError; stopDaemon uses the 5 s reply bound, the daemon/index.js suffix check and SIGKILL; daemon-ctl.sh has force_stop_daemon at both its stop and start sites with an INSRC_CTL_STOP_WAIT_SECS override; restart records the force-stop step; the storeFailure field is mirrored in the CLI pane and both plugins; the store-file refusal is wired into helpers, copy, move and the search tools. No departure from the approved design was found in the s4 code itself. |

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/mcp/server.ts:1258 | `runInsrcMcpStdio` now imports `../db/graph/store.js` and calls `declareLiveStoreReaderUntilS11()`. This makes the MCP process a declared in-process reader of the live graph store. Rule k5 says MCP reaches storage only through daemon IPC. The comment calls this TEMPORARY and says Story s11 of Epic c2ba6fa6 will remove it. The in-process reads were already there, so the change records an existing exception rather than adding new access. Nothing in the code enforces that s11 actually removes the call. Track the removal as an explicit acceptance criterion of s11 so the exception does not become permanent. |
| LOW | jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonStatusGatewayTest.kt:87 | The test calls `ai.insors.insrc.jetbrains.ops.storeFailureRow` by its fully-qualified name three times instead of importing it. Kotlin tests normally import cross-package symbols, but this diff gives too few examples from the test module to treat that as an established local idiom. |

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/db/graph/store.ts:1 | testsReaching is empty for every changed symbol in this Story, including store.ts, status.ts, shutdown.ts, server.ts, queue.ts, fatal.ts, store-file-open-diagnostic.ts, the file/search builtins and the CLI daemon service. This looks like hollow graph grounding, not a real gap. 154 of the 170 entries have no hunk text, and the change set also pulls in unrelated design-intelligence commits from Epic 7e0ae92e. A direct check finds a dedicated test file on disk for each changed area: store-health, lock-loss-detection, lock-loss-reproduction, live-store-owner, live-store-refusal, no-live-store-in-tests, store-failure-dispatch, status-store-failure, shutdown-store-failure, store-file-open-diagnostic, live-store-file-refusal, daemon-stop, daemon-stop-forced, daemon-ctl-forced-stop and review-source-roots-daemon. I am not reporting a not-exercised HIGH, because an empty testsReaching here is a grounding artifact. Re-run the review with grounding scoped to the Story's own commits (db3df771..59e44a23 and their predecessors) to get real edges. |
| MED | src/daemon/__tests__/store-failure-dispatch.test.ts:1 | All 38 promised unit and integration tests have a matching test file on disk. The daemon pane and both plugins case is covered by src/cli/__tests__/command.test.ts, tui.test.ts, vscode-plugin daemon-gateway.test.ts and the JetBrains DaemonStatusGatewayTest.kt, all of which reference storeFailure. The review grounding has no build record, so their pass-state is unverified here: present but unverified, not missing. The pass results are recorded in the Story's TESTS.md/BUILD.md (docs/epics/...c2ba6fa6/S004/), which this review's grounding does not include. |
| LOW | scripts/daemon-ctl.sh:1 | The three promised smoke tests on the installed daemon (outside script refused then daemon write succeeds; healthy restart unchanged; formerly live-store test files pass with no lock-file open) were reported by the builder, not run by the gate. S004/TESTS.md records them as pass with evidence in S004/smoke.md. They are present but not independently verified. |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:1427 | The gateway reads a store failure only through the nested `cause` string. If the daemon sends a `storeFailure` object whose `cause` is missing, or is not a string, `storeFailureCause` becomes null. The plugin then shows the store as healthy and no 'Store FAILED' row appears, so a real failure is hidden. The test's malformed case only covers `storeFailure` being a non-map. Consider treating any present `storeFailure` map as failed, with a fallback text such as the `kind` field or 'unknown cause'. A blank `cause` also renders as 'FAILED — ' with no detail. |
| LOW | src/mcp/server.ts:1258 | `declareLiveStoreReaderUntilS11()` runs unconditionally at MCP startup through an awaited dynamic import. Because nothing catches it, any throw from the import or the declaration aborts `runInsrcMcpStdio` before tools are registered. Also, the declaration applies to the whole MCP process, not only to the analyze-step paths named in the comment. Every in-process store open in MCP is therefore exempt from the live-store refusal until s11 deletes the call. This is intended as temporary, but the exemption is wider than the stated need. |
| LOW | docs/plans/design-intelligence-prd.html:1 | The HTML PRD is a hand-maintained second copy of the full Markdown PRD, with the same prose in both files. Nothing generates or checks one from the other, so an edit made to one can leave the two out of sync. Generate the HTML from the Markdown, or add a parity check. |
| LOW | jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonStatusGatewayTest.kt:78 | One test method covers three separate scenarios: a failed store, a healthy store, and a malformed field. It also calls `ai.insors.insrc.jetbrains.ops.storeFailureRow` by its full package name instead of importing it. Splitting the scenarios would make a failure easier to locate. This is a matter of taste, not a risk. |

