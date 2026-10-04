<!-- insrc:artifact ISSUE-0b2faed872727348 -->

# File a standalone LLD in its work item's folder

## Reproduction

File an issue on one day and write its design (a standalone LLD) on a later day.

Observed on ISSUE-5f7a7cb95b643ae5: the issue was created on 2026-10-02 and its LLD on 2026-10-04. The issue and the plan are under `docs/standalone/batch-approval-stamps-one-shared-meta-E202610025f7a7cb9/` (ISSUE.md, S001/PLAN.md). The LLD is alone under `docs/standalone/batch-approval-stamps-one-shared-meta-E202610045f7a7cb9/S001/LLD.md`. The LLD's record has no folder anchor (`meta.epicCreatedAt` is absent) while the plan's record carries the issue's creation time.

Expected: every document of one work item is in one folder, named for the day the work item was created.

Actual: the LLD is in a second folder named for the day the LLD was written. Records that take their folder from the LLD (the build record and the code-review record of a standalone Story) would follow it there.

## Root cause

A work item's folder name is built from a label and an anchor date. The anchor is `meta.epicCreatedAt` when the record carries one, otherwise the record's own creation time.

The plan finalizer and the epic-level finalizers stamp `epicCreatedAt` by reading the work item's definition record (the DEF or the ISSUE). The standalone LLD finalizer inherits the label from that same definition record but never stamps the anchor, so it uses the LLD's own creation time. On the same day as the issue the two dates give the same folder name, which is why the gap was not seen; on a later day they differ.

The earlier folder fixes addressed the label at every writer and the placement of build and code-review records; this writer's anchor was not among them.

## Fix intent

Make the standalone LLD carry its work item's anchor, taken from the same source the plan uses, so the LLD is filed with its issue regardless of the day it is written. A standalone LLD with no definition record to inherit from keeps today's behaviour (its own creation time).

Move the already-misfiled LLD of ISSUE-5f7a7cb95b643ae5 into the work item's folder and give its record the anchor, so the records that follow it (build, code review) land in the same place. Other standalone LLDs that may already sit in a second folder are not migrated by this fix.

## Citations

- **[[c1]]** `code` `src/workflow/orchestrator.ts` — "const lldMd = lldArtifactPaths(intent.repoPath, epicHash, storyId, workItemAnchorCreatedAt(meta), workItemKindOf(meta), epicSlug).md;"
- **[[c2]]** `code` `src/workflow/orchestrator.ts` — "epicCreatedAt: readEpicCreatedAt(intent.repoPath, epicHash) ?? new Date().toISOString(),"
- **[[c3]]** `code` `src/workflow/storage.ts` — "export function readEpicCreatedAt(repoPath: string, epicHash: string): string | undefined {"
- **[[c4]]** `prior-artifact` `LLD-5f7a7cb95b643ae5-S001` — "docs/standalone/batch-approval-stamps-one-shared-meta-E202610045f7a7cb9/S001/LLD.md"
- **[[c5]]** `stakeholder` `user, 2026-10-04` — "ok, fix this as an issue and then move the LLD to the right folder"
