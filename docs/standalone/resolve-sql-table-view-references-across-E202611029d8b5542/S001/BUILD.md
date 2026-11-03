<!-- insrc:artifact BUILD-9d8b55429378a3be-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-11-02T07:33:53.688Z  ·  **Updated:** 2026-11-02T08:12:44.741Z

**Commit:** 24a045cf2

## Triage rationale

One story in one module with a clear approach: add REFERENCES (language sql) to Pass 2 of the cross-file pass with a name matcher over the repository's table/view entities; no storage or schema change.

## Summary

The cross-file pass resolves pending SQL REFERENCES by name (REFERENCES in PASS2_KINDS, sqlByName/sqlByLastSegment, resolveSqlReference in a three-way dispatch). Unquoted names compare case-insensitively; a qualified name matches only that definition, a bare one also any qualified definition ending in it. One candidate is written 'inferred', several stay ambiguous, none is no-candidate. Manual code review over two cycles (4 rounds; last verdict pass). It added two things. First, a REFERENCES edge between SQL entities of one repository whose target is removed returns pending by name, under the names the SQL reader's own parse reads in the holder (SqlParser.referencesIn, registered through setSqlReferenceReader). A moved or re-schema'd table is then found again. With no reader or no matching name, it awaits the id as before. Second, a deviation from the LLD: a settle that commits any .sql file re-attempts all of the repository's pending SQL references, not only names the committed files define, so removals and renames are re-attempted too. Follow-ups, not fixed: L1, a stale inferred edge when a second candidate appears (as for CALLS); L2, a settle scans all pending rows on a .sql commit; L3, quoted identifiers lose case-sensitivity; L4, 2- and 3-part names don't meet.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/indexer/__tests__/cross-file-sql-references.test.ts` — **insrc-build** (2026-11-02T08:12:44.741Z)
- `src/indexer/__tests__/sql-index.test.ts` — **insrc-build** (2026-11-02T08:12:44.741Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-02T08:12:44.741Z)
- `src/db/relations.ts` — **insrc-build** (2026-11-02T08:12:44.741Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-02T08:12:44.741Z)
- `src/indexer/parser/sql.ts` — **insrc-build** (2026-11-02T08:12:44.741Z)
