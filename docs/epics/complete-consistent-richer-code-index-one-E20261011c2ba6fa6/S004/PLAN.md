<!-- insrc:artifact PLAN-c2ba6fa62a148ed1-s4 -->

# Plan: E20261011c2ba6fa6:S004

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**LLD run:** `wf-1791706729518-uons4y`
**LLD effective hash:** `fa332202b032...`

Building this Story is twelve tasks in three strands. The first two tasks make the CLI and the control script able to end a daemon that will not stop, and help at once. The next five pin how the store library behaves once its locks are gone, record that failure by name, show it in the daemon's status and let the daemon end itself cleanly. The last strand closes the door: the CLI's review reads through the daemon, the two tests that used the live store get a temporary one, the store refuses every process that has not declared itself (with a temporary allowance for the MCP server that Story s11 removes), and any open of the store's files inside the daemon is logged; a smoke check on the installed daemon ends it.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Make the CLI's stop and restart always end the daemon | M | — | unit: stop outcome with an injected process table: stops by itself, forced after the wait, pid not a daemon, pid survives the kill; unit: stop outcome: no socket and no live pid rejects with 'daemon is not running'; unit: stop outcome: a live pid whose command line does not match is not killed and its pid file is kept; integration: forced stop: a child that ignores the request and SIGTERM is ended by stopDaemon; integration: forced stop, silent daemon: a child that accepts the connection and never replies is ended | [[c1]] [[c3]] |
| 2 | **`t2`** Give the control script one forced stop, used by its stop and its start | S | — | integration: control script stop against a stubborn child; integration: control script start against a stubborn running child; integration: control script leaves a live non-matching pid alone and exits non-zero | [[c1]] [[c5]] |
| 3 | **`t3`** Pin the library's behaviour after its locks are removed, as a two-process test | M | — | integration: reproduction against the real library: read throws -30775, synchronous transaction throws 22, asynchronous transaction does not settle; integration: control case: without the second descriptor, the other process's close leaves the first process's write working | [[c4]] [[c3]] |
| 4 | **`t4`** Record a store failure once and raise it by name | M | `t3` | integration: detection through the real wrappers: asynchronous write by probe, synchronous write at once; unit: health record: after locks-lost a further store call throws the named error and closeGraphStore skips the library's close; unit: health record: after locks-lost getGraphStore itself rejects with the named error; unit: sync wrapper: code 22 with a succeeding probe read is rethrown and leaves the record ok; integration: slow healthy write: the probe runs and returns, nothing is recorded, the write completes | [[c2]] [[c1]] [[c3]] |
| 5 | **`t5`** Catch a failing read where requests and jobs are served, and probe on the periodic check | S | `t4` | unit: dispatcher: a handler throwing code -30775 records locks-lost and the caller gets the named error, at each of the three server sites and the queue runner; integration: detection through the real wrappers: a read through the dispatcher records at once; integration: periodic check records locks-lost when no request or write has met the failure | [[c2]] [[c3]] |
| 6 | **`t6`** Show the store failure in the daemon's status | M | `t4` | unit: daemon status payload: no storeFailure when healthy; kind, time, operation and cause when locks-lost; unit: status handler with the store failed returns an empty repository list and storeFailure and does not throw; unit: daemon pane and both plugins: the cause line is shown when the field is present, and a status without it is accepted | [[c2]] [[c3]] |
| 7 | **`t7`** End the daemon without the hanging exit once its store has failed | M | `t4`, `t6` | integration: store failure to stop: exit within 5 seconds, pid file and socket gone, second start succeeds, last log line names the skipped close; integration: status after failure: storeFailure names another process and does not contain 'semume'; integration: fatal after failure: an unhandled rejection with the store failed ends the process within 5 seconds; integration: healthy shutdown is unchanged: queue drained, connections closed in order, normal exit | [[c2]] [[c3]] [[c4]] |
| 8 | **`t8`** Let the CLI's review read source roots through the daemon | M | — | integration: CLI review through the daemon: source roots come through the request and the CLI's process holds no descriptor on the store; unit: CLI review: a rejecting reader falls back to the repository root and the output says so; unit: review with no reader passed uses the default reader, as the daemon and the MCP server do | [[c2]] [[c3]] |
| 9 | **`t9`** Move the two live-store tests to a temporary store and search again for openers | S | `t8` | unit: the two formerly live-store test files pass against a temporary store and create nothing at the default path | [[c1]] [[c5]] |
| 10 | **`t10`** Refuse the live store to every process that has not declared itself | M | `t8`, `t9` | unit: owner check: default path with no declaration is refused and no file is created; unit: owner check: after the declaration the same open succeeds, also after a close and reopen; unit: owner check: a temporary path opens without a declaration; unit: owner check: the live path as a relative path and through a symbolic link is refused; unit: owner check: permitted-reader only opens the live path; neither declaration is refused; integration: refusal: process B is refused and never opens the lock file; process A then writes; a child of a declared process is refused; unit: source scan: the permitted-reader function's name appears at exactly two places | [[c1]] [[c2]] [[c5]] |
| 11 | **`t11`** Log any open of the store's files inside the daemon, and refuse them in its file tools | M | — | integration: diagnostic through the tools' route: fs.promises.readFile of the lock file logs one warn line with a stack, once per stack; integration: file tools: each tool's own execute refuses the store file and its lock file, by direct path and through a symbolic link | [[c2]] [[c3]] |
| 12 | **`t12`** Check the installed daemon after the change and record it | S | `t1`, `t2`, `t5`, `t6`, `t7`, `t10`, `t11` | smoke: installed daemon: an outside script is refused and a daemon write afterwards succeeds; smoke: installed daemon: restart of a healthy daemon behaves as before; smoke: installed daemon: the two formerly live-store test files pass and the log shows no lock-file open from them | [[c4]] [[c5]] |

### 1.1 E20261011c2ba6fa6:S004:T001 — Make the CLI's stop and restart always end the daemon

stopDaemon bounds its shutdown request at 5 seconds, waits as today, and after a wait without a stop kills the pid in the pid file, but only when that pid's command line ends in daemon/index.js; it removes the pid file and socket after a kill and returns an outcome with forced and pid. A live pid that does not match is not killed and nothing is removed. A stop with no daemon running still rejects as today. Update the service type and the three callers; restart reports a forced stop and goes on to start. Ordered first with the next Task: neither depends on anything, and they are what helps against the hang as it occurs today.

**Acceptance checks:**
- With an injected process table: forced false when the daemon stops by itself; forced true with the pid after the wait when it does not
- A child that accepts the connection and never replies is ended after the 5-second bound and the wait
- A child that ignores the request and SIGTERM is ended, and its pid file and socket are removed
- A live pid whose command line does not end in daemon/index.js is not killed, its pid file is kept, and the stop fails naming it
- With no socket and no live pid the stop rejects with 'daemon is not running'
- restart's steps include 'force-stop' after a forced stop and the start follows

### 1.2 E20261011c2ba6fa6:S004:T002 — Give the control script one forced stop, used by its stop and its start

Add one shell function that, after wait_for_daemon_stop fails, checks that the pid's command line ends in daemon/index.js, sends SIGKILL, waits for the process to be gone, removes the pid file and the socket and logs the 'killed' line; call it from cmd_stop and from the stale-daemon branch of cmd_start. A live pid that does not match is not killed and the script dies naming it. Add an environment override of the 30-second wait for the test.

**Acceptance checks:**
- daemon-ctl.sh stop against a stubborn child kills it, removes the pid file and socket, exits 0 and logs the 'killed' line
- daemon-ctl.sh start against a stubborn running child kills it through the same function and starts a new daemon
- A live pid whose command line does not match is left alone and the script exits non-zero naming it
- A stop of a healthy daemon behaves and exits as before

### 1.3 E20261011c2ba6fa6:S004:T003 — Pin the library's behaviour after its locks are removed, as a two-process test

Build the child-process helper (opens a store at a given path, optionally declares, reports over standard output) and the reproduction test against the real library on a temporary store: process A opens and writes, A opens and closes a second descriptor on the lock file, process B opens, writes and closes; then in A a read throws code -30775, a synchronous transaction throws code 22, and an asynchronous transaction has not settled after 3 seconds. Every child is ended by a kill from the test, since a broken process never exits by itself.

**Acceptance checks:**
- The test passes on the bundled library and asserts the three behaviours separately
- Without the second descriptor being opened and closed in A, the same sequence leaves A's write working
- No child process is left running after the test file ends, also when an assertion fails

### 1.4 E20261011c2ba6fa6:S004:T004 — Record a store failure once and raise it by name

Add the health record, getStoreHealth, recordStoreFailureIfLockError and the error LmdbStoreLocksLostError to the store module. withWriteTxnSync confirms a code 22 or -30775 failure with a probe read before recording. withWriteTxn bounds its wait at 10 seconds, probes with a read, records and rejects when the probe throws -30775, and goes on waiting when the probe returns. Once the record is locks-lost, getGraphStore throws the named error and closeGraphStore resolves without calling the library's close.

**Acceptance checks:**
- On the broken store from t3, withWriteTxn records locks-lost through its probe within the bound (shortened for the test) and rejects with the named error
- On the same store withWriteTxnSync records at once; a code 22 failure whose probe read succeeds is rethrown and leaves the record ok
- The named error's message names another process and does not contain 'semume'
- After locks-lost, getGraphStore rejects with the named error and closeGraphStore resolves without calling the library
- On a healthy temporary store, a transaction whose callback is held open past the shortened bound is not recorded as a failure: the probe is observed to run and to return, and the write then completes

### 1.5 E20261011c2ba6fa6:S004:T005 — Catch a failing read where requests and jobs are served, and probe on the periodic check

At the three catch sites of the request server and at the queue's job runner, read the error's code before it is reduced to a message, record locks-lost for -30775 and answer with the named error. Make the daemon's periodic reader check also do the probe read and record a failure.

**Acceptance checks:**
- A handler that throws an error with code -30775 leaves the record locks-lost and the caller receives the named error, at each of the three server sites and in the queue runner
- With the locks removed and no request or write made, the periodic check records locks-lost at its next run (interval shortened for the test)

### 1.6 E20261011c2ba6fa6:S004:T006 — Show the store failure in the daemon's status

Add the optional storeFailure field to DaemonStatus and to the mirrored type in both editor plugins. Guard the status handler's read of the repository list so that, with the store failed, it returns an empty list and storeFailure and does not throw. Show the cause line in the CLI's daemon pane and in both plugins when the field is present.

**Acceptance checks:**
- A healthy daemon's status has no storeFailure field and its other fields are unchanged
- With the record locks-lost the status request answers with an empty repository list and storeFailure carrying kind, time, operation and cause
- The cause text does not contain 'semume'
- The CLI's daemon pane prints the cause line when the field is present
- Each editor plugin's mirrored type accepts a status with the field and without it, and its display shows the cause line when the field is present

### 1.7 E20261011c2ba6fa6:S004:T007 — End the daemon without the hanging exit once its store has failed

When the record is locks-lost, the shutdown does not wait for the queue: from the shutdown function it stops the queue, the watcher and the server, skips the store's close, removes the pid file and socket, writes its last log line synchronously and sends itself SIGKILL. reportFatal ends the same way in that state. With the record ok both are unchanged.

**Acceptance checks:**
- A child running the daemon's shutdown with its store brought to locks-lost exits within 5 seconds of the stop request; the pid file and socket are gone; a second start in the same home succeeds
- The last line of that child's log, written before the self-kill, says that the store's close was skipped and why
- A child with its store at locks-lost that raises an unhandled rejection exits within 5 seconds with its pid file and socket gone
- A healthy daemon's shutdown still drains the queue, closes its connections in the same order and exits through the same path

### 1.8 E20261011c2ba6fa6:S004:T008 — Let the CLI's review read source roots through the daemon

Add one optional reader field to the options of reviewArtifactFile, review and gatherEvidence and pass it down to resolveSourceRoots; add the read-only daemon request that returns a repository's entities for source roots; have the CLI's review pass a reader that calls it. State the fallback in the review's output when it is taken. The daemon's and the MCP server's callers pass nothing and are unchanged.

**Acceptance checks:**
- A review run from the CLI's service against a daemon in a temporary home gets its source roots through the request, and the CLI's process holds no descriptor on the store file
- With a reader that rejects, the review falls back to the repository root and its output says so and why
- The daemon's own review and the MCP server's review step return what they returned before

### 1.9 E20261011c2ba6fa6:S004:T009 — Move the two live-store tests to a temporary store and search again for openers

Give src/analyze/explore/__tests__/freeform-probe-scope.test.ts and phase5-explorations-params.test.ts a temporary store through setGraphStorePath; this part does not wait for anything. Then, after t8, repeat the search for code that opens the live store over everything the CLI's and the MCP server's entry points import, and record what it finds; any further opener is handled like the review's or raised before t10.

**Acceptance checks:**
- Both test files pass with a temporary home and create no file at the user's real store path
- The search's result is recorded with the list of entry points covered and every opener found, each marked handled or raised

### 1.10 E20261011c2ba6fa6:S004:T010 — Refuse the live store to every process that has not declared itself

Add the owner declaration and the temporary permitted-reader declaration (named so that Story s11 can find and delete it) to the store module; call the first from the daemon's entry point and the second from the MCP server's entry point; make getGraphStore refuse the live path, compared after resolving both sides, to a process that has made neither, with LmdbStoreNotOwnerError, before the library's open is called. Run the full test sweep with it and treat any newly failing test as an opener of the live store. The removal of the permitted-reader declaration is not in this plan: it belongs to Story s11 by that Story's criterion ac6.

**Acceptance checks:**
- With a temporary home: process A declares ownership and opens the store; process B, with neither declaration, is refused with LmdbStoreNotOwnerError and never opens the lock file; A then writes successfully
- A process with only the permitted-reader declaration opens the live path
- A temporary path set through setGraphStorePath opens without any declaration
- The live path given as a relative path and through a symbolic link is refused
- In a declared process, a close followed by a reopen succeeds, as a store compaction does
- A child process spawned by a declared process is refused the live path
- The full test sweep passes with the refusal on, run under Node 22
- The permitted-reader function's name appears at exactly two places in the source: its definition and the MCP server's one call

### 1.11 E20261011c2ba6fa6:S004:T011 — Log any open of the store's files inside the daemon, and refuse them in its file tools

At daemon start-up wrap the fs and fs/promises functions that open a file by path (open, readFile, copyFile, cp and their synchronous and promise forms, and createReadStream), re-sync the built-in exports, and log at warn the call stack of any open whose resolved path is the live store's lock file or data file, once per distinct stack. Add one refusal check, applied after symbolic links are resolved, called from the file tools' shared path helper, from the execute step and approval gate of copy and move for both paths, and from the search tools.

**Acceptance checks:**
- fs.promises.readFile of the lock file inside the daemon process writes one warn line with a call stack; a second call from the same stack writes none
- Each tool's own execute refuses the store file and its lock file, by direct path and through a symbolic link: read, edit, multi-edit, copy as source and as target, move as source and as target, delete, write, and grep
- A file tool call on any other path behaves as before

### 1.12 E20261011c2ba6fa6:S004:T012 — Check the installed daemon after the change and record it

Update the installed daemon, restart client sessions, and run the smoke checks once: an outside script that imports the store is refused and a daemon write afterwards succeeds; a restart of a healthy daemon behaves as before; an analysis from a client session still works; the two formerly live-store test files pass while the daemon runs. Record the result beside the build, with the hand-over note to Story s11 that the permitted-reader declaration is still in place.

**Acceptance checks:**
- Each smoke check is recorded with what was run and what was seen
- The record states that Story s4's first acceptance criterion is met for every process but the MCP server, and is completed by Story s11

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| owner check: with the path left at its default and no declaration, getGraphStore rejects with LmdbStoreNotOwnerError and no file is created at the path (the test points the home directory at a temporary one, so the 'live' path is temporary) | `t10` |
| owner check: after the declaration the same open succeeds | `t10` |
| owner check: a temporary path set through setGraphStorePath opens without a declaration | `t10` |
| owner check: the live path spelled as a relative path and through a symbolic link is refused | `t10` |
| health record: after locks-lost, a further store call throws the named error without calling the library, and closeGraphStore resolves without calling the library's close | `t4` |
| daemon status: the status payload has no storeFailure field when healthy and carries kind, time, operation and cause when the record is locks-lost | `t6` |
| stop outcome: stopDaemon with an injected process table returns forced false when the daemon stops by itself, forced true after the wait when it does not, kills nothing when the pid is not a daemon, and throws when the pid survives the kill | `t1` |
| owner check: a process that has made only the permitted-reader declaration opens the live path, and a process that has made neither is refused | `t10` |
| health record: after locks-lost, getGraphStore itself rejects with the named error | `t4` |
| daemon status: with the store failed, the handler returns an empty repository list and storeFailure, and does not throw | `t6` |
| stop outcome: with no socket and no live pid, stopDaemon rejects with 'daemon is not running', as today | `t1` |
| stop outcome: a live pid whose command line does not end in daemon/index.js is not killed, its pid file is kept, and the stop fails naming it | `t1` |
| dispatcher: a handler that throws an error with code -30775 leaves StoreHealth locks-lost and the caller receives the named error | `t5` |
| CLI review: with an injected source-root reader that rejects, the review falls back to the repository root and its output says so | `t8` |
| sync wrapper: an error with code 22 whose confirming probe read succeeds is rethrown and leaves StoreHealth ok | `t4` |
| reproduction, kept as a test of the mechanism and run against the real library, not a hand-made error: process A opens a temporary store; A opens and closes a second descriptor on the lock file; process B opens, writes and closes; then in A a read throws code -30775, a synchronous transaction throws code 22, and an asynchronous transaction has not settled after 3 seconds. This pins the three behaviours the detection rests on and fails if a library upgrade changes any of them. | `t3` |
| detection through the real wrappers: the same broken store used through withWriteTxn records locks-lost by its probe within the bound (shortened for the test) and rejects with the named error; through withWriteTxnSync it records at once; a read through the dispatcher records at once | `t4`, `t5` |
| refusal: with a temporary home, process A declares ownership and opens the store; process B, not declared, calls getGraphStore and is refused with LmdbStoreNotOwnerError; A then writes successfully; the lock file was never opened by B | `t10` |
| store failure to stop: a child process that runs the daemon's shutdown routine with its store brought to locks-lost by the reproduction sequence exits within 5 seconds of the stop request, the pid file and the socket file are gone, and a second start in the same home succeeds | `t7` |
| status after failure: the same child, before the stop, answers the status request with storeFailure whose cause names another process and does not contain 'semume' | `t7`, `t6` |
| forced stop: a child process that ignores the shutdown request and SIGTERM is ended by stopDaemon after a shortened wait; the outcome is forced true with its pid; the pid file and socket are removed | `t1` |
| control script: scripts/daemon-ctl.sh stop against the same stubborn child, with the wait shortened through an environment override, kills it, removes the pid file and the socket, and exits 0 with the 'killed' line in its log | `t2` |
| control script start: scripts/daemon-ctl.sh start against a stubborn running child kills it through the shared function and starts a new daemon | `t2` |
| forced stop, silent daemon: a child that accepts the connection and never replies is ended by stopDaemon after the 5-second bound and the wait | `t1` |
| diagnostic through the tools' route: fs.promises.readFile of the lock file inside the daemon process writes the warn line with a call stack | `t11` |
| file tools: each tool's own execute refuses the store file and its lock file, by direct path and through a symbolic link: read, edit, multi-edit, copy (as source and as target), move (as source and as target), delete and write, and grep among the search tools | `t11` |
| fatal after failure: a child with its store brought to locks-lost that then raises an unhandled rejection exits within 5 seconds with its pid file and socket gone | `t7` |
| periodic check: with the store's locks removed and no request or write made, the reader check's probe records locks-lost at its next run (interval shortened for the test) | `t5` |
| CLI review through the daemon: a review run from the CLI's service against a daemon in a temporary home obtains its source roots through the request, and the CLI's process holds no descriptor on the store file | `t8` |
| with the installed daemon running, a script outside it that imports the store is refused, and a daemon write afterwards succeeds | `t12` |
| daemon-ctl.sh restart on a healthy daemon behaves as before | `t12` |
| the two formerly live-store test files pass while the installed daemon runs, and the daemon's log shows no lock-file open from them | `t12`, `t9` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s4 contract details`
- **[[c2]]** `prior-artifact` `LLD s4 data model changes`
- **[[c3]]** `prior-artifact` `LLD s4 error paths`
- **[[c4]]** `prior-artifact` `LLD s4 test strategy`
- **[[c5]]** `prior-artifact` `LLD s4 migration`
