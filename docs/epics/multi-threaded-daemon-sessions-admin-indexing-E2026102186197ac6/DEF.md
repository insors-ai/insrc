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

The insrc daemon serves every client — each Claude/Codex session's MCP server, the IDE plugins, the TUI and daemon-ctl — from a single JavaScript thread, and the index queue and all graph, vector and data-store access run on that same thread [[c1]] [[c2]]. Any synchronous work on behalf of one session therefore stalls every other client: on 2026-10-21 a chunked code review held the thread for minutes, other sessions' requests and liveness pings went unanswered (the socket refused connections once its accept queue filled), and another session, seeing its connections refused, took the daemon for hung and restarted it with daemon-ctl (whose start and restart stop any running daemon before starting a new one), losing in-flight work [[c3]] [[c4]]. Fixing individual hot spots removes known stalls but not the exposure: the next slow path in any session, or a heavy indexing pass, again freezes the whole daemon for everyone.

## 2. Functional requirements

- **E2026102186197ac6:FR001** — Admin requests (ping, daemon status, TUI queries, daemon-ctl control) are answered promptly while any session or the indexer is busy. _(A daemon that does not answer looks dead, and a client that restarts it loses every session's in-flight work [[c3]].)_
- **E2026102186197ac6:FR002** — A long-running request in one session does not delay the handling of requests from any other session. _(Stakeholder model: one thread per session [[c5]].)_
- **E2026102186197ac6:FR003** — Within one session, requests are handled one at a time in arrival order; a session's later request waits while its earlier long task runs. _(Stakeholder: cross-talk inside a session is problematic, so a session is blocked on its own thread [[c5]].)_
- **E2026102186197ac6:FR004** — Index-queue work (code indexing and document summaries) runs without blocking session or admin requests, and session work does not block indexing. _(Stakeholder model: one indexing thread [[c5]]; the queue runs on the shared thread today [[c1]].)_
- **E2026102186197ac6:FR005** — Graph, vector and data-store reads and writes remain consistent when issued from different threads, with the daemon still the sole owner of the stores. _(Daemon-owns-all-DB-access rule [[c6]]; LMDB lock behaviour has bitten this daemon before [[c7]].)_
- **E2026102186197ac6:FR006** — A failure on a session's thread is reported to that session and does not take down the daemon, the admin thread, the indexer or other sessions. _(Isolation is the point of the split; today one failure path affects all clients [[c3]].)_
- **E2026102186197ac6:FR007** — A session's thread is created on the session's first request and released when the session ends, and the daemon reports which threads exist and what each is doing. _(Operators need to see a busy session rather than infer a frozen daemon [[c3]].)_
- **E2026102186197ac6:FR008** — Existing clients (MCP server, VS Code and JetBrains plugins, TUI, daemon-ctl) keep working without change. _(The IPC contract is the only surface those clients consume [[c8]].)_

**s1:**

- **E2026102186197ac6:S001:FR001** — Every thread in the daemon can read and write the graph, vector and data stores with the same consistency guarantees a single thread has today.
- **E2026102186197ac6:S001:FR002** — The daemon remains the only process that opens the stores.

**s2:**

- **E2026102186197ac6:S002:FR001** — Every request method has one declared class: admin, session or indexing.
- **E2026102186197ac6:S002:FR002** — Admin-class requests are served by a dedicated admin thread that session and indexing work cannot block.

**s3:**

- **E2026102186197ac6:S003:FR001** — The index queue, with both its lanes, runs on one dedicated indexing thread.
- **E2026102186197ac6:S003:FR002** — Queue status and idle-waiting remain available to other threads.

**s4:**

- **E2026102186197ac6:S004:FR001** — Each client session (one client process, identified by the client label and process id its requests carry) has its own thread, created on its first request and released when the session ends.
- **E2026102186197ac6:S004:FR002** — A session's requests are handled serially in arrival order on that session's thread.
- **E2026102186197ac6:S004:FR003** — A failure inside one session's thread is contained to that session.

**s5:**

- **E2026102186197ac6:S005:FR001** — Daemon status reports every thread with its class, session, busy state, current method and elapsed time.
- **E2026102186197ac6:S005:FR002** — The daemon's liveness check distinguishes a busy daemon from a dead one.

## 3. Non-goals

- **Running work for one session in parallel (several of a session's requests at once).** — Stakeholder fixed: a session is serial on its own thread because intra-session cross-talk is problematic [[c5]].
- **Splitting the daemon into several OS processes or a distributed service.** — Stakeholder asked for threads in the daemon; the daemon remains the single owner of the stores [[c5]] [[c6]].
- **Changing the IPC wire protocol, socket path or method names, or removing or re-purposing any existing response field.** — The plugins and MCP server mirror the contract; a threading change must be invisible to them [[c8]].
- **Reworking individual slow code paths (e.g. review material building).** — Those are fixed separately (ISSUE-e940023a, ISSUE-2f4cb54c); this Epic removes the cross-session exposure, not specific hot spots [[c4]].
- **Changing how LLM provider calls are serialised or the model-tier routing.** — Provider-call discipline is a separate project rule [[c9]]; this Epic only changes which thread issues them.

## 4. Assumptions

- `med` A 'session' is one client process. Every request carries a self-reported client label and process id, and clients open a new connection per request (the CLI/TUI per call, the MCP server per step call), so a session spans many connections and is identified by its client label and process id, not by a connection. [[c12]]
- `low` The stores in use (the LMDB graph, the Lance vector tables, and the in-memory DuckDB query engine behind the db_file_* tools) can be used safely from more than one thread of the same process, or can be fronted by one owning thread; which applies per store is to be settled in design. [[c7]]
- `med` The 189 handlers the daemon serves (173 RPC and 16 stream handlers: those registered in main() plus the understanding routes merged into them) can be grouped into admin, session and indexing classes without ambiguity for nearly all of them. [[c1]]
- `high` The number of concurrent sessions is small (single user, a handful of agent sessions plus IDE and TUI), so one thread per session is affordable. [[c5]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | One thread per client session; work within a session is serial and a session is blocked on its own thread while its long task runs. | [[c5]] |
| `k2` | stakeholder | One admin thread serves ping/daemon.status, the TUI, daemon-ctl and other admin RPCs. | [[c5]] |
| `k3` | stakeholder | One indexing thread runs the index queue. | [[c5]] |
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

- **ac1:** Given the indexing thread is writing entities for a repo, when a session thread reads the same repo's graph at the same time, then the reader sees the graph either before or after each write transaction, never a partial one, neither thread errors, and the graph and vector stores keep today's ordering (vectors are written after the graph commit). _(operationalizes `k4`, `k7`)_
- **ac2:** Given two session threads each write a different artifact or config entry, when both writes complete, then both writes are durable and readable from every thread, including the admin thread. _(operationalizes `k4`, `k7`)_
- **ac3:** Given the daemon runs with several threads, when any client other than the daemon process tries to reach the stores, then it can do so only through daemon IPC, exactly as today. _(operationalizes `k4`, `k5`)_
- **ac4:** Given a write on one thread fails part-way, when other threads read afterwards, then none of the failed write's changes are visible. _(operationalizes `k7`)_

**Local constraints:**

- `lc1` (invariant) A failed write transaction must not commit partial changes (a previously seen store behaviour committed a throwing callback's writes). [[c11]]

### 6.2 E2026102186197ac6:S002 — Admin requests always answer

**User value:** `size: M`

Liveness pings, daemon status, the TUI and daemon-ctl get prompt answers even while sessions or the indexer are busy, so no client mistakes a busy daemon for a dead one and kills it.

**Depends on:** `s1`

**Extends:** [[c2]] [[c1]]

**Acceptance criteria:**

- **ac1:** Given one session's request is doing minutes of synchronous work, when a client sends a ping or daemon status request, then the request is answered promptly with the daemon's current state. _(operationalizes `k2`)_
- **ac2:** Given the indexer is processing a large indexing pass, when the TUI or daemon-ctl issues an admin request, then the request is answered promptly. _(operationalizes `k2`, `k3`)_
- **ac3:** Given an existing admin client built against today's IPC contract, when it connects and sends its usual admin requests, then it receives the same responses as before with no client change. _(operationalizes `k5`)_
- **ac4:** Given the daemon's request methods, when a request arrives, then it is classified as admin, session or indexing work, and every admin-class method is served by the admin thread. _(operationalizes `k2`)_

### 6.3 E2026102186197ac6:S003 — Indexing runs on its own thread

**User value:** `size: L`

Code indexing and document summaries proceed in the background without stalling any session or admin request, and a busy session does not stall indexing.

**Depends on:** `s1`

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given an indexing pass is in progress, when a session sends a request, then the session's request is handled without waiting for the indexing pass. _(operationalizes `k3`, `k1`)_
- **ac2:** Given a session thread is busy with a long task, when a file change enqueues indexing work, then the indexing work starts and completes without waiting for the session. _(operationalizes `k3`)_
- **ac3:** Given the index queue's existing lane ordering (document summaries yield to code indexing), when the queue runs on the indexing thread, then the same ordering and the same indexed results are produced as today. _(operationalizes `k3`, `k6`, `k7`)_
- **ac4:** Given a session or admin request that waits for indexing to become idle or reads queue status, when it runs on its own thread, then it gets the indexing thread's real state. _(operationalizes `k3`, `k5`)_

### 6.4 E2026102186197ac6:S004 — Each session runs on its own serial thread

**User value:** `size: XL`

A long task in one Claude/Codex or IDE session no longer freezes other sessions; inside a session, requests still run one at a time in order, so there is no cross-talk between a session's own tasks.

**Depends on:** `s1`, `s2`

**Extends:** [[c1]] [[c2]]

**Acceptance criteria:**

- **ac1:** Given two sessions are connected and session A starts a request that runs for minutes, when session B sends a request, then session B's request is handled and answered without waiting for session A. _(operationalizes `k1`)_
- **ac2:** Given session A has a long request running, when session A sends a second request, then the second request waits and runs only after the first completes, in arrival order. _(operationalizes `k1`, `k7`)_
- **ac3:** Given a client process sends its first request, when that request and the client's later requests are handled, then they all run, in order, on one thread belonging to that client's session, whichever connection each arrived on, and the thread is released when the session ends. _(operationalizes `k1`)_
- **ac4:** Given a session's request throws or its thread fails, when the failure happens, then that session receives an error, and the daemon, the admin thread, the indexer and every other session keep working. _(operationalizes `k1`, `k2`, `k3`)_
- **ac5:** Given a session thread makes model calls, when the session's request runs, then its provider calls stay serial with sequential awaits, as today. _(operationalizes `k6`)_
- **ac6:** Given an MCP step token (workflow, analyze, review, build) minted in an earlier turn, when the same session presents it in a later request, then the step resumes exactly as it does today. _(operationalizes `k5`, `k7`)_

### 6.5 E2026102186197ac6:S005 — See what each daemon thread is doing

**User value:** `size: M`

Operators and clients can see which threads exist, which session each serves and what each is busy with, so a busy session is visible as busy instead of looking like a frozen daemon, and stale-daemon checks stop killing healthy daemons.

**Depends on:** `s2`, `s4`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given the daemon has an admin thread, an indexing thread and several session threads, when a client asks for daemon status, then the response lists each thread, its class, the session it serves, whether it is busy, the method it is running and for how long. _(operationalizes `k2`)_
- **ac2:** Given one session thread has been busy for minutes, when a client or operator checks whether the daemon is alive, then the daemon answers that it is alive and reports the busy session, so the check gives no reason to stop or restart it. _(operationalizes `k2`)_
- **ac3:** Given existing status consumers (TUI, plugins), when they read daemon status, then every field they read today is still present with the same meaning. _(operationalizes `k5`)_

## 7. References

- **[[c1]]** `analyze-bundle` `src/daemon/index.ts:507-2099` — "main() registers 166 RPC handlers (const rpcHandlers: RpcHandlers at line 507) and 15 stream handlers (const streamHandlers: StreamHandlers at line 1906), merges the understanding routes (7 RPC, 1 str"
- **[[c2]]** `code` `src/daemon/server.ts:18-220` — "exports RpcHandler, StreamHandler, RpcHandlers, StreamHandlers, failureMessage and class IpcServer (members listen, close, attachedClients, disconnectClients, flushPendingWrites); each attached connec"
- **[[c3]]** `prior-artifact` `docs/standalone/stop-code-review-s-material-building-E20261021e940023a/ISSUE.md:7` — "Observed on 2026-10-21: between the subject resolving (09:20:42) and the adherence review being divided (09:30:33) the daemon logged nothing, held 100% CPU and refused socket connections (ECONNREFUSED"
- **[[c4]]** `prior-artifact` `docs/standalone/build-each-review-adapter-s-material-E202610212f4cb54c/ISSUE.md:7` — "Observed on 2026-10-21: the daemon froze at 100% CPU and refused connections from 15:35 for over 10 minutes"
- **[[c5]]** `stakeholder` `user 2026-10-21` — "for the multi-threaded approach, one thread per session, one thread for admin (like ping, TUI, etc.), one thread for indexing. cross-talk within a session can be problematic hence a session is blocked"
- **[[c6]]** `convention` `CLAUDE.md#key-architectural-rules` — "Daemon owns all DB access — CLI, MCP, and the IDE workbench communicate via IPC only."
- **[[c7]]** `code` `src/db/graph/store.ts:528-531` — "getGraphStore() returns the module-level _instance once open, or the shared _initPromise while opening: one GraphStore per process, reached from config storage, daemon RPC routes and code tools"
- **[[c8]]** `convention` `CLAUDE.md` — "IPC method names, socket path (~/.insrc/daemon.sock), and payload shapes stay in lock-step across the two repos via mirrored types."
- **[[c9]]** `convention` `CLAUDE.md#llm-provider-abstraction` — "Never Promise.all anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial for...of with sequential awaits."
- **[[c10]]** `convention` `CLAUDE.md#project-principles` — "Accuracy is primary; cost is the least priority."
- **[[c11]]** `prior-artifact` `ISSUE-5437d6e5` — "lmdb-js root.transaction commits a throwing callback's writes; fixed via childTransaction"
- **[[c12]]** `code` `src/shared/ipc-client.ts:46-55` — "rpc() opens a new socket per call (createConnection) and sends client: { label: 'cli', pid: process.pid }; src/mcp/forward-step.ts:115-121 likewise opens a socket per step.call with client: { label: '"

## 8. Open questions

- Item a2: the low-confidence assumption that each store (LMDB graph, Lance tables, in-memory DuckDB) can be used from several threads of one process, or must be fronted by one owning thread, is to be settled in design (Story s1).
- How a session's end is detected (its client process has exited, or it has been idle beyond a limit) is a design decision for Story s4.

## Resolved questions

- `q2f95abad` — Item a2: the low-confidence assumption that each store (LMDB graph, Lance tables, in-memory DuckDB) can be used from several threads of one process, or must be fronted by one owning thread, is to be settled in design (Story s1).
  - **resolved**: Verified policy per store, with semaphores (not owner threads) for stores that are not thread-safe: Story s1 establishes each store's threading contract. A store proven thread-safe is used directly from every thread. A store that is not thread-safe is guarded by a semaphore that every thread acquires before using it. Lock release must be guaranteed on every path (success, throw, cancellation, thread failure), and no lock is held in a way that can deadlock. The async access pattern is itself a consistency hazard: interleaving across awaits must not expose a partial operation to another caller. — Stakeholder decision 2026-10-21: async access can cause consistency issues; non-thread-safe stores are controlled via semaphores; lock release must be ensured or it will deadlock. _(2026-10-21T13:05:36.132Z)_

## Citations

- **[[c1]]** `analyze-bundle` `src/daemon/index.ts:507-2099` — "main() registers 166 RPC handlers (const rpcHandlers: RpcHandlers at line 507) and 15 stream handlers (const streamHandlers: StreamHandlers at line 1906), merges the understanding routes (7 RPC, 1 str"
- **[[c2]]** `code` `src/daemon/server.ts:18-220` — "exports RpcHandler, StreamHandler, RpcHandlers, StreamHandlers, failureMessage and class IpcServer (members listen, close, attachedClients, disconnectClients, flushPendingWrites); each attached connec"
- **[[c3]]** `prior-artifact` `docs/standalone/stop-code-review-s-material-building-E20261021e940023a/ISSUE.md:7` — "Observed on 2026-10-21: between the subject resolving (09:20:42) and the adherence review being divided (09:30:33) the daemon logged nothing, held 100% CPU and refused socket connections (ECONNREFUSED"
- **[[c4]]** `prior-artifact` `docs/standalone/build-each-review-adapter-s-material-E202610212f4cb54c/ISSUE.md:7` — "Observed on 2026-10-21: the daemon froze at 100% CPU and refused connections from 15:35 for over 10 minutes"
- **[[c5]]** `stakeholder` `user 2026-10-21` — "for the multi-threaded approach, one thread per session, one thread for admin (like ping, TUI, etc.), one thread for indexing. cross-talk within a session can be problematic hence a session is blocked"
- **[[c6]]** `convention` `CLAUDE.md#key-architectural-rules` — "Daemon owns all DB access — CLI, MCP, and the IDE workbench communicate via IPC only."
- **[[c7]]** `code` `src/db/graph/store.ts:528-531` — "getGraphStore() returns the module-level _instance once open, or the shared _initPromise while opening: one GraphStore per process, reached from config storage, daemon RPC routes and code tools"
- **[[c8]]** `convention` `CLAUDE.md` — "IPC method names, socket path (~/.insrc/daemon.sock), and payload shapes stay in lock-step across the two repos via mirrored types."
- **[[c9]]** `convention` `CLAUDE.md#llm-provider-abstraction` — "Never Promise.all anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial for...of with sequential awaits."
- **[[c10]]** `convention` `CLAUDE.md#project-principles` — "Accuracy is primary; cost is the least priority."
- **[[c11]]** `prior-artifact` `ISSUE-5437d6e5` — "lmdb-js root.transaction commits a throwing callback's writes; fixed via childTransaction"
- **[[c12]]** `code` `src/shared/ipc-client.ts:46-55` — "rpc() opens a new socket per call (createConnection) and sends client: { label: 'cli', pid: process.pid }; src/mcp/forward-step.ts:115-121 likewise opens a socket per step.call with client: { label: '"
