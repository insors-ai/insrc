<!-- insrc:artifact CR-2ff0dfdadb1c8d1c-s2 -->

# Code review: 2ff0dfdadb1c8d1c:s2

✅ **PASS** — HIGH 0 · MED 0 · LOW 6 · model `claude:opus`

**Changed files:** 4

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/delivery/stage.ts:1 | Caveat, not a coverage gap: the graph grounding is hollow for these just-created files. Every changed symbol, including the test files and test helpers, shows an empty testsReaching. stage.test.ts imports deriveStages, and its run() helper calls it, yet the graph has no edge from run() to deriveStages. So the empty edges come from incomplete indexing, not from untested code, and no HIGH was raised from them. Coverage was checked by running the suite instead. `npx tsx --test src/workflow/delivery/__tests__/stage.test.ts src/workflow/delivery/__tests__/types.test.ts` ran 18 tests: 18 passed, 0 failed. All 16 promised tests are present by exact name: types.test.ts:36 and stage.test.ts:59, 69, 77, 85, 95, 115, 123, 136, 166, 183, 197, 217, 228, 251 and 270. The pass-state comes from that local run, not from a build record. |

## quality — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/delivery/stage.ts:206 | An issue whose own route is unknown appends UNKNOWN_ROUTE_SUFFIX to its least advanced fix story's reason text. That text already ends with the same suffix whenever the story's route is also unknown, so the reason reads '... (route unknown, so no ready gate applies) (route unknown, so no ready gate applies)'. Both routes are unknown in the common case where no ISSUE record exists for the hash and the story has no LLD or BUILD sizeClass. Fix: skip the suffix when the child's text already carries it, or build the issue reason from the child's base text. |
| LOW | src/workflow/delivery/stage.ts:112 | Route resolution handles several records of the same kind inconsistently. For standalone BUILDs it gathers every sizeClass and returns 'unknown' when they disagree (lines 118-122). For LLDs it takes only the first record (evidence.find), so two LLDs with different sizeClass values give a route that depends on the order of evidenceArtifactIds. Fix: apply the BUILD rule (agree or unknown) to LLDs too. |
| LOW | src/workflow/delivery/stage.ts:243 | When one workItemHash has more than one ISSUE record, the first one in recordSet.records wins. That depends on load order, unlike the rest of the pass, which sorts ids for determinism. The stage and route of an issue and its fix stories could then change between runs. Fix: pick deterministically (for example the lowest artifactId), or treat duplicate ISSUEs as an ambiguity that yields 'unknown'. |
| LOW | src/workflow/delivery/stage.ts:98 | issueOf finds a fix story's ISSUE through the story's own workItemHash, not its issue parent's. If a fix story can carry a different hash than the issue the graph parented it under, the magnitude-first rule silently misses it and the route falls through to LLD or BUILD sizeClass. This contradicts the module comment that an issue's fix stories take the ISSUE's magnitude. Fix: look up through the parent item's workItemHash. |
| LOW | src/workflow/delivery/stage.ts:217 | noticesFor recomputes evidenceOf for every story even though storyAnnotation already resolved it. issueOf is also evaluated twice per story, once inside storyRoute and again in storyAnnotation (line 188). This is redundant work rather than a correctness risk. Fix: carry the evidence and issue on the Annotated value. |

