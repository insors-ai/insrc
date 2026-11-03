<!-- insrc:artifact ISSUE-0f3376a086e3601c -->

# SQL references miss across 2- and 3-part names, fold quoted case, keep stale inferred links and re-scan every pending row on each .sql save

## Reproduction

Four cases, each in a repository with .sql files:
(L4) Define `CREATE TABLE app.users (...)` in one file and reference `db.app.users` from a view in another (or define `db.app.users` and reference `app.users`). Observed: the REFERENCES row stays unresolved. Expected: the two names meet when one is a qualified suffix of the other, and stay ambiguous when several definitions fit.
(L3) Define `CREATE TABLE "Users" (...)` and `CREATE TABLE users (...)`, and reference `"Users"`. Observed: both definitions are candidates (names are lower-cased), so the reference is ambiguous or links to the wrong one. Expected: a quoted identifier keeps its case and matches only the same quoted name; unquoted names keep folding.
(L1) A view references `users`; one file defines `users`, so the reference is linked ('inferred'). Later another file defines a second `users` (another schema). Observed: the old inferred edge stays as if still the only candidate. Expected: the reference is re-checked and becomes ambiguous (unresolved CALLS rows behave the same today).
(L2) In a repository with many pending SQL references, save any .sql file. Observed: the settle re-reads and re-attempts every pending SQL reference of the repository. Expected: the re-attempt costs in proportion to what the saved files can change.

## Root cause

(L4) The resolver indexes SQL tables and views by lower-cased full name and, for a qualified name, by its last segment only (src/indexer/cross-file-resolver.ts:1042-1045); sqlCandidates looks a reference up by its exact lower-cased name in both maps (src/indexer/cross-file-resolver.ts:798-801), so a qualified reference finds only the identical qualified definition and a 3-part name never meets a 2-part one. (L3) Names are lower-cased without regard to quoting: the reader's same-file map (src/indexer/parser/sql.ts:150, src/indexer/parser/sql.ts:156), CTE names (src/indexer/parser/sql.ts:75-81) and the resolver index and lookup (src/indexer/cross-file-resolver.ts:800, src/indexer/cross-file-resolver.ts:1043). (L1) resolveSqlReference runs only on unresolved rows (src/indexer/cross-file-resolver.ts:809-813); an edge already resolved as 'inferred' is never revisited when a new definition with the same name is committed. (L2) In settle mode, any committed .sql file makes sqlReferencesAwaitingCommitted list all of the repository's unresolved relations and re-attempt every pending SQL reference (src/indexer/cross-file-resolver.ts:819-830), a deviation recorded on the SQL cross-file Story's BUILD.

## Fix intent

SQL references resolve the way SQL names work: a qualified reference meets a definition whose qualified name it is a suffix of (or that is a suffix of it), ambiguity stays ambiguous and is never guessed; quoted identifiers keep their case while unquoted ones fold; an inferred link is re-checked when a new definition could make it ambiguous; and a settle after a .sql save re-attempts only the pending references the saved files' names can affect. Each case gets a test; behaviour for already-correct cases (exact names, bare names, same-file links) is unchanged.

## Citations

- **[[c1]]** `code` `src/indexer/cross-file-resolver.ts:798-801` — "function sqlCandidates(name: string, index: EntityIndex): Entity[] { const key = name.toLowerCase(); return [...(index.sqlByName.get(key) ?? []), ...(index.sqlByLastSegment.get(key) ?? [])]; }"
- **[[c2]]** `code` `src/indexer/cross-file-resolver.ts:1042-1045` — "const name = e.name.toLowerCase(); add(sqlByName, name, e); if (name.includes('.')) add(sqlByLastSegment, name.slice(name.lastIndexOf('.') + 1), e);"
- **[[c3]]** `code` `src/indexer/cross-file-resolver.ts:809-813` — "function resolveSqlReference(row: UnresolvedRelation, index: EntityIndex): ResolveIntent { const candidates = sqlCandidates(row.rawTo, index)..."
- **[[c4]]** `code` `src/indexer/cross-file-resolver.ts:819-830` — "if (!(opts.committedFiles ?? []).some(f => f.toLowerCase().endsWith('.sql'))) return []; ... return (await listUnresolvedRelations(opts.db, opts.repoRoot))"
- **[[c5]]** `code` `src/indexer/parser/sql.ts:150-156` — "byName.set(objName.toLowerCase(), id); ... const local = byName.get(target.toLowerCase());"
- **[[c6]]** `code` `src/indexer/parser/sql.ts:75-81` — "const ctes = new Set(... .map(n => unquote(n).toLowerCase())); ... if (!ctes.has(name.toLowerCase())) names.push(name);"
- **[[c7]]** `prior-artifact` `docs/standalone/resolve-sql-table-view-references-across-E202611029d8b5542/BUILD.md`
