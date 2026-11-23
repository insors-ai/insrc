# OrbStack Linux validation

Validated committed source `44db80005` from branch `installer` on 2026-11-23. The user directed Linux VM testing and explicitly excluded changes to the existing Mac daemon, which tracks `v2`. No Mac daemon control, install, rebuild or upgrade was performed.

## Environment

- OrbStack VM `insrc-node-arm64`: Ubuntu 24.04.5 LTS, Linux aarch64, two CPU quota, 8 GiB cgroup memory limit.
- Native Linux checkout: `/home/subhagho/insrc-installer-validation-44db80005`. It remains clean; no source changes were needed.
- Node 22.22.1, npm 10.9.4, OpenJDK 21.0.13.1, Gradle 8.10.2.
- Clean root and VS Code `npm ci`; native modules built/installed on Linux. No macOS `node_modules` or build output was copied.
- `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`, `PYTHONDONTWRITEBYTECODE=1`; live-service opt-in unset. Node test HOME is isolated beneath `/home/subhagho/insrc-installer-validation-state-44db80005/home`.

## Results

| Check | Result |
| --- | --- |
| Canonical backend build, tools typecheck, model/resource checks | Pass, through the existing test coordinator |
| Focused backend/CLI/IPC/guard/model/config/workflow/client tests | 280 passed across 40 files; zero failures, cancellations or skips |
| Threaded boot/disposal tests | All six pass, including indexing drain, maintenance completion and injected startup failure |
| Threaded daemon acceptance | All five pass |
| Captured test-process cleanup | `confirmedClosed: true`, no cancellation/evidence errors |
| VS Code build and bundle | Pass with its own clean dependencies |
| JetBrains production and all retained test-source compilation | Pass |
| Focused JetBrains JUnit | 42 passed in seven classes; zero failures/errors/skips |
| Original offline Node-to-JUnit bridge | Pass after runtime dependencies were fetched |
| Current JetBrains JAR contents | All three include steering and exclude retired lifecycle/freshness classes, installer and runtime-policy assets |
| Deletion accounting | 278 dedicated paths absent; 176 member entries accounted for; zero pending entries |

The initial offline JUnit bridge stopped before running cases because the fresh VM lacked runtime dependencies. A focused online Gradle run resolved those dependencies and passed all 42 cases; the unchanged offline bridge then passed. No source workaround or test exclusion was added.

## Known separate failure

The existing `artifact-write-inventory.test.ts` corpus audit still has one failing case (nine other cases pass): nine unchanged writer sources lack classifications, and a stale entry names the already absent `src/indexer/repo-ignore-config.ts`. Linux reproduces the same failure recorded before this run. The nine source hashes match the recorded pre-removal baseline; see `summary.json`. This audit was not weakened or marked passing.

## Evidence and limits

- `results.json` records all 40 selected paths, exits and case counts; `prepared.json` proves successful canonical preparation and its fingerprints.
- `cleanup.json` records captured-process closure. `focused-tests.txt` is the coordinator transcript.
- `junit/` contains the seven JUnit XML reports. `jetbrains-focused-final.txt` records the original bridge passing.
- `summary.json` records toolchains, VM limits, command statuses, accounting, baseline hashes and JAR SHA256/content audits. `builds.txt` preserves install/build output.
- `known-inventory-check.txt` preserves the separate baseline failure.

This is one native ARM64 Linux VM validation run. It does not claim x64, Windows, CUDA, live-provider qualification or a full repository sweep. Source fixtures may exercise startup/model availability; live-service suites were not opted in.

Formal insrc task-gate resubmissions and final human BUILD approval remain unrecorded. This Linux evidence does not impersonate workflow approval or change the existing task records. The Mac daemon remains outside scope.
