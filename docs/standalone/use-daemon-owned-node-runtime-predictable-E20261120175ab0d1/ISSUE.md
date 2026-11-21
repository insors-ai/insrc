<!-- insrc:artifact ISSUE-175ab0d1d56838a9 -->

# Use a daemon-owned Node runtime for predictable installation build and launch

## Reproduction

On macOS, use an installation whose daemon runs successfully under Node 22 while the shell/IDE environment resolves Node 26.5.1. Run the daemon update action. The installed checkout syncs, then npm run build exits before compilation with: harness-runtime-unsupported: Use Node 22.22.1 or newer Node 22.x to run the harness. Observed log: /tmp/insrc/daemon-ctl-20261120-223002-56132.log. Retrying the same installed build with Node 22.23.2 explicitly placed on PATH succeeded; /tmp/insrc/daemon-ctl-20261120-223103-57288.log records completion. Expected: fresh install, update, build and daemon launch use the fixed runtime owned by the installation regardless of globally installed Node versions or GUI PATH. [c1][c2][c4]

## Root cause

Runtime selection is inconsistent across boundaries. scripts/daemon-ctl.sh can use an explicit/local tools/node for lifecycle commands but still falls back to ambient Node and calls bare npm for installation/build. The legacy startDaemon path in src/cli/services/daemon.ts spawns process.execPath. Selecting a compatible daemon executable therefore does not ensure that npm lifecycle children or another client use the same Node. Existing signed-bundle installation already validates release-local tools/node and a runtime fingerprint, so a separate, incompatible pinning mechanism would compound the inconsistency. [c1][c2][c3]

## Fix intent

Provision one fixed, tested Node distribution locally for the daemon and consistently use its matching Node/npm toolchain for fresh bootstrap, dependencies/native builds, update/build, daemon/helpers and the relevant current VS Code, JetBrains, TUI and MCP launch paths. A fresh install must not require a globally installed Node. Reuse existing bundle/runtime verification and ownership contracts, align the pin with native ABI and qualified release metadata, and migrate existing installs safely. Verify platform/architecture and authenticated or pinned checksums before use; keep installation atomic, reuse a verified local runtime offline, and report missing/corrupt/unsupported runtimes clearly without silently selecting system Node. Preserve managed lifecycle state and rollback integrity, do not modify global Node installations, and treat runtime upgrades as explicit release changes. Validate with absent, older and newer system Node, hostile or minimal PATH, install/update failures and existing-install migration. The independent native heap-corruption crash is outside this fix's claim. This issue records intent; exact layout, supported-platform policy and migration details belong in the routed design and plan. [c1][c2][c3][c4]

## Citations

- **[[c1]]** `code` `scripts/daemon-ctl.sh`
- **[[c2]]** `code` `src/cli/services/daemon.ts`
- **[[c3]]** `code` `scripts/install-daemon-bundle.mjs`
- **[[c4]]** `stakeholder` `User request on 2026-11-20: install the Node version locally with the daemon so runtime behavior is predictable; observed Node26 failure and Node22 retry in this session.`
