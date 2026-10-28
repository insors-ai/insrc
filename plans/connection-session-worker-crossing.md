# Work item: let connection-scoped requests run on worker threads

**Status:** logged 2026-10-28, not started. Start it only after the other
session's work is complete: Epic 484fcef7 (manage saved and temporary data
connections) has its s1 and s3 BUILD records approved, and standalone Story
34798d20 (split oversized diff evidence) is done. Route it through the tracked
workflow (`insrc_triage` first); this file is a placeholder, not a design.

## Problem

The threaded daemon (Epic 86197ac6) moves session work off the main thread,
but a request that carries a connection session cannot cross a worker
channel. `wireRequest` (`src/daemon/threads/channel.ts:59-62`) throws
"Session execution cannot cross a worker channel." for a request whose
trusted context has a `connectionSession` or `connectionExecution`. The
router (`src/daemon/threads/router.ts:120-125`) therefore keeps these on the
main thread:

- requests with a trusted `connectionSession`;
- requests with `connectionExecution.mode === 'session-memory'` (for example
  an analyze run against a temporary connection);
- the `MAIN_DAEMON_CONNECTION_METHODS` (`src/daemon/threads/method-class.ts:257-264`).

So Epic 86197ac6's "session work never runs on the main thread" (s3 FR4) and
s4 ac1 ("the main thread runs no request handler") are not met for these
requests. s3 deliberately left `channel.ts` alone (user decision 2026-10-28,
recorded on the s3 plan's open question q866775a8).

## Why it is not a small change

The trusted context these requests carry is live, process-local state, not
data: request and connection abort signals, `assertActive` /
`assertRequestActive` closures, the `registerDrain` hook
(`src/daemon/request-context.ts:12-23`), and the connection session's
in-memory overlay of temporary connections and credentials with its private
DuckDB (`src/daemon/connection-session-rpc.ts`). Making it cross a thread
means either proxying every signal, check, drain and lookup back to the main
thread, or moving connection-session ownership onto the session's worker.
Both touch Epic 484fcef7's design (admission, the no-persistence boundary for
temporary credentials, cleanup), so its owner should drive or agree the
approach.

## Done when

- Connection-scoped requests run on the caller's session worker (or a
  defined worker) with today's lifetime, cancellation, drain and
  no-persistence behaviour.
- No request handler runs on the main thread for these requests, so
  Epic 86197ac6 s3 FR4 and s4 ac1 hold for them.
