<!-- insrc:artifact CR-2f27754d4ad00b8e-s4 -->

# Code review: 2f27754d4ad00b8e:s4

⚠️ **WARN** — HIGH 0 · MED 7 · LOW 14 · model `claude:opus`

**Changed files:** 70

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 6 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/steps/build-step/phases/validate.ts:618 | When persistBuildRecord fails through the RoundWriter (for example, updateContent throws LifecycleConflictError or the log append fails), the catch block only calls log.warn and returns { next: 'done', verdict, passed }. The verdict carries no note naming the error, so the step reports a quiet success while the round was not recorded. The TESTS persist on the same turn does attach a testRecordNote; the BUILD persist does not. |
| MED | src/daemon/workflow-review-rpc.ts:102 | workflowReviewStart passes only `lifecycle` to reviewArtifactFile, never an `actor`, even though ReviewArtifactOpts has an optional actor field (run-artifact.ts:62). The daemon review therefore records under whatever default reviewArtifactFile applies, not an actor that workflowReviewStart sets. |
| LOW | src/workflow/artifact-core/journal.ts:35 | StagedOperation.priorHeadHash is a required string, and a create stores the sentinel 'absent' in it. isStagedOperation also rejects a journal file that has no priorHeadHash. The approved data model makes the field optional and absent for a create, and says pending should check it only 'when present'. |
| LOW | src/workflow/artifact-core/journal.ts:93 | The file journal's clear() calls read(id) first, so it rejects when the journal file is invalid (the test asserts this). The contract declares no errors for clear. |
| LOW | src/workflow/artifact-core/sidecar-store.ts:136 | When the same (artifactId, entry id) appears with different content, the HistoryReadError names only the later line (`where`). It does not name the line of the first frame that was kept. |
| LOW | src/workflow/artifact-core/sidecar-store.ts:146 | When .gitattributes or .gitignore cannot be written, ensureLines only logs a warning. Nothing reports the missing rules in the daemon's status. |

## conventions — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/workflow-approve.ts:37 | The comment line '// The repository whose store holds the artifact: ...' starts at column 0 inside the function body, while its continuation line and the rest of the block use tab indentation. This looks like an indentation slip. |
| LOW | src/daemon/workflow-approve.ts:41 | `let actor;` is declared with no type and gets its type from the later `approvalActorOf` assignment. The sibling `let lifecycle: LifecycleService;` is typed explicitly, and the touched modules generally annotate deferred-assignment locals, so this one should be `let actor: Actor;` too. |
| LOW | src/daemon/lifecycle-registry.ts:14 | 'node:fs' is imported twice: `{ existsSync, statSync }` on line 12 and `{ realpathSync }` on line 14, with the 'node:path' import between them. Elsewhere in the touched modules each node: module is imported once. |
| LOW | src/workflow/artifact-core/__tests__/sidecar-files.test.ts:4 | The project import `InvalidArtifactKeyError` from '../../artifact-ids.js' comes before the node:fs/os/path imports. In the other new artifact-core tests, the node: built-ins come first and project imports follow. |

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/steps/build-step/phases/validate.ts:459 | Present but unverified. The daemon's validate turn now hands `roundWriterFor(repoPath)` to `persistTestRecordTask` and `persistBuildRecord` and awaits them. The only tests that drive this path end to end are `src/daemon/steps/build-step/__tests__/build-step.test.ts` and `build-start.test.ts`. Both were edited in this Story: `seedSidecarRules`, the `.log.jsonl` files in the dirty-file list, and the stale changeLog now written through `lifecycleFor(repo).service.updateContent`. Neither file appears in the test record, so whether they pass is not confirmed. round-recording.test.ts does exercise the persisters with a RoundWriter, but it does not go through validate.ts. Every changed symbol's testsReaching is empty because this grounding is a file-level diff with no graph edges, so that emptiness is not evidence of a gap. |
| MED | src/daemon/steps/build-step/phases/implement.ts:173 | Present but unverified. The Trivial standalone implement path is now async and stores the first BUILD round through `roundWriterFor(repoPath)`. That relies on the new `rootKinds: ['BUILD','TESTS','CR']` creation context in `lifecycle-registry.ts` and `codecs.ts`, which lets the record anchor on its own clock. No test in the record exercises this first-round Trivial creation through the registry. round-recording.test.ts seeds a DEF first, so it never hits the root-kind branch. The only candidate is `build-step.test.ts` (the standalone routes), and it is not in the test record. |
| LOW | src/workflow/runners/build/completion-record.ts:97 | Present but unverified. `ensureBuildRecordOnCompletion` now goes through `persistBuildRecord(repoPath, rec, through)` instead of its own `updateContent` call. `storyWorkflowFiles` (own-files.ts) now adds the BUILD and TESTS log and feedback line files. Both are asserted in `src/workflow/runners/build/__tests__/completion-record.test.ts`, which is not in the test record. The same applies to the migrated legacy writer tests (build-record, test-record, test-record-revision, build-record-enrichment, provenance-build, record-intent, standalone-record-commit, anchor-folders, artifact-kinds, ledger-record-identity), which were converted to await the now-async persisters and also do not appear in the record. |
| LOW | src/daemon/__tests__/lifecycle-wiring.test.ts:134 | Present but unverified. The round-1 fix added the test 'one registry entry per repository however its path is written, and a single-artifact approval uses the repository the artifact sits in, not the environment's'. It covers `realpathSync` keying in lifecycle-registry.ts and `repoOfArtifactPath` in workflow-approve.ts. The record's latest run of this file (t8) lists only the first title. The round-1 test in history-order.test.ts, 'openFeedback compares instants, not their spelling', is likewise absent from the record. Neither was promised by the plan, but the round-1 behaviour they cover has no confirmed pass. |

## quality — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/steps/review-step/phases/verdicts.ts:116 | `lifecycle.inspect(artifactId)` now runs `store.finishPending`, so a staged write left by a crash can be finished here. That happens after `artifact` was already read from the head and after `fixed` was computed from its body. Both write paths then use that stale copy. The fix path calls `updateContent` with `fixed.body` built from the old content, which overwrites the write that was just finished. The report-only path writes `{...artifact, meta.review}` as a meta-only write, which puts the old body back while the log records the newer revision. The head then no longer matches its log or its stored hash. Fix: read the head again after `inspect`, or finish pending writes before reading the artifact. |
| MED | src/daemon/workflow-approve.ts:61 | The approval runs against the repository the artifact sits in (`repoForStore = ofPath ?? repoPath`), but the bugfix follow-on is still given `repoPath`, the request's or the environment's repository. If INSRC_REPO names another repository, which is the case the new test covers, the approval goes to the right store but `advanceApprovedBugfixes` locates parents and advances the chain in the wrong repository. Pass `repoForStore` to `followOn` (and use it when deciding whether to skip). |
| MED | src/workflow/artifact-core/store.ts:348 | `completePending` refuses a head that changed after a write was staged with `LifecycleConflictError(id, 'head-ahead-of-log', ...)`. That reason is wrong: the log was not reconciled; the head was edited outside the store. Callers and tests that match on the reason (for example `/log-ahead-of-head/` and `'head-ahead-of-log'`, which `ArtifactStore.write` treats as tolerable) can misclassify this case. In the write path, `integrity.reason !== 'head-ahead-of-log'` is the exemption, so the same label now means both 'safe to proceed' and 'a person has to resolve this'. Give it its own reason. |
| LOW | src/workflow/runners/build/standalone-record.ts:364 | `isFirst` is computed as `!existsSync(first.jsonPath)` before `storeRound`, but `storeRound` deletes an unreadable head (`discardUnreadableHead`) and then creates it fresh on the store's clock. In that case `isFirst` is false, so the build's `createdAt`/`epicCreatedAt` are not restored, and the re-prepared record takes the store's creation time. That time can date the record into a different folder. Compute `isFirst` after the discard, or from whether `storeRound` created the head. |
| LOW | src/workflow/artifact-core/journal.ts:79 | When a journal file is corrupt, `pending` and `clear` throw on every call, and since every write and `inspect` first finishes pending work, every later write of that artifact is blocked until someone deletes the file by hand. Refusing to treat a corrupt file as an empty journal is deliberate, but nothing provides a way to recover or quarantine the file. Consider moving it aside with a warning, or say in the error that deleting the file recovers. |
| LOW | src/daemon/lifecycle-registry.ts:14 | `realpathSync` comes from a second `node:fs` import line alongside `existsSync, statSync`. Merge the two imports (style only). |
| LOW | src/daemon/workflow-approve.ts:37 | The comment line `// The repository whose store holds the artifact...` has lost its indentation, while its continuation line is indented. Style only. |

