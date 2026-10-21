<!-- insrc:artifact CR-2f27754d4ad00b8e-s6 -->

# Code review: 2f27754d4ad00b8e:s6

⚠️ **WARN** — HIGH 0 · MED 3 · LOW 9 · model `claude:opus`

**Changed files:** 41

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/tracker/unit-issue.ts:671 | runUnitExtras treats a comment as the framework's earlier post if the marker appears anywhere in its text (`c.text.includes(step.marker)`). The LLD says only a comment whose text starts with the marker counts; the framework puts its markers at the start of the body for that reason. As written, a person's comment that quotes or mentions a marker, such as a reply that pastes the earlier post, is recorded as the design, review or plan post, and the real post is never made. |

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/storage.ts:655 | storage.ts declares two identical plain-object type guards: isRecord (line 102) and isPlainObject (line 655). The same guard is also redeclared privately in artifact-core/decode.ts:33 (isObject), artifact-core/store.ts:36 (isObject) and tracker/binding.ts (isObject). Within the touched workflow modules the usual pattern is a single module-level guard, so this is idiom drift that should be merged into one shared helper. The touched modules give too few examples to call this a firm convention, so it is reported as an observation, not a breach. |
| LOW | src/workflow/__tests__/approve-fallback-kit.ts:109 | trackerOf returns Record<string, any>. The sibling test helpers (tracker-auto.test.ts and tracker-tasks.test.ts, both trackerOf) declare Record<string, unknown>, which keeps strict type checking on the values. Use Record<string, unknown> here to match. |

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/index.ts:666 | The new daemon wiring has no test reach: the 'tracker.attach' RPC entry (line 666) and the BUILD-approval follow-on that adds followOnTrackerAttach to workflow.approve (lines 654-660 and 754-760) live inside main(), whose testsReaching is empty. The handlers behind them are covered directly: approve-attach.test.ts and tracker-attach-followon.test.ts call handleTrackerAttach and followOnTrackerAttach, and both files pass. What no test checks is the IPC registration and the joining of the bugfix and attach follow-ons. That is the part of s6 a broken import or a key typo would break unnoticed. |
| LOW | src/workflow/tracker/attach-unit.ts:110 | The grounding shows no direct test edge for the new attach chain: attachApprovedDocument, attachUnit, attachTargetsOf, approvedDocumentUnit, attachDocuments, openTracker, and attachApprovedDocuments/commitApprovedArtifacts in src/cli/services/workflow.ts. All of them are reached through callers that passing tests do exercise. approve(), covered by approve-attach.test.ts, calls attachApprovedDocuments → attachApprovedDocument. handleTrackerAttach, covered by two passing files, calls openTracker → attachUnit → attachTargetsOf/attachDocuments. The promised attach.test.ts title also covers attachDocuments and passes. So this is very likely coverage that the direct-edge grounding misses, not a real gap. The test record cannot confirm it per symbol. |

## quality — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/cli/services/workflow.ts:145 | attachApprovedDocuments only checks `commit === undefined` before attaching. It does not check `commit.committed` or `commit.pushed`. If the check-in commit succeeded locally but the push failed (offline, rejected or no upstream), attachDocuments still sees clean files and posts permalinks to `blob/<sha>` for a commit GitHub does not have, so the issue gets dead links. The Attachment records are then written and committed in a second commit, which also may not push. Skip the attach, or report it as skipped, unless `commit.pushed` is true. |
| MED | src/cli/services/workflow.ts:147 | approve() runs commitApprovedArtifacts and attachApprovedDocuments after the approval has already been written to disk. attachApprovedDocuments has no try/catch around openTracker, attachApprovedDocument (attachTargetsOf → folderOf/companionsOf read files) and the second commitAndPushArtifacts. An exception thrown there propagates out of approve(), so a successful approval comes back to the caller as an error. That breaks the 'best-effort, never breaks the approval' contract that commitApprovedArtifacts documents. Wrap the attach step and return its failure as `{ attach: { error } }`. |
| LOW | src/workflow/tracker/attach-unit.ts:110 | attachApprovedDocument repeats attachUnit's preamble line for line: unitArtifactId → readBinding precheck in a try/catch → attachTargetsOf → error passthrough → attachDocuments. Only the target filter differs. Move the shared part into one helper that takes an optional target filter, so the binding precheck and its error wording cannot drift apart (they already differ: one error mentions 'approve its document first', the other does not). |
| LOW | src/cli/services/workflow.ts:138 | attachApprovedDocuments re-reads and re-parses approval.path for the same meta that commitApprovedArtifacts already parsed. It also recomputes workItemAnchorCreatedAt/workItemKindOf and the Define/LLD paths. Parse once in approve() and pass the meta to both. |
| LOW | src/daemon/tracker-attach.ts:31 | handleTrackerAttach casts `params: unknown` to TrackerAttachParams without checking types. `p.repo` is used through `.length` without a string check, and `p.unit` is never checked against 'epic'\|'story'. An IPC caller that sends `unit: 'task'` or a non-string repo gets a misleading downstream error, or an odd one, instead of a clear validation message. `scope` is validated in the same function, so do the same for `unit` and `repo`. |
| LOW | src/workflow/storage.ts:655 | storage.ts defines two identical plain-object guards, isRecord (line 102) and isPlainObject (line 655). The same guard is also copied as isObject in artifact-core/decode.ts, artifact-core/store.ts and tracker/binding.ts. Export one guard and reuse it. |
| LOW | src/workflow/__tests__/tracker-attach-followon.test.ts:1 | The test helper `git(repo, ...args)` is copied in approve-attach.test.ts, tracker-attach-followon.test.ts and tracker/__tests__/attach.test.ts. It could live in a shared test kit, such as approve-fallback-kit.ts, which these tests already import. |

