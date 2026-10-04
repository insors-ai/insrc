# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-04T12:11:09.893Z  ·  **Updated:** 2026-10-04T12:24:24.234Z

**Commit:** d7a8ae8

## Scope

Fix three overlapping misfiling issues together (ISSUE-0855311b6b32eb72, ISSUE-43d72766d3b9a2c1, ISSUE-b2e16601ad94f39b): a story's BUILD and code-review records must land in the same docs folder as the story's other artifacts on every route. Resolve top-level split, slug and date anchor from the work item's definition head (DEF/ISSUE) with the story's LLD as fallback, in ONE shared resolver used by the BUILD writers and the code-review writer; stamp standalone + sizeClass on a standalone BUILD record's first write; emit the insrc:artifact marker from the BUILD renderer.

## Triage rationale

Three approved small bugfixes with one shared cause: each record writer derives the work item's folder from a different, incomplete source. One shared resolver in src/workflow/storage.ts plus its call sites.

## Summary

One fix for ISSUE-0855311b, ISSUE-43d72766 and ISSUE-b2e16601. A story's placement is now read from its definition head or its own LLD; the standalone validate branch stamps the declared route, size class and rationale on the record (only when there is no definition head); the standalone anchor falls back to the head's date before the record's own; the BUILD persist files a record by what its story is; the code-review writer resolves its folder through the same shared derivation (storyRecordFolderArgs); and the persisted BUILD.md carries the artifact-id marker. 19 regression tests added; 20 mutations of the fix each turn them red. Existing misfiled records are not migrated.

## Tasks validated

- ✗ `S001`

## Changes

- `.insrc/artifacts/ISSUE-0855311b6b32eb72.json` — **insrc-build** (2026-10-04T12:24:24.234Z)
- `.insrc/artifacts/ISSUE-43d72766d3b9a2c1.json` — **insrc-build** (2026-10-04T12:24:24.234Z)
- `.insrc/artifacts/ISSUE-b2e16601ad94f39b.json` — **insrc-build** (2026-10-04T12:24:24.234Z)
