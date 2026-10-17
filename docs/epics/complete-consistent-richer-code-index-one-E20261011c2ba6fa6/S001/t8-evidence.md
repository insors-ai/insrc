# s1/t8 evidence — cross-file pass modes, Pass 0 and a class for every row

## What changed

`runCrossFileResolver` (src/indexer/cross-file-resolver.ts) takes `mode` ('full' | 'settle' | 'repository', default 'repository') and `committedFiles` (required in settle mode).
- **Pass 0** promotes code-symbol rows whose awaited target is stored. It reads them through the by-target index (settle: the committed files' entities; full: every entity of the repository, rows from any repository) or, in repository mode, from the repository's own awaiting rows.
- **Pass 2** skips rows awaiting an id. It writes 'ambiguous' or 'no-candidate' (reason 'no-match') in every mode, and only when the class changes.
- **File-target classes** (full, and settle for the committed files): a row awaiting a file that is not stored is classed by `selectFile` (t7). 'not-code' becomes 'no-candidate' with reason 'target-not-code'. An excluded or selected file that is not stored stays awaiting with reason 'target-excluded-by-ignore' or 'target-not-committed'.
- **Full mode only:** a row of an unattempted code-symbol kind with no class and no awaited id becomes 'no-candidate' with reason 'not-attempted'. EXPORTS rows are left for t9.
- **Result:** gains `completedById` and `pendingByClass`.

Callers:
- `runSettlePass` makes ONE call in mode 'settle' with the settled files. It used to make one call per file with `scopeFile`.
- `resolveAfterReconcile` passes mode 'repository'.
- `fullIndex` keeps the default until t11 gives it 'full'.

**Addition the design did not name:** the per-file resolver now records `meta.targetFile` (the absolute path) on a resolved relative IMPORTS. A file entity id is a hash of its path, so a row kept awaiting that id could not otherwise be classed by the selection rule. The keep-awaiting writer keeps the rest of the meta, so the path rides on the row. An edge stores no meta, so nothing else changes.

## Acceptance note: JSON.parse

The parser records no CALLS row for `JSON.parse(s)`: `parse` is in the TypeScript parser's built-in method list. So there is no row to class. The test checks the outcome the check is after: a complete repository stays complete after an edit that adds `JSON.parse`, a call to a library function (`lodashMap`, classed 'no-candidate' / 'no-match') and an import of `../assets/logo.png` ('no-candidate' / 'target-not-code').

## Mutations (each must fail a named test)

| Mutation | first-index-order | cross-file-modes |
| --- | --- | --- |
| keep-awaiting branch removed from upsertResolvedRelations | 1 | — |
| runSettlePass passes committedFiles [] | — | 1, 2 |
| selection rule not applied (every file target 'selected') | — | 2, 4 |
| no Pass 0 | 1 | 1 |
| Pass 2 writes no 'no-match' class | — | 2 |
| resolveAfterReconcile runs mode 'full' | — | 3 |
| no unattempted classing in full mode | — | 4 |

## Full sweep

`npx tsx --test --test-force-exit --test-timeout=180000 'src/**/__tests__/*.test.ts'`: # tests 5875 # pass 5744 # fail 2 # cancelled 1 # skipped 125 

These are the same pre-existing failures as at t6/t7: sqlite-driver (SqliteDriver via pool, temporalTrend), review-decision (a `/private/var` path), and search-filter (cancelled under load; passes alone).
