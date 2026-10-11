<!-- insrc:artifact LLD-c2ba6fa62a148ed1-s4 -->

# LLD: E20261011c2ba6fa6:S004

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**HLD base run:** `wf-1791697214822-7bombm`
**HLD effective hash:** `fa332202b032...`

The daemon's store failed, and the daemon then could not be stopped, because another process that had the live store open closed it and removed the store's locks. This Story makes the store refuse the live path to every process but the daemon, moves the one production use from another process (the MCP server's lookup cache) behind daemon requests, and gives the two tests that reached the live store a temporary one. A store failure is recorded once with its true cause and shown in the daemon's status, and a stop always ends: the daemon ends itself at once when it knows its store has failed, and the control script and the CLI's stop force the end when a stop overruns.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-c2ba6fa62a148ed1** § 2. Framework summary

**Rollout phase:** Phase A — a daemon that stays up and reads that tell the truth

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The rule that a relationship with an absent target becomes pending instead of being skipped, at each of the six places in src/db/relations.ts where one is lost today (the resolved write's skip on a missing endpoint and its skip on a kind with no byte, promoteToResolved, promoteResolvedBatch, and the pending write's discard of a row without its file or repository and of a row whose repository is not registered), each either kept as pending or counted as unwritable with a reason; the set of files whose parse or commit failed in a full index, persisted with their paths until they next commit; which fields of the state are recounted on open and which are persisted and carried over; the classification of a pending relationship as awaiting-target, ambiguous or no-candidate, with the external-service rows classed apart and the two endpoint passes counted in when a full index is finished; the class is stored on the pending row itself, in its existing free-form record, so no stored form changes, a row the cross-file pass has not yet attempted counts as awaiting-target, and the recount on open reads the stored class and does not run resolution again; the extension of the cross-file pass to complete relationships awaiting a target by id, for imports and the other code-symbol kinds as well as calls and inheritance, and to follow a re-exporting file to the function it re-exports; the lookup of pending rows by the id they await, with its migration step, and the pass after a file event visiting the rows that await an entity of the files just committed; the change of the reindex request so that it deletes the repository's rows in the graph store and the vector store and builds them again from every file, in place of today's skip of unchanged files, with no separate repair request, returning to pending the relationships that other repositories hold into the deleted entities, and its queuing by the migration for every repository indexed before this change, which starts as not complete; the storing of the repository entity so that the manifest step's dependency relationships are written; the measurement on this repository, before and after a repair, of the awaiting-target, ambiguous, no-candidate and unwritable counts, with unwritable expected to be zero; the IndexState row, its migration step, its recount on open, and the derivation of repository status from it, as a completeness field returned beside the unchanged status by the daemon's status and stats requests and shown in the CLI's repository pane and in both editor plugins; and the analyzer's read of it: an analyzer lookup that reads relationships of a repository that is not complete says so in its result, with the counts, so that an answer over an incomplete graph is not returned as a plain fact. The choice, in this Story's design, of the function reached only through a re-exporting file that the repair is measured on, since the issue's own example (pickScope) has been removed from the source. Raising the log level of a refused relationship from debug is internal. Until Story s2 lands, s1 applies its rule inside the existing separate writes. — owns `sc1`
- `s2`: The extension of the existing whole-file replacement into the file commit (relationships and pending rows in the same transaction as entities; outgoing relationships of surviving entities replaced, not only those of entities that disappeared; incoming relationships of a removed entity returned to pending), the move of the indexer's refresh and delete paths and of the clean-up pass's removal of a stored file onto it, and the retirement of the separate delete-then-upsert sequence in the indexer. The handling of vectors after the commit: writing the entity row with its embedding marker empty and setting it in a second transaction only after the vector write succeeds, counting an entity with an empty marker in IndexState, comparing entity ids with the vector table on open in both directions, so that a vector left behind by a failed removal is deleted before a plain insert can meet it, and the extension of the existing reembed job to run on daemon start and after an index, with a vector write for an entity whose marker is empty made an upsert, except for an entity first allocated in the same commit, which keeps the plain insert. Three things in that job change with it: it applies the embed step's own selection instead of forcing every entity, so empty-body entities (external endpoints, module stubs) stay unselected and uncounted; its update of an embedding writes the vector first and sets the marker in a second transaction, where today it sets the marker first; and the marker carries the model of the backend that is active, not one fixed name. Which entities count as unembedded (those the embed step selects) and the separate recorded reason when the embedding backend is unavailable. The count of a file whose commit fails on a file event. The queue rule that index jobs go ahead of other jobs and that a long job yields between its units, so that a commit is not held behind a model pass. How a reader sees the old or the new set during a commit is the store's ordinary transaction isolation and needs no new mechanism. — owns `sc2`
- `s3`: The by-file and by-repository index of entity rows, its migration step that builds it for an existing store, and its upkeep. No single entity-row write exists today: there are seven raw put and remove sites across src/db/entities.ts and src/db/graph/migrations.ts, and the existing name index is kept in step by a helper each site must remember to call. This Story introduces one put and one remove function for entity rows that maintain the name index and the new index together, routes every raw site through them, and adds a test that fails when a raw put or remove appears outside them. Upkeep therefore sits beneath every caller, so that neither today's writers nor the file commit need to know of it and this Story does not depend on s2. The two reads (findEntitiesByFile, listEntitiesForRepo) keep their results and their callers; a new existence check answers whether a repository holds any entity, and the analyzer's scope check uses it.
- `s5`: The refusal, with a named error and its own code, of a search or analyze request about a repository whose status is indexing, at the analyzer's scope check and at the daemon's search requests, carrying the status and how far the run has got (files done of files selected, and when it began), read from the indexer's running job; the tools that rest on the analyzer (the workflow steps, triage, code review) pass that error on as it is. The order of the analyzer's run: the refusal of a scope the index does not hold comes before a size is announced, or the announcement says the size could not be counted. The named cause and error code for a failed read of the last-indexed time and for a failed lookup, and the three other defects of ISSUE-e2bcadd9 (the wrong provider named, the scope resolved before the cache, and failure text matched inside echoed output). This Story does not read IndexState: it works with the checks the analyzer has today, so that it stays independent of s1.
- `s6`: The in-process matcher of the gitignore grammar over nested ignore files and its conformance test against git; the move onto the one filter of every site that reads the list today in src/indexer/index.ts (the full walk, the start-up scan for changed files, the file event, the clean-up pass, and the two places that seed the list when a repository is registered), of the watcher, and of the analyzer's reader, its two exploration walkers and its infra walker (src/analyze/runtimes/infra/_shared.ts), each of which has its own list of names today, and of the indexer's source-root detection (src/indexer/source-roots.ts), whose own list would otherwise hide a package in a directory the filter includes; a search of the source for such lists found five more, in the daemon's four file-search tools (glob, grep, list-dir, recent under src/daemon/tools/builtins/search) and in the review probe (src/workflow/review/probe.ts), which search the working tree as text, do not decide what the index holds, and are deliberately left as they are; the filter keeps answering for a directory that holds an included file, as the analyzer's reader does now; the retirement of the bare-name list and of the ignore entry in the repository's .insrc config; the two built-in exclusions (generated or minified files, the .insrc directory) applied inside the filter so that the full walk and the file event no longer differ on them; the handling of a change to an ignore file as an event that removes and adds files, and the comparison by content hash of the clone's exclude file and the global ignore file, which the watcher cannot see, whenever the filter is used; the queued step that proposes a root ignore file with the cheap-tier model when a repository is added without one, its fallback, and the rule that an existing file is never written. Two points were decided by the stakeholder: the filter honours all three of git's ignore sources (the .gitignore files, the clone's exclude file, the user's global ignore file), and a file git tracks is indexed even when a rule matches it, so the filter takes git's list of tracked files as an input and a plain folder is filtered by the rules alone. — owns `sc4`
- `s7`: The one-byte encoding of evidence as the value of a relationship row; the points in the per-file resolver and the cross-file pass that decide 'extracted' or 'inferred' ('chosen' is reserved and not written, since an ambiguous relationship stays pending with its candidates); the passing of evidence as an argument to the store's resolved write and promote operations, so that the two endpoint passes write 'inferred' and the manifest step writes 'extracted' and no relationship written after this change reads 'unknown'; the carrying of evidence through the store's traversal reads and the daemon's caller and callee requests; the marking of inferred and chosen relationships in the analyzer's lookups and answers. No migration rewrites existing rows, since an empty value reads as 'unknown'. — owns `sc3`
- `s8`: The grouping of a complete repository's code entities into subsystems, its determinism, the tables for membership, connections and summaries and their migration step; the queued pass and its trigger on a new generation; the cheap-tier summary of a subsystem whose membership changed; the daemon request that returns subsystems; the addition of subsystem context to the analyzer's context builder; the statement that groups rest on an incomplete or older graph. Which relationships count toward grouping, and with what weight by evidence, is decided here.
- `s9`: One reader per added language (Rust, C#, C, C++) in the existing parser registry with a guarded load, as the Kotlin reader has; the structured reading of SQL in place of the whole-file document, keeping the document entity for retrieval; any entity kinds this needs, appended to the fixed byte table without renumbering; the additions to the Language union; the daemon request that lists the languages read and why any was skipped. Each language can be delivered on its own.
- `s10`: The reading of links and references between documents, and from a document to code, as relationships of the existing REFERENCES kind written in the file commit with evidence 'extracted'; the queued mid-tier pass over new or changed documents and its own table of model-proposed relationships; the hand-checked set, the measurement, and the recorded figures that switch the capability on or leave it off; the merging of model-proposed relationships into reads with evidence 'model'; the status line when no CLI provider is available.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `getGraphStore`

```typescript
getGraphStore(): Promise<GraphStore>
```

**Returns:** `Promise<GraphStore>` — The one open store of this process, opened on first call, as today.

**Errors:**
- `LmdbStoreNotOwnerError (new, a subclass of the store's existing LmdbStoreError)` when The path to open is the live path (PATHS.lmdb) and this process has not declared itself the store's owner. The message names the path, says that only the daemon may open the live store, and tells a test to set a temporary path with setGraphStorePath.
- `LmdbStoreError and its existing subclasses` when As today: a failed open, a schema version newer than the code, a failed migration.

**Preconditions:**
- For the live path only: the process has called the new owner declaration (see the data model, 'store owner declaration') before the first open. The daemon's entry point (src/daemon/index.ts) is the one caller.
- For any other path (a test's temporary store set through setGraphStorePath): none, as today.

**Postconditions:**
- A process that is not the declared owner never holds a descriptor on the live store or its lock file: the check runs before the library's open is called.
- The check compares resolved paths, so a relative path or a symbolic link to the live store is refused as well.

### 2.2 `setGraphStorePath`

```typescript
setGraphStorePath(path: string): void
```

**Parameters:**
- `path: string` — The store path for this process, in place of the live default.

**Returns:** `void` — Nothing.

**Preconditions:**
- Called before the first getGraphStore, as today.

**Postconditions:**
- Unchanged in behaviour. It is now the way a test, and only a test, gets a store without declaring ownership: any path that is not the live one stays open to any process.
- The two test files that reach the live store today (src/analyze/explore/__tests__/freeform-probe-scope.test.ts and phase5-explorations-params.test.ts) call it with a temporary directory, as the 80 other store-using test files do.

### 2.3 `closeGraphStore`

```typescript
closeGraphStore(): Promise<void>
```

**Returns:** `Promise<void>` — Resolves when the store is closed or when the close has been skipped.

**Postconditions:**
- When the store's health record says 'locks-lost', the library's close is not called: it hangs for ever once the semaphores are gone. The function forgets its handle, logs that the close was skipped and why, and resolves.
- Otherwise unchanged.

### 2.4 `putCachedExploration`

```typescript
putCachedExploration(repo: string, lastIndexedAtMs: bigint, exp: Exploration, output: ExplorationOutput): Promise<void>
```

**Parameters:**
- `repo: string` — Repository the lookup ran on.
- `lastIndexedAtMs: bigint` — The repository's index time the result belongs to.
- `exp: Exploration` — The lookup.
- `output: ExplorationOutput` — Its result.

**Returns:** `Promise<void>` — Resolves when the result is stored.

**Preconditions:**
- Called only inside the daemon. Its callers in src/analyze/explore/executor.ts (executePlan, stepPlan) keep calling it and its read counterpart directly when they run in the daemon.

**Postconditions:**
- The cache access of stepPlan and handleNarrow no longer opens the store in the MCP server's process. The executor takes the cache as two injected functions, a read and a write; in the daemon they are the store functions as today; in the MCP server (src/mcp/analyze-step/phases/plan.ts and narrow.ts) they are two new daemon requests, 'analyze.cache.get' and 'analyze.cache.put', which carry the same four values and call the store functions inside the daemon.
- A failed cache request is treated as a cache miss on read and is logged and ignored on write, as a failed write is today in handleNarrow; a lookup never fails because the cache could not be reached.
- After this change nothing under src/mcp imports from src/db; a test asserts it.

### 2.5 `stopDaemon`

```typescript
stopDaemon(): Promise<StopOutcome>
```

**Returns:** `Promise<StopOutcome>, where StopOutcome = { stopped: true; forced: boolean; pid?: number }` — How the daemon stopped: by itself (forced false) or by a forced kill after the wait (forced true, with the pid that was killed).

**Errors:**
- `Error` when Only when the forced kill itself fails (the process is still alive after it, or the pid file names a process this user cannot signal). The message names the pid and says what was tried. The present 'daemon did not stop within 30 s' is no longer a final outcome.

**Postconditions:**
- Sends the daemon.shutdown request and waits through waitForStop as today. If the daemon is unreachable but its pid is alive (the state the issue describes: socket gone, process alive), or the wait ends without a stop, it sends SIGKILL to the pid in the pid file, waits for the process to be gone, removes the pid file and the socket file, and returns forced true.
- The pid is checked to be a daemon process before it is killed (its command line names the daemon's entry file), so a pid reused by another program is never killed; if the check fails the pid file is treated as stale and removed.
- restart (src/cli/services/maintenance.ts) reports a forced stop in its log lines and goes on to start.

### 2.6 `restart`

```typescript
restart(onLog: LogFn): Promise<MaintenanceResult>
```

**Parameters:**
- `onLog: LogFn` — Receives one line per step.

**Returns:** `Promise<MaintenanceResult>` — As today; the steps list gains 'force-stop' when the stop was forced.

**Postconditions:**
- A daemon that did not stop by itself no longer ends the restart with an error and a daemon left half down: the stop is forced, the fact is logged through onLog, and the start follows.
- scripts/daemon-ctl.sh behaves the same way: cmd_stop, after wait_for_daemon_stop fails, sends SIGKILL to the recorded pid, waits for it to be gone, removes the pid file and the socket, and logs 'daemon did not stop within 30 s; killed (pid N)'; it dies only if the process survives the kill.

## 3. Data model changes

### 3.1 `store owner declaration (new, in src/db/graph/store.ts)` — new

A module-level flag, false by default, set by one new exported function that takes no argument and can only set it. The daemon's entry point calls it before anything opens the store. It is deliberately not an environment variable and not read from a file: child processes inherit neither a call nor a module variable, so a test run or a CLI provider started by the daemon is not an owner. getGraphStore reads it only when the resolved path equals the live path.

```
+ let _ownsLiveStore = false;
+ export function declareLiveStoreOwner(): void;
```

**Call sites:**
- `src/db/graph/store.ts`
- `src/daemon/index.ts`

### 3.2 `StoreHealth (new, in src/db/graph/store.ts)` — new

The one record of whether this process's store can still be used. It starts as ok. The store's write wrappers (withWriteTxn and withWriteTxnSync) and its read path catch an error whose code is the library's lock failure (-30775, MDB_LOCK_FAILURE) and set it to locks-lost with the time, the operation that failed and the library's own text kept for the log; they then throw a named error, LmdbStoreLocksLostError, whose message states the true cause: the store's locks were removed by another process that opened and closed it after this process lost its file lock on the lock file; it does not repeat the library's advice about a system limit. The record is set once and never returns to ok in the same process; only a restart clears it. It is read by the daemon's status, by closeGraphStore and by the shutdown.

```
+ type StoreHealth =
+   | { state: 'ok' }
+   | { state: 'locks-lost'; at: string; operation: string; libraryMessage: string };
+ export function getStoreHealth(): StoreHealth;
+ export class LmdbStoreLocksLostError extends LmdbStoreError {}
```

**Call sites:**
- `src/db/graph/store.ts`
- `src/daemon/index.ts`

### 3.3 `DaemonStatus` — field-add

One optional field carrying the store's health, absent when it is ok so that today's consumers see no change. The daemon.status request fills it from getStoreHealth inside its never-throw contract. The CLI's daemon pane and both editor plugins show the cause line when it is present; the mirrored type in the plugins gains the same optional field.

```
  export interface DaemonStatus {
    ...
+   /** Present only when the store has failed in this process. */
+   storeFailure?: { kind: 'locks-lost'; at: string; operation: string; cause: string };
  }
```

**Call sites:**
- `src/shared/types.ts`
- `src/daemon/index.ts`
- `src/cli/services/daemon.ts`

### 3.4 `daemon shutdown sequence (src/daemon/index.ts)` — invariant-change

Today both ends of the shutdown call process.exit, which runs the library's exit hook; with the locks lost that hook never returns, on the main thread, so the 20-second backstop timer cannot fire either. New invariant: once StoreHealth is locks-lost the daemon never calls process.exit. The shutdown stops the queue, the watcher and the server as today, skips the store's close, removes the pid file and the socket file, writes its last log line synchronously to the daemon's log file, and ends the process with SIGKILL to itself, which runs no exit hook. With StoreHealth ok the sequence is unchanged. A hang that the daemon did not foresee is ended by the control paths (stopDaemon and scripts/daemon-ctl.sh).

**Call sites:**
- `src/daemon/index.ts`

### 3.5 `lock-file open diagnostic (new, in the daemon)` — new

What in the daemon closes a second descriptor on the lock file is not identified. So that the next occurrence names it, the daemon wraps the file-open functions of Node's fs module at start-up, only for a path that resolves to the live store's lock file, and logs at warn the call stack of any such open. It changes no behaviour and costs one path comparison per open. The daemon's in-process file tools (read, grep, glob, list-dir, recent under src/daemon/tools/builtins) also refuse the store's two files by path, with a named error, since reading them is never useful and is the one known way to drop the lock.

**Call sites:**
- `src/daemon/index.ts`

## 4. Error paths

**Error cases**

- **A process that is not the daemon reaches for the live store: a test that set no temporary path, a script, or new code in the MCP server or the CLI.** (recoverable)
  - Detection: getGraphStore compares the resolved path it is about to open with the resolved live path and finds the owner flag unset, before the library's open is called.
  - Response: Throws LmdbStoreNotOwnerError naming the path and the remedy (a temporary path for a test; a daemon request for anything else). No descriptor on the store or its lock file is ever opened.
  - User impact: The offending test or tool fails at once with a clear message. The daemon is unaffected.
- **The store's locks are taken away while the daemon runs (the failure of the issue), by a route this Story did not close.** (terminal)
  - Detection: A store read or write throws an error whose code is the library's lock failure (-30775); the store's transaction wrappers check the code, not the message text.
  - Response: StoreHealth becomes locks-lost with the time and the operation; the wrapper throws LmdbStoreLocksLostError with the true cause; the daemon logs it once at error with the library's own text beside it. Later store calls fail fast with the same named error without calling the library. The daemon keeps serving what does not need the store (status, shutdown).
  - User impact: Requests that need the store fail with a message that says the store's locks were removed by another process and that the daemon must be restarted. Status shows the same line.
- **The daemon is asked to stop after its store has failed.** (recoverable)
  - Detection: The shutdown reads StoreHealth and finds locks-lost.
  - Response: It skips the store's close, removes the pid file and the socket file, writes a last line to the daemon's log synchronously, and sends itself SIGKILL. process.exit is not called, because the library's exit hook would hang.
  - User impact: The daemon is gone within its normal stop time and a start works with no manual clean-up. In-flight queue work is abandoned, as it would be on any kill; the next start resumes from the stored state.
- **The daemon hangs during a stop for a reason it did not record (the store's close hangs although StoreHealth is ok, or any other hang on the main thread).** (recoverable)
  - Detection: stopDaemon's wait, or the control script's wait_for_daemon_stop, ends with the pid still alive.
  - Response: The control path checks that the pid is a daemon process, sends SIGKILL, waits for it to be gone, removes the pid file and the socket file, and reports a forced stop with the pid.
  - User impact: The stop takes the full wait (30 s) and then succeeds; the message says the daemon was killed. A restart goes on to start.
- **The daemon is unreachable (socket gone) but its process is alive, the state the issue found.** (recoverable)
  - Detection: stopDaemon's shutdown request fails with a connection error while the pid in the pid file is alive and is a daemon process.
  - Response: It does not treat the failed request as 'already stopped': it goes straight to the wait and the forced kill.
  - User impact: The half-down daemon is cleared by an ordinary stop or restart.
- **The forced kill fails: the process survives SIGKILL, or the pid belongs to another user.** (terminal)
  - Detection: The pid is still alive after the kill and a short wait, or the kill call returns a permission error.
  - Response: The control path throws or dies with a message naming the pid and what was tried, and leaves the pid file in place so that a start still refuses to run a second daemon.
  - User impact: The user is told exactly which process to deal with.
- **A cache request from the MCP server fails: the daemon is down, restarting, or its store has failed.** (recoverable)
  - Detection: The injected cache read or write rejects.
  - Response: A failed read is treated as a miss and the lookup runs; a failed write is logged at warn and ignored.
  - User impact: The lookup is slower once; its result is the same.
- **Something in the daemon opens the store's lock file.** (recoverable)
  - Detection: The wrapped file-open functions see a path that resolves to the live lock file.
  - Response: The open proceeds unchanged and its call stack is logged at warn, once per distinct stack. The daemon's own file tools refuse the path with a named error before any open.
  - User impact: None at the time. The log names the code to fix, which is the part of the cause that is still unknown.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A test sets a temporary path with setGraphStorePath and never declares ownership. | The store opens as today; the owner check applies to the live path only. |
| The live path is reached by a different spelling: a relative path, a path through a symbolic link, or a home directory given with a trailing slash. | Refused when the owner flag is unset: both sides of the comparison are resolved first. |
| The daemon declares ownership and a child process it spawns (a CLI provider, a test run started by a build) imports the store. | The child is refused: the flag is a module variable of the daemon's process and is not inherited. |
| The daemon's entry point is run with a temporary home in a test. | It declares ownership and opens the store at that home's path; the live path of the test's environment is the temporary one. |
| stopDaemon is called when no daemon is running and no pid file exists. | Returns stopped with forced false, as a stop of a stopped daemon does today; nothing is killed. |
| The pid file names a pid that is alive but is not a daemon (the pid was reused). | Nothing is killed; the pid file and the socket are removed as stale and the stop returns. |
| A stop is requested twice while the first is in progress. | The daemon's existing guard ignores the second signal; the control path's wait covers both. |
| The store fails during the shutdown itself, after the health was read as ok. | The daemon may hang in the library's close; the control path's forced kill ends it. This is the case the escalation exists for. |
| A store compaction closes and reopens the store inside the daemon. | Unchanged: the owner flag stays set for the life of the process and the reopen passes the check. |

**Invariants to preserve**

- A test that sets a temporary store path keeps working with no other change: 80 test files do so today and none of them declares ownership. [[c2]]
- getGraphStore returns one store per process and opens it lazily on first call; closeGraphStore closes it. Neither signature changes. [[c1]]
- The exploration cache is an optimisation: a lookup's result is the same with or without it, and a failed cache write never fails the lookup, as in handleNarrow today. [[c1]]
- A healthy daemon's shutdown is unchanged: it drains the queue, closes its connections in the same order, clears the pid file and exits, with the same 20-second backstop. [[c2]]
- The daemon's status request never throws and its existing fields keep their meaning; the new field is optional and absent when the store is healthy. [[c2]]
- A stop of a daemon that stops by itself reports and behaves as today; the forced kill happens only after the existing wait has ended without a stop. [[c1]]

## 5. Test strategy

**Test framework:** `node:test run through tsx (`npx tsx --test`), test files named *.test.ts under __tests__ directories, as the repository's existing suites are; child processes are started with node's child_process for the two-process cases.`

**Test levels**

- **unit** — The owner check, the health record and the named errors, on temporary stores with no second process.
  - Subjects: `owner check: with the path left at its default and no declaration, getGraphStore rejects with LmdbStoreNotOwnerError and no file is created at the path (the test points the home directory at a temporary one, so the 'live' path is temporary)`, `owner check: after the declaration the same open succeeds`, `owner check: a temporary path set through setGraphStorePath opens without a declaration`, `owner check: the live path spelled as a relative path and through a symbolic link is refused`, `health record: a write that throws an error with code -30775 sets StoreHealth to locks-lost, and the thrown error is LmdbStoreLocksLostError whose message does not contain 'semume'`, `health record: after locks-lost, a further store call throws the named error without calling the library, and closeGraphStore resolves without calling the library's close`, `daemon status: the status payload has no storeFailure field when healthy and carries kind, time, operation and cause when the record is locks-lost`, `stop outcome: stopDaemon with an injected process table returns forced false when the daemon stops by itself, forced true after the wait when it does not, kills nothing when the pid is not a daemon, and throws when the pid survives the kill`, `cache injection: the executor with an injected cache whose read rejects runs the lookup and returns its result; with a write that rejects it still returns the result`, `import rule: no file under src/mcp imports from src/db (a scan of import statements, excluding type-only imports)`
  - Fixtures: `a temporary home directory per test, so that the default store path is never the user's real one`, `a fake process table for stopDaemon (alive, command line, kill)`
- **integration** — The two-process sequences that reproduce the failure and prove each remedy, on a temporary store. These are the tests that would have caught the issue.
  - Subjects: `reproduction, kept as a test of the mechanism: process A opens a temporary store through the library directly; A opens and closes a second descriptor on the lock file; process B opens, writes and closes; A's next write fails with code -30775. This pins the behaviour of the bundled library that the design rests on, and fails if a library upgrade changes it.`, `refusal: with a temporary home, process A declares ownership and opens the store; process B, not declared, calls getGraphStore and is refused with LmdbStoreNotOwnerError; A then writes successfully; the lock file was never opened by B`, `store failure to stop: a child process that runs the daemon's shutdown routine with its store brought to locks-lost by the reproduction sequence exits within 5 seconds of the stop request, the pid file and the socket file are gone, and a second start in the same home succeeds`, `status after failure: the same child, before the stop, answers the status request with storeFailure whose cause names another process and does not contain 'semume'`, `forced stop: a child process that ignores the shutdown request and SIGTERM is ended by stopDaemon after a shortened wait; the outcome is forced true with its pid; the pid file and socket are removed`, `control script: scripts/daemon-ctl.sh stop against the same stubborn child, with the wait shortened through an environment override, kills it, removes the pid file and the socket, and exits 0 with the 'killed' line in its log`, `cache through the daemon: an analysis step run from the MCP server's phase code against a daemon in a temporary home stores its lookup result through the cache request and reads it back on the next run, and the MCP side's process holds no descriptor on the store file`, `diagnostic: opening the lock file inside the daemon process writes one warn line with a call stack, and a second open from the same stack writes none`, `file tools: the daemon's read and grep tools refuse the store file and its lock file by path with the named error`
  - Fixtures: `a child-process helper that opens a store at a given path, optionally declares ownership, and reports over standard output`, `a stubborn child that ignores SIGTERM and never closes its socket`, `an environment override for the control script's 30-second wait, used only by the test`
- **smoke** — The installed daemon, once, after the change is deployed. Not automated; recorded beside the build.
  - Subjects: `with the installed daemon running, a script outside it that imports the store is refused, and a daemon write afterwards succeeds`, `an analysis run from a client session leaves the MCP server's process with no descriptor on ~/.insrc/graph.lmdb (checked with lsof), where one run on 2026-10-11 left five`, `daemon-ctl.sh restart on a healthy daemon behaves as before`, `the two formerly live-store test files pass while the installed daemon runs, and the daemon's log shows no lock-file open from them`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: refusal (process B is refused the live store, process A then writes successfully)`, `unit: owner check, the four cases`, `integration: cache through the daemon (the one production opener no longer opens the store)`, `unit: import rule for src/mcp` |
| `ac2` | `integration: store failure to stop (exit within 5 seconds, pid file and socket gone, second start succeeds)`, `integration: forced stop through stopDaemon`, `integration: control script stop`, `unit: stop outcome, the four cases` |
| `ac3` | `integration: status after failure (cause names another process, no 'semume')`, `unit: health record sets locks-lost and throws the named error`, `unit: daemon status payload with and without the field` |

## 6. Migration

**State before:** Per the s1 bundle on the store and the stop, and the direct reads recorded with it: getGraphStore opens whatever path is set, and the path defaults to the live store, so any process that imports the store layer opens the live store; the MCP server does so for the exploration cache (stepPlan and handleNarrow call the cache functions in its own process), and two test files do so because they set no temporary path. Nothing in src handles the library's lock failure: it reaches the log as the library's text about a system limit. The daemon's shutdown ends in process.exit on both of its paths, and stopDaemon and the control script give up after 30 seconds with the daemon left half down. DaemonStatus has no field for a store failure.

**State after:** The live store opens only in a process that has declared itself its owner, which the daemon's entry point does; every other process is refused before any file is opened. The MCP server reaches the exploration cache through two daemon requests and imports nothing from the store layer. A lock failure is recorded once as locks-lost with its true cause, raised as a named error, and shown in the daemon's status. A daemon whose store has failed ends itself without calling process.exit; a stop that overruns is finished by a forced kill from stopDaemon or the control script, which clean the pid file and the socket and say what they did. Any open of the store's lock file inside the daemon is logged with its call stack.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add the health record, the two named errors and the recognition of the library's lock failure in the store's transaction wrappers; add the optional storeFailure field to the daemon's status and its mirrored types. Nothing reads the record yet except status. — ↩ rollbackable
2. Change the stop paths: stopDaemon returns an outcome and forces the stop after its wait; restart reports a forced stop and goes on; the control script's stop kills after its wait and cleans up. Independent of every other step, and useful by itself against the hang as it occurs today. — ↩ rollbackable
3. Change the daemon's shutdown and closeGraphStore to read the health record: skip the store's close and end by a kill signal to itself when the record is locks-lost. Requires step 1. — ↩ rollbackable
4. Add the two daemon requests for the exploration cache and make the executor take the cache as injected functions, with the store functions as the default inside the daemon. The MCP server is not yet switched over, so behaviour is unchanged. — ↩ rollbackable
5. Switch the MCP server's two phases to the cache requests and remove its import of the store layer; add the test that nothing under src/mcp imports from src/db. From here the MCP server no longer opens the store. Requires step 4 to be running in the daemon: a newer MCP server against an older daemon gets an unknown-request error, which the cache treats as a miss. — ↩ rollbackable
6. Give the two test files that reach the live store a temporary one. — ↩ rollbackable
7. Add the owner declaration, call it from the daemon's entry point, and switch on the refusal in getGraphStore. This is the step that can break a caller, so it comes after steps 5 and 6 have removed the known ones; the full test sweep is run with it before it is committed, and any test it newly fails is a test that was opening the live store. — ↩ rollbackable
8. Add the lock-file open diagnostic in the daemon and the refusal of the store's two files in the daemon's file tools. — ↩ rollbackable
9. Deploy: update the installed daemon, then restart client sessions so that their MCP server processes run the new code. Run the smoke checks (an outside script is refused; an analysis leaves the MCP server with no descriptor on the store; a restart of a healthy daemon behaves as before). — ↩ rollbackable

**Backward compat:** No stored data changes and no migration of the store is involved. DaemonStatus gains one optional field, absent when the store is healthy, so a consumer that does not know it is unaffected. stopDaemon's return changes from nothing to an outcome object and it no longer rejects on a time-out; its callers in the CLI are updated in the same change. MaintenanceResult's steps list may contain a new value, 'force-stop'. The control script's stop now exits 0 after a forced kill where it exited 4. The one behaviour that can break an existing caller is the refusal of the live store to a process that is not the daemon: by design it breaks any test or script that opened the live store without setting a temporary path. During the deploy an MCP server process started before the update keeps its old code and can still open the live store until its client session is restarted; the refusal protects fully only once those processes are gone.

## 7. Alternatives considered

### 7.1 a1: An explicit owner declaration in the store, a recorded store health, and a stop that ends from outside the main thread — **CHOSEN**

The daemon declares itself the store's owner before it opens it; the store refuses the live path to anyone else; a store failure is recorded once and read by status and by shutdown; the stop is finished by a forced kill, from the daemon itself when it knows the store has failed and from the control paths otherwise.

The store module gains an explicit declaration of who may open the live path. The daemon's entry point makes it before its first open; the store's open checks it whenever the path is the live one and throws a named error otherwise, so a temporary path set by a test stays open to anyone. The MCP server's reads and writes of the exploration cache, the one known production use from another process, become two daemon requests, and the two test files that reach the live store get a temporary one. A store failure is recorded in one place: the store's write wrapper recognises the library's lock failure, records it with a true description of the cause, and raises a named error in place of the library's text. The daemon's status reads that record.

Stopping uses the same record. The library's exit hook hangs on the main thread once the store's semaphores are gone, so no timer in the daemon can end it. When the record says the store has failed, the shutdown skips the store's close, clears the pid file and the socket, and ends the process with a kill signal to itself, which runs no exit hook. For a hang that was not foreseen, the two control paths (the control script and the CLI's stop) escalate after their wait to a forced kill of the recorded pid, remove the pid file and the socket, and say that they did so.

### 7.2 a2: Ownership inferred from the pid file, and a watchdog thread that bounds the exit

The store allows the live path only to the process whose pid is in the daemon's pid file; a worker thread in the daemon kills the process if the shutdown overruns.

No declaration is added. The store's open compares its own pid with the daemon's pid file and refuses the live path when they differ. The MCP server's cache access and the two tests are moved as in the first alternative. A store failure is recognised in the write wrapper and recorded for status.

The stop is bounded inside the daemon by a second thread: when shutdown begins, a worker thread starts a timer and sends the process a kill signal when it expires, whatever the main thread is doing. The control paths are left as they are.

**Rejected because:** Bounds the stop well, but the ownership test rests on a file that is written after the store opens and can be stale or matched by accident.

### 7.3 a3: A launcher-set environment marker, with the stop bounded only by the control paths

The control script sets an environment variable that marks the daemon; the store refuses the live path without it; nothing changes in the daemon's shutdown, and the control paths kill after their wait.

The script and the CLI's start set a variable in the daemon's environment, and the store's open requires it for the live path. The MCP server's cache access and the two tests are moved as in the first alternative. The library's lock failure is recognised in the write wrapper and recorded for status.

The daemon's shutdown is not changed. When it hangs, the control script and the CLI's stop wait their 30 seconds, then kill the recorded pid and clean up.

**Rejected because:** The marker is inherited by every process the daemon spawns, which lets in exactly the processes the rule is meant to keep out, and a failed daemon always takes the full wait to stop.

## 8. References

- **[[c1]]** `analyze-bundle` `s1 bundle (how-does-it-work): getGraphStore, closeGraphStore, setGraphStorePath, putCachedExploration and its three callers, stopDaemon, waitForStop, restart; no handling of MDB_LOCK_FAILURE in src`
- **[[c2]]** `step-output` `s1 direct reads and measurements of 2026-10-11: the two-process reproduction on a temporary store, the processes that open the live store today, the shutdown sequence in src/daemon/index.ts, the control paths, the status type`
- **[[c3]]** `prior-artifact` `docs/standalone/defect-installed-daemon-runs-out-lmdb-E202610100d577569/ISSUE.md`
- **[[c4]]** `code` `node_modules/lmdb/dependencies/lmdb/libraries/liblmdb/mdb.c` — "rc = MDB_LOCK_FAILURE;"
- **[[c5]]** `code` `src/db/graph/store.ts` — "let _path: string = PATHS.lmdb;"
- **[[c6]]** `code` `src/daemon/index.ts` — "const HARD_EXIT_MS = 20_000;"
- **[[c7]]** `code` `src/mcp/analyze-step/phases/narrow.ts` — "import { putCachedExploration } from '../../../db/exploration-cache.js';"
- **[[c8]]** `code` `src/cli/services/daemon.ts` — "throw new Error('daemon did not stop within 30 s');"
- **[[c9]]** `prior-artifact` `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/HLD.md`
- **[[c10]]** `stakeholder` `Stakeholder decisions of 2026-10-11 for Story s4: the Story is reworded to the reproduced cause; a hard rule in the store refuses the live path to any process that has not declared itself the daemon, and the known openers are fixed.`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**5 do not hold · 1 could not be verified · 8 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-11T08:24:25.218Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| current-behaviour | HIGH | The MCP server's lookup cache is the one production use of the live store from a process other than the daemon, so moving the cache behind two daemon requests leaves the MCP server with no open of the store. | The whole analyze step runs inside the MCP server's process (src/mcp/server.ts:402 `async (rawArgs, _extra) => handleAnalyzeStep(rawArgs)`), and it reads the store directly in many places besides the cache. start.ts:64 `await stepScope(unsized)`, plan.ts:112 and narrow.ts:205 call stepScope with no deps, so the defaults in src/analyze/context/scope.ts:77-79 run (`listRepos: () => listRepos(null)`, `findEntitiesByFile(null, file)`, `listEntitiesForRepo(null, repoPath)`). start.ts:74 calls resolveRepoLastIndexedAt, which is `repos = await listRepos(null)` (driver.ts:1163). stepPlan runs every deterministic lookup in the same process (executor.ts:590 `output = await runner(exp, ctx)`), and the runners read entities directly, for example symbol-locate.ts:99 `findEntitiesByName(db, ...)` and :109 `listEntitiesForRepo(db, ctx.repoPath)`. Each of those opens the store: repos.ts:214 and entities.ts:586 are `const store = await getGraphStore();`. About 40 files under src/analyze import src/db read functions this way. Once step 7 switches the refusal on, every insrc_analyze_step call from a client is refused with LmdbStoreNotOwnerError, and with it triage, the workflow steps and code review that rest on the analyzer. The smoke check 'the MCP server's process has no descriptor on graph.lmdb' cannot pass either. Not checked: whether src/workflow/review/source-roots.ts:59 (`listEntitiesForRepo(db, repoPath)`, reached from review/probe.ts:195) also runs in the MCP server's process. [files: src/mcp/server.ts, src/mcp/analyze-step/phases/start.ts, src/mcp/analyze-step/phases/plan.ts, src/mcp/analyze-step/phases/narrow.ts, src/analyze/context/scope.ts, src/analyze/context/driver.ts, src/analyze/explore/executor.ts, src/analyze/explore/symbol-locate.ts, src/db/repos.ts, src/db/entities.ts] | Redo the inventory of what the MCP server's process reads from the store (scope resolution, last-indexed time, measurement, every lookup runner, the review probe) and design how each reaches the daemon: either the lookups themselves run in the daemon behind a request, or each read becomes a daemon request. Do not switch on the refusal (step 7) until that is done. Re-check the Story's size, which the DEF gives as M. |
| error-paths | HIGH | After the store has failed, the daemon's status request still answers and carries storeFailure, 'inside its never-throw contract'. | The status handler reads the store first, outside any guard: `repos: await listRepos(db),` (src/daemon/index.ts:1026); only the file-size read below it is wrapped (`try { ... } catch { /* best-effort; status should never throw */ }`, :1036-1041). listRepos opens with `const store = await getGraphStore();` (repos.ts:214). By the design's own rule, 'Later store calls fail fast with the same named error', so after locks-lost this line throws and the status request returns an error before storeFailure is ever attached. That is the one moment ac3 needs the field. The design names no change to this line. [files: src/daemon/index.ts, src/db/repos.ts] | State that the status handler guards its store read: on a store failure it returns the status with repos empty (or the last known list) and storeFailure set. Keep the 'status after failure' integration test as the proof. |
| current-behaviour | MED | A stop of a daemon that is not running, with no pid file, returns normally today, so returning { stopped: true, forced: false } is 'as today'. | stopDaemon is `await rpc('daemon.shutdown'); if (!(await waitForStop())) { throw ... }` (daemon.ts:78-83). With no socket the request rejects before any wait; the same file documents the rejection for the sibling call: 'Rejects with a friendly "daemon is not running" error when the socket is absent' (daemon.ts:49-50). So today the stop of a stopped daemon is an error, not a success. The design changes this silently: src/cli/command.ts:84 and src/cli/panes/DaemonPane.tsx:53 would then print 'daemon stopped' when nothing was running. [files: src/cli/services/daemon.ts] | State this as a behaviour change, decide whether 'not running' stays an error or becomes its own outcome (for example stopped: false, or a third field), and say what the CLI's two callers print. |
| change-sites | MED | The store has a read path where the lock failure can be caught and where later calls can fail fast without calling the library, alongside the two write wrappers. | Writes do go through one place: 54 call sites use withWriteTxn / withWriteTxnSync and only three raw `.root.transaction` calls exist (two in store.ts, one in migrations.ts). Reads have no such place. store.ts exports getGraphStore, which returns the raw handle (`if (_instance !== null) return _instance;`, line 281), and each module then calls the library directly on a sub-database, for example `const store = await getGraphStore();` followed by direct gets and range reads in entities.ts:586 and repos.ts:214. There is no read wrapper to put a catch in, and a caller that already holds the handle never passes through the store module again. [files: src/db/graph/store.ts, src/db/entities.ts, src/db/repos.ts] | Name the read-side site. The simplest is to make getGraphStore itself throw LmdbStoreLocksLostError once the record is locks-lost (every read begins with it), and to say plainly that a lock failure first seen on a read is recorded only if that is added, or is recorded on the next write. |
| change-sites | MED | The inventory of stop paths that give up after the wait is complete: stopDaemon, restart and the control script's cmd_stop. | cmd_start has its own stop of a running daemon with the same give-up: `signal_stop` then `wait_for_daemon_stop \|\| die "stale daemon did not shut down within 30 s (see $DAEMON_LOG)" 4` (daemon-ctl.sh:217-221). The design changes only cmd_stop (line 235). `daemon-ctl.sh start` against a hung daemon, the path an update followed by a start takes, still dies with the daemon half down. The TypeScript side is complete: stopDaemon's callers are command.ts:84, panes/DaemonPane.tsx:53, maintenance.ts:279 and the type at services/index.ts:39 (`stopDaemon(): Promise<void>`), which the design covers as 'its callers in the CLI'. [files: scripts/daemon-ctl.sh] | Put the forced kill in one shell function used by both cmd_stop and cmd_start's stale-daemon branch, and list services/index.ts:39 among the signature changes. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| error-paths | A forced kill is safe against pid reuse because the control path checks that the pid's command line names the daemon's entry file before SIGKILL. | The design states the check but not how it is done. Existing pieces it could reuse: src/cli/services/daemon.ts:26 exports DAEMON_ENTRY 'so the debug service matches orphan daemon processes against the SAME resolved absolute entry path', and the script starts the daemon as `node --import tsx/esm "$DAEMON_ENTRY"` (daemon-ctl.sh:138). I did not read src/cli/services/debug.ts to confirm its process-matching function has a shape stopDaemon can call, and the shell side has no such check today (signal_stop only tests `ps -p`). | Name the function reused from the debug service for the TypeScript path and write out the shell check (for example `ps -o command= -p "$pid"` matched against $DAEMON_ENTRY) so the two paths agree. |
