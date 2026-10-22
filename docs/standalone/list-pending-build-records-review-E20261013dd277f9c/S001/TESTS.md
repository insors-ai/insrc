<!-- insrc:artifact TESTS-dd277f9cddd6d879-s1 -->

# Tests: dd277f9cddd6d879 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 6 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## S001

Run at 2026-10-13T20:14:17.594Z on commit `e0903120`. Tests check: **failed**. 6 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

reported as failed by the builder: By hand in VS Code: after a Story's code review runs in the chat, its build record is in the review pane's table and can be opened and approved there; a build record of a Story still being built is not listed; a build record rejected in the pane leaves the table and is completed by approval in the chat

**unit: listPendingArtifacts lists a pending BUILD record whose Story has a code review record, with kind BUILD, its work item id and the path of its BUILD.md**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | listPendingArtifacts lists a pending BUILD record whose Story has a code review record, with kind BUILD, its work item id and the path of its BUILD.md | `src/workflow/__tests__/pending.test.ts` |

**unit: listPendingArtifacts leaves out a BUILD record with no code review record, an approved or a rejected one, and EXT, STUB and AMD records as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | listPendingArtifacts leaves out a BUILD record with no code review record, an approved or a rejected one, and EXT, STUB and AMD records as before | `src/workflow/__tests__/pending.test.ts` |

**unit: listPendingArtifacts gives a BUILD record an empty path when the BUILD.md its fields derive does not exist or does not carry this record's artifact marker, and lists the records in file-name order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | listPendingArtifacts gives a BUILD record an empty path when the BUILD.md its fields derive does not exist or does not carry this record's artifact marker, and lists the records in file-name order | `src/workflow/__tests__/pending.test.ts` |

**integration: handleArtifactContent serves a BUILD record's markdown by the path the pending list gives, with kind BUILD**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | handleArtifactContent serves a BUILD record's markdown by the path the pending list gives, with kind BUILD | `src/workflow/__tests__/artifact-content.test.ts` |

**integration: handleReviewDecision on a BUILD record: approve goes through the same approve call as any record and a result that call withholds is returned with its reason; reject stamps the record, after which it is not listed and the pane's call refuses a further decision on it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | handleReviewDecision on a BUILD record: approve goes through the same approve call as any record and a result that call withholds is returned with its reason; reject stamps the record, after which it is not listed and the pane's call refuses a further decision on it | `src/workflow/__tests__/review-decision.test.ts` |

**integration: docs review shell: a BUILD row is listed between ISSUE and CR, counted in the type select, and opens like any other row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: a BUILD row is listed between ISSUE and CR, counted in the type select, and opens like any other row | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**smoke: The daemon's workflow and MCP suites and the plugin's suite pass apart from failures that exist before this Story**

Reported by the builder, not run by the gate: **pass**. Evidence: After the merge of origin/main on 2026-10-14: the daemon's workflow and MCP suites 1854 tests, 1851 pass, 0 fail (3 skipped); npx tsc --noEmit clean. Plugin: its typecheck clean and the review pane's test file 228 pass; the plugin's whole suite was last run before this Story's one added plugin test (1266 pass, 2 fail, the manifest-catalog failures that exist before this Story) and was not re-run

**smoke: By hand in VS Code: after a Story's code review runs in the chat, its build record is in the review pane's table and can be opened and approved there; a build record of a Story still being built is not listed; a build record rejected in the pane leaves the table and is completed by approval in the chat**

Reported by the builder, not run by the gate: **fail**. Evidence: Not yet performed: the daemon was updated and restarted with this change on 2026-10-14 and the live workflow.pending now returns two BUILD rows (older records, listed by id with no path) and none for the Stories still being built, but the user has not yet checked the pane's table, opened a build record there, or tried a rejection

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-content.test.ts` | 0 | 23 | 0.5 s |  |
| `src/workflow/__tests__/pending.test.ts` | 0 | 13 | 0.5 s |  |
| `src/workflow/__tests__/review-decision.test.ts` | 0 | 9 | 0.6 s |  |
| `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` | 0 | 228 | 19.3 s |  |
