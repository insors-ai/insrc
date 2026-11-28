<!-- insrc:artifact BUILD-1e2052060dec3efb-s1 -->

# Build (standalone bugfix) — Story s1

**Size class:** bugfix  ·  **Standalone:** yes  ·  **Created:** 2026-11-27T18:34:48.798Z  ·  **Updated:** 2026-11-28T05:05:18.039Z

**Commit:** d30aa48f0

## Summary

syncManifest v3 in vscode-plugin/scripts/sync-manifest-catalog.mjs (commits 9c922e953 + 3ca97d5f2 + e8bb15652 + 21f153309 + 3226caad3 + 94e041526 + d30aa48f0): one shared non-local row map drives update+insertion; a catalog-backed key is owned by its group-titled section (cross-title copies removed; a relocated sole declaration keeps its supplemental schema fields, the group section's own declaration wins when both exist) — declared exactly once manifest-wide; missing group sections created (package.json gains "Models — security"); only insrc.* keys matching RETIRED_PATHS are removed, every other non-role property survives everywhere; the taxonomy pass owns the entire insrc.models.tasks.* prefix and regenerates the canonical per-role section from buildPerRoleKeyMap (gains insrc.models.tasks.security.review); duplicate-titled sections consolidate losslessly — compatible metadata and distinct local keys preserved, conflicting metadata first-wins (documented), and only a conflicting PROPERTY schema (key-order-insensitive) is refused with a sync-duplicate-conflict diagnostic naming the key and the two declaring sections; stored values never rewritten; idempotent. All 9 gate-mapped tests pass; guards + bundle green; plugin tsc clean.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/package.json` — **insrc-build** (2026-11-28T05:05:18.039Z)
- `vscode-plugin/scripts/sync-manifest-catalog.mjs` — **insrc-build** (2026-11-28T05:05:18.039Z)
- `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts` — **insrc-build** (2026-11-28T05:05:18.039Z)
