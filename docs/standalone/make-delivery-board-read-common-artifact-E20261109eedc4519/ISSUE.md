<!-- insrc:artifact ISSUE-eedc4519199b24b4 -->

# Make the delivery board read the common artifact model and migrate old records

## Reproduction

Call the daemon's `workflow.delivery` request for this repository (or open the delivery board in the VS Code plugin).

Observed on 2026-11-09:
- 2,621 of the stored files are reported as unreadable: 52 EPIC, 249 STORY, 2,014 TASK and 306 TASKS records. Each is rejected as `unknown-kind`, which produces 5,242 false notices (record-unreadable and incomplete-evidence).
- 273 older-format records (BUILD 74, LLD 73, PLAN 48, ISSUE 33, CR 28, EXT 5, HLD 5, DEF 5, SPEC 2) have no `meta.lifecycle`. 210 of them carry `approvedAt` but read as pending, so 1,041 evidence entries across 576 items show as not approved, 63 of 593 stories stop at build-recorded instead of complete, and 102 attention items are false.
- `repo.convert` previews an empty plan for this repository, so the records cannot be converted.

Expected: every record type in the common model is read without a notice, the board's status comes from each record's lifecycle, approved work shows as approved, and a conversion run on this repository brings the older records into the common model.

## Root cause

Three separate causes.

1. The board was not moved to the common model. `src/workflow/delivery/load.ts` admits only the kinds in `DELIVERY_ARTIFACT_KINDS` (SPEC, DEF, HLD, LLD, PLAN, BUILD, CR, ISSUE, EXT, AMD); it skips TESTS by name and turns any other kind into an `unknown-kind` load failure. `DeliveryArtifactKind` in `src/workflow/delivery/types.ts` has no EPIC, STORY, TASK or TASKS. `src/workflow/delivery/graph.ts` derives stories from `DEF.body.stories` and tasks from PLAN and BUILD `body.tasks`, so the new per-unit records are never consulted.

2. Conversion is a once-only step per repository. `planConversion` in `src/workflow/convert/plan.ts` returns an empty plan, and `applyConversion` in `src/workflow/convert/apply.ts` returns without writing, whenever `RepoSchemaGate.read(repo).version >= 2`. `.insrc/schema.json` here has been at version 2 since 2026-10-22, so nothing written after that date can be converted. `approvalOf` in `src/workflow/delivery/load.ts` takes approval only from `meta.lifecycle`, so these records read as pending.

3. Records without a lifecycle kept being written after the conversion. 241 of the 273 were created after the marker, alongside records that do have one (for example 34 without and 25 with on 2026-11-01). The newest is dated 2026-11-06, and none of the 54 delivery records created from 2026-11-07 to 2026-11-09 lacks a lifecycle. The commits of 2026-11-03 (`e6f0ed2af`, `e921a001c`) address raw content writes, but they adopt a head only when it is ahead of its change log, and which writer produced these records has not been established.

The new records are also incomplete for older work: 9 of 53 DEF records have no EPIC record, 55 of the 304 stories those DEFs name have no STORY record, and 49 of 355 PLAN records have no TASKS record. EPIC and STORY records hold a lifecycle and an empty body, so titles and story lists still come from the DEF.

Not traced to the format, and out of scope unless the fix shows otherwise: 181 validation-conflict notices, 72 identity-ambiguous notices, 53 of the 57 unresolved-parent notices, and 19 stories without a title.

## Fix intent

The delivery board reads every record type of the common model as its source: EPIC, STORY, TASK and TASKS records load without a notice, and the status of epics, stories and tasks comes from those records' lifecycles. DEF, HLD, LLD, PLAN, BUILD and the other design records keep supplying their own content, such as titles, in the common format.

Records that are not yet in the common model are migrated to it, including on a repository already marked as converted. Approved records stay approved, and the missing EPIC, STORY and TASK or TASKS records for older work are created. The migration can be previewed before it is applied and can be re-run safely.

The board gains no reader for the old format, so an unmigrated record is reported as needing migration and never presented as ordinary pending work.

The path that wrote records without a lifecycle is identified, and any such path still present is closed so that the problem cannot recur. The board's snapshot contract with the VS Code plugin stays aligned, and conversion verification, which shares the board's loader and graph, keeps working.

## Citations

- **[[c1]]** `code` `src/workflow/delivery/load.ts` — "export const DELIVERY_ARTIFACT_KINDS: readonly DeliveryArtifactKind[] = ['SPEC', 'DEF',"
- **[[c2]]** `code` `src/workflow/delivery/types.ts`
- **[[c3]]** `code` `src/workflow/delivery/graph.ts`
- **[[c4]]** `code` `src/workflow/convert/plan.ts`
- **[[c5]]** `code` `src/workflow/convert/apply.ts` — "if (RepoSchemaGate.read(repo).version >= 2) return { written: [], markerWritten: false, trackerFailures: [] }; // converted already: nothing to write"
- **[[c6]]** `code` `src/workflow/convert/verify.ts`
- **[[c7]]** `code` `src/workflow/artifact-core/lifecycle-service.ts`
- **[[c8]]** `code` `vscode-plugin/src/delivery/delivery-contract.ts`
- **[[c9]]** `analyze-bundle` `insrc_analyze_step: src/workflow/delivery, how the board builds epics, stories and tasks and what depends on its record kinds`
