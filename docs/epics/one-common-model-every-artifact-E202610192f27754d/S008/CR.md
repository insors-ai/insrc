<!-- insrc:artifact CR-2f27754d4ad00b8e-s8 -->

# Code review: 2f27754d4ad00b8e:s8

⚠️ **WARN** — HIGH 0 · MED 3 · LOW 11 · model `claude:opus`

**Changed files:** 27

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/tracker/comment-rules.ts:34 | isFrameworkComment recognises only insrc markers, so an attach comment posted before s8 ('Attached <type> `<id>`: <link>', no marker) is read in as a person's comment and recorded as feedback. The approved plan's t4 asks for exactly this ('no legacy shape', and false for the old unmarked Attached comment), and docs/plans/core-data-model.md hands the cleanup to s9. But it contradicts the LLD, whose postcondition and edge case say the older shape is skipped and counted as a framework comment, and whose backwardCompat says isFrameworkComment recognises that shape. The plan and the LLD disagree here; the code follows the plan. Either record this as an accepted change from the LLD or add the legacy-shape check. |
| LOW | src/daemon/steps/build-step/phases/validate.ts:230 | Validate runs the comment sync only after the validation session has finished, and only when it returns next:'done'. The holder therefore gets no tracker feedback when validate starts, and a validate turn that ends in an error (for example a failed session) never syncs at all. The LLD says comments become feedback 'when the holder starts to implement or validate a Task'. Implement syncs before it answers; validate syncs at the end. |

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/tracker-sync-comments.ts:23 | The new `TrackerSyncCommentsParams` interface declares its optional properties without `\| undefined`: `repo?: string`, `epicHash?: string`, `unit?: 'epic' \| 'story' \| 'task'`, `storyId?: string` and `taskId?: string`. The documented rule says to write `\| undefined` on optional properties under exactOptionalPropertyTypes. The other new interfaces in this Story follow it: `CommentSyncResult`, `FeedbackInput.source` and `BuildStepImplement/Done.commentSync`. |
| LOW | src/workflow/tracker/comment-sync.ts:108 | The module turns caught errors into messages in two ways. `syncUnitComments` and `locate` use `(err as Error).message`. `readInbound` and `postOutbound` use `err instanceof Error ? err.message : String(err)`, which also handles a thrown non-Error. `runTaskCommentSync` in `src/daemon/tracker-sync-comments.ts` uses the cast form as well. The cast form fails on a non-Error throw. The evidence is only these few new files, so this is reported as an observation. |

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/index.ts:673 | The new 'tracker.syncComments' IPC registration is not reached by any test in the record. comment-sync-callers.test.ts imports handleTrackerSyncComments directly, so the dynamic import and the INSRC_REPO fallback wiring in the daemon's handler table are not exercised. The handler itself is covered and passing. Note: every changed entity here is a diff-level file node with empty testsReaching (the graph grounding is hollow for this diff), so coverage was judged from each test file's imports against the passing test record, not from reach edges. |
| LOW | src/workflow/artifact-core/lifecycle-service.ts:88 | Two of the three call sites changed from a pre-picked tail to passing the whole changeLog are unverified: the transition check (around line 88) and the cascade-member check (around line 247). Only inspect() is reached, by comment-sync-outbound.test.ts (passing). The existing lifecycle-service suites that would cover the transition and cascade paths are not in this Story's test record. Their behaviour should be the same because checkIntegrity now picks the same tail itself. |
| LOW | src/workflow/artifact-core/store.ts:265 | The ArtifactStore.write rewrite-of-prior path now passes the full log to checkIntegrity. No test file in this Story's record is shown to rewrite an existing artifact through this path, so its pass-state is unverified here. integrity-receipts.test.ts covers checkIntegrity itself and passes. |

## quality — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/tracker/comment-sync.ts:155 | Check-then-post is not serialised. postOutbound reads the receipts and the comment list, then calls postComment and writes the receipt under store.exclusive, but the lock covers only the append. There are awaits between the receipt read and the post, and the daemon can run a build turn's runTaskCommentSync and a tracker.syncComments request at the same time. Two syncs of the same artifact can therefore both see no receipt and no marker, and both post the same feedback entry, giving a duplicate comment on the issue. Holding a per-artifact lock across reconcile, post and receipt would close this race. |
| MED | src/daemon/steps/build-step/phases/implement.ts:97 | The sync runs after renderImplementPrompt has already built the prompt. A '/revise' or suggestion comment that this same turn records as feedback is missing from the prompt it returns, so the implementer works from stale feedback until the next turn. The only sign of it is the 'recorded N' line in commentSync. Running the sync before the prompt is rendered would fix this. |
| MED | src/workflow/tracker/comment-sync.ts:150 | The first sync of a bound artifact posts every feedback entry that has no source and no receipt. That includes all feedback entered before s8. The first implement or validate turn after upgrade can therefore post a backlog of old entries to the GitHub issue without warning. Nothing limits outbound posting to entries made after the sync existed, and nothing asks for confirmation. |
| LOW | src/workflow/tracker/comment-sync.ts:153 | postOutbound calls port.listComments a second time, right after readInbound has listed the same issue. Each sync makes two full paginated gh reads, and implement and validate each trigger a sync. The list from readInbound could be passed through and reused; if the first read failed, the reconcile step would report that same failure. |
| LOW | src/workflow/artifact-core/store.ts:266 | store.ts still picks the last log entry with a revision itself (the tail it needs for revisionFloor) and then passes the whole log to checkIntegrity, which picks the same entry again. The selection logic now lives in two places. The checkIntegrity union of one entry or an array also makes the API harder to read: the one-entry path is a leftover from callers that chose the entry themselves. |
| LOW | src/workflow/tracker/comment-rules.ts:28 | isFrameworkComment matches an '<!-- insrc:' marker anywhere in the text, but the framework always puts the marker on the first line. A person's comment that quotes or pastes a framework comment is dropped from inbound without any record. The reconcile step has the same problem: it matches with c.text.includes(marker), so a pasted marker counts as the framework's own post and a receipt is written for it. Matching only the first line would avoid both. |
| LOW | src/daemon/tracker-sync-comments.ts:37 | p.unit is cast from untrusted IPC params and never checked against 'epic' \| 'story' \| 'task'. A value such as 'Task' or 'foo' passes the storyId check and goes on to unitArtifactId. It should get a clear 'unit must be epic, story or task' error instead. |

