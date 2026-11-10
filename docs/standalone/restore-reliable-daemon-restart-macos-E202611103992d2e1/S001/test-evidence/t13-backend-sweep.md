# T13 backend regression sweep

The test source was pinned to `e61e99da9` in a disposable worktree on
Apple Silicon with Node 22.23.2. The runner enumerated all 1,458
`src/**/__tests__/*.test.ts` files. It used a temporary home, cleared
`INSRC_REPO`, and left the live-service test flag unset. It ran the five files
that rebuild shared output in a serial group before starting the other 1,453
files with concurrency eight. Both groups used Node's TAP reporter with
`--import tsx --test --test-force-exit --test-timeout=180000`.

The serial group finished. The larger group stalled after reporting a timeout
in the 968th file, the Gradle-backed connection-manager parity suite. The Node
runner kept using CPU with no live test children and stopped emitting TAP. Its
output was retained and the remaining 485 files were run in seven batches of
up to 80 files with two workers per batch. The first batch stalled again.
All 80 files in that batch then completed in separate Node processes with
disposable homes, local sockets and process inspection available. The other
six batches finished in the test sandbox.

| Segment | Files | Passed | Failed | Canceled | Skipped | Todo |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Serialized native group | 5 | 8 | 11 | 1 | 3 | 0 |
| Original backend run, emitted TAP records before the stall | 968 | 5,728 | 145 | 14 | 140 | 3 |
| Completed resumed batches and individual reruns | 485 | 2,413 | 420 | 1 | 3 | 0 |

The interrupted runner did not emit a final Node summary. Its row counts
recorded TAP tests and excludes suite containers. The completed rows use the
runner summaries. The earlier incomplete 80-file attempt and the focused
reruns below are excluded from the table. Raw local output is in
`/tmp/insrc-t13-sweep-{native,backend,resume-2..7}.tap` and
`/tmp/insrc-t13-sweep-isolated/`.

## Failure attribution

- The pre-story checkout at `be223378d` reproduced the sampled unmanaged
  Mach-broker denials, all 11 forced-stop failures, and all seven sampled
  boot and shutdown failures. Some baseline native suites failed during their
  build hooks, so those runs cannot establish that every current native
  failure was already present.
- Sampled review, model routing and connection-manager inventory failures also
  reproduced at `be223378d`. The current connection-manager inventory
  additionally identifies restart-story production boundaries that need
  classification, including the managed update, supervisor entry and
  installation mutation modules. The inventory was left intact.
- The full run hit the managed update IPC fixture's first-reply deadline.
  Commit `0679ad220` bounded retries around post-commit status polling
  in the fixture. The focused rerun passed all eight tests. Production
  timeouts were unchanged.
- Four lifecycle suites were rerun with process inspection and disposable Unix
  sockets available after the smaller batches hit sandbox denials. All 27
  cases passed.
- The broad Gradle-backed connection tests timed out or failed to compile.
  A separate JetBrains compile identified stale test API usage in
  `InsrcSettingsTrackerTest.kt` and `RepoFieldsContractTest.kt`.
  The isolated freshness and transport run passed its 33 targeted cases.

## Installed evidence

All eight [Apple Silicon smoke checks](../review-evidence/installed-restart-smoke.md)
and all 21 [OrbStack Linux regressions](t13-orbstack-linux.tap) passed. The
installed smoke also verified a real detached `daemon.update` rollback through
the public IPC endpoint.

T13 remains open because the full regression sweep failed. Completion review
and release qualification remain pending. The live daemon was left on its
existing route.

## Privacy inventory follow-up

[ISSUE-08427e19db14ae7b](../../../restore-connection-manager-privacy-source-inventory-E2026111008427e19/ISSUE.md)
tracks the inventory correction for T13. The audit pinned production source to
`5c2931360ef59344233c567db31cab97df97ad89`. It classified 57 new files,
reviewed site changes in 37 entries and source-only changes in 81 entries, and
reviewed the removal-routing digest separately. The fixture retains the
existing scanner, design source pins and release gate.

The focused run passed all 12 tests, including both inventory assertions,
analysis authority and revision-lease checks, and the composed log and
no-persistence canaries. TypeScript typechecking passed on the same snapshot.
This follow-up records focused verification. The sweep above remains the
recorded full-run result.
