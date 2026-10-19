<!-- insrc:artifact BUILD-765de3f648ba09ee-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-19T04:53:15.800Z

**Commit:** 0b0291f2

## Scope

S5-1: in src/workflow/team/gate.ts, claim() and teamGate() repeat the holder comparison, the add-only addAssignee call, its failure handling and the contested check. Extract one private helper used by both, keeping each path's exact refusal wording and outcomes. No behaviour change.

## Triage rationale

A behaviour-preserving extraction inside one file.
