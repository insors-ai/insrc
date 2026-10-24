# t8 full sweep (2026-10-24)

`npx tsx --test --test-force-exit 'src/**/__tests__/*.test.ts'` on main at
638bc929 (t7), Node 22, in the shared tree (which also held another
session's uncommitted `src/daemon/db` work).

```
# tests 6438
# pass 6291
# fail 6
# cancelled 6
# skipped 132
# todo 3
# duration_ms 305978
```

None of the 12 comes from this Story:

| Test file | Tests | Cause |
|---|---|---|
| src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts | 3 fail (`safeList` / `withConnection` is not a function) | Pre-existing: fails identically at 2eed53a1 (the commit before this Story) and at HEAD in a clean worktree |
| src/daemon/db/__tests__/connection-leases.test.ts | 6 cancelled (CM-S1-M, "Promise resolution is still pending") | Pre-existing: same at 2eed53a1 and HEAD |
| src/daemon/threads/__tests__/threads-boot.test.ts | 1 fail (SIGTERM during an indexing pass) | Pre-existing: same at 2eed53a1 and HEAD |
| src/daemon/__tests__/search-filter.test.ts, search-guard.test.ts | 2 fail ("the full index ... was never seen running") | Load-sensitive: both pass when run alone |

Every suite this Story touched (analyze/explore, analyze/context, analyze/planner,
agent/providers structured output) passed in the sweep.
