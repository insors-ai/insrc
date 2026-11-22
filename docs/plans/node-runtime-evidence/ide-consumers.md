# IDE source bootstrap and selection evidence

Story `a03e99e17a364550/s1`, approved task t7. Registered validation passed on `dcb92e3ff` at 2026-11-22T09:53:21.242Z. Human BUILD approval remains deferred until all twelve tasks are built and tested.

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

The first request on `a004a8ac1` lost its MCP transport after 300 seconds. The installed daemon subsequently crashed at 2026-11-22 09:23:41 UTC before persisting a verdict. Its Mac diagnostic report (`~/Library/Logs/DiagnosticReports/node-2026-11-22-145342.ips`) identifies PID 46663, SIGTRAP and a V8 garbage-collection abort reached through `@parcel/watcher`'s native ignore callback. Earlier log lines report FSEvents stream errors during fixture creation; this is correlation, not an established root cause. All four guest fixtures still completed cleanup and the Kotlin TAP passed, but no registered task pass is claimed for that interrupted request.

Positive process absence and socket `ECONNREFUSED` were established before restoring the same installed `a30aa7f91` build through its normal startup guard (new PID 46743). No run files were manually removed and no installed source/dependencies were rebuilt. Owned fixture origins/workers now use the canonical OS temp directory outside the watched repository; an actual OrbStack read verified its `/mnt/mac` projection. This isolates test churn and does not claim to fix the installed watcher defect.

Canonical run `88c0ee02-375c-4201-90bd-ab403b377724` passed the unchanged four-variant native matrix after fixture relocation (525 seconds, no skips, coordinator closure confirmed). Receipts are `/private/var/folders/78/fscmgmls2k72q89nnypxxfqm0000gn/T/insrc-source-entrypoints-SGPDNV`. The restored daemon remained alive throughout. Explicit test prerequisites now skip OrbStack-only cases on non-Mac hosts and the pinned native bootstrap case when its public target/archive is unavailable; all required prerequisites are available on this qualification host.

Canonical run `999f026a-2802-46f8-98e6-2e784e927f70` passed the Kotlin integration and VS Code controller after those explicit prerequisites were added; neither skipped on this host. The application implementation is unchanged from the four-variant native pass.

Merged four upstream design-artifact commits cleanly as `dcb92e3ff` (no runtime changes). Canonical merged-tree rebuild/controller run `f1148240-910d-4369-b91c-a45374de610f` passed. Registered validation retry on that commit again exceeded the 300-second MCP transport lifetime, while its live daemon request continued. The framework recorded both integrations passed at 09:52:23.988Z (Kotlin 14.1 seconds; native matrix 525.3 seconds; no failures/skips/not-found), then persisted task t7 PASS at 09:53:21.242Z with clean typechecking. Verdict: “All acceptance checks are supported by repository code and substantive tests; both required integrations and typechecks passed according to daemon results.” The full test/BUILD/TASKS records retain the result. No duplicate request was submitted while the retry was active. Guest receipts are `/private/var/folders/78/fscmgmls2k72q89nnypxxfqm0000gn/T/insrc-source-entrypoints-4K2bmC`; the daemon remained alive and both VMs stopped after fixture closure.

Required mappings:

- `VS Code controller reaches packaged current bootstrap and selected runtime` → `scripts/__tests__/ide-source-entrypoints-native.test.ts`, same title.
- `JetBrains provisioner inherits owned native environment and packaged verifier` → `jetbrains-plugin/__tests__/source-bootstrap-gradle.test.ts`, same title.
