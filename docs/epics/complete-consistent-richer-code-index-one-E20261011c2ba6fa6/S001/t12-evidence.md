# s1/t12 evidence — daemon replies carry completeness

## What changed

- **Contract types** in src/shared/types.ts:
  - `RepoCompleteness` (the contract type; src/db/index-state.ts now re-exports it);
  - `PendingRelationshipClass` and `UnattributedUnwritableCount`;
  - optional `completeness` on `RegisteredRepo` and `RepoStats`, and optional `unattributedUnwritable` on `DaemonStatus`.
- **Helpers** in new src/daemon/repo-completeness.ts: `withCompleteness` (one state read per row, serial) and `unattributedUnwritable`. A read that fails leaves the field out and never fails the reply.
- **Replies:**
  - `repo.list`, `repo.stats` (all repositories and one) and `daemon.status` (its repository list) carry the field. The four-value status is unchanged; it is the registry's own.
  - `buildDaemonStatus` gains the optional `unattributedUnwritable` source, read only while the store is healthy.
  - The repo.stats handler keeps its `return all`, so its source-scanning contract test passes unchanged.

## Existing contract tests

repo-stats-handler-contract, repo-stats and daemon-status-lanes pass unchanged (`git diff` empty for those files).

## Mutations (each fails src/daemon/__tests__/repo-completeness.test.ts, a real daemon)

| Mutation | Result |
| --- | --- |
| repo.list without completeness | fail |
| repo.stats without completeness | fail |
| daemon.status's repository list without completeness | fail |
| unattributedUnwritable not wired | fail |

## Full sweep

`npx tsx --test --test-force-exit --test-timeout=400000 'src/**/__tests__/*.test.ts'`: # tests 5919 # pass 5788 # fail 3 # cancelled 0 # skipped 125 

That run's third failure was the repo.stats source-scan contract test. The handler was then changed to keep `return all`, and the test passes unchanged. The other two failures predate this Story: sqlite-driver and review-decision.
