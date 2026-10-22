<!-- insrc:artifact ISSUE-764b88ed7474de35 -->

# Stamp ledger records with their work item's label, anchor and kind

## Reproduction

1. Run a code review on any Story (insrc_code_review_step), or build a Task (insrc_build_step validate), so a CR, BUILD or TESTS record is written.
2. Open the record's JSON in .insrc/artifacts (e.g. CR-7d42920dbef28b51-s1.json, written after the docs migration realigned every record on 2026-10-12).
3. Observed: its meta has no epicSlug and no epicCreatedAt, and standalone is missing or false for a standalone work item, even though the record's markdown was written into the work item's real folder (docs/standalone/docs-migrator-leaves-stale-labels-json-E202610117d42920d/S001/CR.md). Path derivation from the stored meta (deriveMdPath) therefore resolves a different, non-existent folder: hash-named, on the record's own day, or under docs/epics. The docs migration dry run immediately lists the new record for realignment again.
Expected: every ledger record's stored meta carries the same label, anchor and kind that were used to place its markdown, so meta-derived paths find the md and the migration plans nothing for freshly written records.

## Root cause

Each ledger writer resolves the work item's folder identity from the work item itself, not from its own meta, and uses it only to choose the file paths. The code-review runner computes codeReviewSubjectPathArgs(subject) (createdAtISO, workItemKind, epicSlug via storyRecordFolderArgs) and passes them to codeReviewArtifactPaths, but the artifact it writes is built separately by buildArtifact without those values. The BUILD record writer resolves buildRecordFolderArgs in pathsForMerged for buildArtifactPaths, and the TESTS record writer does the same through testsArtifactPaths, while the meta they persist holds only workflow, epicHash, storyId, createdAt/updatedAt and an optional standalone. So the folder identity lives only in the md's location, and deriveMdPath, which reads the stored meta (epicSlug ?? hash, epicCreatedAt ?? createdAt, standalone), resolves elsewhere. ISSUE-7d42920d repaired the existing records after the fact; the writers keep producing new drift.

## Fix intent

When a CR, BUILD or TESTS record is written, store in its meta the label, anchor and work-item kind that the writer already resolved to place the record's markdown (epicSlug when the work item has a real label, epicCreatedAt, and standalone: true for a standalone item), so the stored meta and the md location always agree. Records written before the fix are left to the docs migration; the fix only changes what new writes carry, and touches no other meta or body fields.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/runner.ts:209-212 (codeReviewSubjectPathArgs -> codeReviewArtifactPaths; artifact from buildArtifact written without them)`
- **[[c2]]** `code` `src/workflow/code-review/subject-paths.ts:22 codeReviewSubjectPathArgs (resolves createdAtISO, workItemKind, epicSlug from the work item)`
- **[[c3]]** `code` `src/workflow/runners/build/standalone-record.ts:258-270 pathsForMerged (buildRecordFolderArgs -> buildArtifactPaths)`
- **[[c4]]** `code` `src/workflow/runners/build/test-record.ts:198-211 (testsArtifactPaths from resolved folder args; meta { workflow, epicHash, storyId, createdAt, updatedAt, standalone? })`
- **[[c5]]** `code` `src/workflow/pending.ts:188 deriveMdPath (reads meta epicSlug ?? hash, epicCreatedAt ?? createdAt, standalone)`
- **[[c6]]** `prior-artifact` `ISSUE-7d42920dbef28b51 / commits a41f693d..eb5c84c9: 453 realigned records, 309 of them CR/BUILD; CR-7d42920dbef28b51-s1 flagged again by the dry run after being written`
