# Verified bootstrap evidence

Task `175ab0d1d56838a9/s1/t2`, 2026-11-21, macOS arm64.

The canonical test coordinator passed all six cases in
`scripts/__tests__/node-runtime-store.test.ts` and all four policy cases in
run `fd90af79-a9f5-447f-9440-6c3f38847bcc`. Those unit/integration fixtures use
an explicit recording Node shim and isolated policy copies; they are not native
qualification. They exercise digest/path/link/device/version/architecture
rejection, cache corruption even with a rewritten inventory, concurrent
publication, incomplete archive retry, retained-stage ownership and atomic
binding selection. The test controller confirmed child cleanup.

A separate actual-distribution check used the official, pinned
`node-v22.22.1-darwin-arm64.tar.gz`, verified against SHA-256
`679ad4966339e4ef4900f57996714864e4211b898825bb840c3086c419fbcef2`.
Only an isolated copy of the policy enabled that candidate. The production
policy and both generated client assets remain disabled.

- Bootstrap ran through `/bin/bash` with `PATH=/usr/bin:/bin`, without Node/npm
  on that PATH, and the archive supplied as an offline input.
- Store creation and a second invocation with no archive argument both exited 0.
  The second invocation verified and reused the retained archive/distribution.
- The provisioned executable reported Node `22.22.1`, target `darwin-arm64`.
- Its matching npm CLI reported `10.9.4` under that exact Node executable.
- The executable path was inside the isolated content-addressed store, ending
  in `runtimes/node-v22.22.1-darwin-arm64/<archive-sha256>/distribution/bin/node`.

Local detailed logs: `.insrc/tmp/node-bootstrap-smoke-csmnD2/bootstrap.log` and
`.insrc/tmp/node-bootstrap-smoke-csmnD2/offline-reuse.json` (ignored run artifacts).
No global Node installation, real daemon binding, managed release, or production
daemon process was changed. Native module installation, full source build and
other platforms remain t7 qualification work.

## Validator corrections and final task-2 evidence

The first task-2 validator run rejected the binding's reliance on the current
cache inventory and insufficient process-interruption/native evidence. Those
findings were addressed before advancing:

- Binding publication now uses the same shared archive extraction primitive as
  bootstrap to verify the archive digest, paths, entry types and actual runtime
  identity, then compares the selected object against that fresh reference.
  A modified payload is refused even if its local inventory was also rewritten.
- An actual retained bootstrap child is interrupted with SIGTERM at its staged
  version probe. The test awaits child closure, verifies no published object or
  retained lock, and successfully retries. A separate truncated-archive case
  still verifies preservation of another owner's stage.
- `scripts/__tests__/node-runtime-bootstrap-native.test.ts` runs the official
  archive in an initially empty temporary HOME after asserting neither `node`
  nor `npm` is reachable on its PATH. It asserts the exact 22.22.1 executable,
  darwin-arm64 identity, npm 10.9.4 and successful offline reuse. Its official
  archive is an explicitly supplied local qualification fixture; ordinary runs
  without that fixture skip and cannot be counted as native qualification.

Canonical coordinator run `4da042d3-1867-4cdb-9de5-75208df31764` passed all three
files (policy, store, and native bootstrap); the native case ran and did not
skip. This establishes bootstrap behavior on this macOS arm64 host, not the
later native module/source build or other-platform qualification.
