<!-- insrc:artifact CR-86197ac660732ceb-s2 -->

# Code review: 86197ac660732ceb:s2

⛔ **BLOCK** — HIGH 1 · MED 21 · LOW 19 · model `codex:gpt-6.1-sol`

**Changed files:** 97

**Reviewed on the diff:** the wait for a fresh index timed out after 123 s (code-index job in flight: no; queued: 0; stale files: src/daemon/db/__tests__/fixtures/session-source-inventory.json)

## adherence — 19 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/threads/maintenance-entry.ts:36 | The daemon.status and daemon.compact exemptions depend on trustedContext: requests with connectionSession or session-memory execution acquire a maintenance hold. During maintenance these requests can receive a busy error, although the approved contract exempts both methods unconditionally. Preserve those exemptions regardless of connection context. |
| MED | src/daemon/threads/router.ts:121 | The trusted connection-session and session-memory checks dispatch locally before consulting the method's class. Consequently, admin or indexing requests carrying either context bypass their registered worker and, during restart, bypass the required hold and 30-second unavailable response. The approved rule requires these classes to use their registered targets regardless of session context. |
| MED | src/db/graph/store.ts:945 | The new compaction protocol runs even without beforeRename, adding transaction fencing, manifest writes, a required hard-link backup, and verification/recovery failure paths. This changes existing callers’ behavior despite the clause explicitly requiring unchanged behavior when the hook is omitted. |
| MED | src/daemon/handler-runtime.ts:799 | The extraction changes handler behavior despite the explicit requirement that handler bodies remain unchanged. session.delete now rejects path-shaped session IDs, and the shared purgeSession pipeline additionally skips their tmp-directory removal at line 245. These behavioral changes depart from the approved construction-only refactor. |
| LOW | src/db/graph/store.ts:959 | Swap failures now return 'compact: the swap failed:' instead of the existing 'compact: rename failed:' prefix. This changes the error message propagated to manual daemon.compact callers, contrary to the approved requirement to preserve today's message. Retain the existing prefix. |
| MED | src/daemon/threads/indexing-worker.ts:56 | sc4 assigns summary-lane and sweep publication to the summary worker. Here the code-indexing worker publishes both lanes using relayed summary progress, making summary-status updates depend on the code worker processing those relays. Move summary-lane and sweep publication to the summary worker to honour the approved ownership boundary. |
| MED | src/daemon/threads/maintenance-entry.ts:36 | daemon.status loses its maintenance exemption when trustedContext contains connectionSession or session-memory execution. Those requests can receive a maintenance refusal, whereas the approved clause exempts daemon.status without a context restriction. |
| LOW | src/daemon/server.ts:350 | Non-object JSON now receives a new 'invalid request' response. This changes wire behavior outside the approved maintenance refusal and optional status field. |
| LOW | src/daemon/server.ts:86 | The new own-property restriction changes inherited handler names such as toString to 'unknown method'. The evidence identifies this as changed dispatch behavior, contrary to the requirement to preserve existing IPC behavior. |
| LOW | src/daemon/handler-runtime.ts:799 | session.delete newly rejects path-like session IDs with an invalid-input result. This changes accepted inputs and response behavior beyond the compatibility clause's permitted maintenance changes. |
| LOW | src/db/graph/store.ts:959 | Compaction rename failures now use the prefix 'compact: the swap failed:', changing the existing client-visible error message despite the requirement to preserve the IPC response contract. |
| MED | src/daemon/threads/router.ts:121 | The trusted-context override sends admin and indexing requests to main-thread local dispatch whenever connectionSession is present or execution uses session-memory. This bypasses their designated workers, departing from the approved ownership split. Restrict local session dispatch to session methods so admin and indexing methods retain worker routing. |
| MED | package.json:29 | Upgrading LanceDB from 0.27.2 to 0.40.0 changes the storage dependency underlying s1's verified threading policy and raises its Node requirement. This exceeds s2's routing/indexing boundary; the dependency migration and associated version-pruning change belong with the storage-policy owner. |
| MED | src/daemon/handler-runtime.ts:799 | The new path-like session-ID rejection changes session.delete behavior, while s2 requires session handlers to retain today's behavior during extraction. The additional purgeSession cleanup restriction is part of the same unrelated behavior change and should be tracked separately. |
| MED | src/shared/locks/lock-manager.ts:820 | The change extends the adjacent lock implementation with awaitable worker reclamation, pending metadata and live-context hold semantics. s2 owns worker supervision and must consume s1's locking contracts; these shared locking changes exceed that ownership boundary. |
| MED | src/db/graph/store.ts:888 | The compaction changes introduce transaction fencing and persistent crash-recovery machinery beyond the planned pre-rename integration hook. This expands s2's maintenance coordination into a storage-compaction redesign rather than preserving today's compaction behavior through the approved integration. |
| MED | src/daemon/handler-runtime.ts:799 | The extraction changes session-purge behavior: session.delete now rejects path-shaped IDs, and the new purgeSession guard at line 245 skips their tmp-directory cleanup for other purge callers. Task t1 explicitly requires unchanged handler bodies and byte-identical behavior. These validation changes depart from that requirement and should be separated from the extraction. |
| MED | src/db/graph/store.ts:900 | The transaction fence applies even when beforeRename is omitted: a write committed during backup now aborts compaction with a new rejection. This changes existing no-hook behavior, which t5 explicitly requires to remain unchanged. |
| MED | src/daemon/threads/maintenance-entry.ts:36 | The status/compact exemptions depend on trustedContext: requests with connectionSession or session-memory execution instead acquire the shared maintenance lock. During exclusive maintenance, daemon.status is therefore refused rather than answered, and daemon.compact also loses its required exemption. Preserve these two method exemptions regardless of trusted session context. |

## conventions — 11 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/__tests__/server-forward.test.ts:169 | The new reply and line types declare `error?: string` here and at lines 170 and 183. The documented convention requires optional properties to explicitly include `\| undefined`; use `error?: string \| undefined`. |
| LOW | src/daemon/admin-handlers.ts:67 | The optional workflow property omits the explicitly required `\| undefined`. The noted request and option shapes in handler-runtime.ts repeat this departure. |
| LOW | src/daemon/handler-runtime.ts:26 | getDb is imported as a runtime value but used only in `typeof getDb` within HandlerRuntimeDeps. Use `import type` for this type-only dependency. |
| LOW | src/daemon/threads/__tests__/admin-worker.test.ts:62 | The reply type declares `error?: string` without the documented explicit `\| undefined`. The noted optional fields in latency-isolation and threads-boot repeat this convention breach. Add explicit undefined unions. |
| LOW | src/daemon/threads/__tests__/summary-link.test.ts:102 | `toCode.at(-1)!.kind` suppresses the potentially undefined result without checking it. The preceding find results similarly use unchecked non-null assertions. Assert that these values exist before dereferencing them. |
| LOW | src/daemon/threads/__tests__/helpers/store-worker.ts:123 | The workerData cast declares `supervised?: boolean`, omitting the explicit `\| undefined` required for optional properties. Use `supervised?: boolean \| undefined`; the existing absence check is adequate. |
| LOW | src/daemon/threads/router.ts:71 | Held.sentTo and Held.localCancel omit the explicit `\| undefined` required for optional properties. Use `number \| undefined` and `(() => void) \| undefined`, respectively. |
| LOW | src/daemon/threads/main-services.ts:42 | The parsed configuration shapes in threadsEnabled and maintenanceConfig omit explicit `\| undefined` on their optional object properties, contrary to the documented optional-property convention. |
| LOW | src/daemon/threads/status-board.ts:140 | The publishLane handler's inline argument shape declares `sweep?: SummarySweepProgress` without the required explicit `\| undefined`. The module's IndexingStatus.sweep already follows this rule. |
| LOW | src/db/graph/store.ts:868 | The new optional properties beforeRename (line 868), free (line 1023), and fail (line 1058) omit explicit `\| undefined`, contrary to the documented optional-property convention. Add it to each property's type. |
| LOW | src/shared/types.ts:1027 | DaemonStatus.maintenance omits the explicit `\| undefined` required for optional properties. Add it after the object type; the adjacent queueLanes style does not override the documented rule. |

## coverage — 0 finding(s)

_No findings._

## quality — 11 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/__tests__/queue-threads.test.ts:61 | Error handling: the shared-block idle wait has no timeout, and queue cleanup only runs after it resolves. A lost notification—the regression this test should detect—can leave the test hanging indefinitely. Bound the wait and release gates and stop the queue in finally. |
| MED | src/daemon/server.ts:350 | Error handling: object envelopes still accept a non-string method. For example, {"method":{"toString":null,"valueOf":null}} makes Object.hasOwn throw synchronously during dispatch. Because forward() is called without a guard, malformed socket input can escape the data callback and terminate the daemon. Validate method before forwarding. |
| MED | src/daemon/todos-rpc.ts:1154 | Correctness: skipping a bus event during maintenance permanently drops that update for existing subscribers. This path provides no replay or replacement snapshot after maintenance, so clients can retain missing or outdated items indefinitely. Buffer notifications or trigger a resynchronization when maintenance finishes. |
| MED | src/daemon/threads/__tests__/summary-link.test.ts:123 | Correctness: the replacement-worker test waits 30 ms before closing the original port without confirming that its job started. Delayed message delivery can leave the expected start event absent and fail a correct implementation. Wait for an explicit job-start signal before closing the port. |
| LOW | src/daemon/threads/__tests__/indexing-port.test.ts:173 | Complexity: locating runtime branches through exact source strings and counting constructor expressions makes this test depend on whitespace and implementation layout. Harmless refactoring can break it without changing which objects the main thread constructs. |
| LOW | src/daemon/threads/__tests__/admin-worker.test.ts:52 | Duplication: the recording socket implementation and private-server interface repeat those in router.test.ts. A shared helper would keep simulated socket behavior consistent across both suites. |
| MED | src/daemon/threads/__tests__/indexing-worker.test.ts:98 | Error handling: after acquiring the exclusive maintenance lock, holdAJob can throw on the enqueue assertion or waiting deadline before returning its release function. Its gate then remains unresolved, retaining the lock and blocking subsequent jobs and teardown. Release the gate and await the lock request on every setup failure. |
| HIGH | src/daemon/threads/maintenance-entry.ts:89 | Correctness: subscription admission invokes forward inside a short shared hold. An asynchronous refresh started synchronously by forward can see holdsMaintenanceLock() and bypass acquiring its own refresh hold. Admission then releases its hold while that refresh continues, allowing maintenance to close the graph underneath it. Run subscription work outside the admission context or ensure each refresh acquires an independently retained hold. |
| MED | src/daemon/threads/maintenance-entry.ts:102 | Error handling: admitted() swallows every rejection and only completes the lifetime. If lock acquisition or forward throws, the caller receives neither a reply nor a terminal error frame and can wait indefinitely. Deliver the failure using the same error-envelope handling as holdingForward(). |
| MED | src/daemon/threads/maintenance.ts:130 | Correctness: indexing activity resets lastActivity only when busy() observes a busy lane. Work that starts and finishes between maintenance ticks is invisible, so the next tick can compact immediately after indexing despite the configured idle period. Record lane activity transitions or completion timestamps instead of inferring the idle window solely from polling. |
| LOW | src/mcp/__tests__/forward-step.test.ts:35 | Both files repeat the temporary-socket fixture: constructing the IPC server, forwarding connections through its private handler, awaiting listening, and closing/removing resources. A shared test utility would keep this setup synchronized; the remaining differences are minor fixture options. |

