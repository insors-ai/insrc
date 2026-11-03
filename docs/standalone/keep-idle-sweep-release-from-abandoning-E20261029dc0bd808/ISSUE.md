<!-- insrc:artifact ISSUE-dc0bd8089ce15fcd -->

# Keep an idle-sweep release from abandoning a compaction in progress

## Reproduction

With daemon threads on, let the daemon become idle long enough for idle maintenance to start compacting the graph store. While it is between closing the workers' graph handles and the final rename, let the session pool's idle sweep release a session worker whose idle timeout has just passed. Observed: the rename check answers false, the compaction is abandoned and nothing is compacted until the next idle window. Expected: a worker released during compaction does not stop it, since a released worker holds no graph handle once it exits. No data is at risk either way: the check fails safe.

## Root cause

The rename check accepts only when the number of workers the supervisor has created equals the number of live workers, and every live worker acknowledged closing its handle (src/daemon/threads/maintenance.ts:240-242). The pool's release removes the worker from the pool's live list first and only then terminates it (src/daemon/threads/session-pool.ts:276-281). The supervisor keeps the worker in its created set until the thread's exit event (src/daemon/threads/supervisor.ts:111-113, src/daemon/threads/supervisor.ts:136-137). The idle sweep runs on its own timer, not as a request (src/daemon/threads/session-pool.ts:169-178, started at src/daemon/index.ts:513), so the maintenance lock, which holds back requests only, does not stop it. A release in that window leaves created greater than live, and the check answers false.

## Fix intent

A session worker that the idle sweep releases while a compaction is under way no longer causes that compaction to be abandoned, and the rename still happens only when no worker that could hold a graph handle is running. Compaction stays fail-safe: any other case that cannot be shown safe is still refused.

## Citations

- **[[c1]]** `code` `src/daemon/threads/maintenance.ts:242` — "return this.deps.workers.created() === live.length && live.every(w => closed.acknowledged.has(w.threadId));"
- **[[c2]]** `code` `src/daemon/threads/session-pool.ts:276` — "private async release(e: Entry): Promise<void> {"
- **[[c3]]** `code` `src/daemon/threads/supervisor.ts:111` — "track(worker: Worker, name: string): void {"
- **[[c4]]** `code` `src/daemon/threads/supervisor.ts:136` — "createdCount(): number {"
- **[[c5]]** `code` `src/daemon/threads/session-pool.ts:169` — "async sweep(): Promise<void> {"
- **[[c6]]** `code` `src/daemon/index.ts:513` — "sessionPool.startSweeping();"
