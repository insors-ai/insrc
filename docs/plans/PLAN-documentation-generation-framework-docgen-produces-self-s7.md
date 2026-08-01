<!-- insrc:artifact PLAN-870ed3dd246225f4-s7 -->

# Plan: E20260731870ed3dd:S007

**Epic:** `documentation-generation-framework-docgen-produces-self`
**LLD run:** `wf-1785526646157-51k4x3`
**LLD effective hash:** `cb5b27744db2...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Extract DOCGEN_ASSET_DIR + resolveDocgenRuntimeManifest() in shell.ts | S | — | unit: DOCGEN_ASSET_DIR resolves to the same directory loadRuntime reads from; unit: loadRuntime output is byte-identical after ASSET_DIR→DOCGEN_ASSET_DIR extraction | [[c1]] |
| 2 | **`t2`** Implement validateDocgenAssets + DocgenAssetValidationError/DocgenAssetFailure | M | `t1` | unit: validateDocgenAssets returns silently when all assets present and non-empty; unit: validateDocgenAssets collects every missing/empty/malformed-manifest failure into one DocgenAssetValidationError throw with one Fix: line | [[c3]] [[c5]] [[c2]] [[c15]] |
| 3 | **`t3`** Wire validateDocgenAssets into daemon boot sequence | S | `t2` | integration: validateDocgenAssets runs clean against the real built DOCGEN_ASSET_DIR (daemon boot path) | [[c4]] |
| 4 | **`t4`** Unit tests for validateDocgenAssets branches | M | `t2` | unit: validateDocgenAssets returns silently when all assets present and non-empty; unit: validateDocgenAssets throws DocgenAssetValidationError naming runtime.json when missing, with a copy-assets Fix: line; unit: validateDocgenAssets collects every missing bundle into one throw (not just the first); unit: validateDocgenAssets reports 'file is empty' for a whitespace-only bundle; unit: validateDocgenAssets reports a manifest parse failure for malformed runtime.json; unit: DOCGEN_ASSET_DIR resolves to the same directory loadRuntime reads from | [[c6]] |
| 5 | **`t5`** Integration test against the real built asset tree | S | `t2` | integration: built out/assets/docgen has present, non-empty runtime.json + referenced mermaidAsset/svgPanZoomAsset; integration: validateDocgenAssets runs clean against the real built DOCGEN_ASSET_DIR; integration: manifest-referenced asset filenames are git-tracked under src/assets/docgen | [[c7]] |
| 6 | **`t6`** Regression test: generation-time fallback unchanged | S | `t1` | unit: assembleShell still returns sc4 fallbackUnavailable naming copy-assets when DOCGEN_ASSET_DIR has no assets, rather than throwing; unit: loadRuntime output is byte-identical for a given built tree after the ASSET_DIR→DOCGEN_ASSET_DIR extraction | [[c8]] [[c13]] |
| 7 | **`t7`** Extend offline self-contained smoke test | S | `t1` | smoke: built-tree sc3 shell inlines a >1MB runtime with no <script src=/<link href= and carries supportsZoomPan; smoke: offline self-contained assertion holds for both the primary inline backend and the s5 subprocess-fallback backend | [[c9]] |

### E20260731870ed3dd:S007:T001 — Extract DOCGEN_ASSET_DIR + resolveDocgenRuntimeManifest() in shell.ts

In src/docgen/render/shell.ts, promote the private ASSET_DIR constant to an exported DOCGEN_ASSET_DIR constant, using the identical import.meta.url-relative resolution already in place. Extract a shared resolveDocgenRuntimeManifest(): RuntimeManifest helper that reads and parses runtime.json from DOCGEN_ASSET_DIR, and repoint loadRuntime() to obtain the manifest via this helper instead of reading runtime.json itself, keeping loadRuntime()'s existing runtimeCache memoization layered on top of the helper's result. No behavior change: same resolved path, same manifest contents, same memoization.

**Acceptance checks:**
- DOCGEN_ASSET_DIR is exported from shell.ts and resolves to the same directory the previous private ASSET_DIR resolved to
- resolveDocgenRuntimeManifest() is exported from shell.ts, reads runtime.json from DOCGEN_ASSET_DIR, and is the single call site loadRuntime() uses to obtain the parsed manifest — no independent runtime.json read remains in loadRuntime()
- loadRuntime()'s resolved path, manifest contents, and runtimeCache memoization behavior are unchanged after the extraction

### E20260731870ed3dd:S007:T002 — Implement validateDocgenAssets + DocgenAssetValidationError/DocgenAssetFailure

Add validateDocgenAssets(): void, mirroring validateAnalyzePrompts in src/analyze/context/boot-validator.ts, that calls the shared resolveDocgenRuntimeManifest() helper (from t1) to obtain the parsed runtime.json manifest from DOCGEN_ASSET_DIR, then stat+non-empty-checks manifest.mermaidAsset and manifest.svgPanZoomAsset. Introduce DocgenAssetFailure {componentId, path, reason} and DocgenAssetValidationError, which collects every failure (missing runtime.json, missing bundle(s), empty bundle, malformed manifest JSON) into one throw carrying a single actionable Fix: line naming the copy-assets ship step. Read-only: stat + readFile only, no mutation, no network call, no new asset-shipping path.

**Acceptance checks:**
- validateDocgenAssets() returns silently when runtime.json and both referenced bundles are present and non-empty under DOCGEN_ASSET_DIR
- validateDocgenAssets() throws a single DocgenAssetValidationError listing every failing component (not just the first) when runtime.json is missing, a bundle is missing, a bundle is empty, or the manifest is malformed JSON — each DocgenAssetFailure entry carries componentId/path/reason, and the thrown error's message contains exactly one Fix: line naming copy-assets for the whole collected error, not one per entry
- validateDocgenAssets() obtains the manifest via the shared resolveDocgenRuntimeManifest() helper rather than an independent runtime.json read, and performs only read-only stat/readFile calls (no writes, no fetches), introducing no second asset-shipping path

### E20260731870ed3dd:S007:T003 — Wire validateDocgenAssets into daemon boot sequence

In src/daemon/index.ts, call validateDocgenAssets() immediately after the existing validateAnalyzePrompts() call, before the daemon accepts requests. A thrown DocgenAssetValidationError propagates to the same top-level fatal handler used for prompt-validation failures (log + clean exit).

**Acceptance checks:**
- validateDocgenAssets() is invoked in src/daemon/index.ts directly after validateAnalyzePrompts() and before the daemon begins accepting IPC requests
- A thrown DocgenAssetValidationError during boot is caught by the existing top-level fatal handler, logged, and causes a clean daemon exit rather than a partial or degraded boot

### E20260731870ed3dd:S007:T004 — Unit tests for validateDocgenAssets branches

Add unit tests, mirroring src/analyze/context/boot-validator.test.ts, against a controllable/temp asset dir covering: full pass (no throw), missing runtime.json, one or more missing bundles collected into a single throw, an empty bundle, malformed manifest JSON, and an assertion that DOCGEN_ASSET_DIR is the same directory loadRuntime resolves.

**Acceptance checks:**
- Unit tests cover the pass case and every DocgenAssetValidationError branch (missing runtime.json, missing bundle(s) collected together, empty bundle, malformed manifest), each asserting componentId/path/reason and that the thrown error's message contains exactly one Fix: line naming copy-assets for the whole error
- A unit test asserts DOCGEN_ASSET_DIR is the identical path both validateDocgenAssets and loadRuntime resolve, and that both obtain the manifest via the shared resolveDocgenRuntimeManifest() helper rather than independent runtime.json reads

### E20260731870ed3dd:S007:T005 — Integration test against the real built asset tree

Add an integration test that runs against the real `npm run build` output, asserting runtime.json and its referenced mermaidAsset/svgPanZoomAsset resolve to present, non-empty files under out/assets/docgen, that validateDocgenAssets() runs clean against the real DOCGEN_ASSET_DIR, and that the same asset filenames are git-tracked under src/assets/docgen for the installer clone path.

**Acceptance checks:**
- Integration test asserts runtime.json plus its referenced bundles are present and non-empty under the built out/assets/docgen tree
- validateDocgenAssets() completes without throwing when run against the real built DOCGEN_ASSET_DIR, and the referenced asset filenames are confirmed to also exist under the git-tracked src/assets/docgen source tree

### E20260731870ed3dd:S007:T006 — Regression test: generation-time fallback unchanged

Add or extend a unit test that, with the runtime cache reset and DOCGEN_ASSET_DIR pointed at an asset-less dir, confirms assembleShell still returns the existing sc4 fallbackUnavailable outcome (naming copy-assets) rather than throwing, and that loadRuntime's output is byte-identical for a given built tree after the ASSET_DIR/DOCGEN_ASSET_DIR + resolveDocgenRuntimeManifest extraction.

**Acceptance checks:**
- With DOCGEN_ASSET_DIR pointed at a dir with no assets, assembleShell() returns the unchanged sc4 fallbackUnavailable outcome naming copy-assets instead of throwing
- loadRuntime()'s resolved output is unchanged (same path, same memoized bytes) after the ASSET_DIR/DOCGEN_ASSET_DIR + resolveDocgenRuntimeManifest extraction

### E20260731870ed3dd:S007:T007 — Extend offline self-contained smoke test

Extend src/docgen/render/__tests__/shell.test.ts's existing offline assertion to confirm a built-tree sc3 shell inlines the runtime (>1MB), has no `<script src=` / `<link href=`, and carries supportsZoomPan, for both the primary inline backend and the s5 subprocess-fallback backend.

**Acceptance checks:**
- Smoke test confirms a generated shell from the built tree has no external <script src=/<link href= references and inlines a >1MB runtime with supportsZoomPan true
- The same offline/self-contained assertion passes for both the primary inline renderer path and the s5 subprocess-fallback renderer path

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| all assets present + non-empty → returns silently (no throw) | `t2`, `t4` |
| runtime.json missing → throws DocgenAssetValidationError listing runtime.json with an ENOENT/'file not found' reason + a copy-assets 'Fix:' line | `t2`, `t4` |
| a manifest-referenced bundle (mermaid.min.js / svg-pan-zoom.min.js) missing → the error lists EVERY missing bundle in one throw (not just the first) | `t2`, `t4` |
| a referenced bundle present but empty (whitespace-only) → error reason 'file is empty' | `t2`, `t4` |
| runtime.json malformed JSON → error names the manifest parse failure | `t2`, `t4` |
| DOCGEN_ASSET_DIR is the SAME path loadRuntime reads from (one source of truth — assert the validator and loadRuntime resolve the identical dir) | `t1`, `t4` |
| runtime.json + its referenced mermaidAsset + svgPanZoomAsset resolve to present, NON-EMPTY files under the built out/assets/docgen (proves copy-assets staged them via the existing path) | `t5` |
| validateDocgenAssets() runs clean (no throw) against the real DOCGEN_ASSET_DIR — the daemon-boot check passes on this build | `t3`, `t5` |
| the three assets are git-tracked (so an installer clone receives them) — asserted via the manifest referencing filenames that exist in src/assets/docgen too | `t5` |
| with the runtime cache reset + DOCGEN_ASSET_DIR pointed at a dir with no assets, assembleShell returns sc4 fallbackUnavailable naming copy-assets (UNCHANGED s1 behaviour) rather than throwing | `t6` |
| loadRuntime output is byte-identical for a given built tree after the ASSET_DIR → DOCGEN_ASSET_DIR extraction (no renderer-output change) | `t1`, `t6` |
| a generated sc3 shell from the built tree inlines the runtime (>1MB), has NO `<script src=` / `<link href=`, and carries supportsZoomPan — so a document moved to a network-less machine renders fully with zoom/pan | `t7` |
| both backends: the primary inline shell AND (s5) the fallback shell are self-contained offline | `t7` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s7 handoff: export DOCGEN_ASSET_DIR + extract resolveDocgenRuntimeManifest() from shell.ts as the shared source of truth for the runtime.json manifest`
- **[[c2]]** `prior-artifact` `LLD s7 handoff: validateDocgenAssets() mirrors validateAnalyzePrompts in src/analyze/context/boot-validator.ts`
- **[[c3]]** `prior-artifact` `LLD s7 handoff: DocgenAssetFailure {componentId, path, reason} + DocgenAssetValidationError collect every failure into one throw carrying a single Fix: line naming copy-assets`
- **[[c4]]** `prior-artifact` `LLD s7 handoff: wire validateDocgenAssets() into src/daemon/index.ts immediately after validateAnalyzePrompts(), before the daemon accepts requests`
- **[[c5]]** `prior-artifact` `LLD s7 handoff: validateDocgenAssets() stat+non-empty-checks manifest.mermaidAsset and manifest.svgPanZoomAsset from the parsed runtime.json manifest`
- **[[c6]]** `prior-artifact` `LLD s7 handoff: unit tests mirror src/analyze/context/boot-validator.test.ts against a controllable/temp asset dir`
- **[[c7]]** `prior-artifact` `LLD s7 handoff: integration test against the real npm run build output confirms assets present under out/assets/docgen and the same filenames git-tracked under src/assets/docgen`
- **[[c8]]** `prior-artifact` `LLD s7 handoff: assembleShell must preserve the sc4 fallbackUnavailable degrade path naming copy-assets, not throw, when assets are absent`
- **[[c9]]** `prior-artifact` `LLD s7 handoff: sc3 self-contained offline shell — no <script src=>/<link href=>, inlines a >1MB runtime, carries supportsZoomPan, for both the primary inline backend and the s5 subprocess-fallback backend`
- **[[c13]]** `prior-artifact` `LLD s7 handoff: loadRuntime()'s resolved path, manifest contents, and memoization must remain byte-identical after the ASSET_DIR/DOCGEN_ASSET_DIR + resolveDocgenRuntimeManifest extraction`
- **[[c15]]** `prior-artifact` `LLD s7 handoff: malformed runtime.json JSON must be reported as a manifest parse failure within the single collected DocgenAssetValidationError throw`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-08-01T05:43:21.348Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | manual | src/docgen/render/shell.ts has a private ASSET_DIR constant + a loadRuntime that reads/parses runtime.json + a RuntimeManifest type — the symbols t1 promotes to DOCGEN_ASSET_DIR + resolveDocgenRuntimeManifest(). | shell.ts:36 `const ASSET_DIR = join(...,'assets','docgen')`, :38 RuntimeManifest, :48 loadRuntime, :50 `JSON.parse(await readFile(join(ASSET_DIR,'runtime.json')))` — the exact symbols t1 promotes/extracts. Confirmed. | none |
| t2 | citation | LOW | manual | src/analyze/context/boot-validator.ts is the model t2 mirrors: validateAnalyzePrompts collects failures {componentId,path,reason} into a typed AnalyzePromptValidationError with a Fix: line, using stat/readFile + body.trim().length===0. | boot-validator.ts:141 validateAnalyzePrompts, :74 AnalyzePromptValidationError, componentId in failures, :83 'Fix:' line — the pattern t2 mirrors. Confirmed. | none |
| t2 | citation | LOW | manual | src/assets/docgen/runtime.json declares mermaidAsset + svgPanZoomAsset, the two bundle filenames validateDocgenAssets stat+non-empty-checks. | runtime.json:4 mermaidAsset='mermaid.min.js', :5 svgPanZoomAsset='svg-pan-zoom.min.js' — the two bundle filenames the validator checks. Confirmed. | none |
| t3 | citation | LOW | manual | src/daemon/index.ts calls validateAnalyzePrompts() at boot — t3 inserts validateDocgenAssets() immediately after it, before the daemon accepts requests. | daemon/index.ts:298 `validateAnalyzePrompts();` at boot — the insertion point for validateDocgenAssets(). Confirmed. | none |
| t4 | citation | LOW | manual | src/analyze/context/__tests__/boot-validator.test.ts is the test pattern t4 mirrors (present-assets pass silently; missing/empty throws the typed error). | boot-validator.test.ts:76 `assert.doesNotThrow(() => validateAnalyzePrompts())` + throw-branch assertions on err.missing[].componentId — the test pattern t4 mirrors. Confirmed. | none |
| t6 | semantic | LOW | manual | assembleShell in shell.ts already wraps loadRuntime and returns sc4 fallbackUnavailable naming copy-assets on a read failure — the degrade path t6 asserts stays unchanged. | shell.ts:247 `runtime = await loadRuntime();` inside the try mapping failure to fallbackUnavailable; :60 _resetRuntimeCacheForTests — the degrade path + cache-reset seam t6 uses. Confirmed. | none |
| t7 | citation | LOW | manual | src/docgen/render/__tests__/shell.test.ts holds the offline self-contained assertion (no <script src=, runtime inlined >1MB) that t7 extends to both backends. | shell.test.ts:64 'assembleShell: offline self-contained shell — runtime INLINED' asserting no external fetch + inlined runtime + supportsZoomPan — the assertion t7 extends. Confirmed. | none |
| tasks | inventory | LOW | manual | The plan enumerates exactly 7 tasks t1–t7. | Seven task sections S007:T001–T007 present; t1–t3 implementation + t4–t7 tests. Confirmed. | none |
| tasks | ordering | LOW | manual | The task dependency DAG is acyclic and well-formed: t1(—); t2->t1; t3->t2; t4->t2; t5->t2; t6->t1; t7->t1. | DAG: t1(—); t2->t1; t3->t2; t4->t2; t5->t2; t6->t1; t7->t1. Acyclic, every dep precedes its dependent; t1's shared extraction precedes both the validator (t2) and the regression/smoke tests (t6/t7). Confirmed. | none |
| t2 | semantic | LOW | manual | The empty-body rule the validator reuses (body.trim().length===0) exists in the boot-validator model. | boot-validator.ts:173 `if (body.trim().length === 0)` — the empty-body rule validateDocgenAssets reuses. Confirmed. | none |
