<!-- insrc:artifact CR-c00559b7e38bb6ce-S001 -->

# Code review: c00559b7e38bb6ce:S001

⚠️ **WARN** — HIGH 0 · MED 7 · LOW 5 · model `claude:opus`

**Changed files:** 25

## adherence — 0 finding(s)

_No findings._

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/migrate-docs-tree.ts:276 | readMeta's return type declares optional properties without `\| undefined` ({ createdAt?: string; epicCreatedAt?: string; epicSlug?: string; standalone?: boolean }). The repo convention under exactOptionalPropertyTypes is `prop?: T \| undefined`, and sibling code in src/workflow/storage.ts follows it (for example `standalone?: boolean \| undefined` in pathsForWorkflow and storyRecordFolderArgs). |
| LOW | src/workflow/artifacts/spec.ts:133 | spec.ts redefines private `firstSentence` (line 133) and exported `isCitationArray` (line 172), which duplicate the same helpers in src/workflow/artifacts/define.ts (lines 175 and 203). This rests on only two artifact modules, so it is reported as possible drift from a shared-helper idiom, not a confirmed breach. |

## coverage — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/migrate-docs-tree.ts:1 | Promised smoke check (planMigration dry run over this repo listing d9f85b3c's consolidation with no unmappable standalone entries) has no corresponding test in the grounding, and a grep of src/**/*.test.ts finds no reference to d9f85b3c. It may have been a manual dry run, but no build record confirms it ran or what it produced. Present-but-unverified at best; it cannot be confirmed from the evidence available. |
| MED | src/workflow/storage.ts:1 | The changed storage symbols (readEpicDefinitionCore, lowestOrdinalLldId, compareStoryOrdinal, buildRecordFolderArgs, storyRecordFolderArgs, inheritedStoryStandalone) all show EMPTY testsReaching. The grounding is hollow, though: test bodies inside test() callbacks are not indexed as callers. For example, only the helper 'repo' in lld-head.test.ts reaches writeAtomic. Suites that target this code (storage.test.ts, lld-head.test.ts, folder-identity-finalize.test.ts) are in the changed set. These symbols are present but unverified, not proven unexercised. With no build record, their pass-state is unconfirmed. |
| MED | src/workflow/migrate-docs-tree.ts:1 | planMigration, lowestOrdinalLld, storyOrdinalOf and applyMigration show EMPTY testsReaching. migrate-docs-tree.test.ts calls planMigration(repo) directly (e.g. lines 69, 89, 102), so the empty edges are a graph-indexing gap and not missing coverage. The seedSplitStandalone({flagged}) fixture matches the promised tests for the anchorless split item and the unflagged LLD-headed item. These tests are present, but their pass-state is unverified because there is no build record. |
| MED | src/workflow/tracker/resolve.ts:1 | resolveWorkflowRef, workflowIdForIssue, listEpicHeads, readEpicIdentity, resolveByLabel and storyEvidence show EMPTY testsReaching. id-resolve.test.ts and lld-head-resolve.test.ts both import resolveWorkflowRef and workflowIdForIssue and call them directly (id-resolve.test.ts:294-299). Their fixtures (seedStandalone/seedEpic/seedBugfix, addRivalDefEpicWithS1, setupDeclaredStoryRepo) match the promised DEF/ISSUE/LLD-only, label-tiering and workflowIdForIssue tests. These tests are present, but their pass-state is unverified. |
| MED | src/mcp/triage-step/state.ts:1 | encodeState/decodeState, handleStart and buildNextCall show EMPTY testsReaching. handler.test.ts:227 has 'the triage state token round-trips specHash', and the startWithSpec/specRepo helpers cover start validation of specHash and classify forwarding it into the nextCall. These tests are present, but their pass-state is unverified because there is no build record. |
| MED | src/workflow/orchestrator.ts:1 | finalizePlan, finalizeStandaloneLld and headLabel show EMPTY testsReaching. finalizeArtifact is reached only through the slugOf helper in head-naming.test.ts. The head-naming fixtures (specEmit/defineEmit/issueEmit/lldBody) and the folder-identity-finalize fixtures (planIntent/minimalPlanBody) match the promised head-naming test and the 'finalizePlan writes PLAN.md into the anchor LLD's folder' test. The seededFromSpec regression guard lives in seed-focus.test.ts, which is outside the changed set. These tests are present, but their pass-state is unverified. |
| LOW | src/mcp/build-step/__tests__/build-step.test.ts:1 | The promised 'insrc_build_step implement + validate admit t1 of a standalone plan' test appears to be present: seedStandaloneLldPlan was added and the standalone/standaloneTurn helpers drive handleBuildStep. Its pass-state is unverified because there is no build record. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/migrate-docs-tree.ts:180 | `storyOrdinalOf` re-derives a Story ordinal by calling `deriveWorkItemIdentity` with a dummy all-zero hash and an epoch timestamp, then reading `.story`, and returns undefined on any error. It reaches the same `storyIdToOrdinal` parse that `compareStoryOrdinal` (storage.ts:450) calls directly. That gives the codebase a second, roundabout ordinal path, while the recent commits set out to have one story-ordinal rule. If `storyWorkflowId`/`deriveWorkItemIdentity` ever adds validation on the hash or date, this helper will quietly start returning undefined. `nestedShapeKey`/`artifactShapeKey` would then drop markerless BUILD/CR artifacts from the nested index without any error, while `compareStoryOrdinal` keeps working. Call `storyIdToOrdinal` directly, or share one exported ordinal helper. |
| LOW | src/workflow/artifacts/spec.ts:172 | `isCitationArray` is a byte-for-byte copy of the exported guard in define.ts:203, and both are exported. If the Citation shape changes and only one copy is updated, the two validators will disagree. Import the define.ts guard, or move it to a shared module. |
| LOW | src/workflow/artifacts/spec.ts:133 | The private `firstSentence` helper is identical to `firstSentence` in define.ts:175 (same regex and same 80/77-char truncation). This is minor duplication. Extract it to a shared render util. |

