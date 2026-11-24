# S2 dev preparation: final local validation

Tracked work: `TASK-c3d71313f34bce71-s2-t9`, insors-ai/insrc#273, under Story #244. This records the final local qualification of the approved nine-task S2 plan and LLD revision 4. The registered BUILD and TESTS records remain authoritative for formal task outcomes and human approval.

The final combined installer run passed **100 cases across 23 files**, with zero failures, cancellations, skips or TODOs. The separate post-run audit passed one case. TypeScript no-emit and the canonical workspace/compiler/tools/scanner/model/assets/native build passed. No unrelated backend sweep was run.

## Exact evidence

- Run: `05a58ba6-7f5d-4f37-b589-06a08c4015e5`.
- Actual accepted source: `8a3b62b0e625f3573ce790cd4fa2304186efed05`.
- Build inputs: `16526e34b9cb3153969df332d78d9a104cd61600f03e358a71ef72168a4549b4`.
- Prepared outputs: `2f2a332a4ce62dad97c0d1d06fff3cac27b985a060f0788440b47ff35a5a22bf`.
- Node `22.22.1`, private npm `10.9.4`, effective CUDA policy `skip`; actual source build used private npm, headers and owned commands.
- Requested/effective file concurrency: 1. Default ceilings: build/file 600,000 ms, run 5,400,000 ms, cleanup 5,000 ms; no overrides.
- Real dev payload: 59,910 files, 1,924,931,743 expanded bytes. Native smoke: 507,318.965292 ms.
- Native probes loaded LMDB, LanceDB, DuckDB, tree-sitter, ONNX Runtime, Parcel watcher and the installer control binding. The installed manager inspected in a fresh process using its selected private Node with empty PATH. No application stores or host daemon were started or opened.
- Cleanup: `confirmedClosed: true`, `closureMode: owned-groups`, no interruption, cancellation errors or evidence errors; actor markers empty and admitted/closed child IDs reconciled.
- Parent diagnostic flag names included `DEBUG`; the coordinator clears baseline diagnostic values for child environments. No values or credentials are archived.

[Machine-readable summary](s2-dev-preparation-validation-2026-11-24.json). Original TAP, prepared record, close/disposal journals and cleanup remain in `.insrc/tmp/test-harness/runs/05a58ba6-7f5d-4f37-b589-06a08c4015e5/`.

## Scope and fixes discovered by qualification

The actual source checkout, locked npm installation, canonical full build, payload collection, native loading and fresh installed control are real. Dependency/lifecycle/migration owning peers are test fixtures. S3/S4/S5 production ports remain explicitly absent; this does not certify a complete production installation or old-daemon migration. The existing v2 daemon was untouched.

The guarantee covers admitted actors, retained owned groups and cooperating registered descendants. Arbitrary unregistered detached processes remain outside it. Missing or unsupported closure evidence blocks publication/retry; this is ownership qualification, not arbitrary-descendant isolation.

Local macOS ARM64/fixture evidence does not qualify UTM, OrbStack, Linux, Windows, IDE flows, live migration hooks or signed/public releases. The complete bundle regression produces a fixture descriptor and verifies real ZIP extraction/native loading; it does not publish a qualified release. Public contracts and generated ownership/sequence boundaries were unchanged.

Qualification found and fixed shallow-source fetch boundary handling, the exact standalone-installer Git scanner exemption, and fixture tool-root/runtime selection. One earlier smoke hit its 600-second test limit and is recorded as cancelled, not passed; it completed cleanup after 631 seconds. The fixture now avoids four redundant full-tree reads while retaining all production verification, and cancellation uses its owner channel. The post-run evidence audit lives outside normal backend discovery and checks recorded diagnostic metadata accurately. An earlier 100-case run passed before that audit relocation; the full final run above was repeated under the final input fingerprint.

## Reproduce the scoped qualification

Use a verified Node 22 installation first on PATH and preserve any explicit CUDA setting; default it to `skip` only when absent:

```sh
ONNXRUNTIME_NODE_INSTALL_CUDA=${ONNXRUNTIME_NODE_INSTALL_CUDA-skip} INSRC_BUILD_CONFIRM_CLOSURE=1 npm test -- --concurrency=1 'src/installer/**/__tests__/*.test.ts' src/shared/__tests__/installation-home.test.ts scripts/__tests__/build-script.test.ts scripts/__tests__/forbidden-spawn-scan.test.ts
```

After the coordinator closes, write its actual returned run UUID to the ignored `.insrc/tmp/s2-final-regression.json` as `{ "runId": "<recorded UUID>" }`, then run:

```sh
node --import tsx --test scripts/__tests__/installer-s2-qualification.test.ts
```

The audit requires the exact complete file selection, understood TAP counts, current source/output fingerprints, successful build, positive cleanup and matching close journals. It refuses stale or partial reports. Its case is a separate post-run check, so ordinary backend discovery has no circular dependency on an earlier local report. Formal t9 validation additionally runs its mapped native smoke and this audit; outcomes are recorded in S002/TESTS.md.

## Selected files

| File | Passed cases |
| :--- | ---: |
| `scripts/__tests__/build-script.test.ts` | 1 |
| `scripts/__tests__/forbidden-spawn-scan.test.ts` | 6 |
| `src/installer/__tests__/bootstrap.test.ts` | 5 |
| `src/installer/__tests__/bridge-protocol.test.ts` | 2 |
| `src/installer/__tests__/bundle.test.ts` | 4 |
| `src/installer/__tests__/contracts.test.ts` | 5 |
| `src/installer/__tests__/controller-store.test.ts` | 7 |
| `src/installer/__tests__/dev-complete-payload.test.ts` | 1 |
| `src/installer/__tests__/dev-git.test.ts` | 4 |
| `src/installer/__tests__/dev-manager.test.ts` | 6 |
| `src/installer/__tests__/dev-metadata.test.ts` | 5 |
| `src/installer/__tests__/dev-payload.test.ts` | 3 |
| `src/installer/__tests__/dev-recovery.test.ts` | 4 |
| `src/installer/__tests__/dev-toolchain.test.ts` | 3 |
| `src/installer/__tests__/dev-worker.test.ts` | 5 |
| `src/installer/__tests__/foundation-payload.test.ts` | 1 |
| `src/installer/__tests__/installed-dev.test.ts` | 3 |
| `src/installer/__tests__/location.test.ts` | 4 |
| `src/installer/__tests__/manager.test.ts` | 13 |
| `src/installer/__tests__/operation-control.test.ts` | 2 |
| `src/installer/__tests__/publisher.test.ts` | 6 |
| `src/installer/__tests__/terminal-install.test.ts` | 9 |
| `src/shared/__tests__/installation-home.test.ts` | 1 |
