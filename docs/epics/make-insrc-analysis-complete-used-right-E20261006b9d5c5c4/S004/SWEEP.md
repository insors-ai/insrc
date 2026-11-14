# Story s4 — full sweep record (2026-11-14)

Run once after t1–t13, in foreground chunks, on a machine with no docker and no Redis.
Command shape: `npx tsx --test --test-force-exit --test-concurrency=N '<glob>'`.

| Chunk | Tests | Pass | Skipped | Fail | Notes |
|---|---|---|---|---|---|
| `src/analyze/**` | 1404 | 1304 | 95 (live, gated) | 2 | `role-router-global-tiers`, `provider-bypass-audit`: both assert on daemon review files that another session has uncommitted changes in |
| `src/db`, `indexer`, `mcp`, `agent`, `config`, `docgen`, `understanding`, `design` | 1900 | 1835 | 20 | 45 | all in review / MCP-stream / ollama-private-transport / config-catalog / no-live-store (missing files or exports in the other session's review work); none in the analyzer, the exploration cache or the data drivers |
| `src/daemon/db`, `src/daemon/tools` | — | — | — | — | hit the 580 s limit; the failures listed were docker/service-backed `CM-S*` probe tests and daemon approval/review tests |
| `src/shared`, `cli`, `daemon/steps`, `artifact-theme` | — | — | — | — | hit the time limit, no result |
| `src/workflow`, rest of `src/daemon` | — | — | — | — | not run |

The sweep is **partial**. Live checks: `search-text-live.test.ts` passed with `INSRC_LIVE_TESTS=1`
(live `search.text` equals `grep`'s count); `redis-etcd-live.test.ts` is written and gated
(`INSRC_LIVE_TESTS=1` and `INSRC_TEST_REDIS_URL`) but was **not run**: no Redis server was available.

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
