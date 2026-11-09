# S1 final verification

The root build passed. The combined sweep finished with failures, so the smoke gate remains open.

| Input | Revision or setting |
| --- | --- |
| Story source | `077ee1c3140105ca8e6f3d3390a2ec7932674776` |
| Upstream baseline | `f05e650eaab8e8020a2bf4e38ac16309e38d4924` |
| Exact merged source under test | `f3ea4962281ff77547f04d3522bd27e15e683719` |
| Runtime and package manager | Node 22.23.2 and npm 10.9.8 on macOS ARM64 |

The merged source is available locally at `refs/verification/task-progress-s1`. It was built in an isolated checkout outside the daemon's repository registry. T1 through T5 passed daemon validation before the sweep.

## Reproduction

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
export CXXFLAGS=-std=c++17
npm ci --offline --no-audit --no-fund
npm run build
node --import tsx --test --test-concurrency=2 --test-timeout=180000 --test-force-exit \
  --test-reporter=tap 'src/**/__tests__/*.test.ts' \
  'packages/project-memory/src/**/__tests__/*.test.ts'
```

The documented C++17 flag was required for the native dependency install. The first install without it failed to compile `fs-ext`. The root build exited 0. The single combined sweep ran from 13:19:54 UTC to 13:59:58 UTC on 2026-11-09 and exited 1. The runner enforced the per-test timeout. No runner or test process was stopped by hand.

| Total | Passed | Failed | Cancelled | Skipped | Todo |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 8,825 | 8,185 | 485 | 7 | 145 | 3 |

The full run passed the task-progress suites and the isolated project-memory package tests. Live model and external database tests followed their normal environment gates. The optional project-memory upgrade test requires a previous-release tarball, which was unavailable for this run. Live CLI transport qualification and VS Code presentation remain in their respective successor stories. The executor adapters for workflows, analysis, reviews, and managed test sweeps are also separate stories.

## Handler registry correction

The sweep found an out-of-date exact registry snapshot. The snapshot omitted the new progress methods and the pre-existing `designReview.impact` method. Commit `e2619670d` updates the expected RPC and stream keys. The focused registry assertion passed on the source checkout and on the swept merge with that test-only patch applied. The original full-sweep result above is retained.

## Upstream comparison

The targeted upstream build passed with the same dependency lockfile. Targeted test files from the original sweep reproduced 487 of the 490 distinct top-level TAP failure or cancellation signatures when matched by file and case title. That count includes the registry snapshot title, whose baseline failure had the pre-existing review-method omission. Both nested completion-evidence failures also reproduced.

Three original signatures did not recur in targeted runs of either revision. Two were native process broker fixture cases, covering chunked readiness and invalid capture cleanup. The third was the controller review disconnect case. A different controller inactivity case failed in targeted runs of both revisions. The original failure and cancellation counts remain as reported by the combined runner.

Raw build and sweep logs, baseline comparisons, and the focused registry rerun are in `/tmp/insrc-progress-s1-F74F7K/`. The full TAP log has SHA-256 `367722e3827be0dac48c985abae1fd85210a74967eefce1931ebdc9c9a46109e`. Prior baseline remediation is tracked separately in [issue #143](https://github.com/insors-ai/insrc/issues/143). A gate exception for this sweep has not been recorded.
