# Linux arm64 qualification review — work stopped for diagnosis

Story `a03e99e17a364550/s1`, task t10. Review requested by the user after the long-running session. **Linux qualification has not passed. No further matrix builds should start until this single failure is understood.** Tasks t1–t9 have registered PASS; task t9 is pushed through `69b814535`. Tasks t10–t12 remain unfinished.

## Actual progress

On `insrc-node-arm64` (Ubuntu 24.04.5 LTS, aarch64 virtualization, 2 CPUs, 8 GiB memory), the real historical `a30aa7f91` dependencies/output built with Node 22.22.1/npm 10.9.4. Five native modules and CPU ONNX loaded. The historical application seeded data through IPC and shut down through its original captured owner. A dirty/stale/partial predecessor was refused without overwrite. Explicit signed recovery rebuilt a last-known-good predecessor separately and selected the current candidate in the stopped state.

This is preliminary operational evidence, not completed canonical Linux qualification. The guest fixture is `/home/subhagho/insrc-historical-linux-arm64-OpLExynw`; the current candidate is `ed58363a65f80e633b0a90aeddcde286d0b6c89e`.

## Failure and stalled ownership

The subsequent selected `start` did not finish readiness. Its source transaction moved to `rollback-required`. The test's five-minute command deadline terminated the outer shell, but descendant controller PID 10676 survived under shell PID 10674 and retained the installation mutation guard. That orphan was still observed after six minutes. This is a process-ownership defect in the qualification harness: killing its directly spawned shell did not close its descendants.

The `finally` cleanup then attempted `stop`. It failed because that same live controller owned the guard, and this secondary exception obscured the original start failure. The exact guard report named PID 10676 and start identity `linux:c24de490-1f6a-4aff-9822-311631aaeede:59116104`; no guard was deleted or quarantined.

The underlying reason the actual candidate did not become ready is **not yet established**. The actor `process.log` files were located but not read before stopping the VM. Do not infer a native crash, successful rollback, or harmless slow startup from the outer cleanup error.

## Containment and retained evidence

The user-requested review stopped advancement. Both named OrbStack fixtures are confirmed stopped, so the orphan cannot continue running. The stopped guest retains `controller-retry.log`, `migrated-start.json`, `migrated-start.log`, `qualification-stop.json`, `qualification-stop.log`, the source journal and actor `process.log` files. The journal was preserved in `rollback-required`; VM shutdown is containment, not a claimed successful transaction recovery or graceful actor closure.

The user's Mac daemon remains PID 46743 and was not upgraded or stopped. Linux helper work remains uncommitted and unvalidated. The arm64 fixture disk allowance was increased from 14 GiB to 64 GiB. Completed test-owned build/cache payloads were retired for disk space while retaining application sources, verified runtimes, seeded data and evidence; Mac retirements are recorded in each fixture's `retired-build-payloads.json`.

## Narrow next investigation

1. Read the existing start receipt, actor logs and pending journal before running another build or changing the guard.
2. Identify the original readiness failure and distinguish it from the harness timeout/cleanup failures.
3. Correct qualification process ownership so timeout closes its captured descendant scope and cleanup retains the primary error.
4. Reproduce only this already-built candidate's start/recovery case with a bounded diagnostic budget. Resume the broader matrix only after it passes and closure is proved.

The long session included repeated real dependency builds, full-content integrity checks and prototype/canonical qualification runs. That expansion should have been curtailed once the selected start stopped progressing; increasing timeouts or restarting the entire matrix is not the next step.
