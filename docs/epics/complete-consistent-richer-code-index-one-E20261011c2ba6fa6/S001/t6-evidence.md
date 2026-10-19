# s1/t6 evidence — pending EXPORTS rows for re-exports

## Files without re-exports parse as before

The parser at HEAD (before t6, a worktree of 8a68058e) and the t6 parser were run over every tracked TypeScript file under `src/`. Entities were compared with `indexedAt` blanked, and relations were compared with EXPORTS rows removed. Script: `/tmp/t6-compare.mts`.

```
files 1370; identical apart from EXPORTS rows 1370; files with re-exports 38 (603 EXPORTS rows); differing 0 []
```

## Mutations (each must fail a test in typescript-reexports.test.ts)

| Mutation | Failing tests (per language block) |
| --- | --- |
| no EXPORTS rows emitted | 1, 3 |
| alias ignored (exportedAs = name) | 1 |
| no row for `export *` | 1, 3 |
| any `*` matched, including `export * as ns` | 1, 2 |

## Full sweep

`npx tsx --test --test-force-exit --test-timeout=180000 'src/**/__tests__/*.test.ts'`: # tests 5869 # pass 5738 # fail 2 # cancelled 1 # skipped 125 

The failures and the cancellation predate t6:
- `src/daemon/db/__tests__/sqlite-driver.test.ts` (SqliteDriver via pool, temporalTrend) fails the same way on the pre-t6 worktree.
- `src/workflow/__tests__/review-decision.test.ts` compares a `/private/var` temp path with `/var`.
- `src/daemon/__tests__/search-filter.test.ts` was cancelled under sweep load and passes when run alone.

Left out: `export * as ns from` (a namespace re-export, not one of the three forms) emits no row.
