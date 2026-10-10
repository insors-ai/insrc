<!-- insrc:artifact ISSUE-0d5775698fd042a7 -->

# Keep the daemon within the LMDB semaphore limit, and let it stop when a store operation fails

## Reproduction

Observed on 2026-10-10 on macOS 27, with the installed daemon (one process, started 06:04 UTC) after about four hours of use that included build-gate and review runs.

1. The store's write path failed. The daemon's log (/tmp/.insrc/daemon.log) holds this error three times, thrown from the LMDB library's write.js; one occurrence, at 09:34:35, directly follows the document summariser being set up, during normal work and not during shutdown:

`MDB_LOCK_FAILURE: Failed to get robust semaphore, increase max semaphore count by running 'sudo sysctl kern.sysv.semume=200' or build with robust mutexes disabled (see docs)`

2. The daemon then could not be stopped. The maintenance restart (the `daemon.shutdown` request) and the control script's restart (SIGTERM) each reported 'daemon did not stop within 30 s'. The socket was gone ('daemon not reachable: ENOENT') and the process stayed alive at 0% CPU; a sample showed its main thread inside Node's process-exit callback. It ended only on SIGKILL. Expected: the daemon stops on request.

3. While the daemon was in that state, two test files that open the live store aborted whole with SIGABRT, at the commits of the work then in hand and at the commit before them: src/analyze/explore/__tests__/freeform-probe-scope.test.ts and src/analyze/explore/__tests__/phase5-explorations-params.test.ts. The crash report shows the abort in LMDB's native code, in `ExtendedEnv::~ExtendedEnv` called from `EnvWrap::closeEnv`, on a pointer freed that was not allocated. With a fresh daemon both files pass (19 tests).

4. The limit cannot be raised on this system. `sysctl kern.sysv.semume` is 10; setting it to 200, 16 or 32 with sudo is refused with 'Invalid argument'. (The library's README suggests 50; that value was not tried.)

Not reproduced on demand: what sequence of daemon work brings a fresh daemon to the failure is not known.

## Root cause

Established: LMDB is built here with robust locks, which on macOS use System V semaphores with an undo entry per held lock, and macOS allows one process 10 such entries (`kern.sysv.semume`). The library's README says this limits the number of write transactions that can be open at once, and names the case of more than ten database environments each holding a write transaction. When the limit is reached a write fails with MDB_LOCK_FAILURE.

Not established: why this daemon reaches the limit. It opens one LMDB environment, in one place (the graph store module), with many named databases inside it, so the case the README names does not fit as written. The store module closes the environment in four places (after a failed open, on a reset, and on close); whether an environment that is opened again leaves the earlier one's entry held, or whether something else in the process holds entries, was not investigated. This record does not name a cause for the exhaustion; the design that follows has to find it first.

Second defect, established by reading: the daemon's shutdown waits for the work queue, then closes the store and the other connections in sequence, logs 'bye' and exits. A hard-exit timer guards only the wait for the queue: it is cleared, or has already called exit, by the time the process is in its exit callbacks. Nothing bounds the time the exit itself takes, so when the store's native close hangs or cannot take its lock the process stays alive with its socket already closed, and no request can reach it.

## Fix intent

The daemon does not exhaust the per-process limit of semaphore undo entries in normal use: the cause of the exhaustion is found and removed, with a test or a measurement that shows a long-running daemon's count of held entries staying bounded.

A failure of a store write for this reason is reported as what it is: the error names the limit and what holds the entries, where today a raw library error reaches the log.

The daemon always stops when asked. A shutdown that cannot close the store within a bounded time still ends the process, says in the log that it did so and why, and leaves the pid file and the socket in a state from which a start works.

The control paths say the truth: when the daemon did not stop, the maintenance restart and the control script do not leave it half down (socket gone, process alive) without saying so and without a way forward.

Not in scope: raising the system limit (it cannot be raised on this system), and building LMDB without robust locks (the daemon and test processes share the store, and that protection frees a lock when a process dies holding it).

## Citations

- **[[c1]]** `code` `src/db/graph/store.ts` — "root = open({"
- **[[c2]]** `code` `src/db/graph/store.ts` — "await inst.root.close();"
- **[[c3]]** `code` `src/daemon/index.ts` — "await closeGraphStore();"
- **[[c4]]** `code` `src/daemon/index.ts` — "log.warn({ ms: HARD_EXIT_MS }, 'shutdown: hard-exit backstop fired (queue drain stalled)');"
- **[[c5]]** `doc` `node_modules/lmdb/README.md` — "On MacOS, there is a default limit of 10 robust locked semaphores, which imposes a limit on the number of open write transactions (if you have over 10 database environments with a write transaction)."
- **[[c6]]** `step-output` `/tmp/.insrc/daemon.log on 2026-10-10: three occurrences of 'MDB_LOCK_FAILURE: Failed to get robust semaphore', thrown from lmdb/write.js:516; `sysctl kern.sysv.semume` = 10; the crash report ~/Library/Logs/DiagnosticReports/node-2026-10-10-131307.ips`
- **[[c7]]** `stakeholder` `The stakeholder's report of 2026-10-10: sysctl refused 200, 16 and 32 with 'Invalid argument'` — "tried 16,32 rejected all"
