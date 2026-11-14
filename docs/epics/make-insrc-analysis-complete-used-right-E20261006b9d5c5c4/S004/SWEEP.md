# Story s4 — full sweep record (2026-11-14)

Run once after t1–t13, in the background with `--test-force-exit --test-concurrency=4`, on a machine with
no docker. Every test file under `src/` was run in one of five groups.

| Group | Tests | Pass | Skipped | Fail |
|---|---|---|---|---|
| `src/analyze/**` | 1404 | 1304 | 95 (live, gated) | 2 |
| `src/db`, `indexer`, `mcp`, `agent`, `config`, `docgen`, `understanding`, `design` | 1900 | 1835 | 20 | 45 |
| `src/workflow/**` | 2368 | 2212 | 1 | 155 |
| `src/daemon/**`, `src/shared/**`, `src/cli/**` | 3100 | 2822 | 83 | 193 |

(`src/artifact-theme` and `src/bin` ran only in an earlier partial chunk.)

## Which failures are this Story's

Every file that had a failure (213 files) was run again on a checkout of the commit before this Story's
first change (`8617331d3^`). Of the 213, 81 passed there. Those 81 were sorted by area and the ones near this Story's code (analyzer, exploration cache, data drivers, search) were run and debugged by hand:

- Mine, now fixed: `daemon/steps/__tests__/adherence-cache.test.ts` (it called `constraintRecordPathFor` with the
  signature t9 removed) and `daemon/db/__tests__/driver-field-audit.test.ts` (it fingerprints driver sources; t10
  changed `etcd.ts`, `redis.ts` and `db-driver.ts`, not how fields are read, so the three digests were updated).
  Both pass again.
- Not mine: `search-guard.test.ts` hangs for 280 s at the baseline and at HEAD alike. The rest of the 81 are the
  review, workflow-gate, shutdown and thread tests of another session's uncommitted review work in the same tree
  (`PENDING REVIEW RE-IMPLEMENTATION`, esbuild `Transform failed` syntax errors, missing review history).
- The other 132 files fail at the baseline as well.

## Live checks, run 2026-11-14

Redis 8.0.5 (Ubuntu package, extracted without root) on port 6344, no persistence.

```
$ INSRC_LIVE_TESTS=1 INSRC_TEST_REDIS_URL=redis://127.0.0.1:6344 npx tsx --test src/daemon/db/__tests__/redis-etcd-live.test.ts
✔ a live Redis listing is reported as sampled and incomplete (111.811583ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ skipped 0

$ INSRC_LIVE_TESTS=1 npx tsx --test src/analyze/explore/__tests__/search-text-live.test.ts
✔ a live search.text over this repository returns the same count as an independent search of the same pattern (504.788871ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ skipped 0
```

The Redis keys the test seeded were removed (DBSIZE 0 afterwards).
