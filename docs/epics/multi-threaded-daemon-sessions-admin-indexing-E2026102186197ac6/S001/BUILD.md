<!-- insrc:artifact BUILD-86197ac660732ceb-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-21T15:03:00.014Z  ·  **Updated:** 2026-10-21T15:18:51.724Z

**Commit:** ce92f270

## Summary

Added src/daemon/threads/channel.ts: the sc3 request-routing envelopes (RequestEnvelope, ReplyEnvelope, FrameEnvelope, CancelEnvelope, MethodClass, SessionId), the hub protocol (HubRequest answered by one HubReply, one-way HubMessage), serveHub for the main-thread side (unknown ops and throwing services answered with an error, never left unanswered), and HubClient for workers (request/send, replies matched by requestId, every pending request rejected with HubUnavailableError when the port closes; a payload that cannot be cloned rejects the request). Tests in src/daemon/threads/__tests__/channel.test.ts run a real worker over a MessageChannel; two falsifying mutations (replies matched in arrival order; no close handling) each fail their target test. The registry and status board are t4.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/graph/__tests__/helpers/lmdb-open-close.mjs` — **insrc-build** (2026-10-21T15:18:51.724Z)
- `src/db/graph/__tests__/helpers/lmdb-worker.mjs` — **insrc-build** (2026-10-21T15:18:51.724Z)
- `src/db/graph/__tests__/worker-thread-lock.test.ts` — **insrc-build** (2026-10-21T15:18:51.724Z)
- `src/db/__tests__/helpers/store-guard-worker.ts` — **insrc-build** (2026-10-21T15:18:51.724Z)
- `src/db/__tests__/store-guard.test.ts` — **insrc-build** (2026-10-21T15:18:51.724Z)
- `src/db/store-guard.ts` — **insrc-build** (2026-10-21T15:18:51.724Z)
- `src/daemon/threads/__tests__/channel.test.ts` — **insrc-build** (2026-10-21T15:18:51.724Z)
- `src/daemon/threads/__tests__/helpers/hub-worker.ts` — **insrc-build** (2026-10-21T15:18:51.724Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-21T15:18:51.724Z)
