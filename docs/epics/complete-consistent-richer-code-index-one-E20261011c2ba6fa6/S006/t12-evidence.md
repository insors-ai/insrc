# Story s6 / t12 — conformance and full-sweep evidence (2026-11-01)

## FileFilter against real git on this repository

`/tmp/s6-real-conformance.mts` compared `createFileFilter(repo).listFiles()` with
`git ls-files --cached --others --exclude-standard` (less files not on disk and
the built-in exclusions: `.insrc/`, `.git/`, generated or minified files) on
`/Users/subhagho/work/projects/insors/insrc`:

| FileFilter | git | only git | only FileFilter | build time |
|-----------:|----:|---------:|----------------:|-----------:|
| 6,795      | 6,795 | 0      | 0               | 164 ms     |

## Defect the conformance fixture found (fixed in t12)

A nested `.gitignore` pattern with no separator (`!*.log` in `pkg/inner/`)
was prefixed as `pkg/inner/*.log`, matching only directly in that directory;
git applies it at any depth below. `addPrefixed` now prefixes such patterns
with `**/`; a pattern with a leading or middle separator stays relative to its
own directory.

## Full sweep at the end of the plan

`npx tsx --test --test-force-exit --test-timeout=180000 'src/**/__tests__/*.test.ts'`
on HEAD: 7,160 tests, 6,989 pass, 32 fail, 1 cancelled, 135 skipped.
Each failing file was rerun alone; those still failing were run on a worktree
of the commit before s6 (`45a5eb6c9^` = 6e67f713a):

- Fail on the baseline too (not s6): doc-summary-restore-ipc, repo-completeness,
  search-filter, search-guard, search-request-contract (real daemon does not
  start in a temp HOME), mcp import-graph, live-store-file-refusal,
  understanding storage, driver-log-policy, session-service-isolation,
  duckdb-file-driver, session-source-inventory (other work's unclassified
  files only).
- Load-only (pass alone): MCPSection, boot-cold-import, threads-boot,
  summary-link, controller-review, session-release-gate, connection-manager
  corpus/kotlin-*.
- Caused by s6, fixed here: module-state-inventory (three removed lists stale,
  `file-filter.ts#stateByFilter` unclassified).
- Caused by s6, NOT fixed (needs a stakeholder decision):
  connection-manager-release CM-S5-GATE pins the sha256 of
  `src/daemon/index.ts` in the connections Epic's S005 consumer-inventory.json;
  66e0566c0 changed one line of that file (the threads-off IndexerService gets
  the cheap-tier ignore model).
