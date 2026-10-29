<!-- insrc:artifact BUILD-7c39e5cd2c076e86-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-29T10:48:19.520Z  ·  **Updated:** 2026-10-29T11:34:12.744Z

**Commit:** bd5f04a5d

## Summary

A session's queue in the threaded daemon's router now moves only on the worker's explicit ack (its completion message) for each request sent from it; a reply, a last frame or a closed socket no longer moves it, and every end after which no ack can come (worker exit, failed post, start failure, cancel before start) acks with an error answer. The pool's busy count and the daemon.status thread view end such a request at the ack; unqueued requests are unchanged. Deviation from the LLD ('no worker change'): the test.servingThread hook in src/daemon/threads/worker-requests.ts answers requests itself, so it now also sends the completion message when asked; without it 10 spawned-daemon tests stalled. t6: the inventory entries for the four changed files were refreshed, but the inventory test still fails on a pre-existing gap outside this Story (src/daemon/db/removal-retirement.ts, Epic 484fcef7, commit 0ce46e23e, has no entry); closed with the user's override. Code review: manual (the daemon code review is being rewritten); no HIGH or MED findings. Full sweep: 6934 tests, 7 failed and 11 cancelled, none in this Story's files (other session's CM-S1/CM-S3 db checks and inventory, the known SIGTERM boot flake, the pre-existing file-tools test; the cancelled lock-manager tests pass alone).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✗ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/threads/__tests__/channel.test.ts` — **insrc-build** (2026-10-29T11:21:08.440Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-29T11:21:08.440Z)
- `src/daemon/threads/__tests__/router-session.test.ts` — **insrc-build** (2026-10-29T11:21:08.440Z)
- `src/daemon/threads/__tests__/router-thread-view.test.ts` — **insrc-build** (2026-10-29T11:21:08.440Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-10-29T11:21:08.440Z)
- `src/daemon/threads/supervisor.ts` — **insrc-build** (2026-10-29T11:21:08.440Z)
- `src/daemon/threads/__tests__/worker-requests.test.ts` — **insrc-build** (2026-10-29T11:21:08.440Z)
- `src/daemon/threads/worker-requests.ts` — **insrc-build** (2026-10-29T11:21:08.440Z)
- `src/daemon/threads/__tests__/fifo-ack-acceptance.test.ts` — **insrc-build** (2026-10-29T11:21:08.440Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-29T11:21:08.440Z)
- `.insrc/artifacts/PLAN-7c39e5cd2c076e86-S001.json` — **insrc-build** (2026-10-29T11:34:12.744Z)
- `docs/standalone/move-session-s-queue-forward-only-E202610297c39e5cd/S001/PLAN.md` — **insrc-build** (2026-10-29T11:34:12.744Z)
- `docs/standalone/move-session-s-queue-forward-only-E202610297c39e5cd/S001/sequence-diagram.html` — **insrc-build** (2026-10-29T11:34:12.744Z)
