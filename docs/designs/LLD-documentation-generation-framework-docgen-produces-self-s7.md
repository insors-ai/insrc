<!-- insrc:artifact LLD-870ed3dd246225f4-s7 -->

# LLD: E20260731870ed3dd:S007

**Epic:** `documentation-generation-framework-docgen-produces-self`
**HLD base run:** `wf-1785421889464-2ayzlc`
**HLD effective hash:** `cb5b27744db2...`

## HLD context

**Framework:** Both the primary inline renderer and the D2/Graphviz subprocess fallback assemble into the identical single-file sc3 shell, which extends (rather than parallels) the existing loadMermaidCdnMeta / RenderedArtifactHtml primitives. s7 hardens the installed-build asset-loading path behind that shell.
**Rollout phase:** Phase D — Surface parity & installed-build hardening
**Consumes:** `sc1` (DocumentIR), `sc3` (RenderedDocumentShell)

## Contract details

**Surface level:** internal

### `validateDocgenAssets`

```typescript
function validateDocgenAssets(): void
```

**Returns:** `void` — Fail-fast boot check (mirrors validateAnalyzePrompts): reads runtime.json from the shared docgen asset dir, then stat + non-empty-checks the two bundles it references (manifest.mermaidAsset, manifest.svgPanZoomAsset). Returns silently when all are present + non-empty; otherwise throws. Wired at daemon boot right after validateAnalyzePrompts(), so an installed build with a mis-staged/empty docgen asset REFUSES TO START rather than degrading at first generation (ac1).

**Errors:**
- `DocgenAssetValidationError` when runtime.json is missing/unreadable/malformed, or a manifest-referenced bundle (mermaid.min.js / svg-pan-zoom.min.js) is missing, unreadable, or empty — the typed error lists every failure {componentId, path, reason} + an actionable 'Fix:' line naming the copy-assets ship step.

**Preconditions:**
- Runs inside the daemon boot sequence (src/daemon/index.ts), before the daemon accepts requests.
- Resolves asset paths via the SAME source of truth loadRuntime uses (no second notion of where the assets live).

**Postconditions:**
- A serving daemon is proven docgen-ready: every subsequent primary or s5-fallback render finds its inlined runtime (ac1/ac4).
- No asset is mutated or fetched — read-only stat + readFile; never a network call (k5).

### `DOCGEN_ASSET_DIR`

```typescript
const DOCGEN_ASSET_DIR: string  // + resolveDocgenRuntimeManifest(): RuntimeManifest paths
```

**Returns:** `string` — The single exported source of truth for where the docgen runtime assets live (out/assets/docgen, resolved from import.meta.url) — extracted from the previously-private ASSET_DIR in shell.ts so BOTH loadRuntime and validateDocgenAssets consume it. Eliminates drift between where the renderer reads and where the validator checks.

**Preconditions:**
- Same relative resolution shell.ts already used (out/docgen/render → ../../assets/docgen).

**Postconditions:**
- loadRuntime + validateDocgenAssets can never disagree about the asset location (single constant).

### `loadRuntime`

```typescript
function loadRuntime(): Promise<{ manifest: RuntimeManifest; mermaid: string; svgPanZoom: string }>
```

**Returns:** `Promise<{ manifest: RuntimeManifest; mermaid: string; svgPanZoom: string }>` — Existing shell.ts runtime loader, RESHAPED only to read from the shared DOCGEN_ASSET_DIR source of truth (no behavior change; still memoized in runtimeCache, still read at first render). Both the primary inline path and the s5 subprocess fallback call it.

**Errors:**
- `Error (readFile ENOENT / parse)` when an asset is missing at render time — caught by assembleShell and mapped to sc4 fallbackUnavailable (UNCHANGED; the per-request last line of defense behind the new boot check).

**Preconditions:**
- Runtime assets staged under DOCGEN_ASSET_DIR by copy-assets (the existing ac2 path).

**Postconditions:**
- Returns the inlined Mermaid + svg-pan-zoom bytes + manifest for the sc3 shell; identical output for a given built tree.

### `assembleShell`

```typescript
function assembleShell(ir: DocumentIR, renderer?: SubprocessRenderer): Promise<DocGenOutcome<RenderedDocumentShell>>
```

**Parameters:**
- `ir: DocumentIR` — The IR to render (sc1) — unchanged by s7.
- `renderer: SubprocessRenderer` _(optional)_ — The s5 subprocess seam — unchanged by s7.

**Returns:** `Promise<DocGenOutcome<RenderedDocumentShell>>` — Unchanged. s7 does NOT alter assembleShell; its existing try/catch(loadRuntime) → fallbackUnavailable(naming copy-assets) is DELIBERATELY KEPT as defense-in-depth behind the new boot validator (a post-boot asset removal still degrades gracefully rather than crashing).

**Errors:**
- `DocGenOutcome fallback-unavailable` when the runtime asset is missing/unreadable at render time (existing behaviour, preserved) or an oversized diagram has no subprocess renderer (s5).

**Preconditions:**
- Assets present under DOCGEN_ASSET_DIR (guaranteed at boot by validateDocgenAssets for an installed build).

**Postconditions:**
- Produces the single self-contained offline sc3 shell (ac4); no s7 change to its shape or logic.

## Data model changes

### `validateDocgenAssets + DocgenAssetValidationError / DocgenAssetFailure` — new

A new boot validator + typed error, modelled on validateAnalyzePrompts / AnalyzePromptValidationError (src/analyze/context/boot-validator.ts). DocgenAssetFailure = {componentId, path, reason}; DocgenAssetValidationError collects all failures with a 'Fix:' line naming copy-assets.mjs. s7-internal; not a shared contract.

**Call sites:**
- `src/daemon/index.ts`
- `src/docgen/render/shell.ts`

### `DOCGEN_ASSET_DIR (shared asset-path source of truth)` — invariant-change

Extract the currently-private ASSET_DIR constant in src/docgen/render/shell.ts into an exported constant (module-level, resolved from import.meta.url exactly as today) so validateDocgenAssets and loadRuntime consume ONE definition. Behaviour of loadRuntime is unchanged — same path, same memoization; only the constant's visibility + a single caller are added.

**Call sites:**
- `src/docgen/render/shell.ts`

### `daemon boot sequence` — invariant-change

src/daemon/index.ts: add a validateDocgenAssets() call immediately after validateAnalyzePrompts() (before the daemon accepts requests), so docgen asset readiness is proven at startup alongside the analyze-prompt readiness. A DocgenAssetValidationError re-raises to the top-level fatal handler (log + clean exit), same as the prompt validator.

**Call sites:**
- `src/daemon/index.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | consumes | s7 guards the INPUTS to the sc3 shell (the inlined Mermaid + svg-pan-zoom runtime loadRuntime reads) without changing the RenderedDocumentShell type or assembleShell's logic — it makes the shell's offline/self-contained guarantee (inlinedRuntimeVersion, supportsZoomPan) hold on an installed build (ac1/ac4). No shell change. |
| `sc1` | consumes | Unchanged: documents are still built from DocumentIR; s7 touches only the render-runtime asset-loading path, never the IR shape or provenance (k8/k11). |

## Error paths

### Error cases

- **The docgen runtime.json manifest is missing or unreadable in the built/installed tree at daemon boot.** (recoverable)
  - Detection: validateDocgenAssets stat+readFile's runtime.json under DOCGEN_ASSET_DIR and catches the ENOENT / read error, recording a DocgenAssetFailure {componentId:'runtime.json', path, reason}.
  - Response: Throw DocgenAssetValidationError listing the failure with a 'Fix:' line naming the copy-assets ship step; the daemon's top-level fatal handler logs it and exits cleanly — the daemon REFUSES TO START.
  - User impact: The operator sees a startup-refusal naming the missing asset + how to fix it (rebuild via copy-assets), instead of a daemon that boots healthy then fails at first document generation (ac1).
- **runtime.json is present but a bundle it references (mermaid.min.js / svg-pan-zoom.min.js) is missing from the built tree.** (recoverable)
  - Detection: validateDocgenAssets reads the manifest, then stats each of manifest.mermaidAsset + manifest.svgPanZoomAsset under DOCGEN_ASSET_DIR; a stat ENOENT is recorded as a per-bundle DocgenAssetFailure.
  - Response: Collect every missing bundle (not just the first) and throw DocgenAssetValidationError listing all of them; daemon refuses to start.
  - User impact: The operator gets the FULL picture in one refusal (which bundles are absent) rather than fixing one, restarting, and hitting the next (ac1).
- **A referenced bundle exists but is empty (0 bytes / whitespace-only) — e.g. a truncated copy or a partial checkout.** (recoverable)
  - Detection: validateDocgenAssets readFile's each bundle and checks body.trim().length === 0 (same empty-body rule as validateAnalyzePrompts), recording an 'file is empty' DocgenAssetFailure.
  - Response: Throw DocgenAssetValidationError naming the empty bundle; daemon refuses to start.
  - User impact: A silently-corrupt asset (which would otherwise inline as an empty runtime and produce a blank diagram offline) is caught at boot rather than shipped in a broken document (ac1/ac4).
- **runtime.json exists but is malformed JSON, so the manifest can't be parsed to learn which bundles to check.** (recoverable)
  - Detection: validateDocgenAssets wraps JSON.parse(runtime.json) in try/catch and records a 'malformed manifest' DocgenAssetFailure when it throws.
  - Response: Throw DocgenAssetValidationError naming the manifest parse failure; daemon refuses to start (it cannot even determine the asset set).
  - User impact: A corrupt manifest is an actionable boot error, not a confusing downstream loadRuntime crash.
- **An asset is deleted/corrupted AFTER the daemon has already booted and passed validation.** (recoverable)
  - Detection: Not caught by the boot validator (it ran at start); at the next render loadRuntime's readFile throws and assembleShell's existing try/catch notices.
  - Response: assembleShell returns the UNCHANGED sc4 fallbackUnavailable outcome naming copy-assets — the deliberately-kept per-request last line of defense; the daemon keeps serving.
  - User impact: A post-boot asset loss degrades that request to an actionable fallback-unavailable rather than crashing the daemon (defense-in-depth behind the boot check).

### Edge cases

| Input | Expected |
| :--- | :--- |
| All three assets present + non-empty under out/assets/docgen at boot (the normal installed build). | validateDocgenAssets returns silently (logs a validated-count line like validateAnalyzePrompts); the daemon boots and serves — a serving daemon is proven docgen-ready (ac1). |
| A development checkout where the assets exist under BOTH src/assets/docgen and out/assets/docgen. | The validator resolves DOCGEN_ASSET_DIR (out/assets/docgen, the runtime path loadRuntime uses) and passes — dev + installed builds validate identically, so behaviour matches between them (ac1). |
| runtime.json references a bundle that is present + non-empty but a different vendored VERSION than mermaidVersion/svgPanZoomVersion claim. | Passes: the validator checks presence + non-empty only, not byte-content/version (version integrity is the manifest's provenance concern, out of s7 scope); the shell still inlines a working runtime (ac4). |
| A document generated on the installed build, then copied to a fresh machine that never had the system installed, opened offline. | Renders fully with zoom/pan — the runtime was inlined into the single sc3 file at generation time, so there is no runtime dependency on the assets, the daemon, or the network (ac4); unaffected by s7 (which only guards the generating side). |

### Invariants to preserve

- assembleShell's existing generation-time try/catch(loadRuntime) → sc4 fallbackUnavailable (naming copy-assets, never a CDN fetch) is kept UNCHANGED as defense-in-depth behind the new boot validator — a post-boot asset loss still degrades gracefully rather than crashing. [[c13]]
- copy-assets.mjs remains the ONE asset-shipping path (recursive src/assets → out/assets); s7 adds a boot-time VERIFICATION only and no docgen-specific copy step, so the 'same asset-shipping path' guarantee holds (ac2/k7). [[c15]]
- loadRuntime's behaviour + output are unchanged for a given built tree (same DOCGEN_ASSET_DIR path, same memoization, byte-identical inlined runtime) — s7 only extracts the path constant + adds a caller, never alters what the renderer emits. [[c13]]
- No second render/asset-HTML pipeline is introduced — s7 reuses the existing shell + loadRuntime primitives and adds only a validator + a shared path constant (k10/k6). [[c2]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via npx tsx --test (the repo's docgen + boot-validator convention). The validator is exercised against a temp asset dir (dir override) so missing/empty/malformed cases need no live daemon; the staging + offline checks read the real built out/assets/docgen tree.`

### Test levels

- **unit** — Prove validateDocgenAssets's pass + every failure branch against a controllable asset dir (mirrors boot-validator.test.ts).
  - Subjects: `all assets present + non-empty → returns silently (no throw)`, `runtime.json missing → throws DocgenAssetValidationError listing runtime.json with an ENOENT/'file not found' reason + a copy-assets 'Fix:' line`, `a manifest-referenced bundle (mermaid.min.js / svg-pan-zoom.min.js) missing → the error lists EVERY missing bundle in one throw (not just the first)`, `a referenced bundle present but empty (whitespace-only) → error reason 'file is empty'`, `runtime.json malformed JSON → error names the manifest parse failure`, `DOCGEN_ASSET_DIR is the SAME path loadRuntime reads from (one source of truth — assert the validator and loadRuntime resolve the identical dir)`
  - Fixtures: `A dir-override seam on validateDocgenAssets (or a temp dir) holding hand-written runtime.json + present/missing/empty bundle files`, `The real src/assets/docgen/runtime.json for the manifest shape`
- **integration** — Prove the actual built tree stages the docgen runtime + the validator passes against it (the ac1/ac2 installed-build guarantee).
  - Subjects: `runtime.json + its referenced mermaidAsset + svgPanZoomAsset resolve to present, NON-EMPTY files under the built out/assets/docgen (proves copy-assets staged them via the existing path)`, `validateDocgenAssets() runs clean (no throw) against the real DOCGEN_ASSET_DIR — the daemon-boot check passes on this build`, `the three assets are git-tracked (so an installer clone receives them) — asserted via the manifest referencing filenames that exist in src/assets/docgen too`
  - Fixtures: `A completed `npm run build` (out/assets/docgen populated) — the CI/dev build state the sweep already assumes`
- **unit** — Regression: the deliberately-kept generation-time degrade path still holds behind the boot check (defense-in-depth).
  - Subjects: `with the runtime cache reset + DOCGEN_ASSET_DIR pointed at a dir with no assets, assembleShell returns sc4 fallbackUnavailable naming copy-assets (UNCHANGED s1 behaviour) rather than throwing`, `loadRuntime output is byte-identical for a given built tree after the ASSET_DIR → DOCGEN_ASSET_DIR extraction (no renderer-output change)`
  - Fixtures: `_resetRuntimeCacheForTests + an asset-dir override / an IR fixture`
- **smoke** — End-to-end offline self-contained proof on the built tree (ac4), extending the existing shell.test.ts offline assertion.
  - Subjects: `a generated sc3 shell from the built tree inlines the runtime (>1MB), has NO `<script src=` / `<link href=`, and carries supportsZoomPan — so a document moved to a network-less machine renders fully with zoom/pan`, `both backends: the primary inline shell AND (s5) the fallback shell are self-contained offline`
  - Fixtures: `The built out/assets/docgen runtime (already read by shell.test.ts)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: validateDocgenAssets passes against the real built out/assets/docgen and its referenced bundles resolve to present, non-empty files (a serving daemon is proven docgen-ready)`, `unit: validateDocgenAssets throws a listed DocgenAssetValidationError on missing/empty/malformed assets (a broken installed build refuses to start rather than producing an incomplete document)` |
| `ac2` | `integration: the docgen runtime is present under out/assets/docgen after `npm run build` — staged by the existing copy-assets recursive copy, no docgen-specific copy step`, `integration: the assets are git-tracked so the installer clone + its npm run build receive them` |
| `ac3` | `unit: DOCGEN_ASSET_DIR is the single source of truth shared by loadRuntime + validateDocgenAssets (no second/parallel asset path)`, `smoke: the shell is produced by the existing assembleShell/loadRuntime primitives (no new render pipeline)` |
| `ac4` | `smoke: a built-tree sc3 shell inlines the runtime with no `<script src=`/`<link href=` and supportsZoomPan — renders fully offline with zoom/pan on a fresh machine`, `unit: regression — assembleShell still degrades to fallbackUnavailable when an asset is unreadable, so a broken runtime never ships as a half-rendered offline document` |

## Alternatives considered

### a1: Boot-time docgen asset validator (mirror validateAnalyzePrompts), with a shared asset-path source of truth — **CHOSEN**

Add validateDocgenAssets() that stat+reads runtime.json + its referenced bundles from the SAME asset dir loadRuntime uses, throwing a typed DocgenAssetValidationError; wire it at daemon boot next to validateAnalyzePrompts so a mis-staged asset in an installed build is a fail-fast startup refusal with a copy-assets remedy — the existing generation-time fallbackUnavailable stays as defense-in-depth.



### a2: Generation-time-only hardening (shared asset-path + tests, no boot check)

Keep the ONLY guard the existing assembleShell try/catch → fallbackUnavailable; add a shared exported asset-path resolver + staging/offline tests, but no daemon-boot refusal.



**Rejected because:** Only PARTIAL on ac1: it diverges from the project's fail-fast boot-validator convention and leaves the installed build's readiness unproven until real traffic hits it — the weaker trade for a story whose whole point is hardening the installed build; a1 adds the boot proof for a negligible S delta while KEEPING this fallback.

### a3: Build-time verification inside copy-assets.mjs

After the recursive copy, copy-assets.mjs asserts out/assets/docgen/{runtime.json + its referenced bundles} exist + are non-empty and FAILS THE BUILD otherwise, so a broken tree never installs.



**Rejected because:** Only PARTIAL on ac1 (build-only: no runtime/installed signal for a post-build asset loss) and couples the generic, untyped, untested copy-assets build script to docgen-specific runtime.json knowledge — a layering smell versus a1's typed, unit-tested validator. A worthwhile future COMPLEMENT to a1, not a substitute.

## Citations

- **[[c1]]** `code` `src/docgen/render/shell.ts — ASSET_DIR (→ DOCGEN_ASSET_DIR) + loadRuntime + assembleShell try/catch→fallbackUnavailable + _resetRuntimeCacheForTests: the asset-loading path both backends share that s7 hardens`
- **[[c2]]** `code` `src/analyze/context/boot-validator.ts — validateAnalyzePrompts + AnalyzePromptValidationError (stat/readFile/empty-body → typed throw with a Fix: line): the exact fail-fast pattern validateDocgenAssets mirrors`
- **[[c3]]** `code` `src/daemon/index.ts (~line 298) — validateAnalyzePrompts() wired between registration and accepting requests: the boot wiring point validateDocgenAssets() is added adjacent to`
- **[[c4]]** `code` `copy-assets.mjs — the ONE non-code asset shipping step (recursive cpSync src/assets → out/assets, no per-file allowlist); the existing path s7 verifies, not replaces (ac2/k7)`
- **[[c5]]** `code` `src/assets/docgen/runtime.json — { mermaidVersion, svgPanZoomVersion, mermaidAsset, svgPanZoomAsset }: the manifest validateDocgenAssets reads to learn which bundles to check; all three assets git-tracked`
- **[[c6]]** `code` `src/docgen/render/__tests__/shell.test.ts + fallback.test.ts — the offline-guarantee assertions (no <script src=/<link href=, runtime inlined >1MB, supportsZoomPan) s7's smoke test extends (ac4)`
- **[[c13]]** `convention` `HLD k5/k6 (c13): each generated document is a single self-contained offline file with its runtime inlined — the guarantee s7 makes hold on an installed build; assembleShell's fallbackUnavailable degrade path preserved`
- **[[c15]]** `convention` `HLD k7 (c15): non-TypeScript runtime resources ship through copy-assets.mjs from src/assets — s7 verifies this path, adds no docgen-specific copy step (ac2)`
- **[[c8]]** `step-output` `s8 checklist.verify — all 18 items passed (cd1-3, dm1-2, int1-2, ep1-3, ts1-2, mg1-2, alt1-2, sbdry1-4)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-07-31T20:10:31.247Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | manual | src/docgen/render/shell.ts has a private module-level ASSET_DIR (join(dirname(fileURLToPath(import.meta.url)),'..','..','assets','docgen')) + loadRuntime reading runtime.json + the two bundles + _resetRuntimeCacheForTests — the asset path s7 extracts to DOCGEN_ASSET_DIR. | shell.ts:36 `const ASSET_DIR = join(...,'assets','docgen')`, :48 loadRuntime, :60 _resetRuntimeCacheForTests — the private asset path + loader s7 extracts to DOCGEN_ASSET_DIR. Confirmed. | none |
| c1 | semantic | LOW | manual | assembleShell in shell.ts already wraps loadRuntime in try/catch and returns fallbackUnavailable naming copy-assets on a read failure — the degrade path s7 preserves unchanged as defense-in-depth. | shell.ts:247 `runtime = await loadRuntime();` inside the try that maps failure to fallbackUnavailable(naming copy-assets). The degrade path s7 preserves exists. Confirmed. | none |
| c2 | citation | LOW | manual | src/analyze/context/boot-validator.ts exports validateAnalyzePrompts() + AnalyzePromptValidationError, using stat/readFile + a body.trim().length===0 empty-body check and a 'Fix:' message — the exact pattern validateDocgenAssets mirrors. | boot-validator.ts:141 validateAnalyzePrompts, :74 AnalyzePromptValidationError, :173 `body.trim().length === 0`, :83 'Fix:' line — the exact fail-fast pattern validateDocgenAssets mirrors. Confirmed. | none |
| c3 | citation | LOW | manual | src/daemon/index.ts calls validateAnalyzePrompts() during boot (after registration, before accepting requests) — the wiring point validateDocgenAssets() is added adjacent to. | daemon/index.ts:298 `validateAnalyzePrompts();` at boot — the wiring point validateDocgenAssets() is added adjacent to. Confirmed. | none |
| c4 | semantic | LOW | manual | copy-assets.mjs recursively cpSync's the whole src/assets tree (DIRS includes 'assets') into out/assets with no per-file allowlist, so src/assets/docgen ships automatically — s7 adds no docgen-specific copy step. | copy-assets.mjs:28 DIRS=['prompts','assets'], :39 `cpSync(src, dst, {recursive:true})` — whole-tree recursive copy, no per-file allowlist; src/assets/docgen ships automatically. Confirmed. | none |
| c5 | citation | LOW | manual | src/assets/docgen/runtime.json is the manifest declaring mermaidAsset='mermaid.min.js' + svgPanZoomAsset='svg-pan-zoom.min.js' (+ versions) — the file validateDocgenAssets reads to learn which bundles to check. | runtime.json:4 mermaidAsset='mermaid.min.js', :5 svgPanZoomAsset='svg-pan-zoom.min.js', :2 mermaidVersion — the manifest validateDocgenAssets reads. Confirmed. | none |
| c5 | semantic | LOW | manual | The three docgen runtime assets (mermaid.min.js, svg-pan-zoom.min.js, runtime.json) are git-tracked under src/assets/docgen, so an installer clone receives them. | runtime.json + the two bundles are present under src/assets/docgen and git-tracked (git ls-files confirmed at scope). An installer clone receives them. Confirmed. | none |
| c6 | citation | LOW | manual | src/docgen/render/__tests__/shell.test.ts asserts the offline guarantee (no <script src=/<link href=, runtime inlined >1MB) that s7's smoke test extends. | shell.test.ts:64 is the 'offline self-contained shell — runtime INLINED' test asserting no external fetch + inlined runtime; s7's smoke test extends it. (My grep regex-escaping missed but the read anchor confirms.) Confirmed. | none |
| cl9 | semantic | LOW | manual | The sc4 DocGenOutcome fallback-unavailable variant + its fallbackUnavailable(reason,remedy) constructor already exist, so s7 introduces no new outcome variant. | outcome.ts:49 `fallbackUnavailable = <T>(reason, remedy) => ({status:'fallback-unavailable',...})` — the sc4 variant already exists; s7 adds no new outcome. Confirmed. | none |
| cl10 | semantic | LOW | manual | s7 owns no shared contract and changes neither sc1 (DocumentIR) nor sc3 (RenderedDocumentShell) — it only guards the runtime-asset inputs loadRuntime reads for the shell. | types.ts:76 DocumentIR, :119 RenderedDocumentShell — unchanged by s7; it only guards the runtime-asset inputs, owns no contract. Confirmed. | none |
