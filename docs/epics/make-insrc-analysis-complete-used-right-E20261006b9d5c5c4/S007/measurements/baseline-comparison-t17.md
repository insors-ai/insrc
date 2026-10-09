# Baseline comparison after the Story's code tasks (Story s7, task t17)

Run on 2026-10-09 at commit `2c077093` plus the daemon guide's edit, Node 22,
`npx tsx --test 'src/<suite>/**/*.test.ts'` **without** `--test-force-exit`
(with the flag a sweep now and then drops trailing tests and still exits 0,
so it cannot be compared by name). The baseline is the one in
`../baseline/`, taken at `f56c9802` before the Story's first change.

| Suite | Tests | Pass | Fail | Skipped | Baseline (tests / pass / fail / skipped) |
|---|---|---|---|---|---|
| analyze | 1076 | 981 | 0 | 92 | 1045 / 950 / 0 / 92 |
| mcp | 428 | 428 | 0 | 0 | 390 / 390 / 0 / 0 |
| daemon | 781 | 764 | 1 | 16 | 772 / 755 / 1 / 16 |
| workflow | 1635 | 1633 | 0 | 2 | 1579 / 1577 / 0 / 2 |

The mcp and workflow suites grew through work merged from `main` during the
Story, not through this Story.

**By name.** Every top-level test that is `ok` in the baseline was looked up
in the new run:

```
analyze: baseline passing names 949; now failing 0; no longer present 8; new names 40; failing now: []
   GONE: resolveRepoPath: repo kind -> value passthrough
   GONE: resolveRepoPath: manifest-dir kind -> value passthrough
   GONE: resolveRepoPath: unsupported kind -> throws with supported-list hint
   GONE: resolveRepoPathFromIntent: workspace kind -> value
   GONE: resolveRepoPathFromIntent: repo kind -> value
   GONE: resolveRepoPathFromIntent: manifest-dir kind -> value
   GONE: resolveRepoPathFromIntent: unsupported kind -> throws with supported-list hint
   GONE: resolveRepoPath: workspace + repo + manifest-dir all pass through; symbol -> throws
mcp: baseline passing names 390; now failing 0; no longer present 0; new names 38; failing now: []
daemon: baseline passing names 438; now failing 0; no longer present 1; new names 10; failing now: ['SqliteDriver (via pool)']
   GONE: runPurge refuses on status=in-progress without force; force=true overrides
workflow: baseline passing names 1577; now failing 0; no longer present 0; new names 56; failing now: []
```

**Reading it.**

- No test that passed in the baseline fails now, in any of the four suites.
- The one failing test, `SqliteDriver (via pool)` in the daemon suite, fails
  in the baseline too and is not part of this Story.
- Eight baseline tests are no longer present in the analyze suite. All eight
  are tests of the three removed scope functions (`resolveRepoPath` of the
  code family, its copy in the infra family, and `resolveRepoPathFromIntent`
  of the data family), which the plan says are replaced, not kept.
- One baseline test is no longer present in the daemon suite under its old
  name, and it is **not** a test of a removed function, so it is named here:
  `runPurge refuses on status=in-progress without force; force=true overrides`.
  Task t14 changed what the daemon's purge request does with a record left in
  progress (it purges one with no live run), so the test now holds its run
  live and is titled `runPurge refuses on status=in-progress for a live run
  without force; force=true overrides`. It passes.

The result line of every top-level test of the new run (`ok` or `not ok`, with
its name) is in `after/<suite>.txt`, in the same form as the baseline's files.
