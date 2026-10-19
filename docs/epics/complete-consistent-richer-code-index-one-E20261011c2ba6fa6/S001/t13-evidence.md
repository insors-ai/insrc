# s1/t13 evidence — CLI Repos pane shows completeness

`RepoRow` (src/cli/panes/ReposPane.tsx, now exported for its render test) shows an incomplete repository this way:
- `incomplete` sits beside the unchanged status;
- the number of causes and the first cause go on an indented line below, truncated at the terminal width. Rendering them inline wrapped the row; the frame was checked with ink-testing-library.

A complete repository, or one with no completeness field (unknown: a daemon before the change), shows the status alone.

## Mutations (src/cli/panes/__tests__/ReposPane-completeness.test.ts)

| Mutation | Failing tests |
| --- | --- |
| the incomplete marker never shown | 1 |
| shown whenever the index is not known complete (absent field read as incomplete) | 3 |

## Full sweep

`npx tsx --test --test-force-exit --test-timeout=400000 'src/**/__tests__/*.test.ts'`: # tests 5896 # pass 5766 # fail 2 # cancelled 0 # skipped 125 

Only the pre-existing failures: sqlite-driver and review-decision.
