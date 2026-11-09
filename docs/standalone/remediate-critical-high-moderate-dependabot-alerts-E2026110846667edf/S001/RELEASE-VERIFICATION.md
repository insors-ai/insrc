# Release verification

The root lockfile has zero matching resolved instances for all 110 in-scope root Dependabot alerts. The four archived qualification lockfiles match their reviewed baseline bytes. The eight low alerts are outside this story.

Live SQL Server verification is deferred under the approved plan. The saved-configuration fixture exercised schema discovery and bounded reads at the Tedious SDK boundary. The standalone package passed clean macOS arm64/APFS and Linux arm64/ext4 installs and cross-release restore tests. See DRIVER-QUALIFICATION.md and NATIVE-QUALIFICATION.md for details.

## Combined build and test sweep

After tasks t1–t5 passed targeted validation, the root build passed and the combined backend and project-memory sweep exited with status 1 on `f37bfbb51e42e744f053540bdbf56dc9924b7359` under Node 22.22.1. The packed tests used the qualified release tarball and the pre-upgrade tarball.

```sh
export PATH="/tmp/insrc-node22.UC6NTB/node_modules/.bin:$PATH"
export CXXFLAGS=-std=c++17
export INSRC_MEMORY_RELEASE_TARBALL=/tmp/insrc-memory-release-t5.3Qvyi2/insrc-project-memory-0.1.0.tgz
export INSRC_MEMORY_PREVIOUS_TARBALL=/tmp/insrc-memory-preupgrade.HO924N/insrc-project-memory-0.1.0.tgz
npm run build
node --import tsx --test --test-concurrency=2 --test-force-exit --test-reporter=tap \
  'src/**/__tests__/*.test.ts' 'packages/project-memory/src/**/__tests__/*.test.ts'
```

| Tests | Passed | Failed | Cancelled | Skipped | Todo |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 8,709 | 7,965 | 560 | 37 | 144 | 3 |

One stalled worker for `peer-state-store-leakfree.test.ts` was stopped so the sweep could finish. That file also stalled on the unchanged baseline. The sweep took about 28 minutes. Raw logs and the runner interruption record are in `/tmp/insrc-dependabot-sweep.XHqEr6/`.

Targeted reruns on baseline `33eefb2693c64ae393b54ebda479c5dce182d846` reproduced 600 of the 602 distinct TAP failure or cancellation signatures when matched by file and case title, including file and hook failures. A separate diagnostic rerun on baseline reproduced the MCP publication race with the same `reviewId: already-running` response. See `comparison.txt` and `mcp-baseline-probe-16.tap` in the sweep log directory.

The driver diagnostic audit was the sole remaining branch-specific failure. Commit `445774cf2` refreshed reviewed SDK version and source pins after auditing the changed SDKs. All seven targeted checks passed in `t2-post-sweep.tap`, and the daemon revalidated t2. The combined sweep remains red at the recorded revision. The correction was tested with targeted checks after the sweep.

The story owner deferred remediation of the reproduced baseline failures to [GitHub issue #143](https://github.com/insors-ai/insrc/issues/143).

## Post-deployment GitHub reconciliation

Status is pending a deployment to the default branch and completion of its dependency scan. Run the following from a session with access to the repository's Dependabot API. The command is read-only and includes fixed and dismissed states.

```sh
gh api --paginate --slurp 'repos/insors-ai/insrc/dependabot/alerts?per_page=100' |
  jq '[.[][] | {number, state, fixed_at, dismissed_at, manifest: .dependency.manifest_path}]'
```

Match the result to the captured alert IDs in DEPENDABOT-SNAPSHOT.json. Record whether each scoped alert is fixed, remains open, or is absent from the authenticated response. Investigate missing or still-open root IDs. Keep the following cases separate:

- The 12 Sharp alerts on the four archived qualification lockfiles describe original historical evidence. The files were preserved byte-for-byte. Record any decision about those tracker entries separately from production and standalone dependency remediation.
- Alert #41 is the ZIP symlink advisory. GitHub's metadata names no first patched version, while its affected range ends at 0.6.0. The same overwrite-enabled test reproduces outside writes on 0.5.18 and verifies preserved bytes and permissions on 0.6.1. If GitHub still reports the alert after its scan, record it as a tracker metadata discrepancy pending confirmation.
- The eight low-severity alerts are outside this release acceptance gate.

Keep authenticated tracker verification pending if the endpoint is unavailable or the scan has not completed. No tracker state was changed during the build.
