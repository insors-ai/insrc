<!-- insrc:artifact ISSUE-9d4523c7cb1c5971 -->

# daemon-ctl.sh fails with 'node: command not found' when launched from a GUI process (VS Code startup auto-start broken)

## Reproduction

On macOS with the daemon installed at ~/.insrc/daemon but stopped, open VS Code: the extension activates on onStartupFinished, probes reachability ('stopped'), and runs `bash ~/.insrc/daemon/scripts/daemon-ctl.sh start --skip-sync --skip-install --skip-build`. The daemon never comes up; the status bar shows errored with 'the daemon git / npm / build / start step failed'. Direct reproduction: `env -i HOME=$HOME PATH=/usr/bin:/bin bash ~/.insrc/daemon/scripts/daemon-ctl.sh start --skip-sync --skip-install --skip-build` exits 4 with 'line 212: node: command not found' (also seen in the real ctl log /tmp/insrc/daemon-ctl-20261112-173605-1198.log). Expected: the script starts the already-built daemon regardless of the caller's PATH.

## Root cause

daemon-ctl.sh invokes a bare `node` in stop_managed_daemon (scripts/daemon-ctl.sh:212), supervised_lifecycle (:266), socket_status (:237) and spawn_daemon (:197), assuming `node` is on PATH. GUI-launched processes on macOS (the VS Code extension host, which spawn()s bash with the process env) have PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin, which contains no node on this machine (node lives at /opt/homebrew/bin/node). Since commit 17605863f (2026-11-10) cmd_start unconditionally calls stop_managed_daemon before spawning, so even a plain start dies at line 212 with exit 4 before ever reaching spawn_daemon. The extension-side auto-start chain (vscode-plugin/src/activation.ts:92 -> vscode-plugin/src/daemon/controller.ts:112 -> vscode-plugin/src/daemon/subprocess.ts:36, which only merges opts.env over process.env and adds nothing to PATH) is intact and correctly classifies the socket as 'stopped'; the failure is wholly inside the shell script's node assumption.

## Fix intent

Make daemon-ctl.sh independent of an inherited PATH node: resolve a Node binary once at the top of the script (honor an explicit override env var such as INSRC_NODE_BIN, then `command -v node`, then well-known install locations — /opt/homebrew/bin, /usr/local/bin, ~/.nvm/versions/node/*/bin, the daemon checkout's own node_modules/.bin, plus the node recorded at install time if one is persisted) and use that absolute path for every `node ...` call (stop_managed_daemon, supervised_lifecycle, socket_status, spawn_daemon). Optionally also let the VS Code controller pass the extension host's process.execPath bin dir in the spawned env (mirroring the JetBrains plugin's envWithNodeOnPath pattern). Add regression tests that run the script with a PATH lacking node and assert it still resolves and starts/stops cleanly.

## Citations

- **[[c1]]** `code` `scripts/daemon-ctl.sh:212` — "if result=$(node "$helper" "$STOP_WAIT_SECS" 2>&1); then"
- **[[c2]]** `code` `scripts/daemon-ctl.sh:197` — "( cd "$DAEMON_ROOT" && exec env INSRC_MODE=daemon node --import tsx/esm "$DAEMON_ENTRY" >>"$DAEMON_LOG" 2>&1 </dev/null ) &"
- **[[c3]]** `code` `scripts/daemon-ctl.sh:266` — "if result=$(node "$helper" "$1" "$STOP_WAIT_SECS" 2>&1); then"
- **[[c4]]** `code` `vscode-plugin/src/daemon/controller.ts:112-113` — "const { code } = await runner.run(['bash', script, action, ...(options?.plain === true ? PLAIN_FLAGS : [])], managed === undefined ? undefined : { env: { INSRC_DAEMON_ROOT: managed, INSRC_DAEMON_UPDAT"
- **[[c5]]** `code` `vscode-plugin/src/daemon/subprocess.ts:36-40` — "const env = opts?.env !== undefined ? { ...process.env, ...opts.env } : process.env; const child = spawn(cmd, args, { env, ..."
- **[[c6]]** `code` `vscode-plugin/src/activation.ts:92` — "const result = await controller.run('start', { plain: true });"
- **[[c7]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/ScriptDaemonProvisioner.kt:85-91` — "val newPath = if (existingPath.isEmpty()) nodeBinDir else nodeBinDir + File.pathSeparator + existingPath; return baseEnv + ("PATH" to newPath)"
- **[[c8]]** `code` `/tmp/insrc/daemon-ctl-20261112-173605-1198.log` — "[17:36:05] ERROR: /Users/subhagho/.insrc/daemon/scripts/daemon-ctl.sh: line 212: node: command not found"
- **[[c9]]** `code` `scripts/daemon-ctl.sh:237` — "node -e ' ... const s = net.createConnection(sock); ... method: "daemon.status" ..."
