# Story s8: test baseline

Taken on 2026-10-09 at commit `31a381e6` (the approval of the Story's build plan), on a clean tree, before the first source change of the Story. Node 22.

| Run | Command | Result |
|---|---|---|
| analyze suite | `npx tsx --test 'src/analyze/**/*.test.ts'` (no force-exit flag) | # tests 1077 # pass 982 # fail 0 # skipped 92  |
| the gated file | `INSRC_LIVE_TESTS=1 npx tsx --test src/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts` | # tests 11 # pass 11 # fail 0 # skipped 0  |

`analyze.txt` and `deterministic-runtimes.gated.txt` hold the result line of every top-level test (`ok` or `not ok`, with its name). The Story's last Task compares the same two runs against them by test name.
