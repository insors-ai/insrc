<!-- insrc:artifact TESTS-86197ac660732ceb-s4 -->

# Tests: 86197ac660732ceb s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 21 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t5

Run at 2026-10-29T08:13:45.184Z on commit `804daf0bc`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: lazy runtime: the local forward builds once on the first local request and reuses it; a failed build answers that request and the next one builds again**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | lazy runtime: the local forward builds once on the first local request and reuses it; a failed build answers that request and the next one builds again | `src/daemon/threads/__tests__/lazy-runtime.test.ts` |

**unit: lazy runtime: a nested in-daemon call made while serving a local request works after the lazy build**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | lazy runtime: a nested in-daemon call made while serving a local request works after the lazy build | `src/daemon/threads/__tests__/lazy-runtime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/lazy-runtime.test.ts` | 0 | 2 | 0.5 s |  |

## t1

Run at 2026-10-29T08:41:05.655Z on commit `b9e5a54bd`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: board: a ThreadStatus published with a role keeps it in the snapshot, and one without a role is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | board: a ThreadStatus published with a role keeps it in the snapshot, and one without a role is unchanged | `src/daemon/threads/__tests__/registry-board.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/registry-board.test.ts` | 0 | 9 | 1 s |  |

## t2

Run at 2026-10-29T08:46:15.357Z on commit `35b52305d`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: router thread view: attach publishes idle with the registry's role; a request marks busy with its method and since; its reply marks idle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router thread view: attach publishes idle with the registry's role; a request marks busy with its method and since; its reply marks idle | `src/daemon/threads/__tests__/router-thread-view.test.ts` |

**unit: router thread view: the oldest in-flight request names method and since; a stream is busy until its done or error frame, a cancelled stream until its lifetime completes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router thread view: the oldest in-flight request names method and since; a stream is busy until its done or error frame, a cancelled stream until its lifetime completes | `src/daemon/threads/__tests__/router-thread-view.test.ts` |

**unit: router thread view: a session worker's queued equals its FIFO length; detach forgets the thread and nothing re-adds it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router thread view: a session worker's queued equals its FIFO length; detach forgets the thread and nothing re-adds it | `src/daemon/threads/__tests__/router-thread-view.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/router-thread-view.test.ts` | 0 | 3 | 0.7 s |  |

## t3

Run at 2026-10-29T08:49:45.478Z on commit `b9477bb83`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: admin status: threads carries role, cls, session, busy, method, elapsedMs, queued and activeRuns from one board snapshot; other fields unchanged; absent when no thread is published**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | admin status: threads carries role, cls, session, busy, method, elapsedMs, queued and activeRuns from one board snapshot; other fields unchanged; absent when no thread is published | `src/daemon/threads/__tests__/admin-status.test.ts` |

**unit: admin status: activeRuns counts only that thread's running runs, and the document-summary thread is busy while the summary lane processes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | admin status: activeRuns counts only that thread's running runs, and the document-summary thread is busy while the summary lane processes | `src/daemon/threads/__tests__/admin-status.test.ts` |

**unit: admin handlers: daemon.debug-status keeps clients as before and adds threads**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | admin handlers: daemon.debug-status keeps clients as before and adds threads | `src/daemon/threads/__tests__/admin-status.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/admin-status.test.ts` | 0 | 4 | 0.7 s |  |

## t4

Run at 2026-10-29T09:19:32.933Z on commit `1ee787f77`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: supervisor: a tracked worker is terminated by terminateAll and its error is logged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | supervisor: a tracked worker is terminated by terminateAll and its error is logged | `src/daemon/threads/__tests__/supervisor-track.test.ts` |

**unit: supervisor: the restart query refuses past 5 restarts in 60 s and runs the daemon's shutdown**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | supervisor: the restart query refuses past 5 restarts in 60 s and runs the daemon's shutdown | `src/daemon/threads/__tests__/supervisor-track.test.ts` |

**unit: session pool: every created worker is handed to onCreated; a refused shared-state restart rejects with SessionWorkerStartError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | session pool: every created worker is handed to onCreated; a refused shared-state restart rejects with SessionWorkerStartError | `src/daemon/threads/__tests__/session-pool.test.ts` |
| pass | session pool: a shared-state worker that fails to start counts like one that exited: its next start is a restart | `src/daemon/threads/__tests__/session-pool.test.ts` |

**integration: session failure: session workers are still recreated on demand with s3's failure messages under supervisor tracking**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | session failure: session workers are still recreated on demand with s3's failure messages under supervisor tracking | `src/daemon/threads/__tests__/session-failure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/session-failure.test.ts` | 0 | 6 | 7.3 s |  |
| `src/daemon/threads/__tests__/session-pool.test.ts` | 0 | 9 | 0.4 s |  |
| `src/daemon/threads/__tests__/supervisor-track.test.ts` | 0 | 2 | 0.3 s |  |

## t6

Run at 2026-10-29T09:22:25.430Z on commit `4ed9e00a6`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: s4 ac1: routed requests leave the main thread's handler runtime unbuilt; a connection-scoped request is answered and builds it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s4 ac1: routed requests leave the main thread's handler runtime unbuilt; a connection-scoped request is answered and builds it | `src/daemon/threads/__tests__/s4-acceptance.test.ts` |

**integration: s4 ac2: a worker of each class exits mid-request; that request fails, the thread leaves threads and is replaced while others answer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | admin, code-indexing and summary workers killed in turn: in-flight requests error, the worker is replaced, other threads keep serving | `src/daemon/threads/__tests__/supervisor.test.ts` |
| pass | s4 ac2: a worker of each class exits mid-request; that request fails, the thread leaves threads and is replaced while others answer (session, shared-state) | `src/daemon/threads/__tests__/session-failure.test.ts` |

**integration: s4 ac3: SIGTERM and daemon.shutdown exit 0 after 'bye' with every worker, session-pool workers included, terminated**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s4 ac3: SIGTERM and daemon.shutdown exit 0 after 'bye' with every worker, session-pool workers included, terminated | `src/daemon/threads/__tests__/s4-acceptance.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/s4-acceptance.test.ts` | 0 | 5 | 29.1 s |  |
| `src/daemon/threads/__tests__/session-failure.test.ts` | 0 | 6 | 7.7 s |  |
| `src/daemon/threads/__tests__/supervisor.test.ts` | 0 | 4 | 10.1 s |  |

## t7

Run at 2026-10-29T09:08:08.853Z on commit `450e019d0`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: s4 ac4: daemon.status threads lists the admin, code-indexing, document-summary, shared-state and two session threads with role, class and session**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s4 ac4: daemon.status threads lists the admin, code-indexing, document-summary, shared-state and two session threads with role, class and session | `src/daemon/threads/__tests__/s4-acceptance.test.ts` |

**integration: s4 ac5: with a session worker spinning, daemon.status answers within 100 ms at p99, shows it busy with growing elapsedMs, and reachability is running**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s4 ac5: with a session worker spinning, daemon.status answers within 100 ms at p99, shows it busy with growing elapsedMs, and reachability is running | `src/daemon/threads/__tests__/s4-acceptance.test.ts` |

**integration: s4 ac6: daemon.status and debug-status keep every field of a threads-disabled daemon with the same types; threads is the only addition**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s4 ac6: daemon.status and debug-status keep every field of a threads-disabled daemon with the same types; threads is the only addition | `src/daemon/threads/__tests__/s4-acceptance.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/s4-acceptance.test.ts` | 0 | 5 | 26.5 s |  |
