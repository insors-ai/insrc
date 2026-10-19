# s1/t16 evidence — analyzer lookups state an incomplete repository

## What changed

- `ExplorationRunnerContext` gains optional `repoCompleteness`.
- `executor.ts` reads it once per plan execution (`readRepoCompleteness`: undefined for an unregistered repository or a failed read) and sets it at all three context constructions:
  - executePlan;
  - stepPlan's narrow prepare;
  - stepPlan's deterministic path.
- `graphCompleteness` gains only an optional `repoCompleteness`. An incomplete repository makes the record not established, and the basis note gets "The repository's index is not complete: <reasons>" (each reason carries its count). A complete repository, or none, gives exactly the record as before.
- `usage.example`, `import.graph`, `class.hierarchy`, `data-model.trace` and `convention.detect` pass `ctx.repoCompleteness` at both of their calls. The nine other callers are unchanged.
- **Test seam:** `_overrideNarrowRunnerForTest` in executor.ts (mirrors `_overrideRunnerForTest`). It lets the test read the narrow construction's context.

## Mutations (src/analyze/explore/__tests__/completeness-all-lookups.test.ts)

| Mutation | Failing test |
| --- | --- |
| the narrow construction left without the field (the plan's named mutation) | executor sets it at all three constructions |
| the executePlan construction left without the field | executor sets it at all three constructions |
| an incomplete repository not marked notEstablished | the five relationship lookups report notEstablished |
| a non-relationship caller (discovery-modules) passes the field | graphCompleteness unchanged / nine callers do not pass it |

**Note:** the first version of the nine-callers check skipped files it could not find. Five of the nine live under src/analyze/runtimes/, so it was vacuous for them; it now reads the real paths and fails on a missing file.

## Full sweep

`npx tsx --test --test-force-exit --test-timeout=400000 'src/**/__tests__/*.test.ts'`: # tests 5897 # pass 5764 # fail 5 # cancelled 0 # skipped 125 

- Pre-existing failures: sqlite-driver and review-decision.
- Three more failed under load and pass alone (13/13): search-filter and search-guard (seeded daemons running real 3,000-file indexes), and the delivery handlers (its known git maintenance flake).
