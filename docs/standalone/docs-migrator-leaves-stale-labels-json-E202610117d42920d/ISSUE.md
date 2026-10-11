<!-- insrc:artifact ISSUE-7d42920dbef28b51 -->

# Docs migration leaves moved artifacts' stored label and anchor pointing at their old folder

## Reproduction

1. Have a work item whose artifacts were written into two folders under different labels, for example a standalone LLD in one folder and its PLAN, written later from its own focus, in another.
2. Run the docs migration (planMigration, then applyMigration). It moves the PLAN's markdown into the LLD's folder and commits.
3. Read the PLAN's canonical JSON in .insrc/artifacts. meta.epicSlug still holds the old label, and meta.epicCreatedAt the old anchor.
4. Derive the PLAN's markdown path from its metadata (deriveMdPath, as the pending list and the delivery board do).

Observed: the derived path is the old folder, which the migration just removed. The rendered PLAN.md header also still shows the old label. Any later re-render keyed on the stored label would recreate the old folder.
Expected: after the migration, an artifact's stored label and anchor name the folder its markdown now lives in.

Seen on PLAN-d9f85b3c and PLAN-f2f08ccf after the 2026-10-11 consolidation. Their derived paths pointed at docs/standalone/decompose-approved-lld-d9f85b3cc8cc966b-s001-shared-E20261011d9f85b3c/ and docs/standalone/plan-build-structured-design-review-template-E20261005f2f08ccf/ until both were corrected by hand.

## Root cause

The migrator is designed never to write the JSON store: its module header states it 'never touches the hash-flat .insrc/artifacts JSON store — only md files move', and applyMigration only git-mvs markdown and rewrites links. planMigration computes ONE label and anchor per work item (the head's) and places every member's markdown with them, but that label and anchor are applied only to the destination path, never written back to a member's meta. The artifact's stored meta.epicSlug and meta.epicCreatedAt are what path derivation reads afterwards (deriveMdPath in pending.ts, used by the pending list and as the delivery board's fallback), so moving the file without updating its metadata leaves the two disagreeing.

## Fix intent

When the migration places an artifact under its work item's label and anchor, the artifact's stored label and anchor should end up matching that folder, so that metadata-derived paths, the rendered header and later re-renders all agree with where the markdown actually sits. The correction should cover the same artifacts the migration relabels, keep the migration's dry-run purity and its all-or-nothing rollback, and be safe for already-approved artifacts (metadata alignment only, no body change).

## Citations

- **[[c1]]** `code` `src/workflow/migrate-docs-tree.ts:17-18` — "It never touches the hash-flat `.insrc/artifacts` JSON store — only md files move."
- **[[c2]]** `code` `src/workflow/migrate-docs-tree.ts:657 applyMigration`
- **[[c3]]** `code` `src/workflow/pending.ts:188 deriveMdPath` — "const slug = str(meta['epicSlug']) ?? hash;"
- **[[c4]]** `code` `src/workflow/delivery/markdown.ts:101` — "try { mdPath = deriveMdPath(repoPath, kind, record.meta); } catch { mdPath = ''; }"
- **[[c5]]** `prior-artifact` `commit 14e9496c 'fix(ledger): moved PLANs carry their LLD's label and anchor' (hand correction of PLAN-d9f85b3c and PLAN-f2f08ccf)`
