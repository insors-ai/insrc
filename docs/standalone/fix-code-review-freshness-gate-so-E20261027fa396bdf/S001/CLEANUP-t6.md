# s1/t6 cleanup (builder-reported, 2026-10-27)

- **Probe files.** The t5 probes lived only in `/tmp/s1-repo` and `/tmp/s1-home`, both removed; nothing was created in the repository. `git status --short`, filtered of modified files, the `.insrc/` ledger and `docs/`, lists no stray file.
- **config.json.** `~/.insrc/config.json` line 42: `"logLevel": "info"`.
- **Daemon level.** The shared daemon (pid 2316252) was still running at debug level from its 12:38 start (1782 debug lines in `/tmp/.insrc/daemon.2.log`, the last at 14:05). It was restarted with `scripts/daemon-ctl.sh restart --skip-sync --skip-install --skip-build` at 14:06:06 (new pid 2697727, log `/tmp/.insrc/daemon.log`). About 35 s after the start, `daemon.log` held 0 debug lines (`grep -c '"level":20'` = 0).
- **Note.** That restart runs the code already installed in `~/.insrc/daemon` (a GitHub-synced checkout). It does not contain this Story's unpushed commits; they load into the shared daemon after they are pushed and the daemon is updated.
