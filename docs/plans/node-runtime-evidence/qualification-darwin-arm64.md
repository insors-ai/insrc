# Node 22.22.1 source-runtime qualification: macOS arm64

Story 175ab0d1d56838a9/s1, task t7, 2026-11-21. Only `darwin-arm64` is
native-qualified. macOS x64 and both Linux architectures remain disabled;
Windows is unsupported. This proof concerns runtime predictability, not the
separately observed daemon heap-corruption crash or deferred IPC-stop fallback.

## Qualification before promotion

A separate clean clone at commit `b6aabd15aa0b303001396e89f4d948a8c71ea17e`
used a private home and the authenticated official archive. The isolated
bootstrap policy enabled this qualification target; the canonical public policy
remained disabled until these checks passed. No installed user daemon was changed.

- Archive SHA256: `679ad4966339e4ef4900f57996714864e4211b898825bb840c3086c419fbcef2`.
- Actual Node `22.22.1`, bundled npm `10.9.4`, native module ABI `127`.
- Distribution: `/private/tmp/insrc-q-j2cm1b0v/home/.insrc/runtimes/node-v22.22.1-darwin-arm64/679ad4966339e4ef4900f57996714864e4211b898825bb840c3086c419fbcef2/distribution`.
- Real `npm ci` installed 675 packages without disabling lifecycle scripts;
  then real `npm run build` ran the full canonical build coordinator.
- Both commands invoked absolute `distribution/bin/node` and matching
  `distribution/lib/node_modules/npm/bin/npm-cli.js`, with distribution/bin first
  on PATH, hostile Node/npm next, `/usr/bin:/bin` afterward, `CXXFLAGS=-std=c++17`,
  and NODE_OPTIONS/NODE_PATH removed. An external script-shell observer recorded
  30 lifecycle invocations, all exact owned Node/npm paths; hostile tools were
  never executed. No package scripts or dependency bytes were mocked.
- The built native smoke loaded `tree-sitter`, `lmdb`, `fs-ext`,
  `@lancedb/lancedb`, and `@duckdb/node-api`, without opening user databases.
- Build run `6a993eaa-9161-4137-b598-851aae223f18` recorded
  `confirmedClosed: true`. Local logs, native JSON and lifecycle identities are
  retained in `.insrc/tmp/node-runtime-qualification/prequalification/`.

## Regression and remaining proof

Run `7fc24cd7-ea1f-4a4d-8e5e-be902fdcb5e9` passed all runtime suites, signed
staging/recovery, JetBrains focused JUnit, and VS Code lifecycle/controller and
host adapter/writer tests. Four stale source-scan assertions in VS Code bundle
and activation suites failed because they expected the retired raw installer
copy/direct JavaScript launcher. They are updated to inspect canonical embedded
assets, template fidelity and the owned wrapper. Actor cleanup was confirmed.

The official-runtime matrices exercise absent PATH Node/npm and hostile
version-reporting Node20/Node26 fixtures, offline cache reuse, interrupted retry,
helper/daemon/TUI/MCP identity, and staged failure preserving prior selection.
Those PATH fixtures test rejection/selection, not execution of Node20/26.
The host also has actual Node26; it is never an installation dependency.

Upstream review-report commits were merged separately as `8e78862ea` before
public promotion. Fresh actual canonical packaged-policy installation and the
post-promotion regression results will be recorded below before final approval.
No broader full-repository test sweep or unavailable native architecture is
claimed by this qualification.
