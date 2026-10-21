<!-- insrc:artifact CR-2f27754d4ad00b8e-s3 -->

# Code review: 2f27754d4ad00b8e:s3

⛔ **BLOCK** — HIGH 43 · MED 3 · LOW 9 · model `codex:gpt-6-astra`

**Changed files:** 39

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/workflow/gates.ts:1001 | The legacy approval stamp is written before applyThroughService runs. If the service rejects the approval, the target is reported in skipped[] but meta.approvedAt remains persisted, so the delivery board sees an approval that failed. Run the service approval successfully before writing the legacy stamp. |
| HIGH | src/workflow/artifact-core/lifecycle-service.ts:201 | completeMember bypasses checkIntegrity and directly writes a completed lifecycle. The store checks only the head's own hash, so a member whose log revision differs from its head can still be completed during a Story or Epic cascade. Check the member against its last revision-bearing entry inside its update before completing it. |
| MED | src/workflow/review/run-artifact.ts:145 | Supplying a LifecycleService only adds an initial inspection and routes auto-fix content through the store; the review itself still only stamps meta.review. No review operation is applied, so lifecycle.review remains absent or stale, pending-review does not return to draft, and no review entry is recorded. |
| MED | src/workflow/artifact-core/lifecycle-service.ts:95 | apply handles completion and approval outcomes but never constructs an outcome for review. Even callers that explicitly invoke apply(id, 'review', ...) therefore append a review entry without its verdict and counts. |

## conventions — 8 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/artifact-core/lifecycle.ts:179 | TransitionDetail.review is optional but its outer object type lacks `\| undefined`; the nested report property includes it correctly. |
| LOW | src/workflow/gates.ts:879 | The new assertion declares optional meta, review, and reviewResolutions properties without explicit `\| undefined`. |
| LOW | src/workflow/__tests__/gates-lifecycle-guard.test.ts:45 | The assertion declares optional meta and approvedAt properties without explicit `\| undefined`. |
| LOW | src/workflow/__tests__/gates-lifecycle-service.test.ts:97 | The optional properties field in the schema assertion lacks `\| undefined`. |
| LOW | src/workflow/__tests__/prepare-lifecycle.test.ts:19 | The optional description and extra properties lack explicit `\| undefined`, unlike lifecycle in the same declaration. |
| LOW | src/workflow/__tests__/prepare-lifecycle.test.ts:28 | The optional revision property lacks explicit `\| undefined`. |
| LOW | src/workflow/artifact-core/__tests__/completion-evidence.test.ts:23 | The optional overrideReview and enforce properties lack explicit `\| undefined`. |
| LOW | src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts:16 | The optional description, status, number, and rest properties lack explicit `\| undefined`, unlike stored in the same declaration. |

## coverage — 39 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | docs/plans/core-data-model.md:308 | Changed file has empty testsReaching: a not-exercised gap under the supplied coverage contract. The promised documentation test is present and passing. |
| HIGH | src/workflow/__tests__/artifact-write-inventory.test.ts:49 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/__tests__/docs-s3-follow-ups.test.ts:1 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/__tests__/gates-lifecycle-guard.test.ts:1 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/__tests__/gates-lifecycle-service.test.ts:1 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/__tests__/prepare-lifecycle.test.ts:1 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/codec-create.test.ts:85 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/completion-evidence.test.ts:1 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/content-hash.test.ts:1 | Changed file has empty testsReaching. Its promised test is present and passing, including the contentHash suite prefix. |
| HIGH | src/workflow/artifact-core/__tests__/decode.test.ts:96 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-ac7.test.ts:1 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts:1 | Changed file has empty testsReaching. Both promised tests are present and passing; neither supplies a reaching edge for this entry. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-errors.test.ts:1 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-integrity.test.ts:1 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-kit.ts:1 | Changed helper file has empty testsReaching, constituting a not-exercised gap under the supplied coverage contract. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-members.test.ts:1 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts:1 | Changed file has empty testsReaching. All three promised tests are present and passing; they do not supply a reaching edge for this entry. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts:1 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-service.test.ts:1 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-table.test.ts:1 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-transition.test.ts:1 | Changed file has empty testsReaching. Both promised tests are present and passing, including the transition suite prefix. |
| HIGH | src/workflow/artifact-core/__tests__/pass-through-codecs.test.ts:1 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/store-children-strict.test.ts:1 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/store-lifecycle-write.test.ts:1 | Changed file has empty testsReaching. Both promised tests are present and passing; neither supplies a reaching edge for this entry. |
| HIGH | src/workflow/artifact-core/__tests__/store-update.test.ts:1 | Changed file has empty testsReaching. Both promised tests are present and passing; neither supplies a reaching edge for this entry. |
| HIGH | src/workflow/artifact-core/__tests__/store-write.test.ts:20 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/types-contract.test.ts:27 | Changed file has empty testsReaching. Its passing test record does not supply the required reaching edge. |
| HIGH | src/workflow/artifact-core/codecs.ts:104 | Changed codec registration has empty testsReaching, so the supplied edges establish a not-exercised gap despite present, passing codec tests. |
| HIGH | src/workflow/artifact-core/completion-evidence.ts:1 | Changed completion evidence implementation has empty testsReaching, so the supplied edges establish a not-exercised gap despite its present, passing promised test. |
| HIGH | src/workflow/artifact-core/lifecycle-service.ts:1 | Changed lifecycle service has empty testsReaching. Present, passing service and integration tests do not establish reachability under the supplied edge contract. |
| HIGH | src/workflow/artifact-core/lifecycle.ts:1 | Changed lifecycle rules have empty testsReaching. Present, passing lifecycle tests do not establish reachability under the supplied edge contract. |
| HIGH | src/workflow/artifact-core/store.ts:48 | Changed store behaviour has empty testsReaching. Present, passing store tests do not establish reachability under the supplied edge contract. |
| HIGH | src/workflow/artifact-core/types.ts:221 | Changed lifecycle error definitions have empty testsReaching, despite the promised error-class test being present and passing. |
| HIGH | src/workflow/artifact-write-inventory.ts:85 | Changed writer detection and inventory have empty testsReaching, despite the promised inventory test being present and passing. |
| HIGH | src/workflow/gates.ts:597 | Changed approval gate behaviour has empty testsReaching. All five promised gate tests are present and passing, but no reaching edge establishes coverage of this entry. |
| HIGH | src/workflow/review/run-artifact.ts:89 | Changed review integrity and content-write behaviour has empty testsReaching. Present, passing review integration tests do not establish reachability under the supplied edge contract. |
| HIGH | src/workflow/runners/build/completion-record.ts:97 | Changed BUILD content-writer integration has empty testsReaching, constituting a not-exercised gap under the supplied coverage contract. |
| HIGH | src/workflow/runners/build/standalone-record.ts:307 | Changed BUILD record preparation and body extraction have empty testsReaching, constituting a not-exercised gap under the supplied coverage contract. |
| HIGH | src/workflow/storage.ts:167 | Changed lifecycle reconciliation and revision handling have empty testsReaching, despite the promised prepareArtifactWrite test being present and passing. |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/workflow/gates.ts:889 | Correctness: mirrorLegacyReview binds any legacy meta.review to the current revision without verifying which revision it reviewed. After a content edit leaves the old review in metadata, approval can promote that stale verdict into a current lifecycle review and approve unreviewed content. |
| MED | src/workflow/artifact-core/store.ts:248 | Avoidable complexity: cascading completion temporarily substitutes the prior status, reconciles content, then patches the serialized status to completed. This bypasses reconciliation's draft fallback when a caller supplies changed content with cascade completion. Pass the cascade policy into reconciliation and validate the final transition there instead. |
| LOW | src/workflow/storage.ts:196 | Duplication: reconcileLifecycleOf computes both content hashes to determine whether content changed, then reconcileLifecycle repeats the same comparison. This duplicates canonical serialization and hashing on every lifecycle content write and splits revision decisions across two routines. Have reconciliation compute the comparison and revision together. |
| HIGH | src/workflow/gates.ts:1001 | Unhandled error path: approveArtifactByJsonPath stamps legacy approval before applyThroughService runs. If the service rejects approval, its catch only removes the result from approved and adds skipped; the persisted approval stamp remains. A refused artifact can therefore appear approved to legacy readers and disappear from pending approval sweeps. Validate and commit lifecycle approval before persisting the legacy stamp, with recovery for partial failures. |

## diagram — 0 finding(s)

_No findings._

