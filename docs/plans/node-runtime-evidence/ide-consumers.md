# IDE source bootstrap and selection evidence

Story `a03e99e17a364550/s1`, approved task t7. Implementation and controller checks below are complete; registered task validation is pending. Human BUILD approval remains deferred until all twelve tasks are built and tested.

## Reuse and boundaries

Focused analyzer passes covered `vscode-plugin/src/daemon` (four TypeScript files, 34 entities) and the JetBrains lifecycle module (nine Kotlin files, 110 entities). The analyzer reported ignored relationships in both scopes; its empty Kotlin import graph was not treated as proof of isolation. Text searches and source reads supplemented it: VS Code activation/onboarding, lifecycle commands, freshness and host registration; JetBrains lifecycle service/command runner, freshness consumer and MCP registration. An initial repository-wide capability query was abandoned as overbroad rather than relying on its off-topic bundle. The separate query-bounding issue was not implemented here.

The adapters reuse the current packaged installer, canonical runtime assets, retained issuer verifier and existing lifecycle owners. They do not open daemon databases or reproduce source-journal schemas, runtime downloads, transactions or native actor ownership. Source journal version 1 and managed installation payloads are unchanged.

## Resulting behavior

- Both IDE updates execute their independently bundled current installer with `-y --target ... --migrate-runtime --no-start`. They never select incumbent `daemon-ctl.sh update` npm functions. An update preserves a stopped source installation; running source transactions retain their existing profile. Ordinary install retains its start policy.
- Start/restart use the qualified controller, with legacy sync/install/build disabled. JetBrains overrides a stale logical `INSRC_DAEMON_ROOT` with the actual controller root. Existing managed Mac installations retain their managed owner.
- Linux resolution invokes the current installer's `--print-source-route` query. Its canonical shell helper delegates complete state, compiled-pin and runtime verification to the retained issuer, rejects pending/malformed state and mismatched installation identities, and returns launch/controller roots. No journal means legacy resolution; invalid present metadata never permits fallback.
- Installation/freshness checks use the qualified launch root. MCP registration retains the current controller's selection-aware wrapper, including when the qualified launch is an older restored predecessor. The wrapper resolves the actual launch runtime; the IDE never falls back to ambient Node. VS Code's host adapter now awaits resolution.
- Freshness production wiring uses the current installer bridge for every update, with IPC retained for status/outcomes. Historical installed processes cannot be retrofitted through old IPC. Missing release material or unproven historical build identity remains an actionable prerequisite; this task does not invent predecessor provenance or silently rebuild the incumbent.
- Kotlin reconstructs each child's environment from the canonical packaged policy: owned Node on PATH, matching native target/runtime, Python bytecode disabled, CUDA defaulted only when unset, and Node injection variables removed. Explicit empty/`v12` CUDA and existing CXXFLAGS survive; the canonical installer/stager appends C++17 when building native modules. Provisioner subprocess exports are not assumed to reach the JVM.
- Both subprocess adapters retain bounded diagnostics. Qualified client packaging requires canonical runtime assets plus release bootstrap/public authority. `INSRC_QUALIFIED_UPGRADE_CHANNEL=1` refuses missing `INSRC_PACKAGED_INSTALLER`; supplied installers are checked for canonical asset drift and required authority material. Development templates remain available and cannot silently upgrade historical installs without release authority. These checks do not authenticate the origin of an arbitrary installer file: delivery must use the trusted release channel. No production signing key was created.

The client runtime archive now includes the canonical `source-selection-env.sh`; Gradle tracks it and the qualified-channel environment as packaging inputs. Existing signed managed-bundle runtime selection is retained. No deprecated IDE-fork work or Mac PID/IPC shutdown fallback was added.

## Controller checks

All runs used the canonical coordinator and Node 22.23.2; application fixtures use the pinned official Node 22.22.1/npm 10.9.4 distributions.

| Run | Observed result |
| --- | --- |
| `f9b872df-2810-4c88-a5ea-a6e119dd659f` | Initial VS Code controller/host-adapter and Kotlin lifecycle/runtime suites passed. |
| `27288418-03fc-4373-b2bf-0737ce86676f` | Both named integrations, runtime packaging and freshness wiring passed. VS Code native matrix: 556 seconds, four legacy/bound combinations across actual OrbStack arm64/x64. |
| `d74074ae-b5c1-439d-b72f-4713e25341d0` | Native matrix passed in 568 seconds, including real npm child native-environment assertions. Ten files passed; the managed-confirmation wrapper failed because its Kotlin wiring assertion still required the retired IPC-only route. The other 44 Kotlin cases passed. |
| `5aa72a8b-a44c-4bc4-aeef-411eb04d8078` | Final application behavior: native matrix passed in 508 seconds, explicitly preserving stopped state after IDE update; runtime/lifecycle, new Kotlin integration and VS Code controller passed. Kotlin cases passed after correcting the wiring assertion, but their old TypeScript wrapper read a retired shared report directory and obsolete case names. |
| `6e13d339-8dc4-4c98-a309-d296091bc4bd` | Corrected report wrapper, new Kotlin integration and VS Code controller all passed. Reports are read within the existing per-run callback. The Kotlin probe executes the owned Node and matching npm CLI in a separate real child. |

Coordinator receipts are under `.insrc/tmp/test-harness/runs/<run-id>/`. Each completed run recorded `confirmedClosed: true`. Both OrbStack VMs were stopped after each completed native matrix. The final native receipts are `.insrc/tmp/source-entrypoints-rV0qA8`; the prior extended environment receipts are `.insrc/tmp/source-entrypoints-fbn8Mc`. Original installer/shell tests share the extracted worker/authority fixtures; their controlled application and routing scope is unchanged.

The native IDE matrix verifies current bootstrap routing, launch/MCP runtime identity, pure lifecycle, malformed-state refusal, actual Node/npm versions, Python/header/CUDA/CXXFLAGS policy, and preservation of incumbent source/output/lockfile and refusal of incumbent npm. Unit adapter checks distinguish restored-prior launch roots from current controller/MCP roots and reject invalid query output. Managed Mac controller selection remains covered on the Mac host. The Kotlin source adapter protocol is exercised with controlled shell replies on that host; a live Kotlin JVM inside the Linux guests is not claimed.

VS Code `tsc -p vscode-plugin/tsconfig.json --noEmit` and `git diff --check` passed. The installed daemon stayed at `a30aa7f91` and was not rebuilt or upgraded by these checks. Controlled application fixtures and ephemeral signing keys do not establish actual historical native-library/data qualification; tasks t9–t11 remain required. Broader fault/package gates remain t8.

## Registered validation

Pending on the implementation commit. Required mappings:

- `VS Code controller reaches packaged current bootstrap and selected runtime` → `scripts/__tests__/ide-source-entrypoints-native.test.ts`, same title.
- `JetBrains provisioner inherits owned native environment and packaged verifier` → `jetbrains-plugin/__tests__/source-bootstrap-gradle.test.ts`, same title.
