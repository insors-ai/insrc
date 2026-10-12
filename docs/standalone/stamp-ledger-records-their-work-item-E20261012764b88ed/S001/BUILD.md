<!-- insrc:artifact BUILD-764b88ed7474de35-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-12T05:01:19.318Z  ·  **Updated:** 2026-10-12T05:05:01.697Z

**Commit:** b4c9622d

## Scope

Stamp ledger records with their work item's label, anchor and kind

Root cause: the CR, BUILD and TESTS writers resolve the work item's folder identity (createdAtISO, workItemKind, epicSlug) only to place the md (codeReviewArtifactPaths / buildArtifactPaths / testsArtifactPaths) and never store it in the record's meta, so deriveMdPath on the stored meta resolves a different folder.

Fix intent: when a CR, BUILD or TESTS record is written, store in its meta the label, anchor and work-item kind the writer already resolved to place its markdown (epicSlug when the work item has a real label, epicCreatedAt, and standalone: true for a standalone item), so stored meta and md location agree. Only new writes change; no other meta or body fields.

## Triage rationale

Small bugfix (ISSUE-764b88ed): three writers already hold the resolved folder identity; stamp it into meta.

## Summary

The BUILD, TESTS and code-review writers now store the epicSlug, epicCreatedAt and standalone flag they resolved to place the record's md (new folderIdentityMeta helper in storage.ts), so a path derived from the record's own meta is the md it was written to. Regression tests in src/workflow/__tests__/ledger-record-identity.test.ts fail without the fix and pass with it.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-764b88ed7474de35.json` — **insrc-build** (2026-10-12T05:05:01.697Z)
- `docs/standalone/stamp-ledger-records-their-work-item-E20261012764b88ed/ISSUE.md` — **insrc-build** (2026-10-12T05:05:01.697Z)
- `src/workflow/__tests__/ledger-record-identity.test.ts` — **insrc-build** (2026-10-12T05:05:01.697Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-12T05:05:01.697Z)
- `src/workflow/runners/build/__tests__/build-record.test.ts` — **insrc-build** (2026-10-12T05:05:01.697Z)
- `src/workflow/runners/build/__tests__/test-record.test.ts` — **insrc-build** (2026-10-12T05:05:01.697Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-12T05:05:01.697Z)
- `src/workflow/runners/build/test-record.ts` — **insrc-build** (2026-10-12T05:05:01.697Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-10-12T05:05:01.697Z)
