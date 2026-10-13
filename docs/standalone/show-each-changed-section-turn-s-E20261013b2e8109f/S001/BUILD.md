<!-- insrc:artifact BUILD-b2e8109f42afc0dd-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T08:48:39.843Z  ·  **Updated:** 2026-10-13T08:48:39.843Z

**Commit:** 1c43f9ad

## Summary

New pure module diff-sections.ts: parsePatch turns the git patch into one section per hunk, and reconcileSections says which sections are new, changed or gone since the last check.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` — **insrc-build** (2026-10-13T08:48:39.843Z)
- `vscode-plugin/src/chat/diff-sections.ts` — **insrc-build** (2026-10-13T08:48:39.843Z)
