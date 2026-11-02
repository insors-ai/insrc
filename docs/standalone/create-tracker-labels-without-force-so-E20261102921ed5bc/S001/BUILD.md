<!-- insrc:artifact BUILD-921ed5bc6e27e50f-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-02T13:53:38.250Z  ·  **Updated:** 2026-11-02T13:56:50.544Z

**Commit:** 1a1deec14

## Scope

Create tracker labels without force so a push needs no approval: ghCreateLabel in src/workflow/tracker/registry-table.ts drops force; a failed create counts as success when a list for the exact name finds the label (case-insensitive); a denial is still thrown; other failures answer false. Update registry-table.test.ts and tracker.test.ts for the unforced create.

## Triage rationale

Small bugfix routed issue -> build (ISSUE-921ed5bc6e27e50f, approved): one call site.

## Summary

ghCreateLabel creates without force (common, no approval); an existing label counts as created via a list for the exact name; a denial is still thrown; other failures answer false. Tests: registry-table (create unforced, exists, other failures, asks no approval), tracker-push-registry, setup, tracker pass.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/tracker/__tests__/registry-table.test.ts` — **insrc-build** (2026-11-02T13:56:50.544Z)
- `src/workflow/tracker/__tests__/setup.test.ts` — **insrc-build** (2026-11-02T13:56:50.544Z)
- `src/workflow/tracker/__tests__/tracker.test.ts` — **insrc-build** (2026-11-02T13:56:50.544Z)
- `src/workflow/tracker/registry-table.ts` — **insrc-build** (2026-11-02T13:56:50.544Z)
