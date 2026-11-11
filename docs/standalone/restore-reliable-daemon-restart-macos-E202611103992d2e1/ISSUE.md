<!-- insrc:artifact ISSUE-3992d2e1e26124dc -->

# Restore reliable daemon restart on macOS

## Reproduction

Start the installed v2 daemon on Apple Silicon macOS as the logged-in user with Homebrew Node. Run scripts/daemon-ctl.sh restart while that daemon is running. The stop helper reports “process capability broker refused: denied (errno 1)” and withholds restart. A direct, read-only broker probe against that daemon outside the sandbox returns ERROR denied 1. Requesting shutdown over the existing socket reaches the watchdog but logs the same denial before the graceful drain. Expected behavior is to drain and stop the old daemon, verify its exit, and start exactly one replacement. A temporary per-user LaunchAgent restored service on the affected machine.

## Root cause

Both the CLI stop path and the daemon's independent shutdown watchdog require the same native retained process capability. The Darwin backend acquires a Mach task right and validates the process identity before readiness. A permission denial is reported without distinguishing the failed native operation. The CLI then withholds the stop before sending shutdown IPC. The daemon itself also arms the watchdog before stopping background work, so capture failure triggers emergency exit before the graceful drain.

## Fix intent

Provide a supported same-user macOS lifecycle that can complete graceful stop and restart without requiring a debugger task right. Preserve bounded recovery when the daemon hangs, verified exit before replacement, and guarded PID and socket ownership. Cover CLI, shell and daemon shutdown entry points while preserving Linux behavior and existing IPC compatibility. Evaluate per-user supervision during design, including migration from a live legacy installation and the temporary recovery job. Qualify a normal restart, blocked shutdown, stale runtime files and replacement ownership on real macOS using isolated test instances.

## Citations

- **[[c1]]** `code` `src/cli/services/lifecycle.ts:57`
- **[[c2]]** `code` `src/bin/insrc-shutdown-watchdog.ts`
- **[[c3]]** `code` `src/daemon/shutdown.ts:169`
- **[[c4]]** `code` `src/daemon/run-file-ownership.ts:103`
- **[[c5]]** `doc` `/tmp/insrc/daemon-ctl-20261109-145703-15150.log`
- **[[c6]]** `doc` `/tmp/.insrc/daemon.log`
- **[[c7]]** `stakeholder` `In-chat macOS restart reproduction and same-user broker probe`
