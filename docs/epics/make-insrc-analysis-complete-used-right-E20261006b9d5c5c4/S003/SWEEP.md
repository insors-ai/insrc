# s3 full sweep (task t14)

Run by hand on 2026-11-09 in foreground chunks, each compared with a clean checkout of `276949430` (the commit before any s3 code).

| Area | This tree | Clean base | Verdict |
|------|-----------|------------|---------|
| `src/analyze` | 2 failing: `role-router-global-tiers`, allowlisted seam files | the same 2 | same as base |
| `src/daemon` | 48 failing files | the same 48 (`session-release-gate`: 1 failing here, 3 there) | same or better |
| `src/workflow` | 30 failing files | identical counts per file | same as base |
| `src/agent`, `src/shared`, `src/config`, `src/indexer`, `src/cli` | failures identical to base | | same as base |
| `src/mcp` | 23 failing | 25 failing | better |
| `src/db` | 3 failing ("create nothing at the default path" audit) plus slow migration tests that exceed the time limit | the audit fails the same way | same as base |
| `src/docgen`, `src/design`, `src/artifact-theme`, `src/bin` | pass | | |

Regressions of this Story that the sweep found and t14 fixed:

- an overridden `synthesize` step must win over the real answer step (about 12 `analyze` tests);
- one part with one reference round is asked as the one reply (`executor-lmdb` plan-phase test);
- an import cycle between `handling.ts` and `driver.ts` (the answer-step errors now live in `answer-step-error.ts`).

Not run: `docs-broad-live.test.ts` (INSRC_LIVE_TESTS=1). It goes through the daemon, which does not contain this code until it is pushed and updated. It writes `LIVE-RUN.json` when it runs.
