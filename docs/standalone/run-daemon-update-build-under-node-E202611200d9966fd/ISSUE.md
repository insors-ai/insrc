<!-- insrc:artifact ISSUE-0d9966fd326855c5 -->

# Run the daemon update build under a Node the build harness accepts

## Reproduction

On a machine whose default `node` is not Node 22 (here Node 24.21.0 from nvm, first on PATH) and whose daemon clone is at a commit where `npm run build` runs the test harness:
1. Run `~/.insrc/daemon/scripts/daemon-ctl.sh restart` (or the Update daemon action in the IDE or terminal, which ends in the same script).
2. The script stops the running daemon, syncs the source, then runs `npm run build`.
3. The build prints `harness-runtime-unsupported: Use Node 22.22.1 or newer Node 22.x to run the harness.` and the script exits with code 4.

Observed: the daemon is left stopped (no `daemon.sock`), the clone's source is at the new commit but `out/daemon/index.js` is still the previous build, and `~/.insrc/daemon.update-outcome.json` records `daemon-ctl.sh restart exited with code 4`. Expected: the update builds with a Node the harness accepts, or, if none is available, stops before touching the running daemon and says so. Seen on 2026-11-20 at 08:00:50Z; the script's log is /tmp/insrc/daemon-ctl-20261120-133027-2035560.log. Running `npm run build` with Node 22.22.1 first on PATH succeeds, so the repo builds fine.

## Root cause

Two parts of `scripts/daemon-ctl.sh` combine with the harness's version check.

1. `resolve_node` takes `INSRC_NODE_BIN`, then the daemon's own `tools/node`, then the first `node` on PATH, and only then looks in well-known locations (including every `~/.nvm/versions/node/*/bin`). It never looks for a Node version, so with Node 24 first on PATH that is what `NODE_BIN` becomes.
2. `npm_build` runs a bare `npm run build`, so the build uses whatever `npm` and `node` are first on PATH, not the chosen `NODE_BIN`.
3. `package.json` now sets `build` to `node scripts/test-harness/build.mjs`, and the harness accepts only Node 22.22.1 or a newer 22.x, so the build fails under Node 24.
4. `cmd_restart` stops the daemon before `prepare_daemon` runs the sync, install and build, so a build that fails leaves the daemon down.

## Fix intent

Make the update and restart paths build under a Node the harness accepts and avoid taking the daemon down when they cannot: choose a Node 22 that meets the harness's minimum (22.22.1 or newer 22.x) in preference to a newer Node when more than one is available, run the build with that Node's directory first on PATH, and check for a suitable Node before the running daemon is stopped, failing with a clear message if there is none. Existing behaviour that pins an explicit `INSRC_NODE_BIN` stays as it is. The change is covered by tests alongside the script's existing Node-resolution tests.

## Citations

- **[[c1]]** `code` `scripts/daemon-ctl.sh:70` — "resolve_node: INSRC_NODE_BIN, then tools/node, then the first node on PATH, and only then the well-known locations; it does not look at a Node version"
- **[[c2]]** `code` `scripts/daemon-ctl.sh:248-251` — "npm_build runs a bare `npm run build`, with the npm and node first on PATH rather than NODE_BIN"
- **[[c3]]** `code` `scripts/daemon-ctl.sh:386-394` — "cmd_restart stops the daemon, then prepare_daemon builds and start_prepared_daemon starts it, so a build failure leaves the daemon stopped"
- **[[c4]]** `code` `scripts/test-harness/context.mjs:18-22` — "assertSupportedVersion accepts only Node 22.22.1 or a newer 22.x and otherwise throws runtime-unsupported"
- **[[c5]]** `code` `package.json:17` — "the build script is `node scripts/test-harness/build.mjs`"
- **[[c6]]** `step-output` `/tmp/insrc/daemon-ctl-20261120-133027-2035560.log` — "npm run build, then harness-runtime-unsupported: Use Node 22.22.1 or newer Node 22.x to run the harness., then ERROR: npm run build failed, exit 4"
