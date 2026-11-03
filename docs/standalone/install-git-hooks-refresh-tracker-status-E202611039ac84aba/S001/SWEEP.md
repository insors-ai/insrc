# Sweep of Story 9ac84abac177b399/s1 (t7)

Run on 2026-11-03 in the foreground, one process per test file (`npx tsx --test-force-exit <file>`), by area. The clean base is a detached worktree of `52c23f143` (the commit before t1 of this Story) with this tree's `node_modules`. A file is compared by its exit code and failing test names.

## Areas

| Area | Files | Result against the clean base |
|---|---|---|
| `src/workflow/tracker`, `src/workflow/config`, `src/config`, `src/bin` | 70 | identical failures (see below); the new `src/bin/__tests__/insrc-git-hook.test.ts` passes |
| `src/daemon/__tests__` | 99 | identical except the two files below |
| `src/cli` | 40 | identical |

## Failures present in both trees (not caused by this Story)

- `src/config/__tests__/config-catalog-contract.test.ts` (3 tests) and `src/workflow/tracker/__tests__/github-adapter.test.ts` (1 test).
- Daemon: `code-review-freshness-request`, `code-review-rpc-fallback`, `code-review-rpc`, `daemon-doc-repo-table`, `team-settle`, `workflow-review-rpc`, `handler-runtime`, `lifecycle-wiring`, `model-literal-scan`, `review-resolve-daemon`; `lifecycle-adopt-wiring` and one `handler-runtime` team test failed in the first base run and passed in the second, so they are treated as load noise.
- CLI: `src/cli/panes/__tests__/MCPSection.test.ts` (1 test).

## Differences

- `repo-call-audit.test.ts` and `repo-call-table.test.ts` fail in this tree and pass on the base. The only names they report are `design-review-step.recover` and `design-review-step.failure`: step phases of the design-review work in the same working tree (untracked and modified `src/workflow/review/design-review/*` files of another session), which the clean base does not have. The three `repo.gitHooks.*` methods were reported by these two tests until `handler-runtime.ts` listed them in its own text (fixed in the commit after t7); they are not reported now.
- `handler-runtime.test.ts` (key-set test) fails in both trees. In this tree its only difference from the recorded list is the `designReview.*` methods of the same other session; the three `repo.gitHooks.*` methods are in `ADDED_RPC`.

## Other checks

- `node scripts/forbidden-spawn-scan.mjs --fail`: 0 sites.
- `npx tsc --noEmit`: clean outside the other session's design-review files.
- The full sweep over every directory was not run (once per plan, by area); `src/mcp`, `src/analyze`, `src/indexer` and `src/db` are untouched by this Story.
