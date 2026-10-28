<!-- insrc:artifact TESTS-86197ac660732ceb-s3 -->

# Tests: 86197ac660732ceb s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 20 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-28T06:11:04.160Z on commit `0d9ad0284`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: registry: a shared target and an unattributed target register together without TargetConflictError and each lookup resolves to its own worker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | registry: a shared target and an unattributed target register together without TargetConflictError and each lookup resolves to its own worker | `src/daemon/threads/__tests__/registry-board.test.ts` |

**unit: router: Router.request with shared reaches the shared-state target and is held while none is registered**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: Router.request with shared reaches the shared-state target and is held while none is registered | `src/daemon/threads/__tests__/router.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/registry-board.test.ts` | 0 | 6 | 0.5 s |  |
| `src/daemon/threads/__tests__/router.test.ts` | 0 | 7 | 1.7 s |  |

## t2

Run at 2026-10-28T06:12:47.117Z on commit `74622c083`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: method sets: every shared-state and FIFO-exempt member is a session-class method**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | method sets: every shared-state and FIFO-exempt member is a session-class method | `src/daemon/threads/__tests__/method-class.test.ts` |

**unit: method sets: every served chat.*, todos.* and understanding.* method is in the shared-state set**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | method sets: every served chat.*, todos.* and understanding.* method is in the shared-state set | `src/daemon/threads/__tests__/method-class.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/method-class.test.ts` | 0 | 5 | 1 s |  |

## t3

Run at 2026-10-28T06:16:49.401Z on commit `09c477ff3`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: workflow run registry: poll from the board returns frames since cursor, model, result and error; unknown after forgetRun**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | workflow run registry: poll from the board returns frames since cursor, model, result and error; unknown after forgetRun | `src/daemon/__tests__/workflow-run-registry.test.ts` |

**integration: board: forgetRun hub binding removes a run published from a worker; ownerThreadId is the publishing thread**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | board: forgetRun hub binding removes a run published from a worker; ownerThreadId is the publishing thread | `src/daemon/threads/__tests__/registry-board.test.ts` |

**unit: workflow run registry: with threads disabled start/poll/abort answer as today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | workflow run registry: with threads disabled start/poll/abort answer as today | `src/daemon/__tests__/workflow-run-registry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/workflow-run-registry.test.ts` | 0 | 6 | 1.1 s |  |
| `src/daemon/threads/__tests__/registry-board.test.ts` | 0 | 7 | 0.8 s |  |

## t4

Run at 2026-10-28T06:22:10.306Z on commit `2ba5a8688`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: in-daemon route: targetOf sends admin/indexing to their workers, shared-state methods to the shared-state target (inline on it), others inline**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | in-daemon route: targetOf sends admin/indexing to their workers, shared-state methods to the shared-state target (inline on it), others inline | `src/daemon/threads/__tests__/method-class.test.ts` |

**integration: purge: session.delete on a session worker drops the chat from the shared-state pool and its todos cleanup events reach an open todos.subscribe**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | purge: session.delete on a session worker drops the chat from the shared-state pool and its todos cleanup events reach an open todos.subscribe | `src/daemon/threads/__tests__/purge-shared.test.ts` |

**unit: purge: chat.dropSession over the socket answers unknown method; threads off purges as today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | purge: chat.dropSession over the socket answers unknown method; threads off purges as today | `src/daemon/threads/__tests__/purge-shared.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/method-class.test.ts` | 0 | 6 | 0.8 s |  |
| `src/daemon/threads/__tests__/purge-shared.test.ts` | 0 | 2 | 1.1 s |  |

## t5

Run at 2026-10-28T06:27:16.702Z on commit `1f514e892`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: session worker: starts, reports ready and serves a session method with today's response under the maintenance request hold**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | session worker: starts, reports ready and serves a session method with today's response under the maintenance request hold | `src/daemon/threads/__tests__/session-worker.test.ts` |

**integration: session worker: a nested session-class call runs inline on the worker thread**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | session worker: a nested session-class call runs inline on the worker thread | `src/daemon/threads/__tests__/session-worker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/session-worker.test.ts` | 0 | 2 | 1.4 s |  |

## t6

Run at 2026-10-28T06:30:30.547Z on commit `1504ebb63`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: shared-state worker: chat.list, todos.listForSession and understanding.* run on its thread; the main thread starts no chat pool, understanding service or retention timer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | shared-state worker: chat.list, todos.listForSession and understanding.* run on its thread; the main thread starts no chat pool, understanding service or retention timer | `src/daemon/threads/__tests__/shared-state-worker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/shared-state-worker.test.ts` | 0 | 1 | 1.2 s |  |

## t7

Run at 2026-10-28T06:37:17.423Z on commit `39dbb0d76`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: session pool: concurrent workerFor calls for one session start one worker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | session pool: concurrent workerFor calls for one session start one worker | `src/daemon/threads/__tests__/session-pool.test.ts` |

**unit: session pool: idle and pid-gone release at the sweep; never a worker with an active run or a request in flight**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | session pool: idle and pid-gone release at the sweep; never a worker with an active run or a request in flight | `src/daemon/threads/__tests__/session-pool.test.ts` |

**unit: session pool: start failure answers waiting requests with SessionWorkerStartError and the next request retries**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | session pool: start failure answers waiting requests with SessionWorkerStartError and the next request retries | `src/daemon/threads/__tests__/session-pool.test.ts` |

**unit: session pool: the unattributed worker starts once under session:unattributed; sessionIdleMs default 900000 from config**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | session pool: the unattributed worker starts once under session:unattributed; sessionIdleMs default 900000 from config | `src/daemon/threads/__tests__/session-pool.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/session-pool.test.ts` | 0 | 4 | 0.5 s |  |

## t8

Run at 2026-10-28T11:10:37.130Z on commit `364788cb5`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: router: one session's three requests reach its worker in arrival order; a stream ends at its done/error frame**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: one session's three requests reach its worker in arrival order; a stream ends at its done/error frame | `src/daemon/threads/__tests__/router-session.test.ts` |

**unit: router: FIFO-exempt methods are forwarded during a long request; a cancelled queued request is removed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: FIFO-exempt methods are forwarded during a long request; a cancelled queued request is removed | `src/daemon/threads/__tests__/router-session.test.ts` |

**unit: router: connection-scoped requests stay local; unattributed requests interleave without a FIFO**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: connection-scoped requests stay local; unattributed requests interleave without a FIFO | `src/daemon/threads/__tests__/router-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/router-session.test.ts` | 0 | 3 | 0.6 s |  |
