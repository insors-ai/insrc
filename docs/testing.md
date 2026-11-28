# Owned test and build runs

Use **Node 22.22.1 or newer 22.x** with dependencies and the host C compiler
installed. Put that Node installation's `bin` directory first on `PATH` before
running npm. The harness refuses other Node majors before changing output;
it does not install or silently select another runtime.
Native helpers currently build on macOS and Linux. This explicit development
coordinator remains separate from the daemon installer: tests do not silently
provision or re-execute themselves under an installed runtime. Installed-runtime
qualification records the actual owned Node/npm, a fresh npm install/build, native
module loads and public packaged-policy installation; fixture-policy tests alone
do not enable a platform.

```sh
npm run build
npm test -- src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts
npm test -- --suite=vscode src/chat/__tests__/docs-review-panel.test.ts
npm --prefix vscode-plugin test -- src/chat/__tests__/docs-review-panel.test.ts
```

Root `npm test` selects the backend by default. Explicit paths are relative to
the repository; `src/` selectors with `--suite=vscode` are relative to the
extension. Quote glob selectors. Duplicate files run once; empty or external
selections fail before mutation. Supported Node test options use `=`:
`--test-name-pattern=...`, `--test-skip-pattern=...`, `--test-reporter=...`,
and `--test-reporter-destination=...`. A report destination requires one file.
The coordinator needs TAP counts to report complete coverage; use TAP for a
machine-readable run. A successful exit without understood coverage is incomplete.

```sh
npm test -- --concurrency=1 --file-ms=1200000 'src/analyze/**/__tests__/*.test.ts'
```

Defaults are two ordinary files concurrently (allowed range 1–4), ten minutes
per build and file, ninety minutes per run, and five seconds for draining.
Override positive millisecond budgets with `--build-ms=`, `--file-ms=`,
`--run-ms=`, or `--cleanup-ms=`. Preserve any longer intentional test budget
with an explicit recorded override. The earlier audit's sixty-second limit
is not a correctness requirement.

Explicit `INSRC_LIVE_TESTS=1` uses serial file admission to preserve the
repository's provider-serialization rule. Requested and effective concurrency
are recorded separately; offline runs retain the configured concurrency.

## Ownership and results

The canonical checkout has at most one active owner, recorded in
`.insrc/tmp/test-harness/active/run.json`. Build writers and prepared-output
readers share that ownership for their entire lifetime. Another supported
build/test command refuses promptly, before cleanup or VS Code asset sync.
The full workspace/compiler/tools/spawn-scan/native/model/assets build remains
required. The retirement-package regression still plants stale output and
rebuilds; it runs alone before ordinary readers. Audited consumers refuse
raw invocations without a prepared context instead of independently rebuilding.

| Owner | Owned resources | Release condition |
| --- | --- | --- |
| Checkout coordinator | One run workspace and shared build/read lifetime | Matching lease identity and confirmed actor closure |
| Test fixture | Retained child/group or captured native handle; owned socket files | Disposal confirmation before the next case |
| Compiler probe | One compiler and ignored probe directory | Compiler closes before directory removal |
| Specialized qualification launcher | Existing proof stages under the same lease | Readers close before any later gate/assets writer |

Each run retains logs, actual child-close journals, `cleanup.json`, and test
`results.json` under `.insrc/tmp/test-harness/runs/<runId>`. Results distinguish
failure, timeout/interruption, unavailable coverage and confirmed disposal.
These are local validation records, not release qualification. Input/output
fingerprint drift makes validation incomplete. Raw emitting compiler commands,
workspace-only builds or manual output edits do not acquire this cooperating
lease; use supported commands while validating the checkout.

Children use the validated Node installation. Baseline diagnostic switches and
ambient `NODE_OPTIONS` are cleared in cloned child environments; parent settings
are unchanged. Negative environment tests set their own switches. Ordinary runs
preserve explicit live-service opt-ins; none is enabled implicitly. The existing
specialized connection qualification scripts retain their policy of disabling
live services and keep their original readiness conditions. Their changed
fingerprints await authentic requalification in remediation Batch 15.

## Interruption and recovery

SIGINT/SIGTERM and deadlines stop admission and drain retained actors. Fixture
readiness has its own bounded wait; a short behavioral abort clock begins only
after observed startup. Unconfirmed children remain owned and the checkout
stays blocked. The harness never scans for a PID to kill or automatically steals
a lease based on age or PID absence.

An uncatchable supervisor death cannot guarantee cleanup of detached descendants.
It leaves an ownership record requiring deliberate recovery. Probe residue stays
in the ignored run workspace, outside both source includes, even in that case.
Do not remove an active record merely because its recorded PID is absent.

After confirming **all actors from the recorded run have ended**, inspect the
recorded run ID and explicitly recover that same identity:

```sh
node --input-type=module -e 'import {recoverRun} from "./scripts/test-harness/context.mjs"; recoverRun(".", {runId:process.argv[1], confirmedActorsEnded:true});' '<recorded-run-id>'
```

This atomically archives the matching lease under
`.insrc/tmp/test-harness/recovered/`, preserving its metadata and any empty writer
reservation. It leaves logs/workspaces in place and signals no process.
Malformed, foreign or unexpectedly populated records require investigation; recovery refuses
them. Never substitute this declaration for evidence that actors ended.

## Testing the coordinator itself

Controller integration tests create and test ownership themselves, so run them
directly with Node 22 and one file at a time:

```sh
node --import tsx --test --test-concurrency=1 'scripts/__tests__/test-harness*.test.ts'
```

Independent source tests may also run directly. Use the coordinator for compiled
or native consumers. Keep the actor/output controllers separate from a broad
backend sweep. See the [failure audit](plans/failing-tests-2026-11-20.md),
[batch index](plans/test-remediation-batches-2026-11-20.md), and
[Batch 01 evidence](plans/test-harness-build-2026-11-20.md) for remaining failures
and the scope of validation actually performed.

## Shared search fixtures

Live-store search tests isolate HOME before importing application modules. Shared grep refuses the live data/lock as direct roots; roots containing either resolved protected target use the guarded Node walker. These searches report Node ignore/size semantics even when ripgrep is installed. Other roots use ripgrep without ambient config or symlink following. See [Batch 03 evidence](plans/live-store-search-fix-2026-11-20.md) for the read-exclusion controls and remaining fixture failures.


### Scratchpad native qualification

Automated scratchpad keyboard tests require a private X11 display (for example,
Xvfb), with `DISPLAY` set to that server and `INSRC_NATIVE_PRIVATE_DISPLAY=1`.
Do not point automated input at the user's active desktop: unrelated physical
keystrokes can enter the test note and invalidate its undo history. Run native
files serially (`--concurrency=1`). Set `INSRC_NATIVE_VSCODE_TESTS=1` for the
keyboard lifecycle probe and `INSRC_NATIVE_LIFECYCLE_TESTS=1` for the multipane,
second-process conflict and recovery/restart matrix. `INSRC_CODE_BIN` selects
the supported-floor or current VS Code binary; `INSRC_NATIVE_EVIDENCE` retains
its result. Human-operated focus qualification remains available through
`INSRC_NATIVE_MANUAL_FOCUS=1` and does not require the private-display assertion.
