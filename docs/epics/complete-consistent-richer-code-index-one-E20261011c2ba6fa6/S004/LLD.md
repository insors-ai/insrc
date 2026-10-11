<!-- insrc:artifact LLD-c2ba6fa62a148ed1-s4 -->

# LLD: E20261011c2ba6fa6:S004

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**HLD base run:** `wf-1791697214822-7bombm`
**HLD effective hash:** `fa332202b032...`

The daemon's store failed, and the daemon then could not be stopped, because another process that had the live store open closed it and removed the store's locks. This Story makes the store refuse the live path to every process but the daemon, and gives the two tests that reached the live store a temporary one. The MCP server's process also opens the live store today, for every analyze step and not only for its cache; that use is removed by Story s11, so until s11 lands the MCP server is let in by an explicit, temporary allowance, and the refusal is complete only once s11 has removed it. A store failure is recorded once with its true cause and shown in the daemon's status, and a stop always ends: the daemon ends itself at once when it knows its store has failed, and the control script and the CLI's stop force the end when a stop overruns.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Feedback](#9-feedback)

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
- `LmdbStoreLocksLostError (new, a subclass of LmdbStoreError)` when The store's health record is locks-lost. Every read and write in the code begins with getGraphStore, so this is the one read-side place the failure is raised; no single wrapper for reads exists (modules take the handle and call the library on a sub-database directly).
- `LmdbStoreError and its existing subclasses` when As today: a failed open, a schema version newer than the code, a failed migration.

**Preconditions:**
- For the live path only: the process has called one of the two new declarations before the first open. The daemon's entry point (src/daemon/index.ts) declares itself the owner. The MCP server's entry point declares itself a permitted reader: a temporary allowance, because the analyze step runs in that process today and reads the store directly (src/mcp/server.ts:402; 35 files under src/analyze import the store layer). Story s11 moves that work into the daemon and removes the allowance and its declaration.
- For any other path (a test's temporary store set through setGraphStorePath): none, as today.

**Postconditions:**
- A process that has made neither declaration never holds a descriptor on the live store or its lock file: the check runs before the library's open is called. Until Story s11 lands, the MCP server's process is the one exception, and acceptance criterion ac1 is met for every other process; it is met in full when s11 removes the allowance.
- The check compares resolved paths, so a relative path or a symbolic link to the live store is refused as well.
- A lock failure first met on a read through a handle a module already holds is not caught at that read; it is recorded by the next write or raised by the next getGraphStore call, whichever comes first.
- One more process opens the live store today and is not let in: the CLI's own process, through its in-process review of an artifact (src/cli/services/workflow.ts calls reviewArtifactFile, whose probe calls resolveSourceRoots in src/workflow/review/source-roots.ts with no injected reader, which reads the repository's entities through the store). That read swallows every failure by contract and falls back to the repository root, so a refusal there would degrade the CLI's review silently. It is given an injected reader that asks the daemon (see the data model, 'source-root reader for a review outside the daemon'), and the fallback, when it is taken, is stated in the review's output. The search for openers behind this design covered direct imports of the store layer; before the refusal is switched on it is repeated over everything the CLI's and the MCP server's entry points import, and any further opener found is handled the same way or raised.

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

### 2.4 `stopDaemon`

```typescript
stopDaemon(): Promise<StopOutcome>
```

**Returns:** `Promise<StopOutcome>, where StopOutcome = { stopped: true; forced: boolean; pid?: number }` — How the daemon stopped: by itself (forced false) or by a forced kill after the wait (forced true, with the pid that was killed).

**Errors:**
- `Error ('daemon is not running')` when No socket and no live daemon pid, as today: the shutdown request rejects before any wait. Unchanged; a stop of a stopped daemon stays an error and the CLI's two callers (src/cli/command.ts and the daemon pane) print it as they do now.
- `Error` when Only when the forced kill itself fails (the process is still alive after it, or the pid file names a process this user cannot signal). The message names the pid and says what was tried. The present 'daemon did not stop within 30 s' is no longer a final outcome.
- `Error` when The pid in the pid file is alive but its command line is not a daemon's. The message names the pid and the command line; the pid file and the socket are left in place.

**Postconditions:**
- Sends the daemon.shutdown request with a bound of 5 seconds on the reply: the request client has no time-out today, and a daemon whose main thread is blocked while its socket still listens accepts the connection and never answers, so an unbounded await would never reach the wait or the kill. On a reply, a refused connection with a live daemon pid, or the bound passing, it waits through waitForStop as today. If the wait ends without a stop it sends SIGKILL to the pid in the pid file, waits for the process to be gone, removes the pid file and the socket file, and returns forced true.
- The pid is checked to be a daemon process before it is killed: its command line must end in the daemon's entry file (the path suffix daemon/index.js). The check does not compare against DAEMON_ENTRY as exported by src/cli/services/daemon.ts, because that is the entry of the CLI's own checkout, while the control script starts the daemon from the installed one ($HOME/.insrc/daemon or INSRC_DAEMON_ROOT), so a CLI run from a development checkout would not match a live installed daemon. When the pid is alive and its command line does not match, nothing is killed and nothing is removed: the stop fails with an error naming the pid and its command line, since removing the pid file and socket of a live daemon would let a second one start on the same store.
- restart (src/cli/services/maintenance.ts) reports a forced stop in its log lines and goes on to start.
- The signature change reaches the service type at src/cli/services/index.ts (stopDaemon(): Promise<void> today) and the three callers: src/cli/command.ts, src/cli/panes/DaemonPane.tsx and restart in src/cli/services/maintenance.ts.

### 2.5 `restart`

```typescript
restart(onLog: LogFn): Promise<MaintenanceResult>
```

**Parameters:**
- `onLog: LogFn` — Receives one line per step.

**Returns:** `Promise<MaintenanceResult>` — As today; the steps list gains 'force-stop' when the stop was forced.

**Postconditions:**
- A daemon that did not stop by itself no longer ends the restart with an error and a daemon left half down: the stop is forced, the fact is logged through onLog, and the start follows.
- scripts/daemon-ctl.sh behaves the same way, through one shell function used at both places where the script stops a daemon and gives up today: cmd_stop, and the stale-daemon branch of cmd_start ('stale daemon did not shut down within 30 s'). After wait_for_daemon_stop fails, the function checks that the pid's command line (ps -o command= -p "$pid") ends in daemon/index.js, the same rule as the CLI's; on a match it sends SIGKILL, waits for the process to be gone, removes the pid file and the socket, and logs 'daemon did not stop within 30 s; killed (pid N)'; it dies only if the process survives the kill. A live pid whose command line does not match is not killed and its pid file is not removed; the script dies naming the pid and the command line.

## 3. Data model changes

### 3.1 `store owner declaration (new, in src/db/graph/store.ts)` — new

Two module-level flags, false by default, each set by one new exported function that takes no argument and can only set it: an owner declaration, called by the daemon's entry point before anything opens the store, and a permitted-reader declaration, called by the MCP server's entry point. They are deliberately not environment variables and not read from a file: child processes inherit neither a call nor a module variable, so a test run or a CLI provider started by the daemon is neither. getGraphStore reads them only when the resolved path equals the live path. The permitted-reader declaration is temporary: it exists because the MCP server runs the analyze step in its own process today, and Story s11 removes the function and its one call when that work has moved into the daemon. It is named so that a search for it finds exactly what s11 must delete.

```
+ let _ownsLiveStore = false;
+ let _mayReadLiveStore = false;          // temporary; removed by Story s11
+ export function declareLiveStoreOwner(): void;
+ export function declareLiveStoreReaderUntilS11(): void;
```

**Call sites:**
- `src/db/graph/store.ts`
- `src/daemon/index.ts`
- `src/mcp/server.ts`

### 3.2 `StoreHealth (new, in src/db/graph/store.ts)` — new

The one record of whether this process's store can still be used. It starts as ok, is set once, and never returns to ok in the same process; only a restart clears it. How the failure shows itself was measured on 2026-10-11 by breaking a temporary store's locks and then using it, and the three kinds of call behave differently: a read (a get) throws at once with the library's code -30775 (MDB_LOCK_FAILURE); a synchronous transaction throws at once with code 22 ('Invalid argument'), not -30775; and an asynchronous transaction, which is what withWriteTxn uses and most writes go through, never settles: it neither resolves nor rejects, and a synchronous transaction attempted after it hung. Detection is therefore in three places. (1) withWriteTxnSync catches an error with either code. Code 22 is the general 'Invalid argument' and the record cannot be cleared without a restart, so before recording it confirms with the same probe read as below: only if the probe throws -30775 is locks-lost recorded; otherwise the original error is rethrown unchanged. (2) withWriteTxn bounds its wait: when an asynchronous transaction has not settled within a fixed time (10 seconds; an ordinary write here takes milliseconds) it probes the store with one read of a fixed key. If the probe throws -30775 the record becomes locks-lost and the wrapper rejects; if the probe returns, the write is only slow and the wrapper goes on waiting. The probe is a read because a read is the one call measured to fail fast and cleanly in this state. (3) Reads have no wrapper (modules take the handle and call the library on a sub-database directly), so a -30775 thrown by a read surfaces in the caller. The daemon's request server has three catch sites (the standard request, the standard handler reached through a stream request, and the stream handler, all in src/daemon/server.ts) and its queue has one (the job runner in src/daemon/queue.ts); each reduces an error to its message today, and each reads the error's code first, records locks-lost for -30775 and answers with the named error. A read that fails outside those four sites (a timer, the boot sequence) or inside a handler that swallows its own failures (the review's source-root read does) is not recorded there. Two things cover it: the daemon's periodic reader check, which already runs every five minutes, also makes the probe read and records a failure; and the next write records it through its bound. A failure can therefore go unrecorded for up to that interval, which is accepted. In every case the error raised to the caller is LmdbStoreLocksLostError, whose message states the true cause (the store's locks were removed by another process that opened and closed it after this process lost its file lock on the lock file) and does not repeat the library's advice about a system limit; the library's own text is kept in the record for the log. Once the record is locks-lost, getGraphStore throws the named error to every caller, so no later call reaches the library. The record is read by the daemon's status, by getGraphStore, by closeGraphStore and by the shutdown.

```
+ type StoreHealth =
+   | { state: 'ok' }
+   | { state: 'locks-lost'; at: string; operation: string; detectedBy: 'sync-write' | 'write-timeout-probe' | 'read'; libraryMessage: string };
+ export function getStoreHealth(): StoreHealth;
+ export function recordStoreFailureIfLockError(err: unknown, operation: string): boolean;   // used by the dispatcher and the queue runner
+ export class LmdbStoreLocksLostError extends LmdbStoreError {}
```

**Call sites:**
- `src/db/graph/store.ts`
- `src/daemon/index.ts`
- `src/daemon/server.ts`
- `src/daemon/queue.ts`

### 3.3 `DaemonStatus` — field-add

One optional field carrying the store's health, absent when it is ok so that today's consumers see no change. The daemon.status request fills it from getStoreHealth. The request reads the repository list from the store first, outside any guard today (`repos: await listRepos(db)` in src/daemon/index.ts), and by this design that read throws once the store has failed; the handler therefore guards it and, on a store failure, returns the status with an empty repository list and storeFailure set, which is the one moment the field is needed. The CLI's daemon pane and both editor plugins show the cause line when it is present; the mirrored type in the plugins gains the same optional field.

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

Today both ends of the shutdown call process.exit, which runs the library's exit hook; with the locks lost that hook never returns, on the main thread, so the 20-second backstop timer cannot fire either. A third call exists outside the shutdown: reportFatal, registered for uncaught exceptions and unhandled rejections, ends with process.exit after 50 milliseconds, and a rejection with the new named error that nothing awaits would reach it. New invariant: once StoreHealth is locks-lost the daemon never calls process.exit, at any of the three places. When a stop is asked for with the store failed, the shutdown does not wait for the queue to drain, since a job held in a store call would never finish: directly from the shutdown function it stops the queue, the watcher and the server, skips the store's close, removes the pid file and the socket file, writes its last log line synchronously to the daemon's log file, and ends the process with SIGKILL to itself, which runs no exit hook. reportFatal does the same when the store has failed: it already writes its line synchronously, and it then removes the pid file and the socket and ends by SIGKILL in place of process.exit. With StoreHealth ok all three are unchanged. A hang that the daemon did not foresee is ended by the control paths (stopDaemon and scripts/daemon-ctl.sh).

**Call sites:**
- `src/daemon/index.ts`

### 3.5 `lock-file open diagnostic (new, in the daemon)` — new

What in the daemon closes a second descriptor on the lock file is not identified. So that the next occurrence names it, the daemon wraps, at start-up, the functions of Node's fs module and of fs/promises that open a file by path (open, openSync, readFile, readFileSync, copyFile, copyFileSync, cp, cpSync, createReadStream and the promise forms of open, readFile, copyFile and cp), and re-syncs the built-in module's exports so that code which imported them by name sees the wrap. For a path that resolves to the live store's lock file or data file the wrap logs the call stack at warn, once per distinct stack, and lets the call proceed. It is a diagnostic and is best effort: a route into the file system that goes around these functions is not seen, and its test opens the lock file through fs.promises.readFile, the route the daemon's own tools use. The daemon's file tools also refuse the store's two files by path, with a named error, since reading them is never useful and is the one known way to drop the lock. The refusal is one small check function, called with the path after symbolic links are resolved (the tools' shared helper resolves a path without following links, which is not enough). It is called from the shared path helper of the file tools (resolvePath in src/daemon/tools/builtins/file/helpers.ts) and, because the copy and move tools resolve their two paths themselves and never call that helper when they run, also from the execute step and the approval gate of copy and move, for both the source and the target, and from the search tools' own path handling. Every tool is thereby covered: read, edit, multi-edit, copy, delete, write and move among the file tools, and grep, glob, list-dir and recent among the search tools. Its test calls each tool's own execute, not the helper. Of these, read, edit, multi-edit, copy, delete and grep read a file's content in the daemon's process today.

**Call sites:**
- `src/daemon/index.ts`
- `src/daemon/tools/builtins/file/helpers.ts`
- `src/daemon/tools/builtins/file/copy.ts`
- `src/daemon/tools/builtins/file/move.ts`
- `src/daemon/tools/builtins/search/grep.ts`

### 3.6 `source-root reader for a review outside the daemon (new option and new daemon request)` — new

The CLI's in-process review cannot be handed a reader today: the chain from the CLI is reviewArtifactFile (src/workflow/review/run-artifact.ts), review (src/workflow/review/review.ts), gatherEvidence (src/workflow/review/probe.ts) and resolveSourceRoots (src/workflow/review/source-roots.ts), and only the last takes a reader. One optional field, the reader, is added to the options of the first three and passed down. It is optional, so the daemon's own review (src/daemon/workflow-review-rpc.ts) and the MCP server's review step keep the default reader and are unchanged. The CLI (src/cli/services/workflow.ts) passes a reader that calls one new read-only daemon request, which takes a repository path and returns what the default reader returns: that repository's entities as resolveSourceRoots needs them. When the request fails the review falls back to the repository root, as it does today on any read failure, and its output now says that it did and why.

```
+ // daemon request
+ 'repo.entitiesForSourceRoots': (params: { repoPath: string }) => Promise<Entity[] | { error: string }>;
+ // threaded option, optional at every level
+ interface ReviewArtifactOpts { ...; readEntitiesForRepo?: (repoPath: string) => Promise<Entity[]>; }
```

**Call sites:**
- `src/cli/services/workflow.ts`
- `src/workflow/review/run-artifact.ts`
- `src/workflow/review/review.ts`
- `src/workflow/review/probe.ts`
- `src/workflow/review/source-roots.ts`
- `src/daemon/workflow-review-rpc.ts`
- `src/daemon/index.ts`

## 4. Error paths

**Error cases**

- **A process that is neither the daemon nor, until Story s11, the MCP server reaches for the live store: a test that set no temporary path, a script, or new code in the CLI.** (recoverable)
  - Detection: getGraphStore compares the resolved path it is about to open with the resolved live path and finds neither declaration made, before the library's open is called.
  - Response: Throws LmdbStoreNotOwnerError naming the path and the remedy (a temporary path for a test; a daemon request for anything else). No descriptor on the store or its lock file is ever opened.
  - User impact: The offending test or tool fails at once with a clear message. The daemon is unaffected.
- **The store's locks are taken away while the daemon runs (the failure of the issue), by a route this Story did not close.** (terminal)
  - Detection: Three ways, by what was measured: a synchronous transaction throws with code 22 or -30775 and withWriteTxnSync catches it; an asynchronous transaction does not settle, and withWriteTxn, after 10 seconds, probes the store with a read that throws -30775; a read throws -30775 into its caller, and the daemon's request dispatcher or queue runner catches it.
  - Response: StoreHealth becomes locks-lost with the time, the operation and how it was detected; the named error LmdbStoreLocksLostError is raised with the true cause; the daemon logs it once at error with the library's own text beside it. From then on getGraphStore throws the same named error, so later calls fail fast without reaching the library. The daemon keeps serving what does not need the store (status, shutdown).
  - User impact: Requests that need the store fail with a message that says the store's locks were removed by another process and that the daemon must be restarted. Status shows the same line.
- **The daemon's status is asked for after the store has failed.** (recoverable)
  - Detection: The status handler's read of the repository list throws LmdbStoreLocksLostError, raised by getGraphStore.
  - Response: The handler catches it, returns the status with an empty repository list and with storeFailure filled from the health record, and does not throw.
  - User impact: Status still answers and says why the store is unusable.
- **The daemon is asked to stop after its store has failed.** (recoverable)
  - Detection: The shutdown reads StoreHealth and finds locks-lost.
  - Response: Without waiting for the queue to drain, it stops the queue, the watcher and the server, skips the store's close, removes the pid file and the socket file, writes a last line to the daemon's log synchronously, and sends itself SIGKILL. process.exit is not called, because the library's exit hook would hang.
  - User impact: The daemon is gone within its normal stop time and a start works with no manual clean-up. In-flight queue work is abandoned, as it would be on any kill; the next start resumes from the stored state.
- **The daemon hangs during a stop for a reason it did not record (the store's close hangs although StoreHealth is ok, or any other hang on the main thread).** (recoverable)
  - Detection: stopDaemon's wait, or the control script's wait_for_daemon_stop, ends with the pid still alive.
  - Response: The control path checks that the pid is a daemon process, sends SIGKILL, waits for it to be gone, removes the pid file and the socket file, and reports a forced stop with the pid.
  - User impact: The stop takes the full wait (30 s) and then succeeds; the message says the daemon was killed. A restart goes on to start.
- **The daemon cannot answer: its socket is gone while its process is alive (the state the issue found), or its main thread is blocked and it accepts the connection but never replies.** (recoverable)
  - Detection: stopDaemon's shutdown request fails with a connection error, or gets no reply within 5 seconds, while the pid in the pid file is alive.
  - Response: It does not treat the failed request as 'already stopped': it goes straight to the wait and the forced kill.
  - User impact: The half-down daemon is cleared by an ordinary stop or restart.
- **The forced kill fails: the process survives SIGKILL, or the pid belongs to another user.** (terminal)
  - Detection: The pid is still alive after the kill and a short wait, or the kill call returns a permission error.
  - Response: The control path throws or dies with a message naming the pid and what was tried, and leaves the pid file in place so that a start still refuses to run a second daemon.
  - User impact: The user is told exactly which process to deal with.
- **Something in the daemon opens the store's lock file.** (recoverable)
  - Detection: The wrapped file-open functions see a path that resolves to the live lock file.
  - Response: The open proceeds unchanged and its call stack is logged at warn, once per distinct stack. The daemon's own file tools refuse the path with a named error before any open.
  - User impact: None at the time. The log names the code to fix, which is the part of the cause that is still unknown.
- **A write is slow but the store is healthy (a large transaction, a busy disk).** (recoverable)
  - Detection: withWriteTxn's 10-second bound passes and its probe read returns normally.
  - Response: Nothing is recorded; the wrapper goes on waiting for the write and probes again at the same interval.
  - User impact: None beyond the slow write.
- **The pid file names a live process whose command line is not a daemon's.** (terminal)
  - Detection: The command-line check before the forced kill fails for a pid that is alive.
  - Response: Nothing is killed and nothing is removed; the stop fails with the pid and its command line in the message.
  - User impact: The user sees which process holds the pid and decides; no second daemon can start on the same store.
- **An error escapes every handler after the store has failed (an unhandled rejection or an uncaught exception).** (recoverable)
  - Detection: reportFatal runs and reads StoreHealth as locks-lost.
  - Response: It writes its line synchronously, removes the pid file and the socket, and ends the process by SIGKILL to itself; it does not call process.exit.
  - User impact: The daemon is gone and can be started again, where it would otherwise hang with its pid file in place.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A test sets a temporary path with setGraphStorePath and never declares ownership. | The store opens as today; the owner check applies to the live path only. |
| The live path is reached by a different spelling: a relative path, a path through a symbolic link, or a home directory given with a trailing slash. | Refused when the owner flag is unset: both sides of the comparison are resolved first. |
| The daemon declares ownership and a child process it spawns (a CLI provider, a test run started by a build) imports the store. | The child is refused: the flag is a module variable of the daemon's process and is not inherited. |
| The daemon's entry point is run with a temporary home in a test. | It declares ownership and opens the store at that home's path; the live path of the test's environment is the temporary one. |
| stopDaemon is called when no daemon is running and no pid file exists. | Rejects with 'daemon is not running', as today; nothing is killed and no outcome object is returned. |
| A stop is requested twice while the first is in progress. | The daemon's existing guard ignores the second signal; the control path's wait covers both. |
| The store fails during the shutdown itself, after the health was read as ok. | The daemon may hang in the library's close; the control path's forced kill ends it. This is the case the escalation exists for. |
| A store compaction closes and reopens the store inside the daemon. | Unchanged: the owner flag stays set for the life of the process and the reopen passes the check. |
| The MCP server's process, which has made the permitted-reader declaration, opens the live store. | Allowed until Story s11. This is the one remaining process whose close could remove the daemon's locks; the stop and status parts of this Story are what contain the damage meanwhile. |
| The control script's start finds a daemon already running and hung. | The same forced-stop function as cmd_stop ends it, and the start goes on. |
| The CLI reviews an artifact while no daemon is running. | The source-root request fails, the review falls back to the repository root as it does today, and its output says that the fallback was used and why. |
| A synchronous transaction fails with code 22 for a reason other than lost locks. | The confirming probe read returns normally, nothing is recorded, and the original error is rethrown. |

**Invariants to preserve**

- A test that sets a temporary store path keeps working with no other change: 80 test files do so today and none of them declares ownership. [[c2]]
- getGraphStore returns one store per process and opens it lazily on first call; closeGraphStore closes it. Neither signature changes. [[c1]]
- A healthy daemon's shutdown is unchanged: it drains the queue, closes its connections in the same order, clears the pid file and exits, with the same 20-second backstop. [[c2]]
- The daemon's status request never throws and its existing fields keep their meaning; the new field is optional and absent when the store is healthy. [[c2]]
- A stop of a daemon that stops by itself reports and behaves as today; the forced kill happens only after the existing wait has ended without a stop. [[c1]]
- A client session's step tools keep working throughout this Story: the MCP server's process is not refused the store until Story s11 has moved its reads into the daemon. [[c2]]

## 5. Test strategy

**Test framework:** `node:test run through tsx (`npx tsx --test`), test files named *.test.ts under __tests__ directories, as the repository's existing suites are; child processes are started with node's child_process for the two-process cases.`

**Test levels**

- **unit** — The owner check, the health record and the named errors, on temporary stores with no second process.
  - Subjects: `owner check: with the path left at its default and no declaration, getGraphStore rejects with LmdbStoreNotOwnerError and no file is created at the path (the test points the home directory at a temporary one, so the 'live' path is temporary)`, `owner check: after the declaration the same open succeeds`, `owner check: a temporary path set through setGraphStorePath opens without a declaration`, `owner check: the live path spelled as a relative path and through a symbolic link is refused`, `health record: after locks-lost, a further store call throws the named error without calling the library, and closeGraphStore resolves without calling the library's close`, `daemon status: the status payload has no storeFailure field when healthy and carries kind, time, operation and cause when the record is locks-lost`, `stop outcome: stopDaemon with an injected process table returns forced false when the daemon stops by itself, forced true after the wait when it does not, kills nothing when the pid is not a daemon, and throws when the pid survives the kill`, `owner check: a process that has made only the permitted-reader declaration opens the live path, and a process that has made neither is refused`, `health record: after locks-lost, getGraphStore itself rejects with the named error`, `daemon status: with the store failed, the handler returns an empty repository list and storeFailure, and does not throw`, `stop outcome: with no socket and no live pid, stopDaemon rejects with 'daemon is not running', as today`, `stop outcome: a live pid whose command line does not end in daemon/index.js is not killed, its pid file is kept, and the stop fails naming it`, `dispatcher: a handler that throws an error with code -30775 leaves StoreHealth locks-lost and the caller receives the named error`, `CLI review: with an injected source-root reader that rejects, the review falls back to the repository root and its output says so`, `sync wrapper: an error with code 22 whose confirming probe read succeeds is rethrown and leaves StoreHealth ok`
  - Fixtures: `a temporary home directory per test, so that the default store path is never the user's real one`, `a fake process table for stopDaemon (alive, command line, kill)`
- **integration** — The two-process sequences that reproduce the failure and prove each remedy, on a temporary store. These are the tests that would have caught the issue.
  - Subjects: `reproduction, kept as a test of the mechanism and run against the real library, not a hand-made error: process A opens a temporary store; A opens and closes a second descriptor on the lock file; process B opens, writes and closes; then in A a read throws code -30775, a synchronous transaction throws code 22, and an asynchronous transaction has not settled after 3 seconds. This pins the three behaviours the detection rests on and fails if a library upgrade changes any of them.`, `detection through the real wrappers: the same broken store used through withWriteTxn records locks-lost by its probe within the bound (shortened for the test) and rejects with the named error; through withWriteTxnSync it records at once; a read through the dispatcher records at once`, `refusal: with a temporary home, process A declares ownership and opens the store; process B, not declared, calls getGraphStore and is refused with LmdbStoreNotOwnerError; A then writes successfully; the lock file was never opened by B`, `store failure to stop: a child process that runs the daemon's shutdown routine with its store brought to locks-lost by the reproduction sequence exits within 5 seconds of the stop request, the pid file and the socket file are gone, and a second start in the same home succeeds`, `status after failure: the same child, before the stop, answers the status request with storeFailure whose cause names another process and does not contain 'semume'`, `forced stop: a child process that ignores the shutdown request and SIGTERM is ended by stopDaemon after a shortened wait; the outcome is forced true with its pid; the pid file and socket are removed`, `control script: scripts/daemon-ctl.sh stop against the same stubborn child, with the wait shortened through an environment override, kills it, removes the pid file and the socket, and exits 0 with the 'killed' line in its log`, `control script start: scripts/daemon-ctl.sh start against a stubborn running child kills it through the shared function and starts a new daemon`, `forced stop, silent daemon: a child that accepts the connection and never replies is ended by stopDaemon after the 5-second bound and the wait`, `diagnostic through the tools' route: fs.promises.readFile of the lock file inside the daemon process writes the warn line with a call stack`, `file tools: each tool's own execute refuses the store file and its lock file, by direct path and through a symbolic link: read, edit, multi-edit, copy (as source and as target), move (as source and as target), delete and write, and grep among the search tools`, `fatal after failure: a child with its store brought to locks-lost that then raises an unhandled rejection exits within 5 seconds with its pid file and socket gone`, `periodic check: with the store's locks removed and no request or write made, the reader check's probe records locks-lost at its next run (interval shortened for the test)`, `CLI review through the daemon: a review run from the CLI's service against a daemon in a temporary home obtains its source roots through the request, and the CLI's process holds no descriptor on the store file`
  - Fixtures: `a child-process helper that opens a store at a given path, optionally declares ownership, and reports over standard output`, `a stubborn child that ignores SIGTERM and never closes its socket`, `an environment override for the control script's 30-second wait, used only by the test`
- **smoke** — The installed daemon, once, after the change is deployed. Not automated; recorded beside the build.
  - Subjects: `with the installed daemon running, a script outside it that imports the store is refused, and a daemon write afterwards succeeds`, `daemon-ctl.sh restart on a healthy daemon behaves as before`, `the two formerly live-store test files pass while the installed daemon runs, and the daemon's log shows no lock-file open from them`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: refusal (process B, with neither declaration, is refused the live store; process A then writes successfully)`, `unit: owner check, including the permitted-reader case`, `integration: CLI review through the daemon (the CLI's process opens no store)`, `note: the MCP server's process is exempt until Story s11, whose own tests prove that it opens no store` |
| `ac2` | `integration: store failure to stop (exit within 5 seconds, pid file and socket gone, second start succeeds)`, `integration: forced stop through stopDaemon`, `integration: control script stop`, `unit: stop outcome, the four cases`, `integration: control script start against a hung daemon`, `integration: forced stop, silent daemon`, `integration: fatal after failure` |
| `ac3` | `integration: status after failure (cause names another process, no 'semume')`, `unit: daemon status payload with and without the field`, `unit: status handler with the store failed returns an empty repository list and storeFailure`, `integration: detection through the real wrappers (asynchronous write, synchronous write, read)`, `integration: reproduction against the real library (the three measured behaviours)`, `integration: periodic check records a failure no request has met` |

## 6. Migration

**State before:** Per the s1 bundle on the store and the stop, and the direct reads recorded with it: getGraphStore opens whatever path is set, and the path defaults to the live store, so any process that imports the store layer opens the live store; the MCP server does so for every analyze step, which runs in its own process and reads the store directly for scope resolution, the last-indexed time, every lookup and the cache, and two test files do so because they set no temporary path. Nothing in src handles the library's lock failure: it reaches the log as the library's text about a system limit. The daemon's shutdown ends in process.exit on both of its paths, and stopDaemon and the control script give up after 30 seconds with the daemon left half down. DaemonStatus has no field for a store failure.

**State after:** The live store opens only in a process that has declared itself its owner (the daemon) or, until Story s11, a permitted reader (the MCP server); every other process is refused before any file is opened. A lock failure is recorded once as locks-lost with its true cause, raised as a named error by the write wrappers and by getGraphStore, and shown in the daemon's status, whose handler answers even when the store has failed. A daemon whose store has failed ends itself without calling process.exit; a stop that overruns is finished by a forced kill from stopDaemon or from the control script's stop and start, which clean the pid file and the socket and say what they did. Any open of the store's lock file inside the daemon is logged with its call stack. Story s11 then moves the step tools into the daemon and removes the permitted-reader declaration, which completes acceptance criterion ac1.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add the health record and the two named errors, with detection at the three measured places: the synchronous write wrapper (codes 22 and -30775), the asynchronous write wrapper's bounded wait and read probe, the three catch sites of the daemon's request server and the queue's job runner for a failing read, and the probe in the periodic reader check. Add the optional storeFailure field to the daemon's status and its mirrored types; the status handler guards its read of the repository list. Nothing else reads the record yet. — ↩ rollbackable
2. Change the stop paths: stopDaemon bounds its shutdown request, returns an outcome and forces the stop after its wait, killing only a pid whose command line ends in daemon/index.js; restart reports a forced stop and goes on; the control script gets one forced-stop function used by its stop and by the stale-daemon branch of its start. Independent of every other step, and useful by itself against the hang as it occurs today. — ↩ rollbackable
3. Change the daemon's shutdown, closeGraphStore and getGraphStore to read the health record: getGraphStore throws the named error once the store has failed, and the shutdown and the close skip the store's close and end by a kill signal to itself when the record is locks-lost. Requires step 1. The shutdown does not wait for the queue when the store has failed, and reportFatal ends the same way. — ↩ rollbackable
4. Give the two test files that reach the live store a temporary one, and thread the optional reader through the three review functions, add the read-only daemon request, and have the CLI's review pass a reader that calls it, with its fallback stated in the review's output. Repeat the search for openers over everything the CLI's and the MCP server's entry points import. — ↩ rollbackable
5. Add the two declarations, call the owner one from the daemon's entry point and the permitted-reader one from the MCP server's entry point, and switch on the refusal in getGraphStore. This is the step that can break a caller, so it comes after the two test files have been moved; the full test sweep is run with it before it is committed, and any test it newly fails is a test that was opening the live store. — ↩ rollbackable
6. Add the lock-file open diagnostic in the daemon and the refusal of the store's two files, called from the file tools' shared path helper, from the copy and move tools themselves, and from the search tools. — ↩ rollbackable
7. Deploy: update the installed daemon, then restart client sessions so that their MCP server processes run the new code. Run the smoke checks (an outside script is refused; a restart of a healthy daemon behaves as before; an analysis from a client session still works). — ↩ rollbackable
8. Hand-over to Story s11: when s11 has moved the step tools into the daemon it deletes the permitted-reader declaration and its call, after which the MCP server's process is refused like any other. Not part of this Story's delivery. — ↩ rollbackable

**Backward compat:** No stored data changes and no migration of the store is involved. DaemonStatus gains one optional field, absent when the store is healthy, so a consumer that does not know it is unaffected. stopDaemon's return changes from nothing to an outcome object and it no longer rejects on a time-out, though it still rejects when no daemon is running; its service type and its three callers in the CLI are updated in the same change. MaintenanceResult's steps list may contain a new value, 'force-stop'. The control script's stop now exits 0 after a forced kill where it exited 4. The one behaviour that can break an existing caller is the refusal of the live store to a process that is not the daemon: by design it breaks any test or script that opened the live store without setting a temporary path. The MCP server's process keeps its access through the temporary declaration until Story s11, so client sessions are unaffected by this Story.

## 7. Alternatives considered

### 7.1 a1: An explicit owner declaration in the store, a recorded store health, and a stop that ends from outside the main thread — **CHOSEN**

The daemon declares itself the store's owner before it opens it; the store refuses the live path to anyone else; a store failure is recorded once and read by status and by shutdown; the stop is finished by a forced kill, from the daemon itself when it knows the store has failed and from the control paths otherwise.

The store module gains an explicit declaration of who may open the live path. The daemon's entry point makes it before its first open; the store's open checks it whenever the path is the live one and throws a named error otherwise, so a temporary path set by a test stays open to anyone. The MCP server's process, which runs the analyze step itself and reads the store directly, is let in by a second, temporary declaration until Story s11 has moved that work into the daemon; the two test files that reach the live store get a temporary one. A store failure is recorded in one place: the store's write wrapper recognises the library's lock failure, records it with a true description of the cause, and raises a named error in place of the library's text. The daemon's status reads that record.

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
- **[[c11]]** `code` `src/mcp/server.ts` — "async (rawArgs, _extra) => handleAnalyzeStep(rawArgs),"
- **[[c12]]** `prior-artifact` `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/EXT.md`
- **[[c13]]** `step-output` `Measurement of 2026-10-11 on a temporary store whose locks had been removed: a read threw code -30775; a synchronous transaction threw code 22 'Invalid argument'; an asynchronous transaction had not settled after 3 seconds, and a synchronous transaction attempted after it hung.`
- **[[c14]]** `code` `src/cli/services/daemon.ts` — "export const DAEMON_ENTRY = join(__dirname, '../../daemon/index.js');"

## 9. Feedback

- **Subho Ghosh** (2026-10-11T08:36:26.977Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/LLD.md`: Revised 2026-10-11 after the first daemon review (block: 2 HIGH, 3 MED) and the stakeholder's decision to run the step tools inside the daemon (Story s11). (1) The analyze step runs in the MCP server's process and reads the live store directly, far beyond its cache; the cache move is taken out of this Story and the whole move belongs to s11. Until s11 lands the MCP server is let in by a temporary permitted-reader declaration, which s11 deletes; acceptance criterion ac1 is met in full only then. (2) The status handler guards its store read so that it answers after a store failure. (3) Reads have no wrapper; getGraphStore raises the failure. (4) A stop of a stopped daemon stays an error, as today. (5) The control script's start shares the forced-stop function with its stop. The pid check reuses DAEMON_ENTRY.
- **Subho Ghosh** (2026-10-11T08:47:09.017Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/LLD.md`: Revised twice more on 2026-10-11, after the second and third daemon reviews (blocks of 5 and 4). Detection now follows a measurement of the failed store: a read throws -30775, a synchronous transaction throws 22, an asynchronous transaction never settles; so the asynchronous wrapper bounds its wait and probes with a read, the synchronous wrapper confirms code 22 with the same probe, the request server and queue catch a failing read, and the periodic reader check probes too. Also: the CLI review reaches source roots through a daemon request; stopDaemon bounds its request and never removes the pid file of a live non-matching process; the refusal of the store files is called from the copy and move tools themselves; reportFatal and a stop with the store failed end by self-kill without waiting for the queue. The third round's fixes are NOT re-reviewed.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**4 do not hold · 2 could not be verified · 9 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-11T08:42:31.181Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| change-sites | HIGH | A refusal placed in resolvePath (src/daemon/tools/builtins/file/helpers.ts) covers every file tool, including copy and move. | file_copy and file_move never call resolvePath when they run. copy.ts:8 imports only 'str, fail, FS_MOVE_ACCESS' and its execute does 'const src = resolve(from); const dst = resolve(to);' (57-58) then 'await fs.cp(src, dst, ...)' (75); move.ts:56-57 does the same and falls back to fs.cp at 79. Their only link to resolvePath is FS_MOVE_ACCESS.extractKey (helpers.ts:59-64), and a search of src for 'extractKey' finds no caller at all: only the declarations in the tools and the interface in src/shared/access.ts. So with the refusal built where the design puts it, file_copy still reads the lock file in the daemon's process, which the design itself names as the one known way to drop the lock. fs.cp is also not among the functions the diagnostic wraps, so the copy would not be logged either. The design's own test ('checked through the shared path helper for ... copy ... and move') would pass against the helper while the two tools stay open. [files: src/daemon/tools/builtins/file/copy.ts, src/daemon/tools/builtins/file/move.ts, src/daemon/tools/builtins/file/helpers.ts, src/shared/access.ts] | Put the refusal in a helper that copy.ts and move.ts call in execute (for both 'from' and 'to') and in buildApprovalGate, or make the two tools use resolvePath. Add fs.cp and its promise form to the wrapped functions. Test the refusal by calling each tool's execute, not the helper. Also decide whether the check resolves symbolic links: resolvePath uses path.resolve, which does not. |
| change-sites | MED | The shutdown's two ends are the only places where the daemon calls process.exit after its store has failed, so changing them establishes the invariant 'once locks-lost, the daemon never calls process.exit'. | src/daemon/index.ts:49-65: reportFatal, registered for both 'uncaughtException' and 'unhandledRejection', ends with 'setTimeout(() => { process.exit(1); }, 50).unref();' (line 61). The design makes the write wrapper and getGraphStore reject with LmdbStoreLocksLostError; any such rejection that is not awaited (the shutdown itself uses 'void disposeChatHandlers()', 'void watcher.close()', and timers call asynchronous code) reaches this handler, which calls process.exit, whose exit hook the design says never returns. The daemon is then hung with its pid file in place and health recorded, which is the state the invariant exists to prevent. The section lists only the shutdown as a call site. [files: src/daemon/index.ts] | Add reportFatal to section 3.4: when StoreHealth is locks-lost it removes the pid file and socket, writes its line synchronously (it already does, lines 52-56) and ends by SIGKILL to itself. Add a test: an unhandled rejection after locks-lost ends the process. |
| change-sites | MED | The daemon's request dispatcher and its queue's job runner are the two places every store-using call passes through, so catching the read failure there records it. | src/daemon/server.ts has three separate catch sites, not one: the standard request (177-183), the standard handler reached through a stream request (192-198), and the stream handler (226-233). All three reduce the error to its message ('const msg = err instanceof Error ? err.message : String(err)'), so the code must be read before that line at each. The queue runner is one site (src/daemon/queue.ts:178-181, 'log.error({ err }, 'job failed')'). Store reads also run outside both: the timers in src/daemon/index.ts (readerCheckTimer at 1959, pruneTimer) and the boot sequence (263-273). And a handler that swallows its own failures never lets the error reach the dispatcher: resolveSourceRoots (src/workflow/review/source-roots.ts:93-99) catches every read failure and falls back. In those cases the failure is recorded only by a later write's 10-second probe. [files: src/daemon/server.ts, src/daemon/queue.ts, src/daemon/index.ts, src/workflow/review/source-roots.ts] | Name the three catch sites in server.ts in the design. State that a read outside the dispatcher and the queue, or inside a handler that swallows errors, is detected by the next write or the next dispatched read, and that this is accepted. Consider one cheap alternative: have the periodic reader check (already every 5 minutes) do the probe read and record the failure. |
| change-sites | MED | The CLI's in-process review can be given an injected source-root reader by changing the CLI's call alone. | The reader cannot be passed from the CLI today. src/cli/services/workflow.ts:248 calls reviewArtifactFile({ mdPath, jsonPath, repo, provider, model, reviewedAt }); the chain is reviewArtifactFile (src/workflow/review/run-artifact.ts:69) -> review (src/workflow/review/review.ts:85 'await gatherEvidence(claims, repo)') -> gatherEvidence(claims: Claim[], repoPath: string) (probe.ts:190) -> 'await resolveSourceRoots(repoPath)' with no options (probe.ts:195). Three signatures between the CLI and the seam need a new optional parameter, and the same functions run in the daemon (src/daemon/workflow-review-rpc.ts:100) and in the MCP server's review step, where the default reader must stay. None of these files, nor the new daemon request and its handler, appears in any call-site list of the design. The claim about the read path itself is true: source-roots.ts:57-60 reads through getDb and listEntitiesForRepo, and no file under src/cli or src/bin imports the store layer directly. [files: src/cli/services/workflow.ts, src/workflow/review/run-artifact.ts, src/workflow/review/review.ts, src/workflow/review/probe.ts, src/daemon/workflow-review-rpc.ts] | Add a contract entry for the threaded option (ReviewArtifactOpts, the review options, gatherEvidence) and for the new read-only daemon request with its name, parameters and result. State that the option is optional so the daemon and MCP callers are unchanged. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| error-paths | A daemon that knows its store has failed stops within its normal stop time: the shutdown reads StoreHealth, skips the close, clears the pid file and socket and kills itself. | The self-kill sits after the queue drain in today's structure: the close and the exit are inside 'void queueDone.finally(async () => {...})' (src/daemon/index.ts:2012-2028), and queue.stop() (src/daemon/queue.ts:189-192) only stops the loop 'after the current job finishes'. The design does not say whether, with locks-lost, the daemon waits for queueDone or ends at once. If it waits, a job hung in a store call ends only at the 20-second backstop (and the design's test expects an exit within 5 seconds); the summary says 'ends itself at once', section 3.4 says it 'stops the queue ... as today'. I could not settle which is meant from the text, and I did not run a daemon with broken locks. [files: src/daemon/index.ts, src/daemon/queue.ts] | State in section 3.4 that with locks-lost the shutdown does not wait for queueDone: it runs the clean-up and the self-kill directly from shutdown(). Keep the 5-second test as the proof. |
| error-paths | The three measured behaviours the detection rests on (a read throws code -30775, a synchronous transaction throws code 22, an asynchronous transaction never settles) and the claim that process.exit and the library's close hang once the locks are gone. | These come from the design's own measurement of 2026-10-11 (reference c13). The source confirms only that nothing in src handles them: store.ts has no catch around transaction or transactionSync and classifyOpenError (669-695) covers open failures only. I did not run the two-process sequence against the installed lmdb-js, so the codes, and the choice of code 22 as a lock-failure signal, are unconfirmed here. Code 22 is the general 'Invalid argument'; treating every code-22 failure of a synchronous transaction as locks-lost could record a terminal failure for another cause. [files: src/db/graph/store.ts] | Keep the reproduction test as the first thing built, as the design plans, and have withWriteTxnSync confirm a code-22 failure with the same probe read before it records locks-lost, since the record cannot be cleared without a restart. |
