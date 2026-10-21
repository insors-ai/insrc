<!-- insrc:artifact CR-2f27754d4ad00b8e-s4 -->

# Code review: 2f27754d4ad00b8e:s4

⚠️ **WARN** — HIGH 0 · MED 5 · LOW 16 · model `claude:opus`

**Changed files:** 72

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/artifact-core/sidecar-store.ts:150 | When .gitattributes or .gitignore cannot be written, ensureLines only logs a warning. Nothing reaches the daemon's status. The warning also lists every wanted line, not just the missing ones. |
| LOW | src/workflow/artifact-core/sidecar-store.ts:132 | A repeated (artifactId, entry id) with different content raises a HistoryReadError that names only the second line (`where`). The line of the first frame it kept is not recorded or reported. |
| LOW | src/workflow/artifact-core/types.ts:226 | s4 adds a new member, 'head-changed-after-stage', to IntegrityReason, the reason type of the sc4 Integrity contract that s3 owns. The approved design says s4 uses those reasons as they are and does not extend them. |
| LOW | src/workflow/artifact-core/journal.ts:34 | priorHeadHash is a required string, and a create is marked with an 'absent' sentinel hash instead of leaving the field out. isStagedOperation also refuses a journal file that has no priorHeadHash, where the design validates it only when present. |

## conventions — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/workflow-approve.ts:37 | The comment line '// The repository whose store holds the artifact: …' has no leading tab, while the rest of the function body is tab-indented. Its continuation line on the next row is indented. Indent it to match the surrounding block. |
| LOW | src/daemon/lifecycle-registry.ts:14 | `realpathSync` is imported in a second `import … from 'node:fs'` statement instead of joining the existing `existsSync, statSync` import. The ARTIFACTS_DIR import from storage.js also sits between the artifact-core imports. The touched modules use one import per module specifier, so merge them. |
| LOW | src/workflow/runners/build/round-writer.ts:35 | Two JSDoc blocks are stacked above `hasReadableHead`. The first ('A round record is regenerable … Returns true when one was removed.') describes `discardUnreadableHead`, which is declared below it with no doc comment. `discardUnreadableHead` also repeats the decode check that `hasReadableHead` already does. Move the comment onto the function it describes, and consider having discardUnreadableHead call hasReadableHead. |
| LOW | src/workflow/artifact-core/__tests__/round-recording.test.ts:19 | `mkdtempSync` gets a second import from 'node:fs', and `persistStandaloneBuildRecord` gets a second import from '../../runners/build/standalone-record.js'. Both modules are already imported earlier in the file, and the sibling tests import each module once. Merge each pair into one import. |

## coverage — 6 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/steps/build-step/__tests__/validate-anchor.test.ts:135 | Present but unverified. The new test 'a BUILD record that cannot be stored through the service is named in the verdict's evidence, and the verdict stands' covers the new buildRecordNote path in validate.ts, but validate-anchor.test.ts does not appear in the test record. Its pass-state is not confirmed. |
| MED | src/workflow/artifact-core/__tests__/round-recording.test.ts:196 | Present but unverified. Two tests are missing from the latest recorded run of round-recording.test.ts (t11): 'the first BUILD round of a Trivial standalone build ... is created through the registry store on the record's own time' and 'an unreadable BUILD head is replaced by a round that keeps the time the build gave it'. Together they cover codecs.ts rootKinds, the isFirst createdAt/epicCreatedAt carry-over in persistBuildRecord, and the implement.ts roundWriterFor wiring. The file's recorded state is passing, but neither title has a recorded result. |
| LOW | src/daemon/__tests__/lifecycle-wiring.test.ts:134 | Present but unverified. The test 'one registry entry per repository however its path is written, and a single-artifact approval uses the repository the artifact sits in' was added after the recorded t8 run and is not among the file's recorded titles. It covers the realpath normalisation in lifecycleFor and the repoOfArtifactPath routing in handleWorkflowApprove. |
| LOW | src/workflow/artifact-core/__tests__/history-order.test.ts:36 | Present but unverified. The test 'openFeedback compares instants, not their spelling' (covering compareEntries' Date.parse ordering) is not among the recorded titles of the t4 run of history-order.test.ts. |
| LOW | src/workflow/runners/build/own-files.ts:44 | Unverified. The new sidecar line files in storyWorkflowFiles are asserted in completion-record.test.ts, and the async migrations are asserted in build-record, test-record, build-step and other suites. None of those files appear in the test record, so their pass-state is not confirmed by the gate. |
| LOW | src/daemon/lifecycle-registry.ts:1 | The grounding is diff-only (degraded). Every changed entity, test files included, has an empty testsReaching list, so the graph cannot show which code is exercised. This is not reported as a set of HIGH not-exercised gaps: all 21 promised tests are present and passing in the test record, and they reach the changed production files directly (lifecycle-wiring for workflow-approve, approval-actor and review-decision; round-recording for code-review-rpc, the code-review handler, round-writer and the round persisters; verdicts-lifecycle for verdicts.ts; journal-recovery-durable for store.ts and journal.ts). Coverage here is judged from the test record, not from graph edges. |

## quality — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/runners/build/round-writer.ts:45 | discardUnreadableHead removes any head the store cannot decode, with no journal entry and no check of why it failed to decode. A BUILD/TESTS/CR head left with git conflict markers after a merge does not decode, so it is deleted and recreated from this round. That loses the stamps mergeWithPrior would otherwise keep (approvedAt, reviewOverride, rejection stamps) and hides a merge conflict that the rest of s4 says a person must resolve. Only replace a head that is not JSON at all and has no conflict markers, or refuse with LifecycleConflictError the way the store does for a head that moved on. |
| MED | src/workflow/runners/build/own-files.ts:45 | The new sidecar block calls FileSidecarStore.filesOf, which throws InvalidArtifactKeyError when the id does not parse. The call sits outside the try that the lines just above use to tolerate 'an identity the path scheme cannot place'. An epicHash/storyId the scheme rejects now makes storyWorkflowFiles throw instead of skipping, and that fails the caller's whole BUILD persist (in validate it becomes a buildRecordNote; in completion-record the record is not written). Put it under the same guard. |
| MED | src/daemon/steps/build-step/phases/implement.ts:182 | The Trivial implement path now awaits persistStandaloneBuildRecord through roundWriterFor(repoPath) with no error handling. A registry failure, or a store refusal such as hash-mismatch or log-ahead-of-head on a hand-edited or merged BUILD head, rejects the whole implement turn. The validate path handles the same failure fail-open and names it in buildRecordNote, so the two paths now treat one ledger write differently. Catch the error here and attach a note in the same way, or document that implement fails on a BUILD head conflict. |
| LOW | src/daemon/steps/review-step/phases/verdicts.ts:128 | With a service, the verdicts phase runs updateContent, then the meta-only review stamp, then lifecycle.apply('review'), then the markdown write, as separate steps. A failure part-way leaves the head partly reviewed (fix and stamp written, lifecycle review and markdown missing), and the error does not say so. Section 8 of the plan doc already records this; noted here so it stays tracked for s9. |
| LOW | src/workflow/runners/build/round-writer.ts:39 | discardUnreadableHead repeats hasReadableHead's exists/decode test instead of calling it. Also, the doc comment that describes discardUnreadableHead ('Returns true when one was removed') sits above hasReadableHead, so hasReadableHead carries two stacked doc blocks. |
| LOW | src/workflow/artifact-core/approval-actor.ts:21 | approvalActorOf records any well-formed namespaced id as kind 'person', including ids in insrc's own namespace such as 'insrc:approval' or 'insrc:build'. A client can therefore send an approval that the log attributes to a system actor id while recording it as a person. Consider refusing the reserved insrc: namespace for request-supplied actors. |
| LOW | src/daemon/workflow-approve.ts:37 | The comment line '// The repository whose store holds the artifact' is missing its leading tab indentation (a layout issue only). |

