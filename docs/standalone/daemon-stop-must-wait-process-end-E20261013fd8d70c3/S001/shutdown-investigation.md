# Shutdown investigation — controlled evidence

The original October 13 native shutdown cause remains **deferred and unproven**. The stakeholder authorized implementing reliable termination separately from that historical diagnosis. These controlled tests establish lifecycle behavior; they do not establish the cause of the historical crash/hang.

No installed daemon restart, deployment, live-store migration or installed-daemon smoke was performed. Such a smoke remains a separately authorized follow-up. All process manipulation below uses disposable parents and temporary HOME directories.

## Reproduce

From the repository root, on Linux with the normal compiler, Node and installed dependencies:

```bash
npm run build
INSRC_SHUTDOWN_EVIDENCE=/tmp/insrc-shutdown-evidence.json npx tsx --test --test-timeout=30000 src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts > /tmp/insrc-shutdown-t7-evidence.log 2>&1
npx tsx --test --test-concurrency=1 --test-timeout=30000 src/daemon/__tests__/shutdown-bounded.test.ts src/daemon/__tests__/shutdown-watchdog.test.ts src/daemon/__tests__/shutdown-store-failure.test.ts src/daemon/__tests__/run-file-ownership.test.ts src/daemon/__tests__/understanding-rpc.test.ts src/shared/__tests__/daemon-process.test.ts src/shared/__tests__/daemon-run-files.test.ts src/shared/__tests__/process-broker-native.test.ts src/shared/__tests__/daemon-process-client.test.ts src/cli/services/__tests__/daemon-stop.test.ts src/cli/services/__tests__/daemon-stop-forced.test.ts src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts > /tmp/insrc-shutdown-final-affected.log 2>&1
npx tsc --noEmit
npx tsx --test --test-force-exit --test-concurrency=4 --test-timeout=120000 'src/**/__tests__/*.test.ts' > /tmp/insrc-shutdown-full-t7.log 2>&1
```

The first test compiles the actual distribution, creates real named daemon parents under `/tmp/insrc-shutdown-evidence-*`, captures native broker identities before shutdown and drives the real maintenance restart/CLI stop implementation in a fresh process per temporary HOME. Its injected start callback launches another disposable daemon fixture only after stop succeeds. It never invokes the installed daemon. The environment output path is optional; without it, repeat validation does not overwrite this recorded evidence.

## Recorded Linux run

Recorded at 2026-10-24T19:27:16.172Z on Linux, Node v24.21.0. Source output: `/tmp/insrc-shutdown-t7-evidence.log` (2 passed, 0 failed). The durable [shutdown-evidence.json](shutdown-evidence.json) contains original identities, guard owner/nonce, complete synchronous source log lines, deadlines and controller outcomes copied from that run. Temporary fixture directories were cleaned after the test.

| Case | Start UTC | Original PID | Configured watchdog bound | Observed stop + restart transaction | Original termination | Restart OK / starts |
|---|---|---:|---:|---:|---|---|
| blocked | 2026-10-24T19:27:14.776Z | 2497822 | 600 ms | 852 ms | {'exitCode': None, 'signal': 'SIGKILL'} | True / 1 |
| healthy | 2026-10-24T19:27:15.699Z | 2498227 | 600 ms | 238 ms | {'exitCode': 0, 'signal': None} | True / 1 |
| guard-death | 2026-10-24T19:27:16.001Z | 2498276 | 5000 ms | 171 ms | {'exitCode': None, 'signal': 'SIGKILL'} | False / 0 |

The transaction duration includes controller launch, capability capture, shutdown and any replacement startup; it is not a claim that every phase completes within the watchdog's bound. In the blocked case the log records arm at `19:27:14.844Z`, deadline `19:27:15.444Z`, and independent termination request at `19:27:15.454Z` (10 ms scheduling overshoot). The retained original process then exits by SIGKILL, after which the controller safely starts one replacement. The configured production bound remains 20 seconds; these tests shorten it to 600 ms.

- **blocked**: `linux:26ef4fcf-dc58-4c66-ad16-d622dced0af5:4484879`
  Command: `/home/subho/.nvm/versions/node/v24.21.0/bin/node /tmp/insrc-shutdown-evidence-OuIc2G/case-fYGyUU/daemon/index.js`
  Watchdog PID: `2498057`.

- **healthy**: `linux:26ef4fcf-dc58-4c66-ad16-d622dced0af5:4484971`
  Command: `/home/subho/.nvm/versions/node/v24.21.0/bin/node /tmp/insrc-shutdown-evidence-OuIc2G/case-q3pDFQ/daemon/index.js`
  Watchdog PID: `2498255`.

- **guard-death**: `linux:26ef4fcf-dc58-4c66-ad16-d622dced0af5:4485002`
  Command: `/home/subho/.nvm/versions/node/v24.21.0/bin/node /tmp/insrc-shutdown-evidence-OuIc2G/case-lWirFG/daemon/index.js`
  Watchdog PID: `2498303`.

### What each case establishes

- **blocked** deliberately blocks cleanup with `Atomics.wait` after guarded server close. The parent event loop cannot fire timers. The independent child diagnoses the last stage and terminates the original through its retained pidfd. This controlled blocking primitive is not a reproduction of the original native defect.
- **healthy** follows the same publication, readiness, queue, flush/disconnect, awaited server-close and run-file cleanup path. It exits normally with code 0. The guard is released and exactly one disposable replacement starts afterward.
- **guard-death** keeps a real client connected while `server.close()` is pending under the guard, then deliberately kills the exact child process from its owning test parent. The source owner record names PID 2498276 and nonce `0e38a348-d0fb-4392-987e-e18e87e0d30a`. Stop observes actual process death but refuses cleanup because the guard is orphaned (`state=gone`); maintenance returns failure with only the `stop` step and starts zero replacements. No automatic guard reclamation occurs.

The separate bounded-shutdown suite proves both a blocked `closeStores` and a blocked `process.exit` hook are terminated independently of the main event loop. Missing broker readiness is diagnosed and self-kills before background/native cleanup. Existing real LMDB lock-loss/fatal/healthy store-child tests run the actual ownership and watchdog contract through a named shim; the shim changes no production target validation and retains the temporary store arguments.

## Platform and packaging evidence

| Surface | Evidence | Status / limit |
|---|---|---|
| Linux pidfd broker | Actual normal `npm run build`; retained-handle termination/state tests and lifecycle integration | Tested on this Linux host; no numeric-PID signal fallback |
| Same-PID reincarnation | Compiled test-only native OS adapter, real broker protocol, CLI and shell bridge | Deterministic injected incarnation change; does not claim forcing the host PID allocator to recycle a PID |
| Broker permission/unsupported/missing metadata | Injected native backend plus protocol/readiness failures | Fail-closed behavior tested; these adapters do not establish Darwin runtime support |
| Darwin retained Mach task right | Source implementation only | **Darwin compilation and runtime operational support remain unverified**; Linux/adapters are not Darwin evidence |
| Other operating systems | Normal build explicitly refuses unsupported host | Unsupported; no PID-only fallback |
| Watchdog distribution | Actual build emits `out/bin/insrc-shutdown-watchdog.js`, `out/daemon/shutdown-watchdog.js`, native broker and `out/bin/insrc-daemon-control.js` | Verified by packaging tests |
| Installed daemon | No deployment or live restart performed | **Installed-daemon smoke not performed**, awaiting separate authorization |

See also the native broker's [protocol and platform matrix](../../../../src/native/process-broker/README.md).

## Verification record

The per-task validation gates passed t1, t8, t9, t2, t3, t4, t5 and t6. Focused task suites cover real process retention, replaced paths, guard exclusion across async close, dead guard owners, readiness failures, healthy exit, blocked exit hooks and shell conditional propagation.

The backend suite is **not green**. The latest completed t6 sweep in `/tmp/insrc-shutdown-full-t6.log` reports 6,646 tests: 6,486 passed, 27 failed, 130 skipped and 3 todo. Earlier sweeps vary with concurrent workspace changes; none are represented as an all-pass result. Failures include missing historic artifact/acceptance fixtures, older workflow approval/code-review fixtures incompatible with strict current review binding, file-tool store-refusal coverage and the platform-sensitive native lock-loss reproduction. Some intervening concurrent runs had additional workflow failures; these were recorded rather than discarded. The final affected sweep in `/tmp/insrc-shutdown-final-affected.log` passed **62/62 tests**, with 0 skipped and 0 failed. `npx tsc --noEmit` passed (`/tmp/insrc-shutdown-final-tsc.log`). The t7 evidence suite passed 2/2 tests. The final t7 sweep in `/tmp/insrc-shutdown-full-t7.log` completed in 164.6 seconds: **6,652 tests, 6,491 passed, 28 failed, 130 skipped, 3 todo**. Its additional `ack-stale` workflow failure is recorded along with the existing failing fixture groups. No lifecycle failure from the affected 62-test suite was observed.

## Ownership guarantee and recovery

The atomic mkdir guard serializes cooperating managed publishers/removers across verification, asynchronous server close and unlink. It is not an atomic conditional-unlink guarantee against arbitrary same-user filesystem mutation outside that protocol. Replacements already present before acquisition are preserved and diagnosed. If an owner dies holding the guard, restart fails visibly. An operator must independently verify the captured owner incarnation has ended and quarantine that exact guard before retrying; no automatic deletion or reclaim is implemented.

## Code-review corrections

The first daemon code review reported 0 HIGH, 3 MED and 3 LOW findings, with degraded grounding because the six C/header files never became graph-fresh. The retained-target `waitForStop` path now verifies its original publication evidence and the guard before returning success; direct API regressions cover conflicts and removed paths. Watchdog IPC sends use callbacks to handle disconnect races; the subsequent review below further corrects transport-loss lifetime handling. The watchdog now reuses `captureStopTarget` and its single broker protocol implementation. `build-shutdown-watchdog.mjs` bundles that existing Node-only client into the packaged entrypoint and rejects any non-built-in runtime import, preserving the standalone helper's storage independence without adding a dependency. Explicit optional-property types were corrected. New readiness-disconnect tests exercise the packaged helper repeatedly.

Post-correction verification: `/tmp/insrc-shutdown-review-affected.log` passed **67/67**, 0 skipped and 0 failed, including evidence, direct retained-wait ownership and IPC-disconnect regressions. `/tmp/insrc-shutdown-review-tsc.log` passed. The bounded backend sweep `/tmp/insrc-shutdown-review-full.log` completed in 166.2 seconds with **6,646 tests: 6,485 passed, 28 failed, 130 skipped and 3 todo**. The full baseline remains non-green; no passing focused test is represented as a full-backend pass. Independent re-review of the corrected code remains pending.

The next daemon review reported 1 HIGH and 1 MED finding. IPC disconnect was incorrectly treated as proof that the parent had ended; the watchdog now keeps its retained capability and deadline while that original parent lives, including after readiness-send failure. Only positive target exit, changed parenthood or an explicit disarm releases healthy protection. Two new integration scenarios disconnect IPC and then block the original parent in cleanup or an exit hook, requiring deadline SIGKILL. The clean CLI branch also no longer repeats the cleanup already owned by `waitForStop`; a real retained-handle regression publishes new files after that completion boundary and verifies successful stop preserves them. All 21 focused regression tests passed before the broader repeat.

After the IPC-lifetime and single-completion corrections, `/tmp/insrc-shutdown-cycle2-affected.log` passed **69/69** with no skips or failures, and `/tmp/insrc-shutdown-cycle2-tsc.log` passed. `/tmp/insrc-shutdown-cycle2-full.log` completed in 166.4 seconds with **6,665 tests: 6,505 passed, 27 failed, 130 skipped and 3 todo**. All backend failures remain recorded; the focused pass is not a claim that the full suite is green. The corrected source is committed as `873e425dd` and awaits independent re-review.

The next diff review reported 0 HIGH / 1 MED / 0 LOW: a fresh HOME lacked the parent directory required for atomic guard creation. `captureDaemon` now ensures the application directory exists before acquiring the guard, matching daemon publication's existing behavior. New direct CLI and real shell regressions remove the temporary application's directory before capture/stop and before start, proving absent-target stop and subsequent startup work without pre-created state. All 17 targeted CLI/shell regressions passed before the broad repeat.

Fresh-HOME correction verification: `/tmp/insrc-shutdown-cycle3-affected.log` passed **71/71**, with no skips or failures, and `/tmp/insrc-shutdown-cycle3-tsc.log` passed. `/tmp/insrc-shutdown-cycle3-full.log` completed in 208.4 seconds with **6,695 tests: 6,534 passed, 28 failed, 130 skipped and 3 todo**. These full-backend failures are retained in the evidence; the overall backend baseline remains non-green. The fresh-HOME source fix is committed as `2c1a6c100` and awaits independent diff re-review.
