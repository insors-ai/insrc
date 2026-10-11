<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s4 -->

# Tests: c2ba6fa62a148ed1 s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
