<!-- insrc:artifact ISSUE-da8b451af697818a -->

# Use verified IPC shutdown when macOS process control is unavailable

## Reproduction

On macOS with a running daemon, run daemon-ctl.sh stop or restart when native process capability capture is denied. Observed restart output: stopping daemon, then daemon lifecycle refused: process capability broker refused: denied (errno 1), exit code 4. The client never reaches its shutdown request. In the same session, sending daemon.shutdown through the installed IPC client returned {ok:true}; PID51617 subsequently exited and its PID/socket files disappeared, and the installed start service launched PID3547. The daemon watchdog also logged a broker-capture error, so the observed success is process exit, not a claim that native process control was healthy. Expected: process-capture or kill unavailability must not suppress a working bounded IPC shutdown path, and restart proceeds only after the original daemon has verifiably stopped. [c1][c2][c3][c4]

## Root cause

stopDaemonWith awaits deps.capture before entering the block that sends the bounded shutdown RPC. captureDaemon snapshots run-file ownership, then calls captureStopTarget; an exception escapes before IPC. The command helper's legacyStop independently captures first as well, so changing only the service would leave the shell stop/restart path broken. Existing waitForStop and cleanupStoppedDaemon rely on the retained target and original run-file identities; they cannot safely be reused by pretending capture succeeded or by treating missing PID/socket files as proof of process exit. [c1][c2][c3]

## Fix intent

Allow bounded daemon.shutdown IPC when macOS process capture/termination capability is unavailable, through the existing shared lifecycle boundaries used by stop/restart and applicable current clients. Preserve the normal retained-capability path and managed supervisor authority. Success must mean the original daemon has stopped, not merely that IPC acknowledged or a socket vanished. Preserve PID-reuse protection and owned-file cleanup; never signal a replacement process, delete a replacement's run files, overlap daemon generations or turn an unverified shutdown into success. If IPC fails, times out or the original daemon remains alive/unverifiable and no safe termination capability exists, report a clear bounded failure and withhold restart. Handle graceful exit racing a kill error using verified outcome evidence. Test capture denial with successful IPC exit, acknowledgement without exit, unreachable/hung IPC, termination failure, concurrent replacement/PID reuse, owned cleanup, existing forced-stop behavior and restart ordering. Exact fallback identity/exit proof belongs in design; this issue does not claim to repair the native broker itself or the unrelated heap-corruption crash. [c1][c2][c3][c4]

## Citations

- **[[c1]]** `code` `src/cli/services/daemon.ts`
- **[[c2]]** `code` `src/cli/services/lifecycle.ts`
- **[[c3]]** `code` `src/bin/insrc-daemon-control.ts`
- **[[c4]]** `stakeholder` `User request and observed macOS restart recovery in this session, 2026-11-21: broker denied errno1; direct daemon.shutdown returned ok and original PID51617 exited before replacement PID3547 started.`
