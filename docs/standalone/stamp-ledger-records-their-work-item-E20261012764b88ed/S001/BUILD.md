<!-- insrc:artifact BUILD-764b88ed7474de35-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-12T05:01:19.318Z

**Commit:** 30c0bb48

## Scope

Stamp ledger records with their work item's label, anchor and kind

Root cause: the CR, BUILD and TESTS writers resolve the work item's folder identity (createdAtISO, workItemKind, epicSlug) only to place the md (codeReviewArtifactPaths / buildArtifactPaths / testsArtifactPaths) and never store it in the record's meta, so deriveMdPath on the stored meta resolves a different folder.

Fix intent: when a CR, BUILD or TESTS record is written, store in its meta the label, anchor and work-item kind the writer already resolved to place its markdown (epicSlug when the work item has a real label, epicCreatedAt, and standalone: true for a standalone item), so stored meta and md location agree. Only new writes change; no other meta or body fields.

## Triage rationale

Small bugfix (ISSUE-764b88ed): three writers already hold the resolved folder identity; stamp it into meta.
