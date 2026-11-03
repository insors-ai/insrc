<!-- insrc:artifact BUILD-0f3376a086e3601c-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-03T10:37:50.308Z  ·  **Updated:** 2026-11-03T10:41:55.428Z

**Commit:** fe6acd85c

## Summary

Added src/indexer/parser/sql-names.ts (segments, collision-free JSON key, folded last segment, folded text, stored-identifier writer) and moved the SQL reader onto it (@ce3a4f227, reworked @fe6acd85c after the first gate): definitions store meaningful double quotes ("Users", "a.b") with distinct ids, others unchanged; same-file references and CTEs match by key; references dedupe by key; pending rawTo and referencesIn keep names as written, quotes kept. Grammar-limit names (brackets read by the grammar as bare identifiers, a double-quoted identifier cut at an escaped quote, a dotted backtick) are unquoted exactly as before for definitions, references and CTEs, pinned against the reader at 49b1d78f1 (names, ids, references, referencesIn). The three sql.test.ts conflation assertions were updated. Mutation check: 18 mutants over both commits, all caught.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/indexer/parser/__tests__/sql-names.test.ts` — **insrc-build** (2026-11-03T10:41:55.428Z)
- `src/indexer/parser/__tests__/sql.test.ts` — **insrc-build** (2026-11-03T10:41:55.428Z)
- `src/indexer/parser/sql-names.ts` — **insrc-build** (2026-11-03T10:41:55.428Z)
- `src/indexer/parser/sql.ts` — **insrc-build** (2026-11-03T10:41:55.428Z)
