# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-03T14:36:49.033Z  ·  **Updated:** 2026-10-03T14:42:35.397Z

**Commit:** dac91ae

## Scope

Route both folder-label reads through the definition head instead of the LLD. In finalizePlan (src/workflow/orchestrator.ts:2537) replace `lld.meta.epicSlug ?? safeDeriveSlug(intent.focus)` with the existing inheritedEpicSlug helper (src/workflow/storage.ts:213), and in buildRecordFolderArgs (src/workflow/storage.ts:346-348) make the standalone branch resolve the LABEL through readEpicDefinitionCore like its non-standalone sibling already does, instead of reading the LLD's own record. Remove the now-false comment at storage.ts:344 ('The standalone branch still reads the LLD') along with the behaviour it documents. Change of SOURCE only: no new field, no new function, no change to identity, anchor or placement; the empty-label and no-definition-artifact fallbacks already live in the helper. Add tests asserting a PLAN and a BUILD finalized for a work item whose LLD carries a DIFFERENT label still land under the definition head's label, and mutation-prove each site.

## Triage rationale

bugfix / small. Two one-line label reads with one non-test call site; the correct helper already exists so the fix is reuse, not design. Not trivial-by-risk: the value decides where artifact markdown lands, which is the placement boundary that forked 33 identity segments.

## Summary

Routed both folder-label reads through the work item's definition head. finalizePlan now calls inheritedEpicSlug instead of reading lld.meta.epicSlug, and buildRecordFolderArgs resolves the LABEL through readEpicDefinitionCore on both routes rather than only the epic one — closing an asymmetry its own comment had described as deliberate. The ANCHOR was deliberately left alone and still comes from the nearest upstream, so the standalone route keeps reading the LLD's createdAt and degrading to the record's own; the two sources are now asserted together so a later edit cannot swap the anchor while the label assertion keeps passing. The upstream label survives as the fallback, so a work item with no definition artifact keeps its LLD's label instead of regressing into a raw-hash folder. Six tests added (two on the PLAN side through the real finalize seam, four on buildRecordFolderArgs) and three mutations proven: reverting the PLAN label source reds 3, reverting the BUILD label source reds 3, and wrongly moving the anchor to the head reds 31. Full sweep 4325 tests / 4196 pass / 1 fail / 125 skipped, the failure being the pre-existing better_sqlite3 native-ABI mismatch.

## Tasks validated

- ✗ `S001`

## Changes

- `.insrc/artifacts/ISSUE-3a98d27994547262.json` — **insrc-build** (2026-10-03T14:42:35.397Z)
- `docs/standalone/finalizeplan-buildrecordfolderargs-take-work-item-s-E202610033a98d279/ISSUE.md` — **insrc-build** (2026-10-03T14:42:35.397Z)
- `src/workflow/__tests__/folder-identity-finalize.test.ts` — **insrc-build** (2026-10-03T14:42:35.397Z)
- `src/workflow/__tests__/storage.test.ts` — **insrc-build** (2026-10-03T14:42:35.397Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-03T14:42:35.397Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-10-03T14:42:35.397Z)
