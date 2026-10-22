<!-- insrc:artifact CR-2f27754d4ad00b8e-s8 -->

# Code review: 2f27754d4ad00b8e:s8

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 14 · model `claude:opus`

**Changed files:** 27

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/tracker/comment-rules.ts:21 | classifyComment calls text.trimStart() before it takes the first line, so leading blank lines are dropped and the first non-blank line decides the kind. A comment whose first line is empty and whose second line is '/revise …' is classified as a revision-request (the unit test asserts this for '  \n/revise after blank lines'). The LLD says a comment like this, with an empty first line and the command on a later line, is a plain comment. |
| LOW | src/workflow/tracker/comment-sync.ts:45 | CommentSyncDeps has only feedback, history and store. The receipt's actor is hard-coded as SYNC_ACTOR ('insrc:comment-sync', kind system), and its timestamp comes from new Date() in writeReceipt. The approved deps were meant to supply the clock and the posting actor, so a caller cannot set who the receipt is recorded as, and a test cannot pin its time. |
| LOW | src/daemon/steps/build-step/phases/validate.ts:230 | Validate runs the comment sync only after runValidateSession returns next === 'done'. The approved design reads the issue's comments when the holder starts to validate. As built, a validate turn that returns anything other than done (an error or a non-final turn) never syncs, and comments read on the final turn are recorded only after the validation verdict, not before validation begins. |

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/tracker-sync-comments.ts:23 | TrackerSyncCommentsParams declares its optional properties without an explicit `\| undefined` (`readonly repo?: string;`, and likewise `epicHash?`, `unit?`, `storyId?`, `taskId?` on lines 24-27). The documented rule says optional properties must be declared `\| undefined` under exactOptionalPropertyTypes. Other new interfaces in this Story follow the rule, for example CommentSyncResult, FeedbackInput.source and BuildStepImplement.commentSync. |
| LOW | src/workflow/tracker/comment-sync.ts:117 | Errors are turned into text in two different ways within the touched modules. syncUnitComments and locate cast with `(err as Error).message`, as does runTaskCommentSync in tracker-sync-comments.ts. readInbound and postOutbound in the same file use the safer `err instanceof Error ? err.message : String(err)`. If the thrown value is not an Error, the cast form gives `undefined`. The idiom comes from only a few examples, so this is an observation, not a breach. |

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/index.ts:673 | The new IPC route 'tracker.syncComments' is not exercised by any test. comment-sync-callers.test.ts (passing) calls handleTrackerSyncComments directly, so the handler is covered but the lazy import and the method-name wiring in the daemon handler table are not. Note on grounding: every changed entity here is a file-level diff entity whose testsReaching is empty. That is a gap in the grounding, not evidence that tests are missing. The test files in the diff import these modules directly, and their record state is passing. |
| LOW | src/workflow/artifact-core/store.ts:265 | ArtifactStore.write now passes the whole log to checkIntegrity, while the resolving branch still uses the tail it picks itself. No test in this Story's test record targets the store's write path with a revision-less receipt after the last content entry. integrity-receipts.test.ts (passing) covers checkIntegrity directly, and any existing store tests that reach this path are not in the record, so their pass-state for this change is unverified. |
| LOW | src/workflow/artifact-core/lifecycle-service.ts:88 | Of the three LifecycleService call sites switched to checkIntegrity(view, changeLog), only inspect() is exercised in this Story's record, through comment-sync-outbound.test.ts (passing). The transition path and the cascade-complete member path are not reached by any test in the record, so the receipts-after-content behaviour on those paths is unverified. |

## quality — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/tracker/comment-sync.ts:160 | postOutbound treats every feedback entry with no source and no receipt as pending. That includes all feedback entered before s8 shipped, because none of it has a receipt. So the first implement or validate turn on a bound Task posts the artifact's whole earlier feedback history to the GitHub issue. The user is not asked, and the turn's answer shows only a one-line summary. This is an outward-facing publish that happens as a side effect of a build turn. Consider a cut-over point (skip entries older than the binding or the s8 rollout), or say in the s9 hand-off doc that the backlog will be posted. |
| LOW | src/workflow/artifact-core/store.ts:266 | store.ts still works out the last revision-bearing entry itself (`[...log].reverse().find(e => e.revision !== undefined)`) for the resolving branch, then passes the whole log to checkIntegrity, which works out the same entry again. The selection rule now lives in two places, and they can drift apart. Export a small `lastRevisionEntry(log)` helper and use it in both. |
| LOW | src/workflow/artifact-core/lifecycle.ts:133 | checkIntegrity now accepts either one entry or the whole log, which needs an Array.isArray branch and casts. No production caller passes a single entry any more; all four pass the log. Keeping the single-entry form leaves a way to bypass the revision-less-entry protection this change adds. Narrowing the parameter to `readonly ChangeLogEntry[] \| undefined` would remove both the casts and the bypass. |
| LOW | src/workflow/tracker/comment-sync.ts:155 | One sync lists the issue's comments twice: readInbound reads them, and postOutbound reads them again to reconcile. That doubles the gh API calls per build turn on issues with long threads. The inbound listing could be passed to postOutbound, or listed again only when the inbound read failed. |
| LOW | src/workflow/tracker/comment-rules.ts:28 | isFrameworkComment matches an insrc marker anywhere in the text, and postOutbound reconciles with `c.text.includes(marker)`. A person's comment that pastes or quotes a framework comment's raw markdown is therefore silently dropped as framework output. If it contains a feedback marker, it is also taken as the post of that feedback entry, so the entry is never posted. Anchoring the marker to the first line, where the framework always writes it, would close this. |
| LOW | src/workflow/tracker/comment-sync.ts:48 | feedbackMarker puts the caller-chosen feedback id straight into an HTML comment without escaping it. FeedbackInput.id is free-form, so an id containing `-->` would end the marker early, and the posted comment would leak markup and might not match on reconcile. |
| LOW | src/daemon/tracker-sync-comments.ts:49 | handleTrackerSyncComments builds a second History over a new file sidecar store, while lifecycleFor already builds one History that its FeedbackService and ArtifactStore share. History holds no cache today, so this works. But it is a parallel instance of what the registry promises as 'the same history and store'. Exposing the registry's history from the entry would keep one source. |

