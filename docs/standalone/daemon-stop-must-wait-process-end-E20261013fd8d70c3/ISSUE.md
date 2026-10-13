<!-- insrc:artifact ISSUE-fd8d70c3e8c397ea -->

# A daemon stop must wait for the process to end, and a shut-down daemon must not stay alive after 'bye'

## Reproduction

Observed on 2026-10-13 while restarting the installed daemon with the restart() service function (src/cli/services/maintenance.ts): the running daemon (pid 57247, up for about 19 hours) logged 'shutdown signal received; draining...' and then 'bye', removed its pid file and closed its socket, but the process did not exit. restart() reported 'daemon stopped; starting', started a new daemon, and that daemon did not become ready within 60 s ('daemon did not become ready within 60 s') because the old process was still alive and still held the graph store. A later SIGTERM to pid 57247 had no effect; only SIGKILL ended it, after which startDaemon() brought up a working daemon. A second restart the same day (pid 81990) was clean. The same daemon log held 'MDB_LOCK_FAILURE: Failed to get robust semaphore' errors before the shutdown. Expected: a stop either sees the process end or reports that it did not, and a daemon that has logged 'bye' ends.

## Root cause

Two separate faults combine. (1) The stop decides 'stopped' from files, not from the process. waitForStop in src/cli/services/lifecycle.ts returns true as soon as neither the pid file nor the socket exists, and stopDaemonWith in src/cli/services/daemon.ts returns { stopped: true, forced: false } on that answer without checking that the pid is gone. But the daemon's own shutdown (createShutdown in src/daemon/shutdown.ts) clears the pid file (end.clearPid) and the request server is closed (server.close in the stopBackgroundWork of src/daemon/index.ts) BEFORE process.exit is called, so the files disappearing shows only that the shutdown began, not that it finished. Because the pid file is gone by then, the stop also no longer knows which pid to watch or kill. scripts/daemon-ctl.sh has the same rule in wait_for_daemon_stop. (2) The daemon can stay alive after 'bye': createShutdown logs 'bye' and then calls exitRespectingStoreHealth, which calls process.exit(0); pid 57247 nevertheless kept running. A further SIGTERM is turned into a log line by the shutdown's re-entrance guard ('shutdown signal received again; already in progress'), so a signal cannot end it either. What kept the process alive after process.exit(0) is not established; the semaphore failures in its log (the condition tracked by ISSUE-0d577569) are a candidate, not a proven cause.

## Fix intent

A stop reports the daemon stopped only when the daemon's process has actually ended; when it has not ended within the wait, the stop ends it as the forced-stop path already does for a daemon that overruns, so a new daemon is never started beside a living one. This holds for the CLI service functions and for scripts/daemon-ctl.sh alike. Separately, a daemon that has finished its shutdown ends for certain even when something in the process keeps it from exiting normally, and the reason it did not exit on 2026-10-13 is diagnosed and recorded.

## Citations

- **[[c1]]** `code` `src/cli/services/lifecycle.ts` — "export async function waitForStop(timeoutMs = 30_000) ... if (!existsSync(PATHS.pidFile) && !existsSync(PATHS.sockFile)) return true;"
- **[[c2]]** `code` `src/cli/services/daemon.ts` — "if (await deps.waitForStop(deps.stopWaitMs)) return { stopped: true, forced: false };"
- **[[c3]]** `code` `src/daemon/shutdown.ts` — "await parts.closeStores(); end.clearPid(); parts.log.info('bye'); clearTimeout(backstop); exitRespectingStoreHealth(0, `shutdown (${signal})`, end);"
- **[[c4]]** `code` `src/daemon/shutdown.ts` — "if (started) { parts.log.warn({ signal }, 'shutdown signal received again; already in progress'); return; }"
- **[[c5]]** `code` `src/daemon/index.ts` — "stopBackgroundWork: () => { ... void watcher.close(); void server.close(); }"
- **[[c6]]** `code` `scripts/daemon-ctl.sh` — "wait_for_daemon_stop() { ... if [ ! -f "$PID_FILE" ] && [ ! -S "$SOCK_FILE" ]; then return 0; fi"
- **[[c7]]** `prior-artifact` `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/smoke.md` — "The old process had logged `shutdown signal received; draining...` and `bye` and removed its pid file and socket, yet it never exited. It ignored SIGTERM; its log also showed `MDB_LOCK_FAILURE: Failed"
- **[[c8]]** `code` `src/cli/services/maintenance.ts` — "export async function restart(onLog, deps = { stopDaemon, startDaemon })"
