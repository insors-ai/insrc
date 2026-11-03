# Work item: sweep every module-scope mutable value reachable from a session handler

**Status:** logged 2026-10-28, not started. A follow-up to Epic 86197ac6
(multi-threaded daemon) Story s3. Route it through the tracked workflow
(`insrc_triage` first); this file is a placeholder, not a design.

## Problem

Once session handlers run on several worker threads, any module-scope
mutable value they rely on (a cache, a registry, a pool, an event bus) exists
once per thread instead of once per process. A handler that assumed one
shared copy then silently sees a per-worker copy.

The HLD's risk table
(`docs/epics/multi-threaded-daemon-sessions-admin-indexing-E2026102186197ac6/HLD.md:408`)
assigned an inventory of every such value to s1, with each classified as
per-thread-safe, moved to a shared store, or owned by one class's worker. s1
never delivered it.

s3 covers only the process-wide families its own design found, and tests
that each has exactly one owner thread:

- the chat session pool (`src/daemon/chat-handler.ts:39`);
- the todos event bus (`src/daemon/todos-rpc.ts:122`);
- the understanding service;
- the workflow run registry (`src/daemon/workflow-run-registry.ts:72`).

Any other module-scope state reachable from a session handler is not yet
classified (the HLD names template caches and the repository-map cache as
examples).

## Done when

- Every module-scope mutable value reachable from a session-class handler is
  listed and classified (per-thread-safe, shared store, or owned by one
  worker), with the reason for each.
- A test fails when a new module-scope mutable value reachable from a
  session handler is added without a classification.
- Any value classified as needing one copy is moved to its owner, the way
  s3 handles the four families above.
