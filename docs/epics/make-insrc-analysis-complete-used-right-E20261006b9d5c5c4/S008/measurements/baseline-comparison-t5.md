# Story s8: the suite after the last source change, compared with the baseline

Run on 2026-10-09 at commit `ba4b5014` (task t4, the Story's last source change), Node 22. The baseline was taken at `31a381e6`; see `../baseline/README.md`. Both runs use the same commands, and tests are compared by name.

| Run | Baseline | After |
|---|---|---|
| analyze suite, `npx tsx --test 'src/analyze/**/*.test.ts'` (no force-exit flag) | 1077 tests: 982 pass, 0 fail, 92 skipped, 3 todo | 1099 tests: 1004 pass, 0 fail, 92 skipped, 3 todo |
| the gated file, `INSRC_LIVE_TESTS=1 npx tsx --test src/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts` | 11 tests: 11 pass | 11 tests: 11 pass |

No test that passed in the baseline fails or is missing after the Story. The result line of every top-level test is in `after/analyze.txt` and `after/deterministic-runtimes.gated.txt`.

## Tests that changed

Two tests of the gated file were rewritten, and so have a new name. In the analyze suite, which runs without `INSRC_LIVE_TESTS`, both are skipped before and after; with the variable set both pass.

| Before | After | Result with `INSRC_LIVE_TESTS=1` |
|---|---|---|
| `surface.functional: unknown module entity id -> throws` | `the gated test of an unknown module value fails with the message that no stored source file lies under it` | pass |
| `structure.module-tree: repo with zero modules -> empty tree, not error` | `the gated test of a repository with no module entity and one source file gives one node '.' and no edge` | pass |

Each has an ungated test of the same case in `src/analyze/runtimes/code/__tests__/module-directories.test.ts`, because the build gate runs files without the variable.

## Tests added

22 tests pass after the Story that were not in the baseline: 5 in `runtimes/shared/__tests__/source-modules.test.ts`, 13 in `runtimes/code/__tests__/module-directories.test.ts`, 3 in `runtimes/__tests__/scope-sources.test.ts` and 1 in `runtimes/__tests__/completeness-all-runtimes.test.ts`.

## Not covered here

The whole repository's suite (`src/**`) was not run for this comparison; the Story changed files under `src/analyze` only, and `npx tsc --noEmit` is clean.
