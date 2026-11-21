# Shell runtime execution evidence

Task `175ab0d1d56838a9/s1/t3`, 2026-11-21.

The shell installer, signed upgrade bridge and source control commands now use
the verified source toolchain's absolute Node and npm CLI. Node injection
variables are cleared, matching canonical runtime overrides are accepted and
external runtime overrides/old external daemon-node records are refused. The
install marker is `v2:<lock-blob>:<node-version>:<target>:<archive-sha256>`;
lock-only or changed-toolchain markers force reinstall. Failed installs remove
the success marker. Restart preparation precedes stopping the incumbent.

Production managed launcher generation is unchanged. A signed bundle retains
its own tools/node and delegates lifecycle operations to the existing managed
controller; source cache provisioning does not replace its selected runtime.

## Passing verification

Run `877035b1-44fd-425d-b561-40632c6cc738` passed:

- `scripts/__tests__/node-runtime-shell-native.test.ts`: real official Node
  22.22.1/npm10.9.4 for fresh installation, update, restart preparation and the
  macOS upgrade bridge, with hostile PATH, injected NODE_OPTIONS/NODE_PATH and
  paths containing spaces. The bridge's signing authorization is a fixture
  adapter; this proves runtime routing, not a new signing qualification.
- `src/daemon/__tests__/daemon-ctl-node-path.test.ts`: nine selection/lifecycle
  cases, using a recording bootstrap seam for unrelated lifecycle behavior.
- `src/cli/services/__tests__/daemon-ctl-install-marker.test.ts`: four marker,
  failure/retry, C++ flags and skip cases. TUI marker parity is task t4.
- `src/daemon/__tests__/daemon-ctl-source.test.ts`: actual local Git sync,
  branch/source selection and dirty/diverged checkout refusal.
- `src/daemon/__tests__/macos-upgrade-routing.test.ts`: existing installer,
  CLI, VS Code and JetBrains route matrix, including authorization refusal.

The required native tests use an explicitly provisioned official archive and
enable the candidate only in an isolated policy copy. Production targets remain
disabled until t7. Later native cases additionally exercise ambient Node20 and
absent Node/npm; the final validator test record is authoritative for those.

## Confirmed baseline limitation

`src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` has four failures on
this macOS host: process capability capture is denied with errno1. Its two
injected/conditional safety cases pass. These are not counted as passing tests.

To distinguish a regression, the same six cases were run with the exact control
script from pre-runtime commit `bdd6d2ae1`. Baseline run
`14c20f11-8dd3-49a8-adb2-b86fb9183027` also has two passes and the same four
errno1 failures. The temporary baseline test was removed after confirmed child
cleanup. The comparison source remains an ignored local evidence file under
`.insrc/tmp/node-runtime-evidence/daemon-ctl-before-runtime.sh`.

No weakening of target capture, PID identity, forced termination or run-file
ownership checks was made. The separately logged IPC shutdown fallback remains
outside this runtime Story. This environment's failing native forced-stop
checks are a validation limitation, not successful lifecycle qualification.
