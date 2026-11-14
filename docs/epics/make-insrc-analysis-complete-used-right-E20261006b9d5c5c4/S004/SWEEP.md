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
