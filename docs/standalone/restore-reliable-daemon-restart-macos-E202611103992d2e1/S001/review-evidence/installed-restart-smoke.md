# Installed restart smoke on Apple Silicon

Run on 2026-11-10 with Homebrew Node 22.23.2 in the macOS GUI login domain. The release was built in a detached checkout of `660ea82e3` with the launch descriptor and registration changes in this commit. The test used a disposable home and a temporary LaunchAgent label derived from that installation root. The live installation was outside the test.

| Plan case | Observation |
| --- | --- |
| Install or upgrade into supported launchd domain | Staged a disabled selector, enabled it in the disposable fixture under its installation reservation, and bootstrapped the pinned LaunchAgent. Its authenticated status socket answered. |
| Normal and blocked shutdown complete with verified generation change | Normal restart replaced PID 25710 with PID 25784. The supervisor then forced the suspended fixture to exit at the 1,200 ms deadline and admitted a different generation. The predecessor PIDs were absent before the test proceeded. |
| Restart leaves one daemon and serves status and indexing | The successor answered status and repository RPCs. A disposable repository containing a TypeScript file reached `ready` and remained registered after forced restart. |
| Stopped daemon remains stopped and rollback preserves state | A compatible update registered an idle replacement supervisor without starting a daemon. A subsequent incompatible update rolled back to the idle release. The PID and socket paths remained absent and the graph file was byte-for-byte identical. |
| On the installed Apple Silicon build recover stale owned PID and socket files and refuse files belonging to a replacement | A forced restart reaped the original child and cleared its owned publication. Separate fault runs replaced the PID file and the Unix listener. The supervisor preserved the replacements, withheld a successor, and left the reservation fenced after exact reap. |
| Real macOS migration exit observation and restoration after injected pre-readiness failure | A real legacy LaunchAgent drained through its authenticated Unix socket. The candidate exited with code 42 after publishing its PID. The update restored the disabled selector and the saved legacy job, whose replacement daemon answered status on a verified socket. |
| Apple Silicon real blocked-close guard recovery and boot timeout after partial publication | A connected client held an actual `server.close()` while the installed supervisor owned the guard. The forced reap cleared the stale publication before admitting a successor. A separate child published its PID and socket and withheld readiness. The startup deadline reaped it and removed both paths and the guard. |
| Apple Silicon installed update across a supervisor version change with injected rollback | The candidate LaunchAgent advertised protocol 2 to a version-1 controller. Negotiation failed before a child was admitted. The prior job returned with a new running generation and the journal exposed one matching failed outcome. |

The final stop returned `exited`. Exact LaunchAgent removal was confirmed with `launchctl print` reporting the disposable label absent. A preceding run exposed an ambiguous transient launchd state. The final run used the bounded retry for pinned registration, and 16 targeted lifecycle and controller tests passed.

The follow-up runs used the exact launchd code from `e61e99da9` and independent disposable release copies. The blocked-close and timeout children injected the faults into actual daemon publications. The incompatible release changed only its advertised protocol in the disposable compiled copy. The foreign-file runs deliberately left their update fences intact and used fixture-only unload after verifying the registered label and descriptor. All temporary LaunchAgents were verified absent after their runs.

The protocol rollback was also repeated through the installed `daemon.update` IPC. Its detached helper outlived the predecessor LaunchAgent, rejected the incompatible job, and published one failed outcome for the acknowledged update ID `12927489-e1cf-4f5d-9af3-a23c38d63ccc`.

The Linux broker, retained pidfd, and watchdog regression passed all 21 tests in OrbStack on aarch64 with Node 22.22.1. The container used the tracked source archive for `e61e99da9`. [Linux test output](../test-evidence/t13-orbstack-linux.tap)

The regression sweep and completion review are separate gates for rollout. The live installation remains on its current route.
