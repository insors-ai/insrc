# Story s4, Task t12: smoke checks on the installed daemon

Run on 2026-10-12 against the installed daemon at `~/.insrc/daemon`, after
`main` was pushed at `d8ce093e` and the daemon updated with the CLI's
`update()` (sync, build, reconcile, steering refresh; no install needed).
Before the restart only the daemon held `~/.insrc/graph.lmdb` (lsof).

## 1. Restart through the CLI after the update

`restart()` from the installed `out/cli/services/maintenance.js`:
`{"ok":true,"steps":["stop","start"]}`. The old daemon stopped by itself
(no `force-stop` step). The new daemon (pid 56552, Node 22) answered
`daemon.status` with `installedCommit d8ce093e`, 6 repositories, and no
`storeFailure`.

## 2. An outside script is refused; a daemon write afterwards succeeds

A script that imports `src/db/graph/store.ts` and calls `getGraphStore()`
(10:30:49 UTC):

    OUTSIDE: refused: LmdbStoreNotOwnerError: Refusing to open the live graph store at '/Users/subhagho/.insrc/graph.lmdb': only the insrc daemon may open it. ...
    OUTSIDE: descriptors on the store files: []

Then, over the daemon's socket: `conversation.saveSession` → `{"ok":true}`;
`session.list` contains the new session; `session.delete` removed it
(`sessionRows: 1`); `daemon.status` → `storeFailure: null`. Afterwards lsof
shows the daemon as the only holder of the lock file. **Pass.**

## 3. Restart of a healthy daemon behaves as before

`daemon-ctl.sh restart --skip-sync --skip-install --skip-build` (10:31:14 UTC):

    stopping daemon
    SIGTERM daemon (pid 56552)
    daemon shut down
    spawning daemon (.../out/daemon/index.js)
    daemon running (pid 57247, ...)

Exit 0. The stop drained in about one second with no forced kill, the old
pid is gone, and the new daemon reports `installedCommit d8ce093e` with no
`storeFailure`. **Pass.**

## 4. The two formerly live-store test files pass while the daemon runs

With the real home and the installed daemon running (10:31:28 UTC):
`freeform-probe-scope.test.ts` 3 pass, `phase5-explorations-params.test.ts`
16 pass, 0 fail, no `LmdbStoreNotOwnerError`. Afterwards lsof shows the
daemon (pid 57247) as the only holder of the store files. The daemon's log
(`/tmp/.insrc/daemon.14.log`, 377 lines from pid 57247) holds no warning
from the store-file open diagnostic ("a file of the graph store was
opened") and no lock-loss line. **Pass.**

## 5. An analysis from a client session still works

A fresh MCP server started from the installed build (`out/bin/insrc-mcp.js`)
answered `insrc_analyze_step` `phase:'start'` in 1.3 s with
`next: emit_plan`, and no `LmdbStoreNotOwnerError`. That process then held
`~/.insrc/graph.lmdb` and `graph.lmdb-lock`, under the temporary
permitted-reader declaration. It was ended by SIGKILL (no close). A daemon
write, read and status afterwards were all healthy. **Pass.**

Client sessions started before the update still run the earlier MCP code
until they are restarted. That code opens the store without the
declaration, and nothing refuses it.

## Hand-over to Story s11

Story s4's first acceptance criterion (only the daemon opens the live store)
is now met for **every process but the MCP server**. The MCP server keeps
access through `declareLiveStoreReaderUntilS11()` (its definition in
`src/db/graph/store.ts`, its one call in `src/mcp/server.ts`). Check 5 shows
it still opens the store in its own process. Story s11 moves the analyze step
and the in-process daemon builtins (ISSUE-e980ffbb6dd346e7) into the daemon,
deletes that function and its call (s11 criterion ac6), and so completes s4's
criterion.
