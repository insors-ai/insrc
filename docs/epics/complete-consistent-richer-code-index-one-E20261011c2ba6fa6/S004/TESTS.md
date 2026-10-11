<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s4 -->

# Tests: c2ba6fa62a148ed1 s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 29 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-11T09:49:16.267Z on commit `8a26a499`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: stop outcome with an injected process table: stops by itself, forced after the wait, pid not a daemon, pid survives the kill**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stop outcome with an injected process table: stops by itself, forced after the wait, pid not a daemon, pid survives the kill | `src/cli/services/__tests__/daemon-stop.test.ts` |

**unit: stop outcome: no socket and no live pid rejects with 'daemon is not running'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stop outcome: no socket and no live pid rejects with 'daemon is not running' | `src/cli/services/__tests__/daemon-stop.test.ts` |

**unit: stop outcome: a live pid whose command line does not match is not killed and its pid file is kept**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stop outcome: a live pid whose command line does not match is not killed and its pid file is kept | `src/cli/services/__tests__/daemon-stop.test.ts` |

**integration: forced stop: a child that ignores the request and SIGTERM is ended by stopDaemon**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | forced stop: a child that ignores the request and SIGTERM is ended by stopDaemon | `src/cli/services/__tests__/daemon-stop-forced.test.ts` |

**integration: forced stop, silent daemon: a child that accepts the connection and never replies is ended**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | forced stop, silent daemon: a child that accepts the connection and never replies is ended | `src/cli/services/__tests__/daemon-stop-forced.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/services/__tests__/daemon-stop-forced.test.ts` | 0 | 2 | 8.3 s |  |
| `src/cli/services/__tests__/daemon-stop.test.ts` | 0 | 8 | 0.6 s |  |

## t2

Run at 2026-10-11T09:53:01.556Z on commit `f48863cf`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: control script stop against a stubborn child**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | control script stop against a stubborn child | `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` |

**integration: control script start against a stubborn running child**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | control script start against a stubborn running child | `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` |

**integration: control script leaves a live non-matching pid alone and exits non-zero**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | control script leaves a live non-matching pid alone and exits non-zero | `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` | 0 | 4 | 6.6 s |  |

## t3

Run at 2026-10-11T09:57:20.461Z on commit `2495f8ab`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: reproduction against the real library: read throws -30775, synchronous transaction throws 22, asynchronous transaction does not settle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reproduction against the real library: read throws -30775, synchronous transaction throws 22, asynchronous transaction does not settle | `src/db/graph/__tests__/lock-loss-reproduction.test.ts` |
| pass | reproduction through the store module: a process that has read before gets code 22 with MDB_BAD_RSLOT on a read | `src/db/graph/__tests__/lock-loss-reproduction.test.ts` |

**integration: control case: without the second descriptor, the other process's close leaves the first process's write working**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | control case: without the second descriptor, the other process's close leaves the first process's write working | `src/db/graph/__tests__/lock-loss-reproduction.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/lock-loss-reproduction.test.ts` | 0 | 4 | 7.5 s |  |

## t4

Run at 2026-10-11T10:02:56.088Z on commit `fa7c3218`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: detection through the real wrappers: asynchronous write by probe, synchronous write at once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | detection through the real wrappers: asynchronous write by probe, synchronous write at once | `src/db/graph/__tests__/lock-loss-detection.test.ts` |

**unit: health record: after locks-lost a further store call throws the named error and closeGraphStore skips the library's close**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | health record: after locks-lost a further store call throws the named error and closeGraphStore skips the library's close | `src/db/graph/__tests__/store-health.test.ts` |

**unit: health record: after locks-lost getGraphStore itself rejects with the named error**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | health record: after locks-lost getGraphStore itself rejects with the named error | `src/db/graph/__tests__/store-health.test.ts` |

**unit: sync wrapper: code 22 with a succeeding probe read is rethrown and leaves the record ok**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sync wrapper: code 22 with a succeeding probe read is rethrown and leaves the record ok | `src/db/graph/__tests__/store-health.test.ts` |

**integration: slow healthy write: the probe runs and returns, nothing is recorded, the write completes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | slow healthy write: the probe runs and returns, nothing is recorded, the write completes | `src/db/graph/__tests__/store-health.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/lock-loss-detection.test.ts` | 0 | 2 | 1.7 s |  |
| `src/db/graph/__tests__/store-health.test.ts` | 0 | 6 | 1.2 s |  |

## t5

Run at 2026-10-11T10:06:37.979Z on commit `b5e5dfcf`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: dispatcher: a handler throwing code -30775 records locks-lost and the caller gets the named error, at each of the three server sites and the queue runner**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dispatcher: a handler throwing code -30775 records locks-lost and the caller gets the named error, at each of the three server sites and the queue runner | `src/daemon/__tests__/store-failure-dispatch.test.ts` |

**integration: detection through the real wrappers: a read through the dispatcher records at once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | detection through the real wrappers: a read through the dispatcher records at once | `src/daemon/__tests__/store-failure-dispatch.test.ts` |

**integration: periodic check records locks-lost when no request or write has met the failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | periodic check records locks-lost when no request or write has met the failure | `src/daemon/__tests__/store-failure-dispatch.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/store-failure-dispatch.test.ts` | 0 | 3 | 2.8 s |  |

## t6

Run at 2026-10-11T10:11:32.404Z on commit `7d18c49e`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: daemon status payload: no storeFailure when healthy; kind, time, operation and cause when locks-lost**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | daemon status payload: no storeFailure when healthy; kind, time, operation and cause when locks-lost | `src/daemon/__tests__/status-store-failure.test.ts` |

**unit: status handler with the store failed returns an empty repository list and storeFailure and does not throw**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | status handler with the store failed returns an empty repository list and storeFailure and does not throw | `src/daemon/__tests__/status-store-failure.test.ts` |

**unit: daemon pane and both plugins: the cause line is shown when the field is present, and a status without it is accepted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Daemon pane prints the store failure cause when the status carries it, and nothing of it otherwise | `src/cli/__tests__/tui.test.ts` |
| pass | daemon status adds the store failure line when the status carries it | `src/cli/__tests__/command.test.ts` |
| pass | status() shows the store failure cause when the payload carries storeFailure, and accepts a status without it | `vscode-plugin/src/panels/__tests__/daemon-gateway.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/command.test.ts` | 0 | 21 | 0.4 s |  |
| `src/cli/__tests__/tui.test.ts` | 0 | 21 | 2.3 s |  |
| `src/daemon/__tests__/status-store-failure.test.ts` | 0 | 2 | 0.6 s |  |
| `vscode-plugin/src/panels/__tests__/daemon-gateway.test.ts` | 0 | 10 | 0.4 s |  |

## t7

Run at 2026-10-11T10:31:05.314Z on commit `0f2dd749`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: store failure to stop: exit within 5 seconds, pid file and socket gone, second start succeeds, last log line names the skipped close**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store failure to stop: exit within 5 seconds, pid file and socket gone, second start succeeds, last log line names the skipped close | `src/daemon/__tests__/shutdown-store-failure.test.ts` |

**integration: status after failure: storeFailure names another process and does not contain 'semume'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | status after failure: storeFailure names another process and does not contain 'semume' | `src/daemon/__tests__/shutdown-store-failure.test.ts` |

**integration: fatal after failure: an unhandled rejection with the store failed ends the process within 5 seconds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fatal after failure: an unhandled rejection with the store failed ends the process within 5 seconds | `src/daemon/__tests__/shutdown-store-failure.test.ts` |

**integration: healthy shutdown is unchanged: queue drained, connections closed in order, normal exit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | healthy shutdown is unchanged: queue drained, connections closed in order, normal exit | `src/daemon/__tests__/shutdown-store-failure.test.ts` |
| pass | with the store failed no path calls exit: the shutdown, its backstop, a failure found during the drain, and any other exit | `src/daemon/__tests__/shutdown-store-failure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/shutdown-store-failure.test.ts` | 0 | 5 | 3.2 s |  |
