<!-- insrc:artifact CR-34b6a247a4828d49-S001 -->

# Code review: 34b6a247a4828d49:S001

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 3 · model `claude:opus`

**Changed files:** 2

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/delivery/graph.ts:1 | Every changed symbol came back with no testsReaching edges, but the graph grounding is empty for these newly created files, so it doesn't show a real coverage gap. I checked by running the suite instead. src/workflow/delivery/__tests__/graph.test.ts calls buildWorkItemGraph 32 times, and all 29 of its tests pass (0 fail). The private helpers (groupRecordsByWorkItem, splitKey, addTasks, resolveCorrectedParents, hashesForSlug, itemForHash, attachSpecs, freeze, draftOf and the rest) are only reachable through buildWorkItemGraph. The test names show they are exercised: parentRef slug resolution, identity-ambiguous notices, unattached-spec, a deterministic rebuild, and record-unreadable notices. No build record covers this pass, so treat it as observed locally rather than recorded. Re-indexing should fill in the missing test edges. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/delivery/graph.ts:191 | Avoidable complexity: buildWorkItemGraph is about 170 lines. One loop body indexes groups by hash, mints the head id, seeds stories through an inline `seed` closure, works out standalone and anchor with nested ternaries, mints story ids with two fallback paths, and raises four kinds of notice. Each of these is its own concern. Moving the head-minting (≈213-241) and story-minting (≈269-328) into named helpers, as already done for addTasks, resolveCorrectedParents and attachSpecs, would make the placement and anchor rules much easier to check and test. |
| LOW | src/workflow/delivery/graph.ts:544 | Latent correctness risk in attachSpecs. itemOfRecord maps each artifactId to the last draft that lists it as evidence. addTasks gives task drafts the same PLAN/BUILD artifact ids its story already has, and task drafts are inserted later. So a PLAN or BUILD record carrying meta.seededFromSpec would set seededFromSpecId, and add the SPEC as evidence, on a task instead of the story. Today only DEF and LLD records are stamped with seededFromSpec (orchestrator.ts), so this does not fire yet. Also, line 551 lets the last seed win without a notice when one item names two different specs. |
| LOW | src/workflow/delivery/graph.ts:333 | The raw story id is recovered by parsing the minted draft id (lastIndexOf(':R(') … slice(-1)). StoryInfo/StorySeed already have this value: it is storyKey with the R(…) wrapper removed, or s.sourceIds. Parsing it back out of the id is fragile and depends on the id format; reading it from the seed directly would be clearer. |

