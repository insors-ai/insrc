# S2 dev preparation: final local validation

Tracked work: `TASK-c3d71313f34bce71-s2-t9`, insors-ai/insrc#273, under Story #244. This records the final local qualification of the approved nine-task S2 plan and LLD revision 4. The registered BUILD and TESTS records remain authoritative for formal task outcomes and human approval.

The final combined installer run passed **114 cases across 24 files**, with zero failures, cancellations, skips or TODOs. The separate post-run audit passed one case. TypeScript no-emit and the canonical workspace/compiler/tools/scanner/model/assets/native build passed. No unrelated backend sweep was run.

## Critical self-review corrections

The five findings below are corrections to the existing approved S2 tasks, not separate issues. The combined qualification below was repeated after all five corrections. Registered task revalidation passed for t3, t5 and t6. After the user authorized starting the host daemon, t9's typecheck and both tests passed; its final task verdict rejected completion because BUILD presentation remains blocked.

| Finding | Correction and regression evidence |
| :--- | :--- |
| Cancellation during pre-shutdown observation could still stop the incumbent. | Check cancellation before observation, after observation and immediately before shutdown IPC; test all three cancellation boundaries without shutdown, migration or activation. |
| An owned process group could outlive its direct leader without receiving cancellation. | Retain group ownership after leader exit, drain remaining members, and latch confirmed disappearance; test descendants with independent and inherited output pipes. |
| UTF-8 control frames could be corrupted at byte-chunk boundaries. | Buffer bounded raw bytes and strictly decode complete newline-delimited frames; test fragmented Unicode and malformed bytes. |
| A prepared payload or its completion proof could be acknowledged before durable flushes. | Flush payload files/directories, publication parents and closed ownership journals before completion; reject file/directory fsync faults and reconcile a renamed proof only after a successful parent flush. |
| The parent worker used the per-command deadline for the entire preparation job. | Apply the remaining overall run budget and use the nonce-bound owner cancellation channel; test multiple commands spanning a shorter command budget and cooperative deadline cancellation. |

The shared durability helper performs filesystem operations only. Worker/controller capability boundaries and public wire/schema relationships are unchanged. Fault injection proves ordering and fail-closed behavior; no physical power-loss experiment was performed. The guarantee remains limited to admitted actors, retained owned groups and cooperating registered descendants.

## Exact evidence

- Run: `b64693a8-ae69-4489-a8c3-454e0ee7b014`.
- Actual accepted source: `168b622f6582d173c8d37d7e50e33256f2bc1d20`.
- Build inputs: `e93ebd0c8d45aaf65c73ab3271c5aacf091fd0ff01f87a02c83ab98c21226547`.
- Prepared outputs: `c5e1717deb59c0baecada3fd52cf192c472d22e09bc25a178271ab538fdbc15d`.
- Node `22.22.1`, private npm `10.9.4`, effective CUDA policy `skip`; actual source build used private npm, headers and owned commands.
- Requested/effective file concurrency: 1. Default ceilings: build/file 600,000 ms, run 5,400,000 ms, cleanup 5,000 ms; no overrides.
- Real dev payload: 59,914 files, 1,924,949,606 expanded bytes. Native smoke: 527,428.258625 ms.
- Native probes loaded LMDB, LanceDB, DuckDB, tree-sitter, ONNX Runtime, Parcel watcher and the installer control binding. The installed manager inspected in a fresh process using its selected private Node with empty PATH. No application stores or host daemon were started or opened.
- Cleanup: `confirmedClosed: true`, `closureMode: owned-groups`, no interruption, cancellation errors or evidence errors; actor markers empty and all admission/close/disposal child IDs reconciled (33 each).
- Parent diagnostic flag names included `DEBUG`; the coordinator clears baseline diagnostic values for child environments. No values or credentials are archived.

[Machine-readable summary](s2-dev-preparation-validation-2026-11-24.json). Original TAP, prepared record, close/disposal journals and cleanup remain in `.insrc/tmp/test-harness/runs/b64693a8-ae69-4489-a8c3-454e0ee7b014/`.

## Scope and fixes discovered by qualification

The actual source checkout, locked npm installation, canonical full build, payload collection, native loading and fresh installed control are real. Dependency/lifecycle/migration owning peers are test fixtures. S3/S4/S5 production ports remain explicitly absent; this does not certify a complete production installation or old-daemon migration. The v2 daemon installation was not synced, rebuilt or updated. After the initial validation request found it unreachable, the user authorized starting its existing compiled entry under verified local Node 22.22.1; IPC remained healthy at the final 730-second uptime check.

The guarantee covers admitted actors, retained owned groups and cooperating registered descendants. Arbitrary unregistered detached processes remain outside it. Missing or unsupported closure evidence blocks publication/retry; this is ownership qualification, not arbitrary-descendant isolation.

Local macOS ARM64/fixture evidence does not qualify UTM, OrbStack, Linux, Windows, IDE flows, live migration hooks or signed/public releases. The complete bundle regression produces a fixture descriptor and verifies real ZIP extraction/native loading; it does not publish a qualified release. Public contracts and generated ownership/sequence boundaries were unchanged.

Qualification found and fixed shallow-source fetch boundary handling, the exact standalone-installer Git scanner exemption, and fixture tool-root/runtime selection. One earlier smoke hit its 600-second test limit and is recorded as cancelled, not passed; it completed cleanup after 631 seconds. The fixture now avoids four redundant full-tree reads while retaining all production verification, and cancellation uses its owner channel. The post-run evidence audit lives outside normal backend discovery and checks recorded diagnostic metadata accurately. An earlier 100-case run passed before that audit relocation; the full final run above was repeated under the final input fingerprint.

## Reproduce the scoped qualification

Use a verified Node 22 installation first on PATH and preserve any explicit CUDA setting; default it to `skip` only when absent:

```sh
ONNXRUNTIME_NODE_INSTALL_CUDA=${ONNXRUNTIME_NODE_INSTALL_CUDA-skip} INSRC_BUILD_CONFIRM_CLOSURE=1 npm test -- --concurrency=1 'src/installer/**/__tests__/*.test.ts' src/shared/__tests__/installation-home.test.ts scripts/__tests__/build-script.test.ts scripts/__tests__/forbidden-spawn-scan.test.ts scripts/__tests__/test-harness-coordinator.test.ts
```

After the coordinator closes, write its actual returned run UUID to the ignored `.insrc/tmp/s2-final-regression.json` as `{ "runId": "<recorded UUID>" }`, then run:

```sh
node --import tsx --test scripts/__tests__/installer-s2-qualification.test.ts
```

The audit requires the exact complete file selection, understood TAP counts, current source/output fingerprints, successful build, positive cleanup and matching admission/close/disposal journals. It refuses stale or partial reports. Its case is a separate post-run check, so ordinary backend discovery has no circular dependency on an earlier local report. Formal t9 validation normally runs its mapped native smoke and this audit. The first post-fix request returned `daemon-unreachable` / `ECONNREFUSED`. After the user authorized a start, one resumed request ran both cases successfully against `a3fcced89`; the smoke took 550,203 ms including its test runner. Its MCP connection timed out after 300 seconds, but the same daemon-side request continued and persisted TESTS revision 19. No duplicate validation was started.

## Registered validation and remaining gate

T3, t5 and t6 passed their registered post-fix validation with clean typechecks. T5 initially passed all tests but failed scope because one commit mixed private preparation with publication/reuse changes. That unpublished commit was split between t5 and t6 without changing the final tree; t5 and t6 then passed. The corrected t3 wrapper explicitly clears inherited node:test context and verifies both coordinator cases actually execute under private Node 22.

The final direct audit passed after the combined run. The first registered t9 request could not start because the daemon was unreachable. After the authorized daemon start, the resumed request passed its typecheck, combined-report audit and complete native smoke, recorded at `2026-11-24T17:49:45.924Z` on `a3fcced89`. BUILD revision 19 nevertheless records t9 failed: "The required tests pass and scoped regression evidence is substantive, but complete final story BUILD presentation remains blocked and unverified." T1–t8 remain passed. Both `insrc_present` attempts (BUILD ID and document path) returned `notPending`; BUILD remains `draft`. The repo requires successful presentation before human approval, so no approval was attempted. Resolve that workflow-state blocker before claiming story completion.

## Selected files

| File | Passed cases |
| :--- | ---: |
| `scripts/__tests__/build-script.test.ts` | 1 |
| `scripts/__tests__/forbidden-spawn-scan.test.ts` | 6 |
| `scripts/__tests__/test-harness-coordinator.test.ts` | 10 |
| `src/installer/__tests__/bootstrap.test.ts` | 5 |
| `src/installer/__tests__/bridge-protocol.test.ts` | 2 |
| `src/installer/__tests__/bundle.test.ts` | 4 |
| `src/installer/__tests__/contracts.test.ts` | 5 |
| `src/installer/__tests__/controller-store.test.ts` | 7 |
| `src/installer/__tests__/dev-complete-payload.test.ts` | 1 |
| `src/installer/__tests__/dev-git.test.ts` | 4 |
| `src/installer/__tests__/dev-manager.test.ts` | 6 |
| `src/installer/__tests__/dev-metadata.test.ts` | 5 |
| `src/installer/__tests__/dev-payload.test.ts` | 4 |
| `src/installer/__tests__/dev-recovery.test.ts` | 4 |
| `src/installer/__tests__/dev-toolchain.test.ts` | 3 |
| `src/installer/__tests__/dev-worker.test.ts` | 7 |
| `src/installer/__tests__/foundation-payload.test.ts` | 1 |
| `src/installer/__tests__/installed-dev.test.ts` | 3 |
| `src/installer/__tests__/location.test.ts` | 4 |
| `src/installer/__tests__/manager.test.ts` | 14 |
| `src/installer/__tests__/operation-control.test.ts` | 2 |
| `src/installer/__tests__/publisher.test.ts` | 6 |
| `src/installer/__tests__/terminal-install.test.ts` | 9 |
| `src/shared/__tests__/installation-home.test.ts` | 1 |
