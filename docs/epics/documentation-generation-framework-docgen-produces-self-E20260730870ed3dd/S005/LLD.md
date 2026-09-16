<!-- insrc:artifact LLD-870ed3dd246225f4-s5 -->

# LLD: E20260731870ed3dd:S005

**Epic:** `documentation-generation-framework-docgen-produces-self`
**HLD base run:** `wf-1785421889464-2ayzlc`
**HLD effective hash:** `cb5b27744db2...`

## HLD context

**Framework:** IR is the hard boundary between graph-derived and LLM-narrated content; cross-cutting failure/empty/truncation reporting is one shared outcome envelope; registry-enumeration gives automatic tool/IPC/MCP parity; both the primary inline renderer and the D2/Graphviz subprocess fallback assemble into the identical single-file shell extending loadMermaidCdnMeta / RenderedArtifactHtml.
**Rollout phase:** Phase C — Narrative annotation & oversized-scope fallback
**Consumes:** `sc1` (DocumentIR), `sc3` (RenderedDocumentShell), `sc4` (DocGenOutcome)

## Contract details

**Surface level:** internal

### `oversized`

```typescript
function oversized(ir: DocumentIR, limit?: number): boolean
```

**Parameters:**
- `ir: DocumentIR` — The document to size; only ir.derived nodes/edges are counted.
- `limit: number` _(optional)_ — The fixed legibility bound; defaults to OVERSIZED_LIMIT (an empirically-calibrated node+edge count, e.g. 60). Injectable for tests.

**Returns:** `boolean` — true when ir.derived.nodes.length + ir.derived.edges.length > limit — i.e. the diagram is too large for the primary Mermaid path to lay out legibly (ac1). Pure + deterministic.

**Preconditions:**
- Reads only ir.derived counts; no I/O.

**Postconditions:**
- A small doc (<= limit) returns false so it keeps the primary path (ac4).

### `toGraphvizDot`

```typescript
function toGraphvizDot(ir: DocumentIR): string
```

**Parameters:**
- `ir: DocumentIR` — The derived diagram to render via the subprocess.

**Returns:** `string` — A Graphviz DOT digraph over the derived nodes/edges: one node per IrNode (label = its label), one edge per IrEdge (from->to). Identifiers are the short aliases (n0,n1,…) so entity ids never clash with DOT syntax; labels are DOT-escaped. Pure + deterministic (k8/k11 — only graph-derived content).

**Preconditions:**
- Pure: no I/O.

**Postconditions:**
- Every node/edge is graph-derived; no narrated/invented content.

### `SubprocessRenderer`

```typescript
interface SubprocessRenderer { renderSvg(dot: string): Promise<SubprocessRenderResult> }
```

**Parameters:**
- `renderSvg: (dot: string) => Promise<SubprocessRenderResult>` — Feed DOT to an external renderer and return its SVG, or signal that no renderer binary is available. The injected seam — a fake in tests, the real spawn in production.

**Returns:** `SubprocessRenderer` — The daemon-side subprocess seam; keeps assembleShell's fallback dispatch testable without a real binary (k2 — runs inside the daemon).

**Preconditions:**
- Bound to graphvizSubprocessRenderer in production or a fake in tests.

**Postconditions:**
- Never throws for the modeled cases — a missing binary is returned as {status:'unavailable'}, not an exception.

### `graphvizSubprocessRenderer`

```typescript
const graphvizSubprocessRenderer: SubprocessRenderer
```

**Returns:** `SubprocessRenderer` — The production seam: PROBES 'dot -Tsvg' then 'd2 - -' via child_process.spawn (shell:false, fixed args, DOT on stdin, SVG captured on stdout, bounded by a timeout with SIGKILL). Returns {status:'ok', svg, tool} on the first success, or {status:'unavailable', triedBinaries:['dot','d2']} when BOTH exit with ENOENT (k9/ac3). No shell interpolation.

**Preconditions:**
- Spawns with shell:false + fixed literal args; the DOT source crosses only via stdin.

**Postconditions:**
- A non-ENOENT subprocess failure (nonzero exit / timeout) is surfaced as unavailable with the captured stderr in the reason; ENOENT for all candidates -> unavailable.

### `assembleFallbackShell`

```typescript
function assembleFallbackShell(ir: DocumentIR, svg: string, svgPanZoom: string, svgPanZoomVersion: string): RenderedDocumentShell
```

**Parameters:**
- `ir: DocumentIR` — For docType + scopeDescription (title).
- `svg: string` — The subprocess-produced SVG markup (already vector).
- `svgPanZoom: string` — The vendored svg-pan-zoom bundle (from loadRuntime).
- `svgPanZoomVersion: string` — The runtime manifest's svgPanZoom version -> inlinedRuntimeVersion.

**Returns:** `RenderedDocumentShell` — The sc3 fallback shell: the pre-rendered <svg> inlined DIRECTLY + the svg-pan-zoom bundle + an init calling window.svgPanZoom on it (NO mermaid). backend='fallback-subprocess', diagramFormat='svg', supportsZoomPan=true, inlinedRuntimeVersion=svgPanZoomVersion — a single self-contained offline file indistinguishable from primary (ac2).

**Preconditions:**
- Pure: no I/O; svg is trusted subprocess output inlined as markup (not escaped).

**Postconditions:**
- No external URL; identical sc3 shape as the primary path (ac2).

### `assembleShell`

```typescript
function assembleShell(ir: DocumentIR, renderer?: SubprocessRenderer): Promise<DocGenOutcome<RenderedDocumentShell>>
```

**Parameters:**
- `ir: DocumentIR` — The IR to render.
- `renderer: SubprocessRenderer` _(optional)_ — The subprocess seam; defaults to graphvizSubprocessRenderer. Injectable for tests.

**Returns:** `Promise<DocGenOutcome<RenderedDocumentShell>>` — Existing assembler EXTENDED with an oversized dispatch: if !oversized(ir) -> the PRIMARY inline path unchanged (backend 'primary-inline', ac4; byte-identical to today). If oversized(ir) -> load svg-pan-zoom, toGraphvizDot(ir), renderer.renderSvg(dot); on {status:'ok'} return ok(assembleFallbackShell(...)) (backend 'fallback-subprocess', ac1/ac2); on {status:'unavailable'} return sc4 fallbackUnavailable naming the tried binaries + install remedy (ac3).

**Errors:**
- `DocGenOutcome 'fallback-unavailable'` when the doc is oversized AND no subprocess renderer binary is available (renderer returns unavailable) — ac3.
- `DocGenOutcome 'fallback-unavailable'` when the offline runtime asset is missing (existing loadRuntime failure, unchanged).

**Preconditions:**
- Vendored svg-pan-zoom present for the fallback path; renderer bound (default or fake).

**Postconditions:**
- Small docs are byte-identical to the pre-s5 primary path (ac4); oversized docs render via the subprocess into the same sc3 offline shell (ac1/ac2) or report fallback-unavailable (ac3). Never emits an illegible/truncated primary doc for an oversized scope.

## Data model changes

### `SubprocessRenderResult (s5-internal renderer outcome)` — new

The subprocess seam's result: { status: 'ok'; svg: string; tool: 'dot' | 'd2' } | { status: 'unavailable'; reason: string; triedBinaries: string[] }. Private to s5; assembleShell maps 'unavailable' to sc4 fallbackUnavailable. Not a shared type.

**Call sites:**
- `src/docgen/render/fallback.ts (new — oversized, toGraphvizDot, SubprocessRenderer, graphvizSubprocessRenderer, assembleFallbackShell)`
- `src/docgen/render/shell.ts (assembleShell dispatch)`

### `assembleShell (primary-vs-fallback dispatch)` — invariant-change

assembleShell in src/docgen/render/shell.ts gains an oversized(ir) branch: small docs take the existing primary inline path (byte-identical, ac4), oversized docs take the subprocess fallback (ac1) or report fallback-unavailable (ac3). No change to the RenderedDocumentShell TYPE; the fallback lands in the same sc3 shape with backend='fallback-subprocess' (an already-declared RenderBackend value).

**Call sites:**
- `src/docgen/render/shell.ts`
- `src/docgen/index.ts (generateDocument -> assembleShell)`

### `OVERSIZED_LIMIT (fixed legibility threshold)` — new

A single fixed constant (empirically-calibrated node+edge count, e.g. 60) above which the primary Mermaid path is deemed unable to lay out legibly and the subprocess fallback is used. One global limit per the HLD boundary ('combined node+edge count against one fixed limit'); overridable via oversized()'s limit param for tests/tuning.

**Call sites:**
- `src/docgen/render/fallback.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Reads ir.derived nodes/edges for the oversized predicate and the DOT emission — graph-derived content only (k8/k11); no IR type change. narrated content is untouched by the fallback path. |
| `sc3` | consumes | The fallback renderer produces a RenderedDocumentShell in the EXACT existing shape with backend='fallback-subprocess' (an already-declared RenderBackend value), diagramFormat='svg', supportsZoomPan=true, inlinedRuntimeVersion=svgPanZoom version — indistinguishable from the primary shell (ac2). No sc3 change. |
| `sc4` | consumes | When an oversized doc has no available subprocess renderer, assembleShell returns the existing fallbackUnavailable {reason,remedy} variant naming the tried binaries + install remedy (ac3). No sc4 change. |

## Error paths

### Error cases

- **An oversized doc is requested but neither fallback binary (dot, d2) is installed.** (recoverable)
  - Detection: graphvizSubprocessRenderer's spawn emits an 'error' event with code ENOENT for each candidate; after all candidates fail it returns {status:'unavailable', triedBinaries}; assembleShell checks `result.status === 'unavailable'`.
  - Response: Return sc4 fallbackUnavailable naming the tried binaries + an install remedy (e.g. 'install graphviz or d2'); no document is emitted.
  - User impact: The reader is told plainly the fallback is unavailable and how to enable it (ac3/k9) rather than getting an illegible/truncated primary diagram.
- **The subprocess renderer runs but exits nonzero or produces no SVG (bad DOT, renderer bug).** (recoverable)
  - Detection: The child closes with a nonzero exit code, or stdout does not contain an '<svg' root; graphvizSubprocessRenderer treats this as a non-ok result.
  - Response: Return {status:'unavailable', reason: captured stderr} -> assembleShell maps it to sc4 fallbackUnavailable with the stderr in the reason.
  - User impact: A renderer failure is reported explicitly, never a broken/empty diagram passed off as a document (k11).
- **The subprocess hangs on a pathological graph.** (recoverable)
  - Detection: The renderer's setTimeout fires before 'close'; the child is killed with SIGKILL and the attempt is marked failed.
  - Response: The killed attempt yields a non-ok result -> fallbackUnavailable (timeout reason); the daemon is never blocked.
  - User impact: A stuck renderer degrades to an actionable message rather than a hung request (bounded pipeline, k9 non-functional).
- **The offline runtime asset (svg-pan-zoom) is missing at fallback-assembly time.** (recoverable)
  - Detection: loadRuntime throws on readFile (existing behaviour); assembleShell's catch maps it.
  - Response: Return sc4 fallbackUnavailable naming the copy-assets ship step (existing behaviour, unchanged); never a CDN fetch (k5).
  - User impact: Actionable build-config error; the fallback doc never reaches the network at view time (ac2).

### Edge cases

| Input | Expected |
| :--- | :--- |
| A scope exactly AT the threshold (node+edge count == OVERSIZED_LIMIT). | oversized returns false at the boundary (strict > limit), so the doc still uses the primary path; the fallback triggers only ABOVE the limit — a single deterministic cutoff (ac4). |
| A whole-repo component-dependency scope well above the threshold, with dot available. | assembleShell routes to the subprocess, dot renders the digraph to SVG, and the fallback shell inlines it + svg-pan-zoom — a readable, zoomable, offline single-file doc (ac1/ac2). |
| dot is absent but d2 is present. | The probe skips dot (ENOENT) and succeeds with d2; the doc renders via the second candidate (probe-order coverage, ac1). |
| A small type-structure or call-sequence doc (bounded by construction). | oversized=false -> primary Mermaid inline path, byte-identical to the pre-s5 output (ac4); the subprocess is never spawned. |
| A node label containing DOT-hostile characters (quotes, backslashes, newlines). | toGraphvizDot escapes the label so the emitted DOT is well-formed and the subprocess parses it; identifiers use n0/n1 aliases so entity ids never break DOT syntax. |
| An oversized doc rendered successfully via the subprocess, opened offline. | The single file contains the inlined <svg> + svg-pan-zoom + init, no <script src=, backend='fallback-subprocess' — indistinguishable from a primary doc in offline/zoom/pan respects (ac2). |

### Invariants to preserve

- The primary self-contained inline path stays the DEFAULT and is byte-identical for non-oversized docs; the subprocess is reserved for oversized scopes only — no doc that fit the primary path before now spawns a subprocess (ac4/k9). [[c6]]
- Both render paths produce the SAME sc3 self-contained offline shell (inlined runtime, SVG, zoom/pan, no view-time network) — the fallback is indistinguishable from primary in these respects (k5/k6). [[c13]]
- Diagram content stays graph-derived: the DOT source is emitted from ir.derived nodes/edges only, and the subprocess merely lays it out — no narrated or invented content enters the fallback diagram (k8/k11). [[c9]]
- The subprocess is spawned with shell:false + fixed literal args and the DOT crosses only via stdin — no shell interpolation of graph-derived strings (safe invocation). [[c10]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via npx tsx --test (the repo's existing docgen convention). The subprocess path uses an injected FAKE SubprocessRenderer; the real dot/d2 case is gated on binary-availability and skips cleanly when absent.`

### Test levels

- **unit** — Prove the pure threshold + DOT emitter + fallback-shell assembly with hand-built IR fixtures — no subprocess.
  - Subjects: `oversized(ir): false at count <= limit (boundary uses primary), true above it (ac4/ac1); the default OVERSIZED_LIMIT is applied when no limit passed`, `toGraphvizDot(ir): a valid digraph over derived nodes/edges (n<i> aliases, one edge per IrEdge); DOT-hostile label chars are escaped`, `assembleFallbackShell(ir, svg, ...): sc3 shape backend='fallback-subprocess', diagramFormat='svg', supportsZoomPan=true, inlinedRuntimeVersion=svgPanZoom version; the <svg> + svg-pan-zoom inlined, no <script src= (ac2)`
  - Fixtures: `Hand-built DocumentIR fixtures: below-threshold, above-threshold, and one with DOT-hostile labels`, `A canned <svg> string`
- **unit** — Prove assembleShell's primary-vs-fallback dispatch + outcome routing against an injected FAKE SubprocessRenderer — no real binary.
  - Subjects: `assembleShell(small IR) -> primary path, backend='primary-inline', byte-identical to the pre-s5 output (ac4)`, `assembleShell(oversized IR, fake renderer returning ok svg) -> backend='fallback-subprocess', inlined SVG + svg-pan-zoom (ac1/ac2)`, `assembleShell(oversized IR, fake renderer returning unavailable) -> DocGenOutcome 'fallback-unavailable' naming the tried binaries + remedy (ac3)`
  - Fixtures: `A fake SubprocessRenderer with toggleable ok(svg) / unavailable(triedBinaries) results`, `An above-threshold IR + a below-threshold IR`
- **live** — Prove the real subprocess renderer end-to-end, gated on binary availability (skipped when dot/d2 absent).
  - Subjects: `graphvizSubprocessRenderer.renderSvg(dot) with a real 'dot'/'d2' on PATH -> {status:'ok', svg} containing an <svg root`, `generateDocument for an oversized component-dependency scope -> ok fallback shell, self-contained offline HTML`
  - Fixtures: `A machine with graphviz 'dot' or 'd2' installed (skip when neither is on PATH)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `oversized(ir) true above the limit routes to the fallback`, `assembleShell(oversized IR, fake ok renderer) -> backend='fallback-subprocess' with inlined SVG`, `live: real dot/d2 renders an oversized component-dependency scope to an ok fallback doc` |
| `ac2` | `assembleFallbackShell -> sc3 shape (diagramFormat 'svg', supportsZoomPan true), inlined <svg> + svg-pan-zoom, no <script src=`, `assembleShell(oversized) fallback html is a single self-contained offline file` |
| `ac3` | `assembleShell(oversized IR, fake unavailable renderer) -> 'fallback-unavailable' naming tried binaries + remedy`, `graphvizSubprocessRenderer maps ENOENT (all candidates) to {status:'unavailable'}` |
| `ac4` | `oversized(ir) false at/below the limit`, `assembleShell(small IR) -> primary-inline path byte-identical to pre-s5; the subprocess renderer is never invoked` |

## Alternatives considered

### a1: Fixed node+edge threshold + probe-order subprocess renderer (Graphviz dot → D2) via an injected seam — **CHOSEN**

assembleShell gains a single fixed size predicate; when exceeded it renders through an injected subprocess seam that probes Graphviz 'dot' then 'd2', emitting IR->DOT, inlining the SVG + svg-pan-zoom into the sc3 shell; neither binary -> fallbackUnavailable.



### a2: Fixed threshold + Graphviz 'dot' ONLY (single renderer, no D2 probe)

Same fixed predicate + IR->DOT + sc3 fallback shell, but the subprocess seam spawns only Graphviz 'dot'; a missing dot -> fallbackUnavailable (no D2 attempt).



**Rejected because:** ac1 only PARTIAL: a dot-only path denies the fallback on machines that have D2 but not Graphviz. Since the whole point of s5 is producing a readable doc when the primary path can't (k9), a1's probe-order (dot then d2) gives wider renderer coverage for a small extra branch.

### a3: Always render via the subprocess (no threshold; subprocess is the sole path)

Drop the primary-vs-fallback split: every document is rendered by the D2/Graphviz subprocess into SVG, removing the Mermaid inline path.



**Rejected because:** Violates ac4 + k9 (subprocess mandatory for every doc, primary must stay the default reserved-for-oversized) and weakens ac3 (a binary-less machine renders NOTHING for any doc), while discarding the shipped, tested Mermaid primary path (k10) for no acceptance gain.

## Citations

- **[[c1]]** `code` `src/docgen/render/shell.ts assembleShell/buildHtml/loadRuntime + _resetRuntimeCacheForTests — the primary path s5 branches from + the svg-pan-zoom bundle it reuses`
- **[[c2]]** `code` `src/docgen/types.ts:110 RenderBackend 'primary-inline'|'fallback-subprocess' + RenderedDocumentShell; src/docgen/outcome.ts:49 fallbackUnavailable(reason,remedy) — the sc3/sc4 surface s5 fills in, no contract change`
- **[[c3]]** `code` `src/daemon/tools/builtins/shell/exec-detached.ts:115 + src/agent/providers/cli-provider.ts:458 — the child_process spawn(shell:false)+timeout+SIGKILL+error(ENOENT) pattern the fallback renderer mirrors`
- **[[c4]]** `code` `src/assets/docgen/runtime.json + copy-assets.mjs staging — the vendored svg-pan-zoom the fallback inlines for offline zoom/pan (ac2)`
- **[[c5]]** `code` `src/docgen/extract/component-dependency.ts — the s2 topology IR (whole-repo) that oversizes and triggers the fallback (dependsOn s2)`
- **[[c6]]** `convention` `HLD assumption c6 (k9): external renderers permitted ONLY as spawned-subprocess fallbacks for oversized graphs; the inline-vector path stays the core/default`
- **[[c9]]** `convention` `HLD assumption c9 (k8): structural diagram content derived deterministically from the graph — the DOT is emitted from ir.derived only`
- **[[c10]]** `convention` `HLD assumption c10 (k2/k11): daemon-owned reads; safe spawn (shell:false, DOT via stdin) + graph-backed content only`
- **[[c13]]** `convention` `HLD assumption c13 (k5/k6): single self-contained offline file with inlined runtime + SVG + zoom/pan — the fallback matches the primary shell shape`
- **[[c8]]** `step-output` `s8 checklist.verify — all 18 items passed (cd1-3, dm1-2, int1-2, ep1-3, ts1-2, mg1-2, alt1-2, sbdry1-4)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 11 LOW** · model `client` · reviewed 2026-07-31T10:00:38.045Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | manual | src/docgen/render/shell.ts exports assembleShell, buildHtml, loadRuntime, and _resetRuntimeCacheForTests — the primary render path s5 branches from, and it reads/inlines the svg-pan-zoom bundle. | shell.ts:225 assembleShell, :172 buildHtml, :41 loadRuntime, :53 _resetRuntimeCacheForTests all present; svgPanZoom inlined by loadRuntime. Confirmed. | none |
| c2 | citation | LOW | manual | src/docgen/types.ts declares a RenderBackend union that includes both 'primary-inline' and 'fallback-subprocess', plus a RenderedDocumentShell type, so the s5 fallback backend value already exists (no contract change). | src/docgen/types.ts:110 = `export type RenderBackend = 'primary-inline' \| 'fallback-subprocess';` — the fallback backend value already exists (no contract change). RenderedDocumentShell also present. Confirmed. | none |
| c2 | citation | LOW | manual | src/docgen/outcome.ts exports a fallbackUnavailable(reason, remedy) constructor that assembleShell returns for the oversized-but-no-renderer case. | src/docgen/outcome.ts:49 = `export const fallbackUnavailable = <T>(reason: string, remedy: string): DocGenOutcome<T> =>`. Signature matches the LLD's use. Confirmed. | none |
| c3 | citation | LOW | manual | The child_process spawn(shell:false) + timeout + SIGKILL + ENOENT-on-error pattern the fallback renderer mirrors exists in src/daemon/tools/builtins/shell/exec-detached.ts and src/agent/providers/cli-provider.ts. | exec-detached.ts:115 spawns with shell:false; cli-provider.ts:458 spawns child; SIGKILL-on-timeout + ENOENT patterns exist in the codebase (live tests). The mirrored pattern is real. Confirmed. | none |
| c4 | citation | LOW | manual | The vendored svg-pan-zoom runtime the fallback inlines is staged via src/assets/docgen/runtime.json + copy-assets.mjs. | runtime.json:5 svgPanZoomAsset='svg-pan-zoom.min.js'; shell.ts:46 reads manifest.svgPanZoomAsset. The vendored bundle staging is real. Confirmed. | none |
| c5 | citation | LOW | manual | src/docgen/extract/component-dependency.ts is the s2 topology extractor whose whole-repo IR oversizes and triggers the fallback (s5 dependsOn s2). | src/docgen/extract/component-dependency.ts exists (s2 extractor). The dependsOn-s2 base is real. Confirmed. | none |
| cl7 | semantic | LOW | manual | assembleShell today unconditionally takes the primary-inline path and returns backend 'primary-inline'; s5 wraps it in an oversized(ir) branch while keeping the non-oversized path byte-identical. | shell.ts:237 returns ok<RenderedDocumentShell>({...backend:'primary-inline'...}) unconditionally today; s5's oversized branch wraps it. Byte-identical-preservation claim is consistent with the current single-path assembler. Confirmed. | none |
| cl8 | semantic | LOW | manual | assembleShell currently takes a single DocumentIR argument (no renderer parameter); s5 adds an optional renderer seam parameter. | shell.ts:225 signature is `assembleShell(ir: DocumentIR)` — single arg today; s5 adds the optional renderer seam. Confirmed. | none |
| cl9 | semantic | LOW | manual | loadRuntime returns { manifest, mermaid, svgPanZoom } where manifest carries svgPanZoomVersion, so the fallback shell can source svg-pan-zoom bytes + version without a new asset path. | shell.ts:31 RuntimeManifest carries svgPanZoomVersion; runtime.json:3 svgPanZoomVersion='3.6.2'. loadRuntime returns {manifest,mermaid,svgPanZoom}. The fallback can source bytes+version without a new asset path. Confirmed. | none |
| cl10 | ordering | LOW | manual | generateDocument in src/docgen/index.ts calls assembleShell(ir.value) as the final step, so the s5 dispatch change is transparent to the single generation entry point. | src/docgen/index.ts:72 = `return assembleShell(ir.value);` — the single generation entry point; the dispatch change is transparent to it. Confirmed. | none |
| cl11 | semantic | LOW | manual | toGraphvizDot must use short n0/n1 aliases for node identifiers (mirroring documentIRToMermaid's existing aliasing) so graph-derived entity ids never clash with DOT syntax. | shell.ts:140 = `ir.derived.nodes.forEach((n, i) => alias.set(n.id, `n${i}`));` — the n0/n1 aliasing pattern toGraphvizDot mirrors exists. Confirmed. | none |
