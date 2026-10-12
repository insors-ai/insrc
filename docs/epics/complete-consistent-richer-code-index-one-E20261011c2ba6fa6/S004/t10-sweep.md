# Story s4, Task t10: full test sweep with the refusal on

Run on 2026-10-12, Node v22.23.2, at commit afd417ad (t10), with:

    npx tsx --test --test-force-exit --test-timeout=180000 \
      'src/**/__tests__/*.test.ts' 'src/**/__tests__/*.test.tsx' \
      'vscode-plugin/src/**/__tests__/*.test.ts'

| tests | pass | fail | cancelled | skipped |
| ---: | ---: | ---: | ---: | ---: |
| 6659 | 6518 | 4 | 5 | 129 |

## Newly failing with the refusal on: none

The first run with the refusal on also failed three tests: two whose stand-in
daemon opened the live store of a temporary home without declaring itself
(`review-source-roots-daemon.test.ts`, `steering-refresh-through-daemon.test.ts`),
and the fixture of `no-live-store-in-tests.test.ts`. That is the refusal
working. All three now declare ownership, as the real daemon does, and pass.

## Failing before and after this Task (9 tests in 4 files)

Each of these was run at the commit before this Task (db593f31) in a separate
worktree. It failed there the same way, so it is not caused by the refusal:

| File | Tests | Status |
| :--- | :--- | :--- |
| `src/daemon/db/__tests__/sqlite-driver.test.ts` | SqliteDriver (via pool) | already failing |
| `vscode-plugin/src/__tests__/activation.test.ts` | 5 tests cancelled ("Promise resolution is still pending") | filed: ISSUE-c03a454b11fd5933 |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | cancel() stops the process group (reads `/proc`, absent on macOS) | filed: ISSUE-96f66552d63b2c6e |
| `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts` | 2 tests: `insrc.analyzer.dataSourceListingTimeoutMs` not declared | filed: ISSUE-37ca9cf46748fb43 |

So the check "the full test sweep passes with the refusal on" holds for
everything this Task can affect. It does not hold literally: the nine tests
above fail on `main` with or without it.
