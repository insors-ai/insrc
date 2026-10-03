<!-- insrc:artifact ISSUE-3a98d27994547262 -->

# Inherit a work item's folder label from its definition head, not from its LLD

## Reproduction

Observed live on this repository, not hypothetically.

1. Take a standalone bugfix work item whose ISSUE carries one label and whose LLD re-derived a different one from its own focus (before the label fix, every stage derived its own). Work item e20235c17f083a16 is a concrete example: its ISSUE reads `artifact-docs-folders-fork-per-stage` while its LLD reads `make-work-item-keep-exactly-one`.
2. Finalize a PLAN for that story, then complete and approve its BUILD.
3. OBSERVED: the PLAN.md and BUILD.md land under the LLD's label, while the ISSUE.md sits under the ISSUE's label — two folders for one identity segment. Re-approving re-renders the BUILD at the LLD-labelled path a second time, so one artifact ends up with two markdown files whose content differs.
   EXPECTED: every artifact of one work item resolves to exactly one folder, named for the work item's definition head.

Scale of the live symptom before repair: 13 artifact identities each had two markdown files, and 33 of 116 identity segments had more than one folder.

## Root cause

The label reaches a PLAN or BUILD TRANSITIVELY, through the LLD, instead of directly from the definition head.

finalizePlan computes `const epicSlug = lld.meta.epicSlug ?? safeDeriveSlug(intent.focus);` — so whatever slug the LLD persisted is what names the plan's folder. buildRecordFolderArgs has the same shape but only on one side of a branch: its non-standalone path already resolves through readEpicDefinitionCore (DEF then ISSUE), while its standalone path reads the LLD's own record. The asymmetry is not accidental and is stated in the function's own comment: 'The standalone branch still reads the LLD.'

So the correctness of a plan's or build's folder depends on the LLD having the right label, rather than on the one artifact that defines the work item. An LLD that re-derived its own slug propagates that slug to every downstream stage, and the work item forks. The accessor that resolves the definition head already exists and is already used by the sibling branch — only these two reads bypass it.

This is distinct from, and was masked by, the anchor/identity defect fixed earlier: the anchor governs the identity SEGMENT and is already resolved through the definition head. The label is a separate field that was left behind.

## Fix intent

Make both reads resolve the label from the work item's definition head, so a PLAN's or BUILD's folder no longer depends on what its LLD happened to persist. The existing inherit-then-fallback helper is the intended path — it already prefers the head, already treats an empty stored label as absent, and already falls back to a freshly derived slug for a work item with no definition artifact — so this is a change of SOURCE, not of behaviour or contract. No new field, no new function, and no change to identity, anchor or placement.

Two consequences to state rather than design around: new PLAN and BUILD markdown for a standalone item will land under the definition head's label instead of the LLD's, and markdown already written at the old label is converged by the existing docs-tree migration rather than by this change. The deliberate asymmetry in buildRecordFolderArgs' comment should be removed along with the behaviour it documents, so the comment cannot outlive the code.

## Citations

- **[[c1]]** `code` `src/workflow/orchestrator.ts:2537` — "const epicSlug = lld.meta.epicSlug ?? safeDeriveSlug(intent.focus);"
- **[[c2]]** `code` `src/workflow/storage.ts` — "The standalone branch still reads the LLD."
- **[[c3]]** `code` `src/workflow/storage.ts:320` — "readEpicDefinitionCore — resolves the definition artifact, DEF then ISSUE, first-readable-wins"
- **[[c4]]** `code` `src/workflow/storage.ts:213` — "export function inheritedEpicSlug(repoPath: string, epicHash: string, fallback: string): string"
- **[[c5]]** `code` `src/workflow/runners/build/standalone-record.ts:241` — "const fa = buildRecordFolderArgs(repoPath, merged.meta.epicHash, merged.meta.storyId, merged.meta.standalone === true, merged.meta.createdAt);"
- **[[c6]]** `prior-artifact` `ISSUE-e20235c17f083a16 / S001 — the work item whose ISSUE and LLD carry different labels, and whose PLAN and BUILD followed the LLD's`
- **[[c7]]** `prior-artifact` `commit e8b2b36 — repaired the 13 already-written duplicate renders; this issue addresses the cause rather than the residue`
