# Source installer and shell entrypoints (task t5, in progress)

ISSUE/LLD/PLAN `a03e99e17a364550`, story s1, task t5. The task has been admitted. Public installer/shell wiring and the two required end-to-end entrypoint tests are not yet complete. No BUILD approval is requested between tasks.

## Independently owned Linux actors

Historical daemon code does not know the new source journal. An explicit Node `--import` barrier lets the current owner record a real kernel-observed process identity before granting that old entrypoint permission to run. The prelude applies only to the native monitor's direct daemon child; it does not attach its channel to worker threads or forked helpers. The native helper sets the root/monitor identities and clears inherited Node IPC setup. Node injection variables are removed by the current launcher.

The Linux-only source actor helper owns its forked daemon and retains a pidfd. As a child subreaper it reaps surviving descendants, including detached children, after the daemon exits. It signals only retained pidfds for its own unreaped direct/adopted children. It writes a private fsynced closure receipt only after the kernel reports no children. It cannot claim that an externally launched historical process has the same ownership; the public host must handle that boundary separately.

Before commit, losing the controller terminates and reaps the owned subtree. After an explicit commit, the supervisor remains available independently of that controller. Later clients authenticate its Unix peer credentials and full Linux birth marker before issuing a scoped command. A fresh client binary comes from the current authenticated package, never from an arbitrary ticket path. Reopening continues through the resident supervisor's original kernel capability; it does not authorize a numeric-PID kill. Closed receipts bind the random actor token, root PID and Linux birth marker, and are checked against process identity. Missing closure evidence remains an error.

An owned, private intent record is published before any monitor/root can be forked. A complete ticket records root/monitor identity, qualified release pin, transaction id and role before startup is granted. These records are internal ownership evidence, not an alternate runtime selector. Current source authorization, runtime archive/inventory verification and parent transaction admission remain caller responsibilities.

## Primitive checks completed

- Canonical run `910f1f24-ebcb-49b6-ad99-58225882f27b`: build and initial native actor case passed on actual OrbStack Linux arm64/x64.
- Canonical run `9633f9ef-6718-419d-bce3-149a59d8d774`: build and both native actor cases passed on arm64/x64, cleanup `confirmedClosed: true`.
- Tests compile the real C source with warnings as errors and use the actual startup prelude and process broker. They prove no entry before grant, wrong supervisor incarnation refusal, worker/fork compatibility, detached descendant closure after retained root termination, uncommitted controller-exit cleanup, committed controller-exit survival and supervisor reopening. Native preflight and repeated commit are exercised. Guest TAP is retained under `.insrc/tmp/source-transaction-linux-bwNfaD` and `.insrc/tmp/source-transaction-linux-UgwuQZ`.

These checks do not yet establish public installation/upgrade behavior, production native-module/data compatibility, or a safe adoption protocol for an unmanaged historical tree. Those are pending integration/qualification, not inferred from the primitive tests.

## Durable restored routing and authenticated lifecycle requests

The terminal outcome retains the qualified transaction and, when restoration leaves the legacy selector absent, its launch route. A later preparation-only failure cannot discard that route. Ordinary legacy start/restart/stop uses the recovered prior pin and the retained candidate authority/compatibility pair; it does not fabricate a signed source receipt for historical bytes. The selector remains exactly absent. The terminal outcome is durable before native ownership commit, and the mutation lease remains held until that asynchronous commit completes. The recorded startup actor precedes release of run-file exclusion to its entrypoint's normal startup guard.

Canonical run `0574767c-a13a-4f9c-a9cb-5bc728c80c1d` passed all three transaction cases and three state cases, including real arm64/x64 legacy lifecycle, preparation-failure retention, asynchronous settlement exclusion and entry-guard handoff. Existing interrupted-cutover/restoration cases also passed. Coordinator cleanup confirmed all children closed.

The current native helper supports only `daemon.status` and `daemon.shutdown` public RPCs. It checks the connected Unix peer's UID/PID and full Linux birth marker against a retained pidfd before sending any request. Status additionally requires that actor to remain alive through the response. Frames are bounded by size and one absolute deadline; this is not a general RPC or workflow approval transport.

Canonical run `b3c137be-e4f9-434f-b0d5-166e075794a3` passed all three native actor cases on both architectures, with cleanup `confirmedClosed: true`. Actual sockets proved normal status, wrong incarnation refusal, unsupported method refusal, and replacement-listener refusal before any request bytes. The original actor stayed alive after replacement refusal and its owned subtree subsequently closed. Public installer/shell integration and unmanaged predecessor admission remain pending.

## Stopped-store probe and admission boundaries

The retained current manager can launch a separate `probe` actor at `out/daemon/source-store-probe.js` under the same native startup barrier/subreaper. The daemon-only capability broker is not widened to arbitrary commands: probe handles use the authenticated resident supervisor's retained capability. Probe results bind the private actor token and actual root PID, and are consumed only after full native subtree closure. A reopened probe has the same closure requirement. The controller never imports a store to perform inspection.

The probe leaves genuinely unused stores absent, refuses incomplete stores, orphan locks, compaction residue and linked/unsafe paths, and delegates populated-store format checks to the existing daemon inspection owner. The controller wrapper admits only the active quiesced transaction under the exact run-file lease and verifies release pins and the archive/inventory-backed runtime before granting a probe. This wrapper is implemented and typechecked; its public-controller integration is pending.

- Run `963780a4-9a89-44ac-b182-dc48652b6bbd` passed the four actor cases on both architectures before adding the extra residue checks.
- Run `71c333c0-2ef2-4f63-acb4-069e1d3d2b6f` stopped at typecheck: the filesystem helper's inferred return allowed bigint metadata. The helper now explicitly returns numeric `Stats`; no tests ran and cleanup was confirmed.
- Run `fa1337a1-3e88-4c00-970e-5de66b86451e` passed all four actor cases on both architectures, including actual probe entry/barrier/closure, empty/incomplete/wrong-state/changed-format/dangling-link/compaction-residue/orphan-lock cases and mismatched result-token rejection. Cleanup was confirmed. These are process/probe boundary tests, not populated native-store qualification.

Pre-cutover capture/runtime/pin verification errors now finish without shutting down the incumbent. An unverified attempt cannot replace a retained qualified legacy restoration route. Run `dcd1bfbf-d4b4-4480-8b3a-088c8b5a1d50` passed all four transaction cases on both architectures, including the new preservation case and the existing interruption matrix. Run `b96852ab-c722-447a-b5b7-b884ea13ad2a` reran the targeted preservation/retained-route cases after tightening route admission; both passed. Both coordinator cleanups were confirmed.

## Independent delivered inventory

The key-pinned release bootstrap now exposes `inventory INSTALLATION_ROOT [INCUMBENT_RUNTIME]`. Its bundled inspector needs no incumbent dependencies or compiled helpers, and never executes incumbent scripts. Output explicitly says `authority: diagnostic-only` and `activationPermitted: false`; editable declarations or newer source HEAD cannot establish built provenance. Missing runtime information stays unknown. Signed authorization, predecessor qualification and activation remain separate gates.

Run `b96852ab-c722-447a-b5b7-b884ea13ad2a` passed the packaged inventory case on macOS and actual OrbStack arm64/x64 with hostile Node/npm PATH entries, partial dependencies/missing compiled entry and a dirty lockfile. No hostile executable or Git fsmonitor hook ran, the lockfile was preserved, and the verifier remained below the delivery size bound. The same run passed the existing managed-bootstrap authorization/routing tests and portable wrong-channel/profile/floor tests. It used a name selector for those cases; unrelated native qualification cases were not rerun. Cleanup was confirmed. Public installer/shell cutover wiring, their two required task tests and the t5 registered validation gate remain pending.

## Native controller composition

`NativeSourceTransactionHost` composes the transaction with retained native actor tickets, authenticated public status/shutdown, private publication receipts, guarded cleanup, archive/inventory-backed runtime checks and the daemon store probe. Startup is granted only after the actor is durably recorded and run-file exclusion is handed to the entrypoint's actual startup guard. Later controllers reopen the resident native supervisor, retaining original ownership rather than reacquiring a numeric PID. Unmanaged running publications are refused before stopping anything; this adapter does not invent legacy descendant ownership.

Only publication records matching the current PID/socket file identities authorize cleanup, after actor and descendant closure. Historical receipts cannot unlink a successor's publication. An interrupted unrecorded spawn remains a conflict. Native actor commit follows the durable terminal outcome under mutation exclusion. This is an internal adapter; standalone/shell dispatch and unmanaged historical delivery are not yet qualified.

- Run `09cccb5d-81c0-4242-9b87-c4b0d1549603`: arm64 passed the composition; x64 exposed a closure/status transport race during update. Native closure can become durable after the first receipt check but before the status client connects. The client now re-reads positive actor-bound closure evidence after transport failure, for status and kill; transport failure alone still never establishes exit.
- Run `57748021-ca93-4fa6-bf50-428d1ef1c090`: the deterministic transport-race test passed on both targets, including refusal without proof and acceptance only after real native subtree closure. The full x64 composition exceeded the helper's original 240-second guest budget. It was not recorded as passing; coordinator closure was confirmed and the owned fixtures were stopped.
- Run `92b74a18-a2c3-40f0-9d1b-616eba527ea5`: the full composition passed on arm64 and x64 with explicit `--file-ms=900000` and a 480-second per-guest bound. Host-retained phase records under `.insrc/tmp/source-host-progress/` confirmed progress through the entire sequence. Cleanup `confirmedClosed: true`; both VMs stopped. The sequence covered real startup guards, independently provisioned official Node/archive/binding verification, a daemon probe, idempotent start, update, restart, stop and restart from stopped. Fixture failure cleanup uses only its owned native tickets and retains diagnostic state if cleanup fails.

These composition fixtures use a controlled application daemon and empty stores. They do not qualify production historical dependency builds, retained application data, unmanaged running adoption, or the pending public installer/shell requirements. The separate worktree `../insrc-t5-entrypoints` holds the in-progress public bootstrap/controller draft so these tests ran against unchanged main-worktree inputs.
