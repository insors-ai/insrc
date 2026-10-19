# s1/t9 evidence — re-exports: EXPORTS edges, export_names, calls through barrels

## What changed

- **Pass 1b** (`runPass1b`, src/indexer/cross-file-resolver.ts) resolves each pending EXPORTS row:
  - to the named exported entity of the file its specifier resolves to, or that file entity for `export *`;
  - the edge (empty value) and the export_names entry are written in one transaction, through `promoteResolvedBatch`'s new optional `exportName`;
  - rows resolve in rounds, so a barrel of a barrel resolves in one pass;
  - a row whose source file is not stored is left for a later pass; a name found through no file (a cycle) is 'no-candidate' / 'no-match'.
- **`resolveCall`** widens a caller's candidates with `exportedTargets`, run for each imported file:
  - it checks the file's exported entity with the name, then its export_names entry for the name (alias included), then its `export *` sources;
  - the search is transitive, with a visited set;
  - a target that is not stored is ignored.
- **New `src/db/export-names.ts`:** the key `(file u64, name)`, an in-transaction put, and a one-scan read. `keys.ts` is unchanged.
- **`resolveImportPath`** (src/indexer/resolver.ts) is exported, unchanged, so Pass 1b resolves a specifier exactly as the per-file resolver resolves an import.
- **Pending-row id of an aliased re-export** (src/db/relations.ts, upsertUnresolvedRelations): `export { f }` and `export { f as g }` from one file are two relationships. The two rows hashed to the same id (repository, source, kind, raw name 'f'), so the second replaced the first and the un-aliased name was lost; the test found this. An EXPORTS row whose exportedAs differs from its raw name now includes the alias in its id. No other row's id changes.

## Mutations (each must fail a test in src/indexer/__tests__/reexport-callers.test.ts)

| Mutation | Failing tests |
| --- | --- |
| export_names lookup removed (the plan's named mutation) | 1, 3 |
| `export *` entries not followed | 1 |
| no visited set (an `export *` cycle recurses until the stack overflows) | 1, 2, 3 |
| alias not in the pending-row id | 1, 2 |
| no Pass 1b | 1, 2, 3 |

## Full sweep

`npx tsx --test --test-force-exit --test-timeout=180000 'src/**/__tests__/*.test.ts'`: # tests 5908 # pass 5775 # fail 4 # cancelled 1 # skipped 125 

- The pre-existing failures from t6–t8 are unchanged: sqlite-driver, review-decision, and search-filter (cancelled under load).
- Two more failed under load: `src/db/graph/__tests__/no-live-store-in-tests.test.ts` and `src/workflow/review/__tests__/template-review.test.ts` (a known timing flake). Both pass when run alone, with the t9 change (23/23) and with it stashed (23/23).

Left out: export_names upkeep on entity deletes (t10).
