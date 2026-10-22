<!-- insrc:artifact DEF-86197ac660732ceb -->

# Epic: multi-threaded-daemon-sessions-admin-indexing

## Summary

**Flavor:** enhancement

The daemon stays responsive to everyone no matter what one session is doing. Each client session runs its work on its own thread, administration (liveness, status, the TUI, daemon control) always answers, and indexing proceeds without blocking sessions. A slow or stuck task now costs only the session that started it.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)
8. [Open questions](#8-open-questions)

## 1. Problem

The insrc daemon serves every client — each Claude/Codex session's MCP server, the IDE plugins, the TUI and daemon-ctl — from a single JavaScript thread, and the index queue and all graph, vector and data-store access run on that same thread [[c1]] [[c2]]. Any synchronous work on behalf of one session therefore stalls every other client: on 2026-10-21 a chunked code review held the thread for minutes, other sessions' requests and liveness pings went unanswered (the socket refused connections once its accept queue filled), and another session, seeing its connections refused, took the daemon for hung and restarted it with daemon-ctl (whose start and restart stop any running daemon before starting a new one [[c14]]), losing in-flight work [[c3]] [[c4]]. Fixing individual hot spots removes known stalls but not the exposure: the next slow path in any session, or a heavy indexing pass, again freezes the whole daemon for everyone.

## 2. Functional requirements

- **E2026102186197ac6:FR001** — Admin requests (ping, daemon status, TUI queries, daemon-ctl control) are answered promptly while any session or the indexer is busy. _(A daemon that does not answer looks dead, and a client that restarts it loses every session's in-flight work [[c3]].)_
- **E2026102186197ac6:FR002** — A long-running request in one session does not delay the handling of requests from any other session. _(Stakeholder model: one thread per session [[c5]].)_
- **E2026102186197ac6:FR003** — Within one session, requests are handled one at a time in arrival order; a session's later request waits while its earlier long task runs. _(Stakeholder: cross-talk inside a session is problematic, so a session is blocked on its own thread [[c5]].)_
- **E2026102186197ac6:FR004** — Index-queue work (code indexing and document summaries) runs without blocking session or admin requests, and session work does not block indexing. _(Stakeholder model: indexing on its own threads, code and document summaries apart with summaries yielding to code [[c5]]; the queue runs on the shared thread today [[c1]].)_
- **E2026102186197ac6:FR005** — Graph, vector and data-store reads and writes remain consistent when issued from different threads, with the daemon still the sole owner of the stores. _(Daemon-owns-all-DB-access rule [[c6]]; LMDB lock behaviour has bitten this daemon before [[c7]].)_
- **E2026102186197ac6:FR006** — A failure on a session's thread is reported to that session and does not take down the daemon, the admin thread, the indexer or other sessions. _(Isolation is the point of the split; today one failure path affects all clients [[c3]].)_
- **E2026102186197ac6:FR007** — A session's thread is created on the session's first request and released when the session ends, and the daemon reports which threads exist and what each is doing. _(Operators need to see a busy session rather than infer a frozen daemon [[c3]].)_
- **E2026102186197ac6:FR008** — Every existing client of the daemon socket keeps working without change, including the MCP server, the VS Code and JetBrains plugins, the TUI and daemon-ctl. _(The IPC contract is the only surface those clients consume [[c8]]. The socket's clients are anchored in [[c19]]; only 'cli' and 'mcp' self-report a label.)_

**s1:**

- **E2026102186197ac6:S001:FR001** — Every thread in the daemon can read and write the graph, vector and data stores with the same consistency guarantees a single thread has today.
- **E2026102186197ac6:S001:FR002** — The daemon remains the only process that opens the stores.

**s2:**

- **E2026102186197ac6:S002:FR001** — Every request method has one declared class: admin, session or indexing.
- **E2026102186197ac6:S002:FR002** — Admin-class requests are served by a dedicated admin thread that indexing work cannot block.
- **E2026102186197ac6:S002:FR003** — Code indexing runs on one dedicated thread and document summaries on another, the summaries yielding to code indexing as today.
- **E2026102186197ac6:S002:FR004** — Queue status and idle-waiting remain available to other threads.
- **E2026102186197ac6:S002:FR005** — Graph-store compaction runs as idle maintenance under an exclusive daemon maintenance lock; while it holds the lock every request except the liveness check is refused with the maintenance activity and reason.

**s3:**

- **E2026102186197ac6:S003:FR001** — Each client session (one client process, identified by the client label and process id its requests carry) has its own thread, created on its first request and released when the session ends.
- **E2026102186197ac6:S003:FR002** — A session's requests are handled serially in arrival order on that session's thread.
- **E2026102186197ac6:S003:FR003** — A failure inside one session's thread is contained to that session.
- **E2026102186197ac6:S003:FR004** — Session work runs on session threads, never on the main thread that reads the socket.

**s4:**

- **E2026102186197ac6:S004:FR001** — The main thread runs no request handler; it routes, supervises and coordinates shutdown.
- **E2026102186197ac6:S004:FR002** — Daemon status reports every thread with its class, session, busy state, current method and elapsed time.
- **E2026102186197ac6:S004:FR003** — The daemon's liveness check distinguishes a busy daemon from a dead one.

## 3. Non-goals

- **Running work for one session in parallel (several of a session's requests at once).** — Stakeholder fixed: a session is serial on its own thread because intra-session cross-talk is problematic [[c5]].
- **Splitting the daemon into several OS processes or a distributed service.** — Stakeholder asked for threads in the daemon; the daemon remains the single owner of the stores [[c5]] [[c6]].
- **Changing the IPC wire protocol, socket path or method names, or removing or re-purposing any existing response field.** — The plugins and MCP server mirror the contract; a threading change must be invisible to them [[c8]].
- **Reworking individual slow code paths (e.g. review material building).** — Those are fixed separately (ISSUE-e940023a, ISSUE-2f4cb54c); this Epic removes the cross-session exposure, not specific hot spots [[c4]].
- **Changing how LLM provider calls are serialised or the model-tier routing.** — Provider-call discipline is a separate project rule [[c9]]; this Epic only changes which thread issues them.

## 4. Assumptions

- `med` A 'session' is one client process. The CLI/TUI ('cli', src/shared/ipc-client.ts) and the MCP server ('mcp', src/mcp/forward-step.ts and src/mcp/daemon-stream.ts) send a self-reported client label and process id with every request, and clients open a new connection per request, so a session spans many connections and is identified by its client label and process id, not by a connection. The field is optional on the wire: a request without a valid identity (for example from a client that does not send it) belongs to no session and is served on one shared unattributed thread. [[c12]]
- `high` The stores in use can be used from more than one thread of the daemon process: Story s1 verified it [[c17]]. The LMDB graph environment (opened once per process) and the Lance tables (with read consistency checked on every read) are used directly from every thread; the in-memory DuckDB query engine behind the db_file_* tools is used through the store guard with one permit. [[c17]]
- `med` Every handler the daemon serves (every key of rpcHandlers and streamHandlers in main(), including the makeUpdateHandlers spread and the understanding routes merged in at src/daemon/index.ts:1994-1995 [[c1]]) can be given exactly one class: admin, session or indexing. The class table lists every one, and a test enumerates the runtime key sets of both tables after all merges and fails on any served method without exactly one class. Story s2 creates both: the method-to-class table next to MethodClass (src/daemon/threads/channel.ts) and the coverage test. [[c1]]
- `high` The number of concurrent sessions is small (single user, a handful of agent sessions plus IDE and TUI), so one thread per session is affordable. [[c5]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | One thread per client session; work within a session is serial and a session is blocked on its own thread while its long task runs. | [[c5]] |
| `k2` | stakeholder | One admin thread serves ping/daemon.status, the TUI, daemon-ctl and other admin RPCs. | [[c5]] |
| `k3` | stakeholder | Indexing runs on two threads of its own: one for code indexing and one for document summaries, and a document summary starts only while code indexing is idle (today's lane yielding). | [[c13]] |
| `k4` | invariant | The daemon remains the sole owner of all LMDB, Lance and DuckDB access; clients never open the stores. | [[c6]] |
| `k5` | contract | The IPC contract (socket path, JSON-RPC method names, request shapes, and every existing response field with its meaning) is unchanged for existing clients; responses may gain new fields. | [[c8]] |
| `k6` | convention | Never Promise.all calls that reach an LLM provider; provider calls stay serial with sequential awaits. | [[c9]] |
| `k7` | convention | Accuracy is primary: no change may drop or reorder a session's results to gain throughput. | [[c10]] |

## 6. Stories

### 6.1 E2026102186197ac6:S001 — Stores usable consistently from several daemon threads

**User value:** `size: L`

Admin, session and indexing threads can all read and write the graph, vector and data stores, the daemon stays their only owner, and no thread ever sees a torn or lost write, so splitting the work across threads costs no correctness.

**Extends:** [[c7]]

**Acceptance criteria:**

- **ac1:** Given the indexing thread is writing entities for a repo, when a session thread reads the same repo's graph at the same time, then the reader sees the graph either before or after each write transaction, never a partial one, neither thread errors, and the graph and vector stores keep today's ordering (vectors are written after the graph commit) [[c16]]. _(operationalizes `k4`, `k7`)_
- **ac2:** Given two session threads each write a different artifact or config entry, when both writes complete, then both writes are durable and readable from every thread, including the admin thread. _(operationalizes `k4`, `k7`)_
- **ac3:** Given the daemon runs with several threads, when any client other than the daemon process tries to reach the stores, then it can do so only through daemon IPC, exactly as today. _(operationalizes `k4`, `k5`)_
- **ac4:** Given a write on one thread fails part-way, when other threads read afterwards, then none of the failed write's changes are visible. _(operationalizes `k7`)_

**Local constraints:**

- `lc1` (invariant) A failed write transaction must not commit partial changes (a previously seen store behaviour committed a throwing callback's writes). [[c11]]

### 6.2 E2026102186197ac6:S002 — Admin and indexing run on their own threads

**User value:** `size: L`

Liveness pings, daemon status, the TUI and daemon-ctl get prompt answers during an indexing pass, and code indexing and document summaries run in the background without stalling requests, so a busy indexer no longer makes the daemon look dead.

**Depends on:** `s1`

**Extends:** [[c1]] [[c2]]

**Acceptance criteria:**

- **ac1:** Given the indexer is processing a large indexing pass, when the TUI or daemon-ctl issues an admin request, then the request is answered promptly. _(operationalizes `k2`, `k3`)_
- **ac2:** Given an existing admin client built against today's IPC contract, when it connects and sends its usual admin requests, then it receives the same responses as before with no client change. _(operationalizes `k5`)_
- **ac3:** Given the daemon's request methods, when a request arrives, then it is classified as admin, session or indexing work; every admin-class method is served by the admin thread and every indexing-class method by the code-indexing thread, while session-class methods stay on the main thread as today only until Story s3 moves them to session threads. _(operationalizes `k2`, `k3`)_
- **ac4:** Given an indexing pass is in progress, when a session sends a request, then the session's request is handled without waiting for the indexing pass. _(operationalizes `k3`, `k1`)_
- **ac5:** Given a session thread is busy with a long task, when a file change enqueues indexing work, then the indexing work starts and completes without waiting for the session. _(operationalizes `k3`)_
- **ac6:** Given code indexing and document summaries on their two threads, when both have work, then a document summary starts only while code indexing is idle, and the order of work and the indexed results equal today's single-thread queue for the same input. _(operationalizes `k3`, `k6`, `k7`)_
- **ac7:** Given a session or admin request that waits for indexing to become idle or reads queue status, when it runs on its own thread, then it gets the real state of the code-indexing and document-summary threads. _(operationalizes `k3`, `k5`)_
- **ac8:** Given the daemon has been idle for 30 minutes and the graph store has at least 25% and 256 MB reclaimable, or a client requests daemon.compact while indexing is idle, when maintenance compaction runs, then maintenance holds the daemon's maintenance lock exclusively with its activity and reason; every request other than daemon.status is refused at once with that activity and reason (it is not queued), daemon.status answers throughout and reports the maintenance, requests already running finish before compaction starts, no write is lost, and daemon.compact's responses (its result, and today's refusal while indexing is busy) are unchanged [[c18]]. _(operationalizes `k4`, `k5`, `k7`)_

### 6.3 E2026102186197ac6:S003 — Each session runs on its own serial thread

**User value:** `size: XL`

A long task in one Claude/Codex or IDE session no longer freezes other sessions; inside a session, requests still run one at a time in order, so there is no cross-talk between a session's own tasks. Admin requests are also answered while a session's request does minutes of synchronous work, because session work no longer runs on the thread that reads the socket.

**Depends on:** `s1`, `s2`

**Extends:** [[c1]] [[c2]]

**Acceptance criteria:**

- **ac1:** Given two sessions are connected and session A starts a request that runs for minutes, when session B sends a request, then session B's request is handled and answered without waiting for session A. _(operationalizes `k1`)_
- **ac2:** Given session A has a long request running, when session A sends a second request, then the second request waits and runs only after the first completes, in arrival order. _(operationalizes `k1`, `k7`)_
- **ac3:** Given a client process sends its first request, when that request and the client's later requests are handled, then they all run, in order, on one thread belonging to that client's session, whichever connection each arrived on, and the thread is released when the session ends. _(operationalizes `k1`)_
- **ac4:** Given a session's request throws or its thread fails, when the failure happens, then that session receives an error, and the daemon, the admin thread, the indexer and every other session keep working. _(operationalizes `k1`, `k2`, `k3`)_
- **ac5:** Given a session thread makes model calls, when the session's request runs, then its provider calls stay serial with sequential awaits, as today. _(operationalizes `k6`)_
- **ac6:** Given an MCP step token (workflow, analyze, review, code-review) minted in an earlier turn, when the same session presents it in a later request, then the step resumes exactly as it does today. _(operationalizes `k5`, `k7`)_
- **ac7:** Given one session's request is doing minutes of synchronous work, when a client sends a ping or daemon status request, then the request is answered promptly with the daemon's current state. _(operationalizes `k2`)_

### 6.4 E2026102186197ac6:S004 — The main thread is a controller, and each thread's work is visible

**User value:** `size: M`

The main thread only routes requests and supervises threads, so nothing a handler does can stop the daemon reading the socket; operators and clients can see which threads exist, which session each serves and what each is busy with, so a busy session is visible as busy instead of looking like a frozen daemon, and stale-daemon checks stop killing healthy daemons.

**Depends on:** `s2`, `s3`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given the threaded daemon, when any request is handled, then the main thread runs no request handler: it reads the socket, classifies, forwards, writes replies, supervises the worker threads and coordinates shutdown. _(operationalizes `k1`, `k2`, `k3`)_
- **ac2:** Given any worker thread (admin, code indexing, document summaries or a session) fails, when the failure happens, then its in-flight requests get an error, its store locks are released, it is replaced, and the other threads keep working. _(operationalizes `k1`, `k2`, `k3`)_
- **ac3:** Given a shutdown signal, a daemon.shutdown request or a store that lost its locks, when the daemon stops, then it stops as today: queue drain and store close on a clean stop, no store close and an end by SIGKILL after the last line when the locks are lost (src/daemon/shutdown.ts: the locks-lost branch ends through endAfterStoreFailure) [[c15]]. _(operationalizes `k4`, `k5`)_
- **ac4:** Given the daemon has an admin thread, the code-indexing and document-summary threads and several session threads, when a client asks for daemon status, then the response lists each thread, its class, the session it serves, whether it is busy, the method it is running and for how long. _(operationalizes `k2`)_
- **ac5:** Given one session thread has been busy for minutes, when a client or operator checks whether the daemon is alive, then the daemon answers that it is alive and reports the busy session, so the check gives no reason to stop or restart it. _(operationalizes `k2`)_
- **ac6:** Given existing status consumers (TUI, plugins), when they read daemon status, then every field they read today is still present with the same meaning. _(operationalizes `k5`)_

## 7. References

- **[[c1]]** `analyze-bundle` `src/daemon/index.ts:507-1995` — "main() builds const rpcHandlers: RpcHandlers (line 507), which also receives daemon.update and daemon.updateOutcome from the makeUpdateHandlers spread (line 1670), and const streamHandlers: StreamHand"
- **[[c2]]** `code` `src/daemon/server.ts:39-121` — "exports RpcHandler (:39), StreamHandler (:42), RpcHandlers (:48), StreamHandlers (:49), failureMessage (:71) and class IpcServer (:79), whose members include flushPendingWrites (:106) and disconnectCl"
- **[[c3]]** `prior-artifact` `docs/standalone/stop-code-review-s-material-building-E20261021e940023a/ISSUE.md:7` — "Observed on 2026-10-21: between the subject resolving (09:20:42) and the adherence review being divided (09:30:33) the daemon logged nothing, held 100% CPU and refused socket connections (ECONNREFUSED"
- **[[c4]]** `prior-artifact` `docs/standalone/build-each-review-adapter-s-material-E202610212f4cb54c/ISSUE.md:7` — "Observed on 2026-10-21: the daemon froze at 100% CPU and refused connections from 15:35 for over 10 minutes"
- **[[c5]]** `stakeholder` `user 2026-10-21` — "for the multi-threaded approach, one thread per session, one thread for admin (like ping, TUI, etc.), one thread for indexing. cross-talk within a session can be problematic hence a session is blocked"
- **[[c6]]** `convention` `CLAUDE.md#key-architectural-rules` — "Daemon owns all DB access — CLI, MCP, and the IDE workbench communicate via IPC only."
- **[[c7]]** `code` `src/db/graph/store.ts:564-572` — "getGraphStore() returns the module-level _instance once open, or the shared _initPromise while opening: one GraphStore per process, reached from config storage, daemon RPC routes and code tools"
- **[[c8]]** `convention` `CLAUDE.md` — "IPC method names, socket path (~/.insrc/daemon.sock), and payload shapes stay in lock-step across their consumers via mirrored types: existing names, shapes and the socket stay unchanged; new methods "
- **[[c9]]** `convention` `CLAUDE.md#llm-provider-abstraction` — "Never Promise.all anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial for...of with sequential awaits."
- **[[c10]]** `convention` `CLAUDE.md#project-principles` — "Accuracy is primary; cost is the least priority."
- **[[c11]]** `prior-artifact` `ISSUE-5437d6e5` — "lmdb-js root.transaction commits a throwing callback's writes; fixed via childTransaction"
- **[[c12]]** `code` `src/shared/ipc-client.ts:46-55` — "rpc() opens a new socket per call (createConnection) and sends client: { label: 'cli', pid: process.pid }; src/mcp/forward-step.ts:115-121 likewise opens a socket per step.call with client: { label: '"
- **[[c13]]** `code` `src/daemon/queue.ts:301-318` — "get isIndexIdle(): boolean { return this.lanes.index.inFlight === null && this.lanes.index.jobs.length === 0; } ... waitForIndexIdle(): Resolves once the index lane has no job running and none queued "
- **[[c14]]** `code` `scripts/daemon-ctl.sh:259-263` — "# Stop a stale daemon first + wait for full drain. if [ -f "$PID_FILE" ] && ps -p ... log "stopping stale daemon (pid ...)" signal_stop; wait_for_daemon_stop || force_stop_daemon"
- **[[c15]]** `code` `src/daemon/shutdown.ts:64-71` — "export function endAfterStoreFailure(reason, health, deps) { clearPid; append the last line; deps.killSelf(); }  (killSelf = process.kill(process.pid, 'SIGKILL'))"
- **[[c16]]** `code` `src/db/entities.ts:223-330` — "upsertEntities: await withWriteTxn(s => { ... }) commits the graph rows (line 223); then '// Push vectors to Lance after the LMDB commit' (line 298) ... await lance.addEntityEmbeddings(adds) (line 324"
- **[[c17]]** `code` `src/daemon/threads/__tests__/worker-stores.test.ts` — "s1 t10: a reader on one thread sees only whole LMDB transactions while a worker writes, and vectors never precede their graph row; two workers' artifact-vector and config writes are read back from a t"
- **[[c18]]** `prior-artifact` `docs/standalone/add-cross-thread-named-lock-framework-E20261022afcfa027/S001/LLD.md` — "A named-lock framework that every thread of the daemon shares, shaped like the Web Locks API: shared and exclusive modes, ifAvailable (no-wait) requests that report the holder's activity and reason, w"
- **[[c19]]** `code` `scripts/daemon-ctl.sh:226-245` — "Socket clients today: the TUI/CLI and the VS Code extension through rpc() (src/shared/ipc-client.ts:46-55, label 'cli'); the MCP server (src/mcp/forward-step.ts:120, src/mcp/daemon-stream.ts:137, labe"

## 8. Open questions

- How a session's end is detected (its client process has exited, or it has been idle beyond a limit) is a design decision for Story s3 (the session pool).
