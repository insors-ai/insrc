<!-- insrc:artifact TESTS-fd8d70c3e8c397ea-s1 -->

# Tests: fd8d70c3e8c397ea s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 77 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-24T18:09:07.255Z on commit `62626954c`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Managed run-file guard exclusion, observed replacement preservation and explicit orphan conflict**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | managed guard serializes cooperating ownership and preserves observed replacement run files | `src/shared/__tests__/daemon-run-files.test.ts` |
| pass | replaced or rewritten files and changed guard nonces are preserved | `src/shared/__tests__/daemon-run-files.test.ts` |
| pass | cross-process guard race admits exactly one owner and releases for the next startup | `src/shared/__tests__/daemon-run-files.test.ts` |
| pass | killed guard owner leaves an explicit orphan conflict and is never reclaimed automatically | `src/shared/__tests__/daemon-run-files.test.ts` |

**integration: Observation-only process identities cannot authorize numeric-PID target signalling**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | observation-only identities report changes but expose no numeric-PID signalling authority | `src/shared/__tests__/daemon-process.test.ts` |

**integration: Revised guard foundation regressions pass without claiming atomic conditional unlink**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | process start parsers preserve OS markers and distinguish zombies and malformed observations | `src/shared/__tests__/daemon-process.test.ts` |
| pass | real disposable child identity observations distinguish live and exited processes | `src/shared/__tests__/daemon-process.test.ts` |
| pass | unverifiable guard records and symlinks fail closed without automatic reclamation | `src/shared/__tests__/daemon-run-files.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/daemon-process.test.ts` | 0 | 3 | 0.4 s |  |
| `src/shared/__tests__/daemon-run-files.test.ts` | 0 | 5 | 0.5 s |  |

## t8

Run at 2026-10-24T18:27:57.603Z on commit `4f268b5f9`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Native Linux retained-capability capture termination and post-exit non-retargeting**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Linux native handle retains the original target through termination and exit without retargeting | `src/shared/__tests__/process-broker-native.test.ts` |
| pass | closing or abandoning a native handle does not terminate its target | `src/shared/__tests__/process-broker-native.test.ts` |
| pass | native framing rejects malformed requests and non-daemon targets without signalling | `src/shared/__tests__/process-broker-native.test.ts` |

**integration: Darwin denied or unsupported capabilities fail closed and runtime evidence remains explicit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Darwin-style denied and unsupported capability seams fail before readiness and never enable termination | `src/shared/__tests__/process-broker-native.test.ts` |
| pass | missing identity metadata is unverifiable rather than positive process-exit evidence | `src/shared/__tests__/process-broker-native.test.ts` |

**integration: Normal build compiles and ships the local broker without a runtime compiler or PID-kill fallback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | normal build ships the host broker with no numeric-PID kill symbol | `src/shared/__tests__/process-broker-native.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/process-broker-native.test.ts` | 0 | 6 | 8.6 s |  |

## t9

Run at 2026-10-24T18:43:21.898Z on commit `1c55d3f27`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Node StopTarget retains one broker capability across identity and PID-file changes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native StopTarget remains bound after PID-file replacement and terminates only the original process | `src/shared/__tests__/daemon-process-client.test.ts` |
| pass | chunked readiness and out-of-order replies preserve one immutable identity and request correlation | `src/shared/__tests__/daemon-process-client.test.ts` |

**integration: Broker spawn readiness protocol permission and timeout failures are bounded**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | spawn, readiness, malformed identity and native permission failures refuse capture and clean helpers | `src/shared/__tests__/daemon-process-client.test.ts` |
| pass | readiness and operation timeouts close a stuck helper without a target-signal fallback | `src/shared/__tests__/daemon-process-client.test.ts` |
| pass | unknown reply IDs, operation mismatches and request errors close the capability session | `src/shared/__tests__/daemon-process-client.test.ts` |
| pass | invalid target IDs and timer bounds are rejected before spawning | `src/shared/__tests__/daemon-process-client.test.ts` |
| pass | oversized readiness and partial request replies never become process-exit evidence | `src/shared/__tests__/daemon-process-client.test.ts` |

**integration: Closing or cancelling a broker client releases helpers without unintended target signalling**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native close and cancellation release the broker without terminating an unrequested target | `src/shared/__tests__/daemon-process-client.test.ts` |
| pass | abort before capture and during readiness or a pending request leaves no helper | `src/shared/__tests__/daemon-process-client.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/daemon-process-client.test.ts` | 0 | 9 | 2.8 s |  |

## t2

Run at 2026-10-24T19:03:08.185Z on commit `84f57b852`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Replacement run files survive original daemon cleanup and implicit socket unlink**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Replacement run files survive original daemon cleanup and implicit socket unlink | `src/daemon/__tests__/run-file-ownership.test.ts` |

**integration: Startup publication and awaited close are serialized under the same guard**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Startup publication and awaited close are serialized under the same guard | `src/daemon/__tests__/run-file-ownership.test.ts` |

**integration: Startup-error, fatal and stale-file cleanup honor ownership**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Startup-error, fatal and stale-file cleanup honor ownership | `src/daemon/__tests__/run-file-ownership.test.ts` |
| pass | Real startup-error, fatal and backstop paths preserve replacements and skip unsafe exit hooks | `src/daemon/__tests__/run-file-ownership.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/run-file-ownership.test.ts` | 0 | 4 | 1.6 s |  |

## t3

Run at 2026-10-24T19:10:21.768Z on commit `687c9b4e0`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Retained stop target survives run-file removal and RPC failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Retained stop target survives run-file removal and RPC failure | `src/cli/services/__tests__/daemon-stop-forced.test.ts` |

**integration: Verified forced termination preserves StopOutcome and never targets reused PIDs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Verified forced termination preserves StopOutcome and never targets reused PIDs | `src/cli/services/__tests__/daemon-stop-forced.test.ts` |
| pass | Injected same-PID reincarnation preserves forced outcome and never retargets the held native capability | `src/cli/services/__tests__/daemon-stop-forced.test.ts` |
| pass | stop outcome: clean and forced retain the original capability and preserve outcome shape | `src/cli/services/__tests__/daemon-stop.test.ts` |

**integration: Ownership or orphan-guard conflicts prevent maintenance restart**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Real orphaned guard owner death prevents maintenance restart | `src/cli/services/__tests__/daemon-stop-forced.test.ts` |
| pass | Real ownership and guard conflicts prevent maintenance restart | `src/cli/services/__tests__/daemon-stop-forced.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/services/__tests__/daemon-stop-forced.test.ts` | 0 | 7 | 9 s |  |
| `src/cli/services/__tests__/daemon-stop.test.ts` | 0 | 6 | 0.4 s |  |

## t4

Run at 2026-10-24T19:15:08.173Z on commit `15aecaefc`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Independent watchdog bounds a disposable blocked parent and disarms after healthy exit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Independent watchdog bounds a disposable blocked parent and disarms after healthy exit | `src/daemon/__tests__/shutdown-watchdog.test.ts` |

**integration: Ready handshake reports spawn failure, early exit and timeout**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Ready handshake reports spawn failure, early exit and timeout | `src/daemon/__tests__/shutdown-watchdog.test.ts` |

**integration: Watchdog never signals after reparenting and imports only Node built-ins**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Watchdog never signals after reparenting and imports only Node built-ins | `src/daemon/__tests__/shutdown-watchdog.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/shutdown-watchdog.test.ts` | 0 | 3 | 13.9 s |  |

## t5

Run at 2026-10-24T19:18:53.238Z on commit `4e7f9e470`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Watchdog arm failure self-kills before blocked native cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Watchdog arm failure self-kills before blocked native cleanup | `src/daemon/__tests__/shutdown-bounded.test.ts` |

**integration: Bounded shutdown preserves lock-loss, fatal and normal cleanup behavior**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Bounded shutdown preserves lock-loss, fatal and normal cleanup behavior | `src/daemon/__tests__/shutdown-bounded.test.ts` |
| pass | store failure to stop: exit within 5 seconds, pid file and socket gone, second start succeeds, last log line names the skipped close | `src/daemon/__tests__/shutdown-store-failure.test.ts` |
| pass | fatal after failure: an unhandled rejection with the store failed ends the process within 5 seconds | `src/daemon/__tests__/shutdown-store-failure.test.ts` |
| pass | healthy shutdown is unchanged: queue drained, connections closed in order, normal exit | `src/daemon/__tests__/shutdown-store-failure.test.ts` |
| pass | with the store failed no path calls exit: the shutdown, its backstop, a failure found during the drain, and any other exit | `src/daemon/__tests__/shutdown-store-failure.test.ts` |

**integration: Repeated signals and guarded async close preserve ownership**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Repeated signals and guarded async close preserve ownership | `src/daemon/__tests__/shutdown-bounded.test.ts` |
| pass | Startup publication and awaited close are serialized under the same guard | `src/daemon/__tests__/run-file-ownership.test.ts` |
| pass | Replacement run files survive original daemon cleanup and implicit socket unlink | `src/daemon/__tests__/run-file-ownership.test.ts` |

**integration: Store-child fixture exercises owned publication watchdog readiness and guarded close**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Store-child fixture exercises owned publication watchdog readiness and guarded close | `src/daemon/__tests__/shutdown-store-failure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/run-file-ownership.test.ts` | 0 | 4 | 1.9 s |  |
| `src/daemon/__tests__/shutdown-bounded.test.ts` | 0 | 3 | 11.1 s |  |
| `src/daemon/__tests__/shutdown-store-failure.test.ts` | 0 | 6 | 3.3 s |  |

## t6

Run at 2026-10-24T19:25:50.756Z on commit `625e5ba9b`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Control script retains the original target across run-file removal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Control script retains the original target across run-file removal | `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` |

**integration: Control script refuses reused identity, replacement files and orphan guards**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Control script refuses reused identity, replacement files and orphan guards | `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` |
| pass | Shell bridge with injected same-PID reincarnation refuses restart and missing identity | `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` |

**integration: Disposable clean and forced script restart paths preserve commands**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Disposable clean and forced script restart paths preserve commands | `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` |

**integration: Shell start and restart refuse spawn after lifecycle failures even in conditional contexts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Shell start and restart refuse spawn after lifecycle failures even in conditional contexts | `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` | 0 | 5 | 26.6 s |  |

## t7

Run at 2026-10-25T05:18:37.421Z on commit `77f976967`. Tests check: **passed**. 26 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

**smoke: Controlled shutdown investigation evidence document satisfies ac4 with historical-cause caveat**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/daemon-stop-must-wait-process-end-E20261013fd8d70c3/S001/shutdown-investigation.md; shutdown-evidence.json

**integration: Guard-owner death prevents restart while the healthy control restarts normally**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Guard-owner death prevents restart while the healthy control restarts normally | `src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts` |

**integration: Compiled helper packaging and affected lifecycle regression suites**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Compiled helper packaging and affected lifecycle regression suites | `src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts` |
| pass | Watchdog arm failure self-kills before blocked native cleanup | `src/daemon/__tests__/shutdown-bounded.test.ts` |
| pass | Independent watchdog bounds a disposable blocked parent and disarms after healthy exit | `src/daemon/__tests__/shutdown-watchdog.test.ts` |
| pass | Watchdog IPC disconnect during readiness releases its shared broker session without signalling the parent | `src/daemon/__tests__/shutdown-watchdog.test.ts` |
| pass | Store-child fixture exercises owned publication watchdog readiness and guarded close | `src/daemon/__tests__/shutdown-store-failure.test.ts` |
| pass | Startup publication and awaited close are serialized under the same guard | `src/daemon/__tests__/run-file-ownership.test.ts` |
| pass | Healthy shutdown flushes final frames before storage close and stops only once | `src/daemon/__tests__/understanding-rpc.test.ts` |
| pass | real disposable child identity observations distinguish live and exited processes | `src/shared/__tests__/daemon-process.test.ts` |
| pass | killed guard owner leaves an explicit orphan conflict and is never reclaimed automatically | `src/shared/__tests__/daemon-run-files.test.ts` |
| pass | normal build ships the host broker with no numeric-PID kill symbol | `src/shared/__tests__/process-broker-native.test.ts` |
| pass | native StopTarget remains bound after PID-file replacement and terminates only the original process | `src/shared/__tests__/daemon-process-client.test.ts` |
| pass | stop outcome: clean and forced retain the original capability and preserve outcome shape | `src/cli/services/__tests__/daemon-stop.test.ts` |
| pass | Real orphaned guard owner death prevents maintenance restart | `src/cli/services/__tests__/daemon-stop-forced.test.ts` |
| pass | Retained waitForStop verifies run-file ownership and guards before reporting success | `src/cli/services/__tests__/daemon-stop-forced.test.ts` |
| pass | Retained waitForStop ignores path disappearance until original exit and preserves handle ownership | `src/cli/services/__tests__/daemon-stop-forced.test.ts` |
| pass | Control script refuses reused identity, replacement files and orphan guards | `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` |
| pass | IPC transport loss never disarms the deadline for a blocked parent or blocked exit hook | `src/daemon/__tests__/shutdown-watchdog.test.ts` |
| pass | Clean stop has one completion boundary and never cleans a later publication twice | `src/cli/services/__tests__/daemon-stop-forced.test.ts` |
| pass | Fresh HOME capture and stop create the missing guard parent and report no original target | `src/cli/services/__tests__/daemon-stop-forced.test.ts` |
| pass | Fresh HOME shell stop and start work without a pre-existing insrc directory | `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` |
| pass | Backward wall-clock adjustment cannot extend the independent monotonic shutdown duration | `src/daemon/__tests__/shutdown-watchdog.test.ts` |
| pass | Backward wall-clock adjustment cannot postpone CLI forced stop of an unresponsive original | `src/cli/services/__tests__/daemon-stop-forced.test.ts` |
| pass | Backward wall-clock adjustment cannot extend the bounded forced-termination observation phase | `src/cli/services/__tests__/daemon-stop.test.ts` |
| pass | Backward wall-clock adjustment cannot extend CLI readiness timeout | `src/cli/services/__tests__/daemon-stop-forced.test.ts` |
| pass | every writer file is inventoried, annotated and classified as the design says | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**smoke: Platform evidence matrix distinguishes Linux runtime proof from unverified Darwin support and unperformed installed smoke**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/daemon-stop-must-wait-process-end-E20261013fd8d70c3/S001/shutdown-investigation.md#platform-and-packaging-evidence; src/native/process-broker/README.md

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` | 0 | 6 | 27.7 s |  |
| `src/cli/services/__tests__/daemon-stop-forced.test.ts` | 0 | 13 | 10 s |  |
| `src/cli/services/__tests__/daemon-stop.test.ts` | 0 | 7 | 7.9 s |  |
| `src/daemon/__tests__/run-file-ownership.test.ts` | 0 | 4 | 9 s |  |
| `src/daemon/__tests__/shutdown-bounded.test.ts` | 0 | 3 | 10.4 s |  |
| `src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts` | 0 | 2 | 17.2 s |  |
| `src/daemon/__tests__/shutdown-store-failure.test.ts` | 0 | 6 | 9 s |  |
| `src/daemon/__tests__/shutdown-watchdog.test.ts` | 0 | 6 | 15.9 s |  |
| `src/daemon/__tests__/understanding-rpc.test.ts` | 0 | 5 | 0.7 s |  |
| `src/shared/__tests__/daemon-process-client.test.ts` | 0 | 9 | 3.5 s |  |
| `src/shared/__tests__/daemon-process.test.ts` | 0 | 3 | 0.4 s |  |
| `src/shared/__tests__/daemon-run-files.test.ts` | 0 | 5 | 0.5 s |  |
| `src/shared/__tests__/process-broker-native.test.ts` | 0 | 6 | 8.6 s |  |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 8 | 1.6 s |  |
