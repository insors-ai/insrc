<!-- insrc:artifact BUILD-9d8b55429378a3be-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-11-02T07:33:53.688Z  ·  **Updated:** 2026-11-02T07:33:53.688Z

**Commit:** 13948e28c

## Triage rationale

One story in one module with a clear approach: add REFERENCES (language sql) to Pass 2 of the cross-file pass with a name matcher over the repository's table/view entities; no storage or schema change.

## Summary

The cross-file pass now resolves pending SQL REFERENCES by name. REFERENCES joins PASS2_KINDS. The entity index gains sqlByName and sqlByLastSegment, and runPass2's dispatch gains a third arm, resolveSqlReference; only rows from a SQL entity are attempted. Matching: unquoted names compare case-insensitively; a qualified name matches only that definition; a bare name also matches any qualified definition ending in it. One candidate is written 'inferred', several stay ambiguous with their candidates, none is no-candidate (no-match). In settle mode, runPass2 also takes pending SQL references that a committed file's tables or views answer; rowsInScope is unchanged. The s9 assertion in sql-index.test.ts that cross-file references stay pending now expects inferred edges.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/indexer/__tests__/cross-file-sql-references.test.ts` — **insrc-build** (2026-11-02T07:33:53.688Z)
- `src/indexer/__tests__/sql-index.test.ts` — **insrc-build** (2026-11-02T07:33:53.688Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-02T07:33:53.688Z)
