# Source interruption and consumer promotion gates

Story `a03e99e17a364550/s1`, approved task t8. Controller checks passed; registered validation is pending. BUILD approval remains deferred until the entire story is built and tested.

## Existing mechanisms reused

The focused analyzer lookup profiled `src/daemon/source-update-transaction.ts`, its six incoming/seven outgoing import edges, and its transaction fixture/host dependencies. Its graph coverage was incomplete and its test lookup was broad; direct source reads supplemented it. The actual owner is `LinuxSourceTransaction`; the initially queried name `SourceTransactionCore` does not exist. No replacement transaction engine, actor broker, runtime verifier, journal format or filesystem-delegate framework was introduced.

The existing interrupted-cutover test and worker moved into a focused `source-interruption.test.ts`. Its previous assertions remain, extended through `_setSourcePublicationFaultForTests`, the existing source-host fixture and the real Linux process-capability broker. Both OrbStack targets run their verified Node 22.22.1 distributions. The controller itself is a directly spawned test child; a bounded AbortSignal kills that captured child on deadline. Daemon identities and descendants remain subject to the existing retained-capability/recovery rules.

## Fault and ownership coverage

The final matrix runs 17 checkpoints in both abrupt-exit and deadline modes on **each** of Linux arm64/x64: reserved, staged, predecessor exited, candidate selected, candidate spawn intent, candidate created before recording, candidate recorded before grant, candidate ready, committed, rollback required, rolled back, recovery required, prior spawn intent, prior created before recording, prior recorded, prior ready, and restored prior subsequently exited. This is 34 controller interruption scenarios per architecture.

At every paused deadline checkpoint a second lifecycle start must be refused without changing the journal or current store-owner marker. Recovery checks exact prior/candidate selection and the requested running state. Unrecorded spawn outcomes remain fenced; diagnostic sideband identities prove test-process closure but never authorize another production start. Created-but-unrecorded actors must never acquire the store marker. The fixture's exclusive filesystem marker makes actor overlap an actual failing operation, not a counter assertion.

Additional checks cover all four publication fault points (file synced, before rename, after rename, directory synced), failed readiness for legacy and selected predecessors, stop refusal preserving the original, unknown descendant closure retaining exclusion, replaced publication directories, ordinary lifecycle behavior, and restoration under held mutation authority. A real live candidate with deliberately stale incarnation metadata verifies that recovery neither signals it nor launches a replacement. This models PID-incarnation mismatch; no operating-system PID wrap/reuse is claimed.

## Qualified distribution gate

`prepare-source-release.mjs` now requires four additional exact-head source-build evidence checks on Darwin and both supported Linux targets:

- `source-selection-shell`
- `source-selection-cli-daemon-mcp`
- `source-selection-vscode`
- `source-selection-jetbrains`

The existing commit/tree/target, receipt digest, pass/exit/skip and signing checks apply to every added check. Missing any consumer prevents installer output and staged promotion refs. Existing base/native qualification remains required. Tests exercise exact-head promotion, missing consumer receipts, bad receipt bytes/results, channel/profile/signature/floor denial, and target-specific Linux promotion. Both IDE package generators receive the same authenticated installer; a qualified client with no such installer is refused before payload publication. Ordinary development bundling remains available. Delivery and signing authority remain operator responsibilities; fixture signing keys are temporary and no production key was created.

## Controller verification

All runs used the canonical Node22 coordinator, serial execution and retained per-file logs under `.insrc/tmp/test-harness/runs/<run-id>/`.

| Run | Result |
| --- | --- |
| `704dbbba-0e3e-42f9-b132-88fc87f29d8e` | 14 cases passed, no skips: runtime-store corruption/publication defenses (9), portable source qualification/promotion/owned staging (3), exact-head promotion and both IDE payloads (2). |
| `ece14d13-c6ca-4d34-9b14-1d13ee36f9a0` | Initial extended interruption matrix passed on both architectures (331 seconds). |
| `e21002de-60f9-4b41-bbf5-cab620972420` | All seven surrounding files passed, 34 cases/no skips: managed Mac lifecycle (6), independent Mach-O identity/tamper checks (2), managed update transactions (12), actual native source host (1), remaining source transaction cases (4), native source actors (6), source journal persistence (3). Linux process/persistence cases ran on both architectures. |
| `bd6c6446-5956-4211-9788-c66bac3f0cf5` | Final 17-checkpoint matrix passed on both architectures, including created-but-unrecorded actors (358 seconds, no skips). |

`tsc --noEmit` and `git diff --check` passed. No unrelated upstream failures were observed in this affected scope. The complete backend sweep is deferred to the final story regression; these are the affected transaction/runtime/release and managed-owner checks.

## Coordinator closure

Each run above recorded `confirmedClosed: true`, `interrupted: false` and empty cancellation/evidence errors in `cleanup.json`. Both OrbStack VMs stopped after the final matrix. Its guest TAP is retained under `/private/var/folders/78/fscmgmls2k72q89nnypxxfqm0000gn/T/insrc-source-transaction-linux-XOuoXG/`; the original extended matrix TAP is under the sibling `insrc-source-transaction-linux-1TsITA/`. The shared Linux test runner now retains generated bundles outside the indexed repository, following the t7 watcher-crash finding. The restored installed daemon remained PID 46743 throughout these checks.

The smoke result is observed **after** the coordinator completes. The older installed build gate does not itself execute the canonical coordinator, so validation reports this closure evidence as a builder-observed smoke result, distinct from integrations executed by the gate.

## Limits and next steps

Core fault fixtures use controlled daemon processes and a store-owner marker; runtime-store archive shims test trust boundaries, not native qualification. Existing native host, actor and Mach-O regressions passed, but actual historical application/native-library/data qualification remains tasks t9–t11. The installed watcher/V8 crash recorded in `ide-consumers.md` is not fixed by fixture isolation. No Mac PID/IPC shutdown fallback, unsupported-platform enablement or unrelated workflow changes were implemented.

Registered task validation is pending on the implementation commit.
