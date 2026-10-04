<!-- insrc:artifact BUILD-dddb4113077c8de8-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-04T16:58:33.403Z  ·  **Updated:** 2026-10-04T16:58:39.099Z

**Commit:** fdc24eb

## Summary

Closed by hand on 2026-10-04: no build ran under this issue. The fix it asks for shipped inside the misfiling fix (commit d7a8ae8, ISSUE-0855311b / 43d72766 / b2e16601): the BUILD record writer now prepends the artifact-id marker to BUILD.md. Verified on 2026-10-04: the marker is emitted at src/workflow/runners/build/standalone-record.ts, three tests assert it on a rendered BUILD.md (including the byte-identity golden), and two freshly written BUILD.md files resolve back to their json by markdown path. BUILD.md files rendered before the fix stay markerless until re-rendered, as the issue specifies. No change log is recorded here because the change belongs to that other commit.

## Tasks validated

- ✓ `S001`

## Changes

- `.insrc/artifacts/ISSUE-dddb4113077c8de8.json` — **insrc-build** (2026-10-04T16:58:39.099Z)
