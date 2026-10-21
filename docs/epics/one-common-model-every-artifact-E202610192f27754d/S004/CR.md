<!-- insrc:artifact CR-2f27754d4ad00b8e-s4 -->

# Code review: 2f27754d4ad00b8e:s4

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 15 · model `claude:opus`

**Changed files:** 71

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/workflow-review-rpc.ts:102 | workflowReviewStart now passes the repository's LifecycleService to reviewArtifactFile, but it does not pass an actor. The LLD says ReviewArtifactOpts "carries lifecycle and actor, which workflowReviewStart now always sets". The daemon review path therefore records its lifecycle review under whatever default reviewArtifactFile picks, not an actor this caller supplies. |
| LOW | src/workflow/artifact-core/sidecar-store.ts:130 | When two frames repeat an (artifactId, entry id) with different content, readRecords raises HistoryReadError naming only the second frame's line (`where`). The LLD requires the error to name both lines. The first frame's line number is not kept in `seen`, so it cannot be reported. |
| LOW | src/workflow/artifact-core/sidecar-store.ts:150 | When .gitattributes or .gitignore cannot be written, ensureLines only logs a warning, and it lists every wanted line rather than only the missing ones. The failure is not reported in the daemon's status as the LLD error path requires. |

## conventions — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/workflow-approve.ts:42 | `let actor;` is declared with no type annotation and gets its type from a later assignment inside the try block (an evolving `any`). The touched modules otherwise annotate deferred locals; the line above declares `let lifecycle: LifecycleService`. Annotate it as `let actor: Actor;`. |
| LOW | src/daemon/workflow-approve.ts:37 | The comment line `// The repository whose store holds the artifact...` starts at column 0, but its continuation line and the code around it are tab-indented inside the function body. This breaks the module's indentation idiom. |
| LOW | src/daemon/lifecycle-registry.ts:14 | `realpathSync` is imported from 'node:fs' in a second import statement, directly below `import { existsSync, statSync } from 'node:fs'`. The touched modules merge named imports from the same module into one statement. |
| LOW | src/workflow/artifact-core/sidecar-store.ts:47 | `decodeFrame` reads the regex capture with `m[2] as string`, a cast that skips the `T \| undefined` handling noUncheckedIndexedAccess asks for. The group always exists once the match succeeds, so the risk is low, but a `?? ''` fallback or an explicit check would keep it within the rule. |

## coverage — 6 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/steps/build-step/phases/validate.ts:633 | Not covered: the validate turn now puts a BUILD persist failure into the verdict's evidence as `buildRecordNote`, and no test in the changed set or the test record exercises that branch. No test makes `persistBuildRecord` throw a non-MissingAnchorError and then checks that `verdict.evidence.buildRecordNote` names the error while `passed` stays the same. `build-step.test.ts` was changed but is not listed in the test record, so whether it passes is unverified too. |
| LOW | src/workflow/artifact-core/__tests__/round-recording.test.ts:198 | Present but not verified: the test 'the first BUILD round of a Trivial standalone build, with no earlier record in the work item, is created through the registry store on the record's own time' is in the file but not in the test record. The record's latest run of round-recording.test.ts lists only the other four titles. This test is the only one that exercises `rootKinds` in codecs.ts, the `isFirst` createdAt/epicCreatedAt restore in `persistBuildRecord`, and `roundWriterFor` on the Trivial path that implement.ts now takes. |
| LOW | src/daemon/__tests__/lifecycle-wiring.test.ts:133 | Present but not verified: the round-1 test 'one registry entry per repository however its path is written, and a single-artifact approval uses the repository the artifact sits in, not the environment's' is not in the test record. The record's run of lifecycle-wiring.test.ts (t8, before the review-round fixes) lists only the first test. That leaves the realpath normalisation in `lifecycleFor` and `repoOfArtifactPath` in `handleWorkflowApprove` with no confirmed result. |
| LOW | src/workflow/artifact-core/__tests__/history-order.test.ts:35 | Present but not verified: the round-1 test 'openFeedback compares instants, not their spelling' is not in the test record. The record's history-order.test.ts run (t4) lists only the first test, so whether `compareEntries`/`timeOf` handle stamps with and without milliseconds correctly is unconfirmed. |
| LOW | src/workflow/runners/build/own-files.ts:44 | Not verified: `storyWorkflowFiles` now also lists the BUILD/TESTS line files, and `ensureBuildRecordOnCompletion` now delegates to `persistBuildRecord(…, through)`. The tests that check this (completion-record.test.ts, build-step.test.ts, build-record.test.ts, test-record.test.ts and the other migrated persist tests) were changed but are not in the test record. These tests exist, but their pass state cannot be confirmed from the record. |
| LOW | src/daemon/lifecycle-registry.ts:1 | Grounding caveat: this review ran on degraded (diff-only) grounding. Every changed entry is a file-level diff with an empty `testsReaching`, test files included, so empty edges are not evidence of missing coverage, and I have not reported them as HIGH breaches. Instead I checked coverage against the test record. All 21 promised tests are present and passing there: the sidecar, journal, history-order, merge, lifecycle-update-outcome, lifecycle-wiring, verdicts-lifecycle, round-recording and inventory tests. The record predates the round-1 and round-2 fix commits (latest run 10:22, t12), so it does not confirm the fixes made in those commits (verdicts inspect-before-read, head-changed-after-stage reason). |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/runners/build/standalone-record.ts:362 | `isFirst` is computed as `!existsSync(jsonPath)` before `storeRound`, but `storeRound` (via `discardUnreadableHead`) also deletes an existing head it cannot read and lets the store create a fresh one on its own clock. In that case `isFirst` is false, so the code that restores the build's own `createdAt`/`epicCreatedAt` is skipped. The second `prepareBuildRecord` then merges onto the store-created head, where the prior `createdAt` wins, so the record takes the store's clock instead of the time the build gave it. That differs from the true first-write path and can re-date the record. Take the 'first' signal from `discardUnreadableHead`'s return value as well as from `existsSync`. |
| LOW | src/workflow/artifact-core/journal.ts:83 | The same try { return Promise.resolve(...) } catch (err) { return Promise.reject(err instanceof Error ? err : new Error(String(err))) } wrapper is written out three times here (stage/pending/clear) and twice more in FileSidecarStore.appendRecord/readRecords. `async` arrow functions or methods would give the same reject-on-throw behaviour without the boilerplate. |
| LOW | src/daemon/lifecycle-registry.ts:14 | `node:fs` is imported on two separate lines (existsSync/statSync, then realpathSync). Merge them into one import. Style only. |
| LOW | src/daemon/workflow-approve.ts:37 | The comment line '// The repository whose store holds the artifact…' has lost its leading tab, so it is out of line with the block it describes. Style only. |

