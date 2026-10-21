<!-- insrc:artifact TESTS-86197ac660732ceb-s1 -->

# Tests: 86197ac660732ceb s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 39 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-21T15:03:00.014Z on commit `b038c9e4`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a worker thread's LMDB open, read, write, close and exit keep the daemon's lock, and the main thread writes after another process opens and closes the store**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a worker thread's open, write, close and exit keep the daemon's lock, and the daemon writes after another process opens and closes the store | `src/db/graph/__tests__/worker-thread-lock.test.ts` |

**integration: the lock probe reports a dropped lock after a stray descriptor on the lock file is closed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | control: the lock check reports a dropped lock after a stray descriptor on the lock file is closed | `src/db/graph/__tests__/worker-thread-lock.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/worker-thread-lock.test.ts` | 0 | 3 | 0.8 s |  |

## t2

Run at 2026-10-21T15:16:42.801Z on commit `e61cc5a3`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: withStore releases its permit on resolve, reject, synchronous throw and abort**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | withStore releases its permit on resolve, reject, synchronous throw and abort | `src/db/__tests__/store-guard.test.ts` |

**unit: an acquisition past its limit fails with StoreLockTimeoutError naming the holder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an acquisition past its limit fails with StoreLockTimeoutError naming the holder | `src/db/__tests__/store-guard.test.ts` |

**unit: two concurrent same-thread withStore calls on a one-permit store both complete in turn; withStore inside a held op fails with StoreLockNestedError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two concurrent same-thread withStore calls on a one-permit store both complete in turn; withStore inside a held op fails with StoreLockNestedError | `src/db/__tests__/store-guard.test.ts` |

**unit: reclaim releases after quiescence and marks the store unhealthy past limitMs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reclaim releases after quiescence and marks the store unhealthy past limitMs | `src/db/__tests__/store-guard.test.ts` |

**integration: a worker terminated while holding a permit has it reclaimed and another worker then acquires it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a worker terminated while holding a permit has it reclaimed and another worker then acquires it | `src/db/__tests__/store-guard.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/store-guard.test.ts` | 0 | 5 | 0.9 s |  |

## t3

Run at 2026-10-21T15:18:51.724Z on commit `ce92f270`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a worker's hub request is answered with its own requestId**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a worker's hub request is answered with its own requestId | `src/daemon/threads/__tests__/channel.test.ts` |

**integration: closing the port rejects every pending hub request with HubUnavailableError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | closing the port rejects every pending hub request with HubUnavailableError | `src/daemon/threads/__tests__/channel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/channel.test.ts` | 0 | 2 | 0.6 s |  |

## t4

Run at 2026-10-21T15:20:58.413Z on commit `b2c89fda`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: TargetRegistry refuses a second live admin, indexing, unattributed or same-session target and resolves an identity-less session request to the unattributed target**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | TargetRegistry refuses a second live admin, indexing, unattributed or same-session target and resolves an identity-less session request to the unattributed target | `src/daemon/threads/__tests__/registry-board.test.ts` |

**unit: a target re-registered after unregister succeeds and unregistering an unknown thread is a no-op**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a target re-registered after unregister succeeds and unregistering an unknown thread is a no-op | `src/daemon/threads/__tests__/registry-board.test.ts` |

**unit: StatusBoard keeps the latest status per thread and snapshots empty as specified**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | StatusBoard keeps the latest status per thread and snapshots empty as specified | `src/daemon/threads/__tests__/registry-board.test.ts` |

**unit: publishIndexing, publishClients, publishRun and publishStore are each reflected in snapshot, runs by runId with frames only growing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | publishIndexing, publishClients, publishRun and publishStore are each reflected in snapshot, runs by runId with frames only growing | `src/daemon/threads/__tests__/registry-board.test.ts` |

**integration: a status published from a worker appears in a main-thread snapshot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a status published from a worker appears in a main-thread snapshot | `src/daemon/threads/__tests__/registry-board.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/registry-board.test.ts` | 0 | 5 | 0.5 s |  |

## t5

Run at 2026-10-21T15:38:09.812Z on commit `e3731fb0`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: locks-lost recorded in a worker makes the main thread's next getGraphStore and withWriteTxn fail with LmdbStoreLocksLostError and write nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | locks-lost recorded in a worker makes the main thread's next getGraphStore and withWriteTxn fail with LmdbStoreLocksLostError and write nothing | `src/db/graph/__tests__/store-health-threads.test.ts` |

**integration: after locks-lost in a worker, getStoreHealth on the main thread reports it, runReaderCheck does not probe and a second detection does not log**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | after locks-lost in a worker, getStoreHealth on the main thread reports it, runReaderCheck does not probe and a second detection does not log | `src/db/graph/__tests__/store-health-threads.test.ts` |
| pass | the full locks-lost record reaches the main thread and every other worker through the hub | `src/db/graph/__tests__/store-health-threads.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/store-health-threads.test.ts` | 0 | 3 | 1.2 s |  |

## t6

Run at 2026-10-21T15:41:11.904Z on commit `a43e7eeb`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a Lance write in one thread is read from another with readConsistencyInterval 0 and missed with it unset**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Lance write in one thread is read from another with readConsistencyInterval 0 and missed with it unset | `src/db/__tests__/cross-thread-stores.test.ts` |

**integration: two threads' DuckDB queries run one after the other behind the one permit and both succeed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two threads' DuckDB queries run one after the other behind the one permit and both succeed | `src/db/__tests__/cross-thread-stores.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/cross-thread-stores.test.ts` | 0 | 2 | 1.8 s |  |

## t7

Run at 2026-10-21T15:44:08.534Z on commit `8a608951`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: each step kind's token rule, 100-entry eviction, TTL with read refresh and release match today's stores**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each step kind's token rule, 100-entry eviction, TTL with read refresh and release match today's stores | `src/daemon/threads/__tests__/step-state.test.ts` |

**integration: a real payload of each step kind survives a structured clone through the hub**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a real payload of each step kind survives a structured clone through the hub | `src/daemon/threads/__tests__/step-state.test.ts` |

**integration: step state minted in one worker is read in another after the first exits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | step state minted in one worker is read in another after the first exits | `src/daemon/threads/__tests__/step-state.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/step-state.test.ts` | 0 | 3 | 0.8 s |  |

## t8

Run at 2026-10-21T15:50:23.544Z on commit `9ef84e1d`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/steps/__tests__/analyze-step-state.test.ts passes unchanged in meaning against the hub-backed store**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | encodeState + decodeState round-trip preserves every field | `src/daemon/steps/__tests__/analyze-step-state.test.ts` |
| pass | decodeState rejects a bogus token with StepStateDecodeError | `src/daemon/steps/__tests__/analyze-step-state.test.ts` |
| pass | releaseState drops the entry so a subsequent decodeState fails | `src/daemon/steps/__tests__/analyze-step-state.test.ts` |
| pass | analyze replaceState: a > MAX_ENTRIES(100) run keeps ~1 live token; active token never LRU-evicted | `src/daemon/steps/__tests__/analyze-step-state.test.ts` |
| pass | analyze reencodeState: version guard throws wrong-version, else delegates (releases prev) | `src/daemon/steps/__tests__/analyze-step-state.test.ts` |

**unit: src/daemon/steps/workflow-step/__tests__/state-store.test.ts passes unchanged in meaning, with today's not-found messages**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | save + load round-trip | `src/daemon/steps/workflow-step/__tests__/state-store.test.ts` |
| pass | s5/t2: decodeState on an unknown/released token throws code 'not-found' with the plain message | `src/daemon/steps/workflow-step/__tests__/state-store.test.ts` |
| pass | replaceState is mint-before-release: the new token always exists even as the old is dropped | `src/daemon/steps/workflow-step/__tests__/state-store.test.ts` |
| pass | reencodeState: version guard throws wrong-version, else delegates to replaceState (releases prev) | `src/daemon/steps/workflow-step/__tests__/state-store.test.ts` |
| pass | replaceState: mints a new token, releases the (defined+distinct) previous one — store stays ~1 | `src/daemon/steps/workflow-step/__tests__/state-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/analyze-step-state.test.ts` | 0 | 11 | 0.7 s |  |
| `src/daemon/steps/workflow-step/__tests__/state-store.test.ts` | 0 | 14 | 0.6 s |  |

## t9

Run at 2026-10-21T15:54:40.240Z on commit `28bb36ea`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts passes unchanged in meaning against the hub-backed stores**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review-step stays leak-free: updateState is in-place — a multi-turn run keeps ~1 live token | `src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts` |
| pass | code-review-step stays leak-free: release-on-consume — a resend of a released token fails loadState | `src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts` |
| pass | review-step updateState on a released token fails with today's not-found message, across the hub | `src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts` |

**unit: a superseded code-review token fails with today's not-found message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a superseded code-review token fails with today's not-found message | `src/daemon/steps/code-review-step/__tests__/handler.test.ts` |
| pass | resending the same judgements token after done fails loadState (no double-write) | `src/daemon/steps/code-review-step/__tests__/handler.test.ts` |

**integration: src/daemon/__tests__/code-review-rpc-fallback.test.ts passes unchanged in meaning**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | codeReview.run with params.fallbackReason writes a record whose body.fallbackReason equals it, and refuses a malformed reason; without one the body has no fallbackReason | `src/daemon/__tests__/code-review-rpc-fallback.test.ts` |
| pass | a step-to-daemon run through the real codeReviewRequestParams and codeReview.run writes body.fallbackReason identical to the step's done-frame fallbackReason | `src/daemon/__tests__/code-review-rpc-fallback.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/code-review-rpc-fallback.test.ts` | 0 | 2 | 0.9 s |  |
| `src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts` | 0 | 3 | 0.5 s |  |
| `src/daemon/steps/code-review-step/__tests__/handler.test.ts` | 0 | 31 | 0.7 s |  |
