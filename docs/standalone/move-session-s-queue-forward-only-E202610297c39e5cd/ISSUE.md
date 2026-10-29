<!-- insrc:artifact ISSUE-7c39e5cd2c076e86 -->

# Move a session's queue forward only on the worker's explicit ack for each request

## Reproduction

With daemon.threads.enabled, a client process (one session) sends a long request on connection 1, then a second request on connection 2, which waits in the session's queue. Close connection 1 while the first request is still running. Observed: the second request is sent to the session's worker at once and runs alongside the first, which is still running there (a unary request runs on after its socket closes; a stream runs until the worker completes it). Expected: the second request starts only after the worker has said it finished the first; one session's requests never overlap.

## Root cause

The router's per-session queue moves forward on ends it infers rather than on anything the worker says: when a delivered reply or stream frame is terminal (src/daemon/threads/router.ts:338-339), and at once when a started request is cancelled by its socket (src/daemon/threads/router.ts:357-358). A socket close is not the end of the request on the worker. The worker can say when it has really finished: its completion message (CompletionEnvelope, src/daemon/threads/channel.ts:74), posted by serveRequests once the request's lifetime has completed and drained (src/daemon/threads/worker-requests.ts:67-70). But the router asks for that message only for streams with a lifetime (wireRequest, src/daemon/threads/channel.ts:66), and uses it only to complete the stream's lifetime (src/daemon/threads/router.ts:400), never to move the queue.

## Fix intent

Each request in a session's queue is moved past only by an explicit acknowledgement from the worker that it has finished that request (its handler settled and its follow-up work done), whether it completed normally or was cancelled; a reply, a stream's last frame or a socket close no longer move the queue. The router asks the worker to acknowledge every request it sends from a session's queue, and moves the queue on that acknowledgement. When the acknowledgement can never come (the worker exited, or the request could not be sent to it), the request is ended with an error and the queue moves on, so a session is never stuck. One session's requests then never run at the same time.

## Citations

- **[[c1]]** `code` `src/daemon/threads/router.ts:338-339` — "item.cancel = send(envelope => { try { deliver(envelope); } finally { if (isTerminal(envelope)) this.next(key, item); }"
- **[[c2]]** `code` `src/daemon/threads/router.ts:357-358` — "item.cancel?.(); this.next(key, item);"
- **[[c3]]** `code` `src/daemon/threads/channel.ts:74` — "export interface CompletionEnvelope { readonly kind: 'complete'; readonly requestId: string; }"
- **[[c4]]** `code` `src/daemon/threads/worker-requests.ts:67-70` — "const lifetime = msg.trackCompletion === true ? new RequestLifetime() : undefined; ... port.postMessage({ kind: 'complete', requestId } satisfies CompletionEnvelope);"
- **[[c5]]** `code` `src/daemon/threads/channel.ts:66` — "...(request.stream && request.lifetime ? { trackCompletion: true as const } : {}),"
- **[[c6]]** `code` `src/daemon/threads/router.ts:400` — "const completion = (msg as { kind?: string } | null)?.kind === 'complete';"
- **[[c7]]** `analyze-bundle` `insrc_analyze_step how-does-it-work over the ack path (src/daemon/threads/channel.ts, src/daemon/threads/worker-requests.ts, src/daemon/threads/router.ts) and the FIFO advance points in src/daemon/threads/router.ts`
- **[[c8]]** `stakeholder` `User direction 2026-10-29: for each message in the queue there should be an explicit ack that moves the queue forward`
