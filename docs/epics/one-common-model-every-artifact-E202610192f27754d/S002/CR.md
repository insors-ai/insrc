<!-- insrc:artifact CR-2f27754d4ad00b8e-s2 -->

# Code review: 2f27754d4ad00b8e:s2

⛔ **BLOCK** — HIGH 42 · MED 4 · LOW 15 · model `codex:gpt-6-astra`

**Changed files:** 41

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/artifact-core/store.ts:184 | Operation ids are random UUIDs instead of hashes of the artifact id, prior revision and prepared bytes. Identical inputs therefore do not produce the deterministic operation identity required by the approved design. |
| MED | src/workflow/artifact-core/history.ts:123 | openFeedback uses strictly greater timestamps instead of reader order. A later addressing entry with the same timestamp leaves earlier feedback open; the added test explicitly enforces this departure. |
| MED | src/workflow/artifact-core/types.ts:122 | Approval.override is declared as { reason: string }, and the decoder rejects string overrides. This changes the approved string-valued override reason and prevents an approval using that shape from being read or written. |

## conventions — 0 finding(s)

_No findings._

## coverage — 41 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | docs/plans/core-data-model.md:270 | Changed file symbol has empty testsReaching; it is not exercised under the supplied coverage contract. |
| HIGH | src/workflow/__tests__/artifact-write-inventory.test.ts:128 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/__tests__/docs-s2-inputs.test.ts:1 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/__tests__/prepare-artifact-write.test.ts:1 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/__tests__/storage.test.ts:580 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/artifact-core/__tests__/codec-create.test.ts:1 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/artifact-core/__tests__/decode.test.ts:1 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/artifact-core/__tests__/feedback-convert.test.ts:1 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/artifact-core/__tests__/gates-delegation.test.ts:1 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/artifact-core/__tests__/history.test.ts:1 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/artifact-core/__tests__/journal.test.ts:1 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/artifact-core/__tests__/repo-schema.test.ts:1 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/artifact-core/__tests__/sidecar.test.ts:1 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/artifact-core/__tests__/store-children.test.ts:1 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/artifact-core/__tests__/store-kit.ts:1 | Changed file symbol has empty testsReaching; no reaching test is recorded. |
| HIGH | src/workflow/artifact-core/__tests__/store-read.test.ts:1 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/artifact-core/__tests__/store-write.test.ts:1 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/artifact-core/__tests__/types-contract.bad.ts:1 | Changed file symbol has empty testsReaching; no reaching test is recorded. |
| HIGH | src/workflow/artifact-core/__tests__/types-contract.fixtures.ts:1 | Changed file symbol has empty testsReaching; no reaching test is recorded. |
| HIGH | src/workflow/artifact-core/__tests__/types-contract.test.ts:1 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/artifact-core/codecs.ts:1 | Changed file symbol has empty testsReaching; codec behaviour has no recorded reaching test. |
| HIGH | src/workflow/artifact-core/decode.ts:1 | Changed file symbol has empty testsReaching; decoding behaviour has no recorded reaching test. |
| HIGH | src/workflow/artifact-core/feedback-convert.ts:1 | Changed file symbol has empty testsReaching; feedback conversion has no recorded reaching test. |
| HIGH | src/workflow/artifact-core/history.ts:1 | Changed file symbol has empty testsReaching; history behaviour has no recorded reaching test. |
| HIGH | src/workflow/artifact-core/journal.ts:1 | Changed file symbol has empty testsReaching; journal behaviour has no recorded reaching test. |
| HIGH | src/workflow/artifact-core/repo-schema.ts:1 | Changed file symbol has empty testsReaching; schema-gate behaviour has no recorded reaching test. |
| HIGH | src/workflow/artifact-core/sidecar.ts:1 | Changed file symbol has empty testsReaching; sidecar behaviour has no recorded reaching test. |
| HIGH | src/workflow/artifact-core/store.ts:1 | Changed file symbol has empty testsReaching; store behaviour has no recorded reaching test. |
| HIGH | src/workflow/artifact-core/types.ts:1 | Changed file symbol has empty testsReaching; the new contracts and error classes have no recorded reaching test. |
| HIGH | src/workflow/artifact-ids.ts:100 | Changed file symbol has empty testsReaching; the added artifact-kind predicate has no recorded reaching test. |
| HIGH | src/workflow/artifact-write-inventory.ts:137 | Changed file symbol has empty testsReaching; the expanded writer detection has no recorded reaching test. |
| HIGH | src/workflow/artifacts/format/__tests__/bindings.test.ts:19 | Changed file symbol has empty testsReaching; no reaching test is recorded for this change. |
| HIGH | src/workflow/artifacts/format/bindings.ts:108 | Changed file symbol has empty testsReaching; the changed FileChangeLog contract has no recorded reaching test. |
| HIGH | src/workflow/artifacts/provenance/__tests__/types.test.ts:41 | Changed file symbol has empty testsReaching; no reaching test is recorded for this change. |
| HIGH | src/workflow/artifacts/provenance/types.ts:70 | Changed file symbol has empty testsReaching; the renamed provenance contracts have no recorded reaching test. |
| HIGH | src/workflow/gates.ts:142 | Changed file symbol has empty testsReaching; delegation of the four readers to the shared decoder has no recorded reaching test. |
| HIGH | src/workflow/runners/build/__tests__/admit-build.test.ts:248 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/runners/build/__tests__/provenance-build.test.ts:32 | Changed file symbol has empty testsReaching. Its passing test record does not supply the missing reachability edge. |
| HIGH | src/workflow/runners/build/changed-files.ts:219 | Changed file symbol has empty testsReaching; the changed file-level provenance contract has no recorded reaching test. |
| HIGH | src/workflow/runners/build/standalone-record.ts:95 | Changed file symbol has empty testsReaching; the changed BuildRecord.changeLog contract has no recorded reaching test. |
| HIGH | src/workflow/storage.ts:158 | Changed file symbol has empty testsReaching; extraction of prepareArtifactWrite and delegation from writeArtifact have no recorded reaching test. All 21 promised tests are present and recorded passing, but those records do not establish the missing symbol reachability edges. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/artifact-core/store.ts:51 | Correctness: canonical() ignores toJSON(), although persistence uses JSON.stringify(). Two different Date values nested in a payload both compare as {}, so changing the date is classified as meta-only and persists changed content without advancing its revision. Compare the JSON-serialized representation when deciding whether content changed. |
| HIGH | src/workflow/artifact-core/store.ts:216 | Unhandled recovery conflict: completePending replaces any head differing from the staged bytes, without checking whether another writer advanced it after staging failed. Existing writeArtifact writers do not participate in WRITE_QUEUES, so recovery can silently overwrite a subsequent successful update. Persist and verify the expected prior head before replacing; surface a conflict when the current head matches neither the prior nor staged version. |

## diagram — 15 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | erDefinition:classes.Lifecycle | class 'Lifecycle' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.Revision | class 'Revision' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.Approval | class 'Approval' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.Review | class 'Review' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.Signoff | class 'Signoff' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.Staleness | class 'Staleness' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.TrackerBinding | class 'TrackerBinding' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.Posting | class 'Posting' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.PendingLink | class 'PendingLink' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.Attachment | class 'Attachment' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.Reference | class 'Reference' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.SidecarRecord | class 'SidecarRecord' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.Task | class 'Task' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.TaskPayload | class 'TaskPayload' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.RepoSchema | class 'RepoSchema' declares no identifier slot (identifier:true) — the entity has no primary key |

