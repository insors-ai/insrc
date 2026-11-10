# Installed restart smoke on Apple Silicon

Run on 2026-11-10 with Homebrew Node 22.23.2 in the macOS GUI login domain. The release was built in a detached checkout of `660ea82e3` with the launch descriptor and registration changes in this commit. The test used a disposable home and a temporary LaunchAgent label derived from that installation root. The live installation was outside the test.

| Plan case | Observation |
| --- | --- |
| Install or upgrade into supported launchd domain | Staged a disabled selector, enabled it in the disposable fixture under its installation reservation, and bootstrapped the pinned LaunchAgent. Its authenticated status socket answered. |
| Normal and blocked shutdown complete with verified generation change | Normal restart replaced PID 25710 with PID 25784. The supervisor then forced the suspended fixture to exit at the 1,200 ms deadline and admitted a different generation. The predecessor PIDs were absent before the test proceeded. |
| Restart leaves one daemon and serves status and indexing | The successor answered status and repository RPCs. A disposable repository containing a TypeScript file reached `ready` and remained registered after forced restart. |

The final stop returned `exited`. Exact LaunchAgent removal was confirmed with `launchctl print` reporting the disposable label absent. A preceding run exposed an ambiguous transient launchd state. The final run used the bounded retry for pinned registration, and 16 targeted lifecycle and controller tests passed.

Still pending are the installed rollback, stale-file ownership, legacy migration, and blocked-close or partial-boot smoke cases, followed by Linux checks and the full sweep. These observations cover only the three cases above.
