# S2 executor progress qualification

Tasks t1 through t4 passed daemon build validation. The implementation commits
are `960da97bc`, `dfa56cd4b`, `76ee13aa4`, and `61f7b29ab`.

The full backend build passed at `0c3064c8154bcc5ed5231dc1a6b3910db0986db5`
in a clean detached checkout with Node 22.23.2. The sweep enumerated 1,465
`src/**/__tests__/*.test.ts` files, disabled live-service tests, used disposable
process homes and a canonical temporary path, and ran bounded batches. Suites
that rebuild backend output and Gradle bridges were serialized.

A loaded worker missed the original fixture's short readiness deadline. The
follow-up `1d7f50452332b3a2d2e8e7a2c7207040e2891fe5` adjusts only test deadlines
and resource cleanup. All 24 focused cases passed at that revision in an
isolated run concurrent with the full sweep. This includes legacy workflow and
analysis frames, observer isolation across the daemon's socket and worker
router, a progress-store write failure, terminal outcomes, and preservation of
an existing S1 record without a byte rewrite.

Raw evidence remains in `/tmp/insrc-s2-backend-build.log`,
`/tmp/insrc-s2-full-sweep/`, and `/tmp/insrc-s2-candidate-focused-final.tap`.

The pre-S2 revision `6946957d1b0defd49803f7abb5d3995488d8febf` reproduced
both the connection privacy inventory failure and the worker module-state
inventory failure. The connection inventory reports the identical
`cli-provider.ts` site-count mismatch on the candidate and the baseline
(260 detected versus 259 recorded). The S2 changes refresh the inventory
entries for the boundaries they touched.

The sweep reported a 101.1 ms p99 against the 100 ms limit in the
daemon-status latency test under load. A focused repeat passed on both
the pre-S2 revision and the candidate.

## Full regression outcome

The sweep attempted all 1,465 files. One batch stalled and was replaced in
these totals by individual retries of all 42 files in that batch. The
peer-state-store test still reached its 180-second timeout on retry.

| Tests | Passed | Failed | Canceled | Skipped | Todo |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 8,875 | 8,470 | 249 | 6 | 147 | 3 |

All three S2 qualification cases passed in the sweep. The original quiet-owner
case hit the short worker-start deadline. The focused follow-up covered that
case with the corrected fixture. The backend build passed on the sweep pin.

The sweep again encountered the macOS process-broker denials, disabled
review entry points, and Kotlin test compilation failures in the Gradle
bridges. Of 268 failing TAP records, 252 match the earlier T13 failure
output by test name. That comparison includes parent and timeout records
and is distinct from the test runner's failed-test total.

T5 qualification remains open pending a passing full sweep. The candidate
and its test-only follow-up are pinned in detached worktrees.

The backend build also exited 0 at the corrected revision
`1d7f50452332b3a2d2e8e7a2c7207040e2891fe5`. A repeat sweep on that revision
was stopped after native child processes aborted under the restricted runner
and socket-dependent suites produced additional failures. It was not a
completed repeat. The build log is `/tmp/insrc-s2-corrected-build.log` and
the partial TAP is under `/tmp/insrc-s2-full-sweep-corrected/`.

A host rerun at the corrected revision passed all 24 focused cases in the
five review packet test files. The TAP is `/tmp/insrc-s2-corrected-host-focused.tap`.

The independent review `s2-progress-qualification`, attempt 1, was submitted
with the corrected commit as the explicit source pin. Its packet identifies
the current BUILD as validated through T4 and T5 as unvalidated.
