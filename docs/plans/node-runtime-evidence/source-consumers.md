# Source release consumers — t6 implementation evidence

Story `a03e99e17a364550/s1`, approved task t6. Registered t6 validation passed on commit `67a432d7f`; the public TUI/daemon/MCP integration cases and regression evidence are recorded below. BUILD approval remains deferred until the whole story is built and tested.

## Reuse and current wiring

The registered analyzer located `SourceInstallationStore`, `NativeSourceTransactionHost`, `resolveOwnedToolchain`, `readInstallationSelector` and `runAcknowledgedManagedUpdate`. Its `SourceInstallationStore` callers result was explicitly incomplete (five relationships to ignored files, ten awaiting targets), so direct searches supplemented it. Existing source callers were the independent verifier and source controller; TUI maintenance still had an in-place Git/npm route, CLI start still used its compiled checkout, and `scripts/insrc`/`scripts/insrc-mcp` did not consume Linux source selection. The daemon's existing Linux updater still launched an incumbent ctl restart; macOS has its separate private-channel managed owner.

The draft shared `source-routing.ts` reads bounded, private selector metadata, validates the complete source journal through its existing store, verifies compiled source and the release-owned runtime before resolving a controller, and distinguishes legacy absence from malformed/pending source state. Client code does not open daemon databases. Lifecycle calls reuse `insrc-source-control`; failures include the exact command and bounded diagnostics. Its caller integration and subsequent checks are recorded below.

## Native updater ownership boundary

A detached Node fork remains a descendant of a Linux child subreaper. Merely setting `detached: true` cannot let an updater survive the incumbent owner's full descendant shutdown. The draft native handoff asks the authenticated resident owner to create a sibling supervisor with `CLONE_PARENT`, before entry is granted. This is an explicit independent scope from birth; no descendants are excluded from either owner's `ECHILD` closure proof and no numeric PID is signaled.

| Endpoint/relationship | Direction and ownership | Lifetime and compatibility |
| --- | --- | --- |
| Incumbent native supervisor → daemon root and descendants | One retained root pidfd; the supervisor owns and reaps its complete subtree. | Existing startup grant, commit and full closure semantics remain unchanged. |
| Resident supervisor → independent updater supervisor | The resident invokes `CLONE_PARENT`; the new supervisor is its sibling, outside the incumbent subtree. A private pre-fork intent and request precede creation; a ticket precedes entry grant. | The new supervisor receives the original daemon's retained pidfd as its creator capability. No capability is reacquired from a numeric PID. |
| Updater supervisor → updater root and descendants | One new retained root pidfd and its own subreaper scope; current pinned Node/controller entry only. | Creator exit cancels an uncommitted handoff. After explicit ownership commit it outlives incumbent closure; its own full closure is independently verified. |
| Source selector → consumer launch/controller | One canonical logical installation selects at most one release. A pending transaction is never a client launch route. | Missing selector permits existing legacy behavior; malformed selector is fatal. macOS remains with its managed owner. |

The draft adds the `update` ticket role to the dedicated native actor client; it does not widen the daemon-only generic process broker or public lifecycle RPC methods. Detached updater admission checks live daemon ownership, qualified current executable paths and matching owned runtime. It records metadata before startup grant and rejects another live updater handoff.

## Checks completed

- Canonical run `cc645867-f6ab-4252-8f4c-4a9b34c663f5`: all five existing native actor cases passed on actual OrbStack arm64/x64. The new updater case passed on arm64 and failed on x64 before entry grant. Coordinator cleanup was confirmed; no public updater was wired.
- Run `088ce631-3eba-4590-a2bb-e6a1f8fcc3ad`: the focused retry reported `ENOSYS` on x64. Native detachment had required `close_range`; this is unnecessary because owner descriptors already have `CLOEXEC`, including pidfd results. The creator capability is the sole deliberate non-stdio exception. The executable is addressed by its canonical supplied binary path, avoiding dependence on emulator-specific `/proc/self/exe` identity.
- Canonical run `5a7f4f9d-e74f-496e-9c63-65f251c6b80f`: the focused independent-updater case passed on both targets after removing that optional syscall dependency. It proves blocked entry before grant, rejection of concurrent handoff, cancellation and descendant closure when the creator exits before commit, survival after committed incumbent subtree closure, reopening, and the updater's own full descendant closure. These are controlled native process tests, not production historical data/native-module qualification.

## Completion boundary

The primitive alone was insufficient: replacement lifetime, public caller routing, acknowledgment and durable outcomes were subsequently implemented as recorded below. Actual historical native/data qualification remains later story work. Human BUILD approval is deferred until all twelve tasks are built and tested.

## Replacement lifetime and environment transfer

The second boundary is now implemented in the native actor draft: an updater root's `SourceNativeActor.launch` delegates creation to its authenticated resident owner, which creates an independent sibling supervisor for the new release/probe. Target directories remain in the existing flat actor registry, so transaction recovery continues to discover their existing tickets. The creator's retained pidfd cancels a scope before ownership commit; a committed replacement is independent of the updater's later full closure. Probes retain their own full closure requirement and are never implicitly committed. The generic daemon process-capability broker is unchanged.

A private bounded descriptor carries only canonical launch paths. The intended child environment is transferred over the authenticated Unix socket, never written into that descriptor or retained on disk. The native child changes to its pinned release root and passes the environment to its own supervisor; startup then replaces native actor identity fields and clears stale private-update request state for daemon/probe entries. This retains HOME/PATH/native settings and probe requests without retaining environment secrets in launch files.

- Run `71ddc1cb-2e5e-4977-a5bc-cfadd1ac65b0`: the five existing cases passed again after the generic handoff/environment implementation. The extended case failed before exercising it because a replacement fixture variable was declared in the wrong test. It was moved to the intended case. The native handoff also now explicitly sets the target release working directory.
- Canonical run `45f9e1aa-c628-4c1d-9f10-3bea07395600`: the extended focused case passed on actual arm64/x64. In addition to the original creator/cancellation/closure checks, an updater created and committed a second daemon through the existing `SourceNativeActor.launch` API. Its root and descendants stayed alive after the updater's own full closure, then closed through their independent owner. The test checked a distinct replacement environment value and the replacement's actual working directory. Coordinator closure was confirmed. This establishes the native lifetime boundary only; public updater acknowledgment/outcome and TUI/MCP integration remain pending.

## Public consumer routing and acknowledgment

TUI update/restart and daemon start/stop now resolve the verified Linux source controller and absolute owned Node before lifecycle effects. The installed TUI no longer fetches, installs or builds inside its incumbent checkout; skip flags are refused. The macOS adapter uses the current client controller, with its retained managed owner. Unmanaged daemon update dispatch refuses a historical installation until a current authenticated installer establishes ownership. The main unary socket owner exclusively handles daemon updates; admin worker dispatch cannot launch the retired ctl updater or schedule early shutdown.

`scripts/insrc` and `scripts/insrc-mcp` resolve the source launch before executing their application entry. Malformed/pending state fails without falling back to an old entry. A qualified restored predecessor retains its separately pinned runtime. Both candidate package inventories include the shared shell resolver. The source fixture authority was extracted into a test helper so consumer and installer tests use the same signed fixtures without importing each other's test registrations.

The daemon's resident C owner creates the independent updater scope and grants entry. The helper verifies its native ticket, current controller and owned runtime, then records a reserved transaction and a pending per-update receipt under mutation exclusion. It reports that reservation over its private files. Only after the unary response writer confirms delivery does the daemon commit the independent native owner and publish the private release. Cancellation/timeout finishes rolled back before network/build preparation. A potentially published release is never retracted after a rename/fsync error. The helper's candidate/probe scopes use the previously tested independent lifetime boundary.

| Relationship | Ownership/cardinality | Compatibility and publication |
| --- | --- | --- |
| Active source transaction → update receipt | One admitted update ID has one private bounded receipt, identified by its baseline generation and original controller identity. | Journal schema stays unchanged for retained issuer verifiers; ordinary lifecycle operations create no update receipt. |
| Controller mutation lease → final receipt | Only the actual current owner publishes the matching durable decision, after actor settlement and before clearing active. Recovery may adopt a dead controller. | Failed publication retains the terminal reservation for recovery. Equal terminal decisions retain the original timestamp; conflicting decisions fail. |
| Update receipts → public outcome | The latest update by generation is projected; pending work hides an old result, while a published recovery-required fence remains visible. | Later start/stop/restart results cannot overwrite update history. A top-level mirror preserves the old restored daemon's reader shape. |
| CLI maintenance → steering helper | Reconciliation remains daemon-startup work; the separately exported steering helper loads daemon dependencies only when invoked. | Ordinary client lifecycle imports no longer load a daemon-only LMDB native binding. |

Old unchanged clients/processes require the current authenticated installer or current client once. No in-flight old function or installed old compiled updater is rewritten by this change. Controlled fixtures use the real official Node/npm, native ownership helpers and source transaction; their application and native-module smoke are controlled substitutes. Actual historical application/native/data qualification remains t9–t11.

## Consumer checks during implementation

- `207a2799-ad7e-4d20-a910-2ddcc6af513d`: initial consumer run failed before startup because the test bundle imported the TUI's eager daemon-only steering/LMDB dependency. No consumer success claimed. Lifecycle imports were corrected and the test invokes the actual compiled services.
- `e0e60d32-ed19-4741-b80b-fb3586c57418`: both required consumer integration cases passed, no skips, on OrbStack arm64 and x64 (347.5 seconds; coordinator cleanup confirmed). Receipts: `.insrc/tmp/source-consumers-Br5j9E` and `.insrc/tmp/source-consumers-wCuZgD`. TUI running updates, reply cancellation with no preparation, delayed acknowledgment, independent incumbent/updater/replacement lifetimes, durable IDs, later lifecycle preservation, failed preparation diagnostics, MCP/CLI launch and malformed-state refusal passed. Both VMs stopped after fixture closure.
- `018aa502-22ef-40db-83b2-490b89621bd0`: packaging, stop/control, reconciliation helper, managed IPC and full Linux transaction/rollback suites passed. The new receipt case also verified publication under exclusion, persistence across lifecycle results, malformed receipt refusal and public recovery-required state. Two rewritten assertion defects remained: a refused update correctly created no observer log, and invalid source values retained their specific `daemonUpdate` field error. Those assertions were corrected for the next run. This run is not reported as an overall pass.

- `9f74e46c-8599-4992-8e70-a3e03d34af1c`: all five selected regression files passed, no skipped cases, with coordinator cleanup confirmed. Both required consumer cases passed again on arm64/x64, including production outcome projection and the legacy mirror, hostile PATH, absolute official Node/npm, absence of incumbent execution, and a noisy failed build retaining its final compiler diagnostic. The extracted installer authority also passed all legacy/bound migrations and the full selected-root shell/profile-change/running/stopped matrix. Source-value admission and the restored admin guard passed. Receipts: `.insrc/tmp/source-consumers-qU6NVe`, `.insrc/tmp/source-consumers-HsmzHV`, `.insrc/tmp/source-entrypoints-UvKl1Z`, `.insrc/tmp/source-entrypoints-2ZJncM`.

A final interface correction reports `started: false, alreadyRunning: true` for a no-op source start, consistently with existing client semantics. TUI success steps use the plain `update` label. The registered t6 gate will validate this final checkpoint and the corresponding strengthened assertion. Registered t6 validation remains pending.

## First registered t6 gate and fresh-output correction

The registered gate on `e44452302` continued after its 300-second MCP transport timeout. It recorded clean typechecking and all six transaction tests passing, including the mapped recovery-required receipt case. Both consumer cases failed at the new `started: false` assertion because their real compiled service import still read `out/` from before that final source correction. The gate typechecks without rebuilding those compiled services; this was a missed build prerequisite, not a passing validation. No task/BUILD approval was requested or performed.

Canonical run `a78df1c3-b03c-4716-9a76-3d85c88a8493` rebuilt the committed checkpoint and passed both consumer cases on arm64/x64, no skips (338.4 seconds, coordinator cleanup confirmed). This also exercised the final plain `update` success step and consistent already-running start result. Source stayed fixed at `e44452302` throughout. The failed gate event is retained in the ledger. A fetch then found 35 upstream commits, so the merged tree must be built and validated before the next task starts.

## Merged checkpoint and focused gate mapping

Upstream's 35 commits merged cleanly as `ca736d71b` and were pushed. Canonical run `de30806c-84d6-41e9-82d5-549704852c62` rebuilt that merged tree and passed six upstream codec/security/evidence test files, with cleanup confirmed.

The second registered t6 gate on `ca736d71b` passed both required consumer integrations (339.2 seconds, no skipped cases). Its additional full transaction file exhausted the gate's shared 600-second test budget with only 260.8 seconds remaining, before its mapped receipt case ran. This was recorded as a failed gate, not as a receipt pass. The timed-out orchestrator left the owned x64 fixture VM running; it was explicitly stopped successfully. Interrupted guest fixture state was retained; no per-actor closure proof is claimed for that interrupted run.

The existing receipt case was moved unchanged into `src/daemon/__tests__/source-update-outcomes.test.ts`, sharing the original process/store fixture via `helpers/source-transaction-fixture.ts`. This lets the gate run both required public cases plus the real recovery-required receipt case within its combined budget. The complete transaction suite remains available separately; no assertion was removed to shorten the gate.

- Canonical run `2d047728-dce7-40b1-9af7-fd8c25be92e2`: the extracted receipt case passed on arm64/x64 (25.9 seconds). Four of the remaining five transaction cases passed. The admission-failure case exposed a missed import of the moved daemon fixture string; that test-only extraction mistake was corrected by exporting/importing the same string. Coordinator cleanup was confirmed.
- Canonical run `43a6d84e-42a9-4e58-9fea-3173f0aebdba`: the corrected admission-failure case passed on arm64/x64. The name selector intentionally excluded the other already-passing transaction cases; it is not reported as a new full-suite pass.

Registered validation with the focused receipt file is next. Production behavior is unchanged by this test-fixture extraction.

## Registered t6 PASS

The gate on `67a432d7f` persisted PASS at `2026-11-22T08:17:02.895Z`: clean typecheck; all three mapped cases passed, no skips/not-found cases. The required consumer file took 347.2 seconds and the focused receipt file 29 seconds, within the shared 600-second budget. The read-only verdict confirmed the routing, handoff and outcome-preservation acceptance checks. Both OrbStack fixture VMs were stopped after normal fixture cleanup. Tasks t1–t6 are validated; no partial human BUILD approval was requested.

The MCP transport timed out after 300 seconds while the existing daemon request continued. Its eventual result was observed through the framework TESTS/BUILD/TASKS records; no duplicate request was submitted while that run remained active. The live installed daemon remained at `a30aa7f91` and was not rebuilt/upgraded by these development checks.
