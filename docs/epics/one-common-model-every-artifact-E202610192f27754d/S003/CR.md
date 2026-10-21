<!-- insrc:artifact CR-2f27754d4ad00b8e-s3 -->

# Code review: 2f27754d4ad00b8e:s3

⛔ **BLOCK** — HIGH 41 · MED 5 · LOW 0 · model `codex:gpt-6-astra`

**Changed files:** 39

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/workflow/artifact-core/lifecycle-service.ts:97 | Member completion/reopening runs before nextLifecycle validates the unit's transition. Completing a withdrawn Story whose roll-up passes can freeze its documents and then throw when transitioning the Story. Validate the unit transition before mutating members. |
| HIGH | src/workflow/gates.ts:1015 | The legacy approval stamp is written before service approval, and failure restores an earlier whole-file snapshot. This exposes approval before the lifecycle accepts it and can erase a review mirrored by the service or a concurrent update while leaving its log entry intact. Apply service approval first, then write the legacy stamp. |
| MED | src/workflow/artifact-core/lifecycle-service.ts:125 | apply releases the update queue before rereading the lifecycle and selecting the last log entry. A competing operation can run between those steps, so an approve call can return another operation's lifecycle and entry. Capture this operation's result while its update remains serialized. |

## conventions — 0 finding(s)

_No findings._

## coverage — 39 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | docs/plans/core-data-model.md:307 | The supplied changed entity has empty testsReaching: a not-exercised gap under the required coverage rule. |
| HIGH | src/workflow/__tests__/artifact-write-inventory.test.ts:49 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/__tests__/docs-s3-follow-ups.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/__tests__/gates-lifecycle-guard.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/__tests__/gates-lifecycle-service.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/__tests__/prepare-lifecycle.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/codec-create.test.ts:85 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/completion-evidence.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/content-hash.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/decode.test.ts:96 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-ac7.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-errors.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-integrity.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-kit.ts:1 | The supplied changed entity has empty testsReaching: no test-reaching edge establishes exercise of this helper file. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-members.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-service.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-table.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/lifecycle-transition.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/pass-through-codecs.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/store-children-strict.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/store-lifecycle-write.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/store-update.test.ts:1 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/store-write.test.ts:20 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/__tests__/types-contract.test.ts:27 | The supplied changed entity has empty testsReaching. Its passing test record does not establish a reaching edge. |
| HIGH | src/workflow/artifact-core/codecs.ts:104 | Empty testsReaching establishes a not-exercised gap for the changed codec registrations under the required coverage rule. |
| HIGH | src/workflow/artifact-core/completion-evidence.ts:1 | Empty testsReaching establishes a not-exercised gap for the new completion-evidence behavior under the required coverage rule. |
| HIGH | src/workflow/artifact-core/lifecycle-service.ts:1 | Empty testsReaching establishes a not-exercised gap for the new lifecycle service under the required coverage rule. |
| HIGH | src/workflow/artifact-core/lifecycle.ts:1 | Empty testsReaching establishes a not-exercised gap for the new lifecycle rules under the required coverage rule. |
| HIGH | src/workflow/artifact-core/store.ts:116 | Empty testsReaching establishes a not-exercised gap for the changed store behavior under the required coverage rule. |
| HIGH | src/workflow/artifact-core/types.ts:221 | Empty testsReaching establishes a not-exercised gap for the added lifecycle errors under the required coverage rule. |
| HIGH | src/workflow/artifact-write-inventory.ts:85 | Empty testsReaching establishes a not-exercised gap for the changed writer inventory and detection behavior under the required coverage rule. |
| HIGH | src/workflow/gates.ts:597 | Empty testsReaching establishes a not-exercised gap for the changed approval guards and service integration under the required coverage rule. |
| HIGH | src/workflow/review/run-artifact.ts:89 | Empty testsReaching establishes a not-exercised gap for the changed review guards and service integration under the required coverage rule. |
| HIGH | src/workflow/runners/build/completion-record.ts:97 | Empty testsReaching establishes a not-exercised gap for the changed BUILD content writer integration under the required coverage rule. |
| HIGH | src/workflow/runners/build/standalone-record.ts:307 | Empty testsReaching establishes a not-exercised gap for the changed BUILD record preparation under the required coverage rule. |
| HIGH | src/workflow/storage.ts:167 | Empty testsReaching establishes a not-exercised gap for the changed lifecycle reconciliation during artifact writes under the required coverage rule. All 30 promised tests have corresponding passing results; those results do not supply the missing test-reaching edges. |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/artifact-core/lifecycle-service.ts:98 | Correctness: member mutations occur before nextLifecycle validates the unit's transition. Completing a withdrawn Story whose roll-up passes can freeze its members and then throw, leaving members completed under a withdrawn Story. Validate the unit transition before cascading. |
| MED | src/workflow/artifact-core/store.ts:249 | Avoidable complexity: cascading completion temporarily substitutes the prior status, reconciles and serializes that artificial state, then reparses and patches the serialized status. This creates a second transition path that must stay synchronized with lifecycle validation. Pass cascade context into reconciliation so it validates and prepares the actual final state directly. |
| MED | src/workflow/storage.ts:194 | Duplication: reconcileLifecycleOf hashes both payloads to determine whether content changed, then reconcileLifecycle immediately repeats those hashes and the comparison. Each write therefore repeats recursive JSON normalization and hashing, adding avoidable CPU and allocation costs for large artifacts. Let reconciliation determine both the content change and revision number. |
| MED | src/workflow/gates.ts:1019 | Error handling: restoreStamp restores the entire pre-service head, although mirrorLegacyReview may already have committed a review and appended its history entry before approval fails. Restoring those bytes removes the committed lifecycle review without undoing its log entry. Restore only legacy stamp fields through the queued store, preserving committed lifecycle changes and pending recovery. |

## diagram — 0 finding(s)

_No findings._

