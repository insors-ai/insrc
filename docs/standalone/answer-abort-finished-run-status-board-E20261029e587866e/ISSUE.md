<!-- insrc:artifact ISSUE-e587866ef17ae15a -->

# Answer the abort of a finished run the status board evicted as the single-thread daemon does

## Reproduction

With daemon threads on (the default), start a detached workflow run from session A and let it finish. Then let more than 64 runs be recorded across all session workers, so the status board evicts A's finished run while A's worker still keeps it. Send `workflow.run.abort` with that run's id from session B. Observed: `{ ok: false }`. Expected: `{ ok: true }`, which is what a single-thread daemon answers for a finished run it still holds. The reply flag is the only difference; the run is already finished, so nothing is left running.

## Root cause

The status board keeps at most MAX_RUNS (64) run records across every owner thread and drops the oldest finished ones once it is over that limit (src/daemon/threads/status-board.ts:137-142). Each worker keeps its own run map with its own limit of 64 (src/daemon/workflow-run-registry.ts:226-234). So the board can forget a run its owner worker still holds. The router finds the thread that owns an abort's run from the board (src/daemon/threads/router.ts:258-261). With no board record there is no owner, so the abort falls through to the asking session's own worker (src/daemon/threads/router.ts:272-276). That worker never had the run, and `abortWorkflowRun` answers `{ ok: false }` for a run it does not know (src/daemon/workflow-run-registry.ts:216-218). The owner would have found the run and answered `{ ok: true }` (src/daemon/workflow-run-registry.ts:219-221).

## Fix intent

An abort of a finished run gets the same answer with threads on as with threads off for as long as its owner worker still holds the run: `{ ok: true }`, and the run is left unchanged. An abort of a run that no thread holds still answers `{ ok: false }`. Running runs, which are never evicted, keep today's routing.

## Citations

- **[[c1]]** `code` `src/daemon/threads/status-board.ts:137` — "if (this.runs.size <= MAX_RUNS) return;"
- **[[c2]]** `code` `src/daemon/threads/status-board.ts:78` — "export const MAX_RUNS = 64;"
- **[[c3]]** `code` `src/daemon/threads/router.ts:258` — "const ownerOf = request.method === 'workflow.run.abort' ? this.runOwner"
- **[[c4]]** `code` `src/daemon/workflow-run-registry.ts:218` — "if (state === undefined) return { ok: false };"
- **[[c5]]** `code` `src/daemon/workflow-run-registry.ts:226` — "function gc(): void {"
