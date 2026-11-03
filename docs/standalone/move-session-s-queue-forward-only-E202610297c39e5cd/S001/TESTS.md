<!-- insrc:artifact TESTS-7c39e5cd2c076e86-S001 -->

# Tests: 7c39e5cd2c076e86 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 16 pass, 1 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-29T10:48:19.520Z on commit `5eabd465c`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: channel.test.ts: wireRequest with ack sets trackCompletion for unary and stream requests; without it the rule is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | wireRequest with ack asks for the completion message for unary and stream requests; without it the rule is unchanged (ISSUE-7c39e5cd) | `src/daemon/threads/__tests__/channel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/channel.test.ts` | 0 | 3 | 0.6 s |  |

## t2

Run at 2026-10-29T10:52:02.569Z on commit `fde043bdb`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: router-session.test.ts: a duplicate or unknown completion message is ignored and onAck runs once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: a request awaiting its ack stays pending past its reply; a duplicate or unknown completion message is ignored and onAck runs once (ISSUE-7c39e5cd) | `src/daemon/threads/__tests__/router-session.test.ts` |
| pass | router: detach answers a request awaiting its ack through the caller and hands back its ack; failWorker calls it after answering (ISSUE-7c39e5cd) | `src/daemon/threads/__tests__/router-session.test.ts` |

**integration: router-session.test.ts: a postMessage failure answers 'request channel unavailable' and the queue moves on**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: a postMessage failure answers 'request channel unavailable' and calls the ack once (ISSUE-7c39e5cd) | `src/daemon/threads/__tests__/router-session.test.ts` |

**integration: router-thread-view.test.ts: a session request stays busy in the thread view and in the pool's busy count until its ack**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router thread view: a request awaiting its ack stays busy past its reply until its worker's ack (ISSUE-7c39e5cd) | `src/daemon/threads/__tests__/router-thread-view.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/router-session.test.ts` | 0 | 10 | 0.8 s |  |
| `src/daemon/threads/__tests__/router-thread-view.test.ts` | 0 | 4 | 0.5 s |  |

## t3

Run at 2026-10-29T10:59:12.741Z on commit `92b13b4cc`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: router-session.test.ts: a pool start failure and a cancel before the worker resolved move the queue on**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: a pool start failure, a missing worker port and a cancel before the worker resolved each call the ack once; the pool ends an acked request at its ack (ISSUE-7c39e5cd) | `src/daemon/threads/__tests__/router-session.test.ts` |

**integration: router-session.test.ts: a queued shared-state method waits for the shared-state worker's ack in both toShared branches**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: a shared-state request sent with an ack waits for the shared-state worker's ack, whether that worker is attached or reached through the pool (ISSUE-7c39e5cd) | `src/daemon/threads/__tests__/router-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/router-session.test.ts` | 0 | 12 | 1 s |  |

## t4

Run at 2026-10-29T11:11:26.856Z on commit `c5e733841`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: router-session.test.ts: a queued unary request whose socket closes while it runs keeps the next request queued until the worker acks the first (its handler settled)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: a queued unary request whose socket closes while it runs keeps the next request queued until the worker acks the first, after its handler settled (ISSUE-7c39e5cd) | `src/daemon/threads/__tests__/router-session.test.ts` |

**integration: router-session.test.ts: a queued stream cancelled by its socket keeps the next request queued until the worker acks it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: a queued stream cancelled by its socket keeps the next request queued and its worker busy until the worker acks it, with or without a lifetime (ISSUE-7c39e5cd) | `src/daemon/threads/__tests__/router-session.test.ts` |

**integration: router-session.test.ts: a unary reply is delivered at once but the next request starts only after the worker's ack, after work registered with registerDrain is done**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: a queued unary reply is delivered at once, but the session's next request starts only after the worker's ack, after the work it registered with registerDrain is done (ISSUE-7c39e5cd) | `src/daemon/threads/__tests__/router-session.test.ts` |

**integration: router-session.test.ts: a worker exit answers the running request with 'session worker failed' and the next queued request runs on the new worker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: a worker exit answers the session's running request with 'session worker failed' and the next queued request runs (ISSUE-7c39e5cd) | `src/daemon/threads/__tests__/router-session.test.ts` |
| pass | failure: a session worker exit fails only its running and queued requests; the next request gets a new worker | `src/daemon/threads/__tests__/session-failure.test.ts` |

**integration: router-session.test.ts: FIFO-exempt, unattributed and admin requests keep today's ends and never wait for an ack**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: FIFO-exempt and unattributed requests keep today's ends: they never wait for an ack (ISSUE-7c39e5cd) | `src/daemon/threads/__tests__/router-session.test.ts` |
| pass | router thread view: attach publishes idle with the registry's role; a request marks busy with its method and since; its reply marks idle | `src/daemon/threads/__tests__/router-thread-view.test.ts` |

**integration: worker-requests.test.ts or router-session.test.ts: a queued request refused under the maintenance lock is still acked and the queue moves on**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | router: a queued request refused under the maintenance lock is still acked by its worker and the session's queue moves on (ISSUE-7c39e5cd) | `src/daemon/threads/__tests__/router-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/router-session.test.ts` | 0 | 17 | 1.1 s |  |
| `src/daemon/threads/__tests__/router-thread-view.test.ts` | 0 | 4 | 0.4 s |  |
| `src/daemon/threads/__tests__/session-failure.test.ts` | 0 | 6 | 6.7 s |  |

## t5

Run at 2026-10-29T11:14:21.875Z on commit `ebfd418c3`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**smoke: fifo-ack-acceptance.test.ts: the second connection's request starts only after the first, whose socket closed, has finished on the worker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fifo ack: the second connection's request starts only after the first, whose socket closed, has finished on the worker | `src/daemon/threads/__tests__/fifo-ack-acceptance.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/fifo-ack-acceptance.test.ts` | 0 | 1 | 4.6 s |  |

## t6

Run at 2026-10-29T11:21:08.440Z on commit `aec3e8681`. Tests check: **failed**. 0 pass, 1 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

named test cases that did not pass: fail: 'CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline' in src/daemon/db/__tests__/session-source-inventory.test.ts

**unit: session-source inventory test passes with the refreshed router.ts, channel.ts and supervisor.ts entries**

| Result | Test | File |
| :--- | :--- | :--- |
| fail | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 1 | 2 | 10.9 s |  |
