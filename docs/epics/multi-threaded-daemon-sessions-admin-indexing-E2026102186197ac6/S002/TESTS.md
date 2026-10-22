<!-- insrc:artifact TESTS-86197ac660732ceb-s2 -->

# Tests: 86197ac660732ceb s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 47 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-22T08:05:05.885Z on commit `e3f1203a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets | `src/daemon/__tests__/handler-runtime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/handler-runtime.test.ts` | 0 | 1 | 0.9 s |  |

## t2

Run at 2026-10-22T08:08:05.117Z on commit `6ce2d867`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: classOf/entries: the ten admin and ten indexing methods have their class, every other entry is session, entries unique**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | classOf/entries: the ten admin and ten indexing methods have their class, every other entry is session, entries unique | `src/daemon/threads/__tests__/method-class.test.ts` |

**unit: coverage: the method set equals the keys of the constructed rpcHandlers and streamHandlers after all merges, failing on a missing or a stale entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | coverage: the method set equals the keys of the constructed rpcHandlers and streamHandlers after all merges, failing on a missing or a stale entry | `src/daemon/threads/__tests__/method-class.test.ts` |

**unit: the method-class module loads on a worker without importing a handler module**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the method-class module loads on a worker without importing a handler module | `src/daemon/threads/__tests__/method-class.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/method-class.test.ts` | 0 | 3 | 0.9 s |  |

## t3

Run at 2026-10-22T08:21:14.153Z on commit `eb38fa92`. Tests check: **passed**. 21 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: new IpcServer(directDispatch(rpc, stream)) is wire-identical to today, including unknown method, invalid JSON, stream framing and the stream-to-unary fallback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | new IpcServer(directDispatch(rpc, stream)) is wire-identical to today, including unknown method, invalid JSON, stream framing and the stream-to-unary fallback | `src/daemon/__tests__/server-forward.test.ts` |
| pass | closing the socket aborts a stream request and drops a unary request's late reply while its handler completes | `src/daemon/__tests__/server-forward.test.ts` |

**integration: the registry hook fires on connect, close and each message before the request is forwarded**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the registry hook fires on connect, close and each message before the request is forwarded | `src/daemon/__tests__/server-forward.test.ts` |

**integration: existing server, dispatch, update, understanding, step and MCP suites and the store-child suites pass with servers built through directDispatch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | handleMessage with a valid client envelope updates label/pid/lastMethod | `src/daemon/__tests__/server-registry.test.ts` |
| pass | the daemon.debug-status contract returns { clients } from the registry with no side effects (k1/k5) | `src/daemon/__tests__/server-registry.test.ts` |
| pass | dispatcher: a handler throwing code -30775 records locks-lost and the caller gets the named error, at each of the three server sites and the queue runner | `src/daemon/__tests__/store-failure-dispatch.test.ts` |
| pass | t3: daemon.update returns { launched:true } and schedules shutdown, without exiting the process | `src/daemon/__tests__/update-handlers.test.ts` |
| pass | RPC rejects forged authority and returns typed revision conflicts | `src/daemon/__tests__/understanding-rpc.test.ts` |
| pass | Real watch snapshots handle races, reconnect, deletion and abort with exact terminal frames | `src/daemon/__tests__/understanding-rpc.test.ts` |
| pass | Healthy shutdown flushes final frames before storage close and stops only once | `src/daemon/__tests__/understanding-rpc.test.ts` |
| pass | Socket write flushing is bounded and settles disconnected writes | `src/daemon/__tests__/understanding-rpc.test.ts` |
| pass | step host: done frame carries the handler's envelope unchanged; unknown tool gives step-unknown-tool; a throwing handler gives step-failed with its message | `src/daemon/steps/__tests__/step-host.test.ts` |
| pass | cancellation: closing the stream during a design-review wait and during a code-review wait aborts the inner run in the daemon | `src/daemon/steps/__tests__/step-host.test.ts` |
| pass | forwarder named errors: ENOENT/ECONNREFUSED give DaemonUnreachableError, unknown method or step-unknown-tool give DaemonTooOldError, and no handler runs | `src/mcp/__tests__/forward-step.test.ts` |
| pass | forwarder progress: frames relayed only with a progress token; the done envelope returned unchanged | `src/mcp/__tests__/forward-step.test.ts` |
| pass | forwarder: a multi-byte character split across two socket chunks arrives whole | `src/mcp/__tests__/forward-step.test.ts` |
| pass | ac3: with no daemon every moved tool returns DaemonUnreachableError through a real MCP process, which opens no store; against a daemon without step.call, DaemonTooOldError | `src/mcp/__tests__/mcp-process-e2e.test.ts` |
| pass | healthy shutdown is unchanged: queue drained, connections closed in order, normal exit | `src/daemon/__tests__/shutdown-store-failure.test.ts` |
| pass | status after failure: storeFailure names another process and does not contain 'semume' | `src/daemon/__tests__/shutdown-store-failure.test.ts` |
| pass | the steering refresh of an update gets the repositories from the daemon and opens no store | `src/cli/services/__tests__/steering-refresh-through-daemon.test.ts` |
| pass | CLI review through the daemon: source roots come through the request and the CLI's process holds no descriptor on the store | `src/cli/services/__tests__/review-source-roots-daemon.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/services/__tests__/review-source-roots-daemon.test.ts` | 0 | 1 | 1 s |  |
| `src/cli/services/__tests__/steering-refresh-through-daemon.test.ts` | 0 | 1 | 0.7 s |  |
| `src/daemon/__tests__/server-forward.test.ts` | 0 | 3 | 0.6 s |  |
| `src/daemon/__tests__/server-registry.test.ts` | 0 | 6 | 0.5 s |  |
| `src/daemon/__tests__/shutdown-store-failure.test.ts` | 0 | 5 | 3.8 s |  |
| `src/daemon/__tests__/store-failure-dispatch.test.ts` | 0 | 3 | 3.3 s |  |
| `src/daemon/__tests__/understanding-rpc.test.ts` | 0 | 5 | 1.5 s |  |
| `src/daemon/__tests__/update-handlers.test.ts` | 0 | 3 | 0.5 s |  |
| `src/daemon/steps/__tests__/step-host.test.ts` | 0 | 6 | 1.2 s |  |
| `src/mcp/__tests__/forward-step.test.ts` | 0 | 5 | 0.9 s |  |
| `src/mcp/__tests__/mcp-process-e2e.test.ts` | 0 | 4 | 4.8 s |  |

## t4

Run at 2026-10-22T08:24:16.622Z on commit `021748c3`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: publishLane: two lanes merge, idle is derived from both, queueDepth and QueueLanes map as composeQueueLanes does today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | publishLane: two lanes merge, idle is derived from both, queueDepth and QueueLanes map as composeQueueLanes does today | `src/daemon/threads/__tests__/board-amendments.test.ts` |
| pass | buildDaemonStatus keeps queueDepth as the total and adds queueLanes with each lane's depth, whether it is running, and the running sweep's progress | `src/daemon/__tests__/daemon-status-lanes.test.ts` |

**unit: a repo row without completeness is published unchanged; underHold and maintenance are absent by default**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a repo row without completeness is published unchanged; underHold and maintenance are absent by default | `src/daemon/threads/__tests__/board-amendments.test.ts` |
| pass | publishIndexing, publishClients, publishRun and publishStore are each reflected in snapshot, runs by runId with frames only growing | `src/daemon/threads/__tests__/registry-board.test.ts` |
| pass | with no sweep running the summary lane carries no sweep, and without a lane source the status carries no queueLanes | `src/daemon/__tests__/daemon-status-lanes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/daemon-status-lanes.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/threads/__tests__/board-amendments.test.ts` | 0 | 2 | 0.5 s |  |
| `src/daemon/threads/__tests__/registry-board.test.ts` | 0 | 5 | 0.5 s |  |

## t5

Run at 2026-10-22T08:26:15.345Z on commit `7fb004d7`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: compactGraphStore with a beforeRename hook that returns false: no rename, no lock-file removal, the compacted copy is removed and the original store reopens with its data**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | compactGraphStore with a beforeRename hook that returns false: no rename, no lock-file removal, the compacted copy is removed and the original store reopens with its data | `src/db/graph/__tests__/compact.test.ts` |

**unit: compactGraphStore with a hook returning true or no hook returns today's CompactResult**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | compactGraphStore with a hook returning true or no hook returns today's CompactResult | `src/db/graph/__tests__/compact.test.ts` |
| pass | compactGraphStore reclaims space after large deletes | `src/db/graph/__tests__/compact.test.ts` |
| pass | compactGraphStore re-opens the env so subsequent writes go through | `src/db/graph/__tests__/compact.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/compact.test.ts` | 0 | 8 | 1.9 s |  |

## t6

Run at 2026-10-22T08:29:13.498Z on commit `8679c338`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: runDocSummarySweep with an async takeEdit: a queued edit runs before the next document, and a summary never starts while code work is queued (no await between the final checks and summarise)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runDocSummarySweep with an async takeEdit: a queued edit runs before the next document, and a summary never starts while code work is queued (no await between the final checks and summarise) | `src/indexer/__tests__/doc-summary-sweep.test.ts` |
| pass | every queued single-document job runs before each document, including jobs queued while the sweep runs | `src/indexer/__tests__/doc-summary-sweep.test.ts` |
| pass | a summary never starts while code work is queued, even when the sweep wakes from its wait just before a code job arrives | `src/indexer/__tests__/summary-sweep-progress.test.ts` |
| pass | a single-document job queued for the summary lane is taken by the running sweep and summarised before the next document | `src/indexer/__tests__/summary-sweep-progress.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/doc-summary-sweep.test.ts` | 0 | 10 | 0.6 s |  |
| `src/indexer/__tests__/summary-sweep-progress.test.ts` | 0 | 8 | 1.8 s |  |

## t7

Run at 2026-10-22T08:32:18.528Z on commit `71c15a71`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the code-busy and stopping words track the index lane and stop()**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the code-busy and stopping words track the index lane and stop() | `src/daemon/__tests__/queue-threads.test.ts` |

**unit: pause() resolves once no job is in flight and no job starts until resume()**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pause() resolves once no job is in flight and no job starts until resume() | `src/daemon/__tests__/queue-threads.test.ts` |

**unit: every lane change publishes the lane's depth and processing, and lane order and the summary yield are unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every lane change publishes the lane's depth and processing, and lane order and the summary yield are unchanged | `src/daemon/__tests__/queue-threads.test.ts` |
| pass | an index job enqueued while a summary job is running completes before that summary job finishes | `src/daemon/__tests__/queue-lanes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/queue-lanes.test.ts` | 0 | 7 | 0.6 s |  |
| `src/daemon/__tests__/queue-threads.test.ts` | 0 | 3 | 0.5 s |  |

## t8

Run at 2026-10-22T08:37:57.250Z on commit `6c0bef54`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a worker started with the request entry answers a request, relays stream frames, aborts on cancel and names an uncloneable reply**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a worker started with the request entry answers a request, relays stream frames, aborts on cancel and names an uncloneable reply | `src/daemon/threads/__tests__/main-services.test.ts` |

**integration: a worker started before the embedding bootstrap settles embeds with the decided backend after the push**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a worker started before the embedding bootstrap settles embeds with the decided backend after the push | `src/daemon/threads/__tests__/main-services.test.ts` |

**unit: daemon.threads.enabled is a config schema key defaulting to off and daemon.info returns its four fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | daemon.threads.enabled is a config schema key defaulting to off and daemon.info returns its four fields | `src/daemon/threads/__tests__/main-services.test.ts` |
| pass | the real CONFIG_CATALOG has 39 rows (flat models.* surface; shaper*/summariser* now derived; + codeReview.enforce + codeReview.freshnessTimeoutMs + models.local.embeddingKeepAlive + five designReview.* rows + analyzer.dataSourceListingTimeoutMs + review.chunkTokens + daemon.threads.enabled) | `src/config/__tests__/config-catalog-contract.test.ts` |
| pass | real CONFIG_CATALOG self-consistency: every row in-domain, every default satisfies its predicate | `src/config/__tests__/config-catalog-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/config-catalog-contract.test.ts` | 0 | 10 | 0.4 s |  |
| `src/daemon/threads/__tests__/main-services.test.ts` | 0 | 3 | 0.8 s |  |
